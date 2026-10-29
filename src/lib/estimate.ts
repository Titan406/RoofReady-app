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
  // Raw report lengths (optional). undefined = not in the report / not entered -> shown as "missing", never guessed.
  ridges?: number; // ridge LF
  hips?: number; // hip LF
  eaves?: number; // eave LF
  rakes?: number; // rake LF
  /** User explicitly stated the roof has no valleys (valley 0 is then a real 0, not "missing"). */
  noValleys?: boolean;
  // Gutter inputs (optional). undefined = not entered.
  /** Gutter feet; when not entered it defaults to the report's eave length. 0 is flagged as missing. */
  gutterFeet?: number;
  downspoutFeet?: number;
  /** User explicitly said: no downspouts on this job. */
  noDownspouts?: boolean;
  noInsideCorners?: boolean;
  noOutsideCorners?: boolean;
  noMiters?: boolean;
  /** End caps entered directly (real count = 2 per run). Blank = ASSUMPTION 1 per 20 ft of gutter. */
  endCaps?: number;
  insideCorners?: number;
  outsideCorners?: number;
  /** Number of miters (e.g. two 3 ft miters = 2). */
  miters?: number;
  chainFeet?: number;
  /** Leaf guard / screen feet — optional, only priced when entered. */
  guardFeet?: number;
}

export type ReportLengthKey = 'ridges' | 'hips' | 'eaves' | 'rakes';
/** Report lengths used by metal / synthetic roof types. Left blank when the report does not state them. */
export const REPORT_LENGTH_FIELDS: { key: ReportLengthKey; label: string; unit: string }[] = [
  { key: 'ridges', label: 'Ridges (report)', unit: 'LF' },
  { key: 'hips', label: 'Hips (report)', unit: 'LF' },
  { key: 'eaves', label: 'Eaves (report)', unit: 'LF' },
  { key: 'rakes', label: 'Rakes (report)', unit: 'LF' },
];

export type GutterInputKey = 'gutterFeet' | 'downspoutFeet' | 'insideCorners' | 'outsideCorners' | 'miters' | 'endCaps' | 'chainFeet' | 'guardFeet';
export const GUTTER_FIELDS: { key: GutterInputKey; label: string; unit: string }[] = [
  { key: 'gutterFeet', label: 'Gutter', unit: 'ft' },
  { key: 'downspoutFeet', label: 'Downspouts', unit: 'ft' },
  { key: 'insideCorners', label: 'Inside corners', unit: 'count' },
  { key: 'outsideCorners', label: 'Outside corners', unit: 'count' },
  { key: 'miters', label: 'Miters', unit: 'count' },
  { key: 'endCaps', label: 'End caps', unit: 'count' },
  { key: 'chainFeet', label: 'Rain chain', unit: 'ft' },
  { key: 'guardFeet', label: 'Gutter guard / leaf screen', unit: 'ft' },
];

/** Gutter inputs with an explicit "none" checkbox. Rule: blank = MISSING (flagged); typed 0 or "none" ticked = none. */
export const GUTTER_NONE: { key: GutterInputKey; flag: GutterNoneFlag; label: string }[] = [
  { key: 'downspoutFeet', flag: 'noDownspouts', label: 'None — no downspouts' },
  { key: 'insideCorners', flag: 'noInsideCorners', label: 'None — no inside corners' },
  { key: 'outsideCorners', flag: 'noOutsideCorners', label: 'None — no outside corners' },
  { key: 'miters', flag: 'noMiters', label: 'None — no miters' },
];
export type GutterNoneFlag = 'noDownspouts' | 'noInsideCorners' | 'noOutsideCorners' | 'noMiters';

