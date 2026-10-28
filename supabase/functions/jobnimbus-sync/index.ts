import postgres from "npm:postgres@3.4.4";
import { cleanFileName, fileRefs, looksLikePdf, MAX_PDF_BYTES, nextMarker, selectNewPdfs, storagePath, type JnFile } from "./jnFiles.ts";
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false });
const API = "https://app.jobnimbus.com/api1";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
function safeEq(a: string, b: string) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
async function log(level: string, message: string, detail: unknown = null) {
  try { await sql`insert into jn_sync.sync_log(level,message,detail) values (${level},${message},${sql.json(detail as any)})`; } catch (_) { /* ignore */ }
}
async function jnGet(key: string, path: string) {
  const r = await fetch(API + path, { method: "GET", headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
  const t = await r.text();
  if (!r.ok) throw new Error(`JobNimbus GET ${path.split("?")[0]} -> HTTP ${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t);
}
async function since(key: string, kind: string, ts: number) {
  const f = encodeURIComponent(JSON.stringify({ must: [{ range: { date_created: { gte: ts } } }] }));
  const out: any[] = [];
  for (let from = 0; from < 1000; from += 200) {
    const d = await jnGet(key, `/${kind}?size=200&from=${from}&sort_field=date_created&sort_direction=asc&filter=${f}`);
    const res = d.results ?? []; out.push(...res);
    if (res.length < 200) break;
  }
  return out;
}

// ---- PDF documents (only when jn_sync.state.pdf_enabled = true, or as a no-download preview with ?dry=1&pdf=1) ----
async function listFiles(key: string, ts: number) {
  const f = encodeURIComponent(JSON.stringify({ must: [{ range: { date_created: { gte: ts } } }] }));
  const out: JnFile[] = [];
  for (let from = 0; from < 1000; from += 100) {
    const d = await jnGet(key, `/files?size=100&from=${from}&sort_field=date_created&sort_direction=asc&filter=${f}`);
    const res = d.files ?? d.results ?? []; out.push(...res);
    if (res.length < 100) break;
  }
  return out;
}
async function jnDownload(key: string, jnid: string): Promise<Uint8Array> {
  const r = await fetch(`${API}/files/${encodeURIComponent(jnid)}`, { method: "GET", headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`JobNimbus GET /files/:id -> HTTP ${r.status}`);
  const len = Number(r.headers.get("content-length") ?? 0);
  if (len > MAX_PDF_BYTES) throw new Error("file too large");
  const b = new Uint8Array(await r.arrayBuffer());
  if (b.length > MAX_PDF_BYTES) throw new Error("file too large");
  if (!looksLikePdf(b)) throw new Error("download is not a PDF");
  return b;
}
async function uploadPdf(path: string, bytes: Uint8Array) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(`${url}/storage/v1/object/job-documents/${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${svc}`, apikey: svc, "Content-Type": "application/pdf", "x-upsert": "true" }, body: new Blob([bytes as BlobPart], { type: "application/pdf" }),
  });
  if (!r.ok) throw new Error(`storage upload HTTP ${r.status}`);
}
async function syncPdfs(key: string, cutoff: number, preview: boolean) {
  const [st] = await sql`select pdf_last_seen from jn_sync.state where id=1`;
  const prev = Math.max(cutoff, Number(st?.pdf_last_seen ?? 0));
  const files = await listFiles(key, Math.max(cutoff, prev - 600));
  const ids = files.map((f) => f.jnid).filter(Boolean) as string[];
  const known = new Set<string>(ids.length ? (await sql`select jobnimbus_file_id from public.job_documents where jobnimbus_file_id = any(${ids})`).map((r: any) => r.jobnimbus_file_id) : []);
  const todo = selectNewPdfs(files, cutoff, known);
  const res: any[] = []; const done: number[] = []; const failed: number[] = [];
  for (const f of todo.slice(0, 20)) {
    const ts = Number(f.date_created);
    try {
      const refs = fileRefs(f);
      let [m] = await sql`select jn_sync.match_file_job(${sql.json(refs as any)}, '[]'::jsonb) as m`;
      if (!m.m.job_id && m.m.how === "no_match") {
        const recs: any[] = [];
        for (const r of refs.slice(0, 3)) {
          try { recs.push(await jnGet(key, `/${r.type === "job" ? "jobs" : "contacts"}/${encodeURIComponent(r.id)}`)); } catch (_) { /* ignore */ }
        }
        if (recs.length) [m] = await sql`select jn_sync.match_file_job(${sql.json(refs as any)}, ${sql.json(recs)}) as m`;
      }
      const jobId = m.m.job_id ?? null;
      if (preview) { res.push({ file: f.jnid, match: m.m.how, matched: !!jobId }); continue; }
      const bytes = await jnDownload(key, f.jnid!);
      const path = storagePath(f.jnid!);
      await uploadPdf(path, bytes);
      await sql`insert into public.job_documents(job_id, file_name, storage_path, source, jobnimbus_file_id, size)
        values (${jobId}, ${cleanFileName(f.filename)}, ${path}, 'JobNimbus', ${f.jnid!}, ${bytes.length})
        on conflict (jobnimbus_file_id) do nothing`;
      res.push({ file: f.jnid, match: m.m.how, job: jobId });
      done.push(ts);
    } catch (e) {
      failed.push(ts);
      res.push({ file: f.jnid, error: String((e as Error)?.message ?? e).slice(0, 200) });
    }
  }
  if (!preview) {
    // advance only past handled files; when nothing is pending, past everything listed
    const skippedAll = todo.length === 0 ? files.map((f) => Number(f.date_created)).filter(Number.isFinite) : [];
    const mk = nextMarker(prev, [...done, ...skippedAll], failed);
    await sql`update jn_sync.state set pdf_last_seen = ${mk} where id=1`;
    if (res.length) await log(failed.length ? "error" : "info", "pdf run", res);
  }
  return { listed: files.length, new_pdfs: todo.length, results: res };
}
Deno.serve(async (req) => {
  try {
    const sec = await sql`select name, decrypted_secret from vault.decrypted_secrets where name in ('jobnimbus_api_key','jn_sync_shared_secret')`;
    const m = Object.fromEntries(sec.map((r: any) => [r.name, r.decrypted_secret]));
    const given = req.headers.get("x-sync-secret") ?? "";
    if (!m.jn_sync_shared_secret || !safeEq(given, m.jn_sync_shared_secret)) return json({ error: "unauthorized" }, 401);
    const dry = new URL(req.url).searchParams.get("dry") === "1";
    const [st] = await sql`select enabled, cutoff, last_seen from jn_sync.state where id=1`;
    if (!dry && (!st?.enabled || !st.cutoff)) return json({ skipped: "sync disabled" });
    const cutoff = Number(st?.cutoff ?? Math.floor(Date.now() / 1000));
    const from = Math.max(cutoff, Number(st?.last_seen ?? 0) - 600);
    const key = m.jobnimbus_api_key;
    const contacts = (await since(key, "contacts", from)).filter((c) => Number(c.date_created) >= cutoff);
    const jobsRaw = (await since(key, "jobs", from)).filter((j) => Number(j.date_created) >= cutoff);
    const inBatch = new Set(contacts.map((c) => c.jnid));
    const jobs: any[] = [];
    for (const j of jobsRaw) {
      const pid = j?.primary?.id; let contact = null;
      if (pid && !inBatch.has(pid)) {
        const [ex] = await sql`select 1 from public.customers where jobnimbus_id=${pid}`;
        if (!ex) { try { contact = await jnGet(key, `/contacts/${encodeURIComponent(pid)}`); } catch (e) { await log("error", String(e)); } }
      }
      jobs.push({ job: j, contact });
    }
    const [r] = await sql`select jn_sync.run(${sql.json(contacts)}, ${sql.json(jobs)}, ${dry}) as res`;
    let pdf: unknown = "off";
    const wantPdf = new URL(req.url).searchParams.get("pdf") === "1";
    const [ps] = await sql`select pdf_enabled from jn_sync.state where id=1`;
    if ((ps?.pdf_enabled && !dry) || (dry && wantPdf)) {
      try { pdf = await syncPdfs(key, cutoff, dry); }
      catch (e) { pdf = { error: String((e as Error)?.message ?? e).slice(0, 200) }; await log("error", "pdf: " + String(e).slice(0, 300)); }
    }
    return json({ dry, cutoff, fetched: { contacts: contacts.length, jobs: jobsRaw.length }, results: r.res, pdf });
  } catch (e) {
    await log("error", String(e).slice(0, 500));
    return json({ error: String(e).slice(0, 300) }, 500);
  }
});
