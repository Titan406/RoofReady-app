-- Additive (widens the allow-list only). NOT yet applied to the live database.
-- Allows the two new estimate types: 'gutter_5in', 'gutter_6in'. Every value accepted before is still accepted.
begin;
alter table public.estimates drop constraint if exists estimates_roof_type_check;
alter table public.estimates add constraint estimates_roof_type_check check (
  roof_type is null or roof_type in ('', 'asphalt_shingle', 'tuff_rib', 'snap_lock', 'mech_lock', 'brava', 'gutter_5in', 'gutter_6in')
);
commit;

-- ROLLBACK (restores the original 5-type check). It FAILS if any gutter estimates were saved meanwhile;
-- check first:  select id, job_id, revision, roof_type from public.estimates where roof_type in ('gutter_5in','gutter_6in');
-- begin;
-- alter table public.estimates drop constraint if exists estimates_roof_type_check;
-- alter table public.estimates add constraint estimates_roof_type_check check (roof_type is null or roof_type in ('', 'asphalt_shingle', 'tuff_rib', 'snap_lock', 'mech_lock', 'brava'));
-- commit;
