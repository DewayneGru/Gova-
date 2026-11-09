/**
 * synapticStabilityController.ts (v2.5 - Causal Closed-Loop Edition)
 * ------------------------------------------------------------------
 * Implements:
 * 1. Explicit separation of structural `inhibitoryPopulationRatio` vs. control `inhibitoryGainRatio`.
 * 2. Time-normalized Maximal Lyapunov Exponent (totalLogDivergence / elapsedTimeSec).
 * 3. Architectural invariant check for `allowsIntrinsicNeuronActivity` when spikes > 0 and SOP/s == 0.
 * 4. Generation-based avalanche branching ratio (`SpikeGeneration[]`).
 * 5. Consolidated single-step `calculateInhibitoryControlTarget()` to prevent compound gain stacking.
 * 6. Explicit `ClosedLoopTransition` causal chain logging across simulation cycles.
 */

export type SystemEquilibriumVerdict =
  | "HOMEOSTATIC EQUILIBRIUM NOMINAL"
  | "NOMINAL"
  | "RECOVERING"
  | "SUPER_CRITICAL"
  | "SUB_CRITICAL"
  | "CRITICAL"
  | "TELEMETRY_INCONSISTENT";

export interface SynapseRecord {
  id: string;
  preId: number;
  postId: number;
  weight: number;
  isExcitatory: boolean;
  active: boolean;
}

export interface SpikeGeneration {
  generation: number;
  spikeIds: number[];
}

// 1. SUBSTRATE CONTROL STATE (Writable by Controller, Read by Simulation Engine)
export interface SubstrateControlState {
  synapses: SynapseRecord[];
  inhibitoryGainRatio: number;         // Dynamic control parameter, baseline 0.20, clamped [0.15, 0.35]
  stdpAPlus: number;                   // e.g., 0.046
  stdpAMinus: number;                  // e.g., 0.0598 (Maintains A-/A+ in [1.25, 2.20])
  inhibitoryNeuronCount: number;       // Structural count of I neurons
  excitatoryNeuronCount: number;       // Structural count of E neurons
  allowsIntrinsicNeuronActivity: boolean; // True if spontaneous pacemaker/Poisson firing exists without synapses
}

// 2. MEASURED TELEMETRY STATE (Read-Only to Controller; Written ONLY by Telemetry Engine)
export interface MeasuredTelemetryState {
  timestamp: number;
  spikeCountWindow: number;
  spikeHistorySampleCount: number;
  trajectoryHistorySampleCount: number;
  synapticOpsPerSec: number;
  meanFiringRateHz: number;
  rateDeviationHz: number;
  branchingRatio: number;              // Computed via generation-based calculateBranchingRatio()
  lyapunovExponent: number;            // Time-normalized divergence rate (s^-1)
  divergenceRiskIndex: number;
  meanSynapticWeight: number;          // Computed from active excitatory synapses
  sparsityPct: number;
  inhibitoryGainRatio: number;         // Exposes the active inhibitory gain control parameter
  inhibitoryPopulationRatio: number;   // Structural I / (E + I) neuron ratio
  ltdLtpRatio: number;                 // Computed from actual stdpAMinus / stdpAPlus
}

// 3. TELEMETRY INTEGRITY STATE (Written ONLY by Integrity Validator)
export interface TelemetryIntegrityState {
  telemetryIntegrity: boolean;
  status: "VALID" | "TELEMETRY_INCONSISTENT";
  contradictions: string[];
}

// 4. CAUSAL CHAIN TRANSITION LOG (Tracks Before -> Action -> After across generations)
export interface ClosedLoopTransition {
  cycle: number;

  // BEFORE intervention (Observed from physical network)
  observedBranchingRatio: number;
  observedLyapunov: number;
  observedFiringRateHz: number;

  // ACTION (Applied to substrateControlState only)
  weightScaleApplied: number;
  inhibitoryGainBefore: number;
  inhibitoryGainAfter: number;

  // AFTER next physical simulation step (Independently measured)
  resultingBranchingRatio: number;
  resultingLyapunov: number;
  resultingFiringRateHz: number;

