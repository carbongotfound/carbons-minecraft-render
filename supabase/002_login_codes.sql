-- Optional short-lived login codes for cross-device session transfer.
-- Run in the Supabase SQL editor. The live client also has a same-origin /api/link fallback.
create table if not exists public.carbon_login_codes (
  code text primary key,
  player_id uuid not null,
  token text not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table public.carbon_login_codes enable row level security;
revoke all on public.carbon_login_codes from public, anon, authenticated;

create or replace function public.carbon_login_code_issue(p_id uuid, p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  if p_id is null or p_token is null or length(p_token) < 8 then
    raise exception 'Not signed in';
  end if;
  delete from carbon_login_codes where expires_at < now() or used_at is not null;
  delete from carbon_login_codes where player_id = p_id and used_at is null;
  v_code := '';
  for i in 1..6 loop
    v_code := v_code || substr(v_chars, 1 + (floor(random() * length(v_chars)))::int, 1);
  end loop;
  insert into carbon_login_codes(code, player_id, token, expires_at)
  values (v_code, p_id, p_token, now() + interval '12 minutes');
  return json_build_object('code', v_code, 'expires_in', 720);
end;
$$;

create or replace function public.carbon_login_code_redeem(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r carbon_login_codes%rowtype;
  v_code text;
begin
  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  if length(v_code) <> 6 then
    raise exception 'Invalid code';
  end if;
  select * into r from carbon_login_codes where code = v_code for update;
  if not found or r.used_at is not null or r.expires_at < now() then
    raise exception 'Code expired or already used';
  end if;
  update carbon_login_codes set used_at = now() where code = v_code;
  return json_build_object('id', r.player_id, 'token', r.token);
end;
$$;

revoke all on function public.carbon_login_code_issue(uuid, text) from public;
revoke all on function public.carbon_login_code_redeem(text) from public;
grant execute on function public.carbon_login_code_issue(uuid, text) to anon, authenticated;
grant execute on function public.carbon_login_code_redeem(text) to anon, authenticated;
