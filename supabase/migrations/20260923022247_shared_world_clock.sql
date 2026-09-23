-- The database owns the world epoch and sleep offset; clients receive a sample
-- on their existing poll response. No clock state is accepted from a player.
create or replace function corvex_private.carbon_clock_snapshot()
returns jsonb language sql volatile set search_path = '' as $snapshot$
  select jsonb_build_object(
    'server_ms', t.ms, 'world_ms', greatest(0, t.ms - c.epoch + c.offset_ms),
    'day_length_ms', 1200000)
  from public.carbon_survival_clock c
  cross join lateral (select extract(epoch from clock_timestamp()) * 1000 as ms) t
  where c.id = 1
$snapshot$;
revoke all on function corvex_private.carbon_clock_snapshot() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.carbon_http_poll_v8(p_id uuid, p_token text, p_pose jsonb, p_block_after bigint DEFAULT 0, p_chat_after bigint DEFAULT 0, p_combat_after bigint DEFAULT 0, p_mob_state jsonb DEFAULT NULL::jsonb, p_presence_after bigint DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  base jsonb;
  was_active boolean;
  nm text;
  col text;
  dim text;
  event_cursor bigint := 0;
begin
  with stale as (
    update public.carbon_presence_v6
       set active=false, visible=false, left_at=clock_timestamp()
     where active and seen_at < clock_timestamp()-interval '45 seconds'
     returning id,name,color,dimension
  )
  insert into public.carbon_presence_events_v8(player_id,name,color,event,dimension)
  select id,name,color,'leave',dimension from stale;

  select coalesce((select active from public.carbon_presence_v6 where id=p_id),false)
    into was_active;

  base := public.carbon_http_poll_v7(
    p_id,p_token,p_pose,p_block_after,p_chat_after,p_combat_after,p_mob_state
  );

  select name,color into nm,col from corvex_private.sessions where id=p_id;
  dim := p_pose->>'dimension';

  update public.carbon_presence_v6
     set active=true,
         entered_at=case when not was_active then clock_timestamp() else coalesce(entered_at,clock_timestamp()) end,
         left_at=null
   where id=p_id;

  if not was_active then
    insert into public.carbon_presence_events_v8(player_id,name,color,event,dimension)
    values(p_id,nm,col,'join',dim);
  end if;

  select coalesce(max(id),0) into event_cursor from public.carbon_presence_events_v8;

  return base || jsonb_build_object(
    'clock', corvex_private.carbon_clock_snapshot(),
    'players',(
      select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb)
        from public.carbon_presence_v6 p
       where p.active and p.seen_at>clock_timestamp()-interval '45 seconds'
    ),
    'presence_events',(
      select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb)
        from (
          select id,player_id,name,color,event,dimension,created_at
            from public.carbon_presence_events_v8
           where id>greatest(0,p_presence_after)
           order by id
           limit 80
        ) e
    ),
    'presence_cursor',event_cursor
  );
end
$function$
;

-- Preserve the existing validated bed interaction and row lock.
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
insert into public.carbon_survival_drops(id,item,count,wear,x,y,z,vx,vy,vz,creator,dimension) values((p->>'id')::uuid,it.key,n,coalesce((p->>'wear')::int,0),(p->>'x')::real,(p->>'y')::real,(p->>'z')::real,greatest(-5,least(5,coalesce((p->>'vx')::real,0))),greatest(-5,least(5,coalesce((p->>'vy')::real,2))),greatest(-5,least(5,coalesce((p->>'vz')::real,0))),p_id,dim) on conflict(id) do nothing;
select * into d from public.carbon_survival_drops where id=(p->>'id')::uuid;if d.creator is distinct from p_id then raise exception 'Drop ID belongs to another player.';end if;outp:=to_jsonb(d);
elsif p_op='claim' then
if request is null then raise exception 'A pickup request ID is required.';end if;select * into d from public.carbon_survival_drops where id=(p->>'id')::uuid and dimension=dim and expires_at>now() for update;if d.id is null then outp:='{"claimed":false}';else
if d.created_at>clock_timestamp()-interval '650 milliseconds' then raise exception 'Item is still being thrown.';end if;
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
