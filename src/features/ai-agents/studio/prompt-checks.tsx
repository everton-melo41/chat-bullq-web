'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, BookOpenText, ChevronDown, ChevronRight, Lightbulb } from 'lucide-react';
import { listMentions, MENTION_STYLE, MentionOption, MentionRef, MentionType } from './studio.service';

const GLOSSARY: { type: MentionType; title: string; explain: string }[] = [
  { type: 'agent', title: 'Agentes', explain: 'Passa a conversa para outro agente (de qualquer matéria). Ex.: “se relatar doença, passe para @Análise de saúde”.' },
  { type: 'media', title: 'Mídias', explain: 'Envia um vídeo, imagem, áudio ou documento da biblioteca. Ex.: “se o lead pedir a lista, envie @Lista de documentos BPC”.' },
  { type: 'action', title: 'Ações', explain: 'Resumo em nota interna, salvar dados do lead no cadastro, desativar a IA, transferir para humano.' },
  { type: 'tag', title: 'Etiquetas', explain: 'Marca a conversa. Ex.: “quando faltar documento, aplique @Aguardando documentos”.' },
  { type: 'stage', title: 'Etapas do funil', explain: 'Move a conversa no funil. Ex.: “lead qualificado: mova para @Qualificado”.' },
  { type: 'department', title: 'Departamentos', explain: 'Encaminha para a equipe de um departamento do mesmo número.' },
];

interface Issue { level: 'error' | 'tip'; text: string }

export function PromptChecks({ text, refs, options, limit, onInsert }: {
  text: string; refs: Map<string, MentionRef>; options: MentionOption[]; limit: number; onInsert: (o: MentionOption) => void;
}) {
  const [glossaryOpen, setGlossaryOpen] = useState(false);

  const issues = useMemo<Issue[]>(() => {
    const chips = listMentions(text, refs, options);
    const out: Issue[] = [];
    const byLabel = (type: MentionType) => chips.filter(c => c.valid && c.type === type);
    const actionIds = new Set(chips.filter(c => c.valid && c.type === 'action').map(c => (refs.get(c.label) ?? options.find(o => o.label === c.label))?.id));

    const invalid = chips.filter(c => !c.valid);
    if (invalid.length) out.push({ level: 'error', text: `Menção inválida: ${invalid.map(c => '@' + c.label).join(', ')}. O registro não existe mais; refaça a menção digitando @.` });
    const unpublished = byLabel('agent').filter(c => {
      const ref = refs.get(c.label) ?? options.find(o => o.label === c.label);
      return options.find(o => o.type === 'agent' && o.id === ref?.id)?.hint.includes('não publicado');
    });
    if (unpublished.length) out.push({ level: 'error', text: `${unpublished.map(c => '@' + c.label).join(', ')} ainda não foi publicado. A conversa só pode ser passada para agentes publicados.` });
    if (text.trim().length < 80) out.push({ level: 'error', text: 'O prompt está curto demais para orientar o atendimento. Diga quem é o agente, o objetivo, o que perguntar e quando passar adiante.' });
    if (text.length > limit) out.push({ level: 'error', text: `O prompt passou do limite de ${limit.toLocaleString('pt-BR')} caracteres.` });

    if (byLabel('agent').length && !actionIds.has('summary')) out.push({ level: 'tip', text: 'Você passa a conversa para outro agente. Peça um @resumo antes, para a equipe ver o histórico.' });
    if (!actionIds.has('human') && !actionIds.has('disableai')) out.push({ level: 'tip', text: 'Não há saída para humano. Inclua quando usar @transferir para humano (ex.: pedido do lead, assunto fora do escopo, irritação).' });
    if (!actionIds.has('savedata')) out.push({ level: 'tip', text: 'Use @salvar dados do lead para guardar nome, CPF e cidade que o lead informar; evita perguntar de novo depois.' });
    if (text.length > 6000) out.push({ level: 'tip', text: 'Prompt longo gasta mais tokens a cada mensagem. Considere mover listas e textos de consulta para a Base de conhecimento.' });
    if (!/n[ãa]o (prometa|garant)/i.test(text)) out.push({ level: 'tip', text: 'Lembre o agente de não prometer resultado nem garantir benefício (regra de ética da OAB).' });
    return out;
  }, [text, refs, options, limit]);

  const errors = issues.filter(i => i.level === 'error');
  const tips = issues.filter(i => i.level === 'tip');

  return (
    <div className="space-y-3 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Verificação do prompt</h3>
      {errors.length === 0 && tips.length === 0 && <p className="text-sm text-emerald-800 dark:text-emerald-300">Nada a corrigir.</p>}
      {errors.map((i, k) => (
        <p key={'e' + k} className="flex gap-2 rounded-md bg-red-50 p-2.5 text-sm text-red-900 dark:bg-red-950 dark:text-red-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{i.text}</p>
      ))}
      {tips.map((i, k) => (
        <p key={'t' + k} className="flex gap-2 rounded-md bg-amber-50 p-2.5 text-sm text-amber-950 dark:bg-amber-950/60 dark:text-amber-100"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />{i.text}</p>
      ))}

      <div className="border-t border-zinc-300 pt-3 dark:border-zinc-700">
        <button type="button" onClick={() => setGlossaryOpen(o => !o)} aria-expanded={glossaryOpen}
          className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {glossaryOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}<BookOpenText className="h-4 w-4" /> Glossário de menções
        </button>
        {glossaryOpen && (
          <div className="mt-3 space-y-4">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">Clique para inserir no fim do prompt. No texto, digite @ para inserir onde estiver o cursor.</p>
            {GLOSSARY.map(g => {
              const items = options.filter(o => o.type === g.type);
              return (
                <div key={g.type}>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{g.title}</p>
                  <p className="mb-1.5 text-sm text-zinc-700 dark:text-zinc-300">{g.explain}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.length === 0 && <span className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum cadastrado ainda.</span>}
                    {items.map(o => (
                      <button key={o.id} type="button" onClick={() => onInsert(o)} title={o.hint}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium hover:ring-2 hover:ring-primary/40 ${MENTION_STYLE[o.type].chip}`}>@{o.label}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
