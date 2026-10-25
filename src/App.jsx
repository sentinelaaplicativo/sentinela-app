import React, { useState, useEffect } from 'react';
import { Shield, Search, Plus, User, FileText, Camera, Upload, Trash2, ExternalLink, Check, AlertTriangle, AlertCircle } from 'lucide-react';
import { supabase } from './supabaseClient';

const OPERADORES = [
  { id: '1', nome: 'Investigador Silva', matricula: '1001' },
  { id: '2', nome: 'Agente Santos', matricula: '1002' },
  { id: '3', nome: 'Perito Aragão', matricula: '1003' }
];

export default function SentinelaApp() {
  const [currentUser, setCurrentUser] = useState(OPERADORES[0]);
  const [view, setView] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndividuo, setSelectedIndividuo] = useState(null);
  const [individuos, setIndividuos] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  
  const [formData, setFormData] = useState({ nome: '', vulgo: '', cpf: '', rg: '', artigos: '', modus_operandi: '' });
  const [formFotos, setFormFotos] = useState([]); // Base64 para preview
  const [novaNota, setNovaNota] = useState('');
  const [bnmpCopied, setBnmpCopied] = useState(false);

  // Busca dados do Supabase
  const carregarDados = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('individuos')
      .select('*, fotos_individuos(url_storage), observacoes_individuos(observacao, autor_nome, criado_em)')
      .order('criado_em', { ascending: false });

    if (!error && data) {
      setIndividuos(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    carregarDados();
  }, []);

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
    if (formFotos.length + files.length > 5) return alert('Máximo de 5 fotos.');
    const processedFotos = await Promise.all(files.map(file => processImage(file)));
    setFormFotos(prev => [...prev, ...processedFotos]);
  };

  const handleSave = async () => {
    if (!formData.nome) return;
    setLoading(true);

    // 1. Salvar indivíduo
    const arrayArtigos = formData.artigos.split(',').map(a => a.trim()).filter(Boolean);
    const { data: indData, error: indError } = await supabase
      .from('individuos')
      .insert([{
        nome: formData.nome,
        vulgo: formData.vulgo,
        cpf: formData.cpf,
        rg: formData.rg,
        artigos_criminais: arrayArtigos,
        modus_operandi: formData.modus_operandi,
        criado_por: currentUser.nome
      }])
      .select()
      .single();

    if (indError) { alert('Erro ao salvar'); setLoading(false); return; }

    // 2. Enviar fotos
    for (const fotoBase64 of formFotos) {
      const blob = await fetch(fotoBase64).then(res => res.blob());
      const fileName = `${indData.id}/${Date.now()}.jpg`;
      
      const { data: uploadData } = await supabase.storage
        .from('fotos-individuos')
        .upload(fileName, blob, { contentType: 'image/jpeg' });

      if (uploadData) {
        const { data: { publicUrl } } = supabase.storage.from('fotos-individuos').getPublicUrl(fileName);
        await supabase.from('fotos_individuos').insert([{
          individuo_id: indData.id,
          url_storage: publicUrl,
          enviado_por: currentUser.nome
        }]);
      }
    }

    await carregarDados();
    setView('dashboard');
    setFormData({ nome: '', vulgo: '', cpf: '', rg: '', artigos: '', modus_operandi: '' });
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
    
    await supabase.from('observacoes_individuos').insert([{
      individuo_id: selectedIndividuo.id,
      autor_nome: currentUser.nome,
      observacao: novaNota
    }]);

    setNovaNota('');
    carregarDados();
    
    // Atualiza a visualização da tela atual
    const { data } = await supabase
      .from('individuos')
      .select('*, fotos_individuos(url_storage), observacoes_individuos(observacao, autor_nome, criado_em)')
      .eq('id', selectedIndividuo.id)
      .single();
    if(data) setSelectedIndividuo(data);
  };

  const handleBNMP = (cpf) => {
    navigator.clipboard.writeText(cpf || selectedIndividuo.nome);
    setBnmpCopied(true);
    setTimeout(() => setBnmpCopied(false), 2000);
    window.open('https://portalbnmp.cnj.jus.br/', '_blank');
  };

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
          <div className="flex items-center gap-3 bg-slate-950 p-2 rounded-lg border border-slate-800">
            <User className="w-4 h-4 text-slate-400" />
            <select className="bg-transparent text-sm text-slate-300 outline-none" value={currentUser.id} onChange={(e) => setCurrentUser(OPERADORES.find(op => op.id === e.target.value))}>
              {OPERADORES.map(op => <option key={op.id} value={op.id} className="bg-slate-900">{op.nome}</option>)}
            </select>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-6">
        {view === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
                <input type="text" placeholder="Pesquisar..." className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 pl-10 pr-4 outline-none focus:border-cyan-500" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <button onClick={() => setView('form')} className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 rounded-lg font-medium flex items-center gap-2">
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
                        <p className="text-xs text-slate-500 mt-2">CPF: {ind.cpf || 'Não informado'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'form' && (
          <div className="max-w-3xl mx-auto bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-xl font-bold mb-6 border-b border-slate-800 pb-4">Nova Ficha</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <input type="text" placeholder="Nome Completo" className="bg-slate-950 border border-slate-800 rounded p-3 outline-none" value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} />
              <input type="text" placeholder="Vulgo" className="bg-slate-950 border border-slate-800 rounded p-3 outline-none" value={formData.vulgo} onChange={e => setFormData({...formData, vulgo: e.target.value})} />
              <input type="text" placeholder="CPF" className="bg-slate-950 border border-slate-800 rounded p-3 outline-none" value={formData.cpf} onChange={e => setFormData({...formData, cpf: e.target.value})} />
              <input type="text" placeholder="Artigos Penais (separados por vírgula)" className="bg-slate-950 border border-slate-800 rounded p-3 outline-none" value={formData.artigos} onChange={e => setFormData({...formData, artigos: e.target.value})} />
            </div>
            <textarea placeholder="Modus Operandi" className="w-full bg-slate-950 border border-slate-800 rounded p-3 h-24 mb-4 outline-none" value={formData.modus_operandi} onChange={e => setFormData({...formData, modus_operandi: e.target.value})} />
            
            <div className="bg-slate-950 p-4 border border-slate-800 rounded mb-4">
              <p className="text-sm mb-2">Fotos ({formFotos.length}/5)</p>
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
              <button onClick={() => setView('dashboard')} className="text-slate-400">Cancelar</button>
              <button onClick={handleSave} disabled={loading || !formData.nome} className="bg-cyan-600 text-white px-6 py-2 rounded">
                {loading ? 'Salvando...' : 'Salvar Ficha'}
              </button>
            </div>
          </div>
        )}

        {view === 'detail' && selectedIndividuo && (
          <div className="max-w-4xl mx-auto space-y-6">
            <button onClick={() => setView('dashboard')} className="text-slate-400 text-sm">← Voltar</button>
            
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="bg-slate-950 p-6 flex justify-between">
                <div className="flex gap-4">
                  {selectedIndividuo.fotos_individuos?.[0] ? <img src={selectedIndividuo.fotos_individuos[0].url_storage} className="w-20 h-20 rounded object-cover" /> : <div className="w-20 h-20 bg-slate-800 rounded flex items-center justify-center"><User className="text-slate-600"/></div>}
                  <div>
                    <h2 className="text-2xl font-bold">{selectedIndividuo.nome}</h2>
                    <p className="text-cyan-400">Vulgo: {selectedIndividuo.vulgo}</p>
                    <p className="text-sm text-slate-400">Adicionado por: {selectedIndividuo.criado_por}</p>
                  </div>
                </div>
                {selectedIndividuo.criado_por === currentUser.nome && (
                  <button onClick={() => handleDelete(selectedIndividuo.id)} className={`px-4 py-2 rounded text-sm ${confirmDeleteId === selectedIndividuo.id ? 'bg-red-600 text-white' : 'border border-red-900 text-red-500'}`}>
                    {confirmDeleteId === selectedIndividuo.id ? 'Confirmar Exclusão' : 'Excluir Ficha'}
                  </button>
                )}
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2 space-y-6">
                  <div>
                    <h3 className="text-sm font-bold text-slate-500 mb-2">MODUS OPERANDI</h3>
                    <p className="bg-slate-950 p-4 border border-slate-800 rounded text-sm">{selectedIndividuo.modus_operandi}</p>
                  </div>
                  <div className="bg-slate-950/50 p-4 border border-slate-800 rounded flex justify-between">
                    <div>
                      <h4 className="text-sm font-bold">Consulta BNMP</h4>
                      <p className="text-xs text-slate-500">Copia CPF ({selectedIndividuo.cpf}) e abre o site.</p>
                    </div>
                    <button onClick={() => handleBNMP(selectedIndividuo.cpf)} className="bg-slate-800 px-4 py-2 rounded text-sm flex gap-2">
                      {bnmpCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <ExternalLink className="w-4 h-4" />}
                      Consultar
                    </button>
                  </div>
                  {selectedIndividuo.fotos_individuos?.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {selectedIndividuo.fotos_individuos.map((f, i) => <img key={i} src={f.url_storage} className="aspect-square object-cover rounded border border-slate-800" />)}
                    </div>
                  )}
                </div>

                <div className="bg-slate-950 rounded border border-slate-800 p-4 flex flex-col h-[400px]">
                  <h3 className="text-sm font-bold text-slate-400 mb-3">Informações Adicionais</h3>
                  <div className="flex-1 overflow-y-auto space-y-3 mb-4">
                    {selectedIndividuo.observacoes_individuos?.map((obs, i) => (
                      <div key={i} className="bg-slate-900 p-3 rounded text-sm border border-slate-800">
                        <p>{obs.observacao}</p>
                        <p className="text-[10px] text-cyan-500 mt-2">{obs.autor_nome}</p>
                      </div>
                    ))}
                  </div>
                  <textarea placeholder="Nova observação..." className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm h-16 outline-none" value={novaNota} onChange={e => setNovaNota(e.target.value)} />
                  <button onClick={handleAddNote} className="w-full bg-cyan-600 mt-2 py-2 rounded text-sm">Anexar</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}