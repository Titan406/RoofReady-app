-- Additive: only known roof types (or null/empty = asphalt shingles) may be stored.
-- Undo: alter table public.estimates drop constraint estimates_roof_type_check;
alter table public.estimates add constraint estimates_roof_type_check check (roof_type is null or roof_type in ('', 'asphalt_shingle', 'tuff_rib', 'snap_lock', 'mech_lock', 'brava'));
