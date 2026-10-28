import { supabase } from './supabase';

export const DOC_BUCKET = 'job-documents';
export interface JobDocument {
  id: string;
  job_id: string | null;
  file_name: string;
  storage_path: string;
  source: string;
  jobnimbus_file_id: string | null;
  size: number | null;
  created_at: string;
}

export { formatSize, filterJobs } from './docHelpers';

export async function listJobDocuments(jobId: string) {
  return supabase.from('job_documents').select('*').eq('job_id', jobId).order('created_at', { ascending: false });
}
export async function listUnmatched() {
  return supabase.from('job_documents').select('*').is('job_id', null).order('created_at', { ascending: false });
}
/** Short-lived (5 min) signed link to a private PDF. */
export async function signedUrl(path: string, download = false): Promise<string> {
  const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(path, 300, download ? { download: true } : undefined);
  if (error || !data) throw new Error(error?.message || 'Could not open the file');
  return data.signedUrl;
}
export async function downloadAsFile(doc: JobDocument): Promise<File> {
  const { data, error } = await supabase.storage.from(DOC_BUCKET).download(doc.storage_path);
  if (error || !data) throw new Error(error?.message || 'Could not download the PDF');
  return new File([data], doc.file_name, { type: 'application/pdf' });
}
export async function attachDocument(docId: string, jobId: string) {
  const { error } = await supabase.rpc('attach_job_document', { doc_id: docId, target_job: jobId });
  if (error) throw new Error(error.message);
}
