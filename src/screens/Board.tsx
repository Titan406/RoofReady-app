import { useEffect, useState } from 'react';
import { supabase, type Job } from '../lib/supabase';
import { STAGES, computeMetrics, money0 } from '../lib/stages';
import { go } from '../lib/nav';

export default function Board({ email }: { email: string }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, customers(*)')
        .order('updated_at', { ascending: false });
      if (error) setErr(error.message);
      else setJobs((data as Job[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const m = computeMetrics(jobs);
  const ql = q.trim().toLowerCase();
  const shown = ql
    ? jobs.filter((j) =>
        [j.address, j.customers?.name, j.customers?.phone, j.claim_number].some((s) => (s || '').toLowerCase().includes(ql)),
      )
    : jobs;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="page wide">
      <header className="topbar">
        <h1 className="brand"><img src="/logo-600.png" alt="Titan Roofing & Exteriors" className="headlogo" /></h1>
        <div className="row">
          <button className="btn ghost small" onClick={() => go('/templates')}>Templates</button>
          <button className="btn ghost small" onClick={() => supabase.auth.signOut()} title={email}>
            Sign out
          </button>
        </div>
      </header>

      <div className="metrics">
        <div className="metric"><span>Open leads</span><b>{m.openLeads.count}</b><small>{money0(m.openLeads.value)}</small></div>
        <div className="metric"><span>Sold, not invoiced</span><b>{money0(m.soldNotInvoiced.value)}</b><small>{m.soldNotInvoiced.count} jobs</small></div>
        <div className="metric"><span>Invoiced</span><b>{money0(m.invoiced.value)}</b><small>{m.invoiced.count} jobs</small></div>
        <div className="metric"><span>Paid</span><b>{money0(m.paid.value)}</b><small>{m.paid.count} jobs</small></div>
      </div>

      <div className="row gap pad-x">
        <input className="grow" placeholder="Search name, address, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" onClick={() => go('/job/new')}>+ Job</button>
      </div>

      {err && <div className="error pad-x">{err}</div>}
      {loading ? (
        <p className="muted pad-x">Loading…</p>
      ) : (
        <div className="board">
          {STAGES.map((s) => {
            const col = shown.filter((j) => j.stage === s);
            const total = col.reduce((a, j) => a + (Number(j.value) || 0), 0);
            return (
              <section className="column" key={s}>
                <h2>
                  {s} <span className="count">{col.length}</span>
                </h2>
                <div className="muted small colsum">{money0(total)}</div>
                {col.map((j) => (
                  <button className="jobcard" key={j.id} onClick={() => go(`/job/${j.id}`)}>
                    <b>{j.customers?.name || 'No name yet'}</b>
                    <span>{j.address || 'No address'}</span>
                    <span className="row between">
                      <span>{money0(Number(j.value))}</span>
                      {j.follow_up && (
                        <span className={j.follow_up <= today ? 'due' : 'muted'}>F/U {j.follow_up}</span>
                      )}
                    </span>
                    {j.insurance_claim && <span className="tag">Insurance</span>}
                  </button>
                ))}
                {col.length === 0 && <div className="muted small empty">—</div>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
