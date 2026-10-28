import { supabase } from './supabase';
import { normalizeTemplate, type OrderKind, type OrderTemplate } from './templates';

export type TemplateSet = Record<OrderKind, OrderTemplate> & { saved: Record<OrderKind, boolean> };

export async function loadTemplates(): Promise<TemplateSet> {
  const { data, error } = await supabase.from('order_templates').select('kind, content');
  if (error) throw error;
  const rows = (data ?? []) as { kind: OrderKind; content: unknown }[];
  const get = (k: OrderKind) => rows.find((r) => r.kind === k);
  return {
    work_order: normalizeTemplate('work_order', get('work_order')?.content),
    material_order: normalizeTemplate('material_order', get('material_order')?.content),
    saved: { work_order: !!get('work_order'), material_order: !!get('material_order') },
  };
}

export async function saveTemplate(kind: OrderKind, tpl: OrderTemplate) {
  const { error } = await supabase
    .from('order_templates')
    .upsert({ kind, name: kind === 'work_order' ? 'Work order' : 'Material order', content: tpl }, { onConflict: 'kind' });
  if (error) throw error;
}
