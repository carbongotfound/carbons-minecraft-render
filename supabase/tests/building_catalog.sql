-- Integration smoke test. Every fixture and world edit is rolled back.
begin;
do $test$
declare
  who uuid := gen_random_uuid(); token text := gen_random_uuid()::text;
  edits jsonb; result jsonb; target_dimension text; rev bigint; item text;
begin
  insert into corvex_private.sessions(id,token_hash,name,color)
    values(who,encode(sha256(convert_to(token,'UTF8')),'hex'),'Catalog test','#ffffff');
  insert into public.carbon_presence_v6(id,name,color,dimension,x,y,z,epoch,public_key)
    values(who,'Catalog test','#ffffff','overworld',400,80,400,'catalog-test','{}');
  foreach target_dimension in array array['overworld','nether','end'] loop
    update public.carbon_presence_v6 set dimension=target_dimension where id=who;
    update corvex_private.sessions set last_edit='1970-01-01' where id=who;
    select jsonb_agg(jsonb_build_object('x',x,'y',81,'z',z,'block',block,'meta','{}'::jsonb,
      'revision',case when target_dimension='overworld' then coalesce((select b.revision from public.carbon_survival_blocks b where b.x=c.x and b.y=81 and b.z=c.z),0)
      else coalesce((select b.revision from public.carbon_dimension_blocks b where b.dimension=target_dimension and b.x=c.x and b.y=81 and b.z=c.z),0) end))
    into edits from (select 396+(n-145)%8 as x,396+(n-145)/8 as z,n as block from generate_series(145,195) n) c;
    result := public.carbon_edit_v6(who,token,target_dimension,edits);
    if jsonb_array_length(result->'blocks') <> 51 then raise exception 'Expected 51 persisted blocks in %',target_dimension; end if;
    if not exists(select 1 from jsonb_array_elements(result->'blocks') e where (e->>'block')::int=195) then raise exception 'Missing night sensor'; end if;
  end loop;
  update public.carbon_presence_v6 set dimension='overworld' where id=who;
  update corvex_private.sessions set last_edit='1970-01-01' where id=who;
  select coalesce((select revision from public.carbon_survival_blocks where x=400 and y=83 and z=400),0) into rev;
  perform public.carbon_edit_v6(who,token,'overworld',jsonb_build_array(jsonb_build_object('x',400,'y',83,'z',400,'block',22,'revision',rev)));
  -- Storage key is unique to these coordinates and changes remain inside this rollback.
  delete from corvex_private.carbon_storage where key='400,83,400';
  result := public.carbon_object_v6(who,token,'storage','{"dimension":"overworld","x":400,"y":83,"z":400}');
  foreach item in array array['white_concrete','quartz_slab','daylight_sensor','yellow_dye','birch_slab'] loop
    result := public.carbon_object_v6(who,token,'deposit',jsonb_build_object('dimension','overworld','x',400,'y',83,'z',400,'revision',result->'revision','stack',jsonb_build_object('id',item,'count',8)));
    if (result->>'moved')::int<>8 then raise exception 'Storage failed for %',item; end if;
    perform public.carbon_object_v6(who,token,'drop',jsonb_build_object('dimension','overworld','x',400,'y',83,'z',400,'id',gen_random_uuid(),'item',item,'count',1));
  end loop;
  -- The extended catalog must not weaken authentication or the upper ID limit.
  begin
    perform public.carbon_edit_v6(who,'wrong-token','overworld','[]');
    raise exception 'Invalid token accepted';
  exception when others then
    if sqlerrm='Invalid token accepted' then raise; end if;
    if sqlerrm not like '%Session expired%' then raise; end if;
  end;
  update corvex_private.sessions set last_edit='1970-01-01' where id=who;
  begin
    perform public.carbon_edit_v6(who,token,'overworld','[{"x":400,"y":82,"z":400,"block":196,"revision":0}]');
    raise exception 'Unsupported ID accepted';
  exception when others then
    if sqlerrm='Unsupported ID accepted' then raise; end if;
    if sqlerrm not like '%Invalid block data%' then raise; end if;
  end;
end $test$;
rollback;
select 'PASS: 51 block IDs saved in all three dimensions; five new items deposited/dropped; invalid tokens and ID 196 rejected; fixture rolled back' as result;
