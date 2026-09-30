import { api } from '@/lib/api';
export interface AgentGroup {
  id: string; name: string; description: string | null; initialAgentId: string;
  members: Array<{ agentId: string; order: number; agent: { id: string; name: string; isActive: boolean; publishedRevisionId: string | null; deletedAt: string | null } }>;
}
export interface SaveAgentGroup { name: string; description: string | null; initialAgentId: string; memberIds: string[] }
export const agentGroupsService = {
  async list(): Promise<AgentGroup[]> { const { data } = await api.get('/ai-agent-groups'); return data.data ?? data; },
  async save(input: SaveAgentGroup, id?: string): Promise<AgentGroup> {
    const { data } = id ? await api.put(`/ai-agent-groups/${id}`, input) : await api.post('/ai-agent-groups', input);
    return data.data ?? data;
  },
  async remove(id: string): Promise<void> { await api.delete(`/ai-agent-groups/${id}`); },
};
