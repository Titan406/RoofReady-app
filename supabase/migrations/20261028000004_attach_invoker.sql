-- Advisor fix: attach_job_document runs as the caller (SECURITY INVOKER). Signed-in users may ONLY set job_id
-- on a document that is still unmatched (job_id null); no other column, no un-attaching, no inserts/deletes.
grant update (job_id) on public.job_documents to authenticated;
drop policy if exists "team attach unmatched job_documents" on public.job_documents;
create policy "team attach unmatched job_documents" on public.job_documents for update to authenticated
  using (job_id is null) with check (job_id is not null);
create or replace function public.attach_job_document(doc_id uuid, target_job uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.jobs where id = target_job) then raise exception 'job not found'; end if;
  update public.job_documents set job_id = target_job where id = doc_id and job_id is null;
  if not found then raise exception 'document not found or already attached'; end if;
end $$;
