'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, History, Loader2, Settings2, SquarePen, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { aiAgentsService, AiAgent, CURATED_MODELS } from '../services/ai-agents.service';
import { AgentGroup, agentGroupsService } from '../services/agent-groups.service';
import { MentionEditor } from './mention-editor';
import { PublishDialog, primaryBtn, secondaryBtn, inputCls } from './dialogs';
import { MentionOption, MentionRef, toDisplay, toRaw, listMentions } from './studio.service';

type Tab = 'prompt' | 'knowledge' | 'settings';

interface Form {
  name: string;
  systemPrompt: string;
  modelId: string;
  isActive: boolean;
  debounceSeconds: number;
  keywords: string;
}

function formFrom(agent: AiAgent): { form: Form; refs: Map<string, MentionRef> } {
  const src = (agent.draftRevision?.snapshot ?? agent) as Partial<AiAgent>;
  const mp = (src.modelParams ?? {}) as Record<string, unknown>;
  const { text, refs } = toDisplay(String(src.systemPrompt ?? ''));
  return {
    refs,
    form: {
      name: String(src.name ?? agent.name),
      systemPrompt: text,
      modelId: String(src.modelId ?? agent.modelId),
      isActive: src.isActive ?? agent.isActive,
      debounceSeconds: Number(mp.debounceSeconds ?? 18),
      keywords: Array.isArray(mp.activationKeywords) ? (mp.activationKeywords as string[]).join(', ') : '',
    },
  };
}

export interface FlowLink { id: string; name: string; group: string | null; sameGroup: boolean }

