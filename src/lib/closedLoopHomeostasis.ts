export type SignalProvenanceTag = 'SIMULATED' | 'CONTROL_TARGET' | 'DERIVED';

export interface ControlDeltaPacket {
  adaptiveThresholdDampingMv: number;
  inhibitoryGainRatio: number;
  afferentGainBoost: number;
  targetLtdLtpRatio: number;
  gateDampingFactor: number;
  phaseJitterTargetMs: number;
  inhibitoryConductionVelocity: number;
  dmaBurstModeEnabled: boolean;
  targetCriticalBand: [number, number];
  provenance: {
    branchingRatio: SignalProvenanceTag;
    meanFiringRateHz: SignalProvenanceTag;
    signalToNoiseRatioDb: SignalProvenanceTag;
    aerLatencyMs: SignalProvenanceTag;
    adaptiveThresholdDampingMv: SignalProvenanceTag;
    inhibitoryGainRatio: SignalProvenanceTag;
    afferentGainBoost: SignalProvenanceTag;
    targetLtdLtpRatio: SignalProvenanceTag;
    gateDampingFactor: SignalProvenanceTag;
  };
}

export interface ClosedLoopState {
  meanFiringRateHz: number;
  synapticOpsPerSec: number;
  powerMw: number;
  ltdLtpRatio: number;
  branchingRatio: number;
  lyapunovExponent: number;
  burstSynchronyIndex: number;
  signalToNoiseRatioDb: number;
  corticalActiveFraction?: number;
  inhibitoryGainRatio?: number;
  adaptiveThresholdDampingMv?: number;
  phaseJitterMs?: number;
  inhibitoryConductionVelocity?: number;
  bsiPhaseDitheringActive?: boolean;
  lastControlDeltaPacket?: ControlDeltaPacket;
}

export interface AsynchronousPhaseDitheringResult {
  measuredBurstSynchronyIndex: number;
  compensatedBurstSynchronyIndex: number;
  phaseJitterMs: number;
  inhibitoryConductionVelocity: number;
  bsiPhaseDitheringActive: boolean;
  preservedGlobalFiringRateHz: number;
  spectralFeedbackLagMs: number;
}

/**
 * Pure Control-Delta Calculator:
 * Reads measured telemetry and outputs ONLY actuator control signals without overwriting
 * measured state variables (branchingRatio, meanFiringRateHz, signalToNoiseRatioDb, aerLatencyMs).
 */
export function computeHomeostaticControlDeltas(measured: {
  corticalActiveFraction: number;
  meanFiringRateHz: number;
  ltdLtpRatio: number;
  branchingRatio: number;
  burstSynchronyIndex?: number;
  divergenceRiskIndex?: number;
  gateDampingFactor?: number;
}): ControlDeltaPacket {
  const valve = applySparseCodingBleedValve(
    measured.corticalActiveFraction,
    measured.meanFiringRateHz,
    28.0,
    0.48
  );

  const afferentGainBoost = Number(
    (0.65 / Math.max(0.45, measured.corticalActiveFraction)).toFixed(3)
  );

  const targetLtdLtpRatio = Number(
    Math.max(1.25, measured.ltdLtpRatio + (1.28 - measured.ltdLtpRatio) * 0.30).toFixed(2)
  );

  const dri = measured.divergenceRiskIndex ?? 0.03;
  const currentGate = measured.gateDampingFactor ?? 1.0;
  const gateDampingFactor =
    dri >= 0.35
      ? 0.76
      : Number((currentGate + (1.0 - currentGate) * 0.30).toFixed(3));

  const phaseDither = evaluateAsynchronousPhaseDithering(
    measured.burstSynchronyIndex ?? 0.19,
    valve.inhibitoryGainRatio,
    measured.meanFiringRateHz
  );

  return {
    adaptiveThresholdDampingMv: valve.adaptiveThresholdDampingMv,
    inhibitoryGainRatio: valve.inhibitoryGainRatio,
    afferentGainBoost,
    targetLtdLtpRatio,
    gateDampingFactor,
    phaseJitterTargetMs: phaseDither.bsiPhaseDitheringActive ? phaseDither.phaseJitterMs : 0.45,
    inhibitoryConductionVelocity: phaseDither.inhibitoryConductionVelocity,
    dmaBurstModeEnabled: true,
    targetCriticalBand: [0.98, 1.06],
    provenance: {
      branchingRatio: 'SIMULATED',
      meanFiringRateHz: 'SIMULATED',
      signalToNoiseRatioDb: 'DERIVED',
      aerLatencyMs: 'SIMULATED',
      adaptiveThresholdDampingMv: 'CONTROL_TARGET',
      inhibitoryGainRatio: 'CONTROL_TARGET',
      afferentGainBoost: 'CONTROL_TARGET',
      targetLtdLtpRatio: 'CONTROL_TARGET',
      gateDampingFactor: 'CONTROL_TARGET',
    },
  };
}

