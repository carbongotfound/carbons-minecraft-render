-- Include camera and sound preferences in the same private account settings.
create or replace function corvex_private.carbon_account_settings(p_owner uuid,p_settings jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare clean jsonb:='{}';row record;num numeric;value jsonb;
begin
 if p_settings is null or p_settings='null'::jsonb then
  select settings into value from corvex_private.carbon_settings where owner=p_owner;
  return jsonb_build_object('settings',value);
 end if;
 if jsonb_typeof(p_settings)<>'object' or octet_length(p_settings::text)>2048 then raise exception 'Invalid settings.';end if;
 for row in select * from jsonb_each(p_settings) loop
  if row.key in('bob','shadows','smoothLighting','sound') and jsonb_typeof(row.value)='boolean' then clean:=clean||jsonb_build_object(row.key,row.value);
  elsif row.key in('sensitivity','fov','renderDistance','shadowDistance','maxLights','viewMode') and jsonb_typeof(row.value)='number' then
   num:=(row.value#>>'{}')::numeric;
   num:=case row.key when 'sensitivity' then greatest(.25,least(2.5,num)) when 'fov' then greatest(60,least(100,num)) when 'renderDistance' then greatest(2,least(12,round(num))) when 'viewMode' then greatest(0,least(2,round(num))) when 'shadowDistance' then greatest(16,least(96,num)) else greatest(2,least(128,round(num))) end;
   clean:=clean||jsonb_build_object(row.key,num);
  elsif row.key='resolution' and row.value#>>'{}' in('960x540','1280x720','1920x1080','2560x1440','3840x2160') then clean:=clean||jsonb_build_object(row.key,row.value);
  elsif row.key='aa' and row.value#>>'{}' in('none','fxaa','smaa','msaa') then clean:=clean||jsonb_build_object(row.key,row.value);
  end if;
 end loop;
 insert into corvex_private.carbon_settings(owner,settings) values(p_owner,clean)
 on conflict(owner) do update set settings=excluded.settings,updated_at=now();
 return jsonb_build_object('settings',clean);
end $$;
revoke all on function corvex_private.carbon_account_settings(uuid,jsonb) from public,anon,authenticated;
