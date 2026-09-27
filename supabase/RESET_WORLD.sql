-- DESTRUCTIVE shared-world reset. Run in the Supabase SQL editor.
-- Clears every placed/broken block, dropped item, container, vehicle and mob in all dimensions.
-- Player accounts, settings and inventories are kept unless you also run the optional part below.
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

-- OPTIONAL: also wipe player progress (inventories, armour, XP, positions, journal).
-- Use this if items were duplicated before 0.9.8 and you want everyone to start fresh.
-- Game 0.9.8+ notices that the server save went back and ignores older copies cached on
-- devices. Players can still restore a personal device backup from "Accounts & recovery".
-- begin;
-- truncate table corvex_private.carbon_player_saves;
-- truncate table corvex_private.carbon_save_history;
-- commit;
