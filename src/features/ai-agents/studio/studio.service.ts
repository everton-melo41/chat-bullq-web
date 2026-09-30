import { api } from '@/lib/api';

export type MentionType = 'agent' | 'tag' | 'department' | 'stage' | 'action';
export interface MentionOption { type: MentionType; id: string; label: string; hint: string }

export interface TestChatTurn { role: 'user' | 'assistant'; content: string }
export interface TestChatResult {
  agent: { id: string; name: string };
  source: 'rascunho' | 'publicado';
  reply: string;
  actions: { tool: string; description: string; args: Record<string, unknown>; simulated: boolean }[];
  handoffTo: { id: string; name: string } | null;
  invalidMentions: string[];
  ms: number;
  tokens: { input: number; output: number };
}

export const studioService = {
  async mentionOptions(): Promise<MentionOption[]> {
    const { data } = await api.get('/ai-agents/mention-options');
    return data.data ?? data;
  },
  async testChat(agentId: string, messages: TestChatTurn[], useDraft: boolean): Promise<TestChatResult> {
    const { data } = await api.post(`/ai-agents/${agentId}/test-chat`, { messages, useDraft }, { timeout: 120_000 });
    return data.data ?? data;
  },
};

/* ── Menções: o prompt guarda @[Rótulo](tipo:id); o editor mostra @[Rótulo]. ── */

const RAW_RE = /@\[([^\]\n]{1,80})\]\((agent|tag|department|stage|action):([A-Za-z0-9_-]{1,64})\)/g;
const DISPLAY_RE = /@\[([^\]\n]{1,80})\](?!\()/g;

export interface MentionRef { type: MentionType; id: string }

/** Converte o prompt salvo para o texto do editor e devolve o mapa rótulo → registro. */
export function toDisplay(raw: string): { text: string; refs: Map<string, MentionRef> } {
  const refs = new Map<string, MentionRef>();
  const text = (raw ?? '').replace(RAW_RE, (_m, label: string, type: MentionType, id: string) => {
    refs.set(label.trim(), { type, id });
    return `@[${label.trim()}]`;
  });
  return { text, refs };
}

/** Converte o texto do editor de volta para o formato salvo. */
export function toRaw(text: string, refs: Map<string, MentionRef>, options: MentionOption[]): string {
  return text.replace(DISPLAY_RE, (m, label: string) => {
    const key = label.trim();
    const ref = refs.get(key) ?? options.find(o => o.label === key);
    return ref ? `@[${key}](${ref.type}:${ref.id})` : m;
  });
}

export interface MentionChip { label: string; type: MentionType | null; valid: boolean }

/** Lista as menções do texto do editor com o estado de cada uma. */
export function listMentions(text: string, refs: Map<string, MentionRef>, options: MentionOption[]): MentionChip[] {
  const seen = new Map<string, MentionChip>();
  for (const m of text.matchAll(DISPLAY_RE)) {
    const label = m[1].trim();
    const ref = refs.get(label) ?? options.find(o => o.label === label);
    const valid = !!ref && options.some(o => o.type === ref.type && o.id === ref.id);
    seen.set(label, { label, type: ref?.type ?? null, valid });
  }
  return [...seen.values()];
}

export const MENTION_STYLE: Record<MentionType, { chip: string; name: string }> = {
  agent: { chip: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200', name: 'agente' },
  tag: { chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200', name: 'etiqueta' },
  department: { chip: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200', name: 'departamento' },
  stage: { chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200', name: 'etapa' },
  action: { chip: 'bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100', name: 'ação' },
};
