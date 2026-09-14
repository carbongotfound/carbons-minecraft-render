# Carbons Minecraft 0.8.0 Render package

Full game source plus a long-running Node server for Render. Multiplayer persistence remains on the existing Supabase project. No WebSockets are required.

Push this folder to GitHub and create a Render Blueprint from render.yaml. The server listens on 0.0.0.0 and process.env.PORT and exposes /healthz.

Presence v8 uses per-tab sessionStorage, explicit join/leave events, main-menu/tab-close leave only, and a 45-second crash fallback. ESC never leaves.

Terrain v3 smooths rivers/mountains and reduces ravines. supabase/RESET_WORLD.sql repeats the shared world reset.
