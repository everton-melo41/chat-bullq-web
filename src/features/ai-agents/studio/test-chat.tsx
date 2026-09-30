'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, FlaskConical, Loader2, RotateCcw, Send, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { studioService, TestChatResult, TestChatTurn } from './studio.service';

type Entry =
  | { kind: 'user'; text: string }
  | { kind: 'agent'; agentName: string; result: TestChatResult }
  | { kind: 'handoff'; to: string };

/**
 * Conversa de teste com o agente. As ações que o agente tomaria aparecem
 * como cartões "simulado": nada é gravado e nenhuma mensagem sai para cliente.
 * Quando o agente passa a conversa adiante, o teste continua no agente citado.
 */
export function TestChat({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [useDraft, setUseDraft] = useState(true);
  const [current, setCurrent] = useState({ id: agentId, name: agentName });
  const [history, setHistory] = useState<TestChatTurn[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const reset = () => { setCurrent({ id: agentId, name: agentName }); setHistory([]); setEntries([]); };
  useEffect(reset, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [entries, busy]);

  const ask = async (target: { id: string; name: string }, turns: TestChatTurn[], hops = 0): Promise<void> => {
    const result = await studioService.testChat(target.id, turns, useDraft);
    setEntries(e => [...e, { kind: 'agent', agentName: result.agent.name, result }]);
    let next = turns;
    if (result.reply) { next = [...turns, { role: 'assistant', content: result.reply }]; setHistory(next); }
    if (result.handoffTo && hops < 3) {
      setEntries(e => [...e, { kind: 'handoff', to: result.handoffTo!.name }]);
      setCurrent(result.handoffTo);
      await ask(result.handoffTo, next, hops + 1);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const turns: TestChatTurn[] = [...history, { role: 'user', content: text }];
    setHistory(turns); setInput(''); setEntries(e => [...e, { kind: 'user', text }]);
    setBusy(true);
    try { await ask(current, turns); }
    catch (err: any) { toast.error(err?.response?.data?.message ?? 'Não foi possível testar agora. Tente novamente.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-100"><FlaskConical className="h-4 w-4" /> Chat de teste</div>
        <div className="flex items-center gap-2">
          <select value={useDraft ? 'draft' : 'pub'} onChange={e => { setUseDraft(e.target.value === 'draft'); reset(); }}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900">
            <option value="draft">Rascunho</option>
            <option value="pub">Publicado</option>
          </select>
          <button type="button" onClick={reset} title="Reiniciar conversa" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><RotateCcw className="h-4 w-4" /></button>
        </div>
      </div>
      <p className="border-b border-zinc-100 px-4 py-1.5 text-[11px] text-zinc-500 dark:border-zinc-800">Falando com <strong>{current.name}</strong>. Ações são simuladas; nada é gravado nem enviado.</p>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {entries.length === 0 && <p className="mt-8 text-center text-sm text-zinc-400">Escreva como se fosse o lead para ver como o agente responde.</p>}
        {entries.map((e, i) => {
          if (e.kind === 'user') return <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">{e.text}</div>;
          if (e.kind === 'handoff') return <div key={i} className="flex items-center justify-center gap-1 text-xs text-violet-600"><ArrowRightLeft className="h-3 w-3" /> passou para {e.to}</div>;
          const r = e.result;
          return (
            <div key={i} className="max-w-[90%] space-y-2">
              {r.reply && <div className="rounded-2xl rounded-bl-sm bg-zinc-100 px-3 py-2 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">{r.reply}</div>}
              {r.actions.map((a, j) => (
                <div key={j} className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs dark:border-amber-700 dark:bg-amber-950/40">
                  <div className="flex items-center gap-1 font-medium text-amber-800 dark:text-amber-200"><Zap className="h-3 w-3" /> {a.tool} <span className="font-normal text-amber-600">· simulado</span></div>
                  {Object.keys(a.args ?? {}).length > 0 && <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-amber-900 dark:text-amber-100">{Object.entries(a.args).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n')}</pre>}
                </div>
              ))}
              <p className="text-[11px] text-zinc-400">{r.agent.name} · {(r.ms / 1000).toFixed(1)}s · {r.tokens.input + r.tokens.output} tokens{r.invalidMentions.length ? ` · menções inválidas: ${r.invalidMentions.join(', ')}` : ''}</p>
            </div>
          );
        })}
        {busy && <div className="flex items-center gap-2 text-xs text-zinc-400"><Loader2 className="h-3 w-3 animate-spin" /> {current.name} está respondendo…</div>}
        <div ref={endRef} />
      </div>

      <form onSubmit={e => { e.preventDefault(); void send(); }} className="flex gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Mensagem do lead…" disabled={busy}
          className="flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-900" />
        <button type="submit" disabled={busy || !input.trim()} className="rounded-md bg-primary px-3 text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" /></button>
      </form>
    </div>
  );
}
