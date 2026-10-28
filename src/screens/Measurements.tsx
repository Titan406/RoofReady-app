import { useEffect, useMemo, useState } from 'react';
import { logEvent, supabase, type EstimateRow, type Job } from '../lib/supabase';
import { EMPTY_MEASUREMENTS, MEASUREMENT_FIELDS, computeTotals, normalizeMeasurements, type EstimateData, type Measurements as M } from '../lib/estimate';
import { parseReport, sumHints, STEEP_PITCH_DEFAULT, type ParsedReport } from '../lib/reportParser';
import { extractInBrowser, MIN_TEXT_CHARS } from '../lib/pdfText';
import { go } from '../lib/nav';

type Vals = Record<keyof M, string>;
const emptyVals = (): Vals => Object.fromEntries(MEASUREMENT_FIELDS.map((f) => [f.key, ''])) as Vals;

interface Review {
  fileName: string;
  parsed: ParsedReport | null; // null = entering by hand
  text: string;
  vals: Vals;
  source: string;
}

export default function Measurements({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [steepFrom, setSteepFrom] = useState(STEEP_PITCH_DEFAULT);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [noText, setNoText] = useState('');

  useEffect(() => {
    supabase.from('jobs').select('*, customers(*)').eq('id', jobId).maybeSingle().then(({ data, error }) => {
      if (error || !data) setErr(error?.message || 'Job not found');
      else setJob(data as Job);
    });
  }, [jobId]);

  const saved = useMemo(() => (job?.measurements ?? {}) as Record<string, unknown>, [job]);

  async function onFile(file: File | undefined) {
    setErr('');
    setNoText('');
    setReview(null);
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return setErr('That file is not a PDF.');
    if (file.size > 40 * 1024 * 1024) return setErr('That PDF is over 40 MB — too large to read on the phone.');
    setBusy(true);
    try {
      const t = await extractInBrowser(file);
      if (t.chars < MIN_TEXT_CHARS) {
        setNoText(file.name);
        return;
      }
      const parsed = parseReport(t.text, steepFrom);
      const vals = emptyVals();
      for (const f of MEASUREMENT_FIELDS) if (parsed.values[f.key] !== undefined) vals[f.key] = String(parsed.values[f.key]);
      const fmt = parsed.format === 'Unknown report' ? 'Measurement report' : parsed.format;
      setReview({ fileName: file.name, parsed, text: t.text, vals, source: `${fmt} PDF: ${file.name}` });
    } catch (e) {
      setErr(`Could not read that PDF: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function byHand() {
    setNoText('');
    const vals = emptyVals();
    for (const f of MEASUREMENT_FIELDS) if (saved[f.key] !== undefined && saved[f.key] !== '') vals[f.key] = String(saved[f.key]);
    setReview({ fileName: '', parsed: null, text: '', vals, source: job?.measurement_source || 'Entered by hand' });
  }

  function changeSteep(n: number) {
    setSteepFrom(n);
    if (!review?.parsed) return;
    const p = parseReport(review.text, n);
    const share = p.values.steepShare;
    setReview({ ...review, parsed: p, vals: { ...review.vals, steepShare: share === undefined ? '' : String(share) } });
  }

  async function useThese() {
    if (!review || !job) return;
    const out: Record<string, number> = {};
    for (const f of MEASUREMENT_FIELDS) {
      const v = review.vals[f.key].trim();
      if (v === '') continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return setErr(`${f.label}: “${v}” is not a valid number.`);
      out[f.key] = n;
    }
    if (out.area === undefined && !confirm('Roof area is empty — the estimate will show 0 squares. Save anyway?')) return;
    setBusy(true);
    setErr('');
    try {
      const { error } = await supabase.from('jobs').update({ measurements: out, measurement_source: review.source.trim() }).eq('id', jobId);
      if (error) throw error;
      await logEvent(jobId, 'measurements_saved', `Measurements saved from ${review.source.trim() || 'manual entry'}`);
      // Keep the latest DRAFT estimate in step; approved revisions are never changed.
      const { data: est } = await supabase.from('estimates').select('*').eq('job_id', jobId).order('revision', { ascending: false }).limit(1);
      const latest = (est as EstimateRow[] | null)?.[0];
      if (latest && latest.status === 'draft' && latest.data && typeof latest.data === 'object' && (latest.data as EstimateData).materials) {
        const d: EstimateData = { ...(latest.data as EstimateData), measurements: normalizeMeasurements(out), measurementSource: review.source.trim() };
        const t = computeTotals(d);
        const { error: ue } = await supabase
          .from('estimates')
          .update({ data: d, material_total: t.materialTotal, labor_total: t.laborTotal, price: t.price, target_gp: d.targetGp })
          .eq('id', latest.id);
        if (ue) throw ue;
      }
      go(`/job/${jobId}/estimate`);
    } catch (e) {
      setErr(`Save failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const setVal = (k: keyof M, v: string) => review && setReview({ ...review, vals: { ...review.vals, [k]: v } });
  const hints = review?.parsed ? sumHints(review.parsed.raw) : [];
  const raw = review?.parsed?.raw;

  return (
    <div className="page">
      <header className="topbar">
        <button className="btn ghost small" onClick={() => go(`/job/${jobId}`)}>‹ Job</button>
        <h1 className="title-sm">Measurements</h1>
        <span />
      </header>
      {job && <p className="pad-x muted">{job.customers?.name ? job.customers.name + ' · ' : ''}{job.address}</p>}
      {err && <div className="error pad-x">{err}</div>}

      {!review && (
        <div className="card stack">
          <h2>Upload a measurement report</h2>
          <p className="muted small">
            GAF QuickMeasure, EagleView, RoofScope or Hover PDF. The PDF is read <b>on this phone only</b> — it is not uploaded or sent anywhere.
            Nothing is saved until you review the numbers and tap “Use these measurements”.
          </p>
          <label className="btn primary filebtn">
            {busy ? 'Reading PDF…' : 'Choose PDF'}
            <input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <button className="btn" onClick={byHand} disabled={busy}>Enter measurements by hand</button>
          {noText && (
            <div className="error">
              <b>“{noText}” has no readable text.</b> It looks like a scanned page or a picture, so the app can’t read numbers from it.
              Please type the values by hand (tap “Enter measurements by hand”).
            </div>
          )}
        </div>
      )}

      {review && (
        <>
          <div className="card stack">
            <h2>{review.parsed ? 'Review numbers from the report' : 'Enter measurements'}</h2>
            {review.parsed && (
              <p className="small">
                Read from <b>{review.fileName}</b> — detected: <b>{review.parsed.format}</b>.{' '}
                <span className="muted">Only numbers printed in the report are filled in. Anything not found is left empty — nothing is guessed. Check every value against the report.</span>
              </p>
            )}
            {review.parsed?.warnings.map((w, i) => <p key={i} className="placeholder">{w}</p>)}
            <label>Measurement source<input value={review.source} onChange={(e) => setReview({ ...review, source: e.target.value })} /></label>
          </div>

          <div className="card">
            <div className="revhead"><span>Field</span>{review.parsed && <span>In report</span>}<span>Use</span></div>
            {MEASUREMENT_FIELDS.map((f) => {
              const found = review.parsed?.values[f.key];
              const cur = saved[f.key];
              const hint = hints.filter((h) => h.field === f.key);
              return (
                <div key={f.key} className={`revrow ${review.parsed ? (found !== undefined ? 'found' : 'missing') : ''}`}>
                  <div className="revlabel">
                    <b>{f.label}</b> <span className="muted small">({f.unit})</span>
                    {cur !== undefined && cur !== '' && <div className="muted small">Saved now: {String(cur)}</div>}
                    {review.vals[f.key] === '' && EMPTY_MEASUREMENTS[f.key] > 0 && (
                      <div className="muted small">If left empty the estimate uses the app default {EMPTY_MEASUREMENTS[f.key]} {f.unit}.</div>
                    )}
                  </div>
                  {review.parsed && (
                    <div className="revfound small">
                      {found !== undefined ? <><span className="tag approved">Found</span> {found}</> : <span className="tag draft">Not found</span>}
                      {review.parsed.notes[f.key] && <div className="muted">{review.parsed.notes[f.key]}</div>}
                      {f.key === 'steepShare' && (
                        <label className="small">Steep = pitch from
                          <select value={steepFrom} onChange={(e) => changeSteep(Number(e.target.value))}>
                            {[6, 7, 8, 9, 10, 12].map((n) => <option key={n} value={n}>{n}/12 up</option>)}
                          </select>
                        </label>
                      )}
                      {hint.map((h) => (
                        <button key={h.label} className="btn small ghost" onClick={() => setVal(f.key, String(h.value))}>Use {h.label} = {h.value}</button>
                      ))}
                    </div>
                  )}
                  <input
                    aria-label={f.label}
                    type="number"
                    inputMode="decimal"
                    placeholder="empty"
                    value={review.vals[f.key]}
                    onChange={(e) => setVal(f.key, e.target.value)}
                  />
                </div>
              );
            })}
          </div>

          {review.parsed && raw && (
            <div className="card">
              <h2>Other numbers in the report</h2>
              <p className="muted small">For reference — use the buttons above if you want a total like eaves + rakes.</p>
              <table className="totals small">
                <tbody>
                  {(['eaves', 'rakes', 'ridges', 'hips', 'valleys', 'parapet'] as const).map((k) => (
                    <tr key={k}><td style={{ textTransform: 'capitalize' }}>{k}</td><td>{raw[k] !== undefined ? `${raw[k]} ft` : 'not found'}</td></tr>
                  ))}
                  <tr><td>Predominant pitch</td><td>{review.parsed.predominantPitch ?? 'not found'}</td></tr>
                  <tr><td>Pitch breakdown</td><td>{review.parsed.pitches.length ? review.parsed.pitches.map((p) => `${p.pitch}/12: ${p.area !== undefined ? p.area + ' sq ft' : ''}${p.pct !== undefined ? ' ' + p.pct + '%' : ''}`).join(' · ') : 'not found'}</td></tr>
                </tbody>
              </table>
              <details>
                <summary className="muted small">Show text read from the PDF</summary>
                <pre className="rawtext">{review.text}</pre>
              </details>
            </div>
          )}

          <div className="actions">
            <button className="btn primary" disabled={busy} onClick={useThese}>{busy ? 'Saving…' : 'Use these measurements'}</button>
            <button className="btn" disabled={busy} onClick={() => setReview(null)}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}
