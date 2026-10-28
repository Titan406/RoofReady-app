-- Additive: JobNimbus PDF documents -> RoofReady jobs. PDF handling is OFF by default (jn_sync.state.pdf_enabled).
alter table jn_sync.state add column if not exists pdf_enabled boolean not null default false;
alter table jn_sync.state add column if not exists pdf_last_seen bigint;

create table if not exists public.job_documents (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,   -- null = "needs matching"
  file_name text not null,
  storage_path text not null unique,
  source text not null default 'JobNimbus',
  jobnimbus_file_id text unique,
  size bigint,
  created_at timestamptz not null default now()
);
create index if not exists job_documents_job_id_idx on public.job_documents(job_id);
alter table public.job_documents enable row level security;
revoke all on public.job_documents from anon;
revoke insert, update, delete on public.job_documents from authenticated;
grant select on public.job_documents to authenticated;
drop policy if exists "team read job_documents" on public.job_documents;
create policy "team read job_documents" on public.job_documents for select to authenticated using (true);

-- Manual attach of an unmatched PDF (only sets job_id when it is still null).
create or replace function public.attach_job_document(doc_id uuid, target_job uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.jobs where id = target_job) then raise exception 'job not found'; end if;
  update public.job_documents set job_id = target_job where id = doc_id and job_id is null;
  if not found then raise exception 'document not found or already attached'; end if;
end $$;
revoke all on function public.attach_job_document(uuid, uuid) from public, anon;
grant execute on function public.attach_job_document(uuid, uuid) to authenticated;

-- Private bucket, PDFs only, 25 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-documents', 'job-documents', false, 26214400, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 26214400, allowed_mime_types = array['application/pdf'];
drop policy if exists "team read job-documents" on storage.objects;
create policy "team read job-documents" on storage.objects for select to authenticated using (bucket_id = 'job-documents');

-- Resolve a JobNimbus file to a RoofReady job. Never guesses: only unique matches.
-- refs: [{id,type}] from file.primary/related; recs: optional JobNimbus job/contact records fetched for unresolved ids.
create or replace function jn_sync.match_file_job(refs jsonb, recs jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare r jsonb; found uuid[] := '{}'; x uuid; ids uuid[]; ph text;
begin
  for r in select * from jsonb_array_elements(coalesce(refs,'[]')) loop
    if r->>'type' = 'job' then
      select id into x from public.jobs where jobnimbus_id = r->>'id';
      if x is not null then return jsonb_build_object('job_id', x, 'how', 'job_jnid'); end if;
    end if;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(refs,'[]')) loop
    if r->>'type' = 'contact' then
      select array_agg(j.id) into ids from public.jobs j join public.customers c on c.id = j.customer_id where c.jobnimbus_id = r->>'id';
      if coalesce(array_length(ids,1),0) = 1 then return jsonb_build_object('job_id', ids[1], 'how', 'contact_jnid'); end if;
      if coalesce(array_length(ids,1),0) > 1 then return jsonb_build_object('job_id', null, 'how', 'ambiguous_contact'); end if;
    end if;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(recs,'[]')) loop
    if jn_sync.addr(r) is not null then
      select array_agg(id) into ids from public.jobs where jn_sync.norm_addr(address) = jn_sync.norm_addr(jn_sync.addr(r));
      if coalesce(array_length(ids,1),0) = 1 then return jsonb_build_object('job_id', ids[1], 'how', 'address'); end if;
    end if;
    ph := jn_sync.norm_phone(coalesce(jn_sync.t(r,'mobile_phone'), jn_sync.t(r,'home_phone'), jn_sync.t(r,'work_phone')));
    if ph is not null then
      select array_agg(j.id) into ids from public.jobs j join public.customers c on c.id = j.customer_id where jn_sync.norm_phone(c.phone) = ph;
      if coalesce(array_length(ids,1),0) = 1 then return jsonb_build_object('job_id', ids[1], 'how', 'phone'); end if;
    end if;
  end loop;
  return jsonb_build_object('job_id', null, 'how', 'no_match');
end $$;
revoke all on function jn_sync.match_file_job(jsonb, jsonb) from public, anon, authenticated;
