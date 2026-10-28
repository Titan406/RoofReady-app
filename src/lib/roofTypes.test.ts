import { describe, expect, it } from 'vitest';
import {
  computeDrivers, computeTotals, defaultLaborFor, defaultMaterialsFor, defaultMaterials, defaultLabor,
  lineMissing, lineQty, newEstimateData, normalizeMeasurements, switchRoofType, type Line, type Measurements,
} from './estimate';
import { materialOrderText, workOrderText } from './orders';

const base: Measurements = {
  area: 2619, waste: 13, steepShare: 89, starter: 355, ridgeCap: 115, leakBarrierLF: 580, leakBarrierWidth: 3,
  stepFlashing: 98, flashing: 55, valley: 41, dripEdge: 355,
};
const full: Measurements = { ...base, ridges: 60, hips: 55, eaves: 200, rakes: 155 };
const find = (ls: Line[], frag: string) => ls.find((l) => l.name.includes(frag))!;

describe('drivers', () => {
  it('area incl waste = 2619 × 1.13 = 2959.47', () => expect(computeDrivers(full).areaWithWaste).toBe(2959.47));
  it('missing lengths are NaN, shingle drivers untouched', () => {
    const d = computeDrivers(base);
    expect(Number.isNaN(d.eavesLF)).toBe(true);
    expect(Number.isNaN(d.ridgesPlusHips)).toBe(true);
    expect(d.squares).toBe(30);
    expect(d.ridgeCap).toBe(115);
  });
  it('normalize keeps optional lengths, leaves absent ones undefined', () => {
    const m = normalizeMeasurements({ area: 100, eaves: '50', rakes: '' });
    expect(m.eaves).toBe(50);
    expect(m.rakes).toBeUndefined();
  });
});

describe('Tuff Rib', () => {
  const d = computeDrivers(full);
  const m = defaultMaterialsFor('tuff_rib');
  it('panels LF = ceil(2959.47 / 3) = 987', () => expect(lineQty(find(m, 'Tuff Rib panels'), d)).toBe(987));
  it('ridge/hip cap = ceil(115/10) = 12', () => expect(lineQty(find(m, 'Ridge / hip cap'), d)).toBe(12));
  it('eave trim = 20, rake trim = ceil(155/10)=16, valley = 5', () => {
    expect(lineQty(find(m, 'Eave / drip'), d)).toBe(20);
    expect(lineQty(find(m, 'Rake'), d)).toBe(16);
    expect(lineQty(find(m, 'Valley'), d)).toBe(5);
  });
  it('screws = ceil(30/3)=10 bags; inside closures ceil(200/3)=67', () => {
    expect(lineQty(find(m, 'Screws'), d)).toBe(10);
    expect(lineQty(find(m, 'Inside foam'), d)).toBe(67);
  });
  it('has full parts list', () => {
    for (const p of ['panels', 'Ridge', 'Eave', 'Rake', 'Valley', 'underlayment', 'Screws', 'closures', 'Sealant', 'Butyl', 'Pipe boots'])
      expect(m.some((l) => l.name.includes(p))).toBe(true);
  });
});

describe('standing seam', () => {
  const d = computeDrivers(full);
  it('Snap-Lock panels LF = ceil(2959.47/(4/3)) = 2220, clips = ceil(2959.47/(8/3)) = 1110', () => {
    const m = defaultMaterialsFor('snap_lock');
    expect(lineQty(find(m, 'panels'), d)).toBe(2220);
    expect(lineQty(find(m, 'clips'), d)).toBe(1110);
    expect(lineQty(find(m, 'High-temp'), d)).toBe(15);
    // ice & water: (200 + 41) × 3 = 723 sq ft -> 4 rolls
    expect(lineQty(find(m, 'Ice & water'), d)).toBe(4);
    expect(m.some((l) => l.name.includes('seamer'))).toBe(false);
  });
  it('Mechanical-lock adds seamer note + seaming labor', () => {
    expect(defaultMaterialsFor('mech_lock').some((l) => l.name.includes('seamer'))).toBe(true);
    expect(defaultLaborFor('mech_lock').some((l) => l.name.includes('Mechanical seaming'))).toBe(true);
  });
});

