import { api } from '@/lib/api';
export interface Department { id: string; name: string; description?: string | null; channelId: string | null; }
export const departmentsService = {
  async list(): Promise<Department[]> { const { data } = await api.get('/departments'); return data.data; },
  async save(payload: { name: string; channelId: string | null }, id?: string): Promise<Department> {
    const { data } = id ? await api.patch(`/departments/${id}`, payload) : await api.post('/departments', payload);
    return data.data;
  },
};
