// Parses the TEXT of a roof measurement report (GAF QuickMeasure, EagleView, RoofScope, Hover-style).
// Deterministic regex code only — no AI, no guessing. A field is only filled when the report states it.
import type { Measurements } from './estimate';

export type ReportFormat = 'GAF QuickMeasure' | 'EagleView' | 'RoofScope' | 'Hover' | 'Unknown report';

export interface RawLengths {
  ridges?: number;
  hips?: number;
  valleys?: number;
  rakes?: number;
  eaves?: number;
  flashing?: number;
  stepFlashing?: number;
  parapet?: number;
  dripEdge?: number;
  starter?: number;
  ridgeCap?: number;
  leakBarrier?: number;
}

export interface PitchRow {
  pitch: number; // rise per 12
  area?: number; // sq ft
  pct?: number; // % of roof
}

export type FieldKey = keyof Measurements;

export interface ParsedReport {
  format: ReportFormat;
  /** Values found in the report, mapped to app fields. Missing = not found. */
  values: Partial<Record<FieldKey, number>>;
  /** Where each found value came from (human readable). */
  notes: Partial<Record<FieldKey, string>>;
  raw: RawLengths;
  pitches: PitchRow[];
  predominantPitch?: string;
  warnings: string[];
}

export const STEEP_PITCH_DEFAULT = 8; // 8/12 and steeper counts as steep (editable on the review screen)

const NUM = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
const SEP = String.raw`[\s:=\-–|]*`;
const PAREN = String.raw`(?:\s*\([^)]{0,40}\))?`;

const toNum = (s: string) => Number(s.replace(/,/g, ''));

export function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[’′]/g, "'")
    .replace(/[”″]/g, '"')
    .replace(/[ \t]+/g, ' ');
}

export function detectFormat(text: string): ReportFormat {
  const t = text.toLowerCase();
  if (/quick\s*measure/.test(t) || /\bgaf\b/.test(t)) return 'GAF QuickMeasure';
  if (/eagle\s*view/.test(t)) return 'EagleView';
  if (/roof\s*scope/.test(t)) return 'RoofScope';
  if (/\bhover\b/.test(t)) return 'Hover';
  return 'Unknown report';
}

interface Hit { value: number; unit: string; text: string }

/**
 * Find "<label> <number> <unit?>" occurrences. The number must come right after the label
 * (only separators/whitespace or one short parenthetical between), so "Drip Edge (Eaves + Rakes) 355"
 * never counts as an Eaves value.
 */
function findLabeled(text: string, label: string, opts: { notBefore?: RegExp; notAfter?: string } = {}): Hit[] {
  // No lookbehind (older iOS Safari can't compile it) — preceding text is checked by hand below.
  const post = opts.notAfter ? `(?!${opts.notAfter})` : '';
  const re = new RegExp(
    String.raw`\b(?:${label})${post}${PAREN}${SEP}${NUM}\s*(?:'\s*(\d{1,2})\s*"?)?\s*(sq\.?\s*ft|sqft|ft²|sf|squares|sq|lf|ft|feet|'|%)?`,
    'gi',
  );
  const out: Hit[] = [];
  for (const m of text.matchAll(re)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 12), m.index ?? 0);
    if (/(?:\+|&|\/)\s*$/.test(before)) continue; // "Hips + Ridges 115" is a combined figure, not ridges
    if (opts.notBefore && opts.notBefore.test(before)) continue;
    let value = toNum(m[1]);
    const inches = m[2] ? Number(m[2]) : 0;
    let unit = (m[3] || '').toLowerCase().replace(/\s|\./g, '');
    if (m[2] !== undefined) {
      value = Math.round((value + inches / 12) * 100) / 100; // 115' 4" -> 115.33 ft
      unit = 'ft';
    }
    if (unit === "'" || unit === 'feet') unit = 'ft';
    out.push({ value, unit, text: m[0].trim() });
  }
  return out;
}

function firstLength(text: string, label: string, opts?: { notBefore?: RegExp; notAfter?: string }, warnings?: string[], name?: string) {
  const hits = findLabeled(text, label, opts).filter((h) => h.unit === '' || h.unit === 'ft' || h.unit === 'lf');
  if (!hits.length) return undefined;
  const distinct = [...new Set(hits.map((h) => h.value))];
  if (distinct.length > 1 && warnings && name)
    warnings.push(`${name}: the report lists more than one value (${distinct.join(', ')}). Used the first one — please check.`);
  return hits[0];
}

