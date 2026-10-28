// All estimate math lives here. Deterministic code only — no AI involved.

export interface Measurements {
  area: number; // roof area, sq ft
  waste: number; // waste %
  steepShare: number; // % of roof that is steep pitch
  starter: number; // starter LF
  ridgeCap: number; // ridge cap LF
  leakBarrierLF: number; // leak barrier LF
  leakBarrierWidth: number; // leak barrier strip width, ft
  stepFlashing: number; // step flashing LF
  flashing: number; // other flashing LF
  valley: number; // valley LF
  dripEdge: number; // drip edge LF
}

export const MEASUREMENT_FIELDS: { key: keyof Measurements; label: string; unit: string }[] = [
  { key: 'area', label: 'Roof area', unit: 'sq ft' },
  { key: 'waste', label: 'Waste', unit: '%' },
  { key: 'steepShare', label: 'Steep pitch share', unit: '%' },
  { key: 'starter', label: 'Starter', unit: 'LF' },
  { key: 'ridgeCap', label: 'Ridge cap', unit: 'LF' },
  { key: 'leakBarrierLF', label: 'Leak barrier', unit: 'LF' },
  { key: 'leakBarrierWidth', label: 'Leak barrier strip width', unit: 'ft' },
  { key: 'stepFlashing', label: 'Step flashing', unit: 'LF' },
  { key: 'flashing', label: 'Flashing', unit: 'LF' },
  { key: 'valley', label: 'Valley', unit: 'LF' },
  { key: 'dripEdge', label: 'Drip edge', unit: 'LF' },
];

export const EMPTY_MEASUREMENTS: Measurements = {
  area: 0,
  waste: 10,
  steepShare: 0,
  starter: 0,
  ridgeCap: 0,
  leakBarrierLF: 0,
  leakBarrierWidth: 3,
  stepFlashing: 0,
  flashing: 0,
  valley: 0,
  dripEdge: 0,
};

export function normalizeMeasurements(raw: unknown): Measurements {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...EMPTY_MEASUREMENTS };
  for (const f of MEASUREMENT_FIELDS) {
    if (r[f.key] !== undefined && r[f.key] !== null && r[f.key] !== '') {
      const n = Number(r[f.key]);
      if (Number.isFinite(n)) out[f.key] = n;
    }
  }
  return out;
}

/** Math.ceil that ignores floating-point dust (e.g. 90.00000000001 -> 90). */
export function ceilSafe(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  return Math.ceil(Math.round(x * 1e6) / 1e6);
}

export type DriverKey =
  | 'squares'
  | 'steepSquares'
  | 'starter'
  | 'ridgeCap'
  | 'leakBarrierSqft'
  | 'stepFlashing'
  | 'flashing'
  | 'stepPlusFlashing'
  | 'valley'
  | 'dripEdge'
  | 'none';

export const DRIVER_LABELS: Record<DriverKey, string> = {
  squares: 'Squares (incl. waste)',
  steepSquares: 'Steep squares',
  starter: 'Starter LF',
  ridgeCap: 'Ridge cap LF',
  leakBarrierSqft: 'Leak barrier sq ft',
  stepFlashing: 'Step flashing LF',
  flashing: 'Flashing LF',
  stepPlusFlashing: 'Step + other flashing LF',
  valley: 'Valley LF',
  dripEdge: 'Drip edge LF',
  none: 'Fixed quantity',
};

export type Drivers = Record<DriverKey, number>;

export function computeDrivers(m: Measurements): Drivers {
  const squares = ceilSafe((m.area * (1 + m.waste / 100)) / 100);
  return {
    squares,
    steepSquares: ceilSafe((squares * m.steepShare) / 100),
    starter: m.starter,
    ridgeCap: m.ridgeCap,
    leakBarrierSqft: m.leakBarrierLF * m.leakBarrierWidth,
    stepFlashing: m.stepFlashing,
    flashing: m.flashing,
    stepPlusFlashing: m.stepFlashing + m.flashing,
    valley: m.valley,
    dripEdge: m.dripEdge,
    none: 0,
  };
}

/**
 * mode:
 *  - 'per'      qty = ceil(driver * rate)      (e.g. 3 bundles per square; labor 1 per SQ/LF)
 *  - 'coverage' qty = ceil(driver / rate)      (rate = driver units covered by one unit)
 *  - 'fixed'    qty = rate                     (allowances, dumpster)
 * override, when entered (not null/empty), always wins.
 */
export type LineMode = 'per' | 'coverage' | 'fixed';

export interface Line {
  id: string;
  name: string;
  unit: string;
  driver: DriverKey;
  mode: LineMode;
  rate: number;
  price: number; // unit price $
  override: number | null;
  custom?: boolean;
}

