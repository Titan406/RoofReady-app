// Client-side PDF text extraction (pdfjs-dist). The file never leaves the device.
export interface TextItemLike { str: string; transform: number[]; hasEOL?: boolean }
export interface PdfText { text: string; pages: number; chars: number }

/** Group pdf.js text items into lines by their y position, left to right. */
export function itemsToLines(items: TextItemLike[]): string[] {
  const rows: { y: number; parts: { x: number; s: string }[] }[] = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < 3);
    if (!row) rows.push((row = { y, parts: [] }));
    row.parts.push({ x, s: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.s.trim()).join('  '));
}

// Minimal structural type so this works with the browser and the Node (test) builds of pdf.js.
interface PdfJsLike {
  getDocument: (src: { data: Uint8Array; isEvalSupported?: boolean; disableFontFace?: boolean }) => {
    promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }>; destroy: () => Promise<void> }>;
  };
}

export async function extractPdfText(data: Uint8Array, pdfjs: PdfJsLike): Promise<PdfText> {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true }).promise;
  const out: string[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      out.push(itemsToLines(tc.items.filter((x): x is TextItemLike => typeof (x as TextItemLike).str === 'string')).join('\n'));
    }
  } finally {
    await doc.destroy();
  }
  const text = out.join('\n');
  return { text, pages: doc.numPages, chars: text.replace(/\s/g, '').length };
}

/** Browser loader: pdf.js is only downloaded when someone actually picks a PDF. */
export async function extractInBrowser(file: File): Promise<PdfText> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const buf = new Uint8Array(await file.arrayBuffer());
  return extractPdfText(buf, pdfjs as unknown as PdfJsLike);
}

/** Fewer than this many non-space characters = treat as scanned/image-only. */
export const MIN_TEXT_CHARS = 40;
