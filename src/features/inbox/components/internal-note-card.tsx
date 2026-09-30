 'use client';
import { Lock, Trash2 } from 'lucide-react';
import type { InternalNote } from '../services/inbox.service';
export function InternalNoteCard({ note, userId, onDelete }: { note: InternalNote; userId?: string; onDelete: (id: string) => void }) {
  return <article className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
    <div className="flex items-center gap-2 text-xs"><Lock className="h-3 w-3" /><strong>{note.author?.name ?? 'Membro da equipe'}</strong>
      <time className="ml-auto" dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString('pt-BR')}</time>
      {note.authorId === userId && <button type="button" aria-label="Excluir minha nota" onClick={() => onDelete(note.id)}><Trash2 className="h-3 w-3" /></button>}
    </div><p className="mt-2 whitespace-pre-wrap break-words">{note.content}</p><p className="mt-1 text-[10px]">Nota interna · visível só para a equipe</p>
  </article>;
}
