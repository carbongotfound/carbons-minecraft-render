-- DESTRUCTIVE shared-world reset. Browser-local inventories are preserved.
begin;
truncate table public.carbon_survival_blocks;
truncate table public.carbon_dimension_blocks;
truncate table public.carbon_survival_drops;
truncate table public.carbon_survival_objects;
truncate table public.carbon_vehicles_v4;
truncate table public.carbon_mob_state_v7;
truncate table corvex_private.carbon_storage;
truncate table corvex_private.carbon_loot_v4;
truncate table corvex_private.carbon_workshops_v4;
update public.carbon_hosts_v6 set owner=null,expires_at=clock_timestamp(),generation=generation+1;
update public.carbon_presence_v6 set active=false,visible=false,left_at=clock_timestamp();
update public.carbon_world_v6 set world_size=1024,height=96,generator='frontier-v3-smooth' where id=1;
commit;
