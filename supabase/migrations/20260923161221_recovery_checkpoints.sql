-- Keep account progress after temporary presence sessions expire. Back up all
-- existing saves before changing the write path. No inventory is replaced here.
create table corvex_private.carbon_save_history (
 owner uuid not null references corvex_private.sessions(id) on delete cascade,
 revision bigint not null,
 state jsonb not null,
 created_at timestamptz not null default now(),
 reason text not null,
 primary key(owner,revision)
);
alter table corvex_private.carbon_save_history enable row level security;
revoke all on corvex_private.carbon_save_history from public,anon,authenticated;
insert into corvex_private.carbon_save_history(owner,revision,state,created_at,reason)
 select owner,revision,state,updated_at,'Before recovery update'
 from corvex_private.carbon_player_saves where state is not null;

-- Preserve saved accounts in the pre-existing session cleanup. Other games using
-- corvex_join retain their existing cleanup behavior.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.corvex_join(text,text)'::regprocedure);
 if position('delete from corvex_private.sessions where expires_at<now()-interval ''1 day'';' in definition)=0 then
  raise exception 'Unexpected session cleanup definition';
 end if;
 definition:=replace(definition,'delete from corvex_private.sessions where expires_at<now()-interval ''1 day'';',
  'delete from corvex_private.sessions s where expires_at<now()-interval ''1 day'' and not exists(select 1 from corvex_private.carbon_player_saves v where v.owner=s.id);');
 execute definition;
 -- A returning player still needs the original secret token. Expired presence
 -- must not silently create a new identity for an existing saved account.
 definition:=pg_get_functiondef('public.carbon_survival_join_v3(text,text,text)'::regprocedure);
 definition:=replace(definition,'and expires_at>now()-interval ''1 day'' for update',
  'and (expires_at>now()-interval ''1 day'' or exists(select 1 from corvex_private.carbon_player_saves v where v.owner=corvex_private.sessions.id)) for update');
 execute definition;
end $$;

create or replace function public.carbon_account_save(p_id uuid,p_token text,p_writer uuid,p_op text,p_revision bigint default 0,p_state jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved corvex_private.carbon_player_saves; result jsonb; checkpoint boolean;
begin
 if not exists(select 1 from corvex_private.sessions where id=p_id and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>now()) then raise exception 'Reconnect to load your account.';end if;
 if p_writer is null or p_op not in ('load','save','history','read','restore','checkpoint') then raise exception 'Invalid save operation.';end if;
 if p_op='history' then
  select coalesce(jsonb_agg(jsonb_build_object('revision',revision,'time',created_at,'reason',reason,'inventory',state->'inventory','xp',state->'xp') order by revision desc),'[]'::jsonb) into result from corvex_private.carbon_save_history where owner=p_id;
  return jsonb_build_object('owner',p_id,'history',result);
 elsif p_op='read' then
  select state into result from corvex_private.carbon_save_history where owner=p_id and revision=p_revision;
  if result is null then raise exception 'Backup not found.';end if;
  return jsonb_build_object('owner',p_id,'state',result);
 end if;
 insert into corvex_private.carbon_player_saves(owner) values(p_id) on conflict(owner) do nothing;
 select * into saved from corvex_private.carbon_player_saves where owner=p_id for update;
 if p_op<>'load' then
  if saved.writer is distinct from p_writer then return jsonb_build_object('ok',false,'reason','account_open_elsewhere');end if;
  if saved.revision<>p_revision then return jsonb_build_object('ok',false,'reason','save_conflict');end if;
 end if;
 checkpoint:=p_op in ('load','restore','checkpoint') or not exists(select 1 from corvex_private.carbon_save_history where owner=p_id and created_at>now()-interval '5 minutes');
 if saved.state is not null and checkpoint then
  insert into corvex_private.carbon_save_history(owner,revision,state,reason)
   values(p_id,saved.revision,saved.state,case when p_op='restore' then 'Before restoring progress' when p_op='load' then 'Before joining' when p_op='checkpoint' then 'Before switching accounts' else 'Automatic checkpoint' end)
   on conflict(owner,revision) do nothing;
  -- Keep the original anchor plus the newest 29 checkpoints.
  delete from corvex_private.carbon_save_history h where h.owner=p_id
   and h.revision<>(select min(revision) from corvex_private.carbon_save_history where owner=p_id)
   and h.revision not in(select revision from corvex_private.carbon_save_history where owner=p_id order by revision desc limit 29);
 end if;
 if p_op='load' then
  update corvex_private.carbon_player_saves set writer=p_writer where owner=p_id;
  return jsonb_build_object('owner',p_id,'state',saved.state,'revision',saved.revision);
 elsif p_op='checkpoint' then return jsonb_build_object('ok',true,'owner',p_id,'revision',saved.revision);end if;
 if p_state is null or jsonb_typeof(p_state)<>'object' or octet_length(p_state::text)>262144 or jsonb_typeof(p_state->'inventory') is distinct from 'array' or jsonb_array_length(p_state->'inventory')>36 then raise exception 'Invalid survival save.';end if;
 if p_state->>'owner' is not null and p_state->>'owner'<>p_id::text then raise exception 'Save belongs to another account.';end if;
 update corvex_private.carbon_player_saves set state=p_state,revision=revision+1,updated_at=now() where owner=p_id returning * into saved;
 return jsonb_build_object('ok',true,'owner',p_id,'revision',saved.revision);
end;
$$;
revoke all on function public.carbon_account_save(uuid,text,uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.carbon_account_save(uuid,text,uuid,text,bigint,jsonb) to anon,authenticated;
