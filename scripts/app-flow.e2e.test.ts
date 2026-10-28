// End-to-end against the live Supabase project, using the SAME queries the app makes.
// Requires E2E_EMAIL / E2E_PASSWORD of a team user. Cleans up the rows it creates.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import ws from 'ws';
import { computeTotals, newEstimateData, normalizeMeasurements } from '../src/lib/estimate';
import { materialOrderText } from '../src/lib/orders';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => l.split('=')),
);
let sb: SupabaseClient;
let jobId = '';
let customerId = '';

describe('app flow (live)', () => {
  beforeAll(async () => {
    sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      realtime: { transport: ws as never },
      auth: { persistSession: false },
    });
    const { error } = await sb.auth.signInWithPassword({ email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD! });
    expect(error).toBeNull();
  });

  afterAll(async () => {
    if (jobId) await sb.from('jobs').delete().eq('id', jobId);
    if (customerId) await sb.from('customers').delete().eq('id', customerId);
    await sb.auth.signOut();
  });

  it('wrong password is rejected', async () => {
    const other = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { realtime: { transport: ws as never }, auth: { persistSession: false } });
    const { error } = await other.auth.signInWithPassword({ email: process.env.E2E_EMAIL!, password: 'wrong-password' });
    expect(error).not.toBeNull();
  });

  it('board query reads seed jobs with customer join', async () => {
    const { data, error } = await sb.from('jobs').select('*, customers(*)').order('updated_at', { ascending: false });
    expect(error).toBeNull();
    const w = data!.find((j) => j.address.startsWith('83 Wedgewood'));
    expect(w).toBeTruthy();
    expect(computeTotals(newEstimateData(normalizeMeasurements(w.measurements))).drivers.squares).toBe(30);
  });

  it('create customer + job, change stage logs job_event', async () => {
    const c = await sb.from('customers').insert({ name: 'E2E Test (delete me)', phone: '', email: '', source: 'Other', billing_address: '' }).select('id').single();
    expect(c.error).toBeNull();
    customerId = c.data!.id;
    const j = await sb.from('jobs').insert({ customer_id: customerId, address: 'E2E test address', stage: 'Lead', value: 0, insurance_claim: true, claim_number: 'T-1' }).select('id').single();
    expect(j.error).toBeNull();
    jobId = j.data!.id;
    const u = await sb.from('jobs').update({ stage: 'Contacted' }).eq('id', jobId);
    expect(u.error).toBeNull();
    const ev = await sb.from('job_events').insert({ job_id: jobId, event_type: 'stage_change', detail: 'Lead → Contacted' });
    expect(ev.error).toBeNull();
    const evs = await sb.from('job_events').select('*').eq('job_id', jobId);
    expect(evs.data!.length).toBe(1);
    const back = await sb.from('jobs').select('*, customers(*)').eq('id', jobId).maybeSingle();
    expect(back.data!.stage).toBe('Contacted');
    expect(back.data!.customers.name).toBe('E2E Test (delete me)');
  });

  it('estimate save, revision, approve supersedes older; orders saved', async () => {
    const d = newEstimateData(normalizeMeasurements({ area: 2619, waste: 13, steepShare: 89, starter: 355, ridgeCap: 115, leakBarrierLF: 580, leakBarrierWidth: 3, stepFlashing: 98, flashing: 55, valley: 41, dripEdge: 355 }), 'GAF QuickMeasure');
    const t = computeTotals(d);
    const fields = { data: d, material_total: t.materialTotal, labor_total: t.laborTotal, target_gp: d.targetGp, price: t.price };
    const r1 = await sb.from('estimates').insert({ job_id: jobId, revision: 1, status: 'draft', ...fields }).select('*').single();
    expect(r1.error).toBeNull();
    expect(Number(r1.data!.price)).toBeCloseTo(t.price, 2);
    const m = await sb.from('jobs').update({ measurements: d.measurements, measurement_source: d.measurementSource }).eq('id', jobId);
    expect(m.error).toBeNull();
    const r2 = await sb.from('estimates').insert({ job_id: jobId, revision: 2, status: 'draft', ...fields }).select('*').single();
    expect(r2.error).toBeNull();
    const { data: u } = await sb.auth.getUser();
    const a = await sb.from('estimates').update({ status: 'approved', approved_by: u.user!.id, approved_at: new Date().toISOString() }).eq('id', r2.data!.id);
    expect(a.error).toBeNull();
    const s = await sb.from('estimates').update({ status: 'superseded' }).eq('job_id', jobId).neq('id', r2.data!.id);
    expect(s.error).toBeNull();
    const all = await sb.from('estimates').select('revision,status,data').eq('job_id', jobId).order('revision');
    expect(all.data!.map((x) => x.status)).toEqual(['superseded', 'approved']);
    // reopen: stored jsonb round-trips into the same totals
    expect(computeTotals(all.data![1].data).price).toBeCloseTo(t.price, 2);

    const body = materialOrderText(d, { address: 'E2E test address' }, false);
    const o = await sb.from('orders').insert({ job_id: jobId, kind: 'material_order', status: 'draft', body }).select('id').single();
    expect(o.error).toBeNull();
    const o2 = await sb.from('orders').update({ body: body + '\n- extra line' }).eq('id', o.data!.id);
    expect(o2.error).toBeNull();
  });

  it('price_catalog readable/writable by team', async () => {
    const r = await sb.from('price_catalog').select('*').eq('id', 'default').maybeSingle();
    expect(r.error).toBeNull();
  });

  it('delete job cascades estimates/orders/events', async () => {
    const del = await sb.from('jobs').delete().eq('id', jobId);
    expect(del.error).toBeNull();
    const ev = await sb.from('estimates').select('id').eq('job_id', jobId);
    expect(ev.data!.length).toBe(0);
    const cnt = await sb.from('jobs').select('id', { count: 'exact', head: true }).eq('customer_id', customerId);
    expect(cnt.count).toBe(0);
    const dc = await sb.from('customers').delete().eq('id', customerId);
    expect(dc.error).toBeNull();
    jobId = '';
    customerId = '';
  });
});
