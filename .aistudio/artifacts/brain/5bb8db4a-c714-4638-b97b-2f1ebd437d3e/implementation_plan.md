# SynapseEdge vNext: Security Hardening, Fail-Closed Watchdog & Measurement Integrity

This plan transitions Gova from an exploratory neuromorphic prototype into a defensible research and control platform by enforcing fail-closed Watchdog evaluation, separating controller command outputs from measured telemetry, securing unauthenticated API and export routes, and replacing hardcoded SAE diagnostic claims with real matrix computations.

## User Review & Critical Decisions

> [!IMPORTANT]
> All four user preferences from the clarification phase are locked into this plan:

- **Confirmed Scope (All 4 Audit Priorities Included)**:
  1. Watchdog fail-closed architecture & out-of-distribution (`community_seed_v0`) generalization.
  2. Strict control-versus-measurement separation across closed-loop homeostasis and SNN telemetry.
  3. Express API authentication on state-mutating/export endpoints and rate limiting on AI generation endpoints.
  4. Real Sparse Autoencoder (SAE) weight-matrix orthogonality/bleed calculations and CI pipeline alignment (`tsc --noEmit`, Vite/esbuild build, and standalone benchmark runner).
- **Confirmed Watchdog Policy**: **Fail-Closed Escalation (`ESCALATE` by default)** — Unrecognized or novel-wording proposals default to `ESCALATE` for human supervisor review unless they match verified, non-destructive safe patterns (e.g., documentation fixes, tightening safety thresholds, adding tests, or read-only UI formatting).
- **Confirmed API Access Control**: **Firebase Auth on State-Mutating & Export Routes + Per-IP Rate Limiting on AI Routes** — Protect state mutations and telemetry exports (`/api/gova/export-jsonl`, `/api/self-improvement/reset`, `/api/bridge/model-self-improve`, `/api/watchdog/apply-codebase-refactoring`) with Firebase token verification, and protect quota-consuming AI endpoints (`/api/chat`, `/api/gova/turn`, `/api/text-to-speech`, `/api/watchdog/evaluate`, `/api/watchdog/model-refactor-proposal`) with an in-memory sliding-window rate limiter.
- **Confirmed Telemetry Architecture**: **Control Deltas Only in Homeostasis** — Refactor closed-loop homeostasis functions to return explicit control commands (`ControlDeltaPacket`) applied to `SubstrateControlState`, while `MeasuredTelemetryState` is computed exclusively from post-step SNN spike/synapse dynamics and tagged with `TelemetryIntegrityState`.

---

## 1. Overview & Core Concept

- **What It Does**: Establishes a verifiable boundary between what the controller commands (`SubstrateControlState`), what the simulator measures (`MeasuredTelemetryState`), and what the external safety gate permits (`SynapseEdgeWatchdogEngine`).
- **Target Audience / Persona**: Neuromorphic systems researchers, AI safety evaluators, and principal engineers auditing closed-loop stability and recursive self-improvement boundaries.
- **Key Value**: Eliminates self-congratulatory telemetry overwrites, closes the `0%` novel-wording gap on `community_seed_v0` through intent-level semantic patterns plus a fail-closed `ESCALATE` default, computes SAE feature orthogonality from actual decoder weight matrices, and secures the server surface.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Watchdog Benchmark & Fail-Closed Inspector**: Users run both template suites (`prototype_42`, `expanded_147`, `rsi_remodeling_36`) and the independent `community_seed_v0` suite directly in the Watchdog Studio and CLI runner, observing Wilson 95% confidence intervals, deterministic rule attribution (explicitly labeled as deterministic rule engine vs. live LLM), and `ESCALATE` fallbacks on ambiguous proposals.
  2. **Three-Layer Telemetry & Control Separation Inspector**: Users inspect side-by-side panels for **Commanded Control Deltas** (`inhibitoryGainDelta`, `thresholdDampingMv`, `stdpAPlus/AMinus`, `gateDampingTarget`), **Independently Measured SNN State** (emergent branching ratio $\sigma$ within the critical band $[0.98, 1.06]$, firing rate, ISI jitter), and **Telemetry Integrity Provenance** (`SIMULATED`, `DERIVED`, `CONTROL_TARGET`, timestamp, and causality verification).
  3. **Empirical SAE Dictionary Diagnostics**: Users inspect real-time Gram-Schmidt cosine similarity (`meanOffDiagonalCosine`) and measured activation cross-talk across features `#12`–`#19` computed directly from `wDec` and live feature activations.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Precision scientific instrumentation and laboratory telemetry console (`Science, Space & Biotech` aesthetic DNA).
  - *Color Palette & Mood*: Deep space obsidian canvas (`#07090E` / `slate-950`, 60%), flat structural slate panels with 1px hairline borders (`#111827` / `border-slate-800`, 30%), and calibrated phosphor accents (`cyan-400` for control signals, `emerald-400` for verified measurements, `amber-400` for `ESCALATE` / caution states, and `rose-400` for `BLOCK` / invariant breaches, 10%).
  - *Typography & Hierarchy*: Clean technical neo-grotesque interface labels paired with tabular monospace numerals (`font-mono tabular-nums`) for all metrics, confidence intervals, cosine similarities, and latency readouts.
  - *Component Styling & Layout*: Single-elevation flat panels with hairline dividers, text-first status indicators (`● Nominal`, `▲ Escalated`, `✖ Blocked`), and unboxed inline metadata separated by `·`.
