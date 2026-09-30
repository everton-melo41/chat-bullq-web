'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, X, Plus, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  aiAgentsService,
  CURATED_MODELS,
  DEFAULT_AGENT_MODEL,
  DEPARTMENTS,
  type AiAgent,
  type AgentRevisionDiff,
  type AgentMode,
} from '../services/ai-agents.service';
import { aiCatalogService } from '../services/ai-catalog.service';
import { channelsService } from '@/features/channels/services/channels.service';
import { useOrgId } from '@/hooks/use-org-query-key';

interface EditAgentDialogProps {
  agent: AiAgent | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditAgentDialog({
  agent: initialAgent,
  onClose,
  onSaved,
}: EditAgentDialogProps) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const { data: loadedAgent, refetch } = useQuery({
    queryKey: ['ai-agent-editor', orgId, initialAgent?.id],
    queryFn: () => aiAgentsService.findOne(initialAgent!.id), enabled: !!initialAgent,
  });
  const agent = loadedAgent ?? initialAgent;
  const editingId = useRef<string | null>(null);
  const [skillBindings, setSkillBindings] = useState<{ skillId: string; requiresApproval: boolean }[]>([]);
  const [enabledBuiltinTools, setEnabledBuiltinTools] = useState<string[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState('');
  const [showVersions, setShowVersions] = useState(false);
  const [diff, setDiff] = useState<AgentRevisionDiff | null>(null);
  const [fromVersion, setFromVersion] = useState('');
  const [toVersion, setToVersion] = useState('');
  const { data: revisions, refetch: reloadVersions } = useQuery({
    queryKey: ['ai-agent-revisions', orgId, initialAgent?.id],
    queryFn: () => aiAgentsService.revisions(initialAgent!.id), enabled: !!initialAgent,
  });
  const unpublished = dirty || !!agent?.draftRevisionId;
  const close = () => { if (!unpublished || confirm('Há um rascunho não publicado ou alterações não salvas. Sair da edição?')) onClose(); };
  useEffect(() => {
    if (!initialAgent || !unpublished) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const navigate = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest('a[href]');
      if (link && !confirm('Há um rascunho não publicado. Sair da edição?')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', navigate, true); };
  }, [initialAgent, unpublished]);
  const refreshEditor = async () => {
    await Promise.all([refetch(), reloadVersions(), queryClient.invalidateQueries({ queryKey: ['ai-agent-skills'] })]);
    onSaved();
  };
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [modelId, setModelId] = useState(DEFAULT_AGENT_MODEL);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [parentAgentId, setParentAgentId] = useState<string>('');
  const [department, setDepartment] = useState<string>('');
  const [squad, setSquad] = useState('');
  const [operationalContext, setOperationalContext] = useState('');
  const [operationalContextUpdatedAt, setOperationalContextUpdatedAt] = useState<
    string | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [newChannelId, setNewChannelId] = useState('');
  const [newChannelMode, setNewChannelMode] = useState<AgentMode>('AUTONOMOUS');

  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: () => channelsService.list(),
    enabled: !!agent,
  });

  // Other agents in the org for the "reports to" dropdown.
  const { data: allAgents } = useQuery({
    queryKey: ['ai-agents', orgId],
    queryFn: () => aiAgentsService.list(),
    enabled: !!agent,
  });

  useEffect(() => {
    if (!initialAgent) { editingId.current = null; return; }
    if (!agent || (dirty && editingId.current === agent.id)) return;
    if (editingId.current !== agent.id) { setDiff(null); setNote(''); setShowVersions(false); setFromVersion(''); setToVersion(''); }
    editingId.current = agent.id;
    const editable = { ...agent, ...agent.publishedRevision?.snapshot, ...agent.draftRevision?.snapshot };
    setEnabledBuiltinTools(editable.enabledBuiltinTools ?? null);
    setSkillBindings(editable.skills ?? []);
    setDirty(false);
    setName(editable.name);
    setDescription(editable.description ?? '');
    setModelId(editable.modelId);
    setSystemPrompt(editable.systemPrompt);
    setTemperature(editable.temperature);
    setParentAgentId(editable.parentAgentId ?? '');
    setDepartment(editable.department ?? '');
    setSquad(editable.squad ?? '');
    setOperationalContext(editable.operationalContext ?? '');
    setOperationalContextUpdatedAt(editable.operationalContextUpdatedAt ?? null);
  }, [agent, initialAgent]);