export type NumericMeasurementKey = Exclude<keyof Measurements, 'noValleys' | GutterNoneFlag | ReportLengthKey | GutterInputKey>;
export const MEASUREMENT_FIELDS: { key: NumericMeasurementKey; label: string; unit: string }[] = [
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
  for (const f of REPORT_LENGTH_FIELDS) {
    const v = r[f.key];
    if (v !== undefined && v !== null && v !== '') {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) out[f.key] = n;
    }
  }
  for (const f of GUTTER_FIELDS) {
    const v = r[f.key];
    if (v !== undefined && v !== null && v !== '') {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) out[f.key] = n;
    }
  }
  if (r.noValleys === true) out.noValleys = true;
  for (const g of GUTTER_NONE) if (r[g.flag] === true) out[g.flag] = true;
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
  // roof-type drivers (NaN = length missing from report -> qty 0 + "missing from report" note)
  | 'areaWithWaste'
  | 'ridgesLF'
  | 'ridgesPlusHips'
  | 'eavesLF'
  | 'rakesLF'
  | 'eavesPlusRakes'
  | 'valleyLF'
  | 'eavesValleySqft'
  // gutter drivers (NaN = gutter / downspout feet missing -> flagged)
  | 'gutterLF'
  | 'downspoutLF'
  | 'insideCorners'
  | 'outsideCorners'
  | 'miters'
  | 'endCaps'
  | 'chainLF'
  | 'guardLF'
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
  areaWithWaste: 'Roof area incl. waste (sq ft)',
  ridgesLF: 'Ridges LF (report)',
  ridgesPlusHips: 'Ridges + hips LF (report)',
  eavesLF: 'Eaves LF (report)',
  rakesLF: 'Rakes LF (report)',
  eavesPlusRakes: 'Eaves + rakes LF (report)',
  valleyLF: 'Valleys LF (report)',
  eavesValleySqft: '(Eaves + valleys) × strip width, sq ft',
  gutterLF: 'Gutter ft (default = eaves)',
  downspoutLF: 'Downspout ft',
  insideCorners: 'Inside corners',
  outsideCorners: 'Outside corners',
  miters: 'Miters',
  endCaps: 'End caps (entered, else 1 per 20 ft)',
  chainLF: 'Rain chain ft',
  guardLF: 'Gutter guard ft',
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
    ...lengthDrivers(m),
    ...gutterDrivers(m),
    none: 0,
  };
}

const has = (v: number | undefined): v is number => v !== undefined && v !== null && Number.isFinite(v);
const sumOrNaN = (...vs: (number | undefined)[]) => (vs.every(has) ? vs.reduce<number>((a, b) => a + (b as number), 0) : NaN);

function lengthDrivers(m: Measurements) {
  // 0 = not in report -> flagged, never guessed — unless the user explicitly said "no valleys".
  const valley = m.valley > 0 ? m.valley : m.noValleys ? 0 : NaN;
  return {
    areaWithWaste: round2(m.area * (1 + m.waste / 100)),
    ridgesLF: sumOrNaN(m.ridges),
    ridgesPlusHips: sumOrNaN(m.ridges, m.hips),
    eavesLF: sumOrNaN(m.eaves),
    rakesLF: sumOrNaN(m.rakes),
    eavesPlusRakes: sumOrNaN(m.eaves, m.rakes),
    valleyLF: valley,
    eavesValleySqft: Number.isNaN(valley) || !has(m.eaves) ? NaN : round2((m.eaves + valley) * m.leakBarrierWidth),
  };
}

/** ASSUMPTION used only when no end-cap count is entered: 1 end cap per 20 ft of gutter. */
export const END_CAP_FT = 20;
/** Gutter feet: entered value, else the report's eave length. Missing or 0 -> NaN (flagged, never guessed). */
export function gutterFeetOf(m: Measurements): number {
  const v = m.gutterFeet !== undefined ? m.gutterFeet : m.eaves;
  return has(v) && v > 0 ? v : NaN;
}
function gutterDrivers(m: Measurements) {
  const n = (v: number | undefined) => (has(v) ? v : 0);
  // Blank = missing (NaN, flagged); explicit "none" or a typed 0 = none.
  const req = (none: boolean | undefined, v: number | undefined) => (none ? 0 : has(v) ? v : NaN);
  const g = gutterFeetOf(m);
  return {
    gutterLF: g,
    downspoutLF: req(m.noDownspouts, m.downspoutFeet),
    insideCorners: req(m.noInsideCorners, m.insideCorners),
    outsideCorners: req(m.noOutsideCorners, m.outsideCorners),
    miters: req(m.noMiters, m.miters),
    endCaps: has(m.endCaps) ? m.endCaps : Number.isNaN(g) ? NaN : ceilSafe(g / END_CAP_FT),
    chainLF: n(m.chainFeet),
    guardLF: n(m.guardFeet),
  };
}

