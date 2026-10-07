# Redesign trust boundaries

Assets: account credentials, inventory/save ownership, shared block edits and
player presence. The Node server serves public assets; the browser is untrusted;
Supabase RPCs remain responsible for authorization and revision checks.

This change must not expose account tokens, accept login IDs as authentication,
write to the production world from browser tests, change RPC permissions, or
expand a local test hook beyond the existing 127.0.0.1 plus `?test` guard.
UI labels derived from players or errors must use textContent; item markup uses
the existing fixed item catalog. Startup instructions never contain credentials.
