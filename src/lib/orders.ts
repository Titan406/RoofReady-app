import { MISSING_NOTE, PLACEHOLDER_TAG, missingBanner, type Line, REPORT_LENGTH_FIELDS, ROOF_TYPES, computeTotals, lineMissing, lineQty, lineTotal, roofTypeLabel, roofTypeOf, type EstimateData } from './estimate';
import { money } from './stages';
import { companyLines, defaultTemplate, fillPlaceholders, formatDate, shortId, type FillValues, type OrderTemplate } from './templates';

export interface OrderContext {
  address: string;
  customerName?: string;
  customerPhone?: string;
  revision?: number;
  status?: string;
  jobId?: string;
  date?: Date | string; // defaults to today
  deliveryDate?: string; // YYYY-MM-DD or free text
}

export function fillValues(ctx: OrderContext, tpl: OrderTemplate): FillValues {
  const dd = (ctx.deliveryDate || '').trim();
  return {
    job_address: ctx.address || '',
    customer_name: ctx.customerName || '',
    customer_phone: ctx.customerPhone || '',
    date: formatDate(ctx.date ?? new Date()),
    job_id_short: shortId(ctx.jobId),
    delivery_date: /^\d{4}-\d{2}-\d{2}$/.test(dd) ? formatDate(dd) : dd,
    company_name: tpl.company.name,
  };
}

/** Wraps generated item lines with the template's header, intro, notes, signature and footer. */
function wrap(tpl: OrderTemplate, ctx: OrderContext, body: string[]): string {
  const v = fillValues(ctx, tpl);
  const f = (t: string) => fillPlaceholders(t, v);
  const out: string[] = [];
  const head = companyLines(tpl.company);
  if (head.length) out.push(...head, '');
  if (tpl.title.trim()) out.push(f(tpl.title).trim());
  if (tpl.intro.trim()) out.push(f(tpl.intro));
  out.push('', ...body);
  for (const part of [tpl.notes, tpl.signature, tpl.footer]) if (part.trim()) out.push('', f(part));
  return out.join('\n');
}

const nm = (l: Line) => (l.placeholder ? `${l.name} (${PLACEHOLDER_TAG})` : l.name);
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export function workOrderText(e: EstimateData, ctx: OrderContext, includePrices: boolean, tpl: OrderTemplate = defaultTemplate('work_order')): string {
  const t = computeTotals(e);
  const m = e.measurements;
  const lines: string[] = [];
  if (ctx.revision) lines.push(`Estimate: revision ${ctx.revision}${ctx.status ? ' (' + ctx.status + ')' : ''}`, '');
  const rt = roofTypeOf(e);
  lines.push(`ROOF TYPE: ${roofTypeLabel(rt)}`);
  const rtNote = ROOF_TYPES.find((x) => x.id === rt)?.note;
  if (rtNote) lines.push(`NOTE: ${rtNote}`);
  if (t.missingCount) lines.push(missingBanner(t.missingCount));
  lines.push('');
  lines.push('ROOF');
  lines.push(`- ${t.drivers.squares} squares (area ${m.area} sq ft + ${m.waste}% waste)`);
  lines.push(`- Steep pitch share: ${m.steepShare}% (${t.drivers.steepSquares} SQ)`);
  lines.push(
    `- Starter ${m.starter} LF · Ridge cap ${m.ridgeCap} LF · Drip edge ${m.dripEdge} LF · Valley ${m.valley} LF${m.noValleys ? ' (no valleys)' : ''}`,
  );
  lines.push(
    `- Leak barrier ${m.leakBarrierLF} LF @ ${m.leakBarrierWidth} ft · Step flashing ${m.stepFlashing} LF · Flashing ${m.flashing} LF`,
  );
  if (rt !== 'asphalt_shingle')
    lines.push('- ' + REPORT_LENGTH_FIELDS.map((f) => `${f.label.replace(' (report)', '')} ${m[f.key] ?? 'MISSING'}${m[f.key] !== undefined ? ' LF' : ''}`).join(' · '));
  if (e.measurementSource) lines.push(`- Measurements from: ${e.measurementSource}`);
  lines.push('');
  lines.push('SCOPE OF WORK');
  for (const l of e.labor) {
    const q = lineQty(l, t.drivers);
    if (q === 0) continue;
    lines.push(
      `- ${nm(l)}: ${fmtQty(q)} ${l.unit}` + (includePrices ? ` @ ${money(l.price)} = ${money(lineTotal(l, t.drivers))}` : ''),
    );
  }
  if (includePrices) lines.push(`Labor total: ${money(t.laborTotal)}`);
  lines.push('');
  lines.push('MATERIALS ON SITE');
  for (const l of e.materials) {
    const q = lineQty(l, t.drivers);
    if (lineMissing(l, t.drivers)) { lines.push(`- ${nm(l)}: ?? ${l.unit} — ${MISSING_NOTE}`); continue; }
    if (q === 0) continue;
    lines.push(`- ${nm(l)}: ${fmtQty(q)} ${l.unit}`);
  }
  return wrap(tpl, ctx, lines);
}

export function materialOrderText(e: EstimateData, ctx: OrderContext, includePrices: boolean, tpl: OrderTemplate = defaultTemplate('material_order')): string {
  const t = computeTotals(e);
  const lines: string[] = [];
  lines.push(`ROOF TYPE: ${roofTypeLabel(roofTypeOf(e))}`);
  if (t.missingCount) lines.push(missingBanner(t.missingCount));
  lines.push('');
  lines.push('ITEMS');
  for (const l of e.materials) {
    const q = lineQty(l, t.drivers);
    if (lineMissing(l, t.drivers)) { lines.push(`- ?? ${l.unit} — ${nm(l)} — ${MISSING_NOTE}`); continue; }
    if (q === 0) continue;
    lines.push(
      `- ${fmtQty(q)} ${l.unit} — ${nm(l)}` + (includePrices ? ` @ ${money(l.price)} = ${money(lineTotal(l, t.drivers))}` : ''),
    );
  }
  if (includePrices) {
    lines.push('');
    lines.push(`Materials subtotal: ${money(t.materialSubtotal)}`);
    if (t.tax) lines.push(`Tax: ${money(t.tax)}`);
    lines.push(`Materials total: ${money(t.materialTotal)}`);
  }
  return wrap(tpl, ctx, lines);
}

export function mailtoLink(subject: string, body: string, to = ''): string {
  const addr = to.split(',').map((a) => encodeURIComponent(a.trim()).replace(/%40/g, '@')).filter(Boolean).join(',');
  return `mailto:${addr}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
