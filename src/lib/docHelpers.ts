// Pure helpers for job documents (no Supabase import, so they are unit-testable).
export function formatSize(n: number | null | undefined): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Simple job search for the "attach to job" picker (name, address, phone). */
export function filterJobs<T extends { address?: string | null; customers?: { name?: string | null; phone?: string | null } | null }>(jobs: T[], q: string): T[] {
  const s = q.trim().toLowerCase();
  if (!s) return jobs;
  const digits = s.replace(/\D/g, '');
  return jobs.filter((j) =>
    [j.address, j.customers?.name].some((v) => (v || '').toLowerCase().includes(s)) ||
    (digits.length >= 3 && (j.customers?.phone || '').replace(/\D/g, '').includes(digits)),
  );
}

