-- Exercise the live poll and bed RPCs using two temporary players.
-- All sessions, presence events, bed edits and clock changes are rolled back.
begin;
do $test$
declare
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
  ta text:=gen_random_uuid()::text; tb text:=gen_random_uuid()::text;
  pose jsonb:='{"x":100,"y":80,"z":100,"yaw":0,"pitch":0,"dimension":"overworld","held":"","visible":true,"alive":true}';
  ra jsonb; rb jsonb; slept jsonb; before_time numeric; rev bigint;
begin
  insert into corvex_private.sessions(id,token_hash,name,color) values
    (a,encode(sha256(convert_to(ta,'UTF8')),'hex'),'Clock A','#ffffff'),
    (b,encode(sha256(convert_to(tb,'UTF8')),'hex'),'Clock B','#aaaaaa');
  update public.carbon_survival_clock
    set offset_ms=900000-mod((extract(epoch from clock_timestamp())*1000-epoch)::numeric,1200000)
    where id=1;
  ra:=public.carbon_http_poll_v8(a,ta,pose||'{"clockOffset":-999999999}');
  rb:=public.carbon_http_poll_v8(b,tb,pose||'{"clockOffset":999999999}');
  if abs((ra->'clock'->>'world_ms')::numeric-(rb->'clock'->>'world_ms')::numeric)>1000 then raise exception 'Players received different times'; end if;
  if (ra->'clock'->>'day_length_ms')::int<>1200000 then raise exception 'Wrong day length'; end if;
  if mod((ra->'clock'->>'world_ms')::numeric,1200000) not between 899000 and 902000 then raise exception 'Client offset changed time'; end if;
  before_time:=(ra->'clock'->>'world_ms')::numeric;
  select coalesce((select revision from public.carbon_survival_blocks where x=100 and y=81 and z=100),0) into rev;
  perform public.carbon_edit_v6(a,ta,'overworld',jsonb_build_array(jsonb_build_object('x',100,'y',81,'z',100,'block',20,'revision',rev)));
  slept:=public.carbon_object_v6(a,ta,'sleep','{"dimension":"overworld","x":100,"y":81,"z":100}');
  if slept->>'slept'<>'true' or (slept->'clock'->>'world_ms')::numeric < before_time+300000 then raise exception 'Sleep did not advance the shared clock'; end if;
  ra:=public.carbon_http_poll_v8(a,ta,pose);
  rb:=public.carbon_http_poll_v8(b,tb,pose);
  if abs((ra->'clock'->>'world_ms')::numeric-(rb->'clock'->>'world_ms')::numeric)>1000 then raise exception 'Sleep only affected one player'; end if;
  if mod((rb->'clock'->>'world_ms')::numeric,1200000) not between 89000 and 94000 then raise exception 'Other player did not see morning'; end if;
  slept:=public.carbon_object_v6(b,tb,'sleep','{"dimension":"overworld","x":100,"y":81,"z":100}');
  if slept->>'slept'<>'false' then raise exception 'Sleeping during daylight advanced time'; end if;
  begin
    perform public.carbon_http_poll_v8(a,'invalid',pose);
    raise exception 'Invalid session accepted';
  exception when others then
    if sqlerrm='Invalid session accepted' or sqlerrm not ilike '%session expired%' then raise; end if;
  end;
  if has_function_privilege('anon','corvex_private.carbon_clock_snapshot()','execute') then raise exception 'Private clock helper exposed'; end if;
end $test$;
rollback;
select 'PASS: two players share server time; spoofed offsets ignored; sleep advances both; daytime sleep stays put; invalid sessions rejected; all fixtures rolled back' as result;