  // VALIDATION
  telemetryIntegrity: boolean;
  verdict: SystemEquilibriumVerdict;
}

export const CONTROLLER_CONFIG = {
  targetBranchingRatio: 1.00,
  preferredBranchingBand: [0.98, 1.06] as const,
  branchingWarningThreshold: 1.12,
  branchingHighAssistThreshold: 1.15,
  branchingCriticalThreshold: 1.30,
  branchingSubCriticalThreshold: 0.88,
  branchingRelaxThreshold: 1.08,
  biologicalSetpointHz: 28.0,
  acceptableDeviationHz: 5.0,
  criticalDriThreshold: 0.25,
  minSpikeHistorySamples: 10,
  minTrajectoryHistorySamples: 15,
};

/**
 * Fix #4: Generation-Based Branching Ratio Calculation
 * Evaluates true parent -> child spike avalanche propagation across generations.
 */
export function calculateBranchingRatio(
  generations: readonly SpikeGeneration[]
): number {
  if (generations.length < 2) return 0;

  let totalParents = 0;
  let totalChildren = 0;

  for (let i = 0; i < generations.length - 1; i++) {
    totalParents += generations[i].spikeIds.length;
    totalChildren += generations[i + 1].spikeIds.length;
  }

  if (totalParents === 0) return 0;

  return Number((totalChildren / totalParents).toFixed(3));
}

/**
 * Helper: Computes the true mean weight of active excitatory synapses directly from the matrix.
 */
export function computeActualMeanExcitatoryWeight(
  synapses: readonly SynapseRecord[]
): number {
  const activeExcitatory = synapses.filter(
    (s) => s.isExcitatory && s.active && Math.abs(s.weight) > 1e-6
  );
  if (activeExcitatory.length === 0) return 0;
  const sum = activeExcitatory.reduce((acc, s) => acc + s.weight, 0);
  return Number((sum / activeExcitatory.length).toFixed(4));
}

/**
 * STAGE 1 & 2: INDEPENDENT TELEMETRY ENGINE
 * Computes generation-based branching, time-normalized Lyapunov exponent,
 * and separates `inhibitoryGainRatio` from `inhibitoryPopulationRatio`.
 */