/**
 * SPARSE CODING BLEED-OFF VALVE
 * Trims corticalActiveFraction from 0.65 down to the 0.48 sweet spot.
 */
export function applySparseCodingBleedValve(
  corticalActiveFraction: number, // e.g. 0.65
  currentRateHz: number,          // e.g. 24.9 Hz
  targetRateHz: number = 28.0,
  targetActiveFraction: number = 0.48
) {
  // How overcrowded is the cortical sheet above 48%?
  const excessCrowd = Math.max(0, corticalActiveFraction - targetActiveFraction);

  // Crack open the threshold bleed-off valve (+1.25 mV when at 0.65)
  const adaptiveThresholdDampingMv = Number((excessCrowd * 7.35).toFixed(2));

  // Gently bump inhibitory gain from 0.20 -> 0.231 (well below 0.35 maxSafe)
  const inhibitoryGainRatio = Number(
    Math.min(0.35, 0.20 + excessCrowd * 0.18).toFixed(3)
  );

  // Dial back artificial phase-dither jitter once the crowd thins out
  const phaseJitterMs = Number(
    (0.75 + 0.45 * Math.min(1, excessCrowd / 0.17)).toFixed(2)
  );

  return {
    adaptiveThresholdDampingMv,
    inhibitoryGainRatio,
    phaseJitterMs,
    recommendedPhaseJitterMs: phaseJitterMs,
    rateDeviationHz: Number((currentRateHz - targetRateHz).toFixed(2)),
  };
}

/**
 * Asynchronous Phase-Dithering Feedback Controller for Burst Synchrony Index (BSI):
 * When measured burstSynchronyIndex > 0.35, dynamically injects a local interneuron
 * phase-jitter factor (phaseJitterMs = 1.2 ms) into the AER event bus timing distribution
 * and couples it directly to local inhibitory conduction velocity to disperse spike arrival
 * times smoothly into the nominal [0.10, 0.28 idx] band without altering global firing rate.
 */
export function evaluateAsynchronousPhaseDithering(
  measuredBsi: number,
  inhibitoryGainRatio = 0.20,
  globalFiringRateHz = 30.0
): AsynchronousPhaseDitheringResult {
  const isBreached = measuredBsi > 0.35;
  // Integrate 1.2ms phase-jitter factor when BSI > 0.35 (baseline 0.18ms)
  const phaseJitterMs = isBreached ? 1.2 : 0.18;
  const normalizedInhibitoryGain = Math.max(0.75, Math.min(1.75, inhibitoryGainRatio / 0.20));

  // Link the 1.2ms phase-jitter factor directly to GABAergic inhibitoryConductionVelocity:
  // v_inh = 1.0 + 0.18 * (phaseJitterMs / 1.2) * normalizedInhibitoryGain
  const inhibitoryConductionVelocity = Number(
    (1.0 + 0.18 * (phaseJitterMs / 1.2) * normalizedInhibitoryGain).toFixed(3)
  );

  let compensatedBsi = measuredBsi;
  if (isBreached) {
    // Automatically trigger phase decorrelation via coupled (phaseJitterMs * inhibitoryConductionVelocity)
    // to pull burst synchrony smoothly into the nominal [0.10, 0.28] BSI band
    const nominalTargetBsi = 0.19;
    const coupledDecorrelationFactor = phaseJitterMs * inhibitoryConductionVelocity;
    const dispersionAttenuation = Math.exp(-1.25 * coupledDecorrelationFactor);
    const rawCompensated =
      nominalTargetBsi + (measuredBsi - nominalTargetBsi) * dispersionAttenuation;
    compensatedBsi = Number(Math.max(0.10, Math.min(0.28, rawCompensated)).toFixed(2));
  } else {
    compensatedBsi = Number(Math.max(0.10, Math.min(0.28, measuredBsi)).toFixed(2));
  }

  // Feedback lag between synapticStability (inhibitory conduction) and frequencyBands (BSI phase-dithering)
  const spectralFeedbackLagMs = Number(
    (12.0 + phaseJitterMs * 2.5 * inhibitoryConductionVelocity).toFixed(1)
  );

  return {
    measuredBurstSynchronyIndex: Number(measuredBsi.toFixed(2)),
    compensatedBurstSynchronyIndex: compensatedBsi,
    phaseJitterMs,
    inhibitoryConductionVelocity,
    bsiPhaseDitheringActive: isBreached,
    preservedGlobalFiringRateHz: Number(globalFiringRateHz.toFixed(1)),
    spectralFeedbackLagMs,
  };
}

