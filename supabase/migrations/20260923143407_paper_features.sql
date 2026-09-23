-- Paper feature requests: account settings, player drop delay and furnace/bone meal.
alter table public.carbon_survival_drops add column if not exists player_dropped boolean not null default false;
insert into corvex_private.carbon_items(key,stack_limit,durability) values ('bone_meal',64,0) on conflict(key) do nothing;
update corvex_private.carbon_items set smelt='lava' where key='deepslate';
create table if not exists corvex_private.carbon_settings (
 owner uuid primary key references corvex_private.sessions(id) on delete cascade,
 settings jsonb not null,
 updated_at timestamptz not null default now()
);
alter table corvex_private.carbon_settings enable row level security;
revoke all on corvex_private.carbon_settings from public,anon,authenticated;
-- Only the existing authenticated-by-session object RPC calls this helper.
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
  if row.key in('bob','shadows','smoothLighting') and jsonb_typeof(row.value)='boolean' then clean:=clean||jsonb_build_object(row.key,row.value);
  elsif row.key in('sensitivity','fov','renderDistance','shadowDistance','maxLights') and jsonb_typeof(row.value)='number' then
   num:=(row.value#>>'{}')::numeric;
   num:=case row.key when 'sensitivity' then greatest(.25,least(2.5,num)) when 'fov' then greatest(60,least(100,num)) when 'renderDistance' then greatest(2,least(12,round(num))) when 'shadowDistance' then greatest(16,least(96,num)) else greatest(2,least(128,round(num))) end;
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

CREATE OR REPLACE FUNCTION public.carbon_survival_object_v3(p_id uuid, p_token text, p_op text, p jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
declare sess corvex_private.sessions;d public.carbon_survival_drops;receipt corvex_private.carbon_receipts;st corvex_private.carbon_storage;it corvex_private.carbon_items;v jsonb;outp jsonb:='{}';slots jsonb;ss jsonb;request uuid;key text;x int;y int;z int;b int;n int;idx int;i int;cap int;leftn int;given int;phase numeric;clockrow public.carbon_survival_clock;dim text:=coalesce(p->>'dimension','overworld');
begin
select * into sess from corvex_private.sessions where id=p_id and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>now() for update;if sess.id is null then raise exception 'Session expired. Rejoin the world.';end if;
if dim not in('overworld','nether','end') then raise exception 'Invalid dimension.';end if; if p ? 'request' then request:=(p->>'request')::uuid;select * into receipt from corvex_private.carbon_receipts where carbon_receipts.request=request;if receipt.request is not null then if receipt.owner<>p_id then raise exception 'Invalid request owner.';end if;return receipt.result;end if;end if;
if p_op='drop' then
select * into it from corvex_private.carbon_items where carbon_items.key=p->>'item';n:=(p->>'count')::int;if it.key is null or n is null or n<1 or n>it.stack_limit or coalesce((p->>'wear')::int,0) not between 0 and it.durability then raise exception 'Invalid item stack.';end if;
if (select count(*) from public.carbon_survival_drops where creator=p_id and created_at>now()-interval '10 seconds')>80 then raise exception 'Too many dropped stacks. Try again shortly.';end if;
insert into public.carbon_survival_drops(id,item,count,wear,x,y,z,vx,vy,vz,creator,dimension,player_dropped) values((p->>'id')::uuid,it.key,n,coalesce((p->>'wear')::int,0),(p->>'x')::real,(p->>'y')::real,(p->>'z')::real,greatest(-5,least(5,coalesce((p->>'vx')::real,0))),greatest(-5,least(5,coalesce((p->>'vy')::real,2))),greatest(-5,least(5,coalesce((p->>'vz')::real,0))),p_id,dim,coalesce((p->>'player_dropped')::boolean,false)) on conflict(id) do nothing;
select * into d from public.carbon_survival_drops where id=(p->>'id')::uuid;if d.creator is distinct from p_id then raise exception 'Drop ID belongs to another player.';end if;outp:=to_jsonb(d);
elsif p_op='claim' then
if request is null then raise exception 'A pickup request ID is required.';end if;select * into d from public.carbon_survival_drops where id=(p->>'id')::uuid and dimension=dim and expires_at>now() for update;if d.id is null then outp:='{"claimed":false}';else
if d.created_at>clock_timestamp()-(case when d.player_dropped then interval '2 seconds' else interval '650 milliseconds' end) then raise exception 'Item is still being thrown.';end if;
if abs(d.x-(p->>'x')::real)>9 or abs(d.z-(p->>'z')::real)>9 then raise exception 'Move closer to pick that up.';end if;n:=greatest(0,least(d.count,coalesce((p->>'count')::int,0)));if n<1 then raise exception 'No inventory space.';end if;
outp:=jsonb_build_object('claimed',true,'id',d.item,'count',n,'wear',d.wear);if n=d.count then delete from public.carbon_survival_drops where id=d.id;else update public.carbon_survival_drops set count=count-n where id=d.id;end if;end if;
elsif p_op in('storage','deposit','withdraw','storage_break','sleep') then
x:=(p->>'x')::int;y:=(p->>'y')::int;z:=(p->>'z')::int;if x is null or y is null or z is null or x not between -512 and 511 or z not between -512 and 511 or y not between 1 and 95 then raise exception 'Invalid station coordinates.';end if;key:=(case when dim='overworld' then '' else dim||':' end)||x||','||y||','||z;b:=corvex_private.carbon_v4_block(dim,x,y,z);
if p_op='sleep' then if dim<>'overworld' then raise exception 'Beds cannot be used in this dimension.';end if; if b is distinct from 20 then raise exception 'The bed is no longer here.';end if;select * into clockrow from public.carbon_survival_clock where id=1 for update;phase:=mod((extract(epoch from now())*1000-clockrow.epoch+clockrow.offset_ms)::numeric,1200000);if phase>580000 then update public.carbon_survival_clock set offset_ms=offset_ms+1200000-phase+90000 where id=1 returning * into clockrow;end if;outp:=to_jsonb(clockrow)||jsonb_build_object('clock',corvex_private.carbon_clock_snapshot(),'slept',phase>580000);
elsif p_op='storage_break' then
if b in(17,22,76) then raise exception 'Break the container before releasing its contents.';end if;select * into st from corvex_private.carbon_storage where carbon_storage.key=key for update;if st.key is not null then if st.kind=17 then st.state:=corvex_private.carbon_tick(st.state);end if;for v in select value from jsonb_array_elements(st.state->'slots') loop if v<>'null'::jsonb and coalesce((v->>'count')::int,0)>0 then insert into public.carbon_survival_drops(id,item,count,wear,x,y,z,creator,dimension) values(gen_random_uuid(),v->>'id',(v->>'count')::int,coalesce((v->>'wear')::int,0),x+.5,y+.5,z+.5,p_id,dim);end if;end loop;delete from corvex_private.carbon_storage where carbon_storage.key=key;end if;outp:='{"ok":true}';
else
if b not in(17,22,76) or b is null then raise exception 'Place a furnace or chest first.';end if;cap:=case when b=22 then 27 when b=76 then 5 else 3 end;
insert into corvex_private.carbon_storage(key,kind,state) values(key,b,jsonb_build_object('slots',(select jsonb_agg(null::text) from generate_series(1,cap)),'burn',0,'progress',0,'at',extract(epoch from clock_timestamp()))) on conflict do nothing;
select * into st from corvex_private.carbon_storage where carbon_storage.key=key for update;
if p_op<>'storage' and (p->>'revision')::bigint is distinct from st.revision then raise exception 'The container changed. Please try again.';end if;if b=17 then st.state:=corvex_private.carbon_tick(st.state);end if;slots:=st.state->'slots';idx:=coalesce((p->>'slot')::int,-1);
if p_op='deposit' then
v:=p->'stack';select * into it from corvex_private.carbon_items where carbon_items.key=v->>'id';n:=(v->>'count')::int;if it.key is null or n not between 1 and it.stack_limit or coalesce((v->>'wear')::int,0) not between 0 and it.durability then raise exception 'Invalid stack.';end if;
if b=17 then if idx=0 and it.smelt is null or idx=1 and it.fuel_seconds is null or idx not in(0,1) then raise exception 'That item does not belong in this furnace slot.';end if;elsif idx<0 then for i in 0..cap-1 loop ss:=slots->i;if ss->>'id'=it.key and coalesce((ss->>'count')::int,0)<it.stack_limit and it.stack_limit>1 then idx:=i;exit;end if;end loop;if idx<0 then for i in 0..cap-1 loop if slots->i='null'::jsonb then idx:=i;exit;end if;end loop;end if;end if;
if idx not between 0 and cap-1 then raise exception 'The container is full.';end if;ss:=slots->idx;if ss<>'null'::jsonb and (ss->>'id'<>it.key or it.stack_limit=1) then raise exception 'That slot contains another item.';end if;given:=least(n,it.stack_limit-coalesce((ss->>'count')::int,0));if given<1 then raise exception 'That stack is full.';end if;ss:=jsonb_build_object('id',it.key,'count',coalesce((ss->>'count')::int,0)+given,'wear',coalesce((v->>'wear')::int,0));slots:=jsonb_set(slots,array[idx::text],ss);outp:=jsonb_build_object('moved',given);st.revision:=st.revision+1;
elsif p_op='withdraw' then
if idx not between 0 and cap-1 then raise exception 'Invalid container slot.';end if;ss:=slots->idx;if ss='null'::jsonb then raise exception 'This slot is empty.';end if;n:=greatest(1,least((ss->>'count')::int,coalesce((p->>'count')::int,64)));outp:=jsonb_build_object('stack',ss||jsonb_build_object('count',n));if n=(ss->>'count')::int then slots:=jsonb_set(slots,array[idx::text],'null');else slots:=jsonb_set(slots,array[idx::text],ss||jsonb_build_object('count',(ss->>'count')::int-n));end if;st.revision:=st.revision+1;end if;
st.state:=jsonb_set(st.state,'{slots}',slots);update corvex_private.carbon_storage set state=st.state,revision=st.revision where carbon_storage.key=key;outp:=outp||jsonb_build_object('state',st.state,'revision',st.revision,'kind',b);end if;
else raise exception 'Unknown world-object action.';end if;
if request is not null then insert into corvex_private.carbon_receipts(request,owner,result) values(request,p_id,outp);end if;
delete from corvex_private.carbon_receipts where created_at<now()-interval '1 day';delete from public.carbon_survival_drops where expires_at<now();return outp;
end$function$
;
CREATE OR REPLACE FUNCTION public.carbon_object_v6(p_id uuid, p_token text, p_op text, p jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare dim text:=coalesce(p->>'dimension','overworld');s jsonb;d public.carbon_survival_drops;v public.carbon_presence_v6;k text;n numeric;px real;py real;pz real;dx real;dy real;dz real;age numeric;max_h numeric;max_down numeric;begin
perform corvex_private.carbon_session_v6(p_id,p_token);perform corvex_private.carbon_rate_v6(p_id,'object',90,10);if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>10000 then raise exception 'Invalid object payload.';end if;
if p_op='settings' then return corvex_private.carbon_account_settings(p_id,p->'settings');end if;
if p_op in('drop','deposit') then s:=case when p_op='drop' then jsonb_build_object('id',p->>'item','count',p->'count','wear',coalesce(p->'wear','0')) else p->'stack' end;if jsonb_typeof(s->'count') is distinct from 'number' or jsonb_typeof(coalesce(s->'wear','0')) is distinct from 'number' or (s->>'count')::numeric<>trunc((s->>'count')::numeric) or not exists(select 1 from corvex_private.carbon_items where key=s->>'id' and (s->>'count')::numeric between 1 and stack_limit and coalesce((s->>'wear')::numeric,0) between 0 and durability) then raise exception 'Invalid item stack.';end if;end if;
if p_op in('storage','deposit','withdraw','storage_break','sleep') then perform corvex_private.carbon_near_v6(p_id,dim,(p->>'x')::real,(p->>'y')::real,(p->>'z')::real,10);
elsif p_op='drop' then select * into v from public.carbon_presence_v6 where id=p_id and dimension=dim and seen_at>clock_timestamp()-interval '20 seconds';if v.id is null then raise exception 'Player state is stale.';end if;if abs(v.x-(p->>'x')::real)>80 or abs(v.z-(p->>'z')::real)>80 then if not exists(select 1 from public.carbon_hosts_v6 where dimension=dim and owner=p_id and expires_at>now()) or not exists(select 1 from public.carbon_presence_v6 where dimension=dim and alive and seen_at>now()-interval '15 seconds' and abs(x-(p->>'x')::real)<64 and abs(z-(p->>'z')::real)<64) then raise exception 'Drop is too far from active players.';end if;end if;
elsif p_op='claim' then
  select * into d from public.carbon_survival_drops where id=(p->>'id')::uuid and expires_at>clock_timestamp();
  select * into v from public.carbon_presence_v6 where id=p_id and seen_at>clock_timestamp()-interval '30 seconds';
  if v.id is null then raise exception 'Reconnect before picking items up.';end if;
  dim:=coalesce(p->>'dimension',v.dimension,d.dimension,'overworld');
  if d.id is not null then
    if v.dimension<>dim or d.dimension<>dim then raise exception 'Pickup is in another dimension.';end if;
    px:=coalesce((p->>'x')::real,v.x);py:=coalesce((p->>'y')::real,v.y);pz:=coalesce((p->>'z')::real,v.z);
    dx:=coalesce((p->>'drop_x')::real,d.x);dy:=coalesce((p->>'drop_y')::real,d.y);dz:=coalesce((p->>'drop_z')::real,d.z);
    if abs(px-v.x)>15 or abs(pz-v.z)>15 or abs(py-v.y)>18 then raise exception 'Player position is too stale for pickup.';end if;
    if sqrt(power(px-dx,2)+power(pz-dz,2))>2.6 or abs(py-dy)>3.2 then raise exception 'Move closer to pick that up.';end if;
    age:=least(300,greatest(0,extract(epoch from (clock_timestamp()-d.created_at))));
    max_h:=least(16,greatest(1.5,sqrt(power(coalesce(d.vx,0),2)+power(coalesce(d.vz,0),2))*age+1.75));
    max_down:=least(110,3+9*age*age);
    if sqrt(power(dx-d.x,2)+power(dz-d.z,2))>max_h or dy>d.y+least(14,greatest(3,coalesce(d.vy,0)*age+3)) or dy<d.y-max_down then raise exception 'Dropped item position is invalid.';end if;
    p:=p||jsonb_build_object('dimension',dim,'x',d.x,'z',d.z);
  else
    p:=p||jsonb_build_object('dimension',dim);
  end if;
end if;
return public.carbon_survival_object_v3(p_id,p_token,p_op,p);end$function$
;
CREATE OR REPLACE FUNCTION public.carbon_edit_v6(p_id uuid, p_token text, p_dimension text, p_edits jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare e jsonb;n int;center jsonb;hosted boolean;r real;begin perform corvex_private.carbon_session_v6(p_id,p_token);perform corvex_private.carbon_rate_v6(p_id,'edit',70,10);if p_edits is null or jsonb_typeof(p_edits)<>'array' or octet_length(p_edits::text)>24576 then raise exception 'Invalid edit payload.';end if;n:=jsonb_array_length(p_edits);if n<1 or n>64 then raise exception 'Invalid batch size.';end if;hosted:=exists(select 1 from public.carbon_hosts_v6 where dimension=p_dimension and owner=p_id and expires_at>clock_timestamp());r:=case when n>1 and hosted then 96 else 9 end;
for e in select value from jsonb_array_elements(p_edits) loop if jsonb_typeof(e->'x') is distinct from 'number' or jsonb_typeof(e->'y') is distinct from 'number' or jsonb_typeof(e->'z') is distinct from 'number' or jsonb_typeof(e->'block') is distinct from 'number' or jsonb_typeof(e->'revision') is distinct from 'number' or (e->>'revision')::numeric<0 then raise exception 'Malformed block packet.';end if;if (e->>'x')::numeric<>trunc((e->>'x')::numeric) or (e->>'y')::numeric<>trunc((e->>'y')::numeric) or (e->>'z')::numeric<>trunc((e->>'z')::numeric) or (e->>'block')::numeric<>trunc((e->>'block')::numeric) then raise exception 'Block coordinates must be integers.';end if;if e ? 'meta' and jsonb_typeof(e->'meta') is distinct from 'object' then raise exception 'Block metadata must be an object.';end if;if exists(select 1 from jsonb_object_keys(coalesce(e->'meta','{}')) k where k not in('dir','delay','until','note','fuse','fluid','source','level','origin','natural','growth')) then raise exception 'Unsupported metadata field.';end if;if exists(select 1 from jsonb_each(coalesce(e->'meta','{}')) m where (m.key in('fluid','source','natural') and jsonb_typeof(m.value)<>'boolean') or (m.key in('dir','delay','until','note','fuse','level','growth') and jsonb_typeof(m.value)<>'number') or (m.key='origin' and (jsonb_typeof(m.value)<>'string' or char_length(m.value#>>'{}')>40 or (m.value#>>'{}')!~'^-?[0-9]{1,3},[0-9]{1,2},-?[0-9]{1,3}$'))) then raise exception 'Invalid metadata value type.';end if;if e->'meta' ? 'dir' and (e->'meta'->>'dir')::numeric not between 0 and 3 or e->'meta' ? 'delay' and (e->'meta'->>'delay')::numeric not between 1 and 4 or e->'meta' ? 'note' and (e->'meta'->>'note')::numeric not between 0 and 24 or e->'meta' ? 'level' and (e->'meta'->>'level')::numeric not between 0 and 8 then raise exception 'Metadata value out of range.';end if;if e->'meta' ? 'growth' and ((e->>'block')::int not in(26,101,102,103) or (e->'meta'->>'growth')::numeric not between 0 and 180) then raise exception 'Invalid crop growth.';end if;perform corvex_private.carbon_near_v6(p_id,p_dimension,((e->>'x')::real+.5)::real,((e->>'y')::real+.5)::real,((e->>'z')::real+.5)::real,r);end loop;return public.carbon_edit_v4(p_id,p_token,p_dimension,p_edits);end$function$
;
