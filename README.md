# Carbons Minecraft 0.9.4 Render package

Full game source plus a long-running Node static server for Render. Multiplayer persistence stays on the existing Supabase project. The game itself does not use this process for multiplayer sockets.

The server binds `0.0.0.0` and `process.env.PORT` (local default `10000`) and serves files from `public/`. `GET /healthz` returns JSON `{ ok: true }`. A tiny RFC 6455 keep-alive lives on the same HTTP server at `/ws/keepalive` (zero runtime npm dependencies; no `ws` package).

Presence v8 uses per-tab sessionStorage, explicit join/leave events, main-menu/tab-close leave only, and a 45-second crash fallback. ESC never leaves.

Terrain v3 smooths rivers/mountains and reduces ravines. `supabase/RESET_WORLD.sql` repeats the shared world reset.

## Account saves, rendering and journal (0.9.4)

- Removed the 34-goal system, tracker, completion prompts and goal XP claims. **Journal [J]** still contains exploration, the building catalog and village supply requests. Requests only require their supplies; delivered requests and previously earned XP survive the update.
- Survival state now saves under the authenticated account ID, locally and in the database. Login-code creation flushes inventory and settings first. Redemption checks the returned account ID, works without typing a name and restores inventory, equipment, XP, nutrition, location and journal state. A device that was superseded cannot overwrite the new device's save.
- The old browser-wide save is kept intact. If its ownership cannot be established, the original device offers an explicit import into the named account. Code redemption never imports the receiving device's unrelated legacy save.
- Decorative meshes batch by chunk/material. A fixed-camera browser comparison reduced **1,821 draw calls to 73**, while retaining all 42,480 decorative triangles. Worker geometry uses transferred buffers directly. Dense chunks copy contiguous rows instead of sampling 31,104 cells through the world accessor on the main thread. Worker allocation remains 75% of CPU threads.
- Light changes only rebuild affected chunks, distant light candidates avoid terrain generation, and failed drop uploads retry with a delay instead of a tight loop.
- Corrected zombie/skeleton/creeper front-face textures, narrowed skeleton limbs, revised farm-animal proportions and added distinct pig snouts, cow markings, sheep coats and chicken feet. Cobblestone now uses irregular stones. These are original Minecraft-inspired models/textures, not full Minecraft parity.

Verification: `npm test`, `npm run test:browser`, `npm run test:paper`, `npm run test:account`, `npm run test:performance`, `npm run test:world`. Browser checks use explicit software WebGL for reproducible CI rendering; draw-call savings are not a claim about FPS on every device. Account UI tests isolate database HTTP and exercise the real Render code service. The live database save test in `supabase/tests/account_saves.sql` verifies token isolation, handoff and stale-writer rejection, then rolls back its fixtures.

The additive `account_survival_saves` migration is applied. Its private table has RLS and no client grants; its public RPC deliberately uses the existing game's ID/token authentication model. The Supabase advisor's SECURITY DEFINER notice is expected for that custom-auth endpoint; see [the advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable). No world reset is performed.

## Paper requests (0.9.3)

Both photographed feature lists are implemented. See [the complete checklist](docs/PAPER_FEATURES.md) for controls and verification.

Highlights: recipe diagrams and furnace recipes, deepslate → lava, bone → bone meal, hydrated crop growth, a two-second player-drop delay, account-saved settings, 75% CPU worker allocation, real None/FXAA/SMAA/MSAA modes, render resolutions from 540p to 4K, smooth lighting, 2–128 loaded light sources, and reduced work while inactive. Open **Graphics settings** from the title or pause menu. **Ctrl+F3** shows actual render size.

Two additive migrations store settings privately, add the drop-delay flag and register furnace/growth data. Both are applied; no world reset is required. The existing shared day/night and sleep checks remain in the test suite.

The Render build now precompresses static assets; Node runs with a 128 MB V8 heap cap and bounded caches/connections. A local 50-request test measured approximately 57 MB RSS and 0.025 average CPU cores at roughly ten asset requests/second. This is a measured workload, not a production capacity guarantee.

## Shared world time and exploration (0.9.2)