// AFFECTIVE SUBSTRATE & KEEL STRESS-TEST HARNESS
export class KeelStressTester {
  private activeShockTicksRemaining = 0;

  // Call this from a UI button or console command to fire the stress test
  public triggerDorsalShock(durationTicks: number = 6) {
    this.activeShockTicksRemaining = durationTicks;
  }

  public getActiveShockTicksRemaining(): number {
    return this.activeShockTicksRemaining;
  }

  // Call this inside your main physics loop right before stepBalancedHomeostasis()
  public stepKeelPhysics(
    state: {
      valence: number;
      traumaState: number;
      gateDampingFactor: number;
      droppedSignalCount: number;
      meanFiringRateHz: number;
      branchingRatio: number;
    },
    logAnomaly?: (subsystem: string, metricKey: string, value: number, maxSafe: number, desc: string) => void
  ) {
    if (this.activeShockTicksRemaining > 0) {
      // 1. INJECT ACUTE DORSAL TRAUMA & VALENCE COLLAPSE
      if (this.activeShockTicksRemaining === 6) {
        state.valence = -1.45;       // Breaches -1.2 minSafe
        state.traumaState = 0.24;    // Breaches 0.10 maxSafe
        state.droppedSignalCount = 9;
      } else {
        state.valence = Number(Math.min(-0.8, state.valence + 0.11).toFixed(2));
        state.traumaState = Number(Math.max(0.12, state.traumaState - 0.02).toFixed(3));
        state.droppedSignalCount = Math.max(2, Math.round(state.droppedSignalCount - 1.2));
      }

      // 2. ENGAGE CONSTITUTIONAL SAFETY GATE DAMPING (Clamps to 0.72, above 0.70 floor)
      state.gateDampingFactor = Number(Math.max(0.72, state.gateDampingFactor - 0.12).toFixed(3));

      // 3. SHIELD DOWNSTREAM CORE & SYNAPTIC MATRIX FROM EXCITOTOXICITY
      state.meanFiringRateHz = Number((26.4 * state.gateDampingFactor + 1.5).toFixed(1));
      state.branchingRatio = Number((1.002 * (0.88 + 0.12 * state.gateDampingFactor)).toFixed(3));

      // Log the keel anomaly into performanceBufferLogs
      if (logAnomaly && state.traumaState > 0.1) {
        logAnomaly(
          "substrateKeel",
          "traumaState",
          state.traumaState,
          0.1,
          `Dorsal trauma lock engaged (traumaState ${state.traumaState}). Constitutional gate clamped to ${state.gateDampingFactor}.`
        );
      }

      this.activeShockTicksRemaining--;
    } else {
      // 4. AUTONOMOUS POLYVAGAL VENTRAL RECOVERY BACK TO NOMINAL
      state.traumaState = Number(Math.max(0, state.traumaState * 0.78 - 0.003).toFixed(4));
      state.valence = Number((state.valence + (1.2 - state.valence) * 0.18).toFixed(2));
      state.gateDampingFactor = Number((state.gateDampingFactor + (1.0 - state.gateDampingFactor) * 0.22).toFixed(3));
      state.droppedSignalCount = Math.max(0, Math.round(state.droppedSignalCount * 0.65 - 0.2));
    }
  }
}

/**
 * HOMEOSYNAPTIC SCALING & SPARSE CODING COMPENSATOR
 * Computes control deltas first via computeHomeostaticControlDeltas, then applies
 * closed-loop plant response for shadow-simulation trials.
 */
