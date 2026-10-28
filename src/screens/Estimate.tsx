import { useEffect, useMemo, useState } from 'react';
import { logEvent, supabase, type EstimateRow, type Job } from '../lib/supabase';
import {
  DRIVER_LABELS,
  MEASUREMENT_FIELDS,
  computeTotals,
  lineQty,
  lineTotal,
  newEstimateData,
  newId,
  normalizeMeasurements,
  type DriverKey,
  type Drivers,
  type EstimateData,
  type Line,
  type LineMode,
  type Measurements,
} from '../lib/estimate';
import { money, money0 } from '../lib/stages';
import { go } from '../lib/nav';

type Catalog = { materials?: Line[]; labor?: Line[] } | undefined;

function hydrate(raw: unknown, job: Job, catalog: Catalog): EstimateData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<EstimateData>;
  if (!r.materials || !r.labor) {
    return newEstimateData(normalizeMeasurements(job.measurements), job.measurement_source || '', catalog);
  }
  return {
    measurements: normalizeMeasurements(r.measurements),
    measurementSource: r.measurementSource ?? '',
    materials: r.materials,
    labor: r.labor,
    taxPct: Number(r.taxPct) || 0,
    targetGp: r.targetGp === undefined ? 30 : Number(r.targetGp),
    notes: r.notes ?? '',
  };
}

const num = (v: string) => (v === '' ? 0 : Number(v));

// One in-flight "create revision 1" per job, so a double render/effect can't insert twice.
const creating = new Map<string, Promise<void>>();
async function ensureFirstDraft(jobId: string, d: EstimateData) {
  let p = creating.get(jobId);
  if (!p) {
    p = (async () => {
      const t = computeTotals(d);
      const { error } = await supabase.from('estimates').insert({
        job_id: jobId, revision: 1, status: 'draft', data: d,
        material_total: t.materialTotal, labor_total: t.laborTotal, target_gp: d.targetGp, price: t.price,
      });
      // 23505 = revision 1 already exists (created on another phone / tab) — just reload it.
      if (error && error.code !== '23505') throw error;
      if (!error) await logEvent(jobId, 'estimate_created', `Draft rev 1 created — ${money(t.price)}`);
    })().finally(() => creating.delete(jobId));
    creating.set(jobId, p);
  }
  return p;
}

