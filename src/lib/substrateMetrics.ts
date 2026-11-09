export type SynapseKind = 'excitatory' | 'inhibitory';

export interface AuthoritativeSynapse {
  weight: number;
  kind: SynapseKind;
}

export interface SubstrateConfig {
  readonly excitatoryFraction: number;
  readonly inhibitoryFraction: number;
}

export const DEFAULT_SUBSTRATE_CONFIG: SubstrateConfig = Object.freeze({
  excitatoryFraction: 0.80,
  inhibitoryFraction: 0.20,
});

export function validateSubstrateConfig(
  config: SubstrateConfig = DEFAULT_SUBSTRATE_CONFIG
): void {
  const total = config.excitatoryFraction + config.inhibitoryFraction;
  if (Math.abs(total - 1.0) > 1e-6) {
    throw new Error('Excitatory + inhibitory fractions must equal 1.');
  }
  if (config.excitatoryFraction <= 0) {
    throw new Error('Excitatory population cannot be empty.');
  }
  if (config.inhibitoryFraction <= 0) {
    throw new Error('Inhibitory population cannot be empty.');
  }
}

export interface NetworkState {
  spikes: number;
  firingRateHz: number;
  synapses: AuthoritativeSynapse[];
  afferentSpikes?: number;
  corticalSpikes?: number;
  efferentSpikes?: number;
  neuronSpikeCounts?: number[];
  neuronFiringRatesHz?: number[];
  ltdLtpRatio?: number;
}

export interface StabilityMetrics {
  sparsityPct: number;
  meanSynapticWeight: number;
  excitatoryRatio: number;
  inhibitoryRatio: number;
  branchingRatio: number;
  lyapunovExponent: number;
  fanoFactor: number;
  divergenceRiskIndex: number;
  status:
    | 'nominal'
    | 'caution'
    | 'diverging'
    | 'critical'
    | 'NO_SYNAPSES'
    | 'TELEMETRY_INCONSISTENT';
  errors: string[];
}

export interface SubstrateKeelState {
  valence: number;
  arousal: number;
  sociability: number;
  motor_bias: number;
  trauma_state: string;
  trauma_lock_steps: number;
  constitutional_gate_state: string;
  gate_damping_factor: number;
  dynamic_signal_center: number;
  memory_bias: number;
  dropped_signal_count: number;
}

export class TelemetryIntegrityError extends Error {
  public readonly errors: string[];

  constructor(errors: string[]) {
    super('Telemetry integrity failure:\n- ' + errors.join('\n- '));
    this.name = 'TelemetryIntegrityError';
    this.errors = errors;
  }
}

/**
 * Estimates the critical branching ratio (sigma) strictly from actual spike propagation
 * and active excitatory/inhibitory synaptic transmission state.
 */
export function estimateBranchingRatio(state: NetworkState): number {
  const nonzero = state.synapses.filter((s) => Math.abs(s.weight) > 1e-9);
  if (nonzero.length === 0 || state.spikes <= 0 || state.firingRateHz <= 0) {
    return 0.0;
  }

  // If layer-level spike counts are available, measure actual downstream/upstream spike propagation
  if (
    state.afferentSpikes !== undefined &&
    state.corticalSpikes !== undefined &&
    state.afferentSpikes > 0
  ) {
    const rawPropagation = state.corticalSpikes / state.afferentSpikes;
    return Number(Math.max(0.05, Math.min(2.0, rawPropagation)).toFixed(2));
  }

  // Fallback measurement from active excitatory vs inhibitory synaptic drive & firing rate
  let excWeightSum = 0;
  let inhWeightSum = 0;
  for (const s of nonzero) {
    if (s.kind === 'excitatory') {
      excWeightSum += Math.abs(s.weight);
    } else {
      inhWeightSum += Math.abs(s.weight);
    }
  }
  const netGain = (excWeightSum - inhWeightSum * 1.2) / Math.max(1, nonzero.length);
  const rateFactor = state.firingRateHz / 28.0;
  return Number(Math.max(0.05, Math.min(2.0, netGain * 1.45 * rateFactor)).toFixed(2));
}

/**
 * Estimates maximal Lyapunov exponent (lambda) from measured branching propagation and weight trajectory.
 * Negative = contracting/stable; Positive = locally divergent.
 */
