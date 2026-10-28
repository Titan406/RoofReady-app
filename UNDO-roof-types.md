# UNDO: Roof types feature (2026-10-28)

- Preview: https://roof-types-preview--titan-roofready.netlify.app (deploy 6ae2446c0f97941132d1145d).
  It is a separate branch alias; production (https://titan-roofready.netlify.app, published deploy
  6ae14a502ee88e5ff6e0fc50) was never touched. To discard: just ignore it, or delete that deploy in
  Netlify → Deploys. Nothing to roll back in production.
- Code: work is on branch `feature/roof-types` only (main not changed). Previous code = tag
  `pre-material-types-2026-10-28` (`git checkout main` / `git reset --hard pre-material-types-2026-10-28`).
- Database: migration `add_estimates_roof_type` only ADDED a nullable column `estimates.roof_type`
  (NULL = asphalt shingles). The live app ignores it. Optional removal:
  `alter table public.estimates drop column roof_type;`
- If team defaults were saved for a metal/Brava type, they live in extra `price_catalog` rows with ids
  `roof:tuff_rib`, `roof:snap_lock`, `roof:mech_lock`, `roof:brava`; the shingle `default` row is untouched.
  Delete those rows to undo.
