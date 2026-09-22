-- Building update 0.9.1. Adds items without changing existing saves or permissions.
-- Both block tables already accept IDs through 200; the edit RPC had a lower cap.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.carbon_edit_v4(uuid,text,text,jsonb)'::regprocedure);
  if position('nb not between 0 and 144' in definition) > 0 then
    execute replace(definition, 'nb not between 0 and 144', 'nb not between 0 and 195');
  elsif position('nb not between 0 and 195' in definition) = 0 then
    raise exception 'Unexpected carbon_edit_v4 validator; review before applying.';
  end if;
end
$migration$;

-- The shared storage/drop validator uses this registry. Existing rows are preserved.
insert into corvex_private.carbon_items(key, stack_limit, durability, fuel_seconds) values
  ('white_concrete', 64, 0, null),
  ('orange_concrete', 64, 0, null),
  ('magenta_concrete', 64, 0, null),
  ('light_blue_concrete', 64, 0, null),
  ('yellow_concrete', 64, 0, null),
  ('lime_concrete', 64, 0, null),
  ('pink_concrete', 64, 0, null),
  ('gray_concrete', 64, 0, null),
  ('light_gray_concrete', 64, 0, null),
  ('cyan_concrete', 64, 0, null),
  ('purple_concrete', 64, 0, null),
  ('blue_concrete', 64, 0, null),
  ('brown_concrete', 64, 0, null),
  ('green_concrete', 64, 0, null),
  ('red_concrete', 64, 0, null),
  ('black_concrete', 64, 0, null),
  ('orange_wool', 64, 0, null),
  ('magenta_wool', 64, 0, null),
  ('light_blue_wool', 64, 0, null),
  ('yellow_wool', 64, 0, null),
  ('lime_wool', 64, 0, null),
  ('pink_wool', 64, 0, null),
  ('gray_wool', 64, 0, null),
  ('light_gray_wool', 64, 0, null),
  ('cyan_wool', 64, 0, null),
  ('purple_wool', 64, 0, null),
  ('brown_wool', 64, 0, null),
  ('green_wool', 64, 0, null),
  ('black_wool', 64, 0, null),
  ('quartz_block', 64, 0, null),
  ('chiseled_quartz', 64, 0, null),
  ('quartz_pillar', 64, 0, null),
  ('polished_granite', 64, 0, null),
  ('polished_diorite', 64, 0, null),
  ('polished_andesite', 64, 0, null),
  ('smooth_sandstone', 64, 0, null),
  ('cut_sandstone', 64, 0, null),
  ('smooth_red_sandstone', 64, 0, null),
  ('cut_red_sandstone', 64, 0, null),
  ('cut_copper', 64, 0, null),
  ('spruce_slab', 64, 0, 7),
  ('birch_slab', 64, 0, 7),
  ('stone_brick_slab', 64, 0, null),
  ('brick_slab', 64, 0, null),
  ('sandstone_slab', 64, 0, null),
  ('red_sandstone_slab', 64, 0, null),
  ('quartz_slab', 64, 0, null),
  ('nether_brick_slab', 64, 0, null),
  ('deepslate_slab', 64, 0, null),
  ('daylight_sensor', 64, 0, null),
  ('white_dye', 64, 0, null),
  ('orange_dye', 64, 0, null),
  ('magenta_dye', 64, 0, null),
  ('light_blue_dye', 64, 0, null),
  ('yellow_dye', 64, 0, null),
  ('lime_dye', 64, 0, null),
  ('pink_dye', 64, 0, null),
  ('gray_dye', 64, 0, null),
  ('light_gray_dye', 64, 0, null),
  ('cyan_dye', 64, 0, null),
  ('purple_dye', 64, 0, null),
  ('brown_dye', 64, 0, null),
  ('green_dye', 64, 0, null),
  ('black_dye', 64, 0, null)
on conflict (key) do nothing;