/** True when the line's quantity depends on a report length that is missing (and no override is entered). */
export function lineMissing(line: Line, d: Drivers): boolean {
  if (line.override !== null && line.override !== undefined && Number.isFinite(Number(line.override))) return false;
  if (line.mode === 'fixed' || line.driver === 'none') return false;
  return Number.isNaN(d[line.driver]);
}
export const MISSING_NOTE = 'missing from report — enter the length or a quantity override';

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
  /** Visible, editable ASSUMPTION behind the rate (e.g. panel coverage width). */
  assumption?: string;
  /** Price is a PLACEHOLDER, not a supplier quote (shown as a tag, not part of the name). */
  placeholder?: boolean;
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
  /** undefined = asphalt shingles (all estimates made before roof types existed). */
  roofType?: RoofTypeId;
}

export function newEstimateData(
  m?: Measurements,
  source = '',
  catalog?: { materials?: Line[]; labor?: Line[] },
  roofType: RoofTypeId = 'asphalt_shingle',
): EstimateData {
  const fresh = (lines: Line[]) => lines.map((l) => ({ ...l, id: newId(), override: null }));
  const d: EstimateData = {
    measurements: m ?? { ...EMPTY_MEASUREMENTS },
    measurementSource: source,
    materials: catalog?.materials?.length ? fresh(catalog.materials) : defaultMaterialsFor(roofType),
    labor: catalog?.labor?.length ? fresh(catalog.labor) : defaultLaborFor(roofType),
    taxPct: 0,
    targetGp: 30,
  };
  if (roofType !== 'asphalt_shingle') d.roofType = roofType;
  return d;
}

// ---------------- Roof types ----------------
export type RoofTypeId = 'asphalt_shingle' | 'tuff_rib' | 'snap_lock' | 'mech_lock' | 'brava' | 'gutter_5in' | 'gutter_6in';
export const ROOF_TYPES: { id: RoofTypeId; label: string; note?: string }[] = [
  { id: 'asphalt_shingle', label: 'Asphalt shingles' },
  { id: 'tuff_rib', label: '3-ft Tuff Rib (exposed-fastener metal)' },
  { id: 'snap_lock', label: 'Snap-Lock standing seam (metal)' },
  { id: 'mech_lock', label: 'Mechanical-lock standing seam (metal)', note: 'Mechanical-lock seams must be closed with a mechanical seamer (rent or own) after panels are installed.' },
  { id: 'brava', label: 'Brava synthetic shake' },
  { id: 'gutter_5in', label: '5 inch gutter' },
  { id: 'gutter_6in', label: '6 inch gutter' },
];
export type GutterTypeId = 'gutter_5in' | 'gutter_6in';
export const isGutterType = (t: RoofTypeId | undefined): t is GutterTypeId => t === 'gutter_5in' || t === 'gutter_6in';
/** Estimate types the live DB check constraint accepts until the gutter migration is applied. */
export const DB_PENDING_TYPES: RoofTypeId[] = ['gutter_5in', 'gutter_6in'];
/** True when Postgres refused the save because estimates.roof_type is not in the (old) allowed list. */
export const isRoofTypeCheckError = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === '23514' || /check constraint/i.test(e.message ?? '')) && /estimates_roof_type_check/.test(e.message ?? '');
export const GUTTER_DEFAULTS_DISABLED =
  'Team default prices for gutters are turned off until the gutter database update is applied.';
export const GUTTER_DB_PENDING_MSG =
  'Gutter estimates need a database update that has not been applied yet (pending migration). You can build and review this gutter estimate, but it cannot be saved until the database change is applied. Nothing was saved.';
export const roofTypeOf = (e: Pick<EstimateData, 'roofType'>): RoofTypeId => e.roofType ?? 'asphalt_shingle';
export const roofTypeLabel = (id: RoofTypeId | undefined) => ROOF_TYPES.find((t) => t.id === (id ?? 'asphalt_shingle'))?.label ?? 'Asphalt shingles';
/** price_catalog row id holding team defaults for a roof type (shingles keep the original 'default' row). */
export const catalogIdFor = (id: RoofTypeId) => (id === 'asphalt_shingle' ? 'default' : `roof:${id}`);