const LABELS = {
  ridges: { label: String.raw`ridges?|total\s+ridges?`, notAfter: String.raw`\s*(?:cap|vent|\/)` },
  hips: { label: String.raw`hips?|total\s+hips?`, notAfter: String.raw`\s*(?:and|&|\/|cap)` },
  valleys: { label: String.raw`valleys?|total\s+valleys?` },
  rakes: { label: String.raw`rakes?|gables?|rake\s+edges?|total\s+rakes?` },
  eaves: { label: String.raw`eaves?(?:\s*\/\s*starter)?|eave\s+edges?|total\s+eaves?` },
  stepFlashing: { label: String.raw`step\s*flashing` },
  flashing: { label: String.raw`(?:wall\s+|apron\s+|counter\s+)?flashing`, notBefore: /step\s*$/i },
  parapet: { label: String.raw`parapets?(?:\s+walls?)?` },
  dripEdge: { label: String.raw`drip\s*edge` },
  starter: { label: String.raw`(?:eaves?\s*\/\s*)?starter(?:\s+(?:strip|course|shingles?))?` },
  ridgeCap: { label: String.raw`(?:hip\s*(?:&|and|\/)\s*)?ridge\s*cap` },
  leakBarrier: { label: String.raw`leak\s*barrier|ice\s*(?:&|and)\s*water(?:\s*shield)?` },
} as const;

export function parsePitches(text: string): PitchRow[] {
  // Layout A (columns): "Roof Pitches 4/12 9/12" ... "Area (sq ft) 288 2331" ... "% of Roof 11% 89%"
  const colRe = /(?:roof\s+)?pitch(?:es)?\s*[:|]?\s*((?:\d{1,2}\s*\/\s*12[\s|,]*){1,12})/gi;
  for (const cm of text.matchAll(colRe)) {
    const before = text.slice(Math.max(0, (cm.index ?? 0) - 14), cm.index ?? 0);
    if (/predominant\s*$|primary\s*$|average\s*$/i.test(before)) continue;
    const pitches = [...cm[1].matchAll(/(\d{1,2})\s*\/\s*12/g)].map((m) => Number(m[1]));
    const after = text.slice((cm.index ?? 0) + cm[0].length, (cm.index ?? 0) + cm[0].length + 400);
    const rows: PitchRow[] = pitches.map((p) => ({ pitch: p }));
    const areaM = after.match(new RegExp(String.raw`^[^]*?\barea\s*(?:\((?:sq\.?\s*ft|sqft|sf)\))?\s*[:|]?\s*((?:${NUM}[\s|,]*(?:sq\.?\s*ft)?[\s|]*){${pitches.length}})`, 'i'));
    if (areaM) {
      const nums = [...areaM[1].matchAll(new RegExp(NUM, 'g'))].map((m) => toNum(m[1]));
      if (nums.length >= pitches.length) nums.slice(0, pitches.length).forEach((n, i) => (rows[i].area = n));
    }
    const pctM = after.match(new RegExp(String.raw`%\s*of\s*(?:roof|squares|total)\s*[:|]?\s*((?:${NUM}\s*%?[\s|,]*){${pitches.length}})`, 'i'));
    if (pctM) {
      const nums = [...pctM[1].matchAll(new RegExp(NUM, 'g'))].map((m) => toNum(m[1]));
      if (nums.length >= pitches.length) nums.slice(0, pitches.length).forEach((n, i) => (rows[i].pct = n));
    }
    if (rows.some((r) => r.area !== undefined || r.pct !== undefined)) return rows;
  }
  // Layout B (rows): "9/12  2,331 sq ft  89%" one per line
  const rows: PitchRow[] = [];
  for (const m of text.matchAll(new RegExp(String.raw`(?:^|\n)\s*(?:pitch\s*)?(\d{1,2})\s*\/\s*12\s*[:|\-]?\s*${NUM}\s*(?:sq\.?\s*ft|sqft|sf)\s*(?:[|,(]?\s*${NUM}\s*%)?`, 'gi'))) {
    rows.push({ pitch: Number(m[1]), area: toNum(m[2]), pct: m[3] !== undefined ? toNum(m[3]) : undefined });
  }
  return rows;
}

export function steepShareFromPitches(rows: PitchRow[], steepFrom = STEEP_PITCH_DEFAULT): number | undefined {
  if (!rows.length) return undefined;
  if (rows.every((r) => r.area !== undefined)) {
    const total = rows.reduce((s, r) => s + (r.area ?? 0), 0);
    if (total <= 0) return undefined;
    const steep = rows.filter((r) => r.pitch >= steepFrom).reduce((s, r) => s + (r.area ?? 0), 0);
    return Math.round((steep / total) * 1000) / 10;
  }
  if (rows.every((r) => r.pct !== undefined)) {
    const total = rows.reduce((s, r) => s + (r.pct ?? 0), 0);
    if (total <= 0) return undefined;
    const steep = rows.filter((r) => r.pitch >= steepFrom).reduce((s, r) => s + (r.pct ?? 0), 0);
    return Math.round((steep / total) * 1000) / 10;
  }
  return undefined;
}