  if (!initialAgent || !agent) return null;
  if (!loadedAgent) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><div className="rounded bg-white p-6 text-zinc-900">Carregando rascunho… <button onClick={onClose}>Fechar</button></div></div>;

  const handleSave = async (publish = false) => {
    setSaving(true);
    try {
      await aiAgentsService.saveDraft(agent.id, {
        enabledBuiltinTools,
        skills: skillBindings,
        name,
        description,
        modelId,
        systemPrompt,
        temperature,
        parentAgentId: parentAgentId || null,
        department: department || null,
        squad: squad.trim() || null,
        operationalContext: operationalContext.trim() || null,
      });
      if (publish) await aiAgentsService.publish(agent.id, note.trim() || undefined);
      setDirty(false);
      setNote('');
      await refreshEditor();
      toast.success(publish ? 'Agente publicado' : 'Rascunho salvo');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Excluir "${agent.name}"? Essa ação é irreversível.`))
      return;
    try {
      await aiAgentsService.remove(agent.id);
      toast.success('Agente excluído');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao excluir');
    }
  };

  const handleAddChannel = async () => {
    if (!newChannelId) return;
    try {
      await aiAgentsService.assignChannel(agent.id, {
        channelId: newChannelId,
        mode: newChannelMode,
      });
      toast.success('Canal vinculado');
      setShowAddChannel(false);
      setNewChannelId('');
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao vincular canal');
    }
  };

  const handleRemoveChannel = async (channelId: string) => {
    try {
      await aiAgentsService.unassignChannel(agent.id, channelId);
      toast.success('Canal removido do agente');
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao desvincular');
    }
  };

  const availableChannels = (channels ?? []).filter(
    (c) => !agent.channels?.some((ac) => ac.channelId === c.id),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Editar agente
          </h3>
          <button
            onClick={close}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5" onChange={event => { const el = event.target as HTMLElement; if (!el.closest('[aria-label="Versões"]')) setDirty(true); }}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded bg-amber-100 px-2 py-1 text-sm text-amber-900">{unpublished ? 'Rascunho' : `Publicado v${agent.publishedRevision?.version ?? '—'}`}</span>
            {unpublished && agent.publishedRevision && <span className="text-xs">Em uso: Publicado v{agent.publishedRevision.version}</span>}
            <button onClick={() => setShowVersions(!showVersions)} className="rounded border px-3 py-1">Versões</button>
          </div>
          {showVersions && <section aria-label="Versões" className="space-y-3 rounded border p-3">
            {(revisions ?? []).map(r => <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <span>v{r.version} · {r.status} · {new Date(r.publishedAt ?? r.createdAt).toLocaleString()} {r.note && `· ${r.note}`}</span>
              {r.status !== 'DRAFT' && <button disabled={saving} className="rounded border px-2 py-1" onClick={async () => {
                if (unpublished && !confirm('Substituir o rascunho atual por esta versão?')) return;
                setSaving(true);
                try { await aiAgentsService.restore(agent.id, r.version); setDirty(false); await refreshEditor(); toast.success('Versão restaurada como rascunho'); }
                catch { toast.error('Erro ao restaurar versão'); } finally { setSaving(false); }
              }}>Restaurar como rascunho</button>}
            </div>)}
            <div className="flex gap-2">
              <select aria-label="Versão anterior" value={fromVersion} onChange={e => setFromVersion(e.target.value)}><option value="">De…</option>{revisions?.map(r => <option key={r.id} value={r.version}>v{r.version}</option>)}</select>
              <select aria-label="Versão posterior" value={toVersion} onChange={e => setToVersion(e.target.value)}><option value="">Para…</option>{revisions?.map(r => <option key={r.id} value={r.version}>v{r.version}</option>)}</select>
              <button disabled={!fromVersion || !toVersion} onClick={async () => { try { setDiff(await aiAgentsService.diff(agent.id, Number(fromVersion), Number(toVersion))); } catch { toast.error('Erro ao comparar versões'); } }}>Comparar</button>
            </div>
            {diff && <div className="max-h-80 overflow-auto font-mono text-xs">
              {diff.lines.map((line, i) => <pre key={i} className={`whitespace-pre-wrap ${line.type === 'added' ? 'bg-green-100 text-green-900' : line.type === 'removed' ? 'bg-red-100 text-red-900' : ''}`}>{line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  '}{line.text}</pre>)}
              {diff.fields.map(f => <div key={f.field} className="mt-2"><strong>{f.field}</strong><pre className="whitespace-pre-wrap bg-red-100 text-red-900">- {JSON.stringify(f.before)}</pre><pre className="whitespace-pre-wrap bg-green-100 text-green-900">+ {JSON.stringify(f.after)}</pre></div>)}
            </div>}
          </section>}
          <label className="block text-sm">Nota da publicação (opcional)<input maxLength={2000} value={note} onChange={e => setNote(e.target.value)} className="mt-1 w-full rounded border bg-transparent px-3 py-2" /></label>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Nome
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Descrição
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Modelo
            </label>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {CURATED_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              {!CURATED_MODELS.some((m) => m.id === modelId) && (
                <option value={modelId}>{modelId} (custom)</option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              System prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={10}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div className="rounded-lg border-2 border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-900/10">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                  Contexto operacional do dia
                </p>
                <p className="mt-0.5 text-[11px] text-amber-700/80 dark:text-amber-200/70">
                  Memória viva injetada no prompt — atualize quando rodar
                  campanha, der aula, mudar oferta. Ex: &quot;Hoje 20h teve aula
                  de Skills. Pra quem responder feedback positivo, ofereça
                  Dominando Claude Code R$ 1.497 (link X).&quot;
                </p>
              </div>
              {operationalContextUpdatedAt && (
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  Atualizado{' '}
                  {formatRelative(operationalContextUpdatedAt)}
                </span>
              )}
            </div>
            <textarea
              value={operationalContext}
              onChange={(e) => setOperationalContext(e.target.value)}
              rows={4}
              placeholder="Deixe vazio se hoje não tem nada operacional..."
              maxLength={8000}
              className="mt-3 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-xs dark:border-amber-900/60 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <p className="mt-1 text-right text-[10px] text-amber-700/60 dark:text-amber-300/60">
              {operationalContext.length}/8000
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Criatividade ({temperature.toFixed(2)})
            </label>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="mt-2 w-full"
            />
          </div>

          {/* Organograma matricial ágil */}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Organograma
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Define hierarquia (chefia direta), departamento e squad ágil.
            </p>

            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Reporta a (chefe direto)
                </label>
                <select
                  value={parentAgentId}
                  onChange={(e) => setParentAgentId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="">— Raiz / sem chefe (CEO virtual) —</option>
                  {(allAgents ?? [])
                    .filter((a) => a.id !== agent.id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}{' '}
                        {a.kind === 'ORCHESTRATOR' ? '(Orquestrador)' : ''}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Departamento
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    <option value="">— Não definido —</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Squad ágil
                  </label>
                  <input
                    type="text"
                    value={squad}
                    onChange={(e) => setSquad(e.target.value)}
                    placeholder="Ex: Inbound B2C"
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
              </div>
            </div>
          </div>

          {agent && (
            <AgentSkillsAndTools agentId={agent.id} enabledBuiltinTools={enabledBuiltinTools} onToolsChange={setEnabledBuiltinTools} bindings={skillBindings} onBindingsChange={next => { setSkillBindings(next); setDirty(true); }} />
          )}

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Canais
              </h4>
              {!showAddChannel && availableChannels.length > 0 && (
                <button
                  onClick={() => setShowAddChannel(true)}
                  className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  <Plus className="h-3 w-3" /> Vincular canal
                </button>
              )}
            </div>
            {showAddChannel && (
              <div className="mt-3 flex items-center gap-2">
                <select
                  value={newChannelId}
                  onChange={(e) => setNewChannelId(e.target.value)}
                  className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="">Selecione um canal…</option>
                  {availableChannels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
                <select
                  value={newChannelMode}
                  onChange={(e) => setNewChannelMode(e.target.value as AgentMode)}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="AUTONOMOUS">Autônomo</option>
                  <option value="COPILOT">Copiloto</option>
                  <option value="DISABLED">Desativado</option>
                </select>
                <button
                  onClick={handleAddChannel}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  OK
                </button>
                <button
                  onClick={() => setShowAddChannel(false)}
                  className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="mt-3 space-y-2">
              {(agent.channels ?? []).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <div className="text-sm">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {c.channel.name}
                    </span>
                    <span className="ml-2 text-[11px] text-zinc-500">
                      {c.channel.type} · {c.mode.toLowerCase()}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveChannel(c.channelId)}
                    className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {(agent.channels ?? []).length === 0 && (
                <p className="text-xs text-zinc-500">
                  Nenhum canal vinculado. O agente não vai responder ninguém ainda.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </button>
          <div className="flex items-center gap-2">
            <button disabled={saving} onClick={() => handleSave(true)} className="rounded bg-green-700 px-3 py-1.5 text-sm text-white disabled:opacity-50">Publicar</button>
            <button
              onClick={close}
              className="rounded-md px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Fechar
            </button>
            <button
              onClick={() => handleSave()}
              disabled={saving}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar rascunho'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const ageMs = Date.now() - d.getTime();
  const ageHours = Math.floor(ageMs / 3_600_000);
  if (ageHours < 1) return 'há minutos';
  if (ageHours < 24) return `há ${ageHours}h`;
  const ageDays = Math.floor(ageHours / 24);
  if (ageDays < 30) return `há ${ageDays}d`;
  return `há ${Math.floor(ageDays / 30)} meses`;
}

function AgentSkillsAndTools({ agentId, enabledBuiltinTools, onToolsChange, bindings, onBindingsChange }: {
  agentId: string;
  enabledBuiltinTools: string[] | null;
  onToolsChange: (tools: string[] | null) => void;
  bindings: { skillId: string; requiresApproval: boolean }[];
  onBindingsChange: (bindings: { skillId: string; requiresApproval: boolean }[]) => void;
}) {
  const orgId = useOrgId();
  const { data: skills, isError: skillsError } = useQuery({
    queryKey: ['ai-skills', orgId], queryFn: () => aiCatalogService.listSkills(),
  });
  const { data: builtInActions, isError: builtInsError } = useQuery({
    queryKey: ['ai-agent-built-ins', orgId, agentId],
    queryFn: () => aiAgentsService.listBuiltInActions(agentId),
  });
  return <div className="space-y-3">
    <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800" aria-label="Ações built-in disponíveis">
      <h4 className="text-sm font-medium">Ações built-in disponíveis</h4>
      <p className="mt-1 text-xs text-zinc-500">Marque as ações permitidas. As alterações só entram em vigor após publicar.</p>
      {builtInsError && <p className="text-xs text-red-500">Não foi possível carregar as ações.</p>}
      <dl className="mt-3 space-y-3">{(builtInActions ?? []).map(action => <div key={action.name}>
        <dt className="font-mono text-xs font-semibold"><label><input type="checkbox" checked={enabledBuiltinTools === null || enabledBuiltinTools.includes(action.name)} onChange={e => {
          const current = enabledBuiltinTools ?? (builtInActions ?? []).map(a => a.name);
          onToolsChange(e.target.checked ? [...current, action.name] : current.filter(n => n !== action.name));
        }} /> {action.name}</label></dt>
        <dd className="mt-1 text-xs text-zinc-500">{action.description}</dd>
      </div>)}</dl>
    </section>
    <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800" aria-label="Skills atribuídas">
      <h4 className="text-sm font-medium">Skills atribuídas ({bindings.length})</h4>
      <p className="mt-1 text-xs text-zinc-500">Os vínculos e a exigência de aprovação serão salvos junto com o rascunho.</p>
      {skillsError && <p className="text-xs text-red-500">Não foi possível carregar as skills.</p>}
      <div className="mt-2 max-h-72 overflow-y-auto">{(skills ?? []).map(skill => {
        const binding = bindings.find(b => b.skillId === skill.id);
        return <div key={skill.id} className="flex items-start gap-2 rounded px-2 py-2 text-xs">
          <label className="flex-1"><input type="checkbox" checked={!!binding} onChange={e => onBindingsChange(e.target.checked ? [...bindings, { skillId: skill.id, requiresApproval: false }] : bindings.filter(b => b.skillId !== skill.id))} /> <strong>{skill.name}</strong><span className="mt-1 block text-zinc-500">{skill.description}</span></label>
          {binding && <label className="flex items-center gap-1 text-amber-700 dark:text-amber-300"><ShieldCheck className="h-3 w-3" /><input type="checkbox" checked={binding.requiresApproval} onChange={e => onBindingsChange(bindings.map(b => b.skillId === skill.id ? { ...b, requiresApproval: e.target.checked } : b))} /> Exigir aprovação</label>}
        </div>;
      })}</div>
    </section>
  </div>;
}
