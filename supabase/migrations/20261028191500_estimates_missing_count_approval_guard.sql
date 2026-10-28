-- Additive. NOT yet applied to the live database.
-- New app writes missing_count on every save. Old app never writes it -> stays 0 -> trigger never fires for it.
-- Existing rows get 0, so existing draft/approved estimates are unaffected.
alter table public.estimates add column if not exists missing_count integer not null default 0;

create or replace function public.estimates_block_approve_missing()
returns trigger language plpgsql set search_path = public as $$
begin
  if NEW.status = 'approved' and coalesce(NEW.missing_count, 0) > 0 then
    raise exception 'RR_MISSING_ITEMS: estimate has % item(s) missing from the report; price incomplete — cannot approve', NEW.missing_count
      using errcode = 'check_violation';
  end if;
  return NEW;
end $$;

drop trigger if exists estimates_block_approve_missing on public.estimates;
create trigger estimates_block_approve_missing
  before insert or update on public.estimates
  for each row execute function public.estimates_block_approve_missing();

-- ROLLBACK (run in order):
-- drop trigger if exists estimates_block_approve_missing on public.estimates;
-- drop function if exists public.estimates_block_approve_missing();
-- alter table public.estimates drop column if exists missing_count;
