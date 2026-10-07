# Browser survival redesign

Implemented original crisp 16×16 block artwork, stepped and connected block
geometry, matching ray picking/player/item collision, native-density creature
skins, visible sheared wool, baby proportions, distance-based animation, grazing,
obstacle steering and chicken slow falls. Fixed-face terrain lighting and less
glossy water replace the previous shader-pack look.

The browser interface keeps all login/recovery controls and adds a compact HUD,
fullscreen buttons, F1 HUD visibility, touch sprint/sneak and small-screen layout
fixes. Existing map, journal, graphics and survival controls remain available.

Validation uses the actual local renderer with isolated backend fixtures. The
80 unit tests, eight browser suites, server checks and build passed. Run
`npm test`; use `npm run` for `test:classic`, `test:browser`, `test:account`,
`test:world`, `test:effects`, `test:integrity`, `test:paper`, `test:performance`,
`test:server` and `build`. `BROWSER_EXECUTABLE_PATH` optionally selects an installed
signed Chrome binary; otherwise Playwright uses its own pinned Chromium.

Final regressions cover actual mining, crack stages, block removal, item drops
and tool wear. Fast foliage uses a separate opaque source atlas, tested through
real Canvas pixel reads, so transparent-pixel RGB loss cannot create black leaves.

Visual evidence is generated in ignored `artifacts/`: classic title/world and
inventory screenshots for desktop/laptop/mobile, touch controls, creature model
review, block artwork/worker geometry and Canvas fallback galleries.

The local development machine uses Node 24 and a checksum-verified Chrome from
Google's signed Linux package repository. Live Render, Minecraft reference pages
and video destinations were blocked by the cloud network policy during this
task. Required domain additions are saved in the environment configuration
draft. No gameplay videos, live authenticated multiplayer, real device GPU
performance or production deployment are claimed as verified.

The change substantially improves the existing survival game; it does not
reproduce Minecraft's complete content, world generation, AI or networking.
