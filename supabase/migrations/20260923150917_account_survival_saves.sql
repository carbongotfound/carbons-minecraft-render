-- Survival saves belong to the existing verified session account. Direct table
-- access is disabled; the token check is identical to the game's object RPCs.
create table corvex_private.carbon_player_saves (
 owner uuid primary key references corvex_private.sessions(id) on delete cascade,
 state jsonb,
 revision bigint not null default 0,
 writer uuid,
 updated_at timestamptz not null default now()
);
alter table corvex_private.carbon_player_saves enable row level security;
revoke all on corvex_private.carbon_player_saves from public,anon,authenticated;
create or replace function public.carbon_account_save(p_id uuid,p_token text,p_writer uuid,p_op text,p_revision bigint default 0,p_state jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved corvex_private.carbon_player_saves;
begin
 if not exists(select 1 from corvex_private.sessions where id=p_id and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>now()) then raise exception 'Reconnect to load your account.';end if;
 if p_writer is null or p_op not in ('load','save') then raise exception 'Invalid save operation.';end if;
 insert into corvex_private.carbon_player_saves(owner) values(p_id) on conflict(owner) do nothing;
 select * into saved from corvex_private.carbon_player_saves where owner=p_id for update;
 if p_op='load' then
  update corvex_private.carbon_player_saves set writer=p_writer where owner=p_id;
  return jsonb_build_object('owner',p_id,'state',saved.state,'revision',saved.revision);
 end if;
 if saved.writer is distinct from p_writer then return jsonb_build_object('ok',false,'reason','account_open_elsewhere');end if;
 if saved.revision<>p_revision then return jsonb_build_object('ok',false,'reason','save_conflict');end if;
 if p_state is null or jsonb_typeof(p_state)<>'object' or octet_length(p_state::text)>262144 or jsonb_typeof(p_state->'inventory') is distinct from 'array' or jsonb_array_length(p_state->'inventory')>36 then raise exception 'Invalid survival save.';end if;
 update corvex_private.carbon_player_saves set state=p_state,revision=revision+1,updated_at=now() where owner=p_id returning * into saved;
 return jsonb_build_object('ok',true,'owner',p_id,'revision',saved.revision);
end;
$$;
revoke all on function public.carbon_account_save(uuid,text,uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.carbon_account_save(uuid,text,uuid,text,bigint,jsonb) to anon,authenticated;
