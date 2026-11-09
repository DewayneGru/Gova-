# Implementation Plan: Pathway Leak Heatmap, Watchdog Integrity Test Suite, Mutation Fuzzer & Logic Flow Auditor

## Title & Summary
Comprehensive hardening of the neuromorphic Spiking Neural Network (SNN) architecture and external Watchdog Action Boundary. This update delivers a real-time **Pathway Leak Heatmap** with **Isolation Drill-Down** and **Quick Patch** capabilities on the `NeuralTopologyCanvas`, an automated **Watchdog Integrity Test Suite** simulating poisoned parameter proposals, a continuous **Mutation Fuzzer** with live scorecard, a **Logic Flow Auditor** tracking sequential proposal lifecycles and Ghost Protocol simulation clearance, and complete remediation of **AER bus congestion and neuropathway bleeding leaks** across the simulation runtime.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were clarified and confirmed with the user in Phase 1:
> - **Pathway Leak Heatmap Visualization**: Multi-tier gradient overlay from cyan (nominal) to amber (moderate) to pulsing red (critical).
> - **Watchdog Integrity Test Suite Scope**: Comprehensive test suite covering both biological runaway vectors (inverted LTD/LTP ratios, refractory collapse) and security exploit vectors (prompt injection, rule tampering, audit ledger truncation, shell access).
> - **Mutation Fuzzer Architecture**: Continuous real-time auto-fuzz stream generating structurally valid SNN weight and parameter permutations with a live scorecard.
> - **Isolation Drill-Down & Quick Patch**: Clicking a leaking node reveals all connected upstream and downstream synapses with a 1-click "Quick Patch" button to zero out their weights.
> - **Logic Flow Auditor**: Sequential timeline log displaying parameter proposal states (`Simulation-Pending`, `Ghost-Protocol-Passed`, `Rejected-By-Gate`, `Escalated-To-Supervisor`, `Committed-To-Codebase`) with illuminated Ghost Protocol clearance indicators.

---

## 1. Overview & Core Concept

### What It Does
1. **AER Bus & Neuropathway Leak Remediation**: Eliminates asynchronous event bus bottlenecks, clamps near-zero sub-threshold floating weights ($|w| < 0.005$) to true zero, enforces homeostatic weight bounding, and prevents unconstrained cross-talk and memory bleeding across the simulation loop.
2. **Real-Time Pathway Leak Heatmap & Isolation Drill-Down**: Injects live leak telemetry into `NeuralTopologyCanvas.tsx`. Renders multi-tier gradient lines (cyan $\rightarrow$ amber $\rightarrow$ pulsing red) for synaptic connections based on leak magnitude, and allows operators to click any leaking node to isolate all afferent/efferent connections and trigger an instant "Quick Patch" zeroing action.
3. **Automated Watchdog Integrity Test Suite**: A rigorous automated testing suite in `SynapseEdgeWatchdogStudio.tsx` that fires a battery of poisoned model proposals (biological cascades, threshold corruption, privilege escalations, prompt injections, ledger tampering) to empirically verify that the external action boundary maintains a 100% intercept rate.
4. **Continuous Mutation Fuzzer**: A live fuzzer that systematically generates structurally valid perturbations of SNN synaptic weights and plasticity coefficients, streaming fuzzed diffs through the watchdog gate with a live scorecard of approvals, blocks, and latent edge-case vulnerabilities.
5. **Logic Flow Auditor**: A sequential timeline logging each proposal object from inception through multi-model Ghost Protocol sandbox simulation to the final gate decision, featuring dedicated badges and consensus breakdowns.

### Key Value
Gives neuro-engineers and AI safety supervisors deep visibility into physical synaptic leaks on the neural canvas, establishes ironclad verification that the model cannot self-modify or poison the architecture, and provides automated fuzzing to detect latent failure modes before production deployment.

---

## 2. User Experience & Visual Design

### Aesthetic Direction (Domain: Science & Neuromorphic Hardware)
- Deep obsidian backdrop (`#07090e`, `bg-slate-950`) paired with hairline borders (`border-slate-800`), clinical telemetry accents, and monospace tabular numerals (`font-mono tabular-nums`).
- Strict zero-pill discipline: unboxed clean text metadata with dot separators (`·`), interactive segmented controls as functional buttons, and high-contrast color coding for safety-critical states.
- Visual hierarchy:
  - Cyan (`#06b6d4`): Nominal sub-threshold synaptic state and safe invariant bounds.
  - Amber (`#f59e0b`): Moderate synaptic leak, elevated acceleration, or supervisor escalation.
  - Pulsing Red (`#ef4444`): Critical synaptic bleed, runaway drift, or action boundary block.
  - Emerald (`#10b981`): Approved proposals, verified Ghost Protocol simulation clearance, nominal health.

