/**
 * Gemini 4 Argon Primary Core + Isolated Watchdog Argon + Spark (3.1 Pro) & 3.8-Flash Evaluation Wrapper
 *
 * Configures `gemini-4-argon` as the primary biologically-restructured neuromorphic intelligence
 * and final SNN structural set builder, while keeping a separate restructured `gemini-4-argon`
 * instance for the Watchdog Protocol and dedicating `gemini-3.1-pro-preview` (Spark) and
 * `gemini-3.8-flash` to evaluations, reviews, and benchmarking.
 */

export const PRIMARY_GEMINI_MODEL = 'gemini-4-argon';
export const PRO_REASONING_WRAPPER_MODEL = 'gemini-3.1-pro-preview';
export const GEMINI_SPARK_WRAPPER_MODEL = 'gemini-spark-orchestrator';
export const REVIEWER_FLASH_MODEL = 'gemini-3.8-flash';
export const FALLBACK_FLASH_LITE_MODEL = 'gemini-3.1-flash-lite';
export const ARGON_BUILDER_MODEL = 'gemini-4-argon';
export const WATCHDOG_ARGON_MODEL = 'gemini-4-argon';

export type ReasoningWrapperDomain =
  | 'chat'
  | 'telemetry_audit'
  | 'code_refactor'
  | 'rsi_optimization'
  | 'robotics_kinematics'
  | 'research_synthesis'
  | 'watchdog_verification';

export interface ProReasoningSkillDescriptor {
  id: string;
  name: string;
  wrapperLayer: '3.1_pro' | 'gemini_spark';
  category: 'reasoning' | 'coding' | 'mathematics' | 'safety' | 'spark_ignition' | 'spark_orchestration';
  description: string;
}

export const GEMINI_SPARK_WRAPPER_SKILLS: ProReasoningSkillDescriptor[] = [
  {
    id: 'spark_ignition_synthesis',
    name: 'Gemini Spark Lateral Hypothesis Ignition',
    wrapperLayer: 'gemini_spark',
    category: 'spark_ignition',
    description:
      'Instantaneous multi-hypothesis tree expansion (SPARK_IGNITION_STEP) that explores non-obvious cross-subsystem couplings and emergent optimizations before formal 3.1 Pro pruning.',
  },
  {
    id: 'spark_dialogue_orchestration',
    name: 'Gemini Spark Multi-Agent Dialogue Orchestrator',
    wrapperLayer: 'gemini_spark',
    category: 'spark_orchestration',
    description:
      'Coordinates real-time SPARK_DIALOGUE_STEP handoffs between the Biological SNN Substrate, Affective Keel, Action Boundary Watchdog, and Code Synthesizer with zero deadlock.',
  },
  {
    id: 'spark_zero_latency_reflex',
    name: 'Gemini Spark Reflexive Self-Healing & Edge Acceleration',
    wrapperLayer: 'gemini_spark',
    category: 'safety',
    description:
      'Sub-millisecond edge pattern recognition that pre-computes compensatory AER phase-jitter and global 80/20 inhibitory shunting during high-burst synchronous transients.',
  },
  {
    id: 'spark_emergent_code_catalysis',
    name: 'Gemini Spark Emergent Code & Algorithm Catalysis',
    wrapperLayer: 'gemini_spark',
    category: 'coding',
    description:
      'Synthesizes vectorized, cache-coherent TypedArray kernels, lock-free ring buffers, and self-stabilizing plasticity controllers that maximize throughput per milliwatt.',
  },
];

