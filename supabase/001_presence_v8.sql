-- Presence lifecycle v8 schema. The live Supabase project already has carbon_http_poll_v8 and carbon_http_leave_v8 installed.
alter table public.carbon_presence_v6 add column if not exists active boolean not null default false;
alter table public.carbon_presence_v6 add column if not exists entered_at timestamptz;
alter table public.carbon_presence_v6 add column if not exists left_at timestamptz;
create table if not exists public.carbon_presence_events_v8(id bigserial primary key,player_id uuid not null,name text not null,color text not null,event text not null check(event in ('join','leave')),dimension text not null check(dimension in ('overworld','nether','end')),created_at timestamptz not null default clock_timestamp());