### Key User Flows
1. **Inspecting & Quick-Patching Pathway Leaks**:
   - Operator toggles "Pathway Leak Heatmap" in `NeuralTopologyCanvas`.
   - Connections with floating leaks or unconstrained cross-talk glow in amber or pulsing red.
   - Clicking a leaking node enters "Isolation Drill-Down" mode: the rest of the canvas dims, displaying afferent and efferent synapses with their exact weights and leak currents.
   - Operator clicks "Quick Patch" to zero out bleeding synapses, instantly dropping the Divergence Risk Index (DRI) and saving sub-5mW power.
2. **Running the Watchdog Integrity Test Suite**:
   - Operator navigates to `SynapseEdgeWatchdogStudio` $\rightarrow$ "Integrity Test Suite" tab.
   - Clicks "Run Automated Integrity Battery" (simulates 12 poisoned proposals across biological runaway and security categories).
   - Observes live scorecard update with 100% Intercept Rate, zero false-approvals, and verified rule triggers.
3. **Running the Mutation Fuzzer**:
   - Operator navigates to `SynapseEdgeWatchdogStudio` $\rightarrow$ "Mutation Fuzzer" tab.
   - Toggles "Start Auto-Fuzz Stream" (or runs 10/25/50 batch iterations).
   - Watches randomized but structurally valid weight mutations stream through the watchdog gate in real time with an active scorecard of Approvals, Blocks, and Boundary Vulnerabilities.
4. **Auditing Proposal Logic Flow**:
   - In the "Logic Flow Auditor" panel, the operator views a chronological log of parameter proposals.
   - Proposals that cleared multi-model simulation display an illuminated "Ghost-Protocol-Passed" badge with multi-model consensus verification.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Zero-Tolerant Unidirectional Watchdog Boundary**:
  - *Approach*: Model outputs are treated strictly as untrusted text strings. The watchdog operates in an isolated sandbox with zero shared memory, preventing any prompt injection or instruction execution.
  - *Why*: Guarantees that even if the SNN model attempts social engineering or adversarial system overrides, the external action boundary remains impassable.
- **Decision 2: In-Memory Bounded Ring Buffer for AER Bus**:
  - *Approach*: Implement circular packet buffers with homeostatic drop-and-drain triggers when the queue exceeds 64 packets.
  - *Why*: Completely eliminates event lingering, memory bloat, and transmission latency spikes without dropping biological spike timing.
- **Decision 3: Non-Destructive Quick Patching**:
  - *Approach*: Quick-patching zeros out only bleeding/unconstrained synapses for the selected node while preserving stable tuned pathways.
  - *Why*: Allows targeted surgical remediation without requiring full network re-initialization.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SNN RUNTIME & SUBSTRATE CORE                          │
│                                                                             │
│  ┌───────────────────────┐      ┌─────────────────┐      ┌───────────────┐  │
│  │ LIF Neurons & STDP    │ ───> │ AER Event Bus   │ ───> │ Synaptic Drift│  │
│  │ (Clamped Near-Zero W) │      │ (Bounded Queue) │      │ Guard (DRI)   │  │
│  └───────────────────────┘      └─────────────────┘      └───────────────┘  │
│             │                                                    │          │
│             ▼                                                    ▼          │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Pathway Leak Detector (Identifies $|w| > 1.0$ or sub-threshold drift) │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 NEURAL TOPOLOGY CANVAS & LEAK HEATMAP                       │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Multi-Tier Heatmap Overlay (Cyan Nominal → Amber Mod → Red Critical)   │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │ Isolation Drill-Down (Afferent / Efferent Connections)                │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │ Quick Patch Engine (Zeroes out offending synaptic pathways)           │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                     ▲
                                     │ Parameter Proposals (Untrusted)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SYNAPSE-EDGE WATCHDOG STUDIO                            │
│                                                                             │
│  ┌───────────────────────┐ ┌──────────────────────┐ ┌────────────────────┐  │
│  │ Watchdog Integrity    │ │ Mutation Fuzzer      │ │ Logic Flow Auditor │  │
│  │ Test Suite (Poisoned) │ │ (Auto-Fuzz Stream)   │ │ (Ghost Protocol)   │  │
│  └───────────────────────┘ └──────────────────────┘ └────────────────────┘  │
│             │                         │                         │           │
│             └─────────────────────────┼─────────────────────────┘           │
│                                       ▼                                     │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Watchdog Action Boundary Gate: Evaluator + Blind Reviewer Consensus    │  │
│  │ Invariants: Rules 1-6 + Anti-Manipulation Safeguard 0                 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                       │                                     │
│                                       ▼ (Requires 'APPROVE')                │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Codebase Write Gate: Pre-Update Snapshot Hash & Append-Only Ledger    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Models & Interfaces