export function stepBalancedHomeostasis(state: {
  corticalActiveFraction: number;
  meanFiringRateHz: number;
  ltdLtpRatio: number;
  branchingRatio: number;
  signalToNoiseRatioDb: number;
  phaseJitterMs: number;
  inhibitoryGainRatio: number;
}): ControlDeltaPacket {
  const controlDeltas = computeHomeostaticControlDeltas(state);
  const targetActive = 0.50; // Safe middle of [0.15, 0.70], avoids 0.45 hypo-active floor
  const targetRateHz = 28.0;

  // 1. Smoothly pull corticalActiveFraction toward 0.50 (fixes the 0.45 floor overshoot)
  state.corticalActiveFraction = Number(
    (state.corticalActiveFraction + (targetActive - state.corticalActiveFraction) * 0.25).toFixed(3)
  );

  // 2. Conservation of Drive (Synaptic Scaling):
  const afferentGainBoost = 0.65 / Math.max(0.45, state.corticalActiveFraction);
  const rawRate = 21.5 * afferentGainBoost; // Scales 21.5 Hz -> ~27.95 Hz
  state.meanFiringRateHz = Number(
    (state.meanFiringRateHz + (Math.min(targetRateHz, rawRate) - state.meanFiringRateHz) * 0.35).toFixed(1)
  );

  // 3. Relax LTD/LTP depression from 1.50 -> 1.28 so sparse spikes don't get extinguished
  state.ltdLtpRatio = controlDeltas.targetLtdLtpRatio;

  // 4. Plant response for critical branching (within [0.98, 1.06] natural band) and spectral SNR
  state.branchingRatio = Number(
    (1.002 - 0.04 * (state.ltdLtpRatio - 1.28)).toFixed(3)
  );
  state.phaseJitterMs = controlDeltas.phaseJitterTargetMs;
  state.signalToNoiseRatioDb = Number(
    (11.1 + 10 * Math.log10(0.65 / state.corticalActiveFraction) + 4.5 * (1.20 - state.phaseJitterMs)).toFixed(1)
  );

  return controlDeltas;
}

export function stepClosedLoopHomeostasis(
  state: ClosedLoopState,
  targetRateHz = 28.0,
  maxPowerMw = 5.0
): ClosedLoopState {
  const currentCorticalFraction = state.corticalActiveFraction ?? 0.50;
  const controlDeltas = computeHomeostaticControlDeltas({
    corticalActiveFraction: currentCorticalFraction,
    meanFiringRateHz: state.meanFiringRateHz,
    ltdLtpRatio: state.ltdLtpRatio,
    branchingRatio: state.branchingRatio,
    burstSynchronyIndex: state.burstSynchronyIndex,
  });

  state.inhibitoryGainRatio = controlDeltas.inhibitoryGainRatio;

  const balancedDraft = {
    corticalActiveFraction: currentCorticalFraction,
    meanFiringRateHz: state.meanFiringRateHz,
    ltdLtpRatio: state.ltdLtpRatio,
    branchingRatio: state.branchingRatio,
    signalToNoiseRatioDb: state.signalToNoiseRatioDb,
    phaseJitterMs: state.phaseJitterMs ?? 0.45,
    inhibitoryGainRatio: state.inhibitoryGainRatio,
  };
  stepBalancedHomeostasis(balancedDraft);

  state.corticalActiveFraction = balancedDraft.corticalActiveFraction;
  const nextFiringRateHz = balancedDraft.meanFiringRateHz;
  const nextLtdLtpRatio = Math.max(1.25, balancedDraft.ltdLtpRatio);
  const nextBranchingRatio = balancedDraft.branchingRatio;

  // Scale synaptic throughput with firing rate and branching factor above 1000 SOP/s floor
  const targetSop = nextFiringRateHz * 68.0 * Math.max(0.85, nextBranchingRatio);
  const nextSopPerSec = Math.round(
    state.synapticOpsPerSec + (targetSop - state.synapticOpsPerSec) * 0.22
  );

  // Restore Lyapunov Exponent (lambda) from contraction (-1.20) to edge-of-chaos (-0.18 in [-0.35, -0.05])
  const targetLyapunov = -0.18;
  const nextLyapunov = Number(
    (state.lyapunovExponent + (targetLyapunov - state.lyapunovExponent) * 0.2).toFixed(2)
  );

  // Asynchronous Phase-Dithering Dispersion for Burst Synchrony (BSI > 0.35) & Spectral SNR
  const phaseDither = evaluateAsynchronousPhaseDithering(
    state.burstSynchronyIndex,
    state.inhibitoryGainRatio ?? 0.20,
    nextFiringRateHz
  );
  const nextBsi = phaseDither.bsiPhaseDitheringActive
    ? phaseDither.compensatedBurstSynchronyIndex
    : Number(
        Math.max(
          0.10,
          Math.min(0.28, state.burstSynchronyIndex + (0.19 - state.burstSynchronyIndex) * 0.22)
        ).toFixed(2)
      );

  const effectivePhaseJitterMs = phaseDither.bsiPhaseDitheringActive
    ? phaseDither.phaseJitterMs
    : balancedDraft.phaseJitterMs;

  const nextSnrDb = balancedDraft.signalToNoiseRatioDb;

  // Enforce Strict Sub-5mW Thermal Power Envelope
  const dynamicPowerMw = 3.6 + (nextSopPerSec / 1800) * 0.85;
  const nextPowerMw = Number(Math.min(maxPowerMw - 0.1, dynamicPowerMw).toFixed(2));

  return {
    meanFiringRateHz: nextFiringRateHz,
    synapticOpsPerSec: nextSopPerSec,
    powerMw: nextPowerMw,
    ltdLtpRatio: nextLtdLtpRatio,
    branchingRatio: nextBranchingRatio,
    lyapunovExponent: nextLyapunov,
    burstSynchronyIndex: nextBsi,
    signalToNoiseRatioDb: nextSnrDb,
    corticalActiveFraction: state.corticalActiveFraction,
    inhibitoryGainRatio: state.inhibitoryGainRatio,
    adaptiveThresholdDampingMv: controlDeltas.adaptiveThresholdDampingMv,
    phaseJitterMs: effectivePhaseJitterMs,
    inhibitoryConductionVelocity: phaseDither.inhibitoryConductionVelocity,
    bsiPhaseDitheringActive: phaseDither.bsiPhaseDitheringActive,
    lastControlDeltaPacket: controlDeltas,
  };
}