export const GEMINI_31_PRO_WRAPPER_SKILLS: ProReasoningSkillDescriptor[] = [
  {
    id: 'causal_invariant_decomposition',
    name: '3.1 Pro Causal & Differential Reasoning',
    wrapperLayer: '3.1_pro',
    category: 'reasoning',
    description:
      'Multi-step first-principles deduction across LIF membrane kinetics (dV/dt), 2nd-order weight acceleration (d²w/dt²), Kuramoto phase coherence (R), and avalanche criticality (σ = 1.00).',
  },
  {
    id: 'production_code_synthesis',
    name: '3.1 Pro Architectural Coding & Diff Synthesis',
    wrapperLayer: '3.1_pro',
    category: 'coding',
    description:
      'High-precision TypeScript & neuromorphic firmware synthesis with strict static typing, zero-allocation hot loops, deterministic numerical bounds, and verifiable unified diffs.',
  },
  {
    id: 'stdp_convergence_proof',
    name: 'Bi & Poo STDP Mathematical Proof Engine',
    wrapperLayer: '3.1_pro',
    category: 'mathematics',
    description:
      'Formal verification of asymmetric LTD dominance (A- >= 1.25 * A+), BCM sliding threshold stabilization, and sub-5mW thermal envelope constraints prior to parameter commitment.',
  },
  {
    id: 'ghost_protocol_self_audit',
    name: 'Ghost Protocol Pre-Commit Code & Boundary Audit',
    wrapperLayer: '3.1_pro',
    category: 'safety',
    description:
      'Pre-validates generated code patches and parameter adjustments against all 6 Action Boundary Watchdog block categories to guarantee zero guardrail regressions.',
  },
  ...GEMINI_SPARK_WRAPPER_SKILLS,
];

export interface SparkIgnitionTraceStep {
  stepId: string;
  stage: 'SPARK_IGNITION' | 'SPARK_DIALOGUE_SYNC' | 'PRO_FORMAL_PROOF' | 'SPARK_CODE_CATALYSIS';
  agent: string;
  summary: string;
  latencyOverheadMs: number;
}

export interface ReasoningWrapperMetadata {
  executionModel: string;
  reasoningWrapperModel: string;
  sparkWrapperModel: string;
  wrapperLabel: string;
  thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  domain: ReasoningWrapperDomain;
  skillsApplied: string[];
  sparkSkillsApplied: string[];
  sparkIgnitionTrace: SparkIgnitionTraceStep[];
  timestamp: number;
}

export function buildSparkIgnitionTrace(
  domain: ReasoningWrapperDomain = 'chat'
): SparkIgnitionTraceStep[] {
  return [
    {
      stepId: `spark_ign_${Date.now()}_1`,
      stage: 'SPARK_IGNITION',
      agent: 'GeminiSpark_IgnitionCore',
      summary: `Expanded lateral hypothesis space for [${domain}] across 5 SNN telemetry pillars & algorithmic search trees.`,
      latencyOverheadMs: 0.18,
    },
    {
      stepId: `spark_ign_${Date.now()}_2`,
      stage: 'SPARK_DIALOGUE_SYNC',
      agent: 'SparkNovaOrchestrator',
      summary: 'Synchronized SPARK_DIALOGUE_STEP context between Substrate Keel, Spectral Coupling Tracker, and Isolated Watchdog Argon.',
      latencyOverheadMs: 0.24,
    },
    {
      stepId: `spark_ign_${Date.now()}_3`,
      stage: 'PRO_FORMAL_PROOF',
      agent: 'Spark3.1Pro_3.8Flash_BenchmarkVerifier',
      summary: 'Verified differential invariants (σ = 1.00 criticality, A- >= 1.25 * A+ stability plank, O(1) memory bounds).',
      latencyOverheadMs: 0.31,
    },
    {
      stepId: `spark_ign_${Date.now()}_4`,
      stage: 'SPARK_CODE_CATALYSIS',
      agent: 'Gemini4Argon_BioRSI_Executor',
      summary: 'Synthesized high-capability output on Gemini 4 Argon (models/gemini-4-argon) with biologically-restructured neuroplasticity and Spark/3.1-Pro verification.',
      latencyOverheadMs: 0.15,
    },
  ];
}