export const PLACEHOLDER_TAG = 'PLACEHOLDER price';
/** Exact standing-seam coverage: 16 in = 4/3 ft. */
export const SEAM_16IN_FT = 4 / 3;
/** Exact clip coverage: (4/3 ft seam spacing) × 2 ft clip spacing = 8/3 sq ft per clip. */
export const CLIP_SQFT = 8 / 3;
/** Allow-list a stored roof type; anything unknown falls back to asphalt shingles. */
export function parseRoofType(v: unknown): RoofTypeId {
  return ROOF_TYPES.some((t) => t.id === v) ? (v as RoofTypeId) : 'asphalt_shingle';
}
function mk(name: string, unit: string, driver: DriverKey, mode: LineMode, rate: number, price: number, assumption?: string): Line {
  const l: Line = { id: newId(), name, unit, driver, mode, rate, price, override: null, placeholder: true };
  if (assumption) l.assumption = assumption;
  return l;
}

// All prices below are PLACEHOLDERS, not supplier quotes. Every rate is an editable ASSUMPTION.
function tuffRibMaterials(): Line[] {
  return [
    mk('Tuff Rib panels, 3 ft coverage', 'LF', 'areaWithWaste', 'coverage', 3, 3.25, 'ASSUMPTION: 36 in (3 ft) coverage width per panel → panel LF = area incl. waste ÷ 3. Edit the coverage if your panel differs.'),
    mk('Ridge / hip cap (10 ft)', 'piece', 'ridgesPlusHips', 'coverage', 10, 28, 'ASSUMPTION: 10 ft net per piece after laps.'),
    mk('Eave / drip trim (10 ft)', 'piece', 'eavesLF', 'coverage', 10, 14),
    mk('Rake / gable trim (10 ft)', 'piece', 'rakesLF', 'coverage', 10, 22),
    mk('Valley trim / flashing (10 ft)', 'piece', 'valleyLF', 'coverage', 10, 35),
    mk('Synthetic underlayment', 'roll', 'squares', 'coverage', 10, 165, 'ASSUMPTION: 10 squares per roll.'),
    mk('Screws with washers (bag of 250)', 'bag', 'squares', 'coverage', 3, 45, 'ASSUMPTION: ~80 screws per square → 1 bag per 3 squares.'),
    mk('Inside foam closures (3 ft) at eaves', 'piece', 'eavesLF', 'coverage', 3, 2.5, 'ASSUMPTION: 3 ft per closure strip.'),
    mk('Outside foam closures (3 ft) at ridge/hip', 'piece', 'ridgesPlusHips', 'coverage', 1.5, 2.5, 'ASSUMPTION: both sides of ridge/hip → 1 strip per 1.5 ft.'),
    mk('Sealant (tube)', 'tube', 'squares', 'coverage', 5, 9, 'ASSUMPTION: 1 tube per 5 squares.'),
    mk('Butyl tape (roll)', 'roll', 'none', 'fixed', 4, 18, 'ASSUMPTION: 4 rolls — edit per job.'),
    mk('Pipe boots (metal roof)', 'each', 'none', 'fixed', 3, 22, 'ASSUMPTION: 3 boots — count on site / from report.'),
  ];
}