function LineEditor({
  line,
  drivers,
  readOnly,
  onChange,
  onRemove,
}: {
  line: Line;
  drivers: Drivers;
  readOnly: boolean;
  onChange: (l: Line) => void;
  onRemove: () => void;
}) {
  const q = lineQty(line, drivers);
  const up = (p: Partial<Line>) => onChange({ ...line, ...p });
  const formula =
    line.override !== null
      ? 'override'
      : line.mode === 'fixed'
        ? 'fixed qty'
        : line.mode === 'per'
          ? `${drivers[line.driver] ?? 0} ${DRIVER_LABELS[line.driver]} × ${line.rate}`
          : `${drivers[line.driver] ?? 0} ${DRIVER_LABELS[line.driver]} ÷ ${line.rate}`;
  return (
    <div className="line">
      <div className="row gap">
        <input className="grow name" value={line.name} disabled={readOnly} onChange={(e) => up({ name: e.target.value })} />
        {!readOnly && <button className="btn small ghost" onClick={onRemove} aria-label="Remove line">✕</button>}
      </div>
      <div className="row gap">
        <label className="grow">$/{line.unit || 'unit'}
          <input type="number" inputMode="decimal" step="0.01" value={line.price} disabled={readOnly} onChange={(e) => up({ price: num(e.target.value) })} />
        </label>
        <label className="grow">Qty override
          <input
            type="number"
            inputMode="decimal"
            placeholder={String(q)}
            value={line.override ?? ''}
            disabled={readOnly}
            onChange={(e) => up({ override: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </label>
        <div className="calc">
          <b>{q} {line.unit}</b>
          <span>{money(lineTotal(line, drivers))}</span>
        </div>
      </div>
      <details>
        <summary className="muted small">{formula}</summary>
        <div className="row gap wrap">
          <label className="grow">Unit<input value={line.unit} disabled={readOnly} onChange={(e) => up({ unit: e.target.value })} /></label>
          <label className="grow">Method
            <select value={line.mode} disabled={readOnly} onChange={(e) => up({ mode: e.target.value as LineMode })}>
              <option value="per">driver × rate</option>
              <option value="coverage">driver ÷ coverage</option>
              <option value="fixed">fixed qty</option>
            </select>
          </label>
          {line.mode !== 'fixed' && (
            <label className="grow">Driver
              <select value={line.driver} disabled={readOnly} onChange={(e) => up({ driver: e.target.value as DriverKey })}>
                {(Object.keys(DRIVER_LABELS) as DriverKey[]).filter((k) => k !== 'none').map((k) => (
                  <option key={k} value={k}>{DRIVER_LABELS[k]}</option>
                ))}
              </select>
            </label>
          )}
          <label className="grow">{line.mode === 'fixed' ? 'Qty' : line.mode === 'per' ? 'Rate' : 'Coverage/unit'}
            <input type="number" inputMode="decimal" value={line.rate} disabled={readOnly} onChange={(e) => up({ rate: num(e.target.value) })} />
          </label>
        </div>
      </details>
    </div>
  );
}

export default function Estimate({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [rows, setRows] = useState<EstimateRow[]>([]);
  const [current, setCurrent] = useState<EstimateRow | null>(null);
  const [data, setData] = useState<EstimateData | null>(null);
  const [catalog, setCatalog] = useState<Catalog>(undefined);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load(selectId?: string) {
    setErr('');
    const [j, e, c] = await Promise.all([
      supabase.from('jobs').select('*, customers(*)').eq('id', jobId).maybeSingle(),
      supabase.from('estimates').select('*').eq('job_id', jobId).order('revision', { ascending: false }),
      supabase.from('price_catalog').select('*').eq('id', 'default').maybeSingle(),
    ]);
    if (j.error || !j.data) return setErr(j.error?.message || 'Job not found');
    if (e.error) return setErr(e.error.message);
    const jobRow = j.data as Job;
    const cat: Catalog = c.data ? { materials: c.data.materials as Line[], labor: c.data.labor as Line[] } : undefined;
    let list = (e.data as EstimateRow[]) ?? [];
    if (list.length === 0) {
      // No estimate yet: create draft revision 1 from the job's measurements + default lines right away,
      // so the numbers exist (and show on the job / orders screens) without a separate "create" step.
      try {
        await ensureFirstDraft(jobId, hydrate(undefined, jobRow, cat));
      } catch (ex) {
        return setErr(`Could not create the estimate: ${(ex as Error).message}`);
      }
      const again = await supabase.from('estimates').select('*').eq('job_id', jobId).order('revision', { ascending: false });
      if (again.error) return setErr(again.error.message);
      list = (again.data as EstimateRow[]) ?? [];
    }
    setJob(jobRow);
    setCatalog(cat);
    setRows(list);
    const pick = list.find((r) => r.id === selectId) ?? list[0] ?? null;
    setCurrent(pick);
    setData(hydrate(pick?.data, jobRow, cat));
    setDirty(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const totals = useMemo(() => (data ? computeTotals(data) : null), [data]);
  const readOnly = !!current && current.status !== 'draft';

  if (err && !data) return <div className="page"><button className="btn ghost small" onClick={() => go(`/job/${jobId}`)}>‹ Job</button><div className="error">{err}</div></div>;
  if (!data || !totals || !job) return <div className="page center muted">Loading…</div>;

  const update = (p: Partial<EstimateData>) => {
    setData({ ...data, ...p });
    setDirty(true);
    setMsg('');
  };
  const setM = (k: keyof Measurements, v: string) => update({ measurements: { ...data.measurements, [k]: num(v) } });
  const setLine = (kind: 'materials' | 'labor', i: number, l: Line) => {
    const arr = [...data[kind]];
    arr[i] = l;
    update({ [kind]: arr } as Partial<EstimateData>);
  };
  const removeLine = (kind: 'materials' | 'labor', i: number) => {
    if (!confirm(`Remove "${data[kind][i].name}"?`)) return;
    update({ [kind]: data[kind].filter((_, k) => k !== i) } as Partial<EstimateData>);
  };
  const addLine = (kind: 'materials' | 'labor') =>
    update({
      [kind]: [
        ...data[kind],
        { id: newId(), name: kind === 'materials' ? 'Custom material' : 'Custom labor', unit: 'each', driver: 'none', mode: 'fixed', rate: 1, price: 0, override: null, custom: true },
      ],
    } as Partial<EstimateData>);

  const dbFields = (d: EstimateData) => {
    const t = computeTotals(d);
    return { data: d, material_total: t.materialTotal, labor_total: t.laborTotal, target_gp: d.targetGp, price: t.price };
  };

  async function persist(): Promise<EstimateRow | null> {
    if (!data || !job) return null;
    let row: EstimateRow;
    if (current) {
      const { data: r, error } = await supabase.from('estimates').update(dbFields(data)).eq('id', current.id).select('*').single();
      if (error) throw error;
      row = r as EstimateRow;
    } else {
      const { data: r, error } = await supabase.from('estimates').insert({ job_id: jobId, revision: 1, status: 'draft', ...dbFields(data) }).select('*').single();
      if (error) throw error;
      row = r as EstimateRow;
    }
    const { error: je } = await supabase
      .from('jobs')
      .update({ measurements: data.measurements, measurement_source: data.measurementSource })
      .eq('id', jobId);
    if (je) throw je;
    return row;
  }

  async function run(label: string, fn: () => Promise<string | void>) {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const out = await fn();
      if (out) setMsg(out);
    } catch (e) {
      setErr(`${label}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run('Save failed', async () => {
      const row = await persist();
      if (!row) return;
      await logEvent(jobId, 'estimate_saved', `Rev ${row.revision} saved — price ${money(row.price)}`);
      await load(row.id);
      return 'Saved';
    });

  const newRevision = () =>
    run('New revision failed', async () => {
      if (dirty && current?.status === 'draft' && confirm('Save changes to this revision first?')) await persist();
      const next = Math.max(0, ...rows.map((r) => r.revision)) + 1;
      const copy: EstimateData = JSON.parse(JSON.stringify(data));
      const { data: r, error } = await supabase.from('estimates').insert({ job_id: jobId, revision: next, status: 'draft', ...dbFields(copy) }).select('*').single();
      if (error) throw error;
      await logEvent(jobId, 'estimate_revision', `Rev ${next} created`);
      await load((r as EstimateRow).id);
      return `Revision ${next} created`;
    });

  const approve = () =>
    run('Approve failed', async () => {
      if (!confirm(`Approve this estimate at ${money(totals.price)}? Older revisions will be marked superseded and the job value set to this price.`)) return;
      const row = await persist();
      if (!row) return;
      const { data: u } = await supabase.auth.getUser();
      const { error: e1 } = await supabase
        .from('estimates')
        .update({ status: 'approved', approved_by: u.user?.id ?? null, approved_at: new Date().toISOString() })
        .eq('id', row.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('estimates').update({ status: 'superseded' }).eq('job_id', jobId).neq('id', row.id);
      if (e2) throw e2;
      await supabase.from('jobs').update({ value: row.price }).eq('id', jobId);
      await logEvent(jobId, 'estimate_approved', `Rev ${row.revision} approved — ${money(row.price)}`);
      await load(row.id);
      return 'Approved';
    });

  const saveDefaults = () =>
    run('Saving defaults failed', async () => {
      if (!confirm('Save these material and labor lines (names, prices, coverage) as the team default for NEW estimates?')) return;
      const strip = (ls: Line[]) => ls.map((l) => ({ ...l, override: null }));
      const { error } = await supabase
        .from('price_catalog')
        .upsert({ id: 'default', materials: strip(data.materials), labor: strip(data.labor) });
      if (error) throw error;
      setCatalog({ materials: data.materials, labor: data.labor });
      return 'Saved as team defaults';
    });

  const switchTo = (id: string) => {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    const r = rows.find((x) => x.id === id) ?? null;
    setCurrent(r);
    setData(hydrate(r?.data, job, catalog));
    setDirty(false);
  };

  const d = totals.drivers;
  const noMeasurements = !(data.measurements.area > 0);
  return (
    <div className="page">
      <div className="stickyhead">
        <header className="topbar">
          <button className="btn ghost small" onClick={() => (!dirty || confirm('Leave without saving?')) && go(`/job/${jobId}`)}>‹ Job</button>
          <h1 className="title-sm">Estimate{current ? ` · Rev ${current.revision}` : ''}</h1>
          <span />
        </header>
        <div className="sumbar" aria-label="Estimate totals">
          <div className="price"><span>Price</span><b>{totals.valid ? money0(totals.price) : '—'}</b></div>
          <div><span>Cost</span><b>{money0(totals.directCost)}</b></div>
          <div><span>GP · SQ</span><b>{totals.gpPct}% · {d.squares}</b></div>
        </div>
      </div>
      <p className="pad-x muted">{job.customers?.name ? job.customers.name + ' · ' : ''}{job.address}{dirty ? ' · unsaved changes' : ''}</p>

      {noMeasurements && (
        <div className="card notice stack">
          <b>No roof measurements yet — quantities are 0 until you add them (only fixed items like the dumpster are priced).</b>
          <span>Enter measurements or upload a report.</span>
          <div className="row gap">
            <button className="btn grow" onClick={() => document.getElementById('m-area')?.focus()}>Enter measurements</button>
            {!readOnly && <button className="btn primary grow" onClick={() => (!dirty || confirm('Leave without saving?')) && go(`/job/${jobId}/measurements`)}>Upload report (PDF)</button>}
          </div>
        </div>
      )}

      <div className="card">
        <div className="row gap wrap">
          {rows.length > 0 ? (
            <select className="grow" value={current?.id} onChange={(e) => switchTo(e.target.value)}>
              {rows.map((r) => (
                <option key={r.id} value={r.id}>Rev {r.revision} — {r.status} — {money(r.price)}</option>
              ))}
            </select>
          ) : (
            <span className="grow muted">New estimate (not saved yet)</span>
          )}
          {current && <span className={`tag ${current.status}`}>{current.status}</span>}
        </div>
        {readOnly && <p className="muted small">This revision is {current?.status}. Tap “New revision” to make changes.</p>}
      </div>

      <div className="card">
        <div className="row between">
          <h2>Measurements</h2>
          {!readOnly && <button className="btn ghost small" onClick={() => (!dirty || confirm('Leave without saving?')) && go(`/job/${jobId}/measurements`)}>Upload PDF</button>}
        </div>
        <label>Measurement source
          <input value={data.measurementSource} disabled={readOnly} placeholder="e.g. GAF QuickMeasure, EagleView, tape" onChange={(e) => update({ measurementSource: e.target.value })} />
        </label>
        <div className="grid2">
          {MEASUREMENT_FIELDS.map((fld) => (
            <label key={fld.key}>{fld.label} ({fld.unit})
              <input id={`m-${fld.key}`} type="number" inputMode="decimal" value={data.measurements[fld.key]} disabled={readOnly} onChange={(e) => setM(fld.key, e.target.value)} />
            </label>
          ))}
        </div>
        <p className="derived">
          <b>{d.squares}</b> squares · steep {d.steepSquares} SQ · leak barrier {d.leakBarrierSqft} sq ft
        </p>
      </div>

      <div className="card">
        <h2>Materials</h2>
        <p className="placeholder">Prices & coverage are editable PLACEHOLDERS — confirm with your supplier.</p>
        {data.materials.map((l, i) => (
          <LineEditor key={l.id} line={l} drivers={d} readOnly={readOnly} onChange={(x) => setLine('materials', i, x)} onRemove={() => removeLine('materials', i)} />
        ))}
        {!readOnly && <button className="btn" onClick={() => addLine('materials')}>+ Custom material line</button>}
      </div>

      <div className="card">
        <h2>Labor</h2>
        <p className="placeholder">Labor rates are editable PLACEHOLDERS.</p>
        {data.labor.map((l, i) => (
          <LineEditor key={l.id} line={l} drivers={d} readOnly={readOnly} onChange={(x) => setLine('labor', i, x)} onRemove={() => removeLine('labor', i)} />
        ))}
        {!readOnly && <button className="btn" onClick={() => addLine('labor')}>+ Custom labor line</button>}
      </div>

      <div className="card">
        <h2>Pricing</h2>
        <div className="row gap">
          <label className="grow">Tax on materials (%)
            <input type="number" inputMode="decimal" value={data.taxPct} disabled={readOnly} onChange={(e) => update({ taxPct: num(e.target.value) })} />
          </label>
          <label className="grow">Target gross profit (%)
            <input type="number" inputMode="decimal" value={data.targetGp} disabled={readOnly} onChange={(e) => update({ targetGp: num(e.target.value) })} />
          </label>
        </div>
        <p className="muted small">Montana has no state sales tax (default 0). Price = direct cost ÷ (1 − target GP).</p>
        <table className="totals">
          <tbody>
            <tr><td>Materials</td><td>{money(totals.materialSubtotal)}</td></tr>
            {totals.tax > 0 && <tr><td>Tax</td><td>{money(totals.tax)}</td></tr>}
            <tr><td>Labor</td><td>{money(totals.laborTotal)}</td></tr>
            <tr className="sep"><td>Direct cost</td><td>{money(totals.directCost)}</td></tr>
            <tr className="big"><td>Selling price</td><td>{totals.valid ? money(totals.price) : 'GP must be < 100%'}</td></tr>
            <tr><td>Gross profit</td><td>{money(totals.grossProfit)} ({totals.gpPct}%)</td></tr>
          </tbody>
        </table>
      </div>

      {err && <div className="error pad-x">{err}</div>}
      {msg && <div className="ok pad-x">{msg}</div>}

      <div className="actions">
        {!readOnly && <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Working…' : dirty || !current ? 'Save estimate' : 'Saved ✓'}</button>}
        {!readOnly && totals.valid && <button className="btn" disabled={busy} onClick={approve}>Approve</button>}
        <button className="btn" disabled={busy} onClick={newRevision}>New revision</button>
        {current && <button className="btn" disabled={busy || dirty} onClick={() => go(`/job/${jobId}/orders`)}>Orders</button>}
      </div>
      {!readOnly && (
        <div className="pad-x">
          <button className="btn ghost small" disabled={busy} onClick={saveDefaults}>Save these lines as team default prices</button>
        </div>
      )}
    </div>
  );
}
