# Security notes

Gova is a **software simulation** of a neuromorphic control stack. Telemetry shown in the UI
(power, latency, branching ratio, etc.) is produced by the simulator, not measured from silicon.

## Current status

- `POST /api/bridge/sync` requires a Firebase ID token and only accepts the keys
  `projectScope`, `activeContext`, `conversationMemory`, `markdownState`.
- `ActionLog` runs in the browser bundle, so it cannot hold a secret. It is **tamper-evident**
  (hash chain), not **tamper-proof**. Use `src/lib/serverSigner.ts` (HMAC-SHA256, key from
  `ACTIONLOG_HMAC_KEY`) for server-side signing.

## Known gaps (not yet fixed)

- Most other `/api/*` routes are unauthenticated, including ones that spend Gemini quota
  (`/api/chat`, `/api/generate-image`, text-to-speech). Do not expose a public deployment
  without adding auth and rate limiting.
- `/api/watchdog/apply-codebase-refactoring` records an approval but does not write code.
- The self-refactor "snapshot hash" is derived from file name + timestamp, not file contents.

Report issues by opening a GitHub issue.