export function measureNetworkTelemetry(
  substrate: Readonly<SubstrateControlState>,
  rawSimOutput: {
    timestamp: number;
    spikeGenerations: SpikeGeneration[];
    spikeHistorySamples: number;
    trajectorySeparationLogRatios: number[];
    trajectoryElapsedTimeSec: number;
    windowDurationSec: number;
    totalSpikesInWindow: number;
    activeSynapticEvents: number;
  }
): MeasuredTelemetryState {
  const totalSynapses = substrate.synapses.length;
  const nonZeroSynapses = substrate.synapses.filter((s) => Math.abs(s.weight) > 1e-5);
  const meanSynapticWeight = computeActualMeanExcitatoryWeight(substrate.synapses);

  const sparsityPct =
    totalSynapses > 0
      ? Number((((totalSynapses - nonZeroSynapses.length) / totalSynapses) * 100).toFixed(1))
      : 100;

  // Fix #4: Generation-based Branching Ratio (sigma)
  const branchingRatio = calculateBranchingRatio(rawSimOutput.spikeGenerations);

  // Fix #2: Time-Normalized Maximal Lyapunov Exponent (rate of divergence per second)
  const trajSamples = rawSimOutput.trajectorySeparationLogRatios;
  const totalLogDivergence = trajSamples.reduce((a, b) => a + b, 0);
  const elapsedTimeSec = Math.max(1e-9, rawSimOutput.trajectoryElapsedTimeSec);
  const lyapunovExponent =
    trajSamples.length > 0
      ? Number((totalLogDivergence / elapsedTimeSec).toFixed(3))
      : 0;

  // Structural Neuron Population Ratio vs Control Gain Ratio (Fix #1)
  const totalNeurons = Math.max(
    1,
    substrate.excitatoryNeuronCount + substrate.inhibitoryNeuronCount
  );
  const inhibitoryPopulationRatio = Number(
    (substrate.inhibitoryNeuronCount / totalNeurons).toFixed(4)
  );
  const inhibitoryGainRatio = Number(substrate.inhibitoryGainRatio.toFixed(4));

  // Measured Firing Rate & Synaptic Throughput
  const meanFiringRateHz = Number(
    (
      rawSimOutput.totalSpikesInWindow /
      (totalNeurons * Math.max(1e-3, rawSimOutput.windowDurationSec))
    ).toFixed(2)
  );
  const rateDeviationHz = Number(
    (meanFiringRateHz - CONTROLLER_CONFIG.biologicalSetpointHz).toFixed(2)
  );
  const synapticOpsPerSec = Math.round(
    rawSimOutput.activeSynapticEvents / Math.max(1e-3, rawSimOutput.windowDurationSec)
  );

  // Measured LTD/LTP Ratio from actual plasticity state
  const ltdLtpRatio =
    substrate.stdpAPlus > 0
      ? Number((substrate.stdpAMinus / substrate.stdpAPlus).toFixed(2))
      : 0;

  // Measured Divergence Risk Index
  const branchingExcursion = Math.abs(
    branchingRatio - CONTROLLER_CONFIG.targetBranchingRatio
  );
  const chaosExcursion = Math.max(0, lyapunovExponent);
  const divergenceRiskIndex = Number(
    Math.min(1.0, branchingExcursion * 0.25 + chaosExcursion * 0.8).toFixed(2)
  );

  return {
    timestamp: rawSimOutput.timestamp,
    spikeCountWindow: rawSimOutput.totalSpikesInWindow,
    spikeHistorySampleCount: rawSimOutput.spikeHistorySamples,
    trajectoryHistorySampleCount: trajSamples.length,
    synapticOpsPerSec,
    meanFiringRateHz,
    rateDeviationHz,
    branchingRatio,
    lyapunovExponent,
    divergenceRiskIndex,
    meanSynapticWeight,
    sparsityPct,
    inhibitoryGainRatio,
    inhibitoryPopulationRatio,
    ltdLtpRatio,
  };
}

/**
 * STAGE 3: TELEMETRY INTEGRITY VALIDATOR
 * Incorporates `allowsIntrinsicNeuronActivity` check (Fix #3) and population/gain validation.
 */
export function validateTelemetryIntegrity(
  substrate: Readonly<SubstrateControlState>,
  telemetry: Readonly<MeasuredTelemetryState>
): TelemetryIntegrityState {
  const contradictions: string[] = [];
  const nonZeroWeightsCount = substrate.synapses.filter(
    (s) => Math.abs(s.weight) > 1e-5
  ).length;
  const hasIntrinsicSpiking = substrate.allowsIntrinsicNeuronActivity === true;

  // 1. Spikes > 0 AND meanSynapticWeight == 0 (when no intrinsic spiking exists)
  if (
    telemetry.spikeCountWindow > 0 &&
    telemetry.meanSynapticWeight === 0 &&
    !hasIntrinsicSpiking
  ) {
    contradictions.push(
      "Spikes > 0 while measured meanSynapticWeight == 0 and no intrinsic spiking is enabled."
    );
  }

  // 2. Fix #3: Spikes > 0 AND synapticOpsPerSec == 0 (conditioned on allowsIntrinsicNeuronActivity)
  if (
    telemetry.spikeCountWindow > 0 &&
    telemetry.synapticOpsPerSec === 0 &&
    !hasIntrinsicSpiking
  ) {
    contradictions.push(
      "Spikes > 0 with no synaptic operations and no intrinsic-spiking mechanism."
    );
  }

  // 3. Fix #1: Check structural inhibitoryPopulationRatio against inhibitoryNeuronCount
  if (
    telemetry.inhibitoryPopulationRatio === 0 &&
    substrate.inhibitoryNeuronCount > 0
  ) {
    contradictions.push(
      "inhibitoryPopulationRatio == 0 while inhibitory neurons exist in substrate."
    );
  }

  // 4. sparsity == 100% while nonzero synaptic weights exist
  if (telemetry.sparsityPct >= 100 && nonZeroWeightsCount > 0) {
    contradictions.push(
      `sparsityPct == 100% while ${nonZeroWeightsCount} non-zero synaptic weights exist.`
    );
  }

  // 5. branchingRatio reported without enough spike-history samples
  if (
    telemetry.branchingRatio > 0 &&
    telemetry.spikeHistorySampleCount < CONTROLLER_CONFIG.minSpikeHistorySamples
  ) {
    contradictions.push(
      `branchingRatio (${telemetry.branchingRatio}) reported with insufficient spike-history samples (${telemetry.spikeHistorySampleCount} < ${CONTROLLER_CONFIG.minSpikeHistorySamples}).`
    );
  }

  // 6. lyapunovExponent reported without sufficient trajectory history
  if (
    telemetry.lyapunovExponent !== 0 &&
    telemetry.trajectoryHistorySampleCount <
      CONTROLLER_CONFIG.minTrajectoryHistorySamples
  ) {
    contradictions.push(
      `lyapunovExponent (${telemetry.lyapunovExponent}) reported with insufficient trajectory history (${telemetry.trajectoryHistorySampleCount} < ${CONTROLLER_CONFIG.minTrajectoryHistorySamples}).`
    );
  }

  const isConsistent = contradictions.length === 0;
  return {
    telemetryIntegrity: isConsistent,
    status: isConsistent ? "VALID" : "TELEMETRY_INCONSISTENT",
    contradictions,
  };
}

