// Verifies RLS: with only the publishable key (no login), reads return nothing and writes fail.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import ws from 'ws';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => l.split('=')));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { realtime: { transport: ws } });
let fail = 0;
for (const t of ['customers', 'jobs', 'estimates', 'orders', 'job_events', 'price_catalog']) {
  const { data, error } = await sb.from(t).select('*').limit(5);
  const ok = (data?.length ?? 0) === 0;
  if (!ok) fail++;
  console.log(`anon SELECT ${t}: ${ok ? 'blocked' : 'LEAK'} (${error ? error.code + ' ' + error.message : (data?.length ?? 0) + ' rows'})`);
}
const ins = await sb.from('jobs').insert({ address: 'anon test' }).select();
console.log(`anon INSERT jobs: ${ins.error ? 'blocked (' + ins.error.code + ')' : 'LEAK'}`);
if (!ins.error) fail++;
process.exit(fail ? 1 : 0);
