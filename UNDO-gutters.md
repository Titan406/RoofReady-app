# Undo: 5 inch / 6 inch gutter options (branch `feature/gutters`)

Starting point is tagged `backup/pre-gutters-5bba864` (= `feature/roof-types` @ 5bba864). Production was never touched.

## 1. Drop the preview / branch
- Preview alias `gutters-preview` (https://gutters-preview--titan-roofready.netlify.app) is a draft deploy; delete it in Netlify → Deploys if wanted. Production is unaffected either way.
- Delete the branch: `git push origin --delete feature/gutters` and locally `git worktree remove /workspace/roofready-gutters && git branch -D feature/gutters`.

## 2. Database migration (only if `20261028230000_estimates_roof_type_check_gutters.sql` was applied)
First check for saved gutter estimates:
```sql
select id, job_id, revision, roof_type from public.estimates where roof_type in ('gutter_5in','gutter_6in');
```
If any exist, decide what to do with them (the rollback below refuses while they exist). Then:
```sql
begin;
alter table public.estimates drop constraint if exists estimates_roof_type_check;
alter table public.estimates add constraint estimates_roof_type_check check (roof_type is null or roof_type in ('', 'asphalt_shingle', 'tuff_rib', 'snap_lock', 'mech_lock', 'brava'));
commit;
```

## 3. Warning: old code + saved gutter estimates
Code without this branch does not know `gutter_5in` / `gutter_6in`. Its allow-list falls back to asphalt shingles, so a saved gutter estimate
opened in old code shows **no gutter type label** (it shows "Asphalt shingles"), and the gutter inputs (gutter/downspout feet, corners, miters,
chain, guard) are not shown in the measurements section or orders. The material/labor lines and prices saved in the estimate are still there,
but lines whose driver is a gutter driver will compute qty 0 in old code. Re-check such estimates before relying on them.
Changing type away from gutters in the old app replaces the lines with that roof type's defaults.