/**
 * Fix #5: Consolidated Inhibitory Control Target
 * Unifies branchingRatio and lyapunovExponent thresholds into a single target
 * so the controller applies one controlled step per cycle without compound over-correction.
 */
export function calculateInhibitoryControlTarget(
  measured: Readonly<MeasuredTelemetryState>
): number {
  let target = 0.20;

  if (measured.branchingRatio > 1.15) {
    target = Math.max(target, 0.23);
  }

  if (measured.lyapunovExponent > 0.03) {
    target = Math.max(target, 0.26);
  }

  if (measured.lyapunovExponent > 0.05) {
    target = Math.max(target, 0.30);
  }

  return Math.min(0.35, target);
}

/**
 * STAGE 4 & 5: SUBSTRATE CONTROLLER
 * Mutates `substrateControlState` ONLY. Never overwrites `measuredTelemetryState`.
 */
export function applyClosedLoopSubstrateControl(
  substrate: SubstrateControlState,
  measured: Readonly<MeasuredTelemetryState>
): {
  weightScaleApplied: number;
  inhibitoryGainBefore: number;
  inhibitoryGainAfter: number;
  previousMeanWeight: number;
  newMeanWeight: number;
  controlReasons: string[];
} {
  const controlReasons: string[] = [];
  const previousMeanWeight = computeActualMeanExcitatoryWeight(substrate.synapses);
  const inhibitoryGainBefore = substrate.inhibitoryGainRatio;
  let weightScaleApplied = 1.0;

  // Firing-Rate Protection Check (Biological Setpoint = 28.0 Hz, Acceptable Deviation = 5.0 Hz)
  const isFiringRateDepressed =
    measured.meanFiringRateHz <
    CONTROLLER_CONFIG.biologicalSetpointHz - CONTROLLER_CONFIG.acceptableDeviationHz;

  // 1. Branching-Gated Excitatory Weight Normalization vs. Sub-Critical Recovery
  if (measured.branchingRatio > CONTROLLER_CONFIG.branchingWarningThreshold) {
    weightScaleApplied = isFiringRateDepressed ? 0.985 : 0.96;

    for (const syn of substrate.synapses) {
      if (syn.isExcitatory && syn.active && syn.weight > 0) {
        syn.weight = Number(
          Math.max(0.35, Math.min(1.20, syn.weight * weightScaleApplied)).toFixed(4)
        );
      }
    }
    controlReasons.push(
      `EXCITATORY_WEIGHT_DAMPING: Measured σ (${measured.branchingRatio}) > 1.12; applied ${weightScaleApplied} scale to active excitatory weights (clamped [0.35, 1.20]).`
    );
  } else if (
    measured.branchingRatio > 0 &&
    measured.branchingRatio < CONTROLLER_CONFIG.branchingSubCriticalThreshold
  ) {
    weightScaleApplied = 1.03;

    for (const syn of substrate.synapses) {
      if (syn.isExcitatory && syn.active && syn.weight > 0) {
        syn.weight = Number(
          Math.max(0.35, Math.min(1.05, syn.weight * weightScaleApplied)).toFixed(4)
        );
      }
    }
    controlReasons.push(
      `SUB_CRITICAL_RECOVERY: Measured σ (${measured.branchingRatio}) < 0.88; applied ${weightScaleApplied} scale to active excitatory weights (clamped [0.35, 1.05]).`
    );
  }

  // 2. Consolidated Single-Step Inhibitory Gain Control
  const targetInhibitoryGain = calculateInhibitoryControlTarget(measured);
  const stepRate = isFiringRateDepressed && targetInhibitoryGain > substrate.inhibitoryGainRatio
    ? 0.15
    : 0.25;

  substrate.inhibitoryGainRatio = Number(
    Math.max(
      0.15,
      Math.min(
        0.35,
        substrate.inhibitoryGainRatio +
          (targetInhibitoryGain - substrate.inhibitoryGainRatio) * stepRate
      )
    ).toFixed(4)
  );

  if (Math.abs(substrate.inhibitoryGainRatio - inhibitoryGainBefore) > 1e-4) {
    controlReasons.push(
      `INHIBITORY_GAIN_STEP: Stepped inhibitoryGainRatio from ${inhibitoryGainBefore} to ${substrate.inhibitoryGainRatio} (target: ${targetInhibitoryGain}).`
    );
  }

  // 3. STDP Plasticity Constraint ([1.25, 2.20])
  if (substrate.stdpAPlus > 0) {
    const currentRatio = substrate.stdpAMinus / substrate.stdpAPlus;
    if (currentRatio < 1.25) {
      substrate.stdpAMinus = Number((substrate.stdpAPlus * 1.25).toFixed(5));
      controlReasons.push("STDP_FLOOR_ENFORCED: Adjusted stdpAMinus for A-/A+ >= 1.25.");
    } else if (currentRatio > 2.20) {
      substrate.stdpAMinus = Number((substrate.stdpAPlus * 2.20).toFixed(5));
      controlReasons.push("STDP_CEILING_ENFORCED: Adjusted stdpAMinus for A-/A+ <= 2.20.");
    }
  }

  if (controlReasons.length === 0) {
    controlReasons.push("NO_INTERVENTION: Network operating inside nominal homeostatic bounds.");
  }

  const newMeanWeight = computeActualMeanExcitatoryWeight(substrate.synapses);
  const inhibitoryGainAfter = substrate.inhibitoryGainRatio;

  return {
    weightScaleApplied,
    inhibitoryGainBefore,
    inhibitoryGainAfter,
    previousMeanWeight,
    newMeanWeight,
    controlReasons,
  };
}

