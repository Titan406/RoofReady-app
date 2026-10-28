alter table public.estimates add column if not exists roof_type text null;
comment on column public.estimates.roof_type is 'Roof material type chosen on the estimate (asphalt_shingle, tuff_rib, snap_lock, mech_lock, brava). NULL = asphalt shingles (legacy).';
