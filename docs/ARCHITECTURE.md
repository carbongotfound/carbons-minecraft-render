# Browser survival redesign

The existing Node 24 static server, bundled Three.js renderer, chunk worker,
Supabase transport, account login codes and account-save ownership stay in place.
No world reset, item-ID remapping or database migration is part of this change.

The redesign uses the current atlas coordinates with original 16-pixel artwork,
shared textured mob models, neighbor-aware block geometry and browser-native
pointer lock. Player collision uses the same block boxes as visible geometry.
Movement and animation depend on elapsed time and distance rather than frame count.

The UI retains existing element IDs and handlers. A final stylesheet provides a
pixel/beveled game interface; browser options control the additional map and HUD
without deleting their functionality. Authentication and shared-world writes
remain behind existing account/session and RPC checks.

Validation uses Node tests and Playwright in an isolated local world. Browser
fixtures block production database traffic and exercise the actual renderer,
inventory, mining, placement, movement and account UI. Production database
mutations, world resets and deployment require separate deliberate actions.