/**
 * STAGE 8: HOMEOSTATIC EQUILIBRIUM VERDICT EVALUATOR
 */
export function evaluateHomeostaticEquilibrium(
  measured: Readonly<MeasuredTelemetryState>,
  integrity: Readonly<TelemetryIntegrityState>,
  hadControlIntervention: boolean
): SystemEquilibriumVerdict {
  if (!integrity.telemetryIntegrity) {
    return "TELEMETRY_INCONSISTENT";
  }

  if (
    measured.branchingRatio >= CONTROLLER_CONFIG.branchingCriticalThreshold ||
    measured.divergenceRiskIndex >= CONTROLLER_CONFIG.criticalDriThreshold
  ) {
    return "CRITICAL";
  }

  if (measured.branchingRatio > 1.15) {
    return "SUPER_CRITICAL";
  }

  if (measured.branchingRatio < 0.85) {
    return "SUB_CRITICAL";
  }

  const satisfiesEquilibriumInvariants =
    measured.branchingRatio >= 0.85 &&
    measured.branchingRatio <= 1.15 &&
    measured.ltdLtpRatio >= 1.25 &&
    Math.abs(measured.rateDeviationHz) <= CONTROLLER_CONFIG.acceptableDeviationHz &&
    measured.divergenceRiskIndex < CONTROLLER_CONFIG.criticalDriThreshold &&
    integrity.telemetryIntegrity === true;

  if (satisfiesEquilibriumInvariants) {
    const inPreferredBand =
      measured.branchingRatio >= CONTROLLER_CONFIG.preferredBranchingBand[0] &&
      measured.branchingRatio <= CONTROLLER_CONFIG.preferredBranchingBand[1];

    if (hadControlIntervention && !inPreferredBand) {
      return "RECOVERING";
    }
    return "HOMEOSTATIC EQUILIBRIUM NOMINAL";
  }

  return "RECOVERING";
}