- Day/night, weather, the clock item and daylight sensors now read a server clock sample included in every existing HTTP poll. A monotonic browser timer advances between samples; device date changes and old saved offsets cannot change world time. Older responses cannot undo a more recent sleep update.
- Sleeping in an Overworld bed advances the database clock for everyone. The bed RPC returns the new time immediately; other players receive it in their next poll. Daytime bed use sets a respawn point without skipping another day.
- Hostile mobs can spawn in dark caves during the day. Spawns need solid support, room for the mob, no nearby torches and at least 24 blocks from every player. Torches also suppress dungeon spawners.
- Spiders are neutral in open daylight until hit. Creepers have 20 health and no hidden bonus damage against them. Burning undead extinguish at night, in water and in rain. Farm animals follow food held by nearby players, including guests.
- Fixed breeding between ordinary adults with no cooldown fields. Baby growth takes 20 real minutes; age/cooldown state is included in both multiplayer snapshots and host handoffs.
- Outer terrain has taller conical spruce trees, frozen taiga water, desert cacti, forest flowers and swamp mushrooms. The central valley's generated terrain is retained; saved block edits still override natural terrain.
- A biome arrival banner and **Progress [J] → Exploration** track six biomes and 20 underground sites. Sites are recorded only when you descend into them, and discoveries survive reloading.

The migration `supabase/migrations/20260923022247_shared_world_clock.sql` has been applied to the linked Supabase project. It preserves the current epoch, world offset and all saves. The private snapshot helper has no public execution grant; existing RPC session and proximity checks remain in place.

Verification includes `npm test`, `npm run test:browser`, and `npm run test:world`. The world browser test runs two real game clients with computer clocks 16 days apart through the HTTP poll code, then checks shared nighttime, sleep, morning, weather, animal breeding and exploration persistence. Browser HTTP responses are isolated fixtures. `supabase/tests/world_clock.sql` separately exercises the live database RPCs with two temporary players and a bed, verifies sleep propagation and rejects forged offsets/invalid sessions, then rolls back every fixture.

## Building and redstone update (0.9.1)

- **50 new placeable blocks:** all 16 concrete colors, 13 additional wool colors, 11 quartz/polished stone/cut finishes, 9 slab types, and a daylight sensor. Slabs have half-height collision and geometry. Spruce and birch planks craft their matching slabs.
- **Daylight/night sensor:** craft glass + quartz + oak slabs at a crafting table. Right-click to invert it. Sky exposure and the shared day/night clock control signal strength; use night mode for automatic outdoor lighting.
- **Progress [J] → Build book:** six projects with diagrams and material lists, plus a searchable building catalog. Inventory recipes can now be filtered by building, colors, redstone, tools and food.
- Concrete crafts directly from four sand, four gravel and one dye, yielding eight blocks. Farmers sell yellow dye; the other dyes come from flowers, lapis, bone, coal, cactus and mixing.
- Repeaters now power only their output direction. Pistons work throughout each dimension, enforce the 12-block push limit and keep portal blocks/containers immovable when retracting.
- **Flint and steel already exists:** one iron ingot and one flint diagonally in a 2×2 grid. It lights obsidian portal frames and primes TNT. Ordinary blocks do not burn; using it on them no longer triggers an explosion.

The additive migration in `supabase/migrations/20260922184117_building_redstone_catalog.sql` registers 64 item types and extends the existing edit validator to block 195. It preserves sessions, world data, permissions and existing items. It has been applied to the linked project. No world reset is needed. Reload the game after deployment to load the new catalog.

The rollback-only SQL smoke test in `supabase/tests/building_catalog.sql` checks all 51 block states in three dimensions, storage/drop handling, invalid sessions and the block-ID limit. Browser coverage includes the build book, real recipe controls, placement, sensor circuits, flint behavior, and slab worker geometry.

## Survival update (0.9.0)

- Original 16-pixel block textures: grass edges, bark and end grain, distinct ore deposits, cobblestone, planks, bricks, leaves and workstations. Inventory blocks now use shaded cube icons; food has distinct pixel icons.
- Saturation is stored energy consumed before hunger. Every food has its own value, cooked meals last longer, and golden carrots are edible. A gold HUD meter and food tooltips show the values. Full hunger plus saturation permits faster healing; ordinary healing takes eight seconds.
- **Progress [J]** has 34 persistent goals, a goal tracker, one-time XP rewards, and exploration hints. The path covers the first night, mining, farming, construction, machines, enchanting, Netherite and the End.
- Six one-time **Village requests** consume supplies and reward emeralds, materials and XP. Requests unlock as you progress. Deliveries check inventory space before consuming anything.
- Twelve additional recipes include cookies (wheat + sugar in this world), mossy/chiseled bricks, packed ice, clay, snow, melon, magma blocks, diorite, granite, andesite and a charcoal campfire variant. Farmers now sell crop starters and sugar cane.
- Spruce and birch logs produce their matching planks; recipe autofill preserves the actual wood you use.

Existing saves keep their inventory, equipment and achievements. Old saves start with up to five saturation, capped at current hunger. Nutrition and personal journal progress persist in the existing browser save. This update needs no world reset or database migration.

### Verification

```powershell
npm install
npm test
npx playwright install chromium
npm run test:browser
```