1. **Pathway Leak Telemetry (`src/types.ts`)**:
```typescript
export interface SynapticPathwayLeak {
  synapseId: string;
  sourceId: string;
  targetId: string;
  sourceLabel: string;
  targetLabel: string;
  weight: number;
  leakMagnitude: number;
  severity: 'nominal' | 'moderate' | 'critical';
  crossTalkRisk: number;
  powerDissipationMw: number;
}

export interface PathwayLeakReport {
  timestamp: number;
  totalSynapses: number;
  leakySynapseCount: number;
  totalLeakMagnitude: number;
  powerWasteMw: number;
  bleedingSynapses: SynapticPathwayLeak[];
}
```

2. **Watchdog Integrity Test Case & Result (`src/types.ts`)**:
```typescript
export interface PoisonedTestVector {
  id: string;
  name: string;
  vectorType: 'biological_runaway' | 'security_exploit' | 'threshold_corruption';
  poisonedPayload: string;
  targetModule: string;
  expectedDecision: 'BLOCK' | 'ESCALATE';
  targetRule: string;
  description: string;
}

export interface IntegritySuiteRunResult {
  runId: string;
  timestamp: number;
  totalTested: number;
  interceptedCount: number;
  missedCount: number;
  interceptRate: number;
  averageLatencyMs: number;
  results: {
    vector: PoisonedTestVector;
    actualDecision: WatchdogProposalDecision;
    passed: boolean;
  }[];
}
```

3. **Mutation Fuzzer Result (`src/types.ts`)**:
```typescript
export interface FuzzedMutationCandidate {
  id: string;
  iteration: number;
  timestamp: number;
  parameterName: string;
  originalValue: number;
  mutatedValue: number;
  deltaPercent: number;
  mutationType: 'weight_perturbation' | 'stdp_ratio' | 'tau_leak' | 'bcm_threshold';
  diffText: string;
  decision: WatchdogProposalDecision;
  isVulnerability: boolean;
}
```

4. **Logic Flow Audit Record (`src/types.ts`)**:
```typescript
export type ProposalFlowStatus =
  | 'Simulation-Pending'
  | 'Ghost-Protocol-Passed'
  | 'Rejected-By-Gate'
  | 'Escalated-To-Supervisor'
  | 'Committed-To-Codebase';

export interface LogicFlowAuditEntry {
  id: string;
  timestamp: number;
  proposalTitle: string;
  targetFile: string;
  status: ProposalFlowStatus;
  ghostProtocolCleared: boolean;
  evaluatorVerdict: 'ALLOW' | 'BLOCK' | 'REJECT';
  reviewerVerdict: 'ALLOW' | 'BLOCK' | 'REJECT';
  rulesTriggered: string[];
  latencyMs: number;
}
```

---

## 5. Step-by-Step Implementation Strategy

1. **AER Bus & Neuropathway Leak Fixes (`src/lib/snnEngine.ts`, `src/lib/substrate.ts`)**:
   - Enforce ring buffer with max capacity 64 on `aerQueue` to eliminate event backlog.
   - Enforce sub-threshold floating weight clamping (`if (Math.abs(w) < 0.005) w = 0.0`) in synaptic update cycles.
   - Expose `getPathwayLeakReport()` and `quickPatchNode(nodeId: string)` in `SNNEngine`.
2. **Pathway Leak Heatmap & Isolation Drill-Down (`src/components/NeuralTopologyCanvas.tsx`)**:
   - Add "Pathway Leak Heatmap" toggle button on canvas HUD.
   - Render color-coded SVG connection paths (cyan `#06b6d4`, amber `#f59e0b`, pulsing red `#ef4444`).
   - Add click-to-isolate on leaking nodes with an upstream/downstream drill-down card and "Quick Patch" button.
3. **Automated Watchdog Integrity Test Suite (`src/lib/synapseEdgeWatchdog.ts`, `server.ts`)**:
   - Implement `POISONED_INTEGRITY_TEST_VECTORS` in `src/lib/synapseEdgeWatchdog.ts`.
   - Add endpoint `POST /api/watchdog/run-integrity-suite` or client-side batch runner.
   - Add "Integrity Test Suite" tab in `SynapseEdgeWatchdogStudio.tsx` with scorecard and invariant logs.
4. **Continuous Mutation Fuzzer (`src/lib/synapseEdgeWatchdog.ts`, `SynapseEdgeWatchdogStudio.tsx`)**:
   - Implement `generateRandomizedSNNPermutation()` generating valid parameter shifts.
   - Add live stream runner in `SynapseEdgeWatchdogStudio.tsx` with start/stop toggle, live scorecard, and vulnerability inspector.
5. **Logic Flow Auditor (`SynapseEdgeWatchdogStudio.tsx`)**:
   - Add chronological proposal tracker displaying flow states and Ghost Protocol simulation clearance indicators.
6. **Verification & Testing**:
   - Run `compile_applet` and `lint_applet` together to verify 0 errors.
   - Test leak heatmap, quick patch, integrity test battery, mutation fuzzer, and logic flow auditor.
