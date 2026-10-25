import React, { useState, useEffect } from 'react';
import { Shield, Search, Plus, User, Upload, ExternalLink, Check, LogOut, Lock, Copy, Edit } from 'lucide-react';
import { supabase } from './supabaseClient';

export default function SentinelaApp() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);

  const [view, setView] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndividuo, setSelectedIndividuo] = useState(null);
  const [individuos, setIndividuos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  
  const [formData, setFormData] = useState({ nome: '', vulgo: '', cpf: '', rg: '', endereco: '', artigos: '', modus_operandi: '' });
  const [formFotos, setFormFotos] = useState([]);
  const [novaNota, setNovaNota] = useState('');
  const [bnmpCopied, setBnmpCopied] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    supabase.auth.onAuthStateChange((_event, session) => setSession(session));
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert('Erro ao entrar: ' + error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) alert('Erro ao cadastrar: ' + error.message);
      else {
        alert('Cadastro realizado com sucesso! Pode entrar.');
        setIsLogin(true);
      }
    }
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setView('dashboard');
  };

  const carregarDados = async () => {
    if (!session) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('individuos')
      .select('*, fotos_individuos(url_storage), observacoes_individuos(observacao, autor_nome, criado_em)')
      .order('criado_em', { ascending: false });
    if (!error && data) setIndividuos(data);
    setLoading(false);
  };

  useEffect(() => {
    if (session) carregarDados();
  }, [session]);

  const processImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const scaleSize = 800 / img.width;
          canvas.width = 800;
          canvas.height = img.height * scaleSize;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.7)); 
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (formFotos.length + files.length > 5) return alert('Máximo de 5 novas fotos por vez.');
    const processedFotos = await Promise.all(files.map(file => processImage(file)));
    setFormFotos(prev => [...prev, ...processedFotos]);
  };

  // Funções de formatação automática
  const formatCPF = (value) => {
    return value.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})/, '$1-$2').replace(/(-\d{2})\d+?$/, '$1');
  };

  const formatRG = (value) => {
    let v = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (v.length <= 9) {
      v = v.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})([a-zA-Z0-9])$/, '$1-$2');
    }
    return v;
  };

  const formatEndereco = (value) => {
    const preposicoes = ['de', 'da', 'do', 'das', 'dos', 'com', 'em', 'na', 'no', 'nas', 'nos'];
    return value.toLowerCase().split(' ').map((palavra, index) => {
      if (preposicoes.includes(palavra) && index !== 0) return palavra;
      return palavra.charAt(0).toUpperCase() + palavra.slice(1);
    }).join(' ');
  };

  const handleSave = async () => {
    if (!formData.nome) return;
    setLoading(true);
    
    const arrayArtigos = typeof formData.artigos === 'string' ? formData.artigos.split(',').map(a => a.trim()).filter(Boolean) : formData.artigos;
    const nomeUsuario = session.user.email.split('@')[0];
    let indId;

    if (selectedIndividuo && view === 'edit') {
      // MODO EDIÇÃO
      const { error: indError } = await supabase
        .from('individuos')
        .update({
          nome: formData.nome,
          vulgo: formData.vulgo,
          cpf: formData.cpf,
          rg: formData.rg,
          endereco: formData.endereco,
          artigos_criminais: arrayArtigos,
          modus_operandi: formData.modus_operandi
        })
        .eq('id', selectedIndividuo.id);

      if (indError) { alert('Erro ao atualizar'); setLoading(false); return; }
      indId = selectedIndividuo.id;
    } else {
      // MODO CRIAÇÃO
      const { data: indData, error: indError } = await supabase
        .from('individuos')
        .insert([{
          nome: formData.nome,
          vulgo: formData.vulgo,
          cpf: formData.cpf,
          rg: formData.rg,
          endereco: formData.endereco,
          artigos_criminais: arrayArtigos,
          modus_operandi: formData.modus_operandi,
          criado_por: nomeUsuario,
          user_id: session.user.id
        }])
        .select()
        .single();

      if (indError) { alert('Erro ao salvar'); setLoading(false); return; }
      indId = indData.id;
    }

    // Salva novas fotos adicionadas
    for (const fotoBase64 of formFotos) {
      const blob = await fetch(fotoBase64).then(res => res.blob());
      const fileName = `${indId}/${Date.now()}.jpg`;
      
      const { data: uploadData } = await supabase.storage.from('fotos-individuos').upload(fileName, blob, { contentType: 'image/jpeg' });

      if (uploadData) {
        const { data: { publicUrl } } = supabase.storage.from('fotos-individuos').getPublicUrl(fileName);
        await supabase.from('fotos_individuos').insert([{
          individuo_id: indId,
          url_storage: publicUrl,
          enviado_por: nomeUsuario,
          user_id: session.user.id
        }]);
      }
    }

    await carregarDados();
    
    if (view === 'edit') {
      const { data } = await supabase.from('individuos').select('*, fotos_individuos(url_storage), observacoes_individuos(observacao, autor_nome, criado_em)').eq('id', indId).single();
      if (data) setSelectedIndividuo(data);
      setView('detail');
    } else {
      setView('dashboard');
    }
    
    setFormData({ nome: '', vulgo: '', cpf: '', rg: '', endereco: '', artigos: '', modus_operandi: '' });
    setFormFotos([]);
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (confirmDeleteId === id) {
      await supabase.from('individuos').delete().eq('id', id);
      setConfirmDeleteId(null);
      setView('dashboard');
      carregarDados();
    } else {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  const handleAddNote = async () => {
    if (!novaNota.trim()) return;
    const nomeUsuario = session.user.email.split('@')[0];
    
    await supabase.from('observacoes_individuos').insert([{
      individuo_id: selectedIndividuo.id,
      autor_nome: nomeUsuario,
      observacao: novaNota,
      user_id: session.user.id
    }]);

    setNovaNota('');
    carregarDados();
    
    const { data } = await supabase.from('individuos').select('*, fotos_individuos(url_storage), observacoes_individuos(observacao, autor_nome, criado_em)').eq('id', selectedIndividuo.id).single();
    if(data) setSelectedIndividuo(data);
  };

  const copiarCPF = (cpf) => {
    if (!cpf) return;
    navigator.clipboard.writeText(cpf);
    setBnmpCopied(true);
    setTimeout(() => setBnmpCopied(false), 2000);
  };

  const handleBNMP = (cpf) => {
    copiarCPF(cpf || selectedIndividuo.nome);
    window.open('https://portalbnmp.cnj.jus.br/', '_blank');
  };

  const abrirFormularioNovo = () => {
    setSelectedIndividuo(null);
    setFormData({ nome: '', vulgo: '', cpf: '', rg: '', endereco: '', artigos: '', modus_operandi: '' });
    setFormFotos([]);
    setView('form');
  };

  const abrirFormularioEdicao = () => {
    setFormData({
      nome: selectedIndividuo.nome || '',
      vulgo: selectedIndividuo.vulgo || '',
      cpf: selectedIndividuo.cpf || '',
      rg: selectedIndividuo.rg || '',
      endereco: selectedIndividuo.endereco || '',
      artigos: selectedIndividuo.artigos_criminais ? selectedIndividuo.artigos_criminais.join(', ') : '',
      modus_operandi: selectedIndividuo.modus_operandi || ''
    });
    setFormFotos([]);
    setView('edit');
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <form onSubmit={handleAuth} className="bg-slate-900 border border-slate-800 p-8 rounded-xl w-full max-w-md space-y-6">
          <div className="flex flex-col items-center gap-3 mb-8">
            <div className="bg-cyan-500/10 p-4 rounded-full border border-cyan-500/30">
              <Shield className="text-cyan-400 w-10 h-10" />
            </div>
            <h1 className="text-2xl font-bold text-slate-100">SENTINELA</h1>
            <p className="text-sm text-cyan-500">{isLogin ? 'Acesso Restrito' : 'Cadastro de Novo Policial'}</p>
          </div>
          <input type="email" placeholder="E-mail funcional" required className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded p-3 outline-none focus:border-cyan-500" value={email} onChange={e => setEmail(e.target.value)} />
          <input type="password" placeholder="Senha (mínimo 6 caracteres)" required className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded p-3 outline-none focus:border-cyan-500" value={password} onChange={e => setPassword(e.target.value)} />
          <button type="submit" disabled={authLoading} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2">
            <Lock className="w-4 h-4" /> {authLoading ? 'Processando...' : (isLogin ? 'Entrar no Sistema' : 'Criar Conta')}
          </button>
          <div className="text-center mt-4">
            <button type="button" onClick={() => setIsLogin(!isLogin)} className="text-slate-400 hover:text-cyan-400 text-sm">
              {isLogin ? 'Não tem conta? Cadastre-se aqui' : 'Já tem conta? Faça login'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  const filteredIndividuos = individuos.filter(ind => 
    ind.nome.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (ind.vulgo && ind.vulgo.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (ind.cpf && ind.cpf.includes(searchQuery))
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <header className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('dashboard')}>
            <div className="bg-cyan-500/10 p-2 rounded-lg border border-cyan-500/30">
              <Shield className="text-cyan-400 w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100 tracking-wider">SENTINELA</h1>
              <p className="text-xs text-cyan-500 font-medium">SISTEMA INTEGRADO DE PESQUISAS DE ABORDADOS</p>
            </div>
          </div>
          <div className="flex items-center gap-4 bg-slate-950 p-2 px-4 rounded-lg border border-slate-800">
            <span className="text-sm text-slate-400">{session.user.email}</span>
            <button onClick={handleLogout} className="text-red-400 hover:text-red-300 flex items-center gap-1 text-sm border-l border-slate-800 pl-4">
              <LogOut className="w-4 h-4" /> Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-6">
        {view === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
                <input type="text" placeholder="Pesquisar por nome, vulgo ou CPF..." className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 pl-10 pr-4 outline-none focus:border-cyan-500" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <button onClick={abrirFormularioNovo} className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 rounded-lg font-medium flex items-center gap-2">
                <Plus className="w-5 h-5" /> Nova Ficha
              </button>
            </div>

            {loading ? (
              <div className="text-center text-cyan-500 py-10">Sincronizando com o banco de dados...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredIndividuos.map(ind => (
                  <div key={ind.id} onClick={() => { setSelectedIndividuo(ind); setView('detail'); }} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-cyan-500/50 cursor-pointer">
                    <div className="flex gap-4">
                      <div className="w-16 h-16 rounded-lg bg-slate-800 overflow-hidden shrink-0">
                        {ind.fotos_individuos?.[0] ? <img src={ind.fotos_individuos[0].url_storage} className="w-full h-full object-cover" /> : <User className="w-full h-full p-4 text-slate-600" />}
                      </div>
                      <div className="overflow-hidden">
                        <h3 className="font-bold text-slate-100 truncate">{ind.nome}</h3>
                        <p className="text-sm text-cyan-400 truncate">Vulgo: {ind.vulgo || 'N/A'}</p>
                        <p className="text-xs text-slate-500 mt-2">Adicionado por: {ind.criado_por}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(view === 'form' || view === 'edit') && (
          <div className="max-w-3xl mx-auto bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-xl font-bold mb-6 border-b border-slate-800 pb-4">
              {view === 'edit' ? 'Editar Ficha' : 'Nova Ficha'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <input type="text" placeholder="Nome Completo" className="bg-slate-950 border border-slate-800 rounded p-3 outline-none" value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} />
              <input type="text" placeholder="Vulgo" className="bg-slate-950 border border-slate-800 rounded p-3 outline-none" value={formData.vulgo} onChange={e => setFormData({...formData, vulgo: e.target.value})} />
              <input type="text" placeholder="CPF" maxLength="14" className="bg-slate-950 border border-slate-800 rounded p-3 outline-none" value={formData.cpf} onChange={e => setFormData({...formData, cpf: formatCPF(e.target.value)})} />
              <input type="text" placeholder="RG" maxLength="12" className="bg-slate-950 border border-slate-800 rounded p-3 outline-none" value={formData.rg} onChange={e => setFormData({...formData, rg: formatRG(e.target.value)})} />
              <input type="text" placeholder="Endereço Completo" className="bg-slate-950 border border-slate-800 rounded p-3 outline-none md:col-span-2" value={formData.endereco} onChange={e => setFormData({...formData, endereco: formatEndereco(e.target.value)})} />
              <input type="text" placeholder="Artigos Penais (separados por vírgula)" className="bg-slate-950 border border-slate-800 rounded p-3 outline-none md:col-span-2" value={formData.artigos} onChange={e => setFormData({...formData, artigos: e.target.value})} />
            </div>
            <textarea placeholder="Modus Operandi" className="w-full bg-slate-950 border border-slate-800 rounded p-3 h-24 mb-4 outline-none" value={formData.modus_operandi} onChange={e => setFormData({...formData, modus_operandi: e.target.value})} />
            
            <div className="bg-slate-950 p-4 border border-slate-800 rounded mb-4">
              <p className="text-sm mb-2">{view === 'edit' ? 'Adicionar Novas Fotos (as antigas serão mantidas)' : 'Fotos'}</p>
              <div className="flex gap-2">
                {formFotos.map((f, i) => <img key={i} src={f} className="w-16 h-16 object-cover rounded border border-slate-700" />)}
                {formFotos.length < 5 && (
                  <label className="w-16 h-16 flex items-center justify-center border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded cursor-pointer">
                    <Upload className="w-4 h-4 text-slate-500" />
                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileUpload} />
                  </label>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => view === 'edit' ? setView('detail') : setView('dashboard')} className="text-slate-400">Cancelar</button>
              <button onClick={handleSave} disabled={loading || !formData.nome} className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2 rounded">
                {loading ? 'Processando...' : (view === 'edit' ? 'Salvar Alterações' : 'Salvar Ficha')}
              </button>
            </div>
          </div>
        )}

        {view === 'detail' && selectedIndividuo && (
          <div className="max-w-4xl mx-auto space-y-6">
            <button onClick={() => setView('dashboard')} className="text-slate-400 text-sm hover:text-cyan-400 transition-colors">← Voltar para listagem</button>
            
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
              <div className="bg-slate-950 p-6 flex flex-col md:flex-row justify-between gap-4">
                <div className="flex gap-4">
                  {selectedIndividuo.fotos_individuos?.[0] ? <img src={selectedIndividuo.fotos_individuos[0].url_storage} className="w-24 h-24 rounded object-cover border border-slate-800" /> : <div className="w-24 h-24 bg-slate-800 rounded flex items-center justify-center"><User className="text-slate-600 w-10 h-10"/></div>}
                  <div className="flex flex-col justify-center">
                    <h2 className="text-2xl font-bold uppercase tracking-wide">{selectedIndividuo.nome}</h2>
                    <p className="text-cyan-400 font-medium">Vulgo: {selectedIndividuo.vulgo || 'Não informado'}</p>
                    <p className="text-xs text-slate-500 mt-1">Ficha criada por: {selectedIndividuo.criado_por}</p>
                  </div>
                </div>
                
                {/* Botões restritos ao criador da ficha */}
                {selectedIndividuo.user_id === session.user.id && (
                  <div className="flex flex-col md:flex-row items-center gap-2 mt-4 md:mt-0">
                    <button onClick={abrirFormularioEdicao} className="px-4 py-2 rounded text-sm w-full md:w-auto border border-cyan-800 text-cyan-400 hover:bg-cyan-900/30 flex items-center justify-center gap-2 transition-colors">
                      <Edit className="w-4 h-4" /> Editar
                    </button>
                    <button onClick={() => handleDelete(selectedIndividuo.id)} className={`px-4 py-2 rounded text-sm w-full md:w-auto flex items-center justify-center transition-colors ${confirmDeleteId === selectedIndividuo.id ? 'bg-red-600 text-white' : 'border border-red-900 text-red-500 hover:bg-red-900/30'}`}>
                      {confirmDeleteId === selectedIndividuo.id ? 'Confirmar Exclusão' : 'Excluir Ficha'}
                    </button>
                  </div>
                )}
              </div>
              
              <div className="bg-slate-900 border-t border-slate-800 p-6">
                <h3 className="text-sm font-bold text-slate-500 mb-4 tracking-wider">DADOS DE IDENTIFICAÇÃO</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="bg-slate-950 p-3 rounded border border-slate-800">
                    <span className="text-slate-500 block text-xs mb-1">CPF (Clique para copiar)</span>
                    <div 
                      className={`flex items-center gap-2 transition-colors ${selectedIndividuo.cpf ? 'cursor-pointer text-cyan-400 hover:text-cyan-300 font-medium' : 'text-slate-200'}`}
                      onClick={() => copiarCPF(selectedIndividuo.cpf)}
                      title={selectedIndividuo.cpf ? "Clique para copiar o CPF" : ""}
                    >
                      <span>{selectedIndividuo.cpf || 'Não informado'}</span>
                      {selectedIndividuo.cpf && (bnmpCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />)}
                    </div>
                  </div>
                  <div className="bg-slate-950 p-3 rounded border border-slate-800">
                    <span className="text-slate-500 block text-xs mb-1">RG</span>
                    <span className="text-slate-200 font-medium">{selectedIndividuo.rg || 'Não informado'}</span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded border border-slate-800 md:col-span-2">
                    <span className="text-slate-500 block text-xs mb-1">Endereço</span>
                    <span className="text-slate-200">{selectedIndividuo.endereco || 'Não informado'}</span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded border border-slate-800 md:col-span-2">
                    <span className="text-slate-500 block text-xs mb-1">Artigos Penais</span>
                    <span className="text-cyan-400 font-medium">{selectedIndividuo.artigos_criminais?.length > 0 ? selectedIndividuo.artigos_criminais.join(', ') : 'Nenhum registo'}</span>
                  </div>
                </div>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8 border-t border-slate-800">
                <div className="md:col-span-2 space-y-6">
                  <div>
                    <h3 className="text-sm font-bold text-slate-500 mb-2 tracking-wider">MODUS OPERANDI</h3>
                    <p className="bg-slate-950 p-4 border border-slate-800 rounded text-sm min-h-[100px] text-slate-300">{selectedIndividuo.modus_operandi || 'Nenhuma informação detalhada.'}</p>
                  </div>
                  <div className="bg-slate-950/50 p-4 border border-slate-800 rounded flex justify-between items-center">
                    <div>
                      <h4 className="text-sm font-bold text-slate-200">Consulta Rápida BNMP</h4>
                      <p className="text-xs text-slate-500">Copia o CPF e abre o portal do CNJ.</p>
                    </div>
                    <button onClick={() => handleBNMP(selectedIndividuo.cpf)} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded text-sm flex gap-2 transition-colors">
                      {bnmpCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <ExternalLink className="w-4 h-4" />}
                      Consultar Portal
                    </button>
                  </div>
                  {selectedIndividuo.fotos_individuos?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-slate-500 mb-2 tracking-wider">GALERIA DE FOTOS</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {selectedIndividuo.fotos_individuos.map((f, i) => <img key={i} src={f.url_storage} className="aspect-square w-full object-cover rounded border border-slate-800" />)}
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-slate-950 rounded border border-slate-800 p-4 flex flex-col h-[400px]">
                  <h3 className="text-sm font-bold text-slate-400 mb-3 tracking-wider">NOTAS ADICIONAIS</h3>
                  <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
                    {selectedIndividuo.observacoes_individuos?.length === 0 && (
                      <p className="text-xs text-slate-600 text-center mt-10">Sem notas adicionadas.</p>
                    )}
                    {selectedIndividuo.observacoes_individuos?.map((obs, i) => (
                      <div key={i} className="bg-slate-900 p-3 rounded text-sm border border-slate-800">
                        <p className="text-slate-300">{obs.observacao}</p>
                        <p className="text-[10px] text-cyan-500 mt-2 font-medium">{obs.autor_nome}</p>
                      </div>
                    ))}
                  </div>
                  <textarea placeholder="Adicionar nova informação..." className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm h-16 outline-none focus:border-cyan-500 resize-none" value={novaNota} onChange={e => setNovaNota(e.target.value)} />
                  <button onClick={handleAddNote} className="w-full bg-cyan-600 hover:bg-cyan-500 mt-2 py-2 rounded text-sm text-white font-medium transition-colors">Anexar Nota</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}