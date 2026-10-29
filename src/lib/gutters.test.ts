import { describe, expect, it } from 'vitest';
import {
  computeDrivers, computeTotals, defaultLaborFor, defaultMaterialsFor, gutterSummary, isGutterType, isRoofTypeCheckError,
  lineMissing, lineQty, newEstimateData, normalizeMeasurements, parseLength, parseRoofType, roofTypeLabel, ROOF_TYPES,
  switchRoofType, type Line, type Measurements,
} from './estimate';
import { materialOrderText, workOrderText } from './orders';

const base: Measurements = {
  area: 2619, waste: 13, steepShare: 89, starter: 355, ridgeCap: 115, leakBarrierLF: 580, leakBarrierWidth: 3,
  stepFlashing: 98, flashing: 55, valley: 41, dripEdge: 355,
};
// Real call: 271 ft gutters, 225 ft downspouts, 40 ft chain, two 3 ft miters, guard for 18 ft.
const call: Measurements = { ...base, eaves: 200, gutterFeet: 271, downspoutFeet: 225, chainFeet: 40, miters: 2, guardFeet: 18, insideCorners: 0, outsideCorners: 0 };
const find = (ls: Line[], frag: string) => ls.find((l) => l.name.includes(frag))!;

describe('gutter types allow-list', () => {
  it('both sizes are known estimate types', () => {
    expect(parseRoofType('gutter_5in')).toBe('gutter_5in');
    expect(parseRoofType('gutter_6in')).toBe('gutter_6in');
    expect(parseRoofType('gutter_7in')).toBe('asphalt_shingle');
    expect(ROOF_TYPES.map((t) => t.id)).toEqual(['asphalt_shingle', 'tuff_rib', 'snap_lock', 'mech_lock', 'brava', 'gutter_5in', 'gutter_6in']);
    expect(roofTypeLabel('gutter_5in')).toBe('5 inch gutter');
    expect(roofTypeLabel('gutter_6in')).toBe('6 inch gutter');
    expect(isGutterType('gutter_6in')).toBe(true);
    expect(isGutterType('brava')).toBe(false);
  });
  it('detects the DB roof_type check refusal (migration pending)', () => {
    expect(isRoofTypeCheckError({ code: '23514', message: 'new row for relation "estimates" violates check constraint "estimates_roof_type_check"' })).toBe(true);
    expect(isRoofTypeCheckError({ code: '23514', message: 'RR_MISSING_ITEMS' })).toBe(false);
    expect(isRoofTypeCheckError(null)).toBe(false);
  });
});

describe('5 inch gutter — real call example', () => {
  const d = computeDrivers(call);
  const m = defaultMaterialsFor('gutter_5in');
  it('quantities', () => {
    expect(lineQty(find(m, 'K-style gutter'), d)).toBe(28); // 271 ft / 10
    expect(lineQty(find(m, 'downspout (10 ft'), d)).toBe(23); // 225 / 10
    expect(lineQty(find(m, 'elbow A'), d)).toBe(23);
    expect(lineQty(find(m, 'elbow B'), d)).toBe(12);
    expect(lineQty(find(m, 'miter'), d)).toBe(2);
    expect(lineQty(find(m, 'end cap'), d)).toBe(14);
    expect(lineQty(find(m, 'hanger'), d)).toBe(136); // every 24 in
    expect(lineQty(find(m, 'screws'), d)).toBe(3);
    expect(lineQty(find(m, 'sealant'), d)).toBe(11);
    expect(lineQty(find(m, 'straps'), d)).toBe(38);
    expect(lineQty(find(m, 'Rain chain'), d)).toBe(40);
    expect(lineQty(find(m, 'guard'), d)).toBe(18);
    expect(lineQty(find(m, 'inside corner'), d)).toBe(0);
    expect(computeTotals(newEstimateData(call, '', undefined, 'gutter_5in')).missingCount).toBe(0);
  });
  it('summary feet + 10 ft counts', () => {
    expect(gutterSummary(call)).toEqual({ gutterFeet: 271, gutterSections: 28, downspoutFeet: 225, downspoutPieces: 23 });
  });
  it('full parts list, all PLACEHOLDER flagged, hanger assumption visible', () => {
    for (const p of ['gutter', 'downspout', 'elbow A', 'elbow B', 'inside corner', 'outside corner', 'miter', 'end cap', 'hanger', 'screws', 'sealant', 'straps', 'Rain chain', 'guard'])
      expect(m.some((l) => l.name.includes(p))).toBe(true);
    expect([...m, ...defaultLaborFor('gutter_5in')].every((l) => l.placeholder && !l.name.includes('PLACEHOLDER'))).toBe(true);
    expect(find(m, 'hanger').assumption).toContain('24 in');
    expect(find(m, 'hanger').rate).toBe(2);
  });
  it('labor lines', () => {
    const l = defaultLaborFor('gutter_5in');
    expect(lineQty(find(l, 'Gutter install'), d)).toBe(271);
    expect(lineQty(find(l, 'Downspout install'), d)).toBe(225);
    expect(lineQty(find(l, 'Gutter guard install'), d)).toBe(18);
  });
});