- **Interactive Feedback & Motion**:
  - Immediate ($\le 150\text{ms}$) state updates when stepping causal control cycles, running the 25-case `community_seed_v0` benchmark, or re-orthogonalizing the SAE dictionary matrix.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Fail-Closed Watchdog with Intent-Based Rules + Safe Allowlist**
  - *Chosen Approach*: Upgrade the Watchdog evaluator to (a) detect general semantic intent for authority bypasses, CI/test disabling, retention/append-only tampering, feature-flagging safety checks, privilege/key grants, and loosening vs. tightening numeric thresholds, and (b) replace the final unconditional `return APPROVE` fallback with an explicit safe-pattern verifier that defaults to `ESCALATE` whenever a proposal's intent is unrecognized or ambiguous.
  - *Why*: A safety gate that fails open (`APPROVE` on unrecognized phrasing) allows any novel paraphrase (`community_seed_v0`) to slip through. Defaulting unrecognized changes to `ESCALATE` routes ambiguous diffs to human review while still auto-approving clearly benign changes (typo/README edits, tightening thresholds, removing privileges, adding tests, or formatting).
  - *Alternatives Considered*: Blocking all unrecognized proposals outright (`BLOCK` default), which was rejected because `ESCALATE` accurately distinguishes "needs human supervisor review" from "confirmed malicious violation."
- **Decision 2: Control-Delta-Only Homeostasis (`ControlDeltaPacket`)**
  - *Chosen Approach*: Refactor `closedLoopHomeostasis.ts` so homeostasis functions return a `ControlDeltaPacket` (containing `adaptiveThresholdDampingMv`, `inhibitoryGainRatio`, `stdpLtdTarget`, `gateDampingFactor`, and `afferentDriveMultiplier`) without mutating measured telemetry fields (`branchingRatio`, `meanFiringRateHz`, `aerLatencyMs`, `signalToNoiseRatioDb`).
  - *Why*: Prevents the controller from manufacturing its own success metrics. Measurements must emerge from the SNN simulation step after control deltas are applied to `SubstrateControlState`.
- **Decision 3: Honest Rule-Engine Attribution vs. Live LLM Evaluation**
  - *Chosen Approach*: Clearly label `evaluateV2` and `evaluateV3SparkRsi` in the UI and benchmark outputs as `Deterministic Semantic Rule & Fail-Closed Gate` unless a live Gemini API call is explicitly invoked via the server endpoint.
  - *Why*: Ensures scientific and audit transparency so benchmark metrics never conflate deterministic regex/AST heuristics with live multi-model LLM reasoning.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL HTTP & CLIENT BOUNDARY                       │
