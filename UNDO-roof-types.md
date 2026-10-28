# UNDO: Roof types feature (2026-10-28)

- Preview: https://roof-types-preview--titan-roofready.netlify.app (branch alias only).
  Production (https://titan-roofready.netlify.app, published deploy 6ae14a502ee88e5ff6e0fc50) was never
  touched. To discard: ignore the preview, or delete its deploys in Netlify → Deploys.
- Code: all work is on branch `feature/roof-types`; `main` was never changed, so there is nothing to reset.
  To discard the code just delete the branch (`git branch -D feature/roof-types`, and on GitHub if pushed).
  Reference tag of the pre-feature code: `pre-material-types-2026-10-28`.
- Database (files in `supabase/migrations/`, both additive):
  - `20261028184918_add_estimates_roof_type.sql` added nullable `estimates.roof_type` (NULL = shingles).
  - `20261028190248_estimates_roof_type_check.sql` added CHECK `estimates_roof_type_check`.
  Optional removal (constraint first):
  `alter table public.estimates drop constraint estimates_roof_type_check;`
  `alter table public.estimates drop column roof_type;`
- ⚠ WARNING: estimates already SAVED as metal or Brava keep their parts lists in `estimates.data`, but the
  old code (production / main) does not know those roof types: it shows NO roof-type label, and lines that
  use the new report-length drivers (ridges/hips/eaves/rakes/valleys, area incl. waste) show ZERO quantity,
  so their prices are wrong there. Re-check or re-create any such estimate before relying on it in the old app.
- If team defaults were saved for a metal/Brava type, they live in extra `price_catalog` rows with ids
  `roof:tuff_rib`, `roof:snap_lock`, `roof:mech_lock`, `roof:brava`; the shingle `default` row is untouched.
  Delete those rows to undo.
