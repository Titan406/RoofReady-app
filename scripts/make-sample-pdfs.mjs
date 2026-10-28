// Generates SYNTHETIC sample PDFs that imitate the text of roof measurement reports.
// They are NOT real GAF / EagleView / RoofScope / Hover reports — layouts and wording are approximations.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync, mkdirSync } from 'fs';
const dir = new URL('../test-fixtures/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });

async function make(name, pages) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = doc.addPage([612, 792]);
    page.drawText('SYNTHETIC TEST DOCUMENT - not a real report', { x: 40, y: 760, size: 9, font, color: rgb(0.7, 0, 0) });
    let y = 730;
    for (const l of lines) {
      if (Array.isArray(l)) {
        // table row: cells at fixed x positions (pdf.js returns them as separate items on one line)
        l.forEach((c, i) => page.drawText(String(c), { x: 40 + i * 110, y, size: 11, font }));
      } else page.drawText(l, { x: 40, y, size: 11, font });
      y -= 18;
    }
  }
  writeFileSync(dir + name, await doc.save());
  console.log('wrote', name);
}

await make('synthetic-gaf-quickmeasure.pdf', [
  ['GAF QuickMeasure', 'Roof Measurement Report', '83 Wedgewood Ln, Whitefish MT', '', 'Summary', 'Total Area: 2,619 sq ft', 'Predominant Pitch: 9/12', 'Suggested Waste: 13%'],
  [
    'Areas per Pitch',
    ['Roof Pitches', '4/12', '9/12'],
    ['Area (sq ft)', '288', '2,331'],
    ['% of Roof', '11%', '89%'],
    '',
    'Lengths',
    ['Eaves', '210 ft'], ['Rakes', '145 ft'], ['Ridges', '60 ft'], ['Hips', '55 ft'], ['Valleys', '41 ft'],
    ['Flashing', '55 ft'], ['Step Flashing', '98 ft'],
    '',
    'Materials',
    ['Drip Edge (Eaves + Rakes)', '355 ft'], ['Leak Barrier', '580 ft'], ['Ridge Cap (Hips + Ridges)', '115 ft'], ['Starter (Eaves + Rakes)', '355 ft'],
  ],
]);

await make('synthetic-eagleview.pdf', [
  ['EagleView Premium Report (synthetic imitation)', '486 2 Mile Dr, Kalispell MT', '',
    'Total Area (All Pitches) = 3,105 sq ft', 'Total Roof Facets = 8', 'Predominant Pitch = 6/12',
    'Ridges = 72 ft (3 Ridges)', 'Hips = 0 ft (0 Hips)', 'Valleys = 24 ft (2 Valleys)', 'Rakes = 180 ft (6 Rakes)',
    'Eaves/Starter = 160 ft (5 Eaves)', 'Drip Edge (Eaves + Rakes) = 340 ft', 'Flashing = 22 ft', 'Step flashing = 40 ft', 'Parapet Walls = 0 ft'],
  ['Areas per Pitch', ['Roof Pitches', '6/12', '10/12'], ['Area (sq ft)', '2,500', '605'], ['% of Roof', '80.5%', '19.5%'],
    '', 'Waste Calculation (no waste % marked as suggested in this sample)', ['Waste %', '0%', '10%', '12%', '15%']],
]);

await make('synthetic-roofscope.pdf', [
  ['RoofScope Report (synthetic imitation)', 'Total Squares: 22.4', 'Ridge: 48 LF', 'Hip: 30 LF', 'Valley: 18 LF', 'Rake: 120 LF', 'Eave: 140 LF', 'Step Flashing: 25 LF', 'Flashing: 12 LF', 'Pitch: 7/12'],
]);

await make('synthetic-hover.pdf', [
  ['HOVER Measurements (synthetic imitation)', 'Roof', 'Total Roof Area: 1,980 sq ft',
    "Ridges: 48' 6\"", "Hips: 20' 0\"", "Valleys: 12' 3\"", "Rakes: 96' 0\"", "Eaves: 110' 9\"", "Flashing: 14' 0\"", "Step Flashing: 30' 6\"",
    'Pitch breakdown', '5/12  1,500 sq ft  75.8%', '12/12  480 sq ft  24.2%'],
]);

await make('synthetic-leak-barrier-area.pdf', [
  ['GAF QuickMeasure (synthetic)', 'Total Area: 1,500 sq ft', 'Leak Barrier: 600 sq ft', 'Valleys: 20 ft'],
]);

// Image-only page: no text layer at all (imitates a scanned report).
{
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  for (let i = 0; i < 20; i++) page.drawRectangle({ x: 40, y: 700 - i * 30, width: 300 + (i % 5) * 40, height: 8, color: rgb(0.2, 0.2, 0.2) });
  writeFileSync(dir + 'synthetic-scanned-no-text.pdf', await doc.save());
  console.log('wrote synthetic-scanned-no-text.pdf');
}