describe('6 inch gutter', () => {
  it('same quantities, every part priced higher than 5 inch', () => {
    const d = computeDrivers(call);
    const m5 = defaultMaterialsFor('gutter_5in'); const m6 = defaultMaterialsFor('gutter_6in');
    m5.forEach((l, i) => { expect(lineQty(m6[i], d)).toBe(lineQty(l, d)); expect(m6[i].price).toBeGreaterThan(l.price); });
    expect(m6[0].name).toContain('6 in');
    expect(computeTotals(newEstimateData(call, '', undefined, 'gutter_6in')).price).toBeGreaterThan(computeTotals(newEstimateData(call, '', undefined, 'gutter_5in')).price);
  });
});

describe('gutter flags & inputs', () => {
  it('gutter feet default to eaves; override wins', () => {
    expect(computeDrivers({ ...base, eaves: 180 }).gutterLF).toBe(180);
    expect(computeDrivers({ ...base, eaves: 180, gutterFeet: 271 }).gutterLF).toBe(271);
  });
  it('missing or zero gutter feet is flagged; missing downspouts flagged unless "none"', () => {
    const m = defaultMaterialsFor('gutter_5in');
    const g = find(m, 'K-style'); const ds = find(m, 'downspout (10');
    const dMissing = computeDrivers(base);
    expect(lineMissing(g, dMissing)).toBe(true);
    expect(lineMissing(ds, dMissing)).toBe(true);
    expect(lineMissing(g, computeDrivers({ ...base, eaves: 200, gutterFeet: 0 }))).toBe(true);
    expect(lineMissing(g, computeDrivers({ ...base, eaves: 0 }))).toBe(true);
    const none = computeDrivers({ ...base, eaves: 100, noDownspouts: true });
    expect(lineMissing(ds, none)).toBe(false);
    expect(lineQty(ds, none)).toBe(0);
    const e = newEstimateData(base, '', undefined, 'gutter_5in');
    expect(computeTotals(e).missingCount).toBeGreaterThan(0);
    expect(computeTotals(newEstimateData({ ...base, eaves: 100, noDownspouts: true, noInsideCorners: true, noOutsideCorners: true, noMiters: true }, '', undefined, 'gutter_5in')).missingCount).toBe(0);
  });
  it('guard is optional: no guard feet → 0, not flagged', () => {
    const d = computeDrivers({ ...base, gutterFeet: 100, downspoutFeet: 20, insideCorners: 0, outsideCorners: 0, miters: 0 });
    const gl = find(defaultMaterialsFor('gutter_5in'), 'guard');
    expect(lineQty(gl, d)).toBe(0);
    expect(lineMissing(gl, d)).toBe(false);
  });
  it('negative / non-numeric rejected', () => {
    expect(parseLength('-3')).toBeNull();
    expect(parseLength('abc')).toBeNull();
    const n = normalizeMeasurements({ gutterFeet: -5, downspoutFeet: 'x', miters: '2', noDownspouts: true });
    expect(n.gutterFeet).toBeUndefined();
    expect(n.downspoutFeet).toBeUndefined();
    expect(n.miters).toBe(2);
    expect(n.noDownspouts).toBe(true);
  });
});