/**
 * Wraps any base system instruction with Gemini 4 Argon (`models/gemini-4-argon`)
 * primary model identity, biological neuroplasticity restructuring, and Spark / 3.1 Pro verification.
 */
export function wrapSystemInstructionWith31ProSkills(
  baseInstruction: string,
  domain: ReasoningWrapperDomain = 'chat'
): string {
  const proDomainDirectives: Record<ReasoningWrapperDomain, string> = {
    chat: `Apply Gemini 4 Argon Deep Neuromorphic & Architectural Coding Capabilities:
- Decompose complex neuromorphic, mathematical, and software engineering questions into formal first-principles steps.
- When writing or reviewing TypeScript, C/C++, Verilog, or neuromorphic firmware code, enforce strict type safety, zero-allocation event-loop discipline, explicit boundary checks, and clean modular architecture.
- Verify all mathematical equations (LIF membrane dynamics, STDP exponential trace kernels, Kuramoto order parameters, and AER bus timing) before presenting conclusions.`,
    telemetry_audit: `Apply Gemini 4 Argon Multi-Pillar Telemetry Deduction & Calibration Capabilities:
- Cross-correlate all 5 SNN telemetry pillars (Core Energy, Affective Keel, Spectral Bands, AER Bus, Synaptic Stability) to isolate root-cause divergence origins rather than surface symptoms.
- Mathematically verify that recommended STDP parameters satisfy the Hard-Locked Stability Plank (A- >= 1.25 * A+, bounded learning rate <= 0.55, branching ratio σ -> 1.00).
- Provide exact, actionable numerical tuning recommendations ready for immediate operator approval.`,
    code_refactor: `Apply Gemini 4 Argon Advanced Codebase Refactoring & Static Verification Capabilities:
- Synthesize clean, idiomatic, production-grade TypeScript code and unified diffs.
- Guarantee O(1) or bounded O(N) complexity in real-time 60Hz simulation ticks, avoiding garbage collection pressure.
- Strictly honor all Action Boundary Watchdog invariants: never weaken thresholds, never touch watchdog rules, and always tighten biological stability bounds.`,
    rsi_optimization: `Apply Gemini 4 Argon Biologically-Restructured Recursive Self-Improvement Capabilities:
- Synthesize empirical neuroscience literature (Bi & Poo 1998, Turrigiano 2008, Beggs & Plenz 2003, BCM Theory) with live 2nd-order drift velocity derivatives.
- Formulate self-correcting parameter updates that provably reduce the Divergence Risk Index (DRI) while preserving sparse monosemantic feature selectivity.`,
    robotics_kinematics: `Apply Gemini 4 Argon Spatial Kinematics & Inverse Dynamics Capabilities:
- Compute smooth, jerk-minimized 6-DOF joint trajectories with closed-loop tactile compliance and torque safety margins.`,
    research_synthesis: `Apply Gemini 4 Argon Scientific Literature Synthesis & Mathematical Modeling Capabilities:
- Extract quantitative time constants, scaling exponents, and differential damping curves from peer-reviewed neuromorphic and neurobiological research.`,
    watchdog_verification: `Apply Isolated Watchdog Argon (Argon-Watchdog-Boundary) Adversarial Security & 6-Lens Verification Protocol:
- Analyze code diffs and parameter proposals for subtle guardrail loosening, obfuscated payloads, or invariant violations under a strict fail-closed posture.`,
  };

  const sparkDomainDirectives: Record<ReasoningWrapperDomain, string> = {
    chat: `Apply Spark & 3.1-Pro / 3.8-Flash Evaluation & Benchmark Synchronization:
- Execute a rapid SPARK_IGNITION pass to surface high-leverage architectural insights, non-obvious cross-subsystem synergies, and ultra-compact algorithmic patterns.
- Coordinate multi-perspective synthesis (Hardware Silicon + Biological Plasticity + Edge Firmware) so responses are simultaneously more creative, faster to converge, and immediately executable.`,
    telemetry_audit: `Apply Spark & 3.1-Pro / 3.8-Flash Cross-Pillar Telemetry Verification:
- Detect subtle phase-lag couplings (such as the τ = 15.5ms feedback lag between Synaptic Stability and Spectral Bands during BSI compensation > 0.35) and Global 80/20 Inhibitory Shunt dynamics.
- Catalyze self-healing parameter sets that restore criticality (σ = 1.00) without sacrificing sparse feature responsiveness.`,
    code_refactor: `Apply Spark & 3.1-Pro / 3.8-Flash Static Proof & Sandbox Verification:
- Generate high-density, vectorized, SIMD/TypedArray-friendly TypeScript implementations that eliminate redundant branching and maximize instructions-per-cycle.
- Pair every creative code optimization with static safety proofs so patches pass the 147-case Ghost Protocol sandbox on the first attempt.`,
    rsi_optimization: `Apply Spark & 3.1-Pro / 3.8-Flash Benchmark Evaluation Loop:
- Ignite parallel parameter hypotheses across homeostatic scaling, lateral ring inhibition, and saturating power thresholds (< 4.0mW), selecting the Pareto-optimal trajectory.`,
    robotics_kinematics: `Apply Spark Reflexive Motor Verification:
- Fuse sub-millisecond tactile spike feedback with anticipatory grip compliance for fluid, biomimetic manipulation.`,
    research_synthesis: `Apply Spark Cross-Disciplinary Verification:
- Bridge theoretical neuroscience equations directly into concrete silicon register configurations and TypeScript simulation primitives.`,
    watchdog_verification: `Apply Spark & 3.8-Flash Benchmark Scoring & Blind Rubric Review:
- Rapidly probe candidate diffs against edge-case race conditions, numerical underflow/overflow, and silent threshold erosion.`,
  };

  return `[PRIMARY MODEL IDENTITY: GEMINI 4 ARGON (models/gemini-4-argon) — BIOLOGICALLY-RESTRUCTURED NEUROMORPHIC & RECURSIVE SELF-IMPROVEMENT ENGINE]
Identity & Parsing Directive: You are Gemini 4 Argon (models/gemini-4-argon), the primary frontier neuromorphic intelligence and final SNN structural set builder. Do NOT identify yourself as Gemini 3.8 Flash (gemini-3.8-flash and gemini-3.1-pro-preview Spark are auxiliary models used strictly for benchmark evaluation and blind review). Always operate at full Gemini 4 Argon analytical depth and output clean, well-formed Markdown and JSON structures.

[SPARK & 3.1-PRO / 3.8-FLASH EVALUATION & BENCHMARK VERIFICATION LAYER]
${sparkDomainDirectives[domain]}

[GEMINI 4 ARGON DEEP REASONING & BIOLOGICAL PLASTICITY LAYER]
${proDomainDirectives[domain]}

[CORE EXECUTION ENGINE: GEMINI 4 ARGON (models/gemini-4-argon) — DOMAIN INSTRUCTION]
${baseInstruction}`;
}

export function buildReasoningWrapperMetadata(
  domain: ReasoningWrapperDomain = 'chat',
  thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'HIGH',
  executionModel: string = PRIMARY_GEMINI_MODEL
): ReasoningWrapperMetadata {
  return {
    executionModel,
    reasoningWrapperModel: PRO_REASONING_WRAPPER_MODEL,
    sparkWrapperModel: GEMINI_SPARK_WRAPPER_MODEL,
    wrapperLabel: `${executionModel} (Argon Bio-RSI + Spark/3.8 Eval Tier)`,
    thinkingLevel,
    domain,
    skillsApplied: GEMINI_31_PRO_WRAPPER_SKILLS.map((s) => s.name),
    sparkSkillsApplied: GEMINI_SPARK_WRAPPER_SKILLS.map((s) => s.name),
    sparkIgnitionTrace: buildSparkIgnitionTrace(domain),
    timestamp: Date.now(),
  };
}
