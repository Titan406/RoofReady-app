import { describe, expect, it } from 'vitest';
import { cleanFileName, fileRefs, isPdfFile, looksLikePdf, nextMarker, selectNewPdfs, storagePath, MAX_PDF_BYTES } from './jnFiles';

const f = (o: object) => ({ jnid: 'a', filename: 'r.pdf', content_type: 'application/pdf', size: 1000, date_created: 200, is_active: true, ...o });

describe('jnFiles', () => {
  it('detects PDFs', () => {
    expect(isPdfFile(f({}))).toBe(true);
    expect(isPdfFile(f({ content_type: 'image/png', filename: 'x.png' }))).toBe(false);
    expect(isPdfFile(f({ content_type: '', filename: 'X.PDF' }))).toBe(true);
    expect(isPdfFile(f({ content_type: 'image/jpeg', filename: 'x.pdf' }))).toBe(false);
  });
  it('selects only new, unseen, active PDFs after cutoff, oldest first', () => {
    const files = [
      f({ jnid: 'old', date_created: 99 }),
      f({ jnid: 'new2', date_created: 300 }),
      f({ jnid: 'new1', date_created: 150 }),
      f({ jnid: 'png', content_type: 'image/png', filename: 'p.png' }),
      f({ jnid: 'seen' }),
      f({ jnid: 'gone', is_active: false }),
      f({ jnid: 'arch', is_archived: true }),
      f({ jnid: 'big', size: MAX_PDF_BYTES + 1 }),
      f({ jnid: undefined }),
    ];
    expect(selectNewPdfs(files, 100, new Set(['seen'])).map((x) => x.jnid)).toEqual(['new1', 'new2']);
  });
  it('orders refs jobs first and dedupes', () => {
    expect(fileRefs(f({ primary: { id: 'c1', type: 'contact' }, related: [{ id: 'j1', type: 'job' }, { id: 'c1', type: 'contact' }, { id: 't', type: 'task' }] })))
      .toEqual([{ id: 'j1', type: 'job' }, { id: 'c1', type: 'contact' }]);
    expect(fileRefs(f({ primary: null, related: null }))).toEqual([]);
  });
  it('checks PDF magic bytes', () => {
    expect(looksLikePdf(new TextEncoder().encode('%PDF-1.7'))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode('<html>'))).toBe(false);
  });
  it('builds safe paths and names', () => {
    expect(storagePath('ab/../c d')).toBe('jobnimbus/ab____c_d.pdf');
    expect(cleanFileName('Report')).toBe('Report.pdf');
    expect(cleanFileName(undefined)).toBe('document.pdf');
    expect(cleanFileName('a/b.PDF')).toBe('a b.PDF');
  });
  it('never advances marker past a failed file', () => {
    expect(nextMarker(100, [150, 200], [])).toBe(200);
    expect(nextMarker(100, [150, 200], [180])).toBe(179);
    expect(nextMarker(100, [], [])).toBe(100);
    expect(nextMarker(100, [], [90])).toBe(100);
  });
});
