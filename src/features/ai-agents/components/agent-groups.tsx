'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useOrgId } from '@/hooks/use-org-query-key';
import { channelsService } from '@/features/channels/services/channels.service';
import { aiAgentsService } from '../services/ai-agents.service';
import { agentGroupsService, type AgentGroup, type SaveAgentGroup } from '../services/agent-groups.service';

const inputClass = 'w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700';
const empty: SaveAgentGroup = { name: '', description: '', initialAgentId: '', memberIds: [] };
export function AgentGroups() {
  const org = useOrgId();
  const cache = useQueryClient();
  const groups = useQuery({ queryKey: ['ai-agent-groups', org], queryFn: agentGroupsService.list });
  const agents = useQuery({ queryKey: ['ai-agents', org], queryFn: aiAgentsService.list });
  const channels = useQuery({ queryKey: ['channels', org], queryFn: channelsService.list });
  const [editing, setEditing] = useState<string | null | undefined>(undefined);
  const [form, setForm] = useState<SaveAgentGroup>(empty);
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(false);
  const edit = (group?: AgentGroup) => {
    setEditing(group?.id ?? null);
    setForm(group ? { name: group.name, description: group.description, initialAgentId: group.initialAgentId, memberIds: group.members.map(m => m.agentId) } : empty);
  };
  const save = async () => {
    setSaving(true);
    try {
      await agentGroupsService.save(form, editing ?? undefined);
      await cache.invalidateQueries({ queryKey: ['ai-agent-groups'] });
      setEditing(undefined); toast.success('Grupo salvo');
    } catch (error: any) { toast.error(error?.response?.data?.message ?? 'Erro ao salvar grupo'); }
    finally { setSaving(false); }
  };
  const link = async (channelId: string, groupId: string) => {
    setLinking(true);
    try { await channelsService.update(channelId, { aiAgentGroupId: groupId || null }); await cache.invalidateQueries({ queryKey: ['channels'] }); toast.success('Grupo do canal atualizado'); }
    catch (error: any) { toast.error(error?.response?.data?.message ?? 'Erro ao vincular canal'); }
    finally { setLinking(false); }
  };
  if (groups.isLoading || agents.isLoading || channels.isLoading) return <p className="p-6">Carregando grupos…</p>;
  if (groups.isError || agents.isError || channels.isError) return <p role="alert" className="p-6">Não foi possível carregar os grupos. <button onClick={() => { void groups.refetch(); void agents.refetch(); void channels.refetch(); }}>Tentar novamente</button></p>;
  return <section className="mx-auto max-w-5xl space-y-6 p-6 text-sm">
    <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Grupos de agentes</h2><button className="rounded bg-primary px-4 py-2 text-primary-foreground" onClick={() => edit()}>Criar grupo</button></div>
    <p className="text-zinc-500">Cada número pode usar um grupo. O agente inicial recebe novas conversas e os especialistas podem passar o atendimento entre os membros ativos e publicados.</p>
    {editing !== undefined && <form onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-4 rounded-xl border p-4">
      <h3 className="font-semibold">{editing ? 'Editar grupo' : 'Novo grupo'}</h3>
      <label className="block">Nome<input required maxLength={100} className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label className="block">Descrição<textarea maxLength={2000} className={inputClass} value={form.description ?? ''} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
      <fieldset className="space-y-2"><legend className="font-medium">Membros (na ordem de seleção)</legend>
        {(agents.data ?? []).map(agent => <label key={agent.id} className="flex items-center gap-2"><input type="checkbox" checked={form.memberIds.includes(agent.id)} onChange={e => setForm({ ...form,
          memberIds: e.target.checked ? [...form.memberIds, agent.id] : form.memberIds.filter(id => id !== agent.id),
          initialAgentId: !e.target.checked && form.initialAgentId === agent.id ? '' : form.initialAgentId,
        })} />{agent.name}{(!agent.isActive || !agent.publishedRevisionId) && <span className="text-amber-600">— indisponível até ativar e publicar</span>}</label>)}
      </fieldset>
      <div className="space-y-1">{form.memberIds.map((id, index) => <div key={id} className="flex items-center gap-3"><span>{index + 1}. {agents.data?.find(a => a.id === id)?.name ?? 'Agente removido'}</span><button type="button" disabled={index === 0} onClick={() => {
        const memberIds = [...form.memberIds]; [memberIds[index - 1], memberIds[index]] = [memberIds[index], memberIds[index - 1]]; setForm({ ...form, memberIds });
      }}>Subir</button><button type="button" onClick={() => setForm({ ...form, memberIds: form.memberIds.filter(member => member !== id), initialAgentId: form.initialAgentId === id ? '' : form.initialAgentId })}>Remover</button></div>)}</div>
      <label className="block">Agente inicial<select required className={inputClass} value={form.initialAgentId} onChange={e => setForm({ ...form, initialAgentId: e.target.value })}><option value="">Selecione um membro</option>{form.memberIds.map(id => <option key={id} value={id}>{agents.data?.find(a => a.id === id)?.name ?? id}</option>)}</select></label>
      <div className="flex gap-3"><button disabled={saving} className="rounded bg-primary px-4 py-2 text-primary-foreground" type="submit">{saving ? 'Salvando…' : 'Salvar grupo'}</button><button type="button" disabled={saving} onClick={() => setEditing(undefined)}>Cancelar</button></div>
    </form>}
    {!groups.data?.length && <p>Nenhum grupo criado.</p>}
    <div className="grid gap-4 md:grid-cols-2">{groups.data?.map(group => <article key={group.id} className="space-y-2 rounded-xl border p-4">
      <h3 className="font-semibold">{group.name}</h3><p>{group.description}</p>
      <ol className="list-inside list-decimal">{group.members.map(member => <li key={member.agentId}>{member.agent.name}{member.agentId === group.initialAgentId ? ' (inicial)' : ''}{(!member.agent.isActive || !member.agent.publishedRevisionId || member.agent.deletedAt) ? ' — indisponível' : ''}</li>)}</ol>
      <button className="text-primary underline" onClick={() => edit(group)}>Editar membros e agente inicial</button>
    </article>)}</div>
    <h3 className="font-semibold">Grupo por número / canal</h3>
    <div className="space-y-3">{channels.data?.map(channel => <label className="block" key={channel.id}>{channel.name}<select disabled={linking} className={inputClass} value={channel.aiAgentGroupId ?? ''} onChange={e => void link(channel.id, e.target.value)}><option value="">Sem grupo (roteamento atual)</option>{groups.data?.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>)}</div>
  </section>;
}
