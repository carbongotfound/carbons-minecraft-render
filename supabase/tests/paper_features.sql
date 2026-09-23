-- Real RPC regression test. All temporary players, drops, settings and blocks roll back.
begin;
do $test$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); ta text:=gen_random_uuid()::text; tb text:=gen_random_uuid()::text;
 d uuid:=gen_random_uuid(); r jsonb; rev bigint; request uuid;
begin
 insert into corvex_private.sessions(id,token_hash,name,color) values(a,encode(sha256(convert_to(ta,'UTF8')),'hex'),'Paper A','#ffffff'),(b,encode(sha256(convert_to(tb,'UTF8')),'hex'),'Paper B','#ffffff');
 perform public.carbon_http_poll_v8(a,ta,'{"x":400,"y":80,"z":400,"yaw":0,"pitch":0,"dimension":"overworld","alive":true}');
 perform public.carbon_http_poll_v8(b,tb,'{"x":400,"y":80,"z":400,"yaw":0,"pitch":0,"dimension":"overworld","alive":true}');
 r:=public.carbon_object_v6(a,ta,'settings','{"settings":{"aa":"smaa","resolution":"1920x1080","maxLights":900,"token":"discard","sound":true,"viewMode":2}}');
 if r->'settings'->>'maxLights'<>'128' or r->'settings' ? 'token' then raise exception 'Settings validation failed';end if;
 r:=public.carbon_object_v6(b,tb,'settings','{}');
 if r->'settings'<>'null'::jsonb then raise exception 'Settings leaked to another account';end if;
 r:=public.carbon_object_v6(a,ta,'settings','{}');
 if r->'settings'->>'aa'<>'smaa' or r->'settings'->>'sound'<>'true' or r->'settings'->>'viewMode'<>'2' then raise exception 'Account reload lost settings';end if;
 begin
  perform public.carbon_object_v6(a,tb,'settings','{}');
  raise exception 'Invalid token accepted';
 exception when others then if sqlerrm not ilike '%session expired%' then raise;end if;end;
 perform public.carbon_object_v6(a,ta,'drop',jsonb_build_object('id',d,'item','bone_meal','count',3,'x',400,'y',80,'z',400,'player_dropped',true));
 update public.carbon_survival_drops set created_at=clock_timestamp()-interval '1 second' where id=d;
 begin
  perform public.carbon_object_v6(b,tb,'claim',jsonb_build_object('id',d,'request',gen_random_uuid(),'count',3,'x',400,'y',80,'z',400));
  raise exception 'Early pickup accepted';
 exception when others then if sqlerrm not ilike '%still being thrown%' then raise;end if;end;
 update public.carbon_survival_drops set created_at=clock_timestamp()-interval '2100 milliseconds' where id=d;
 r:=public.carbon_object_v6(b,tb,'claim',jsonb_build_object('id',d,'request',gen_random_uuid(),'count',3,'x',400,'y',80,'z',400));
 if r->>'claimed'<>'true' or r->>'id'<>'bone_meal' then raise exception 'Delayed pickup failed';end if;
 select coalesce((select revision from public.carbon_survival_blocks where x=400 and y=81 and z=400),0) into rev;
 update corvex_private.sessions set last_edit='1970-01-01' where id=a;
 perform public.carbon_edit_v6(a,ta,'overworld',jsonb_build_array(jsonb_build_object('x',400,'y',81,'z',400,'block',17,'revision',rev)));
 delete from corvex_private.carbon_storage where key='400,81,400';
 r:=public.carbon_object_v6(a,ta,'storage','{"x":400,"y":81,"z":400}');
 r:=public.carbon_object_v6(a,ta,'deposit',jsonb_build_object('x',400,'y',81,'z',400,'slot',0,'revision',r->'revision','stack',jsonb_build_object('id','deepslate','count',1)));
 r:=public.carbon_object_v6(a,ta,'deposit',jsonb_build_object('x',400,'y',81,'z',400,'slot',1,'revision',r->'revision','stack',jsonb_build_object('id','coal','count',1)));
 update corvex_private.carbon_storage set state=jsonb_set(state,'{at}',to_jsonb(extract(epoch from clock_timestamp())-12)) where key='400,81,400';
 r:=public.carbon_object_v6(a,ta,'storage','{"x":400,"y":81,"z":400}');
 if r->'state'->'slots'->2->>'id'<>'lava' then raise exception 'Deepslate smelting failed: %',r;end if;
 select coalesce((select revision from public.carbon_survival_blocks where x=401 and y=81 and z=400),0) into rev;
 update corvex_private.sessions set last_edit='1970-01-01' where id=a;
 r:=public.carbon_edit_v6(a,ta,'overworld',jsonb_build_array(jsonb_build_object('x',401,'y',81,'z',400,'block',26,'revision',rev,'meta',jsonb_build_object('growth',60))));
 if r->'blocks'->0->'meta'->>'growth'<>'60' then raise exception 'Bone meal growth metadata lost';end if;
 if has_table_privilege('anon','corvex_private.carbon_settings','select') then raise exception 'Settings table exposed';end if;
 if has_function_privilege('anon','corvex_private.carbon_account_settings(uuid,jsonb)','execute') then raise exception 'Private settings helper exposed';end if;
end $test$;
rollback;
select 'PASS: isolated account settings and token checks; server-enforced 2-second drop delay; bone meal storage; deepslate furnace output; crop growth metadata; fixtures rolled back' as result;