export function parseReport(input: string, steepFrom = STEEP_PITCH_DEFAULT): ParsedReport {
  const text = normalizeText(input);
  const warnings: string[] = [];
  const values: ParsedReport['values'] = {};
  const notes: ParsedReport['notes'] = {};
  const raw: RawLengths = {};

  // ---- Area ----
  const areaLabel = String.raw`total\s+(?:roof\s+)?area|roof\s+area|total\s+sq(?:uare)?\s*f(?:ee|oo)?t(?:age)?`;
  const areaHits = findLabeled(text, areaLabel);
  const sqft = areaHits.find((h) => ['sqft', 'ft²', 'sf', ''].includes(h.unit) && h.value > 50);
  if (sqft) {
    values.area = sqft.value;
    notes.area = `“${sqft.text}”`;
    const others = [...new Set(areaHits.filter((h) => h.unit !== 'squares' && h.unit !== '%' && h.value > 50).map((h) => h.value))];
    if (others.length > 1) warnings.push(`Roof area: the report lists more than one area (${others.join(', ')}). Used the first one — check for multiple structures.`);
  } else {
    const sqHits = findLabeled(text, String.raw`total\s+squares|squares|total\s+(?:roof\s+)?area`).filter((h) => h.unit === 'squares' || h.unit === '' || h.unit === 'sq');
    const sq = sqHits.find((h) => h.value > 0 && h.value < 1000);
    if (sq) {
      values.area = Math.round(sq.value * 100 * 100) / 100;
      notes.area = `“${sq.text}” × 100 sq ft per square`;
      warnings.push('Roof area was given in squares only, converted at 100 sq ft per square. Check the report did not already include waste.');
    }
  }

  // ---- Waste ----
  const waste = text.match(new RegExp(String.raw`(?:suggested|recommended)\s+waste(?:\s+(?:factor|percentage|%))?\s*[:=\-]?\s*${NUM}\s*%`, 'i'))
    ?? text.match(new RegExp(String.raw`waste\s*\((?:suggested|recommended)\)\s*[:=\-]?\s*${NUM}\s*%`, 'i'));
  if (waste) {
    values.waste = toNum(waste[1]);
    notes.waste = `“${waste[0].trim()}”`;
  }

  // ---- Lengths ----
  for (const [k, def] of Object.entries(LABELS) as [keyof RawLengths, { label: string; notBefore?: RegExp; notAfter?: string }][]) {
    const hit = firstLength(text, def.label, { notBefore: def.notBefore, notAfter: def.notAfter }, warnings, k);
    if (hit) raw[k] = hit.value;
  }
  // Leak barrier stated in area units is NOT a length — don't map it.
  const lbArea = findLabeled(text, LABELS.leakBarrier.label).find((h) => ['sqft', 'sf', 'ft²', 'squares', 'sq'].includes(h.unit));
  if (lbArea && raw.leakBarrier === undefined)
    warnings.push(`Leak barrier is listed as an area (“${lbArea.text}”), not a length — enter leak barrier LF by hand.`);

  const map: [FieldKey, keyof RawLengths, string][] = [
    ['starter', 'starter', 'Starter'],
    ['ridgeCap', 'ridgeCap', 'Ridge cap'],
    ['leakBarrierLF', 'leakBarrier', 'Leak barrier'],
    ['stepFlashing', 'stepFlashing', 'Step flashing'],
    ['flashing', 'flashing', 'Flashing'],
    ['valley', 'valleys', 'Valleys'],
    ['dripEdge', 'dripEdge', 'Drip edge'],
  ];
  for (const [field, key, label] of map) {
    if (raw[key] !== undefined) {
      values[field] = raw[key];
      notes[field] = `${label} in report: ${raw[key]} ft`;
    }
  }

  // ---- Pitch ----
  const pitches = parsePitches(text);
  const share = steepShareFromPitches(pitches, steepFrom);
  if (share !== undefined) {
    values.steepShare = share;
    notes.steepShare = `From pitch table: ${steepFrom}/12 and steeper`;
  }
  const pp = text.match(/predominant\s+pitch\s*[:=-]?\s*(\d{1,2}\s*\/\s*12)/i);
  const predominantPitch = pp ? pp[1].replace(/\s/g, '') : undefined;
  if (share === undefined && predominantPitch)
    warnings.push(`Only a predominant pitch (${predominantPitch}) was found, no pitch breakdown — steep share left empty.`);

  return { format: detectFormat(text), values, notes, raw, pitches, predominantPitch, warnings };
}

/** Optional helpers the user can tap on the review screen — never applied automatically. */
export function sumHints(raw: RawLengths): { field: FieldKey; label: string; value: number }[] {
  const h: { field: FieldKey; label: string; value: number }[] = [];
  const add = (field: FieldKey, label: string, a?: number, b?: number) => {
    if (a !== undefined && b !== undefined) h.push({ field, label, value: Math.round((a + b) * 100) / 100 });
  };
  add('starter', 'eaves + rakes', raw.eaves, raw.rakes);
  add('dripEdge', 'eaves + rakes', raw.eaves, raw.rakes);
  add('ridgeCap', 'hips + ridges', raw.hips, raw.ridges);
  add('leakBarrierLF', 'eaves + valleys', raw.eaves, raw.valleys);
  return h;
}