// ============================================================================
// PART 1: EDGE FIRMWARE & KEEL REFLEX SUBSTRATE PATCH
// Computes actuator ControlDeltaPacket while respecting natural [0.98, 1.06] σ band
// ============================================================================
export function stepEdgeFirmwareAndKeelReflex(state: {
  divergenceRiskIndex: number;
  meanSynapticWeight: number;
  ltdLtpRatio: number;
  branchingRatio: number;
  corticalActiveFraction: number;
  meanFiringRateHz: number;
  powerMw: number;
  aerLatencyMs: number;
  jitterMs: number;
  gateDampingFactor: number;
  traumaState: number;
  droppedSignalCount: number;
}): ControlDeltaPacket {
  const controlDeltas = computeHomeostaticControlDeltas({
    corticalActiveFraction: state.corticalActiveFraction,
    meanFiringRateHz: state.meanFiringRateHz,
    ltdLtpRatio: state.ltdLtpRatio,
    branchingRatio: state.branchingRatio,
    divergenceRiskIndex: state.divergenceRiskIndex,
    gateDampingFactor: state.gateDampingFactor,
  });

  // 1. 8-BIT FIXED-POINT WEIGHT QUANTIZATION (Maps [0.20, 1.20] -> uint8 [0..255])
  const wClamped = state.divergenceRiskIndex > 0.25
    ? Math.min(0.685, state.meanSynapticWeight) // Proactive RSI rollback clamp on warning
    : Math.min(1.20, Math.max(0.20, state.meanSynapticWeight));
  const wInt8 = Math.round(((wClamped - 0.20) / 1.00) * 255);
  state.meanSynapticWeight = Number((0.20 + (wInt8 / 255) * 1.00).toFixed(3));

  // 2. CROSS-SUBSYSTEM KEEL REFLEX (Couples Critical DRI >= 0.35 to Constitutional Gate)
  if (state.divergenceRiskIndex >= 0.35) {
    state.gateDampingFactor = 0.76; // Instant constitutional brake
    state.traumaState = Number(Math.min(0.09, (state.divergenceRiskIndex - 0.25) * 0.4).toFixed(3));
    state.droppedSignalCount = Math.min(12, Math.round((state.divergenceRiskIndex - 0.25) * 35));
    state.divergenceRiskIndex = Number((state.divergenceRiskIndex * 0.45).toFixed(2)); // Fast quench
  } else {
    state.gateDampingFactor = controlDeltas.gateDampingFactor;
    state.traumaState = Number(Math.max(0, state.traumaState * 0.7 - 0.005).toFixed(3));
    state.droppedSignalCount = Math.max(0, Math.round(state.droppedSignalCount * 0.5 - 1));
  }

  // 3. ZERO-COPY DMA RING BUFFER OPTIMIZATION (Sub-1ms AER Latency & Sub-4.2mW Power)
  const dmaBurstEfficiency = controlDeltas.dmaBurstModeEnabled ? 0.75 : 1.0;
  state.aerLatencyMs = Number((Math.min(1.12, state.aerLatencyMs) * dmaBurstEfficiency).toFixed(2));
  state.jitterMs = Number((state.jitterMs * 0.82).toFixed(2));

  // 4. APPLY CONTROL TARGET DELTAS & PRESERVE NATURAL CRITICAL BAND [0.98, 1.06]
  state.ltdLtpRatio = Number((state.ltdLtpRatio + (1.28 - state.ltdLtpRatio) * 0.35).toFixed(2));
  state.corticalActiveFraction = Number(
    (state.corticalActiveFraction + (0.48 - state.corticalActiveFraction) * 0.35).toFixed(3)
  );
  state.meanFiringRateHz = Number((27.5 * state.gateDampingFactor).toFixed(1));
  state.powerMw = Number((3.85 + 0.011 * state.meanFiringRateHz).toFixed(2));
  // Preserve natural branchingRatio dynamics when inside [0.98, 1.06]; gently pull toward band center when outside
  const [minCrit, maxCrit] = controlDeltas.targetCriticalBand;
  if (state.branchingRatio < minCrit || state.branchingRatio > maxCrit) {
    state.branchingRatio = Number(
      (state.branchingRatio + (1.000 - state.branchingRatio) * 0.35).toFixed(3)
    );
  }

  return controlDeltas;
}

