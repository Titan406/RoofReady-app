import { useEffect, useState } from 'react';
import { supabase, type Job } from '../lib/supabase';
import { attachDocument, filterJobs, formatSize, listUnmatched, signedUrl, type JobDocument } from '../lib/documents';
import { go } from '../lib/nav';

export default function Unmatched() {
  const [docs, setDocs] = useState<JobDocument[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [picking, setPicking] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    const [d, j] = await Promise.all([
      listUnmatched(),
      supabase.from('jobs').select('*, customers(*)').order('updated_at', { ascending: false }),
    ]);
    if (d.error) setErr(d.error.message);
    setDocs((d.data as JobDocument[]) ?? []);
    setJobs((j.data as Job[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function open(d: JobDocument) {
    const w = window.open('', '_blank');
    try { const u = await signedUrl(d.storage_path); if (w) w.location.href = u; else window.location.href = u; }
    catch (e) { w?.close(); setErr((e as Error).message); }
  }

  async function attach(d: JobDocument, j: Job) {
    if (!confirm(`Attach “${d.file_name}” to ${j.customers?.name || 'job'} — ${j.address || 'no address'}?`)) return;
    setErr(''); setMsg('');
    try {
      await attachDocument(d.id, j.id);
      setMsg(`Attached “${d.file_name}”.`);
      setPicking(null); setQ('');
      await load();
    } catch (e) { setErr((e as Error).message); }
  }

  const shown = filterJobs(jobs, q).slice(0, 30);
  return (
    <div className="page">
      <header className="topbar">
        <button className="btn ghost small" onClick={() => go('/')}>‹ Board</button>
        <h1 className="title-sm">Unmatched PDFs</h1>
        <span />
      </header>
      <p className="pad-x muted small">PDFs from JobNimbus whose contact/job couldn’t be matched to a RoofReady job for sure. Pick the right job to attach each one.</p>
      {err && <div className="error pad-x">{err}</div>}
      {msg && <div className="ok pad-x">{msg}</div>}
      {loading && <p className="muted pad-x">Loading…</p>}
      {!loading && docs.length === 0 && <p className="muted pad-x">Nothing to match. 👍</p>}
      {docs.map((d) => (
        <div className="card stack" key={d.id}>
          <div>
            <b>{d.file_name}</b>
            <div className="muted small">{d.source} · {new Date(d.created_at).toLocaleString()} {formatSize(d.size) && `· ${formatSize(d.size)}`}</div>
          </div>
          <div className="row gap">
            <button className="btn small grow" onClick={() => open(d)}>Open</button>
            <button className="btn small primary grow" onClick={() => { setPicking(picking === d.id ? null : d.id); setQ(''); }}>
              {picking === d.id ? 'Cancel' : 'Attach to job…'}
            </button>
          </div>
          {picking === d.id && (
            <div className="stack">
              <input autoFocus placeholder="Search name, address, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
              {shown.map((j) => (
                <button key={j.id} className="jobcard" onClick={() => attach(d, j)}>
                  <b>{j.customers?.name || 'No name yet'}</b>
                  <span>{j.address || 'No address'} · {j.stage}</span>
                </button>
              ))}
              {shown.length === 0 && <p className="muted small">No jobs found.</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