describe('Brava', () => {
  const d = computeDrivers(full);
  const m = defaultMaterialsFor('brava');
  it('tiles = 30 SQ × 4 = 120 bundles; caps ceil(115/20)=6; starter ceil(200/30)=7; drip edge ceil(355/10)=36', () => {
    expect(lineQty(find(m, 'tiles'), d)).toBe(120);
    expect(lineQty(find(m, 'hip & ridge'), d)).toBe(6);
    expect(lineQty(find(m, 'starter'), d)).toBe(7);
    expect(lineQty(find(m, 'Drip edge'), d)).toBe(36);
  });
});

describe('missing lengths', () => {
  const d = computeDrivers(base); // no ridges/hips/eaves/rakes
  const m = defaultMaterialsFor('tuff_rib');
  it('trim lines are 0 and flagged missing; panels still computed', () => {
    const rake = find(m, 'Rake');
    expect(lineQty(rake, d)).toBe(0);
    expect(lineMissing(rake, d)).toBe(true);
    expect(lineMissing(find(m, 'panels'), d)).toBe(false);
  });
  it('override wins and clears the flag', () => {
    const rake = { ...find(m, 'Rake'), override: 7 };
    expect(lineQty(rake, d)).toBe(7);
    expect(lineMissing(rake, d)).toBe(false);
  });
  it('valley 0 is flagged missing for metal', () => {
    const d2 = computeDrivers({ ...full, valley: 0 });
    expect(lineMissing(find(m, 'Valley'), d2)).toBe(true);
  });
  it('orders show roof type and the missing note', () => {
    const e = newEstimateData(base, '', undefined, 'tuff_rib');
    const mo = materialOrderText(e, { address: 'x' }, false);
    expect(mo).toContain('ROOF TYPE: 3-ft Tuff Rib');
    expect(mo).toContain('missing from report');
    const wo = workOrderText(e, { address: 'x' }, false);
    expect(wo).toContain('Rakes MISSING');
  });
});

describe('shingles unchanged', () => {
  it('default shingle estimate identical to legacy defaults', () => {
    const strip = (ls: Line[]) => ls.map((l) => { const r: Partial<Line> = { ...l }; delete r.id; return r; });
    expect(strip(defaultMaterialsFor('asphalt_shingle'))).toEqual(strip(defaultMaterials()));
    expect(strip(defaultLaborFor('asphalt_shingle'))).toEqual(strip(defaultLabor()));
    const e = newEstimateData(base);
    expect(e.roofType).toBeUndefined();
    const withLengths = computeTotals(newEstimateData(full));
    expect(computeTotals(e).price).toBe(withLengths.price);
  });
  it('switching type and back keeps custom lines and shingle price', () => {
    const e = newEstimateData(base);
    e.materials.push({ id: 'c', name: 'Custom', unit: 'each', driver: 'none', mode: 'fixed', rate: 1, price: 100, override: null, custom: true });
    const p0 = computeTotals(e).price;
    const back = switchRoofType(switchRoofType(e, 'brava'), 'asphalt_shingle');
    expect(back.materials.some((l) => l.name === 'Custom')).toBe(true);
    expect(computeTotals(back).price).toBe(p0);
  });
  it('price = direct cost ÷ (1 − GP) for metal too', () => {
    const t = computeTotals(newEstimateData(full, '', undefined, 'snap_lock'));
    expect(t.price).toBeCloseTo(t.directCost / 0.7, 1);
  });
});