function standingSeamMaterials(mech: boolean): Line[] {
  const kind = mech ? 'Mechanical-lock' : 'Snap-Lock';
  const lines = [
    mk(`${kind} standing seam panels, 16 in coverage`, 'LF', 'areaWithWaste', 'coverage', SEAM_16IN_FT, mech ? 6.5 : 5.5, 'ASSUMPTION: 16 in (4/3 ft) coverage width per panel → panel LF = area incl. waste × 3 ÷ 4. Edit for 12/18 in panels.'),
    mk('Panel clips', 'each', 'areaWithWaste', 'coverage', CLIP_SQFT, 0.85, 'ASSUMPTION: 1 clip per 8/3 sq ft (16 in seam spacing × clips every 24 in = 3/8 clip per sq ft).'),
    mk('Clip fasteners (box of 250)', 'box', 'areaWithWaste', 'coverage', 333, 40, 'ASSUMPTION: 2 screws per clip → 1 box per ~333 sq ft.'),
    mk('Ridge / hip cap (10 ft)', 'piece', 'ridgesPlusHips', 'coverage', 10, 38, 'ASSUMPTION: 10 ft net per piece after laps.'),
    mk('Eave / drip trim (10 ft)', 'piece', 'eavesLF', 'coverage', 10, 18),
    mk('Rake / gable trim (10 ft)', 'piece', 'rakesLF', 'coverage', 10, 26),
    mk('Valley flashing (10 ft)', 'piece', 'valleyLF', 'coverage', 10, 42),
    mk('High-temp synthetic underlayment', 'roll', 'squares', 'coverage', 2, 155, 'ASSUMPTION: 2 squares per roll (high-temp). Use regular synthetic by editing.'),
    mk('Ice & water at eaves + valleys', 'roll', 'eavesValleySqft', 'coverage', 200, 119, 'ASSUMPTION: 200 sq ft per roll; strip width = Leak barrier strip width.'),
    mk('Z-closures / seam closures at ridge (10 ft)', 'piece', 'ridgesPlusHips', 'coverage', 5, 12, 'ASSUMPTION: both sides of ridge/hip → 1 piece per 5 ft.'),
    mk('Pop rivets / trim fasteners (box)', 'box', 'squares', 'coverage', 15, 25, 'ASSUMPTION: 1 box per 15 squares.'),
    mk('Sealant (tube)', 'tube', 'squares', 'coverage', 5, 9, 'ASSUMPTION: 1 tube per 5 squares.'),
    mk('Butyl tape (roll)', 'roll', 'none', 'fixed', 4, 18, 'ASSUMPTION: 4 rolls — edit per job.'),
    mk('Pipe boots (metal roof)', 'each', 'none', 'fixed', 3, 22, 'ASSUMPTION: 3 boots — count on site / from report.'),
  ];
  if (mech) lines.push(mk('Mechanical seamer rental — REQUIRED to close mechanical-lock seams', 'rental', 'none', 'fixed', 1, 250, 'NOTE: seams must be mechanically seamed; rent or use own seamer.'));
  return lines;
}

function bravaMaterials(): Line[] {
  return [
    mk('Brava synthetic shake tiles (bundle)', 'bundle', 'squares', 'per', 4, 120, 'ASSUMPTION: 4 bundles per square at standard exposure — check Brava’s spec for your exposure and edit.'),
    mk('Synthetic underlayment', 'roll', 'squares', 'coverage', 10, 165, 'ASSUMPTION: 10 squares per roll.'),
    mk('Ice & water at eaves + valleys', 'roll', 'eavesValleySqft', 'coverage', 200, 119, 'ASSUMPTION: 200 sq ft per roll; strip width = Leak barrier strip width.'),
    mk('Stainless / coil nails (box)', 'box', 'squares', 'coverage', 5, 70, 'ASSUMPTION: 1 box per 5 squares.'),
    mk('Brava hip & ridge caps (bundle)', 'bundle', 'ridgesPlusHips', 'coverage', 20, 140, 'ASSUMPTION: 20 LF per bundle.'),
    mk('Brava starter (bundle)', 'bundle', 'eavesLF', 'coverage', 30, 95, 'ASSUMPTION: 30 LF per bundle.'),
    mk('Valley metal (10 ft)', 'piece', 'valleyLF', 'coverage', 10, 28),
    mk('Drip edge (10 ft), eaves + rakes', 'piece', 'eavesPlusRakes', 'coverage', 10, 12),
    mk('Sealant (tube)', 'tube', 'squares', 'coverage', 5, 9, 'ASSUMPTION: 1 tube per 5 squares.'),
    mk('Pipe boots', 'each', 'none', 'fixed', 3, 18, 'ASSUMPTION: 3 boots — count on site / from report.'),
  ];
}

/** Gutter summary: feet plus 10 ft section / piece counts (for orders and the screen). */
export function gutterSummary(m: Measurements) {
  const g = gutterFeetOf(m);
  const ds = m.noDownspouts ? 0 : has(m.downspoutFeet) ? m.downspoutFeet : NaN;
  return {
    gutterFeet: g,
    gutterSections: Number.isNaN(g) ? NaN : ceilSafe(g / 10),
    downspoutFeet: ds,
    downspoutPieces: Number.isNaN(ds) ? NaN : ceilSafe(ds / 10),
  };
}

