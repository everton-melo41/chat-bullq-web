 'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { departmentsService, type Department } from '@/features/departments/services/departments.service';
import { channelsService } from '@/features/channels/services/channels.service';

export default function DepartmentsPage() {
  const queryClient = useQueryClient();
  const { data: departments = [], isError } = useQuery({ queryKey: ['departments'], queryFn: departmentsService.list });
  const { data: channels = [] } = useQuery({ queryKey: ['channels'], queryFn: channelsService.list });
  const [editing, setEditing] = useState<Department | null>(null);
  const [name, setName] = useState('');
  const [channelId, setChannelId] = useState('');
  const [saving, setSaving] = useState(false);
  const reset = () => { setEditing(null); setName(''); setChannelId(''); };
  return <div className="space-y-5">
    <h2 className="text-lg font-semibold">Departamentos por número</h2>
    <p className="text-sm text-zinc-500">Cada número tem seus departamentos. Departamentos gerais podem atender qualquer canal da organização.</p>
    <form className="space-y-3 rounded-xl border p-4" onSubmit={async e => {
      e.preventDefault(); setSaving(true);
      try { await departmentsService.save({ name: name.trim(), channelId: channelId || null }, editing?.id);
        await queryClient.invalidateQueries({ queryKey: ['departments'] }); reset(); toast.success('Departamento salvo');
      } catch { toast.error('Não foi possível salvar. Verifique suas permissões e o canal.'); } finally { setSaving(false); }
    }}>
      <h3>{editing ? 'Editar departamento' : 'Novo departamento'}</h3>
      <label className="block text-sm">Nome<input required value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full rounded border bg-transparent p-2" /></label>
      <label className="block text-sm">Número / canal<select value={channelId} onChange={e => setChannelId(e.target.value)} className="mt-1 block w-full rounded border bg-background p-2">
        <option value="">Geral da organização</option>{channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
      <button disabled={saving || !name.trim()} className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{saving ? 'Salvando…' : 'Salvar'}</button>
      {editing && <button type="button" className="ml-3" onClick={reset}>Cancelar</button>}
    </form>
    {isError && <p role="alert">Não foi possível carregar os departamentos.</p>}
    {departments.map(d => <div key={d.id} className="flex items-center justify-between rounded border p-3">
      <div><strong>{d.name}</strong><p className="text-sm text-zinc-500">{d.channelId ? channels.find(c => c.id === d.channelId)?.name ?? 'Canal vinculado' : 'Geral'}</p></div>
      <button className="text-primary" onClick={() => { setEditing(d); setName(d.name); setChannelId(d.channelId ?? ''); }}>Editar</button>
    </div>)}
  </div>;
}