export function lineQty(line: Line, d: Drivers): number {
  if (line.override !== null && line.override !== undefined && Number.isFinite(Number(line.override))) {
    return Number(line.override);
  }
  if (line.mode === 'fixed') return Number(line.rate) || 0;
  const driver = line.driver === 'none' ? 0 : d[line.driver] || 0;
  const rate = Number(line.rate) || 0;
  if (line.mode === 'per') return ceilSafe(driver * rate);
  if (rate <= 0) return 0;
  return ceilSafe(driver / rate);
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function lineTotal(line: Line, d: Drivers): number {
  return round2(lineQty(line, d) * (Number(line.price) || 0));
}

let idc = 0;
export const newId = () => `l${Date.now().toString(36)}${(idc++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// PLACEHOLDER prices — every line is editable in the app; confirm with supplier pricing.
export function defaultMaterials(): Line[] {
  const L = (name: string, unit: string, driver: DriverKey, mode: LineMode, rate: number, price: number): Line => ({
    id: newId(),
    name,
    unit,
    driver,
    mode,
    rate,
    price,
    override: null,
  });
  return [
    L('Owens Corning Duration shingles', 'bundle', 'squares', 'per', 3, 46.65),
    L('Starter strip (OC Starter Strip Plus)', 'bundle', 'starter', 'coverage', 105, 62),
    L('Hip & ridge cap (OC ProEdge)', 'bundle', 'ridgeCap', 'coverage', 33, 75),
    L('Leak barrier (OC WeatherLock G)', 'roll', 'leakBarrierSqft', 'coverage', 200, 119),
    L('Synthetic underlayment', 'roll', 'squares', 'coverage', 10, 165),
    L('Drip edge (10 ft)', 'piece', 'dripEdge', 'coverage', 10, 12),
    L('Step flashing (bundle of 100)', 'bundle', 'stepFlashing', 'coverage', 40, 65),
    L('Flashing / coil stock (10 ft)', 'piece', 'flashing', 'coverage', 10, 18),
    L('Valley metal (10 ft)', 'piece', 'valley', 'coverage', 10, 28),
    L('Coil roofing nails (box)', 'box', 'squares', 'coverage', 15, 55),
    L('Vents, pipe boots & sealant allowance', 'lot', 'none', 'fixed', 1, 250),
  ];
}

export function defaultLabor(): Line[] {
  const L = (name: string, unit: string, driver: DriverKey, mode: LineMode, rate: number, price: number): Line => ({
    id: newId(),
    name,
    unit,
    driver,
    mode,
    rate,
    price,
    override: null,
  });
  return [
    L('Tear-off', 'SQ', 'squares', 'per', 1, 45),
    L('Underlayment', 'SQ', 'squares', 'per', 1, 20),
    L('Shingle install', 'SQ', 'squares', 'per', 1, 120),
    L('Steep pitch surcharge', 'SQ', 'steepSquares', 'per', 1, 30),
    L('Ridge cap install', 'LF', 'ridgeCap', 'per', 1, 4),
    L('Drip edge / edge metal', 'LF', 'dripEdge', 'per', 1, 1.5),
    L('Flashing (step + other)', 'LF', 'stepPlusFlashing', 'per', 1, 6),
    L('Dumpster / disposal', 'each', 'none', 'fixed', 1, 450),
  ];
}

export interface EstimateData {
  measurements: Measurements;
  measurementSource: string;
  materials: Line[];
  labor: Line[];
  taxPct: number; // applied to materials; MT has no state sales tax, default 0
  targetGp: number; // % e.g. 30
  notes?: string;
}

export function newEstimateData(m?: Measurements, source = '', catalog?: { materials?: Line[]; labor?: Line[] }): EstimateData {
  const fresh = (lines: Line[]) => lines.map((l) => ({ ...l, id: newId(), override: null }));
  return {
    measurements: m ?? { ...EMPTY_MEASUREMENTS },
    measurementSource: source,
    materials: catalog?.materials?.length ? fresh(catalog.materials) : defaultMaterials(),
    labor: catalog?.labor?.length ? fresh(catalog.labor) : defaultLabor(),
    taxPct: 0,
    targetGp: 30,
  };
}

export interface Totals {
  drivers: Drivers;
  materialSubtotal: number;
  tax: number;
  materialTotal: number;
  laborTotal: number;
  directCost: number;
  price: number;
  grossProfit: number;
  gpPct: number; // resulting GP %
  valid: boolean;
}

/** Blueprint rule: selling price = direct cost / (1 - target GP). */
export function computeTotals(e: EstimateData): Totals {
  const drivers = computeDrivers(e.measurements);
  const materialSubtotal = round2(e.materials.reduce((s, l) => s + lineTotal(l, drivers), 0));
  const tax = round2((materialSubtotal * (Number(e.taxPct) || 0)) / 100);
  const materialTotal = round2(materialSubtotal + tax);
  const laborTotal = round2(e.labor.reduce((s, l) => s + lineTotal(l, drivers), 0));
  const directCost = round2(materialTotal + laborTotal);
  const gp = (Number(e.targetGp) || 0) / 100;
  const valid = gp >= 0 && gp < 1;
  const price = valid ? round2(directCost / (1 - gp)) : 0;
  const grossProfit = round2(price - directCost);
  const gpPct = price > 0 ? round2((grossProfit / price) * 100) : 0;
  return { drivers, materialSubtotal, tax, materialTotal, laborTotal, directCost, price, grossProfit, gpPct, valid };
}
