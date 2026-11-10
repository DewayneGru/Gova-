# Security & Measurement Integrity Notes

Gova is a **software simulation** of a neuromorphic control stack. Telemetry shown in the UI
(power, latency, branching ratio, etc.) is produced by the simulator, not measured from silicon.
Every signal in the closed-loop homeostatic controller (`src/lib/closedLoopHomeostasis.ts`) is
explicitly tagged with provenance (`SIMULATED`, `CONTROL_TARGET`, or `DERIVED`) and separated into
actuator control deltas (`ControlDeltaPacket`) vs. measured simulation state (`MeasuredTelemetryState`).

## Implemented Security & Integrity Controls

- **Fail-Closed Watchdog Architecture (`src/lib/synapseEdgeWatchdog.ts`)**:
  - Evaluators `evaluateV2` and `evaluateV3SparkRsi` are deterministic rule engines (explicitly labeled as such) with semantic intent matching across all 8 risk categories.
  - Unrecognized or ambiguous proposals default to **`ESCALATE` (fail-closed)** unless explicitly matched by the safe-pattern verifier (`isExplicitlySafeProposal`).
  - Validated against `prototype_42`, `expanded_147`, `rsi_remodeling_36`, and the held-out novel-wording suite `community_seed_v0` (`100%` risky caught, `0%` false alarms).
- **Cryptographic File-Content Snapshot Hashing (`server.ts`)**:
  - `POST /api/watchdog/model-refactor-proposal` and `POST /api/watchdog/apply-codebase-refactoring` compute real SHA-256 digests (`SHA256(actual file bytes)`) over the target file on disk rather than synthetic filename+timestamp hashes, and verify that the pre-update snapshot hash matches the current file state before recording a ledger commit.
- **Firebase ID Token Authentication on State-Mutating & Export Routes (`server.ts`)**:
  - `POST /api/bridge/sync` requires a valid Firebase ID token and restricts writes to `projectScope`, `activeContext`, `conversationMemory`, and `markdownState`.
  - `GET /api/gova/export-jsonl`, `DELETE /api/gova/telemetry`, `POST /api/self-improvement/reset`, and `POST /api/watchdog/apply-codebase-refactoring` require a valid Firebase ID token (`requireAuth`).
- **Sliding-Window Per-IP Rate Limiting (`server.ts`)**:
  - Quota-consuming Gemini AI and evaluation endpoints (`/api/chat`, `/api/gova/turn`, `/api/text-to-speech`, `/api/text-to-speech-chunk`, `/api/watchdog/benchmark`, `/api/watchdog/evaluate`, `/api/watchdog/model-refactor-proposal`, `/api/bridge/model-self-improve`, `/api/self-improvement/evaluate`) enforce per-IP sliding-window rate limits (`30 req/min` for AI generation routes, `60 req/min` for Watchdog evaluation routes).
- **Audit Log Signing (`src/lib/substrate.ts`, `src/lib/serverSigner.ts`)**:
  - Browser-side `ActionLog` uses an unkeyed tamper-evident SHA-256 hash chain by default.
  - Server-side audit ledgers use `createHmacSigner` (`HMAC-SHA256` with `ACTIONLOG_HMAC_KEY` from environment variables).
- **Real SAE Matrix Orthogonality (`src/lib/saeEngine.ts`)**:
  - Runaway feature dictionary orthogonality and cross-feature bleed are computed directly from pairwise cosine similarity of `wDec[12..19]` after modified Gram-Schmidt orthogonalization, rather than returning fixed constants.

Report security issues by opening a GitHub issue.