describe('gutter orders', () => {
  it('material + work orders list gutter lines and summary', () => {
    const e = newEstimateData(call, '', undefined, 'gutter_6in');
    const mo = materialOrderText(e, { address: 'x' }, true);
    expect(mo).toContain('ROOF TYPE: 6 inch gutter');
    expect(mo).toContain('Gutter: 271 ft (28 × 10 ft sections)');
    expect(mo).toContain('Downspouts: 225 ft (23 × 10 ft pieces)');
    expect(mo).toContain('136 each — 6 in hidden hanger (PLACEHOLDER price)');
    const wo = workOrderText(e, { address: 'x' }, false);
    expect(wo).toContain('GUTTERS');
    expect(wo).toContain('Rain chain: 40 ft');
    expect(wo).toContain('Gutter guard: 18 ft');
    expect(wo).not.toContain('squares (area');
  });
  it('missing gutter feet shows banner', () => {
    const e = newEstimateData(base, '', undefined, 'gutter_5in');
    expect(materialOrderText(e, { address: 'x' }, false)).toContain('price incomplete');
    expect(workOrderText(e, { address: 'x' }, false)).toContain('Gutter: MISSING');
  });
  it('switching shingles → gutter → shingles keeps custom lines and shingle price', () => {
    const e = newEstimateData(base);
    const p0 = computeTotals(e).price;
    const back = switchRoofType(switchRoofType(e, 'gutter_5in'), 'asphalt_shingle');
    expect(computeTotals(back).price).toBe(p0);
  });
});

import { GUTTER_DEFAULTS_DISABLED, END_CAP_FT } from './estimate';
describe('QC (Frank) fixes', () => {
  const ok: Measurements = { ...base, gutterFeet: 100, downspoutFeet: 20, insideCorners: 1, outsideCorners: 1, miters: 0 };
  const m = defaultMaterialsFor('gutter_5in');
  it('blank corners / miters are flagged missing (material + labor) and block approval', () => {
    for (const k of ['insideCorners', 'outsideCorners', 'miters'] as const) {
      const mm = { ...ok }; delete mm[k];
      const t = computeTotals(newEstimateData(mm, '', undefined, 'gutter_5in'));
      expect(t.missingCount).toBe(2);
      expect(Number.isNaN(computeDrivers(mm)[k])).toBe(true);
    }
    expect(computeTotals(newEstimateData(ok, '', undefined, 'gutter_5in')).missingCount).toBe(0);
  });
  it('explicit none clears each flag; typed 0 also means none', () => {
    const mm: Measurements = { ...base, gutterFeet: 100, noDownspouts: true, noInsideCorners: true, noOutsideCorners: true, noMiters: true };
    expect(computeTotals(newEstimateData(mm, '', undefined, 'gutter_5in')).missingCount).toBe(0);
    expect(computeDrivers({ ...ok, downspoutFeet: 0 }).downspoutLF).toBe(0);
    expect(lineMissing(find(m, 'inside corner'), computeDrivers({ ...ok, insideCorners: 0 }))).toBe(false);
    const n = normalizeMeasurements({ noInsideCorners: true, noOutsideCorners: true, noMiters: true, endCaps: '6' });
    expect([n.noInsideCorners, n.noOutsideCorners, n.noMiters, n.endCaps]).toEqual([true, true, true, 6]);
  });
  it('gutter feet 0 is always missing (no none for gutters)', () => {
    expect(lineMissing(find(m, 'K-style'), computeDrivers({ ...ok, gutterFeet: 0 }))).toBe(true);
  });
  it('orders show MISSING / none for counts', () => {
    const mm = { ...ok, noMiters: true }; delete mm.insideCorners;
    const wo = workOrderText(newEstimateData(mm, '', undefined, 'gutter_5in'), { address: 'x' }, false);
    expect(wo).toContain('Inside corners MISSING');
    expect(wo).toContain('Miters none');
    expect(wo).toContain('price incomplete');
  });
  it('end caps: entered count wins; blank = 1 per 20 ft assumption', () => {
    const l = find(m, 'end cap');
    expect(END_CAP_FT).toBe(20);
    expect(lineQty(l, computeDrivers(call))).toBe(14);
    expect(lineQty(l, computeDrivers({ ...call, endCaps: 8 }))).toBe(8);
    expect(l.assumption).toContain('1 per 20 ft');
    expect(lineMissing(l, computeDrivers(base))).toBe(true);
  });
  it('team-defaults message exists for gutters', () => expect(GUTTER_DEFAULTS_DISABLED).toContain('database update'));
});
