import type { WhatsAppTemplate } from '@/features/channels/services/channels.service';
export function templateVarCount(template: WhatsAppTemplate | undefined): number {
  const text = template?.components.find(c => c.type === 'BODY')?.text as string | undefined;
  const positions = [...(text ?? '').matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]));
  return positions.length ? Math.max(...positions) : 0;
}
export function templateContent(template: WhatsAppTemplate, values: string[]) {
  return { name: template.name, language: { code: template.language }, components: values.length ? [{ type: 'body', parameters: values.map(text => ({ type: 'text', text: text.trim() })) }] : [] };
}
