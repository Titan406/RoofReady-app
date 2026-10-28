create or replace function jn_sync.norm_phone(p text) returns text language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(p,''),'\D','','g'),10),'') $$;
create or replace function jn_sync.norm_addr(a text) returns text language sql immutable as $$
  select nullif(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    ' '||regexp_replace(lower(split_part(coalesce(a,''),',',1)),'[^a-z0-9 ]',' ','g')||' ',
    ' road ',' rd ','g'),' drive ',' dr ','g'),' lane ',' ln ','g'),' street ',' st ','g'),' avenue ',' ave ','g'),' (north|south|east|west|n|s|e|w) ',' ','g'),'\s+','','g'),'') $$;
create or replace function jn_sync.t(v jsonb, k text) returns text language sql immutable as $$
  select nullif(btrim(v->>k),'') $$;
create or replace function jn_sync.addr(v jsonb) returns text language sql immutable as $$
  select nullif(concat_ws(', ', nullif(concat_ws(' ', jn_sync.t(v,'address_line1'), jn_sync.t(v,'address_line2')),''),
    jn_sync.t(v,'city'), nullif(concat_ws(' ', jn_sync.t(v,'state_text'), jn_sync.t(v,'zip')),'')),'') $$;

-- returns customer id (or null in dry run when new)
create or replace function jn_sync.import_contact(c jsonb, dry bool) returns jsonb language plpgsql as $$
declare cid uuid; jid uuid; ph text; adr text; nm text; notes text; act text := 'existing'; jact text := 'none';
begin
  if jn_sync.t(c,'jnid') is null then return jsonb_build_object('skip','no jnid'); end if;
  ph := coalesce(jn_sync.t(c,'mobile_phone'), jn_sync.t(c,'home_phone'), jn_sync.t(c,'work_phone'));
  adr := jn_sync.addr(c);
  nm := coalesce(jn_sync.t(c,'display_name'), nullif(concat_ws(' ', jn_sync.t(c,'first_name'), jn_sync.t(c,'last_name')),''), jn_sync.t(c,'company'));
  notes := concat_ws(E'\n', 'Imported from JobNimbus' || coalesce(' (contact #'||jn_sync.t(c,'number')||')',''),
     'JobNimbus lead source: '||jn_sync.t(c,'source_name'), jn_sync.t(c,'description'));
  select id into cid from public.customers where jobnimbus_id = c->>'jnid';
  if cid is null and jn_sync.norm_phone(ph) is not null then
    select id into cid from public.customers where jn_sync.norm_phone(phone) = jn_sync.norm_phone(ph) order by created_at limit 1;
    if cid is not null then act := 'matched_phone';
      if not dry then update public.customers set jobnimbus_id = c->>'jnid' where id = cid and jobnimbus_id is null; end if; end if;
  end if;
  if cid is null then act := 'new';
    if nm is null then return jsonb_build_object('skip','no name', 'jnid', c->>'jnid'); end if;
    if not dry then
      insert into public.customers(name, phone, email, billing_address, source, notes, jobnimbus_id, created_by)
      values (nm, coalesce(ph,''), coalesce(jn_sync.t(c,'email'),''), coalesce(adr,''), 'Other', notes, c->>'jnid', null) returning id into cid;
    end if;
  end if;
  if adr is not null then
    select id into jid from public.jobs where jn_sync.norm_addr(address) = jn_sync.norm_addr(adr) limit 1;
    if jid is null then jact := 'new_lead_job';
      if not dry then insert into public.jobs(customer_id, address, stage, notes, created_by)
        values (cid, coalesce(adr,''), 'Lead', notes, null); end if;
    else jact := 'address_exists'; end if;
  elsif act = 'new' then jact := 'new_lead_job_no_address';
    if not dry then insert into public.jobs(customer_id, address, stage, notes, created_by) values (cid, '', 'Lead', notes, null); end if;
  end if;
  return jsonb_build_object('jnid', c->>'jnid', 'customer', act, 'job', jact);
end $$;

create or replace function jn_sync.import_job(j jsonb, contact jsonb, dry bool) returns jsonb language plpgsql as $$
declare cid uuid; jid uuid; adr text; notes text; r jsonb := '{}';
begin
  if jn_sync.t(j,'jnid') is null then return jsonb_build_object('skip','no jnid'); end if;
  if exists(select 1 from public.jobs where jobnimbus_id = j->>'jnid') then return jsonb_build_object('jnid', j->>'jnid','job','existing'); end if;
  if contact is not null then r := jn_sync.import_contact(contact, dry); end if;
  select id into cid from public.customers where jobnimbus_id = j#>>'{primary,id}';
  if cid is null and not dry then return r || jsonb_build_object('jnid', j->>'jnid','job','skip_no_customer'); end if;
  adr := jn_sync.addr(j);
  notes := concat_ws(E'\n', 'Imported from JobNimbus' || coalesce(' (job #'||jn_sync.t(j,'number')||')',''),
     'JobNimbus lead source: '||jn_sync.t(j,'source_name'), jn_sync.t(j,'description'));
  if adr is not null then select id into jid from public.jobs where jn_sync.norm_addr(address)=jn_sync.norm_addr(adr) limit 1; end if;
  if jid is null and adr is null and cid is not null then
    select id into jid from public.jobs where customer_id = cid and jobnimbus_id is null order by created_at desc limit 1; end if;
  if jid is not null then
    if not dry then update public.jobs set jobnimbus_id = j->>'jnid' where id = jid and jobnimbus_id is null; end if;
    return r || jsonb_build_object('jnid', j->>'jnid','job','linked_existing');
  end if;
  if not dry then insert into public.jobs(customer_id, address, stage, notes, jobnimbus_id, created_by)
     values (cid, coalesce(adr,''), 'Lead', notes, j->>'jnid', null); end if;
  return r || jsonb_build_object('jnid', j->>'jnid','job','new_lead_job');
end $$;

-- contacts: array of contact objects; jobs: array of {job:..., contact:...|null}
create or replace function jn_sync.run(contacts jsonb, jobs jsonb, dry bool) returns jsonb language plpgsql as $$
declare x jsonb; res jsonb := '[]'; mx bigint; s jn_sync.state;
begin
  select * into s from jn_sync.state where id=1;
  mx := s.last_seen;
  for x in select * from jsonb_array_elements(coalesce(contacts,'[]')) loop
    begin res := res || jn_sync.import_contact(x, dry);
      mx := greatest(mx, (x->>'date_created')::numeric::bigint);
    exception when others then res := res || jsonb_build_object('jnid', x->>'jnid','error',sqlerrm); end;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(jobs,'[]')) loop
    begin res := res || jn_sync.import_job(x->'job', nullif(x->'contact','null'::jsonb), dry);
      mx := greatest(mx, (x#>>'{job,date_created}')::numeric::bigint);
    exception when others then res := res || jsonb_build_object('jnid', x#>>'{job,jnid}','error',sqlerrm); end;
  end loop;
  if not dry then update jn_sync.state set last_seen = mx, last_run = now() where id=1; end if;
  insert into jn_sync.sync_log(level, message, detail) values ('info', case when dry then 'dry run' else 'run' end, res);
  return res;
end $$;