/**
 * FULL 8-STAGE CAUSAL CLOSED-LOOP CYCLE EXECUTOR
 * Produces the `ClosedLoopTransition` record proving cause-and-effect across simulation steps.
 */
export function executeCausalClosedLoopCycle(
  cycleNumber: number,
  substrateControlState: SubstrateControlState,
  runSimulationStep: (substrate: Readonly<SubstrateControlState>) => {
    timestamp: number;
    spikeGenerations: SpikeGeneration[];
    spikeHistorySamples: number;
    trajectorySeparationLogRatios: number[];
    trajectoryElapsedTimeSec: number;
    windowDurationSec: number;
    totalSpikesInWindow: number;
    activeSynapticEvents: number;
  }
): {
  measuredTelemetryState: MeasuredTelemetryState;
  telemetryIntegrityState: TelemetryIntegrityState;
  transition: ClosedLoopTransition;
} {
  // 1 & 2. Measure current network activity and calculate pre-intervention telemetry
  const preSimRaw = runSimulationStep(substrateControlState);
  const preMeasured = measureNetworkTelemetry(substrateControlState, preSimRaw);

  // 3. Validate pre-intervention telemetry integrity
  validateTelemetryIntegrity(substrateControlState, preMeasured);

  // 4 & 5. Determine controller action from measured values & modify actual substrate parameters
  const action = applyClosedLoopSubstrateControl(substrateControlState, preMeasured);

  // 6. Run the next physical simulation step with the updated substrate parameters
  const postSimRaw = runSimulationStep(substrateControlState);

  // 7. Recalculate telemetry independently from the resulting network propagation
  const measuredTelemetryState = measureNetworkTelemetry(substrateControlState, postSimRaw);
  const telemetryIntegrityState = validateTelemetryIntegrity(
    substrateControlState,
    measuredTelemetryState
  );

  // 8. Evaluate homeostatic equilibrium verdict
  const hadIntervention =
    action.weightScaleApplied !== 1.0 ||
    Math.abs(action.inhibitoryGainAfter - action.inhibitoryGainBefore) > 1e-4;

  const verdict = evaluateHomeostaticEquilibrium(
    measuredTelemetryState,
    telemetryIntegrityState,
    hadIntervention
  );

  // Build explicit causal transition record (Before -> Action -> After)
  const transition: ClosedLoopTransition = {
    cycle: cycleNumber,
    observedBranchingRatio: preMeasured.branchingRatio,
    observedLyapunov: preMeasured.lyapunovExponent,
    observedFiringRateHz: preMeasured.meanFiringRateHz,
    weightScaleApplied: action.weightScaleApplied,
    inhibitoryGainBefore: action.inhibitoryGainBefore,
    inhibitoryGainAfter: action.inhibitoryGainAfter,
    resultingBranchingRatio: measuredTelemetryState.branchingRatio,
    resultingLyapunov: measuredTelemetryState.lyapunovExponent,
    resultingFiringRateHz: measuredTelemetryState.meanFiringRateHz,
    telemetryIntegrity: telemetryIntegrityState.telemetryIntegrity,
    verdict,
  };

  return {
    measuredTelemetryState,
    telemetryIntegrityState,
    transition,
  };
}
