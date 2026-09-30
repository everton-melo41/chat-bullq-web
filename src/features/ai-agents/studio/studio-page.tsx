'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FlaskConical, FolderPlus, Loader2, Plus, Search, Star } from 'lucide-react';
import { toast } from 'sonner';
import { useOrgId } from '@/hooks/use-org-query-key';
import { aiAgentsService, AiAgent, DEFAULT_AGENT_MODEL } from '../services/ai-agents.service';
import { agentGroupsService } from '../services/agent-groups.service';
import { AgentEditor } from './agent-editor';
import { TestChat } from './test-chat';
import { studioService } from './studio.service';

/**
 * Estúdio de agentes (estilo LíderHub): matérias/teses à esquerda com seus
 * agentes, o agente aberto no centro e o chat de teste à direita.
 */
export function StudioPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showChat, setShowChat] = useState(true);

  const agentsQ = useQuery({ queryKey: ['ai-agents', orgId], queryFn: () => aiAgentsService.list() });
  const groupsQ = useQuery({ queryKey: ['ai-agent-groups', orgId], queryFn: () => agentGroupsService.list() });
  const optionsQ = useQuery({ queryKey: ['mention-options', orgId], queryFn: () => studioService.mentionOptions() });
  const agentQ = useQuery({ queryKey: ['studio-agent', selectedId], queryFn: () => aiAgentsService.findOne(selectedId!), enabled: !!selectedId });

  const agents = useMemo(() => ((agentsQ.data ?? []) as AiAgent[]).filter(a => a.name.toLowerCase().includes(search.toLowerCase())), [agentsQ.data, search]);
  const groups = groupsQ.data ?? [];
  const grouped = new Set(groups.flatMap(g => g.members.map(m => m.agentId)));
  const ungrouped = agents.filter(a => !grouped.has(a.id));

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ['ai-agents'] });
    void qc.invalidateQueries({ queryKey: ['ai-agent-groups'] });
    void qc.invalidateQueries({ queryKey: ['mention-options'] });
    void qc.invalidateQueries({ queryKey: ['studio-revisions'] });
  };

  const createAgent = async (groupId?: string) => {
    const name = window.prompt('Nome do agente (ex.: Triagem BPC, Análise de renda):')?.trim();
    if (!name) return;
    try {
      const agent = await aiAgentsService.create({ name, modelId: DEFAULT_AGENT_MODEL, systemPrompt: `Você é o agente ${name} do escritório. Descreva aqui como ele deve atender.` });
      const g = groups.find(x => x.id === groupId);
      if (g) await agentGroupsService.save({ name: g.name, description: g.description, initialAgentId: g.initialAgentId, memberIds: [...g.members.map(m => m.agentId), agent.id] }, g.id);
      refreshAll(); setSelectedId(agent.id);
      toast.success('Agente criado como rascunho. Escreva o prompt e publique.');
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Não foi possível criar o agente.'); }
  };

  const createGroup = async () => {
    if (!selectedId) return toast.error('Abra primeiro o agente que será o inicial da nova matéria.');
    const name = window.prompt('Nome da matéria/tese (ex.: BPC/LOAS, Auxílio-doença, Trabalhista):')?.trim();
    if (!name) return;
    try {
      const current = groups.find(g => g.members.some(m => m.agentId === selectedId));
      if (current) {
        const rest = current.members.map(m => m.agentId).filter(id => id !== selectedId);
        if (current.initialAgentId === selectedId && rest.length) return toast.error(`Este agente é o inicial de "${current.name}". Abra outro agente para iniciar a nova matéria.`);
        if (rest.length) await agentGroupsService.save({ name: current.name, description: current.description, initialAgentId: current.initialAgentId, memberIds: rest }, current.id);
      }
      await agentGroupsService.save({ name, description: null, initialAgentId: selectedId, memberIds: [selectedId] });
      refreshAll(); toast.success(`Matéria "${name}" criada com o agente aberto como inicial.`);
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Não foi possível criar a matéria.'); }
  };

  const toggle = (id: string) => setCollapsed(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const AgentRow = ({ a, initial }: { a: { id: string; name: string; publishedRevisionId?: string | null }; initial?: boolean }) => (
    <button type="button" onClick={() => setSelectedId(a.id)}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${selectedId === a.id ? 'bg-primary/10 font-medium text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'}`}>
      {initial ? <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" /> : <span className="w-3.5" />}
      <span className="truncate">{a.name}</span>
      {!a.publishedRevisionId && <span className="ml-auto shrink-0 text-[10px] text-amber-600">rascunho</span>}
    </button>
  );

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-72 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800">
        <div className="space-y-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex gap-2">
            <button type="button" onClick={createGroup} className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-zinc-300 px-2 py-1.5 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"><FolderPlus className="h-3.5 w-3.5" /> Matéria</button>
            <button type="button" onClick={() => createAgent()} className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground"><Plus className="h-3.5 w-3.5" /> Agente</button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-zinc-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar agente" className="w-full rounded-md border border-zinc-200 bg-white py-1.5 pl-7 pr-2 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-900" />
          </div>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-2">
          {(agentsQ.isLoading || groupsQ.isLoading) && <Loader2 className="mx-auto mt-6 h-4 w-4 animate-spin text-zinc-400" />}
          {(agentsQ.isError || groupsQ.isError) && <p className="p-2 text-xs text-red-600">Não foi possível carregar. <button className="underline" onClick={refreshAll}>Tentar novamente</button></p>}
          {groups.map(g => {
            const members = g.members.filter(m => m.agent.name.toLowerCase().includes(search.toLowerCase()));
            return (
              <div key={g.id}>
                <div className="flex items-center gap-1 px-1">
                  <button type="button" onClick={() => toggle(g.id)} className="flex flex-1 items-center gap-1 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {collapsed.has(g.id) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} {g.name}
                  </button>
                  <button type="button" onClick={() => createAgent(g.id)} title="Novo agente nesta matéria" className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"><Plus className="h-3.5 w-3.5" /></button>
                </div>
                {!collapsed.has(g.id) && members.map(m => <AgentRow key={m.agentId} a={{ id: m.agentId, name: m.agent.name, publishedRevisionId: m.agent.publishedRevisionId }} initial={g.initialAgentId === m.agentId} />)}
              </div>
            );
          })}
          {ungrouped.length > 0 && (
            <div>
              <p className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">Sem matéria</p>
              {ungrouped.map(a => <AgentRow key={a.id} a={a} />)}
            </div>
          )}
          {!agentsQ.isLoading && !agents.length && <p className="p-3 text-center text-xs text-zinc-400">Nenhum agente ainda. Crie o primeiro em “Agente”.</p>}
        </div>
        <p className="border-t border-zinc-200 p-3 text-[11px] leading-4 text-zinc-400 dark:border-zinc-800"><Star className="inline h-3 w-3 fill-amber-400 text-amber-400" /> = agente inicial da matéria. A passagem entre agentes é feita citando o agente no prompt com @.</p>
      </aside>

      <main className="min-w-0 flex-1">
        {!selectedId && <div className="flex h-full items-center justify-center text-sm text-zinc-400">Escolha um agente à esquerda ou crie um novo.</div>}
        {selectedId && agentQ.isLoading && <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin text-zinc-400" />}
        {selectedId && agentQ.data && (
          <AgentEditor key={agentQ.data.id + (agentQ.data.draftRevisionId ?? '') + (agentQ.data.publishedRevisionId ?? '')}
            agent={agentQ.data} groups={groups} options={optionsQ.data ?? []} onChanged={() => { refreshAll(); void agentQ.refetch(); }} />
        )}
      </main>

      {selectedId && agentQ.data && (showChat ? (
        <aside className="flex w-96 shrink-0 flex-col border-l border-zinc-200 dark:border-zinc-800">
          <TestChat agentId={agentQ.data.id} agentName={agentQ.data.name} />
          <button type="button" onClick={() => setShowChat(false)} className="border-t border-zinc-200 py-1.5 text-xs text-zinc-400 hover:text-zinc-700 dark:border-zinc-800">Recolher chat de teste</button>
        </aside>
      ) : (
        <button type="button" onClick={() => setShowChat(true)} title="Abrir chat de teste" className="flex w-10 shrink-0 flex-col items-center gap-2 border-l border-zinc-200 pt-4 text-zinc-500 hover:text-zinc-800 dark:border-zinc-800">
          <FlaskConical className="h-4 w-4" /><span className="text-[10px] [writing-mode:vertical-rl]">Chat de teste</span>
        </button>
      ))}
    </div>
  );
}