export function AgentEditor({ agent, groups, options, onChanged, flow, onOpenAgent }: {
  agent: AiAgent; groups: AgentGroup[]; options: MentionOption[]; onChanged: () => void;
  flow?: { passesTo: FlowLink[]; receivesFrom: FlowLink[] }; onOpenAgent?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('prompt');
  const initial = useMemo(() => formFrom(agent), [agent]);
  const [form, setForm] = useState<Form>(initial.form);
  const [refs] = useState(() => initial.refs);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => { const f = formFrom(agent); setForm(f.form); f.refs.forEach((v, k) => refs.set(k, v)); setDirty(false); }, [agent]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm(f => ({ ...f, [k]: v })); setDirty(true); };
  const group = groups.find(g => g.members.some(m => m.agentId === agent.id));
  const published = agent.publishedRevision;
  const hasDraft = !!agent.draftRevisionId;
  const invalidCount = listMentions(form.systemPrompt, refs, options).filter(c => !c.valid).length;

  const payload = () => ({
    name: form.name.trim(),
    systemPrompt: toRaw(form.systemPrompt, refs, options),
    modelId: form.modelId,
    isActive: form.isActive,
    modelParams: {
      ...((agent.draftRevision?.snapshot?.modelParams ?? agent.modelParams ?? {}) as Record<string, unknown>),
      debounceSeconds: Math.max(5, Math.min(120, Math.round(form.debounceSeconds || 18))),
      activationKeywords: form.keywords.split(',').map(k => k.trim()).filter(Boolean),
    },
  });

  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['studio-agent', agent.id] }); onChanged(); };

  const saveDraft = async () => {
    if (!form.name.trim()) return toast.error('Dê um nome ao agente.');
    setSaving('draft');
    try { await aiAgentsService.saveDraft(agent.id, payload()); setDirty(false); toast.success('Rascunho salvo. Os clientes ainda veem a versão publicada.'); await refresh(); }
    catch (err: any) { toast.error(err?.response?.data?.message ?? 'Não foi possível salvar o rascunho.'); }
    finally { setSaving(null); }
  };

  const askPublish = () => {
    if (invalidCount) return toast.error('Corrija as menções em vermelho antes de publicar.');
    if (!form.name.trim()) return toast.error('Dê um nome ao agente.');
    setPublishing(true);
  };

  const publish = async (note?: string) => {
    setPublishing(false);
    setSaving('publish');
    try {
      if (dirty || !hasDraft) await aiAgentsService.saveDraft(agent.id, payload());
      await aiAgentsService.publish(agent.id, note || undefined);
      setDirty(false); toast.success('Publicado. A nova versão já vale para os clientes.'); await refresh();
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Não foi possível publicar.'); }
    finally { setSaving(null); }
  };

  const moveToGroup = async (groupId: string) => {
    try {
      if (group && group.id !== groupId) {
        const rest = group.members.map(m => m.agentId).filter(id => id !== agent.id);
        if (group.initialAgentId === agent.id && rest.length) return toast.error(`Este é o agente inicial de "${group.name}". Escolha outro inicial nesse grupo antes de mover.`);
        if (rest.length) await agentGroupsService.save({ name: group.name, description: group.description, initialAgentId: group.initialAgentId, memberIds: rest }, group.id);
      }
      const target = groups.find(g => g.id === groupId);
      if (target && !target.members.some(m => m.agentId === agent.id)) {
        await agentGroupsService.save({ name: target.name, description: target.description, initialAgentId: target.initialAgentId, memberIds: [...target.members.map(m => m.agentId), agent.id] }, target.id);
      }
      toast.success('Matéria atualizada.'); onChanged();
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Não foi possível mudar a matéria.'); }
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'prompt', label: 'Prompt', icon: SquarePen },
    { id: 'knowledge', label: 'Base de conhecimento', icon: BookOpen },
    { id: 'settings', label: 'Configurações', icon: Settings2 },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-300 px-6 py-4 dark:border-zinc-700">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-zinc-900 dark:text-zinc-100">{form.name || 'Sem nome'}</h2>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
            <span className="rounded bg-zinc-100 px-2 py-0.5 font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">{group ? group.name : 'Sem matéria'}</span>
            {group?.initialAgentId === agent.id && <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">Agente inicial</span>}
            {published
              ? <span className="rounded bg-emerald-100 px-2 py-0.5 font-medium text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100">Publicado v{published.version}</span>
              : <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">Ainda não publicado</span>}
            {(hasDraft || dirty) && <span className="rounded bg-sky-100 px-2 py-0.5 font-medium text-sky-900 dark:bg-sky-900/50 dark:text-sky-100">{dirty ? 'Alterações não salvas' : 'Rascunho salvo'}</span>}
          </div>
        </div>
        <button type="button" onClick={saveDraft} disabled={!!saving} className={secondaryBtn}>
          {saving === 'draft' ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Salvar rascunho'}
        </button>
        <button type="button" onClick={askPublish} disabled={!!saving} className={primaryBtn}>
          {saving === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Publicar
        </button>
      </div>

      {flow && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-zinc-300 bg-zinc-50 px-6 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900/60">
          <FlowList label="Recebe de" empty={group?.initialAgentId === agent.id ? 'Ninguém: atende primeiro na matéria' : 'Ninguém cita este agente ainda'} items={flow.receivesFrom} onOpen={onOpenAgent} />
          <FlowList label="Passa para" empty="Ninguém: cite um agente no prompt com @ para passar a conversa" items={flow.passesTo} onOpen={onOpenAgent} />
        </div>
      )}

      <div className="flex gap-1 border-b border-zinc-300 px-6 dark:border-zinc-700">
        {tabs.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${tab === t.id ? 'border-primary font-medium text-zinc-900 dark:text-zinc-100' : 'border-transparent text-zinc-600 dark:text-zinc-300 hover:text-zinc-800'}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {publishing && <PublishDialog onClose={() => setPublishing(false)} onConfirm={note => publish(note || undefined)} />}
        {tab === 'prompt' && (
          <MentionEditor value={form.systemPrompt} onChange={v => set('systemPrompt', v)} refs={refs} options={options} />
        )}

        {tab === 'knowledge' && (
          <div className="mx-auto mt-10 max-w-md rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
            <BookOpen className="mx-auto h-8 w-8 text-zinc-600 dark:text-zinc-400" />
            <p className="mt-3 font-medium text-zinc-800 dark:text-zinc-100">Em breve</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Aqui você vai enviar PDFs e textos (listas de doenças, FAQ, quebra de objeções) para o agente consultar.</p>
          </div>
        )}

        {tab === 'settings' && (
          <div className="max-w-xl space-y-6">
            <Field label="Nome"><input value={form.name} onChange={e => set('name', e.target.value)} className={input} /></Field>
            <Field label="Matéria / tese" hint="O grupo em que este agente atende.">
              <select value={group?.id ?? ''} onChange={e => e.target.value && void moveToGroup(e.target.value)} className={input}>
                <option value="">{group ? group.name : 'Sem matéria'}</option>
                {groups.filter(g => g.id !== group?.id).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
            <Field label="Modelo">
              <select value={form.modelId} onChange={e => set('modelId', e.target.value)} className={input}>
                {CURATED_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Tempo de espera para responder" hint="Segundos sem novas mensagens do lead antes de responder (lê tudo que chegou nesse tempo). Recomendado: 15 a 20.">
              <input type="number" min={5} max={120} value={form.debounceSeconds} onChange={e => set('debounceSeconds', Number(e.target.value))} className={`${input} w-28`} />
            </Field>
            <Field label="Palavras-chave de ativação" hint="Separadas por vírgula. Ativam este agente só no início da conversa (ex.: BPC, LOAS vindo de anúncio).">
              <input value={form.keywords} onChange={e => set('keywords', e.target.value)} placeholder="BPC, LOAS" className={input} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-100">
              <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} /> Agente ativo
            </label>
            <Revisions agentId={agent.id} onRestored={refresh} />
          </div>
        )}
      </div>
    </div>
  );
}

const input = inputCls;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{label}</label>
      {children}
      {hint && <p className="text-xs text-zinc-600 dark:text-zinc-300">{hint}</p>}
    </div>
  );
}

function Revisions({ agentId, onRestored }: { agentId: string; onRestored: () => void }) {
  const { data: revisions } = useQuery({ queryKey: ['studio-revisions', agentId], queryFn: () => aiAgentsService.revisions(agentId) });
  const [diffOf, setDiffOf] = useState<number | null>(null);
  const published = revisions?.find(r => r.status === 'PUBLISHED');
  const { data: diff } = useQuery({
    queryKey: ['studio-diff', agentId, published?.version, diffOf],
    queryFn: () => aiAgentsService.diff(agentId, diffOf!, published!.version),
    enabled: diffOf != null && !!published && diffOf !== published.version,
  });

  const restore = async (v: number) => {
    try { await aiAgentsService.restore(agentId, v); toast.success(`Versão ${v} restaurada como rascunho. Revise e publique.`); onRestored(); }
    catch (err: any) { toast.error(err?.response?.data?.message ?? 'Não foi possível restaurar.'); }
  };

  return (
    <div className="space-y-2 border-t border-zinc-300 pt-6 dark:border-zinc-700">
      <h3 className="flex items-center gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-100"><History className="h-4 w-4" /> Histórico de versões</h3>
      {(revisions ?? []).map(r => (
        <div key={r.id} className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <span className="font-medium">v{r.version}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] ${r.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-800' : r.status === 'DRAFT' ? 'bg-amber-100 text-amber-800' : 'bg-zinc-100 text-zinc-600'}`}>
              {r.status === 'PUBLISHED' ? 'publicada' : r.status === 'DRAFT' ? 'rascunho' : 'arquivada'}
            </span>
            <span className="text-xs text-zinc-600 dark:text-zinc-300">{new Date(r.publishedAt ?? r.createdAt).toLocaleString('pt-BR')}</span>
            <span className="ml-auto flex gap-2 text-xs">
              {published && r.version !== published.version && <button type="button" onClick={() => setDiffOf(diffOf === r.version ? null : r.version)} className="text-primary hover:underline">comparar com a publicada</button>}
              {r.status === 'ARCHIVED' && <button type="button" onClick={() => restore(r.version)} className="text-primary hover:underline">restaurar</button>}
            </span>
          </div>
          {r.note && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{r.note}</p>}
          {diffOf === r.version && diff && (
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-zinc-50 p-2 text-xs dark:bg-zinc-900">
              {diff.lines.filter(l => l.type !== 'context').map((l, i) => (
                <div key={i} className={l.type === 'added' ? 'text-emerald-700' : 'text-red-600'}>{l.type === 'added' ? '+ ' : '− '}{l.text}</div>
              ))}
              {diff.fields.map(f => <div key={f.field} className="text-zinc-600">{f.field}: {JSON.stringify(f.before)} → {JSON.stringify(f.after)}</div>)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

function FlowList({ label, items, empty, onOpen }: { label: string; items: FlowLink[]; empty: string; onOpen?: (id: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-medium text-zinc-800 dark:text-zinc-100">{label}</span>
      {items.length === 0 && <span className="text-zinc-600 dark:text-zinc-400">{empty}</span>}
      {items.map(i => (
        <button key={i.id} type="button" onClick={() => onOpen?.(i.id)} title="Abrir este agente"
          className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-900 hover:ring-2 hover:ring-violet-300 dark:bg-violet-900/60 dark:text-violet-100">
          {i.name}{!i.sameGroup && i.group ? ` (em ${i.group})` : !i.sameGroup ? ' (sem matéria)' : ''}
        </button>
      ))}
    </div>
  );
}
