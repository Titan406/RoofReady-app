# UNDO: JobNimbus PDF documents (2026-10-28)

Turn PDF handling OFF (instant, safe, default):
    update jn_sync.state set pdf_enabled = false where id = 1;
Turn it ON:
    update jn_sync.state set pdf_enabled = true where id = 1;

Roll back the Edge Function to the old version (contact/job sync only):
  redeploy /workspace/jnsync/backup-2026-10-28/index.ts as `jobnimbus-sync` (verify_jwt = false).
  (With the flag off, the new version already behaves exactly like the old one.)

App: production was never changed. Delete the preview alias in Netlify if wanted; branch `feature/job-pdfs`
can be deleted; tag `pre-job-pdfs-2026-10-28` marks the state before this work.

Remove the database pieces entirely (ONLY after the flag is off; deletes stored PDFs — back them up first):
    delete from storage.objects where bucket_id = 'job-documents';   -- or empty via the dashboard
    delete from storage.buckets where id = 'job-documents';
    drop policy if exists "team read job-documents" on storage.objects;
    drop function if exists public.attach_job_document(uuid, uuid);
    drop function if exists jn_sync.match_file_job(jsonb, jsonb);
    drop table if exists public.job_documents;
    alter table jn_sync.state drop column if exists pdf_enabled, drop column if exists pdf_last_seen;