The browser suite starts its own local server and exercises the real WebGL renderer, recipe grid, eating, HUD, journal, delivery transactions and save/reload. Multiplayer transport is stubbed and external backend requests are blocked; these checks do not verify production multiplayer or a deployment. Screenshots are saved under `artifacts/` (gitignored).

## Deploy on Render (Blueprint)

This repo is ready to deploy as a **free Node web service**. You do **not** add Render dashboard secrets or extra env vars.

- Render injects `PORT`. Do not set it yourself.
- `NODE_ENV=production` and `NODE_VERSION=24` are already in `render.yaml`.
- Multiplayer uses the existing Supabase project through client-side publishable credentials already in `public/src/engine.js`. Optional SQL helpers live under `supabase/`.

### Dashboard click path

1. Push (or merge) this repo so `render.yaml` is on GitHub branch `main`: [carbongotfound/carbons-minecraft-render](https://github.com/carbongotfound/carbons-minecraft-render).
2. Sign in at [dashboard.render.com](https://dashboard.render.com/).
3. Click **New**, then **Blueprint**.
4. Connect GitHub if prompted (Authorize Render, then allow access to this repository).
5. Click **Connect** next to `carbons-minecraft-render`.
6. On the Blueprint form:
   - Blueprint name: any name you like (for example `carbons-minecraft`).
   - Branch: `main`.
   - Blueprint Path: leave the default `render.yaml` (repo root).
7. Confirm the preview shows one **web** service named `carbons-minecraft`, runtime **Node**, plan **Free**, health check `/healthz`. There should be **no secret prompts**.
8. Click **Deploy Blueprint**.
9. Wait for the first build and deploy. Open the new web service. The live URL is at the top of the service page, `https://carbons-minecraft.onrender.com` or a similar `*.onrender.com` subdomain if that name is taken.

After the first deploy, each push to `main` rebuilds and redeploys automatically.

Free web services spin down after about 15 minutes with no traffic. Ping the WebSocket keep-alive below every ~10 minutes to keep the free instance awake. If it does sleep, the next request can take about a minute to wake the process.

## WebSocket keep-alive (Render free tier)

External pingers should use WebSocket, not HTTP:

```
wss://carbons-minecraft.onrender.com/ws/keepalive
```

On connect the server accepts. Send text `ping` (leading/trailing whitespace is ignored). The server replies text `pong`. The client may then close. Idle connects that send nothing stay open about 30 seconds, then close cleanly.

```bash
# websocat: send ping, print pong, exit
printf 'ping' | websocat -1 wss://carbons-minecraft.onrender.com/ws/keepalive
```

```js
// Node 22+ / browser
const ws = new WebSocket('wss://carbons-minecraft.onrender.com/ws/keepalive');
ws.addEventListener('open', () => ws.send('ping'));
ws.addEventListener('message', (ev) => { console.log(ev.data); ws.close(); });
```

### CLI alternative

The Render CLI can **validate** this Blueprint and **redeploy** an existing service. It does **not** create the first Blueprint. Use the dashboard steps above once, then optionally:

```bash
# Install: https://render.com/docs/cli
curl -fsSL https://raw.githubusercontent.com/render-oss/cli/refs/heads/main/bin/install.sh | sh
render login

# Validate render.yaml (needs `render login` plus an active workspace)
render blueprints validate render.yaml

# After the Blueprint exists, redeploy the web service (pick it when prompted)
render deploys create --wait --confirm
```

There is no `render.yaml` apply/create command. First-time provisioning is **New > Blueprint > Deploy Blueprint**.

### Manual web service (if you skip Blueprints)

**New > Web Service >** connect this GitHub repo (`main`), then:

| Field | Value |
| --- | --- |
| Language / runtime | Node |
| Branch | `main` |
| Build command | `true` |
| Start command | `node server.mjs` |
| Instance type | Free |
| Health check path | `/healthz` |

Add `NODE_ENV=production` only if you want it explicit. `PORT` is still injected. Do not add Supabase keys on Render.

## Run locally

Requires Node 20 or newer (Node 24 matches Render).

```bash
node server.mjs
# then: curl -sS http://127.0.0.1:10000/healthz
# and:  curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:10000/
# and:  printf 'ping' | websocat -1 ws://127.0.0.1:10000/ws/keepalive
```

Open `http://127.0.0.1:10000/` in a browser.

## Multiplayer / Supabase

Render serves static files, `GET /healthz`, and the `/ws/keepalive` ping/pong socket. Shared world data already talks to the existing Supabase project from the browser. This keep-alive is not used by the game client.

- Publishable URL and key are bundled in `public/src/engine.js`. You do not paste them into Render.
- Optional SQL: `supabase/001_presence_v8.sql` (presence v8) and `supabase/RESET_WORLD.sql` (destructive shared-world reset). Run those in the Supabase SQL editor only if you need them. They are not part of the Render build.
