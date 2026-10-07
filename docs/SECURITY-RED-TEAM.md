# Independent review of the browser redesign

An agent separate from the implementation author reviewed movement, browser
controls, geometry/metadata, dropped items and account boundaries.

Findings fixed:

- Nonfinite stair direction metadata could propagate NaN into meshing and
  collision. Directions now require finite numbers; malformed cases have tests.
- Low-frame-rate gravity integration prevented full-block jumps. Ballistic
  displacement now preserves jump clearance at 20, 30, 60 and 144 updates/sec.
- Drops used broad block bounds and hovered over stair gaps. They now use the
  same composite surfaces as the renderer and player, with regression tests.
- Teleport, lost focus and pointer-lock changes retained movement. Those paths
  now clear horizontal velocity; touch sprint state also updates its button.

Login-code, account-save and recovery implementation remain unchanged. Existing
browser account tests verify transfer, rollback, undo and recovery ownership.
Local browser fixtures block both Supabase HTTP and realtime sockets; test hooks
retain the existing `127.0.0.1` plus `?test` restriction. No production world
edits, database migrations, destructive probes or permission changes were run.

This is a focused review of this change, not a comprehensive audit of the
existing multiplayer backend.
