# Carbons Minecraft 0.8.0 Render package

Full game source plus a long-running Node static server for Render. Multiplayer persistence stays on the existing Supabase project. The Render process does not open WebSockets.

The server binds `0.0.0.0` and `process.env.PORT` (local default `10000`) and serves files from `public/`. `GET /healthz` returns JSON `{ ok: true }`.

Presence v8 uses per-tab sessionStorage, explicit join/leave events, main-menu/tab-close leave only, and a 45-second crash fallback. ESC never leaves.

Terrain v3 smooths rivers/mountains and reduces ravines. `supabase/RESET_WORLD.sql` repeats the shared world reset.

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

Free web services spin down after about 15 minutes with no traffic. The next request can take about a minute to wake the process. That is expected on the free plan.

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
```

Open `http://127.0.0.1:10000/` in a browser.

## Multiplayer / Supabase

Render only serves static files and `/healthz`. Shared world data already talks to the existing Supabase project from the browser.

- Publishable URL and key are bundled in `public/src/engine.js`. You do not paste them into Render.
- Optional SQL: `supabase/001_presence_v8.sql` (presence v8) and `supabase/RESET_WORLD.sql` (destructive shared-world reset). Run those in the Supabase SQL editor only if you need them. They are not part of the Render build.