export function estimateLyapunov(state: NetworkState, branchingRatio?: number): number {
  const sigma = branchingRatio ?? estimateBranchingRatio(state);
  if (sigma <= 0) {
    return -2.3;
  }
  // lambda = ln(sigma) shifted slightly by recurrent damping so sigma = 0.98 -> lambda ~ -0.18
  const rawLambda = Math.log(Math.max(0.1, sigma)) - 0.14;
  return Number(rawLambda.toFixed(2));
}

/**
 * Estimates Fano factor (spike count variance / mean) from actual neuron spike distributions.
 */
export function estimateFanoFactor(state: NetworkState): number {
  const rates = state.neuronFiringRatesHz;
  if (rates && rates.length > 0) {
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    if (mean <= 1e-6) return 0.0;
    const variance = rates.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / rates.length;
    // Normalize window variance to per-bin spike count Fano factor (Poisson baseline ~ 1.0)
    const fano = (variance / mean) * 0.25;
    return Number(Math.max(0.05, Math.min(5.0, fano)).toFixed(2));
  }

  const counts = state.neuronSpikeCounts;
  if (counts && counts.length > 0) {
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    if (mean <= 1e-6) return 0.0;
    const variance = counts.reduce((acc, c) => acc + Math.pow(c - mean, 2), 0) / counts.length;
    return Number(Math.max(0.05, Math.min(5.0, variance / mean)).toFixed(2));
  }

  return state.spikes > 0 ? 1.0 : 0.0;
}

/**
 * Computes Divergence Risk Index (DRI) [0.0 - 1.0] from measured branching ratio, Lyapunov exponent, and firing rate.
 */
export function calculateDivergenceRisk(
  branchingRatio: number,
  lyapunov: number,
  firingRateHz: number,
  excitatoryRatio = 0.8,
  inhibitoryRatio = 0.2
): number {
  // Branching excursion from critical [0.85, 1.15] band
  const branchingRisk =
    branchingRatio > 1.15
      ? Math.min(1.0, (branchingRatio - 1.15) * 1.8)
      : branchingRatio < 0.85
      ? Math.min(1.0, (0.85 - branchingRatio) * 1.4)
      : Math.abs(branchingRatio - 1.0) * 0.4;

  // Lyapunov excursion outside [-1.0, 0.05]
  const lyapunovRisk =
    lyapunov > 0.05
      ? Math.min(1.0, (lyapunov - 0.05) * 2.5)
      : lyapunov < -1.0
      ? Math.min(1.0, (-1.0 - lyapunov) * 1.2)
      : Math.max(0, (lyapunov + 0.35) * 0.25);

  // Firing rate excursion from [18, 38] Hz
  const rateRisk =
    firingRateHz > 38
      ? Math.min(1.0, (firingRateHz - 38) / 25)
      : firingRateHz < 18
      ? Math.min(1.0, (18 - firingRateHz) / 18)
      : Math.abs(firingRateHz - 28) / 50;

  // E/I balance penalty if inhibitory population is depleted
  const eiPenalty =
    excitatoryRatio > 0 && inhibitoryRatio === 0
      ? 0.45
      : Math.abs(inhibitoryRatio - 0.20) * 0.5;

  const dri =
    branchingRisk * 0.35 +
    lyapunovRisk * 0.30 +
    rateRisk * 0.25 +
    eiPenalty * 0.10;

  return Number(Math.max(0.0, Math.min(1.0, dri)).toFixed(2));
}

export function classifyStability(
  branchingRatio: number,
  lyapunov: number,
  divergenceRisk: number
): 'nominal' | 'caution' | 'diverging' | 'critical' {
  if (divergenceRisk >= 0.65 || branchingRatio > 1.35 || lyapunov > 0.25) {
    return 'critical';
  }
  if (divergenceRisk >= 0.42 || branchingRatio > 1.15 || branchingRatio < 0.70 || lyapunov > 0.05 || lyapunov < -1.1) {
    return 'diverging';
  }
  if (divergenceRisk >= 0.25 || branchingRatio < 0.85 || lyapunov < -1.0) {
    return 'caution';
  }
  return 'nominal';
}