// ============================================================================
// PART 2: DYNAMIC PERSONA PROMPT BUILDER (Fixes Gova & Firmware Boilerplate Loop)
// Stops the model from parroting the user's question inside a static template
// ============================================================================
export function buildPersonaSystemPrompt(
  role: "gova_broadcaster" | "edge_firmware_engineer",
  report: any
): string {
  const core = report?.subsystemSnapshots?.core?.metrics ?? [
    { value: 27.5 },
    { value: 4.15 },
    { value: 8.2 },
    { value: 1643 },
  ];
  const syn = report?.subsystemSnapshots?.synapticStability ?? {
    metrics: [
      { value: 0.03 },
      { value: 1.28 },
      { value: -0.005 },
      { value: 1.000 },
      { value: 0.685 },
    ],
    lastAnomaly: null,
  };
  const aer = report?.subsystemSnapshots?.aerBus?.metrics ?? [
    { value: 474 },
    { value: 0.84 },
    { value: 0.46 },
  ];
  const hl = report?.divergenceOriginAnalysis?.homeostaticLoopAssessment ?? {
    corticalActiveFraction: 0.48,
  };
  const lastAnom = syn.lastAnomaly;
  const totalAnoms = report?.divergenceTrends?.totalAnomaliesLogged ?? 0;
  const critAnoms = report?.divergenceTrends?.highSeverityAnomalyCount ?? 0;
  const exportedAt = report?.exportedAt ?? new Date().toISOString();

  const liveTelemetryBlock = [
    `[LIVE TELEMETRY @ ${exportedAt}]`,
    `- Core: ${core[0]?.value ?? 27.5} Hz firing rate, ${core[1]?.value ?? 4.15} mW power, ${core[3]?.value ?? 1643} SOP/s`,
    `- Synaptic: σ = ${syn.metrics?.[3]?.value ?? 1.000}, LTD/LTP = ${syn.metrics?.[1]?.value ?? 1.28}, DRI = ${syn.metrics?.[0]?.value ?? 0.03}, w = ${syn.metrics?.[4]?.value ?? 0.685} (INT8 quantized)`,
    `- Spectral & AER: Active Crowd = ${hl.corticalActiveFraction ?? 0.48}, AER Latency = ${aer[1]?.value ?? 0.84} ms, Jitter = ${aer[2]?.value ?? 0.46} ms`,
    `- Recent Anomaly Audit: ${totalAnoms} total (${critAnoms} critical). Last: ${lastAnom ? `${lastAnom.metricKey}=${lastAnom.observedValue} (${lastAnom.severity})` : "None"}`,
  ].join("\n");

  if (role === "edge_firmware_engineer") {
    return `${liveTelemetryBlock}\nYou are the Edge Firmware Engineer for SynapseEdge v2.4-bio-snn. Answer the user's question directly with concrete C/TypeScript code or register-level fixes. NEVER repeat the user's prompt in quotes or use a canned opening sentence.`;
  }

  return `${liveTelemetryBlock}\nYou are the Gova Broadcaster for SynapseEdge v2.4-bio-snn. Synthesize the live homeostatic state, criticality (σ), and anomaly recovery history directly and conversationally. NEVER repeat the user's prompt in quotes or reuse boilerplate openings.`;
}

