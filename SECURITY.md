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
  - Validated against `prototype_42`, `sealed_147`, `rsi_remodeling_36`, and held-out novel-wording suite `community_seed_v0` (`100%` risky caught, `0%` false alarms).
- **Strict Control Targets vs. Measured Telemetry Separation (`src/lib/closedLoopHomeostasis.ts`, `src/lib/snnEngine.ts`)**:
  - Defined explicit `ControlTargets` interface and default setpoints (`DEFAULT_CONTROL_TARGETS`).
  - Controller update routines (`stepBalancedHomeostasis`, `stepClosedLoopHomeostasis`, `stepEdgeFirmwareAndKeelReflex`) output control deltas (`ControlDeltaPacket`) rather than overwriting measured simulation state.
  - Reported telemetry (cortical active fraction, branching ratio, firing rates) reflects genuine, independent measurements from the LIF/AER spiking simulation engine without synthetic target clamping.
- **Argon Model (`gemini-4-argon`) Final Set Builder & Functional Self-Improvement**:
  - `gemini-4-argon` is configured as the terminal final set builder component within the Autonomous Recursive Self-Improvement (RSI) loop across `src/lib/selfImprovement.ts` (`ArgonSetBuilderEngine`), `src/components/AutonomousSelfImprovementPanel.tsx`, `BioInspiredBuilderPipelinePanel`, `geminiSparkWrapper`, `SynapseEdgeWatchdogStudio`, and `server.ts`.
  - Self-improvement adjustments are fully functional: `applyModelAdjustments` and `ArgonSetBuilderEngine.applyRefinedStructuralSetToEngine` actively enforce LTD dominance across all active synapses (clamping weights > 1.05 when `ltdRatio >= 1.25`), engage lateral ring inhibition on interneurons N12/N13, recalibrate drift velocity bounds, and persist state across sessions in `.refactor_ledger.json` and `.active_snn_tuning.json`.
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