// All gutter prices are PLACEHOLDERS (6 in slightly higher than 5 in). Every rate is an editable ASSUMPTION.
function gutterMaterials(t: GutterTypeId): Line[] {
  const six = t === 'gutter_6in';
  const sz = six ? '6 in' : '5 in';
  const ds = six ? '3x4 in' : '2x3 in';
  const p = (five: number, sixP: number) => (six ? sixP : five);
  return [
    mk(`${sz} K-style gutter (10 ft section)`, 'section', 'gutterLF', 'coverage', 10, p(32, 39), 'ASSUMPTION: gutter feet default to the report eave length (edit Gutter ft to override); 10 ft per section.'),
    mk(`${ds} downspout (10 ft piece)`, 'piece', 'downspoutLF', 'coverage', 10, p(18, 26), 'ASSUMPTION: 10 ft per piece.'),
    mk(`${ds} elbow A`, 'each', 'downspoutLF', 'coverage', 10, p(4.5, 6.5), 'ASSUMPTION: one drop per ~20 ft of downspout, 2 A elbows per drop → 1 per 10 ft. Edit or override with your count.'),
    mk(`${ds} elbow B`, 'each', 'downspoutLF', 'coverage', 20, p(4.5, 6.5), 'ASSUMPTION: 1 B elbow per drop (~20 ft of downspout). Edit or override.'),
    mk(`${sz} inside corner`, 'each', 'insideCorners', 'per', 1, p(14, 18)),
    mk(`${sz} outside corner`, 'each', 'outsideCorners', 'per', 1, p(14, 18)),
    mk(`${sz} miter (3 ft)`, 'each', 'miters', 'per', 1, p(22, 28)),
    mk(`${sz} end cap`, 'each', 'endCaps', 'per', 1, p(3, 4), 'ASSUMPTION (only when End caps is blank): 1 per 20 ft of gutter. Real count is 2 per run — enter End caps in the Gutters section.'),
    mk(`${sz} hidden hanger`, 'each', 'gutterLF', 'coverage', 2, p(1.25, 1.6), 'ASSUMPTION: one hanger every 24 in (2 ft). Edit spacing (e.g. 1.5 for snow load).'),
    mk('Gutter screws / fasteners (box of 100)', 'box', 'gutterLF', 'coverage', 100, p(12, 14), 'ASSUMPTION: 1 box per 100 ft of gutter.'),
    mk('Gutter sealant (tube)', 'tube', 'gutterLF', 'coverage', 25, p(9, 10), 'ASSUMPTION: 1 tube per 25 ft of gutter.'),
    mk('Downspout straps / brackets', 'each', 'downspoutLF', 'coverage', 6, p(2, 2.5), 'ASSUMPTION: one strap every 6 ft of downspout.'),
    mk('Rain chain', 'ft', 'chainLF', 'per', 1, p(9, 10)),
    mk(`${sz} gutter guard / leaf screen`, 'ft', 'guardLF', 'per', 1, p(3.5, 4.25), 'Optional: only priced when guard feet are entered.'),
  ];
}

function gutterLabor(t: GutterTypeId): Line[] {
  const six = t === 'gutter_6in';
  return [
    mk('Gutter install', 'LF', 'gutterLF', 'per', 1, six ? 5 : 4.5),
    mk('Downspout install', 'LF', 'downspoutLF', 'per', 1, six ? 4 : 3.5),
    mk('Inside corner install', 'each', 'insideCorners', 'per', 1, 15),
    mk('Outside corner install', 'each', 'outsideCorners', 'per', 1, 15),
    mk('Miter install', 'each', 'miters', 'per', 1, 20),
    mk('Rain chain install', 'LF', 'chainLF', 'per', 1, 3),
    mk('Gutter guard install', 'LF', 'guardLF', 'per', 1, six ? 2.5 : 2),
    mk('Old gutter removal & haul-off', 'LF', 'gutterLF', 'per', 1, 1.25, 'ASSUMPTION: existing gutters are removed along the full gutter length. Set qty override 0 if new construction.'),
  ];
}