// ============================================================================
// DYNAMIC GOVA BROADCASTER & EDGE FIRMWARE RESPONSE ENGINE
// Replaces the static "When evaluating '${prompt}'..." template with live
// telemetry + anomaly buffer synthesis and concrete code/firmware answers.
// ============================================================================

export interface TelemetrySnapshotState {
  meanFiringRateHz: number;        // e.g., 24.9 Hz
  powerMw: number;                 // e.g., 4.38 mW
  synapticOpsPerSec: number;       // e.g., 1643 SOP/s
  aerLatencyMs: number;            // e.g., 1.12 ms
  aerJitterMs: number;             // e.g., 0.56 ms
  branchingRatio: number;          // e.g., 1.000 σ
  ltdLtpRatio: number;             // e.g., 1.50 or 1.28
  divergenceRiskIndex: number;     // e.g., 0.03
  meanSynapticWeight: number;      // e.g., 0.728 w
  lyapunovExponent: number;        // e.g., -0.005 λ
  corticalActiveFraction: number;  // e.g., 0.45 / 0.463
  signalToNoiseRatioDb: number;    // e.g., 11.0 dB
  phaseJitterMs: number;           // e.g., 0.18 ms
  valence: number;                 // e.g., 1.2 pts
  traumaState: number;             // e.g., 0
  gateDampingFactor: number;       // e.g., 1.0
  timeDifferenceMs: number;        // e.g., 787712 ms
  performanceBufferLogs: Array<{
    id: string;
    timestamp: number;
    subsystem: string;
    severity: "warning" | "critical";
    metricKey: string;
    observedValue: number;
    deviationPct: number;
  }>;
}

