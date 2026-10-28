import { useEffect, useState } from 'react';
import { logEvent, supabase, type EstimateRow, type Job, type OrderRow } from '../lib/supabase';
import { normalizeMeasurements, type EstimateData } from '../lib/estimate';
import { mailtoLink, materialOrderText, workOrderText } from '../lib/orders';
import { go } from '../lib/nav';
import { companyLines, type OrderTemplate } from '../lib/templates';
import { loadTemplates, type TemplateSet } from '../lib/templatesDb';

type Kind = 'work_order' | 'material_order';
const TITLES: Record<Kind, string> = { work_order: 'Work order', material_order: 'Material order' };

async function copyText(t: string) {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function OrderPanel({ kind, job, est, existing, tpl, onSaved, onPrint, hidden }: {
  kind: Kind; job: Job; est: EstimateRow; existing: OrderRow | null; tpl: OrderTemplate;
  onSaved: () => void; onPrint: (title: string, body: string) => void; hidden: boolean;
}) {
  const [includePrices, setIncludePrices] = useState(tpl.showPrices);
  const [deliveryDate, setDeliveryDate] = useState('');
  const gen = (prices: boolean, dd = deliveryDate) => {
    const d = est.data as EstimateData;
    const data = { ...d, measurements: normalizeMeasurements(d.measurements) };
    const ctx = { address: job.address, customerName: job.customers?.name, customerPhone: job.customers?.phone, revision: est.revision, status: est.status, jobId: job.id, deliveryDate: dd };
    return kind === 'work_order' ? workOrderText(data, ctx, prices, tpl) : materialOrderText(data, ctx, prices, tpl);
  };
  const [body, setBody] = useState(existing?.body || gen(tpl.showPrices));
  const [dirty, setDirty] = useState(!existing);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState(`${TITLES[kind]} — ${job.address}`);

  const regenerate = (prices: boolean, dd = deliveryDate) => {
    if (body !== gen(includePrices) && !confirm('Regenerate from the estimate and template? Your manual edits to this text will be replaced.')) return false;
    setBody(gen(prices, dd));
    setDirty(true);
    return true;
  };

  async function save(status?: 'sent'): Promise<boolean> {
    setErr('');
    setMsg('');
    const row = { job_id: job.id, kind, body, ...(status ? { status } : {}) };
    const res = existing
      ? await supabase.from('orders').update(row).eq('id', existing.id)
      : await supabase.from('orders').insert({ ...row, status: status ?? 'draft' });
    if (res.error) { setErr(res.error.message); return false; }
    await logEvent(job.id, status ? `${kind}_marked_sent` : `${kind}_saved`, status ? 'Marked as sent (manually)' : `${TITLES[kind]} saved`);
    setDirty(false);
    setMsg(status ? 'Marked as sent' : 'Saved');
    onSaved();
    return true;
  }

  async function startReview() {
    if (dirty && !(await save())) return;
    setMsg('');
    setReviewing(true);
  }

  return (
    <div className="card stack" hidden={hidden} data-kind={kind}>
      <div className="row between">
        <h2>{TITLES[kind]}</h2>
        {existing && <span className={`tag ${existing.status}`}>{existing.status}</span>}
      </div>

      {!reviewing ? (
        <>
          <div className="row gap wrap">
            <label className="check grow">
              <input type="checkbox" checked={includePrices} onChange={(e) => { if (regenerate(e.target.checked)) setIncludePrices(e.target.checked); }} />
              Include prices
            </label>
            {kind === 'material_order' && (
              <label className="grow">Delivery date
                <input type="date" value={deliveryDate} onChange={(e) => { const v = e.target.value; if (regenerate(includePrices, v)) setDeliveryDate(v); }} />
              </label>
            )}
          </div>
          <textarea className="mono" rows={18} value={body} onChange={(e) => { setBody(e.target.value); setDirty(true); }} aria-label={`${TITLES[kind]} text`} />
          <p className="muted small">Edit anything — add or remove lines, change wording. Nothing is sent automatically.</p>
          {err && <div className="error">{err}</div>}
          {msg && <div className="ok">{msg}</div>}
          <div className="row gap wrap">
            <button className="btn primary grow" onClick={() => save()}>{dirty ? 'Save' : 'Saved ✓'}</button>
            <button className="btn grow" onClick={async () => setMsg((await copyText(body)) ? 'Copied' : 'Copy failed')}>Copy</button>
          </div>
          <div className="row gap wrap">
            <button className="btn grow" onClick={startReview}>Review &amp; email…</button>
            <button className="btn grow" onClick={() => onPrint(TITLES[kind], body)}>Print / Save as PDF</button>
          </div>
          <p className="muted small">Email text only. Use Print / Save as PDF to attach the logo version.</p>
          <div className="row gap wrap">
            <button className="btn ghost small" onClick={() => regenerate(includePrices)}>Regenerate from estimate + template</button>
            {existing && existing.status !== 'sent' && (
              <button className="btn ghost small" onClick={() => confirm('Mark as sent? (Only records that YOU sent it.)') && save('sent')}>Mark as sent</button>
            )}
          </div>
        </>
      ) : (
        <div className="stack review">
          <p className="placeholder">Step 2 of 2 — review the final text. Your Mail app opens with this text; nothing is sent until you press Send there.</p>
          <label>To (optional)<input type="email" inputMode="email" placeholder="supplier or crew email" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <pre className="rawtext final" aria-label="Final email text">{body}</pre>
          <p className="muted small">Email text only. Use Print / Save as PDF to attach the logo version.</p>
          <a className="btn primary" href={mailtoLink(subject, body, to.trim())}>Open in Mail app</a>
          <div className="row gap">
            <button className="btn grow" onClick={() => setReviewing(false)}>‹ Back to edit</button>
            <button className="btn grow" onClick={async () => setMsg((await copyText(body)) ? 'Copied' : 'Copy failed')}>Copy</button>
          </div>
          {msg && <div className="ok">{msg}</div>}
        </div>
      )}
    </div>
  );
}

function PrintView({ title, body, job, tpl, onClose }: { title: string; body: string; job: Job; tpl: OrderTemplate; onClose: () => void }) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} - ${job.address}`; // becomes the default PDF file name
    return () => { document.title = prev; };
  }, [title, job.address]);
  const head = companyLines(tpl.company);
  // The logo + header are drawn above, so drop the same header lines from the top of the text if present.
  const headText = head.join('\n') + '\n\n';
  const text = head.length && body.startsWith(headText) ? body.slice(headText.length) : body;
  return (
    <div className="printwrap">
      <div className="row gap pad-x noprint printbar">
        <button className="btn ghost small" onClick={onClose}>‹ Back</button>
        <button className="btn primary grow" onClick={() => window.print()}>Print / Save as PDF</button>
      </div>
      <p className="muted small pad-x noprint">On iPhone: Print → pinch out on the preview (or Share) → Save to Files, then attach it to your email.</p>
      <article className="printdoc">
        <header className="printhead">
          <img src="/logo-600.png" alt="Titan Roofing & Exteriors" className="printlogo" />
          {head.length > 1 && <div className="printco">{head.slice(1).map((l) => <div key={l}>{l}</div>)}</div>}
        </header>
        <pre className="printbody">{text}</pre>
      </article>
    </div>
  );
}

export default function Orders({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [est, setEst] = useState<EstimateRow | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  const [tpls, setTpls] = useState<TemplateSet | null>(null);
  const [printing, setPrinting] = useState<{ kind: Kind; title: string; body: string } | null>(null);

  useEffect(() => {
    (async () => {
      loadTemplates().then(setTpls).catch((x) => setErr(`Templates: ${x.message}`));
      const [j, e, o] = await Promise.all([
        supabase.from('jobs').select('*, customers(*)').eq('id', jobId).maybeSingle(),
        supabase.from('estimates').select('*').eq('job_id', jobId).order('revision', { ascending: false }),
        supabase.from('orders').select('*').eq('job_id', jobId).order('updated_at', { ascending: false }),
      ]);
      if (j.error || e.error || o.error) setErr((j.error || e.error || o.error)!.message);
      setJob(j.data as Job);
      const list = (e.data as EstimateRow[]) ?? [];
      setEst(list.find((r) => r.status === 'approved') ?? list[0] ?? null);
      setOrders((o.data as OrderRow[]) ?? []);
      setLoaded(true);
    })();
  }, [jobId, tick]);

  return (
    <div className="page">
      <header className="topbar noprint" hidden={!!printing}>
        <button className="btn ghost small" onClick={() => go(`/job/${jobId}`)}>‹ Job</button>
        <h1 className="title-sm">Orders</h1>
        <span />
      </header>
      {err && <div className="error pad-x">{err}</div>}
      {!loaded || !tpls ? (
        <p className="muted pad-x">Loading…</p>
      ) : !job ? (
        <p className="pad-x">Job not found.</p>
      ) : !est ? (
        <div className="card">
          <p>No saved estimate yet.</p>
          <button className="btn primary" onClick={() => go(`/job/${jobId}/estimate`)}>Open estimate</button>
        </div>
      ) : (
        <>
          {printing && <PrintView title={printing.title} body={printing.body} job={job} tpl={tpls[printing.kind]} onClose={() => setPrinting(null)} />}
          <p className="pad-x muted" hidden={!!printing}>{job.address} · from estimate rev {est.revision} ({est.status}) · <a href="#/templates">Edit templates</a></p>
          {(['work_order', 'material_order'] as Kind[]).map((k) => (
            <OrderPanel
              key={k}
              kind={k}
              job={job}
              est={est}
              existing={orders.find((o) => o.kind === k) ?? null}
              tpl={tpls[k]}
              hidden={!!printing}
              onPrint={(title, body) => { setPrinting({ kind: k, title, body }); window.scrollTo(0, 0); }}
              onSaved={() => setTick((t) => t + 1)}
            />
          ))}
        </>
      )}
    </div>
  );
}