function typeLabor(install: string, installRate: number, extra: Line[] = []): Line[] {
  return [
    mk('Tear-off', 'SQ', 'squares', 'per', 1, 45),
    mk('Underlayment', 'SQ', 'squares', 'per', 1, 20),
    mk(install, 'SQ', 'squares', 'per', 1, installRate),
    mk('Steep pitch surcharge', 'SQ', 'steepSquares', 'per', 1, 30),
    mk('Eave + rake trim install', 'LF', 'eavesPlusRakes', 'per', 1, 3),
    mk('Ridge / hip cap install', 'LF', 'ridgesPlusHips', 'per', 1, 5),
    mk('Valley install', 'LF', 'valleyLF', 'per', 1, 6),
    ...extra,
    mk('Dumpster / disposal', 'each', 'none', 'fixed', 1, 450),
  ];
}

export function defaultMaterialsFor(t: RoofTypeId): Line[] {
  switch (t) {
    case 'tuff_rib': return tuffRibMaterials();
    case 'snap_lock': return standingSeamMaterials(false);
    case 'mech_lock': return standingSeamMaterials(true);
    case 'brava': return bravaMaterials();
    case 'gutter_5in':
    case 'gutter_6in': return gutterMaterials(t);
    default: return defaultMaterials();
  }
}

export function defaultLaborFor(t: RoofTypeId): Line[] {
  switch (t) {
    case 'tuff_rib': return typeLabor('Tuff Rib panel install', 180);
    case 'snap_lock': return typeLabor('Snap-Lock panel install', 300);
    case 'mech_lock': return typeLabor('Mechanical-lock panel install', 330, [mk('Mechanical seaming', 'SQ', 'squares', 'per', 1, 40)]);
    case 'brava': return typeLabor('Brava shake install', 275);
    case 'gutter_5in':
    case 'gutter_6in': return gutterLabor(t);
    default: return defaultLabor();
  }
}

/** Switch an estimate to another roof type: replaces generated lines with that type's defaults, keeps custom lines. */
export function switchRoofType(e: EstimateData, t: RoofTypeId, catalog?: { materials?: Line[]; labor?: Line[] }): EstimateData {
  const fresh = (lines: Line[]) => lines.map((l) => ({ ...l, id: newId(), override: null }));
  const keep = (ls: Line[]) => ls.filter((l) => l.custom);
  const out: EstimateData = {
    ...e,
    materials: [...(catalog?.materials?.length ? fresh(catalog.materials) : defaultMaterialsFor(t)), ...keep(e.materials)],
    labor: [...(catalog?.labor?.length ? fresh(catalog.labor) : defaultLaborFor(t)), ...keep(e.labor)],
  };
  out.roofType = t;
  return out;
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
  /** Lines whose quantity depends on a report length that is missing — price is incomplete while > 0. */
  missingCount: number;
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
  const missingCount = [...e.materials, ...e.labor].filter((l) => lineMissing(l, drivers)).length;
  return { missingCount, drivers, materialSubtotal, tax, materialTotal, laborTotal, directCost, price, grossProfit, gpPct, valid };
}

/** Banner text shown on totals, orders and print view when lengths are missing. */
export const missingBanner = (n: number) =>
  `⚠ ${n} item${n === 1 ? '' : 's'} missing from the report — price incomplete. Enter the lengths (or 0 / "no valleys" if there are none) before approving.`;

/** Same rule as Measurements.tsx: a length must be a finite number ≥ 0. Returns null when invalid. */
export const parseLength = (v: string): number | null => {
  const n = Number(v);
  return v.trim() === '' || !Number.isFinite(n) || n < 0 ? null : n;
};

/** True when a Supabase/PostgREST error says the estimates.missing_count column does not exist yet. */
export const isMissingCountColumnError = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === 'PGRST204' || e.code === '42703') && /missing_count/.test(e.message ?? '');
/** True when the database trigger refused approval because items are missing. */
export const isMissingItemsRefusal = (e: { message?: string } | null | undefined) => /RR_MISSING_ITEMS/.test(e?.message ?? '');