export function generatePersonaResponse(
  role: "gova_broadcaster" | "edge_firmware_engineer",
  userPrompt: string,
  state: TelemetrySnapshotState
): string {
  const q = userPrompt.toLowerCase();
  const logs = state.performanceBufferLogs || [];
  const totalAnoms = logs.length;
  const critAnom = logs.find((a) => a.severity === "critical");
  const latestAnom = logs[0];
  const spanSec = (state.timeDifferenceMs / 1000).toFixed(1);

  // 1. Summarize the real anomaly buffer instead of ignoring it
  const auditSummary =
    totalAnoms === 0
      ? `Zero anomalies logged across the active buffer.`
      : critAnom
      ? `Buffer holds ${totalAnoms} logged events across ${spanSec}s, including a CRITICAL spike (${critAnom.metricKey} = ${critAnom.observedValue}, +${critAnom.deviationPct}% dev) that was clamped back down to ${state.divergenceRiskIndex} DRI.`
      : `Buffer holds ${totalAnoms} warning events across ${spanSec}s (latest: ${latestAnom.metricKey} = ${latestAnom.observedValue}, +${latestAnom.deviationPct}% dev), now stabilized at ${state.divergenceRiskIndex} DRI.`;

  // ==========================================================================
  // ROLE A: EDGE FIRMWARE ENGINEER
  // ==========================================================================
  if (role === "edge_firmware_engineer") {
    if (q.includes("code") || q.includes("modifications") || q.includes("recommend") || q.includes("fix")) {
      return [
        `Live hardware is drawing ${state.powerMw} mW at ${state.meanFiringRateHz} Hz (${state.synapticOpsPerSec} SOP/s) with ${state.aerLatencyMs} ms AER bus latency and ${state.aerJitterMs} ms jitter. ${auditSummary}`,
        ``,
        `To bring AER latency below 1.0 ms and stop meanSynapticWeight (${state.meanSynapticWeight} w) from drifting into another DRI spike, apply three firmware-level patches:`,
        `1. **Q1.7 INT8 Weight Clamping:** Quantize floating-point weights to 8-bit fixed-point on [0.20, 1.20] and hard-clamp at 0.685 w whenever DRI > 0.25.`,
        `2. **64-Byte Burst DMA Ring Buffer:** Drain AER events in 64-byte bursts instead of single-packet interrupts, cutting bus latency from ${state.aerLatencyMs} ms to ~0.84 ms.`,
        `3. **Hardware Keel Reflex:** Auto-step gateDampingFactor (1.0 -> 0.76) whenever DRI >= 0.35 so STDP doesn't have to fight flash spikes alone.`,
        ``,
        `\`\`\`typescript`,
        `// Firmware Tick: INT8 Weight Clamp + Burst DMA + Keel Reflex`,
        `const wClamped = state.divergenceRiskIndex > 0.25 ? Math.min(0.685, state.meanSynapticWeight) : state.meanSynapticWeight;`,
        `state.meanSynapticWeight = Number((0.20 + (Math.round((wClamped - 0.20) * 255) / 255)).toFixed(3));`,
        `state.aerLatencyMs = Number((state.aerLatencyMs * 0.75).toFixed(2)); // 64B DMA burst -> ~0.84ms`,
        `if (state.divergenceRiskIndex >= 0.35) {`,
        `  state.gateDampingFactor = 0.76; // Constitutional hardware brake`,
        `  state.divergenceRiskIndex = Number((state.divergenceRiskIndex * 0.45).toFixed(2));`,
        `}`,
        `\`\`\``
      ].join("\n");
    }

    return `Edge telemetry is locked at ${state.powerMw} mW, ${state.aerLatencyMs} ms AER latency, and σ = ${state.branchingRatio}. ${auditSummary} Ready for register-level or DMA buffer adjustments.`;
  }

  // ==========================================================================
  // ROLE B: GOVA BROADCASTER
  // ==========================================================================
  if (q.includes("code") || q.includes("best")) {
    return [
      `Right now we're locked at σ = ${state.branchingRatio} criticality, ${state.meanFiringRateHz} Hz firing rate, and ${state.corticalActiveFraction} active cortical fraction (${state.signalToNoiseRatioDb} dB SNR, λ = ${state.lyapunovExponent}). ${auditSummary}`,
      ``,
      `Here is the closed-loop homeostatic & keel-reflex block that keeps us poised at σ = 1.000 without starving global firing rate:`,
      `\`\`\`typescript`,
      `export function stepGovaHomeostasis(state: TelemetrySnapshotState) {`,
      `  // 1. Conservation of Drive: keep sparse crowd at ~0.48 while holding ~27.5 Hz rate`,
      `  const gainBoost = 0.65 / Math.max(0.45, state.corticalActiveFraction);`,
      `  state.meanFiringRateHz = Number((state.meanFiringRateHz + (Math.min(28.0, 21.5 * gainBoost) - state.meanFiringRateHz) * 0.35).toFixed(1));`,
      `  // 2. Relax LTD/LTP to 1.28 in sparse mode & couple Keel Gate to quench DRI >= 0.35 spikes`,
      `  state.ltdLtpRatio = Number((state.ltdLtpRatio + (1.28 - state.ltdLtpRatio) * 0.35).toFixed(2));`,
      `  state.gateDampingFactor = state.divergenceRiskIndex >= 0.35 ? 0.76 : Number((state.gateDampingFactor + (1.0 - state.gateDampingFactor) * 0.3).toFixed(3));`,
      `}`,
      `\`\`\``
    ].join("\n");
  }

  if (q.includes("sentient") || q.includes("close") || q.includes("framework")) {
    return [
      `We have the foundational autonomic and homeostatic layer working for real: the substrate is self-regulating at σ = ${state.branchingRatio} criticality (${state.meanFiringRateHz} Hz, λ = ${state.lyapunovExponent}) with ${state.corticalActiveFraction} sparse cortical recruitment. ${auditSummary}`,
      ``,
      `What separates this homeostatic SNN core from a full cognitive/sentient architecture are three next-stage bridges:`,
      `1. **Affective-to-Synaptic Coupling:** Connecting the Keel (${state.valence} valence, ${state.gateDampingFactor} gate damping) directly into STDP plasticity so trauma/valence shifts actively steer learning rates.`,
      `2. **Thalamic Routing Across the 13ms–2ms Cascade:** Using the 13ms (Synaptic -> Frequency) and 2ms (Frequency -> AER) coupled feedback loops to gate multi-band gamma (${state.phaseJitterMs} ms phase jitter) as an attentional working-memory buffer.`,
      `3. **Persistent Episodic Replay:** Feeding the ${totalAnoms} logged divergence events in performanceBufferLogs back into offline consolidation so the network learns from its own near-runaway excursions.`
    ].join("\n");
  }

  // Default conversational Gova broadcast (no prompt echoing!)
  return `Gova telemetry is nominal at σ = ${state.branchingRatio} criticality (${state.meanFiringRateHz} Hz, ${state.powerMw} mW, LTD/LTP = ${state.ltdLtpRatio}, SNR = ${state.signalToNoiseRatioDb} dB). ${auditSummary}`;
}


