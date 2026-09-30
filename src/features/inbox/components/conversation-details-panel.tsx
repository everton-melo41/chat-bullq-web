 'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { departmentsService } from '@/features/departments/services/departments.service';
import { tagsService } from '@/features/settings/services/tags.service';
import { pipelinesService } from '@/features/pipelines/services/pipelines.service';
import { inboxService, type Conversation, type InternalNote } from '../services/inbox.service';
import { ConversationAiToggle } from './conversation-ai-toggle';
import { AssignmentPopover } from './assignment-popover';
import { PipelinePopover } from './pipeline-popover';
import { InternalNoteCard } from './internal-note-card';

export function ConversationDetailsPanel({ conversation, onUpdate, onClose, notes, userId, onDeleteNote, onCreateNote }: {
  conversation: Conversation; onUpdate: () => void; onClose: () => void;
  notes: InternalNote[]; userId?: string; onDeleteNote: (id: string) => void; onCreateNote: (text: string) => Promise<void>;
}) {
  const [name, setName] = useState(conversation.contact.name ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(conversation.contact.name ?? ''); setNote(''); }, [conversation.id, conversation.contact.name]);
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: departmentsService.list });
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: tagsService.list });
  const { data: cards = [] } = useQuery({ queryKey: ['conversation-pipelines', conversation.id], queryFn: () => pipelinesService.listByConversation(conversation.id) });
  const change = async (operation: () => Promise<unknown>) => {
    setBusy(true); try { await operation(); onUpdate(); } catch { toast.error('Não foi possível salvar a alteração'); } finally { setBusy(false); }
  };
  return <aside aria-label="Detalhes da conversa" className="absolute inset-y-0 right-0 z-20 w-80 max-w-[85vw] shrink-0 md:static space-y-5 overflow-y-auto border-l bg-background p-4 text-sm">
    <div className="flex justify-between"><h2 className="font-semibold">Detalhes da conversa</h2><button onClick={onClose} aria-label="Recolher detalhes"><X className="h-4 w-4" /></button></div>
    <section className="space-y-2"><h3 className="font-medium">Contato</h3><p>{conversation.contact.phone ?? 'Sem telefone'}</p>
      <label className="block">Nome<input className="mt-1 w-full rounded border bg-transparent p-2" value={name} onChange={e => setName(e.target.value)} /></label>
      <button className="text-primary" disabled={busy || !name.trim()} onClick={() => void change(() => inboxService.renameContact(conversation.contactId, name.trim()))}>Salvar nome</button>
    </section>
    <section><h3 className="font-medium">Número / canal</h3><p>{conversation.channel.name}</p><p className="text-xs text-zinc-500">{conversation.channel.type}</p></section>
    <label className="block font-medium">Departamento<select className="mt-2 w-full rounded border bg-background p-2 font-normal" value={conversation.departmentId ?? ''} disabled={busy} onChange={e => { if (e.target.value) void change(() => inboxService.updateConversation(conversation.id, { departmentId: e.target.value })); }}>
      <option value="" disabled>Sem departamento</option>{departments.filter(d => !d.channelId || d.channelId === conversation.channelId).map(d => <option key={d.id} value={d.id}>{d.name}{!d.channelId ? ' (geral)' : ''}</option>)}
    </select></label>
    <section><h3 className="mb-2 font-medium">Responsável</h3><AssignmentPopover conversation={conversation} onChanged={onUpdate} /></section>
    <section><h3 className="mb-2 font-medium">Inteligência artificial</h3><ConversationAiToggle conversation={conversation} disabled={busy} onChange={next => change(() => inboxService.toggleAi(conversation.id, next))} onEngage={() => change(() => inboxService.engageAi(conversation.id))} /></section>
    <section className="space-y-2"><h3 className="font-medium">Tags</h3>
      <div className="flex flex-wrap gap-1">{conversation.tags?.map(({ tag }) => <button key={tag.id} disabled={busy} title="Remover tag" className="rounded border px-2 py-1" style={{ borderColor: tag.color }} onClick={() => void change(() => tagsService.removeFromConversation(conversation.id, tag.id))}>{tag.name} ×</button>)}</div>
      {conversation.contact.tags?.map(({ tag }) => <span key={tag.id} className="mr-1 inline-block rounded border px-2 py-1 text-xs">{tag.name} · contato</span>)}
      <select aria-label="Adicionar tag" value="" disabled={busy} className="w-full rounded border bg-background p-2" onChange={e => { if (e.target.value) void change(() => tagsService.addToConversation(conversation.id, e.target.value)); }}><option value="">Adicionar tag</option>{tags.filter(t => !conversation.tags?.some(x => x.tag.id === t.id)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
    </section>
    <section className="space-y-2"><h3 className="font-medium">Pipeline</h3>{cards.map(c => <p key={c.id}>{c.pipeline.name}: <strong>{c.stage.name}</strong></p>)}<PipelinePopover conversation={conversation} onChanged={onUpdate} /></section>
    <section className="space-y-2"><h3 className="font-medium">Notas internas</h3>{notes.map(n => <InternalNoteCard key={n.id} note={n} userId={userId} onDelete={onDeleteNote} />)}
      <textarea aria-label="Nova nota interna" className="w-full rounded border bg-amber-50 p-2 text-amber-950" value={note} onChange={e => setNote(e.target.value)} placeholder="Visível só para a equipe" />
      <button disabled={busy || !note.trim()} className="text-primary" onClick={async () => { setBusy(true); try { await onCreateNote(note); setNote(''); } catch { toast.error('Não foi possível salvar a nota'); } finally { setBusy(false); } }}>Salvar nota</button>
    </section>
  </aside>;
}
