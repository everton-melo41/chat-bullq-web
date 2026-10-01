'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useOrgId } from '@/hooks/use-org-query-key';
import { Dialog, inputCls, primaryBtn, secondaryBtn } from './dialogs';

interface Document { id: string; title: string; content: string; status: 'PROCESSING' | 'READY' | 'FAILED'; error: string | null; sizeChars: number; sourceType: string }
const root = '/ai-agents/knowledge';
const status = { PROCESSING: 'Processando', READY: 'Pronto', FAILED: 'Falhou' };
const errorMessage = (e: any) => e?.response?.data?.message ?? 'Não foi possível concluir a operação.';
function useDocuments() {
  const org = useOrgId();
  return useQuery({ queryKey: ['knowledge', org], queryFn: async () => { const { data } = await api.get(root); return (data.data ?? data) as Document[]; }, refetchInterval: 3000 });
}
function Details({ doc }: { doc: Document }) {
  return <span className="block text-xs text-zinc-600 dark:text-zinc-300">{status[doc.status]} · {doc.sizeChars.toLocaleString('pt-BR')} caracteres · {doc.sourceType}{doc.error && <span className="block text-red-600 dark:text-red-300">{doc.error}</span>}</span>;
}
export function KnowledgeLibraryDialog({ onClose }: { onClose: () => void }) {
  const docs = useDocuments(); const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState(''); const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const refresh = () => qc.invalidateQueries({ queryKey: ['knowledge'] });
  const reset = () => { setEditing(null); setTitle(''); setContent(''); setFile(null); setFileKey(k => k + 1); };
  const save = async () => {
    if (!title.trim()) return toast.error('Informe o título.');
    if (file && file.size > 2 * 1024 * 1024) return toast.error('O arquivo deve ter até 2 MB.');
    if ((!file || editing) && (!content.trim() || content.length > 200000)) return toast.error('Informe até 200 mil caracteres de conteúdo.');
    setBusy(true);
    try {
      if (editing) await api.put(`${root}/${editing}`, { title, content });
      else if (file) { const form = new FormData(); form.append('file', file); form.append('title', title); await api.post(root, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 }); }
      else await api.post(root, { title, content });
      reset(); await refresh(); toast.success('Documento salvo para indexação.');
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return <Dialog title="Base de conhecimento" description="Cadastre Markdown (principal), TXT, PDF com texto ou cole o conteúdo. Depois selecione os documentos na configuração de cada agente." onClose={onClose}>
    <div className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); void save(); }}>
        <label className="block text-sm">Título<input required maxLength={200} className={inputCls} value={title} onChange={e => setTitle(e.target.value)} /></label>
        {!editing && <label className="block text-sm">Arquivo (até 2 MB)<input key={fileKey} className="block w-full text-sm" type="file" accept=".md,.txt,.pdf" onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !title) setTitle(f.name); }} /></label>}
        {(!file || editing) && <label className="block text-sm">Conteúdo (até 200 mil caracteres)<textarea required maxLength={200000} rows={7} className={inputCls} value={content} onChange={e => setContent(e.target.value)} /></label>}
        <div className="flex gap-2"><button disabled={busy} className={primaryBtn}>{busy ? 'Salvando…' : editing ? 'Salvar e reindexar' : 'Cadastrar'}</button>{editing && <button type="button" className={secondaryBtn} onClick={reset}>Cancelar edição</button>}</div>
      </form>
      {docs.isLoading && <p>Carregando documentos…</p>}{docs.isError && <p role="alert">Não foi possível carregar os documentos.</p>}
      {docs.data?.length === 0 && <p className="text-sm">Nenhum documento cadastrado.</p>}
      {docs.data?.map(doc => <div key={doc.id} className="space-y-2 rounded border border-zinc-300 p-3 dark:border-zinc-700"><strong className="break-words text-sm">{doc.title}</strong><Details doc={doc} /><div className="flex gap-2">
        <button disabled={busy} className={secondaryBtn} onClick={() => { setEditing(doc.id); setTitle(doc.title); setContent(doc.content); setFile(null); }}>Editar</button>
        <button disabled={busy} className={secondaryBtn} onClick={async () => { if (!window.confirm(`Excluir “${doc.title}” e seus vínculos?`)) return; setBusy(true); try { await api.delete(`${root}/${doc.id}`); if (editing === doc.id) reset(); await refresh(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); } }}>Excluir</button>
      </div></div>)}
    </div>
  </Dialog>;
}
export function AgentKnowledge({ agentId }: { agentId: string }) {
  const org = useOrgId(); const docs = useDocuments(); const qc = useQueryClient();
  const links = useQuery({ queryKey: ['knowledge', org, agentId], queryFn: async () => { const { data } = await api.get(`/ai-agents/${agentId}/knowledge`); return (data.data ?? data) as Document[]; } });
  const [selected, setSelected] = useState<string[]>([]); const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false); const [open, setOpen] = useState(false);
  useEffect(() => { if (links.data && !dirty) setSelected(links.data.map(d => d.id)); }, [links.data, dirty]);
  return <div className="space-y-4"><p className="text-sm">O agente consulta somente os documentos marcados, quando estiverem prontos; os vínculos salvos valem imediatamente.</p>
    <button className={secondaryBtn} onClick={() => setOpen(true)}>Cadastrar documentos</button>
    {(docs.isLoading || links.isLoading) && <p>Carregando…</p>}{(docs.isError || links.isError) && <p role="alert">Não foi possível carregar a base de conhecimento.</p>}
    {docs.data?.length === 0 && <p>Nenhum documento cadastrado.</p>}
    {docs.data?.map(doc => <label key={doc.id} className="flex items-start gap-3 rounded border border-zinc-300 p-3 dark:border-zinc-700"><input type="checkbox" disabled={busy || !links.isSuccess} checked={selected.includes(doc.id)} onChange={e => { setDirty(true); setSelected(ids => e.target.checked ? [...ids, doc.id] : ids.filter(id => id !== doc.id)); }} /><span className="min-w-0 break-words">{doc.title}<Details doc={doc} /></span></label>)}
    <button className={primaryBtn} disabled={busy || !links.isSuccess || !docs.isSuccess} onClick={async () => { setBusy(true); try { await api.put(`/ai-agents/${agentId}/knowledge`, { documentIds: selected.filter(id => docs.data?.some(d => d.id === id)) }); setDirty(false); await qc.invalidateQueries({ queryKey: ['knowledge', org, agentId] }); toast.success('Vínculos salvos.'); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); } }}>{busy ? 'Salvando…' : 'Salvar vínculos'}</button>
    {open && <KnowledgeLibraryDialog onClose={() => setOpen(false)} />}
  </div>;
}