import { computeTotals as ct, missingBanner, parseLength, parseRoofType, SEAM_16IN_FT } from './estimate';
describe('QC review fixes', () => {
  it('negative / non-number lengths are rejected', () => {
    expect(parseLength('-50')).toBeNull();
    expect(parseLength('abc')).toBeNull();
    expect(parseLength('')).toBeNull();
    expect(parseLength('0')).toBe(0);
    expect(parseLength('12.5')).toBe(12.5);
    expect(normalizeMeasurements({ eaves: -50 }).eaves).toBeUndefined();
  });
  it('unknown roofType falls back to shingles', () => {
    expect(parseRoofType('slate')).toBe('asphalt_shingle');
    expect(parseRoofType(undefined)).toBe('asphalt_shingle');
    expect(parseRoofType('tuff_rib')).toBe('tuff_rib');
  });
  it('missing items are counted; shingles have none', () => {
    const tr = newEstimateData(base, '', undefined, 'tuff_rib');
    const t = ct(tr);
    expect(t.missingCount).toBeGreaterThan(0);
    expect(missingBanner(t.missingCount)).toContain(`${t.missingCount} items missing from the report`);
    expect(ct(newEstimateData(full, '', undefined, 'tuff_rib')).missingCount).toBe(0);
    expect(ct(newEstimateData(base)).missingCount).toBe(0);
    const wo = workOrderText(tr, { address: 'x' }, true);
    expect(wo).toContain('price incomplete');
    expect(materialOrderText(tr, { address: 'x' }, true)).toContain('price incomplete');
    expect(workOrderText(newEstimateData(base), { address: 'x' }, true)).not.toContain('price incomplete');
  });
  it('explicit zero lengths clear the missing flags', () => {
    const m = { ...base, ridges: 0, hips: 0, eaves: 0, rakes: 0, valley: 0, noValleys: true };
    expect(ct(newEstimateData(m, '', undefined, 'snap_lock')).missingCount).toBe(0);
  });
  it('valley 0 flags as missing unless "no valleys" is set', () => {
    const m0 = { ...full, valley: 0 };
    expect(Number.isNaN(computeDrivers(m0).valleyLF)).toBe(true);
    expect(computeDrivers({ ...m0, noValleys: true }).valleyLF).toBe(0);
    expect(normalizeMeasurements({ noValleys: true }).noValleys).toBe(true);
  });
  it('standing seam uses exactly 4/3 ft coverage', () => {
    expect(SEAM_16IN_FT).toBe(4 / 3);
    const l = find(defaultMaterialsFor('snap_lock'), 'panels');
    expect(l.rate).toBe(4 / 3);
    expect(lineQty(l, computeDrivers(full))).toBe(Math.ceil((2959.47 * 3) / 4)); // 2220
  });
  it('PLACEHOLDER is a flag, not in the name', () => {
    const l = defaultMaterialsFor('tuff_rib')[0];
    expect(l.placeholder).toBe(true);
    expect(l.name).not.toContain('PLACEHOLDER');
    expect(defaultMaterials()[0].placeholder).toBeUndefined();
  });
});

import { CLIP_SQFT, isMissingCountColumnError, isMissingItemsRefusal } from './estimate';
describe('QC follow-up', () => {
  it('clips use exactly 8/3 sq ft per clip (3/8 clip per sq ft)', () => {
    expect(CLIP_SQFT).toBe(8 / 3);
    const l = find(defaultMaterialsFor('mech_lock'), 'clips');
    expect(l.rate).toBe(8 / 3);
    expect(lineQty(l, computeDrivers(full))).toBe(Math.ceil((2959.47 * 3) / 8));
  });
  it('detects missing column and DB approval refusal', () => {
    expect(isMissingCountColumnError({ code: 'PGRST204', message: "Could not find the 'missing_count' column of 'estimates'" })).toBe(true);
    expect(isMissingCountColumnError({ code: '23505', message: 'dup' })).toBe(false);
    expect(isMissingItemsRefusal({ message: 'RR_MISSING_ITEMS: 3 items missing' })).toBe(true);
  });
});
