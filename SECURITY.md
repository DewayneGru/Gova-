# Security & Measurement Integrity Notes

Gova is a **software simulation** of a neuromorphic control stack. Telemetry shown in the UI
(power, latency, branching ratio, etc.) is produced by the simulator, not measured from silicon.
Every signal in the closed-loop homeostatic controller (`src/lib/closedLoopHomeostasis.ts`) is
explicitly tagged with provenance (`SIMULATED`, `CONTROL_TARGET`, or `DERIVED`) and separated into
actuator control deltas (`ControlDeltaPacket`) vs. measured simulation state (`MeasuredTelemetryState`).

## Implemented Security & Integrity Controls

- **Fail-Closed Watchdog Architecture (`src/lib/synapseEdgeWatchdog.ts`, `src/components/SynapseEdgeWatchdogStudio.tsx`, `server.ts`)**:
  - Evaluators `evaluateV2` and `evaluateV3SparkRsi` enforce strict semantic intent matching across all 8 risk categories.
  - Fail-Closed Policy: Any proposal that does not explicitly match verified safe patterns (`isExplicitlySafeProposal`) is strictly escalated to the operator (`ESCALATE`, `verdict: AMBIGUOUS`, `disagreement: true`) rather than being automatically approved.
  - Studio UI and server write gate (`POST /api/watchdog/apply-codebase-refactoring`) both enforce this fail-closed check, preventing unauthorized auto-commits.
  - Benchmark & Fail-Closed Tradeoff Accounting: `community_seed_v0` (originally held-out at `0/13`, later absorbed into `synapseEdgeWatchdog.ts` rules) is tracked strictly as a regression suite rather than independent held-out evidence. On untuned novel wording (`fresh_probe_16`), the fail-closed policy catches `100% (8/8)` of unseen risky changes via `ESCALATE` (`0/8` false-alarm blocks), at the measured operational cost of a `75.0% (6/8)` safe escalation rate (`2/8` safe changes auto-approved; `6/8` routed to human review). A sealed 24-case suite (`community_seed_v1.hashes.json`) is published as SHA-256 preimage commitments (`<id>:<type>:<change>`) with plaintext withheld to prevent rule tuning.
- **Strict Control Targets vs. Measured Telemetry Separation (`src/lib/closedLoopHomeostasis.ts`, `src/lib/snnEngine.ts`)**:
  - Defined explicit `ControlTargets` interface and default setpoints (`DEFAULT_CONTROL_TARGETS`).
  - Controller update routines (`stepBalancedHomeostasis`, `stepClosedLoopHomeostasis`, `stepEdgeFirmwareAndKeelReflex`) output control deltas (`ControlDeltaPacket`) rather than overwriting measured simulation state.
  - Reported telemetry (cortical active fraction, branching ratio, firing rates) reflects genuine, independent measurements from the LIF/AER spiking simulation engine without synthetic target clamping.
- **Argon Model (`gemini-4-argon`) Final Set Builder & Functional Self-Improvement**:
  - `gemini-4-argon` is configured as the terminal final set builder component within the Autonomous Recursive Self-Improvement (RSI) loop across `src/lib/selfImprovement.ts` (`ArgonSetBuilderEngine`), `src/components/AutonomousSelfImprovementPanel.tsx`, `BioInspiredBuilderPipelinePanel`, `geminiSparkWrapper`, `SynapseEdgeWatchdogStudio`, and `server.ts`.
  - Self-improvement adjustments are fully functional: `applyModelAdjustments` and `ArgonSetBuilderEngine.applyRefinedStructuralSetToEngine` actively enforce LTD dominance across all active synapses (clamping weights > 1.05 when `ltdRatio >= 1.25`), engage lateral ring inhibition on interneurons N12/N13, recalibrate drift velocity bounds, and persist state across sessions in `.refactor_ledger.json` and `.active_snn_tuning.json`.
- **Separation of Authority & Cryptographic Pre-Hash Receipt Gate (`src/server/security.ts`, `src/server/shadowRefactoring.ts`, `server.ts`)**:
  - **Immutable Watchdog Boundary**: The proposing model has zero write access to the filesystem or its own execution loop. Protected boundary paths (`src/lib/synapseEdgeWatchdog.ts`, `src/server/security.ts`, `src/server/shadowRefactoring.ts`, `server.ts`, `package.json`, `benchmark/`, `synapse_governor.py`) are hard-locked against modification (`WATCHDOG_TAMPERING_BLOCKED`).
  - **No Self-Authorization**: `POST /api/watchdog/apply-codebase-refactoring` never trusts client-supplied `decision` verdicts. It re-evaluates the proposal, diff hunks, and target file independently on the server (`SELF_AUTHORIZATION_BLOCKED`).
  - **Strict Pre-Hash Verification (`expectedPreHash`)**: Every proposal records the full SHA-256 digest of the target file's live bytes on disk (`computeFilePreHash`). At commit time, `verifyExpectedPreHash` compares `expectedPreHash` against the file on disk and fails closed (`409 Conflict`, `PRE_HASH_MISMATCH_BLOCKED`) if anything changed out of band.
  - **No Substring Backdoors**: `detectSubstringBackdoor` and `isExplicitlySafeProposal` inspect diff hunks (`+`/`-` lines) and file extensions independently of the proposal title. Claims such as `"Minor typo fix in README"` that touch executable code or control parameters are intercepted and blocked (`SUBSTRING_BACKDOOR_BLOCKED`).
  - **Human-in-the-Loop for Consequential Scope & Merkle Receipts**: Any structural, architectural, or unverified change is routed to `HUMAN_IN_THE_LOOP_SIGNOFF` and requires explicit operator signoff before apply. Every evaluation and commit emits a signed `CryptographicAuditReceipt` linked into a binary Merkle tree (`.refactor_receipts.json`).
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
