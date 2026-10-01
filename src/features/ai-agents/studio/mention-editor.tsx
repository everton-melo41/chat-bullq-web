'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { registerMention, listMentions, MENTION_STYLE, MentionOption, MentionRef } from './studio.service';

interface Props {
  value: string;
  onChange: (text: string) => void;
  refs: Map<string, MentionRef>;
  options: MentionOption[];
  limit?: number;
}

/**
 * Editor de prompt com menções. Digite "@" para abrir a lista de agentes,
 * etiquetas, departamentos, etapas e ações. A menção aparece como @[Rótulo]
 * no texto e como chip colorido abaixo; vermelho = registro não existe mais.
 */
export function MentionEditor({ value, onChange, refs, options, limit = 10_000 }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    if (query == null) return [];
    const q = query.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q)).slice(0, 8);
  }, [query, options]);

  const chips = useMemo(() => listMentions(value, refs, options), [value, refs, options]);

  const detect = () => {
    const el = ref.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart);
    const m = before.match(/@([^\s@[\]]{0,30})$/);
    setQuery(m ? m[1] : null);
    setActive(0);
  };

  const insert = (opt: MentionOption) => {
    const el = ref.current;
    if (!el) return;
    const pos = el.selectionStart;
    const before = el.value.slice(0, pos).replace(/@([^\s@[\]]{0,30})$/, '');
    const after = el.value.slice(pos);
    const display = registerMention(opt.label, opt, refs);
    const token = `@[${display}] `;
    onChange(before + token + after);
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const caret = before.length + token.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (query == null || !matches.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % matches.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + matches.length) % matches.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insert(matches[active]); }
    else if (e.key === 'Escape') { setQuery(null); }
  };

  const over = value.length > limit;
  const invalid = chips.filter(c => !c.valid);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative flex-1">
        <textarea
          ref={ref}
          value={value}
          onChange={e => { onChange(e.target.value); requestAnimationFrame(detect); }}
          onKeyUp={e => { if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(e.key)) detect(); }}
          onClick={detect}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setQuery(null), 150)}
          spellCheck={false}
          placeholder={'Descreva como o agente deve atender.\n\nDigite @ para citar outro agente, uma etiqueta, um departamento, uma etapa do funil ou uma ação (resumo, salvar dados do lead, transferir para humano...).'}
          className="h-full min-h-[360px] w-full placeholder:text-zinc-500 dark:placeholder:text-zinc-400 resize-none rounded-lg border border-zinc-300 bg-white p-4 text-[15px] leading-7 text-zinc-900 outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        {query != null && matches.length > 0 && (
          <div className="absolute bottom-4 left-4 z-20 w-80 overflow-hidden rounded-lg border border-zinc-300 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <p className="border-b border-zinc-100 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 dark:border-zinc-700">Mencionar</p>
            {matches.map((o, i) => (
              <button
                key={`${o.type}:${o.id}`}
                type="button"
                onMouseDown={e => { e.preventDefault(); insert(o); }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${i === active ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
              >
                <span className="truncate text-zinc-800 dark:text-zinc-100">{o.label}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${MENTION_STYLE[o.type].chip}`}>{o.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {chips.length === 0 && <span className="text-xs text-zinc-600 dark:text-zinc-400">Nenhuma menção. Digite @ no texto para citar agentes, etiquetas ou ações.</span>}
        {chips.map(c => (
          <span
            key={c.label}
            title={c.valid ? MENTION_STYLE[c.type!].name : 'Menção inválida: o registro não existe mais. Refaça a menção.'}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ${c.valid ? MENTION_STYLE[c.type!].chip : 'bg-red-100 text-red-700 ring-1 ring-red-300 dark:bg-red-900/40 dark:text-red-200'}`}
          >
            {!c.valid && <AlertTriangle className="h-3 w-3" />}@{c.label}
          </span>
        ))}
        <span className={`ml-auto text-xs ${over ? 'font-medium text-red-600' : 'text-zinc-400'}`}>
          {value.length.toLocaleString('pt-BR')} / {limit.toLocaleString('pt-BR')} caracteres · {chips.length} menções
        </span>
      </div>
      {invalid.length > 0 && (
        <p className="text-xs text-red-600">
          {invalid.length === 1 ? 'Há 1 menção inválida' : `Há ${invalid.length} menções inválidas`}. Você pode salvar o rascunho, mas não publicar até corrigir.
        </p>
      )}
    </div>
  );
}
