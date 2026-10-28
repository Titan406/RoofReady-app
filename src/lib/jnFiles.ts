// Pure helpers for the JobNimbus -> RoofReady PDF sync. Shared (copied verbatim) with
// supabase/functions/jobnimbus-sync/jnFiles.ts so it can be unit-tested here.
export interface JnRef { id: string; type: string }
export interface JnFile {
  jnid?: string; filename?: string; content_type?: string; size?: number; date_created?: number | string;
  is_active?: boolean; is_archived?: boolean; primary?: Partial<JnRef> | null; related?: Partial<JnRef>[] | null;
}

export const MAX_PDF_BYTES = 25 * 1024 * 1024;

export function isPdfFile(f: JnFile): boolean {
  const ct = (f.content_type ?? '').toLowerCase();
  const name = (f.filename ?? '').toLowerCase();
  return ct === 'application/pdf' || (ct === '' || ct === 'application/octet-stream') && name.endsWith('.pdf');
}

/** New, active PDFs created at/after the cutoff, not already imported, not too large. Oldest first. */
export function selectNewPdfs(files: JnFile[], cutoff: number, known: Set<string>): JnFile[] {
  return files
    .filter((f) => !!f.jnid && f.is_active !== false && f.is_archived !== true)
    .filter((f) => Number(f.date_created) >= cutoff)
    .filter((f) => !known.has(f.jnid!))
    .filter(isPdfFile)
    .filter((f) => !(Number(f.size) > MAX_PDF_BYTES))
    .sort((a, b) => Number(a.date_created) - Number(b.date_created));
}

/** Job and contact refs for a file: primary first, then related; jobs before contacts; de-duplicated. */
export function fileRefs(f: JnFile): JnRef[] {
  const all = [f.primary, ...(f.related ?? [])].filter((r): r is JnRef => !!r && !!r.id && (r.type === 'job' || r.type === 'contact'));
  const seen = new Set<string>();
  const out: JnRef[] = [];
  for (const r of [...all.filter((r) => r.type === 'job'), ...all.filter((r) => r.type === 'contact')]) {
    if (!seen.has(r.id)) { seen.add(r.id); out.push({ id: r.id, type: r.type }); }
  }
  return out;
}

/** True if the bytes start with the PDF signature. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/** Safe storage key: jobnimbus/<file jnid>.pdf (no customer names in paths). */
export function storagePath(jnid: string): string {
  return `jobnimbus/${jnid.replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`;
}

/** Display-safe file name ending in .pdf. */
export function cleanFileName(name: string | undefined): string {
  // eslint-disable-next-line no-control-regex
  const n = (name ?? '').replace(/[\\/\u0000-\u001f]/g, ' ').trim().slice(0, 200) || 'document';
  return /\.pdf$/i.test(n) ? n : n + '.pdf';
}

/**
 * Next "last seen" marker: advance to the newest processed file, but never past a file that failed
 * (so it is retried next run). Returns prev when nothing changed.
 */
export function nextMarker(prev: number, done: number[], failed: number[]): number {
  let m = Math.max(prev, ...done);
  if (failed.length) m = Math.min(m, Math.min(...failed) - 1);
  return Math.max(prev, m);
}
