# Photographed feature checklist — 0.9.3

The handwritten pages are the feature brief. The later correction changes the worker allocation from 25% to **75%**. The resolution choices and Render budget were confirmed in conversation.

| Request | Implementation / how to use it |
| --- | --- |
| Show recipes and how to craft items | Inventory recipe cards now show a visible 2×2 or 3×3 diagram, ingredient counts, station requirements and a Fill crafting grid button. Missing ingredients do not hide the recipe. |
| Fill a bucket by right-clicking water | Aim at water within five blocks and use an empty bucket. Water can be placed again; lava uses the same bucket path. A missed ray now gives a useful message. |
| Smelt deepslate into a lava block that can be bucketed | Furnace: deepslate + fuel → one Lava block. Place it as a flowing source, then scoop it with a bucket. Furnace recipes appear under the recipe book's Smelting filter. |
| Water within a five-block radius increases farmland growth by 15% | Wheat, carrots, potatoes and beetroot on farmland receive a 1.15 growth multiplier when water is within a horizontal radius of five, at crop or soil level. The server clock supplies crop age. |
| Sync day/night and sleep for everyone | Existing server clock retained. Real database and two-client regression tests cover shared morning after sleep and incorrect device clocks. |
| Delay pickup of player-dropped items | Q, Ctrl+Q and the touch Drop button mark intentional drops. All players must wait two seconds. The server enforces the delay and the client waits before adding the stack to inventory. Ordinary drops retain their 650 ms delay. |
| Bone → bone meal recipe | One bone produces three bone meal. Right-click an immature crop with bone meal to add one growth stage (60 seconds), capped at maturity. |
| Save settings per account | Graphics, mouse sensitivity, camera view, view bobbing and sound persist privately with the game's account/session identity. Using that account's login code on another device restores them. Saves retry after connection failures; Save and leave flushes pending changes. |
| Show render resolution in Ctrl+F3 | Debug overlay reports actual drawing-buffer dimensions, AA mode, loaded lights and workers. The earlier Ctrl+3 shortcut also works. |
| Maximum loaded lights, 2–128 | Graphics settings controls the nearest loaded sources used for terrain lighting and glow visuals. The nearest eight also provide dynamic lights for moving objects, keeping shader costs bounded. |
| 75% of CPU threads as workers | `max(1, floor(navigator.hardwareConcurrency × 0.75))` mesh workers. Four reported threads means three workers. |
| None / FXAA / SMAA / MSAA | None renders directly; FXAA uses the official Three r180 shader; SMAA uses its three-pass implementation; MSAA uses a multisampled target with up to four supported samples. Unsupported MSAA reports None. |
| Replace Graphics quality presets with render resolution | 960×540, 1280×720, 1920×1080, 2560×1440, 3840×2160. The selected budget fits the screen's aspect ratio and GPU limits. UI resolution stays native. Actual dimensions are shown. |
| Slow the game when inactive | Rendering drops to 10 FPS when unfocused, at most 1 FPS when hidden, and 30 FPS in menus. Hidden tabs may be suspended further by the browser. Network polling and mesh work are reduced; world time remains server-owned. |
| Optimize for Render: 512 MB RAM / 0.1 CPU | Precompressed assets, ETags/304 responses, bounded caches and login-code/socket bookkeeping, streaming file delivery, and a 128 MB V8 heap limit. A local test at approximately ten asset requests/second measured 56.77 MB peak RSS and 0.0249 average CPU cores. These measurements are not a production capacity guarantee. |
| Separate graphics menu, accessible from main menu | Graphics settings is on both the title screen and pause menu. It includes resolution, AA, lights, smooth lighting, FOV, bobbing, shadows, camera view, render distance and shadow distance. |
| Smooth lighting and visuals for light sources | Toggle vertex lighting/AO smoothing. Torches, glowstone, lava, redstone lights, magma and campfires have nearby illumination and colored glow visuals; fire sources flicker. |

## Verification

- `npm test`: 45 logic tests, including worker allocation, aspect-preserving resolutions, settings bounds, crop hydration, pickup timing and the bone meal recipe.
- `npm run test:browser`: existing crafting, nutrition, progression, building, redstone, persistence and mobile checks.
- `npm run test:world`: shared day/night and sleeping with two real clients whose device clocks disagree by 16 days; mob/breeding/exploration regression checks.
- `npm run test:paper`: all AA modes, all five rendering resolutions, visible recipes, bucket filling/placing, bone meal use, 2/128 light limits, account isolation and mobile graphics controls.
- `npm run test:server`: compressed asset correctness, conditional requests, HEAD requests, local CPU/RSS measurement under load.
- `supabase/tests/paper_features.sql` and `supabase/tests/world_clock.sql`: real database RPC checks, with every fixture rolled back.

Browser gameplay tests isolate multiplayer HTTP responses. The SQL tests independently exercise the live database; production verification checks deployment assets and the public interface. Canvas2D fallback retains its bounded software rendering budget and does not support WebGL anti-aliasing.

The two additive migrations preserve the world and existing saves. The private settings table intentionally has no direct-client RLS policy or grants; access goes through the existing session-validated object RPC. Three r180 addon source and its MIT license are under `public/vendor/three`.