/**
 * Validates that the measured stability metrics do not contradict the underlying network state.
 */
export function validateTelemetry(
  state: NetworkState,
  metrics: Omit<StabilityMetrics, 'errors'> & { errors?: string[] }
): string[] {
  const errors: string[] = [];

  if (state.spikes > 0 && metrics.meanSynapticWeight === 0) {
    errors.push('ACTIVE_NETWORK_WITH_ZERO_SYNAPTIC_WEIGHT');
  }

  if (
    state.firingRateHz > 0 &&
    metrics.sparsityPct >= 100 &&
    state.spikes > 0
  ) {
    errors.push('FIRING_ACTIVITY_CONFLICTS_WITH_100_PERCENT_SPARSITY');
  }

  if (
    metrics.excitatoryRatio > 0 &&
    metrics.inhibitoryRatio === 0
  ) {
    errors.push('NO_INHIBITORY_POPULATION');
  }

  return errors;
}

/**
 * Throws TelemetryIntegrityError if any state-vs-telemetry contradictions exist.
 */
export function assertTelemetryIntegrity(
  state: NetworkState,
  metrics: Omit<StabilityMetrics, 'errors'> & { errors?: string[] }
): void {
  const errors = validateTelemetry(state, metrics);
  if (errors.length > 0) {
    throw new TelemetryIntegrityError(errors);
  }
}

/**
 * Authoritative Synaptic & Stability Metrics Calculator.
 * Derives every metric strictly from the physical NetworkState and runs telemetry integrity verification.
 */
export function calculateSynapticMetrics(state: NetworkState): StabilityMetrics {
  const synapses = state.synapses;

  if (!synapses || synapses.length === 0) {
    return {
      sparsityPct: 100.0,
      meanSynapticWeight: 0.0,
      excitatoryRatio: 0.0,
      inhibitoryRatio: 0.0,
      branchingRatio: 0.0,
      lyapunovExponent: 0.0,
      fanoFactor: 0.0,
      divergenceRiskIndex: 1.0,
      status: 'NO_SYNAPSES',
      errors: ['NO_SYNAPSES'],
    };
  }

  const nonzero = synapses.filter((s) => Math.abs(s.weight) > 1e-9);

  const sparsity = Number((100.0 * (1.0 - nonzero.length / synapses.length)).toFixed(1));

  const meanWeight =
    nonzero.length > 0
      ? Number(
          (
            nonzero.reduce((sum, s) => sum + Math.abs(s.weight), 0) / nonzero.length
          ).toFixed(3)
        )
      : 0.0;

  const excitatory = nonzero.filter((s) => s.kind === 'excitatory').length;
  const inhibitory = nonzero.filter((s) => s.kind === 'inhibitory').length;
  const activeCount = excitatory + inhibitory;

  const excitatoryRatio =
    activeCount > 0 ? Number((excitatory / activeCount).toFixed(2)) : 0.0;
  const inhibitoryRatio =
    activeCount > 0 ? Number((inhibitory / activeCount).toFixed(2)) : 0.0;

  // Branching ratio must come from actual spike propagation
  const branchingRatio = estimateBranchingRatio(state);

  // Negative = contracting/stable; Positive = locally divergent
  const lyapunov = estimateLyapunov(state, branchingRatio);

  const fano = estimateFanoFactor(state);

  const divergenceRisk = calculateDivergenceRisk(
    branchingRatio,
    lyapunov,
    state.firingRateHz,
    excitatoryRatio,
    inhibitoryRatio
  );

  const baseStatus = classifyStability(branchingRatio, lyapunov, divergenceRisk);

  const draftMetrics: Omit<StabilityMetrics, 'errors'> = {
    sparsityPct: sparsity,
    meanSynapticWeight: meanWeight,
    excitatoryRatio,
    inhibitoryRatio,
    branchingRatio,
    lyapunovExponent: lyapunov,
    fanoFactor: fano,
    divergenceRiskIndex: divergenceRisk,
    status: baseStatus,
  };

  const errors = validateTelemetry(state, draftMetrics);

  return {
    ...draftMetrics,
    status: errors.length > 0 ? 'TELEMETRY_INCONSISTENT' : baseStatus,
    errors,
  };
}
