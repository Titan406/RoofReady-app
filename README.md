# RoofReady — Titan Roofing job board & estimator (PWA)

Phone-first web app (Vite + React + TypeScript + `@supabase/supabase-js`) wired to the Supabase project
**RoofReady** (`awfxcxlwyuokgbsnsuel`). Static build in `dist/` — host anywhere that serves static files.

## Features
- Email + password sign-in (Supabase Auth). No sign-up screen. Sign out on the board.
- Board: 12 stage columns (Lead → Paid), swipe sideways; metrics (open leads, sold not invoiced, invoiced, paid);
  search; add / edit / delete jobs. Every stage change writes a `job_events` row; activity log per job.
- Estimate per job with revisions (draft → approved; approving supersedes older revisions and sets the job value).
  All math is deterministic code in `src/lib/estimate.ts` (unit-tested). Prices are **editable placeholders**.
  "Save these lines as team default prices" stores line defaults in `price_catalog` for new estimates.
- **Opening Estimate on any job auto-creates draft revision 1** from the job's measurements + default (or team) lines.
  Price / cost / GP / squares stay pinned at the top while you scroll. Jobs without measurements show
  "Enter measurements or upload a report".
- **Measurement report PDF import** (job screen → "Upload report (PDF)", route `#/job/<id>/measurements`): the PDF is read
  **on the device only** with `pdfjs-dist` (lazy-loaded; never uploaded or stored). Regex parser in `src/lib/reportParser.ts`
  for GAF QuickMeasure and EagleView / RoofScope / Hover-style text. Review screen shows report value vs editable value,
  Found / Not found per field; nothing is saved until "Use these measurements" (writes `jobs.measurements`,
  `jobs.measurement_source` = "<format> PDF: <file>", and updates the latest *draft* estimate; approved revisions untouched).
  Never guesses: missing fields stay empty. Sums like eaves + rakes are only offered as tap-to-use buttons.
  Steep share = % of pitch-table area at or above a threshold (default 8/12, changeable on the review screen).
  Scanned/image PDFs (no text layer) get a "type the values by hand" message. Tested only with SYNTHETIC PDFs
  (`scripts/make-sample-pdfs.mjs` → `test-fixtures/`), not real vendor reports.
- Work order + material order generated from the approved (or latest) estimate: editable text, include-prices toggle,
  saved to `orders`, Copy and an "Email…" (`mailto:`) link. **Nothing is ever sent automatically.**
  "Mark as sent" only records that you sent it yourself.

## Local dev
```bash
cp .env.example .env   # fill in values (already filled on the build box)
npm install
npm run dev            # http://localhost:5173
npm test               # estimate math unit tests (vitest)
npm run build          # -> dist/
```
Env vars (build-time, baked into the bundle — only ever use the **publishable** key, never a secret/service key):
- `VITE_SUPABASE_URL` = `https://awfxcxlwyuokgbsnsuel.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_...` (Supabase dashboard → Project Settings → API Keys)

`.env` is git-ignored; don't commit it.

> **Note:** `.env` is **not stored in this repo**. After cloning, create it from `.env.example` (locally) or set the two env vars in your hosting provider (Vercel/Netlify) before building.

## Deploy (pick one)
**Vercel:** New Project → import the repo (or `npx vercel` in this folder) → Framework: Vite, Build `npm run build`,
Output `dist` → add the two env vars above (Production + Preview) → Deploy.

**Netlify:** Add new site → import repo (or drag-and-drop the `dist/` folder after building locally) →
Build command `npm run build`, Publish directory `dist` → Site settings → Environment variables → add both → redeploy.

The app uses hash routes (`#/job/...`), so no SPA rewrite rules are needed. HTTPS is required for "Copy" and for
home-screen install (both hosts provide it).

## Supabase dashboard setup
1. **Turn off public sign-ups:** Authentication → Sign In / Providers → (User Signups) disable "Allow new users to sign up".
   Keep the Email provider enabled.
2. **Create team users:** Authentication → Users → "Add user" → "Create new user" → email + password,
   tick "Auto Confirm User". Give each person their login.
3. **URL configuration:** Authentication → URL Configuration → set Site URL to your deployed URL (used for password-reset emails).
4. RLS is on for every table; only signed-in (authenticated) users can read/write. The publishable key alone sees nothing.

## Add to iPhone home screen
Open the deployed URL in **Safari** → Share button → **Add to Home Screen** → Add. It opens full-screen like an app
(icon: `public/icons/apple-touch-icon.png`). Sign in once; the session is remembered.

## Database
Existing tables: `customers`, `jobs`, `estimates`, `orders`, `job_events`.
Migration added by this build: `add_price_catalog` — `price_catalog(id text pk default 'default', materials jsonb, labor jsonb,
updated_by, updated_at)`, RLS on, authenticated select/insert/update, anon revoked.

Estimate JSON (`estimates.data`): `{ measurements, measurementSource, materials[], labor[], taxPct, targetGp }`; each line
`{ name, unit, driver, mode: per|coverage|fixed, rate, price, override }`. Quantity = override if entered, else
`ceil(driver × rate)` (per), `ceil(driver ÷ coverage)` (coverage) or fixed. Squares = `ceil(area × (1 + waste%) / 100)`.
Price = direct cost ÷ (1 − target GP). Tax % applies to materials (Montana: 0).

## Tests
- `src/lib/reportParser.test.ts` — parser + pdf.js extraction on the synthetic PDFs in `test-fixtures/` (regenerate with `node scripts/make-sample-pdfs.mjs`).
- `npm test` — unit tests (83 Wedgewood: 2619 sq ft @ 13% → 30 SQ, 90 bundles Duration, 9 rolls WeatherLock, etc.).
- `scripts/anon-check.mjs` — confirms the publishable key without login can't read/write any table.
- `scripts/app-flow.e2e.test.ts` (`E2E_EMAIL=… E2E_PASSWORD=… npx vitest run -c vitest.e2e.config.ts`) — live CRUD flow with a team login.
- `scripts/ui-smoke.mjs` — headless Chrome at 390 px (needs `playwright-core` + Chrome and `vite preview` on :4173).

## Order templates, logo & printing
- **Templates** (board header → Templates): one team template each for Work Order and Material Order — company header (name, phone, email, address, license #), title, intro, notes, signature, footer, and "show prices by default". Placeholders: `{{job_address}} {{customer_name}} {{customer_phone}} {{date}} {{job_id_short}} {{delivery_date}} {{company_name}}`. Unknown placeholders are left as typed. Stored in `public.order_templates` (migration `add_order_templates`, RLS: authenticated users only). With no saved row, the built-in starting text is used.
- **Orders:** new orders start from the saved template. Each order stays editable. "Review & email…" saves first, then shows the final text and an "Open in Mail app" mailto link. Nothing is ever sent automatically, and mailto can't attach files.
- **Print / Save as PDF:** a printable page with the logo (`public/logo-600.png`) and company header, using `window.print()`. On iPhone: Share → Print → pinch out → Save to Files.
- **Icons:** `public/icons/*` are a crop of the shield mark from the Titan logo.
- Tests: `src/lib/templates.test.ts`. Headless flow used for checking: `/tmp/rrui/orders-flow.mjs` (needs a temporary user and job).
