// Tests use SYNTHETIC text / PDFs that imitate report wording. No real GAF/EagleView/RoofScope/Hover reports were available.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { parseReport, parsePitches, steepShareFromPitches, sumHints } from './reportParser';
import { extractPdfText, itemsToLines, MIN_TEXT_CHARS } from './pdfText';

const fx = (n: string) => new Uint8Array(readFileSync(new URL(`../../test-fixtures/${n}`, import.meta.url)));
async function pdf(n: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return extractPdfText(fx(n), pdfjs as any);
}

describe('parseReport — text', () => {
  it('never invents values: empty text gives no values', () => {
    const r = parseReport('Some unrelated document with numbers 123 and 4/12.');
    expect(r.values).toEqual({});
  });
  it('does not confuse Step Flashing with Flashing, Ridge Cap with Ridges, Drip Edge (Eaves + Rakes) with Eaves', () => {
    const r = parseReport('Step Flashing 98 ft\nRidge Cap (Hips + Ridges) 115 ft\nDrip Edge (Eaves + Rakes) 355 ft');
    expect(r.values.stepFlashing).toBe(98);
    expect(r.values.flashing).toBeUndefined();
    expect(r.values.ridgeCap).toBe(115);
    expect(r.raw.ridges).toBeUndefined();
    expect(r.raw.eaves).toBeUndefined();
    expect(r.values.dripEdge).toBe(355);
  });
  it('combined "Hips + Ridges = 115" is not read as ridges', () => {
    expect(parseReport('Hips + Ridges = 115 ft').raw.ridges).toBeUndefined();
  });
  it('feet-inches', () => {
    expect(parseReport(`Valleys: 12' 3"`).values.valley).toBe(12.25);
  });
  it('squares only -> area x100 with a warning', () => {
    const r = parseReport('Total Squares: 22.4');
    expect(r.values.area).toBe(2240);
    expect(r.warnings.join(' ')).toMatch(/squares only/);
  });
  it('only predominant pitch -> steep share left empty', () => {
    const r = parseReport('Total Area: 2,000 sq ft\nPredominant Pitch: 9/12\nArea (sq ft) 2000');
    expect(r.values.steepShare).toBeUndefined();
    expect(r.warnings.join(' ')).toMatch(/predominant pitch/i);
  });
  it('pitch rows and threshold', () => {
    const rows = parsePitches('5/12 1,500 sq ft 75.8%\n12/12 480 sq ft 24.2%');
    expect(rows).toEqual([{ pitch: 5, area: 1500, pct: 75.8 }, { pitch: 12, area: 480, pct: 24.2 }]);
    expect(steepShareFromPitches(rows, 8)).toBe(24.2);
    expect(steepShareFromPitches(rows, 5)).toBe(100);
  });
  it('waste only from an explicit suggested/recommended figure', () => {
    expect(parseReport('Waste % 0% 10% 12% 15%').values.waste).toBeUndefined();
    expect(parseReport('Suggested Waste: 13%').values.waste).toBe(13);
  });
  it('hints are offered, not applied', () => {
    const r = parseReport('Eaves 210 ft\nRakes 145 ft');
    expect(r.values.starter).toBeUndefined();
    expect(sumHints(r.raw)).toContainEqual({ field: 'starter', label: 'eaves + rakes', value: 355 });
  });
});

describe('synthetic PDFs through pdf.js text extraction', () => {
  it('GAF QuickMeasure (synthetic) -> matches 83 Wedgewood numbers', async () => {
    const t = await pdf('synthetic-gaf-quickmeasure.pdf');
    const r = parseReport(t.text);
    expect(r.format).toBe('GAF QuickMeasure');
    expect(r.values).toEqual({
      area: 2619, waste: 13, steepShare: 89, starter: 355, ridgeCap: 115, leakBarrierLF: 580,
      stepFlashing: 98, flashing: 55, valley: 41, dripEdge: 355,
    });
    expect(r.values.leakBarrierWidth).toBeUndefined();
    expect(r.raw).toMatchObject({ eaves: 210, rakes: 145, ridges: 60, hips: 55 });
  });
  it('EagleView-style (synthetic)', async () => {
    const r = parseReport((await pdf('synthetic-eagleview.pdf')).text);
    expect(r.format).toBe('EagleView');
    expect(r.values).toEqual({ area: 3105, steepShare: 19.5, starter: 160, flashing: 22, stepFlashing: 40, valley: 24, dripEdge: 340 });
    expect(r.values.waste).toBeUndefined();
    expect(r.raw).toMatchObject({ ridges: 72, hips: 0, rakes: 180, eaves: 160, parapet: 0 });
    expect(r.predominantPitch).toBe('6/12');
  });
  it('RoofScope-style (synthetic): squares, LF, no pitch breakdown', async () => {
    const r = parseReport((await pdf('synthetic-roofscope.pdf')).text);
    expect(r.format).toBe('RoofScope');
    expect(r.values).toEqual({ area: 2240, valley: 18, stepFlashing: 25, flashing: 12 });
    expect(r.raw).toMatchObject({ ridges: 48, hips: 30, rakes: 120, eaves: 140 });
  });
  it('Hover-style (synthetic): feet-inches and pitch rows', async () => {
    const r = parseReport((await pdf('synthetic-hover.pdf')).text);
    expect(r.format).toBe('Hover');
    expect(r.values).toEqual({ area: 1980, steepShare: 24.2, valley: 12.25, flashing: 14, stepFlashing: 30.5 });
    expect(r.raw).toMatchObject({ ridges: 48.5, hips: 20, rakes: 96, eaves: 110.75 });
  });
  it('leak barrier given as area is NOT mapped to LF', async () => {
    const r = parseReport((await pdf('synthetic-leak-barrier-area.pdf')).text);
    expect(r.values.leakBarrierLF).toBeUndefined();
    expect(r.warnings.join(' ')).toMatch(/Leak barrier is listed as an area/);
  });
  it('scanned / image-only PDF has no text layer', async () => {
    const t = await pdf('synthetic-scanned-no-text.pdf');
    expect(t.chars).toBeLessThan(MIN_TEXT_CHARS);
  });
});

it('itemsToLines groups by y and sorts by x', () => {
  const it = (s: string, x: number, y: number) => ({ str: s, transform: [1, 0, 0, 1, x, y] });
  expect(itemsToLines([it('9/12', 200, 500), it('Pitch', 40, 501), it('Top', 40, 700)])).toEqual(['Top', 'Pitch  9/12']);
});
