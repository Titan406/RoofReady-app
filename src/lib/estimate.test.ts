import { describe, expect, it } from 'vitest';
import {
  ceilSafe,
  computeDrivers,
  computeTotals,
  defaultLabor,
  defaultMaterials,
  lineQty,
  newEstimateData,
  normalizeMeasurements,
  type Measurements,
} from './estimate';
import { computeMetrics } from './stages';
import { materialOrderText, workOrderText, mailtoLink } from './orders';

const wedgewood: Measurements = {
  area: 2619,
  waste: 13,
  steepShare: 89,
  starter: 355,
  ridgeCap: 115,
  leakBarrierLF: 580,
  leakBarrierWidth: 3,
  stepFlashing: 98,
  flashing: 55,
  valley: 41,
  dripEdge: 355,
};

const byName = (lines: ReturnType<typeof defaultMaterials>, frag: string) => lines.find((l) => l.name.includes(frag))!;

describe('83 Wedgewood Ln (GAF QuickMeasure)', () => {
  const d = computeDrivers(wedgewood);
  it('2619 sq ft @ 13% waste -> 30 squares', () => {
    expect(d.squares).toBe(30);
  });
  it('Duration: 3 bundles per square -> 90 bundles', () => {
    expect(lineQty(byName(defaultMaterials(), 'Duration'), d)).toBe(90);
  });
  it('leak barrier 580 LF x 3 ft = 1740 sq ft -> 9 rolls (200 sq ft/roll)', () => {
    expect(d.leakBarrierSqft).toBe(1740);
    expect(lineQty(byName(defaultMaterials(), 'WeatherLock'), d)).toBe(9);
  });
  it('starter 355 LF / 105 LF per bundle -> 4 bundles', () => {
    expect(lineQty(byName(defaultMaterials(), 'Starter'), d)).toBe(4);
  });
  it('steep squares = ceil(30 * 89%) = 27', () => {
    expect(d.steepSquares).toBe(27);
  });
  it('override wins', () => {
    const l = { ...byName(defaultMaterials(), 'Duration'), override: 95 };
    expect(lineQty(l, d)).toBe(95);
    const z = { ...byName(defaultMaterials(), 'Duration'), override: 0 };
    expect(lineQty(z, d)).toBe(0);
  });
  it('totals use price = direct cost / (1 - target GP)', () => {
    const e = newEstimateData(wedgewood, 'GAF QuickMeasure');
    const t = computeTotals(e);
    expect(t.materialSubtotal).toBeGreaterThan(0);
    expect(t.tax).toBe(0);
    expect(t.directCost).toBeCloseTo(t.materialTotal + t.laborTotal, 2);
    expect(t.price).toBeCloseTo(t.directCost / 0.7, 2);
    expect(t.gpPct).toBeCloseTo(30, 1);
    // Duration 90 * 46.65 = 4198.50 is part of materials
    expect(90 * 46.65).toBeCloseTo(4198.5, 2);
    // labor: tear-off 30*45 + underlay 30*20 + install 30*120 + steep 27*30 + ridge 115*4 + edge 355*1.5 + flash 153*6 + dumpster 450
    expect(t.laborTotal).toBeCloseTo(1350 + 600 + 3600 + 810 + 460 + 532.5 + 918 + 450, 2);
  });
  it('tax % applies to materials', () => {
    const e = { ...newEstimateData(wedgewood), taxPct: 10 };
    const t = computeTotals(e);
    expect(t.tax).toBeCloseTo(t.materialSubtotal * 0.1, 2);
  });
  it('has 11 material and 8 labor default lines', () => {
    expect(defaultMaterials()).toHaveLength(11);
    expect(defaultLabor()).toHaveLength(8);
  });
});

describe('helpers', () => {
  it('ceilSafe ignores float dust', () => {
    expect(ceilSafe(90.00000000001)).toBe(90);
    expect(ceilSafe(29.5947)).toBe(30);
    expect(ceilSafe(-3)).toBe(0);
  });
  it('normalizeMeasurements tolerates partial/blank jsonb', () => {
    const m = normalizeMeasurements({ area: '2000', waste: '' });
    expect(m.area).toBe(2000);
    expect(m.waste).toBe(10);
  });
  it('invalid GP (>=100%) yields no price', () => {
    const t = computeTotals({ ...newEstimateData(wedgewood), targetGp: 100 });
    expect(t.valid).toBe(false);
    expect(t.price).toBe(0);
  });
  it('metrics buckets', () => {
    const m = computeMetrics([
      { stage: 'Lead', value: 100 },
      { stage: 'Negotiation', value: '50' },
      { stage: 'Scheduled', value: 1000 },
      { stage: 'Invoiced', value: 2000 },
      { stage: 'Paid', value: 3000 },
    ]);
    expect(m.openLeads).toEqual({ count: 2, value: 150 });
    expect(m.soldNotInvoiced.value).toBe(1000);
    expect(m.invoiced.value).toBe(2000);
    expect(m.paid.value).toBe(3000);
  });
  it('order text + mailto', () => {
    const e = newEstimateData(wedgewood, 'GAF QuickMeasure');
    const mo = materialOrderText(e, { address: '83 Wedgewood Ln' }, false);
    expect(mo).toContain('90 bundle — Owens Corning Duration');
    expect(mo).not.toContain('$');
    expect(materialOrderText(e, { address: 'x' }, true)).toContain('$4,198.50');
    const wo = workOrderText(e, { address: '83 Wedgewood Ln' }, false);
    expect(wo).toContain('30 squares');
    expect(wo).not.toContain('$');
    expect(mailtoLink('A B', 'x&y')).toBe('mailto:?subject=A%20B&body=x%26y');
  });
});
