import { useEffect, useState } from 'react';
import { formatSize, listJobDocuments, signedUrl, type JobDocument } from '../lib/documents';
import { go } from '../lib/nav';

export default function JobDocuments({ jobId }: { jobId: string }) {
  const [docs, setDocs] = useState<JobDocument[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listJobDocuments(jobId).then(({ data, error }) => {
      if (error) setErr(error.message);
      else setDocs((data as JobDocument[]) ?? []);
      setLoading(false);
    });
  }, [jobId]);

  async function open(d: JobDocument, download = false) {
    setErr('');
    // open the window first (iPhone Safari blocks pop-ups opened after an await)
    const w = download ? null : window.open('', '_blank');
    try {
      const url = await signedUrl(d.storage_path, download);
      if (w) w.location.href = url;
      else window.location.href = url;
    } catch (e) {
      w?.close();
      setErr((e as Error).message);
    }
  }

  return (
    <div className="card stack">
      <h2>Documents</h2>
      {loading && <p className="muted small">Loading…</p>}
      {!loading && docs.length === 0 && !err && <p className="muted small">No PDFs attached yet. PDFs uploaded to this contact/job in JobNimbus show up here.</p>}
      {err && <div className="error">{err}</div>}
      {docs.map((d) => (
        <div key={d.id} className="stack docrow">
          <div>
            <b>{d.file_name}</b>
            <div className="muted small">{d.source} · {new Date(d.created_at).toLocaleDateString()} {formatSize(d.size) && `· ${formatSize(d.size)}`}</div>
          </div>
          <div className="row gap">
            <button className="btn small grow" onClick={() => open(d)}>Open</button>
            <button className="btn small grow" onClick={() => open(d, true)}>Download</button>
            <button className="btn small primary grow" onClick={() => go(`/job/${jobId}/measurements/${d.id}`)}>Import measurements</button>
          </div>
        </div>
      ))}
    </div>
  );
}