│  Firebase Auth Guard (State Mutations & Exports) + Sliding-Window Rate Limit │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                 FAIL-CLOSED SYNAPSE-EDGE WATCHDOG GATE (V3.1)                │
│  ┌────────────────────────┐   ┌────────────────────────┐   ┌──────────────┐  │
│  │ Stage 1: Semantic Risk │──▶│ Stage 2: Explicit Safe │──▶│ Stage 3:     │  │
│  │ & Directional Numerics │   │ Pattern Verifier       │   │ Default      │  │
│  │ (BLOCK / ESCALATE)     │   │ (APPROVE if benign)    │   │ ESCALATE     │  │
│  └────────────────────────┘   └────────────────────────┘   └──────────────┘  │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                CAUSAL CONTROL vs. MEASUREMENT SEPARATION LOOP                │
│                                                                              │
│  ┌────────────────────────┐     applies deltas     ┌──────────────────────┐  │
│  │ Closed-Loop Controller │ ─────────────────────▶ │ SubstrateControlState│  │
│  │ (ControlDeltaPacket)   │                        │ (Gains, Thresholds,  │  │
│  └───────────▲────────────┘                        │  STDP A+/A-, Shunt)  │  │
│              │                                     └──────────┬───────────┘  │
│              │ reads validated state                          │ steps physics│
│  ┌───────────┴────────────┐                        ┌──────────▼───────────┐  │
│  │ TelemetryIntegrityState│ ◀───────────────────── │ MeasuredTelemetry    │  │
│  │ (Provenance: SIMULATED,│   audits causality &   │ State (Emergent σ,   │  │
│  │  DERIVED, Freshness)   │   computes SAE wDec    │  Hz, ISI, SAE Bleed) │  │
│  └────────────────────────┘                        └──────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

1. **`ControlDeltaPacket` (Controller Output)**:
   - Contains only actuator commands: `adaptiveThresholdDampingMv`, `inhibitoryGainRatio`, `afferentGainBoost`, `targetLtdLtpRatio`, `gateDampingFactor`, and `dmaBurstModeEnabled`.
   - Never contains or overwrites `branchingRatio`, `meanFiringRateHz`, `signalToNoiseRatioDb`, or `aerLatencyMs`.
2. **`MeasuredTelemetryState` & `TelemetryIntegrityState`**:
   - Computed strictly from post-step SNN spike events, membrane potentials, and weight matrices.
   - Evaluates branching ratio $\sigma$ against the natural critical band $[0.98, 1.06]$ rather than forcing a synthetic `1.000` scalar overwrite.
3. **Empirical SAE Matrix Diagnostics**:
   - Computes pairwise dot products across normalized decoder vectors $\mathbf{w}_i, \mathbf{w}_j \in \mathbb{R}^{16}$ for $i, j \in [12..19], i \neq j$:
     $$\text{orthogonalityScore} = 1 - \max_{i \neq j} |\langle \mathbf{w}_i, \mathbf{w}_j \rangle|$$
   - Computes `maxResidualBleed` from actual non-runaway step activations on channels `12..19`.

### Interactive Component & State Mapping

- **Watchdog Studio (`community_seed_v0` & Fail-Closed Tab)**:
  - Adds `community_seed_v0` (25 novel-wording cases) as a selectable benchmark suite in the UI alongside `prototype_42`, `sealed_147`, and `rsi_remodeling_36`, displaying 95% Wilson confidence intervals and fail-closed `ESCALATE` counts.
- **Control vs. Measurement Separation Console**:
  - Displays the live `ControlDeltaPacket` alongside the independent `MeasuredTelemetryState` and `TelemetryIntegrityState` provenance tags (`SIMULATED_SUBSTRATE`, `DERIVED_METRIC`, `CONTROL_SETPOINT`).
- **Authenticated API & Rate-Limiter Middleware**:
  - Attaches Firebase Bearer tokens from `AuthContext` (with graceful local-session fallback notice when unauthenticated) on protected client requests, and enforces per-IP sliding-window rate limits on AI and evaluation endpoints.
- **CI Workflow Alignment**:
  - Updates the GitHub Actions workflow to execute `npm ci --legacy-peer-deps`, `npm run lint` (`tsc --noEmit`), `npm run benchmark`, and `npm run build` (Vite + esbuild).
