import { useEffect, useState } from 'react';
import { logEvent, supabase, type EstimateRow, type Job, type JobEvent } from '../lib/supabase';
import { MEASUREMENT_FIELDS, computeDrivers, normalizeMeasurements } from '../lib/estimate';
import { SOURCES, STAGES, money, money0 } from '../lib/stages';
import { go } from '../lib/nav';
import JobDocuments from './JobDocuments';

interface Form {
  name: string;
  phone: string;
  email: string;
  address: string;
  stage: string;
  source: string;
  value: string;
  follow_up: string;
  insurance_claim: boolean;
  claim_number: string;
  notes: string;
}

const blank: Form = {
  name: '',
  phone: '',
  email: '',
  address: '',
  stage: 'Lead',
  source: 'Other',
  value: '0',
  follow_up: '',
  insurance_claim: false,
  claim_number: '',
  notes: '',
};

export default function JobDetail({ jobId }: { jobId: string }) {
  const isNew = jobId === 'new';
  const [job, setJob] = useState<Job | null>(null);
  const [f, setF] = useState<Form>(blank);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [est, setEst] = useState<EstimateRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    if (isNew) return;
    const { data, error } = await supabase.from('jobs').select('*, customers(*)').eq('id', jobId).maybeSingle();
    if (error || !data) {
      setErr(error?.message || 'Job not found');
      return;
    }
    const j = data as Job;
    setJob(j);
    setF({
      name: j.customers?.name ?? '',
      phone: j.customers?.phone ?? '',
      email: j.customers?.email ?? '',
      address: j.address ?? '',
      stage: j.stage,
      source: j.customers?.source ?? 'Other',
      value: String(j.value ?? 0),
      follow_up: j.follow_up ?? '',
      insurance_claim: !!j.insurance_claim,
      claim_number: j.claim_number ?? '',
      notes: j.notes ?? '',
    });
    const [ev, es] = await Promise.all([
      supabase.from('job_events').select('*').eq('job_id', jobId).order('created_at', { ascending: false }),
      supabase.from('estimates').select('*').eq('job_id', jobId).order('revision', { ascending: false }),
    ]);
    setEvents((ev.data as JobEvent[]) ?? []);
    const list = (es.data as EstimateRow[]) ?? [];
    setEst(list.find((r) => r.status === 'approved') ?? list[0] ?? null);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const cust = { name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), source: f.source };
      let customerId = job?.customer_id ?? null;
      if (customerId) {
        const { error } = await supabase.from('customers').update(cust).eq('id', customerId);
        if (error) throw error;
      } else if (cust.name || cust.phone || cust.email || isNew) {
        const { data, error } = await supabase
          .from('customers')
          .insert({ ...cust, billing_address: f.address.trim() })
          .select('id')
          .single();
        if (error) throw error;
        customerId = data.id;
      }
      const jobRow = {
        customer_id: customerId,
        address: f.address.trim(),
        stage: f.stage,
        value: Number(f.value) || 0,
        follow_up: f.follow_up || null,
        insurance_claim: f.insurance_claim,
        claim_number: f.insurance_claim ? f.claim_number.trim() : '',
        notes: f.notes,
      };
      if (isNew) {
        const { data, error } = await supabase.from('jobs').insert(jobRow).select('id').single();
        if (error) throw error;
        await logEvent(data.id, 'created', `Job created in stage ${f.stage}`);
        go(`/job/${data.id}`);
        return;
      }
      const { error } = await supabase.from('jobs').update(jobRow).eq('id', jobId);
      if (error) throw error;
      if (job && job.stage !== f.stage) await logEvent(jobId, 'stage_change', `${job.stage} → ${f.stage}`);
      else await logEvent(jobId, 'updated', 'Job details edited');
      setMsg('Saved');
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!job) return;
    if (!confirm(`Delete this job${f.name ? ' for ' + f.name : ''}? Estimates, orders and activity for it are deleted too. This cannot be undone.`))
      return;
    setBusy(true);
    const { error } = await supabase.from('jobs').delete().eq('id', jobId);
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    if (job.customer_id) {
      const { count } = await supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('customer_id', job.customer_id);
      if (!count) await supabase.from('customers').delete().eq('id', job.customer_id);
    }
    go('/');
  }

  if (!isNew && !job)
    return (
      <div className="page">
        <button className="btn ghost small" onClick={() => go('/')}>‹ Board</button>
        {err ? <div className="error pad-x">{err}</div> : <p className="muted pad-x">Loading…</p>}
      </div>
    );

  return (
    <div className="page">
      <header className="topbar">
        <button className="btn ghost small" onClick={() => go('/')}>‹ Board</button>
        <h1 className="title-sm">{isNew ? 'New job' : f.name || f.address || 'Job'}</h1>
        <span />
      </header>

      {!isNew && (
        <div className="row gap pad-x">
          <button className="btn grow" onClick={() => go(`/job/${jobId}/estimate`)}>Estimate</button>
          <button className="btn grow" onClick={() => go(`/job/${jobId}/orders`)}>Work / material orders</button>
        </div>
      )}

      {!isNew && job && (() => {
        const raw = (job.measurements ?? {}) as Record<string, unknown>;
        const has = MEASUREMENT_FIELDS.some((f) => raw[f.key] !== undefined && raw[f.key] !== '' && Number(raw[f.key]) > 0);
        const m = normalizeMeasurements(raw);
        return (
          <div className="card stack">
            <div className="row between">
              <h2>Measurements & estimate</h2>
              {est && <span className={`tag ${est.status}`}>Rev {est.revision} {est.status}</span>}
            </div>
            {has ? (
              <p className="small">
                <b>{m.area.toLocaleString()} sq ft</b> · {m.waste}% waste · <b>{computeDrivers(m).squares} SQ</b> · steep {m.steepShare}%
                <br /><span className="muted">{job.measurement_source || 'source not noted'}</span>
              </p>
            ) : (
              <p className="placeholder">No measurements yet. Enter measurements or upload a report.</p>
            )}
            {est && <p className="small">Estimate price: <b>{money(Number(est.price))}</b>{est.status === 'draft' ? ' (draft — approve it to set the job value)' : ''}</p>}
            <div className="row gap">
              <button className="btn primary grow" onClick={() => go(`/job/${jobId}/measurements`)}>Upload report (PDF)</button>
              <button className="btn grow" onClick={() => go(`/job/${jobId}/estimate`)}>{est ? 'Open estimate' : 'Start estimate'}</button>
            </div>
          </div>
        );
      })()}

      {!isNew && <JobDocuments jobId={jobId} />}

      <div className="card stack">
        <label>Stage
          <select value={f.stage} onChange={(e) => set('stage', e.target.value)}>
            {STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>Customer name<input value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" /></label>
        <div className="row gap">
          <label className="grow">Phone<input type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></label>
          {f.phone && <a className="btn small self-end" href={`tel:${f.phone}`}>Call</a>}
        </div>
        <label>Email<input type="email" inputMode="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></label>
        <div className="row gap">
          <label className="grow">Job address<input value={f.address} onChange={(e) => set('address', e.target.value)} /></label>
          {f.address && (
            <a className="btn small self-end" href={`https://maps.apple.com/?q=${encodeURIComponent(f.address)}`} target="_blank" rel="noreferrer">Map</a>
          )}
        </div>
        <label>Lead source
          <select value={f.source} onChange={(e) => set('source', e.target.value)}>
            {(SOURCES.includes(f.source) ? SOURCES : [...SOURCES, f.source]).map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <div className="row gap">
          <label className="grow">Value ($)<input type="number" inputMode="decimal" value={f.value} onChange={(e) => set('value', e.target.value)} /></label>
          <label className="grow">Follow-up<input type="date" value={f.follow_up} onChange={(e) => set('follow_up', e.target.value)} /></label>
        </div>
        <label className="check">
          <input type="checkbox" checked={f.insurance_claim} onChange={(e) => set('insurance_claim', e.target.checked)} /> Insurance claim
        </label>
        {f.insurance_claim && (
          <label>Claim number<input value={f.claim_number} onChange={(e) => set('claim_number', e.target.value)} /></label>
        )}
        <label>Notes<textarea rows={4} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></label>
        {err && <div className="error">{err}</div>}
        {msg && <div className="ok">{msg}</div>}
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : isNew ? 'Create job' : 'Save'}</button>
        {!isNew && <button className="btn danger" onClick={remove} disabled={busy}>Delete job</button>}
      </div>

      {!isNew && (
        <div className="card">
          <h2>Activity</h2>
          {job && <p className="muted small">Value {money0(Number(job.value))} · created {new Date(job.created_at).toLocaleDateString()}</p>}
          {events.length === 0 && <p className="muted">No activity yet.</p>}
          <ul className="events">
            {events.map((e) => (
              <li key={e.id}>
                <span className="muted small">{new Date(e.created_at).toLocaleString()}</span>
                <span><b>{e.event_type.replace(/_/g, ' ')}</b> {e.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
