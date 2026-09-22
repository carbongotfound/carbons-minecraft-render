# Carbons Minecraft 0.9.0 Render package

Full game source plus a long-running Node static server for Render. Multiplayer persistence stays on the existing Supabase project. The game itself does not use this process for multiplayer sockets.

The server binds `0.0.0.0` and `process.env.PORT` (local default `10000`) and serves files from `public/`. `GET /healthz` returns JSON `{ ok: true }`. A tiny RFC 6455 keep-alive lives on the same HTTP server at `/ws/keepalive` (zero runtime npm dependencies; no `ws` package).

Presence v8 uses per-tab sessionStorage, explicit join/leave events, main-menu/tab-close leave only, and a 45-second crash fallback. ESC never leaves.

Terrain v3 smooths rivers/mountains and reduces ravines. `supabase/RESET_WORLD.sql` repeats the shared world reset.

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
