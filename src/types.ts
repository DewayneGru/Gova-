export type NeuronLayer = 'sensory' | 'inter' | 'motor';

export interface LIFNeuron {
  id: number;
  label: string;
  layer: NeuronLayer;
  vMem: number; // Membrane potential in mV (-70mV resting, -55mV threshold)
  vRest: number;
  vThresh: number;
  vReset: number;
  tauMem: number; // Membrane time constant in ms
  refractoryRemaining: number; // ms left in refractory period
  lastSpikeTime: number; // timestamp ms
  spikeCount: number;
  recentSpikes: number[]; // timestamps
}

export interface Synapse {
  id: string;
  preId: number;
  postId: number;
  weight: number; // -2.0 to +2.0 (positive = excitatory, negative = inhibitory)
  kind?: 'excitatory' | 'inhibitory';
  initialWeight: number;
  eligibilityTrace: number;
  lastPreSpike: number;
  lastPostSpike: number;
}

export interface AERPacket {
  id: string;
  timestamp: number;
  neuronId: number;
  neuronLabel: string;
  layer: NeuronLayer;
  hexPayload: string;
  polarity: 'ON' | 'OFF';
}

export interface NeuralStimulusChannel {
  id: number;
  label: string;
  frequencyHz: number;
  active: boolean;
  waveType: 'poisson' | 'harmonic' | 'burst' | 'edge';
  amplitude: number;
  lastFiredTime?: number;
}

// Legacy sensor ray compatibility alias
export interface SensorRay {
  label?: string;
  angleOffset: number;
  distance: number;
  maxRange: number;
  hitX: number;
  hitY: number;
  spikeRateHz: number;
  hitType?: 'none' | 'wall' | 'obstacle';
}

export interface STDPConfig {
  enabled: boolean;
  aPlus: number; // LTP magnitude (e.g. 0.05)
  aMinus: number; // LTD magnitude (e.g. 0.055)
  tauPlus: number; // LTP window ms (e.g. 20ms)
  tauMinus: number; // LTD window ms (e.g. 20ms)
  learningRate: number;
  wMin: number;
  wMax: number;
  antiHebbianCollisionModulation: boolean;
  weightDecayMultiplier?: number; // Real-time synaptic weight decay multiplier (STDP leakage rate)
}

export interface HardwareTelemetry {
  powerMw: number;
  energyPerSopPj: number;
  synapticOpsPerSec: number;
  aerLatencyMs: number;
  meanFiringRateHz: number;
  totalSpikesEmitted: number;
  cumulativeSTDPDelta: number;
  voltageOscilloscope: number[];
  clocklessAsyncMode: boolean;
  signalToNoiseRatio?: number;
  activeSpikeCount?: number;
  firingStabilityIndex?: number;
  activeAvoidanceRatio?: string;
  substrateKeel?: { valence: number; arousal: number; sociability: number; motor_bias: number };
  traumaState?: 'ventral_equilibrium' | 'dorsal_trauma' | 'recovering';
  traumaLockSteps?: number;
  constitutionalGateState?: 'NOMINAL' | 'CONSTITUTIONAL_MODULATED' | 'STRATEGIC_MATERIALS_EQUILIBRIUM' | 'HUMAN_OVERRIDE_SUPREMACY';
  gateDampingFactor?: number;
  memoryBias?: number;
  dynamicSignalCenter?: number;
  droppedSignalCount?: number;
  collisions?: number; // legacy alias
  isPowerGated?: boolean;
  powerGatingMode?: 'auto' | 'aggressive' | 'conservative';
  powerSavedMw?: number;
  powerGatedClustersCount?: number;
}

export type SubstrateTab =
  | 'topology'
  | 'watchdog'
  | 'integrity'
  | 'trends'
  | 'matrix'
  | 'aer'
  | 'substrate'
  | 'rsi'
  | 'health'
  | 'heartbeat'
  | 'sae'
  | 'driftguard'
  | 'robotics'
  | 'novavault'
  | 'gova'
  | 'chat'
  | 'image';

export interface GovaTelemetryTurn {
  id: string;
  timestamp: number;
  userInput: string;
  assistantOutput: string;
  audioPlaybackDelayMs: number; // Intentional 600-1000ms pause
  hasReflexiveAffirmation: boolean; // Flag if "I understand", "Understood", "Sure", etc. detected
  leadThesisDelivered: boolean; // First sentence contains assertive lead
  leadThesisText: string;
  synthesisScore: number; // 0-100% synthesis vs passive summarization
  curationStatus: 'RETAINED' | 'FILTERED';
  modelUsed: string;
}

export interface GovaLiveSessionState {
  isActive: boolean;
  intentionalDelayMs: number; // 600-1000ms intentional pause before playback
  filterAffirmations: boolean;
  totalTurnsLogged: number;
  retainedTurnsCount: number;
  filteredTurnsCount: number;
  turns: GovaTelemetryTurn[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  modelTier?: 'fast' | 'general' | 'complex';
  modelUsed?: string;
  roleUsed?: string;
  govaCadenceAudit?: {
    hasReflexiveAffirmation: boolean;
    leadThesisDelivered: boolean;
    synthesisScore: number;
  };
}

export interface GeneratedNeuromorphicImage {
  id: string;
  prompt: string;
  imageUrl: string;
  size: '1K' | '2K' | '4K';
  aspectRatio: string;
  timestamp: number;
}

export interface SNNTuningConfig {
  aPlus: number;
  aMinus: number;
  learningRate: number;
  turnGain: number; // Associative projection gain (baseline 2.2, recommended 3.5)
  proximityGain: number; // Afferent input sensitivity multiplier (baseline 1.0, recommended 1.65)
  antiHebbianPenalty: number;
  synapticGain?: number;
  inputSensitivityGain?: number;
}

export interface SNNPersonalityProfile {
  formatVersion: '1.0' | '1.1';
  name: string;
  description: string;
  author?: string;
  category: 'cautious_explorer' | 'hyper_responsive' | 'homeostatic_sentinel' | 'ultra_sparse_edge' | 'custom';
  tags: string[];
  createdAt: number;
  tuningConfig: SNNTuningConfig;
  stdpConfig: {
    enabled: boolean;
    aPlus: number;
    aMinus: number;
    tauPlus: number;
    tauMinus: number;
    learningRate: number;
    wMin: number;
    wMax: number;
    antiHebbianCollisionModulation: boolean;
  };
  synapticState: {
    totalSynapses: number;
    meanWeight: number;
    excitatoryRatio: number;
    inhibitoryRatio: number;
    synapses: Array<{
      id: string;
      preId: number;
      postId: number;
      weight: number;
      initialWeight?: number;
    }>;
  };
  stimulusMode?: 'harmonic' | 'poisson' | 'burst' | 'orthogonal' | 'quiescent';
  expectedMetrics?: {
    estimatedPowerMw?: number;
    targetFiringRateHz?: number;
    targetDivergenceRiskIndex?: number;
    stabilityRating?: 'NOMINAL' | 'DYNAMIC_EQUILIBRIUM' | 'AGGRESSIVE';
  };
}

export interface UserGuidanceInput {
  notes?: string;
  focusAreas?: string[]; // e.g. 'Calibrate Firing Stability', 'Suppress Burst Divergence', 'Counter STDP Drift', 'Conserve Dynamic Power'
  prioritizedParam?: 'turnGain' | 'proximityGain' | 'learningRate' | 'stdpRatio' | 'all';
  customOverrides?: Partial<SNNTuningConfig>;
}

export interface GroundingSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface SelfImprovementSearchGrounding {
  searchQueries: string[];
  sources: GroundingSource[];
  literatureSynthesized?: string;
  biologicalInvariantsIdentified?: string[];
}

export interface HardLockedPlankInvariants {
  monotonicSafetyLocked: boolean;
  ltdPlankEnforced: boolean;
  capabilityPreserved: boolean;
  dynamicEquilibriumGuaranteed: boolean;
  learningRateBounded: boolean;
  antiHebbianActive: boolean;
  plankStatus: 'LOCKED_OPTIMAL' | 'LOCKED_ENFORCING' | 'INTERVENTION_PREVENTED';
  rejectionsPrevented: number;
}

export interface NeuronFrequencyData {
  id: number;
  label: string;
  layer: 'sensory' | 'inter' | 'motor';
  groupName: 'Afferent Input' | 'Cortical Association' | 'Efferent Decoder';
  frequencyHz: number;
  spikeCount: number;
  lastSpikeTime: number;
  vMem: number;
  isActive: boolean;
}

export interface LayerFrequencyGroupStats {
  layer: 'sensory' | 'inter' | 'motor';
  title: string;
  code: string;
  count: number;
  meanHz: number;
  peakHz: number;
  minHz: number;
  activeFraction: number;
  totalSpikes: number;
  fanoFactor: number;
  powerDissipationMw: number;
}

export interface NetworkFrequencyProfile {
  neurons: NeuronFrequencyData[];
  groups: {
    afferent: LayerFrequencyGroupStats;
    cortical: LayerFrequencyGroupStats;
    efferent: LayerFrequencyGroupStats;
  };
  overall: {
    meanHz: number;
    peakHz: number;
    dispersionIndex: number;
    signalToNoiseRatioDb: number;
    synapticSparsityPct: number;
  };
}

export interface ShadowTrialParameterDelta {
  parameter: 'aPlus' | 'aMinus' | 'learningRate' | 'turnGain' | 'proximityGain' | 'antiHebbianPenalty' | string;
  baseline: number;
  candidate: number;
  delta: number;
  pctChange: number;
}

export interface ShadowTrialResult {
  id?: string;
  approved: boolean;
  baselineDri: number;
  projectedDri: number;
  deltaDri: number;
  shadowSteps: number;
  weightSaturationRatio: number;
  projectedMeanHz: number;
  cumulativeStdpDrift: number;
  warnings: string[];
  executionTimeMs: number;
  timestamp: number;
  candidateTuning?: Partial<SNNTuningConfig>;
  parameterDeltas?: ShadowTrialParameterDelta[];
  divergenceResistanceScore?: number; // 0 - 100% resistance against runaway divergence
}

export interface ModelDiagnosticRecommendation {
  id: string;
  timestamp: number;
  model: string;
  title: string;
  analysisText: string;
  searchGrounding?: SelfImprovementSearchGrounding;
  hardLockedPlankVerified?: boolean;
  shadowValidation?: ShadowTrialResult;
  homeostaticScalingActive?: boolean;
  userGuidanceApplied?: {
    notes?: string;
    focusAreas?: string[];
  };
  parameters: {
    aPlus: { current: number; recommended: number; justification: string };
    aMinus: { current: number; recommended: number; justification: string };
    learningRate: { current: number; recommended: number; justification: string };
    turnGain: { current: number; recommended: number; justification: string };
    proximityGain: { current: number; recommended: number; justification: string };
  };
  applied: boolean;
}

// ============================================================================
// Diagnostic Trend Analyzer & Longitudinal Plasticity Regression
// ============================================================================

export type PlasticityBottleneckType =
  | 'stdp_ratio_compression'
  | 'learning_rate_volatility'
  | 'afferent_gain_creep'
  | 'associative_projection_saturation'
  | 'cumulative_drift_acceleration';

export interface LongitudinalRegressionPoint {
  epoch: number;
  timestamp: number;
  value: number;
}

export interface LongitudinalRegressionMetric {
  parameter: 'aPlus' | 'aMinus' | 'dominanceRatio' | 'learningRate' | 'turnGain' | 'proximityGain' | 'cumulativeDrift';
  label: string;
  historicalValues: LongitudinalRegressionPoint[];
  slope: number; // rate of change per epoch (m in y = mx + b)
  intercept: number;
  rSquared: number; // 0.0 to 1.0 goodness of fit
  currentValue: number;
  projectedNextEpoch: number;
  projectedIn5Epochs: number;
  trendDirection: 'escalating' | 'declining' | 'stable';
  hazardLevel: 'critical' | 'warning' | 'nominal';
  boundaryTarget: string;
}

export interface PlasticityBottleneckInsight {
  id: string;
  bottleneckType: PlasticityBottleneckType;
  title: string;
  severity: 'CRITICAL' | 'WARNING' | 'MONITORING';
  description: string;
  rootCauseHypothesis: string;
  affectedParameter: string;
  driftVelocity: number;
  epochsUntilBreach: number | null;
  preemptiveMitigation: string;
  recommendedAdjustment: Partial<SNNTuningConfig>;
}

export interface ProactiveTuningProposal {
  proposalId: string;
  timestamp: number;
  confidencePct: number;
  recommendedParameters: SNNTuningConfig;
  parameterDeltas: Array<{
    param: keyof SNNTuningConfig;
    label: string;
    current: number;
    proactiveTarget: number;
    delta: number;
    pctChange: number;
    justification: string;
  }>;
  preventedManualAuditCount: number;
  expectedStabilityGainPct: number;
  applied: boolean;
}

export interface DiagnosticTrendAnalysisReport {
  analyzedEpochsCount: number;
  timeRangeMs: number;
  lastEpochTimestamp: number;
  regressionMetrics: Record<string, LongitudinalRegressionMetric>;
  identifiedBottlenecks: PlasticityBottleneckInsight[];
  proactiveProposal: ProactiveTuningProposal;
  overallPlasticityHealthScore: number; // 0 - 100
  stabilityForecast: 'RUNAWAY_PREDICTED' | 'MODERATE_DRIFT' | 'STABLE_EQUILIBRIUM' | 'HOMEOSTATIC_RECOVERY';
}

export type HeatmapLayerType = 'all' | 'sensory' | 'reflex';
export type HeatmapDecayMode = 'dynamic' | 'cumulative';
export type HeatmapPalette = 'cyber' | 'plasma' | 'electric';

export interface SpatialActivityGrid {
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  arenaWidth: number;
  arenaHeight: number;
  allDensity: Float32Array;
  sensoryDensity: Float32Array;
  reflexDensity: Float32Array;
  maxAllDensity: number;
  maxSensoryDensity: number;
  maxReflexDensity: number;
  totalMappedSpikes: number;
  peakCell: { x: number; y: number; density: number };
  activeCoveragePct: number;
  // Automated Spike Synchronization Telemetry
  syncSequence: number;
  lastSyncTimestamp: number;
  spikeFrequencyHz: number;
  syncedSpikeCount: number;
  syncStatus: 'locked' | 'active' | 'quiescent';
  phaseLocked: boolean;
  instantaneousJitterMs: number;
}

// Autonomous Recursive Self-Improvement (RSI) & Anti-Divergence Architecture
export interface DivergenceMetrics {
  divergenceRiskIndex: number; // 0.00 (optimal) to 1.00 (critical divergence)
  status: 'nominal' | 'caution' | 'diverging' | 'critical';
  weightSaturationRisk: number; // 0.00 - 1.00
  burstSynchronyRisk: number; // 0.00 - 1.00 (replaces collisionFrequencyRisk)
  collisionFrequencyRisk?: number; // legacy compatibility alias
  keelInstabilityRisk: number; // 0.00 - 1.00
  firingRateRisk: number; // 0.00 - 1.00
  primaryRiskFactor: string;
  invariants: {
    plasticityBounded: boolean; // A- >= 1.05 * A+ (LTD dominance to prevent runaway LTP)
    weightsUnsaturated: boolean; // < 25% weights pinned at max boundary
    keelHomeostatic: boolean; // Valence > -2.0, trauma lock <= 0
    constitutionalAligned: boolean; // Gate not tripped into emergency throttling
  };
  homeostaticScalingActive?: boolean;
  homeostaticLTDMultiplier?: number;
  homeostaticLRMultiplier?: number;
  lastShadowTrial?: ShadowTrialResult;
}

export interface SelfImprovementEpoch {
  epochNumber: number;
  timestamp: number;
  triggerReason: 'divergence_threshold' | 'periodic_cadence' | 'collision_surge' | 'burst_surge' | 'operator_prompt' | 'autonomous_active' | 'web_literature_research' | 'initial_bootstrap' | string;
  modelUsed: string;
  initialDivergenceRisk: number;
  projectedDivergenceRisk: number;
  actualDivergenceRiskAfter?: number;
  parameterDeltas: {
    aPlus: { from: number; to: number };
    aMinus: { from: number; to: number };
    learningRate: { from: number; to: number };
    turnGain: { from: number; to: number };
    proximityGain: { from: number; to: number };
    antiHebbianPenalty: { from: number; to: number };
  };
  reasoning: string;
  divergenceMitigationStrategy: string;
  verificationStatus: 'verified_applied' | 'shadow_evaluated' | 'rolled_back' | 'hard_plank_enforced';
  searchGrounding?: SelfImprovementSearchGrounding;
  biologicalLiteratureFindings?: string[];
  hardLockedPlankVerified?: boolean;
  shadowValidation?: ShadowTrialResult;
  watchdogDecision?: WatchdogProposalDecision;
}

export interface AutonomousSelfImprovementState {
  isActive: boolean;
  mode: 'continuous' | 'event_triggered' | 'manual';
  cycleIntervalSeconds: number;
  divergenceThreshold: number;
  autoRollbackOnDivergenceSpike: boolean;
  totalEpochsCompleted: number;
  totalDivergencesPrevented: number;
  currentMetrics: DivergenceMetrics;
  history: SelfImprovementEpoch[];
  isAnalyzing: boolean;
  lastEvaluationTime: number;
  hardLockedPlank?: HardLockedPlankInvariants;
  homeostaticScalingActive?: boolean;
  lastShadowTrial?: ShadowTrialResult;
}

export interface UnifiedTelemetrySnapshot {
  timestamp: number;
  core: {
    meanFiringRateHz: number;
    powerMw: number;
    energyPerSopPj: number;
    totalSpikesEmitted: number;
    activeSeconds: number;
    voltageOscilloscope: number[];
    synapticOpsPerSec: number;
  };
  substrateKeel: {
    valence: number;
    arousal: number;
    sociability: number;
    motor_bias: number;
    traumaState: 'ventral_equilibrium' | 'dorsal_trauma' | 'recovering';
    traumaLockSteps: number;
    constitutionalGateState: 'NOMINAL' | 'CONSTITUTIONAL_MODULATED' | 'STRATEGIC_MATERIALS_EQUILIBRIUM' | 'HUMAN_OVERRIDE_SUPREMACY';
    gateDampingFactor: number;
    dynamicSignalCenter: number;
    memoryBias: number;
    droppedSignalCount: number;
  };
  frequencyBands: {
    meanHz: number;
    peakHz: number;
    deltaBandHz: number;
    thetaBandHz: number;
    alphaBandHz: number;
    betaBandHz: number;
    gammaBandHz: number;
    burstSynchronyIndex: number;
    signalToNoiseRatioDb: number;
    corticalActiveFraction: number;
    phaseJitterMs?: number;
    inhibitoryConductionVelocity?: number;
    bsiPhaseDitheringActive?: boolean;
  };
  aerBus: {
    aerLatencyMs: number;
    eventRatePerSec: number;
    packetDropCount: number;
    jitterMs: number;
    busStatus: 'NOMINAL' | 'SATURATED' | 'IDLE';
    recentEventCount: number;
  };
  synapticStability: {
    divergenceRiskIndex: number;
    status: 'nominal' | 'caution' | 'diverging' | 'critical' | 'NO_SYNAPSES' | 'TELEMETRY_INCONSISTENT';
    telemetryIntegrityErrors?: string[];
    equilibriumVerdict?: string;
    weightSaturationRisk: number;
    burstSynchronyRisk: number;
    keelInstabilityRisk: number;
    firingRateRisk: number;
    primaryRiskFactor: string;
    sparsityPct: number;
    meanSynapticWeight: number;
    excitatoryRatio: number;
    inhibitoryRatio: number;
    inhibitoryGainRatio?: number;
    inhibitoryPopulationRatio?: number;
    stdpCumulativeDelta: number;
    ltdLtpRatio: number;
    lyapunovExponent: number;
    branchingRatio: number;
    fanoFactor: number;
    weightKurtosis: number;
  };
}

// ============================================================================
// Unified Telemetry Health-Check Monitor & Dedicated Performance Buffer Types
// ============================================================================

export type SubsystemId = 'core' | 'substrateKeel' | 'frequencyBands' | 'aerBus' | 'synapticStability';

export type AnomalySeverity = 'info' | 'warning' | 'critical';

export type SubsystemHealthStatus = 'nominal' | 'degraded' | 'critical';

export interface TelemetryAnomalyRecord {
  id: string;
  timestamp: number;
  subsystem: SubsystemId;
  subsystemName: string;
  severity: AnomalySeverity;
  metricKey: string;
  metricLabel: string;
  observedValue: number;
  unit: string;
  baselineMin: number;
  baselineMax: number;
  deviationPct: number;
  description: string;
  recommendedMitigation: string;
  acknowledged?: boolean;
}

export interface SubsystemMetricCheck {
  key: string;
  label: string;
  value: number;
  unit: string;
  minSafe: number;
  maxSafe: number;
  status: 'nominal' | 'warning' | 'critical';
  trend?: 'up' | 'down' | 'stable';
  customDescription?: string;
  customMitigation?: string;
}

export interface SubsystemHealthReport {
  id: SubsystemId;
  name: string;
  code: string;
  status: SubsystemHealthStatus;
  healthScore: number; // 0 - 100
  activeAnomalyCount: number;
  metrics: SubsystemMetricCheck[];
  lastAnomaly?: TelemetryAnomalyRecord | null;
  lastCheckTime: number;
  description: string;
}

export interface AutonomousHealthAnalysisResult {
  id: string;
  timestamp: number;
  analyzedAnomalyCount: number;
  primaryFailureSubsystem: SubsystemId | 'multi-system' | 'nominal';
  crossSubsystemCorrelation: string;
  rootCauseHypothesis: string;
  systemStabilityIndex: number;
  recommendedActions: string[];
  remediationDetails?: string;
  modelUsed?: string;
}

export interface SubsystemCorrelationPair {
  subsystemA: SubsystemId;
  subsystemB: SubsystemId;
  coefficient: number; // -1.00 to +1.00 correlation coefficient
  couplingScore: number; // 0.00 to 1.00 normalized cross-anomaly coupling
  sharedAnomalyCount: number;
  leadSubsystem: SubsystemId | 'synchronous';
  leadLagMs: number;
  couplingNature: 'direct_cascade' | 'coupled_feedback' | 'independent' | 'anti_correlated';
}

export interface SubsystemCorrelationMatrixData {
  timestamp: number;
  pairs: Record<string, SubsystemCorrelationPair>;
  matrix: number[][]; // 5x5 numerical correlation coefficients
  subsystemOrder: SubsystemId[];
}

export interface DivergenceOriginAnalysis {
  primaryOrigin: 'synaptic_matrix' | 'substrate_keel' | 'spiking_rate_loop' | 'rate_homeostasis_loop' | 'nominal';
  confidencePct: number;
  synapticRiskFactor: number; // 0.00 - 1.00
  keelRiskFactor: number; // 0.00 - 1.00
  rateLoopRiskFactor: number; // 0.00 - 1.00
  earliestSpikeSubsystem: SubsystemId | null;
  timeDifferenceMs: number;
  verdictSummary: string;
  divergenceVectorComparison: {
    synapticDriftLTD: number;
    keelValenceDrop: number;
    firingRateDeviation: number;
    aerBusLatencySpike: number;
  };
  homeostaticLoopAssessment: {
    isRateLoopDestabilized: boolean;
    currentRateHz: number;
    targetRateHz: number;
    rateDeviationHz: number;
    adaptiveThresholdDampingMv: number;
    recommendedFix: string;
  };
  recommendedIntervention: string;
}

export interface DivergenceTrendExportReport {
  exportedAt: string;
  metadata: {
    systemName: string;
    version: string;
    targetPollingRate: string;
    totalFramesProcessed: number;
    globalSubsystemSyncActive: boolean;
  };
  overallHealthScore: number;
  overallStatus: SubsystemHealthStatus;
  divergenceTrends: {
    divergenceOriginVerdict: string;
    primaryOriginSubsystem: string;
    confidencePct: number;
    averageRiskScore: number;
    subsystemCouplingCount: number;
    totalAnomaliesLogged: number;
    highSeverityAnomalyCount: number;
    anomaliesBySubsystem: Record<SubsystemId, number>;
  };
  correlationMatrix?: SubsystemCorrelationMatrixData;
  divergenceOriginAnalysis?: DivergenceOriginAnalysis;
  subsystemSnapshots: Record<SubsystemId, SubsystemHealthReport>;
  performanceBufferLogs: TelemetryAnomalyRecord[];
}

export interface UnifiedHealthMonitorState {
  overallHealthScore: number; // 0 - 100
  overallStatus: SubsystemHealthStatus;
  isMonitoring: boolean;
  sampleCount: number;
  lastSampleTime: number;
  subsystems: Record<SubsystemId, SubsystemHealthReport>;
  anomalyBuffer: TelemetryAnomalyRecord[];
  bufferCapacity: number;
  totalAnomaliesLogged: number;
  autonomousAnalysisRunning: boolean;
  lastAutonomousAnalysis: AutonomousHealthAnalysisResult | null;
  correlationMatrix?: SubsystemCorrelationMatrixData;
  divergenceOrigin?: DivergenceOriginAnalysis;
  // Global Subsystem High-Frequency Sync Mode
  globalSubsystemSync: boolean;
  globalSubsystemSyncMode: 'auto_divergence_boost' | 'forced_10ms' | 'standard_30fps';
  currentPollingIntervalMs: number;
  isDivergenceBoostActive: boolean;
  currentDri?: number;
  autoExportForensicAuditTriggered?: boolean;
}

export interface SubsystemHeartbeatPhase {
  subsystemId: SubsystemId;
  name: string;
  nominalFrequencyHz: number;
  currentPhaseDeg: number; // 0 to 360 degrees
  phaseOffsetMs: number; // e.g. -1.2 to +1.2 ms offset relative to master clock
  jitterMs: number; // microsecond temporal jitter
  status: 'locked' | 'marginal' | 'drift';
  lastBeatTime: number;
  clockCycles: number;
}

export interface SubsystemHeartbeatMetrics {
  kuramotoOrderParameter: number; // 0.0 - 1.0 (phase coherence index)
  maxPhaseSkewMs: number;
  jitterRmsMs: number;
  masterClockHz: number;
  isAutoRealignActive: boolean;
  phases: Record<SubsystemId, SubsystemHeartbeatPhase>;
}

// ==========================================
// Sparse Autoencoder (SAE) & Scaling Monosemanticity
// ==========================================

export type SAEFeatureCategory =
  | 'sensory'
  | 'rhythmic'
  | 'homeostatic'
  | 'recurrent'
  | 'runaway';

export interface SAEMonosemanticFeature {
  index: number;
  label: string;
  category: SAEFeatureCategory;
  activation: number; // 0.0 - 1.0+
  firingFrequency: number;
  isRunawayIndicator: boolean;
  isSteered: boolean;
  steerBias: number;
}

export interface SAEHomeostaticDampingVector {
  active: boolean;
  avalancheSeverity: number; // 0.0 - 1.0
  membraneHyperpolarizationMv: number; // negative mV injected (e.g. -14.5 mV)
  thresholdOffsetMv: number; // positive threshold elevation
  ltdMultiplier: number; // anti-Hebbian LTD scaling (e.g. 1.0 - 1.85)
  learningRateDampener: number; // LR dampening (e.g. 0.2 - 1.0)
  refractoryExtensionMs: number; // refractory penalty
  recommendedAction: string;
}

export interface SAESnapshot {
  timestamp: number;
  l0Count: number;
  l0Fraction: number; // e.g. 0.0625 = 6.25%
  targetL0Fraction: number; // 0.0625 (5-10% biological target)
  l1SparsitySum: number;
  reconMse: number;
  isRunaway: boolean;
  avalancheSeverity: number;
  runawayActivationSum: number;
  dominantFeatureIndex: number;
  dominantFeatureLabel: string;
  features: SAEMonosemanticFeature[];
  damping: SAEHomeostaticDampingVector;
  autoClampEnabled: boolean;
  totalInterventionsCount: number;
  lastInterventionTime: number;
  antiBleedActive?: boolean;
  bleedFilteredCount?: number;
}

// ============================================================================
// SynapticDriftGuard & Online Research Adapters Interfaces
// ============================================================================

export type SynapticClusterType =
  | 'sensory_afferent'
  | 'lateral_inhibitory'
  | 'associative_core'
  | 'motor_efferent'
  | 'rf_alpha'
  | 'rf_beta';

export interface SynapticClusterMetrics {
  clusterId: string;
  name: string;
  category: SynapticClusterType;
  synapseCount: number;
  meanWeight: number;
  totalWeight: number;
  driftVelocity: number; // 1st derivative dw/dt over 500ms window (normalized units / s)
  secondOrderDerivative: number; // 2nd derivative d²w/dt² over 500ms window (acceleration)
  isExceedingThreshold: boolean; // driftVelocity > 0.15 threshold over 500ms
  threshold: number; // 0.15
  windowMs: number; // 500
  stabilizationState: 'STABLE' | 'DRIFTING' | 'LTD_INJECTING' | 'RECOVERING';
  recentVelocities: number[];
  recentSecondDerivatives: number[];
  cumulativeLTDInjections: number;
  lastLTDInjectionTime: number;
  activeLTDMultiplier: number;
  peakVelocityRecorded: number;
  synapseIds: string[];
}

export type DriftSubsystemSource =
  | 'aer_bus'
  | 'stdp_engine'
  | 'membrane_integrator'
  | 'reflex_controller'
  | 'synaptic_bleed';

export interface DriftSpikeEvidence {
  metric: string;
  value: string;
  threshold: string;
  status: 'critical' | 'warning' | 'nominal';
}

export interface DriftSpikeTag {
  id: string;
  timestamp: number;
  timelineIndex: number; // 0-59 representing second index in the 60s rolling window
  relativeSeconds: number; // e.g. -18s relative to now
  driValue: number; // e.g. 38.4%
  driftVelocity: number; // e.g. 0.22
  secondOrderDerivative: number; // e.g. 0.14
  primarySubsystem: DriftSubsystemSource;
  subsystemLabel: string; // e.g. "AER Bus Saturation" or "STDP Runaway"
  subsystemTagCode: string; // "AER", "STDP", "MEM", "RFLX", "BLEED"
  confidence: number; // 0.80 - 0.99
  clusterName?: string;
  evidence: DriftSpikeEvidence[];
  postMortemSummary: string;
  remediationSuggestion: string;
}

export interface LTDInjectionEvent {
  id: string;
  timestamp: number;
  clusterId: string;
  clusterName: string;
  driftVelocity: number;
  secondOrderDerivative: number;
  injectionMagnitude: number; // Delta depression applied (e.g. -0.12)
  ltdMultiplierApplied: number; // Temporary LTD scaling factor (e.g. 1.65x)
  synapsesAffected: number;
  triggerReason: string;
  stabilizedVelocityAfter: number;
  resolved: boolean;
  // Auto-Tag Subsystem Source fields for post-mortem analysis
  primarySubsystem?: DriftSubsystemSource;
  subsystemLabel?: string;
  subsystemTagCode?: string;
  confidence?: number;
  telemetryEvidence?: DriftSpikeEvidence[];
  postMortemSummary?: string;
  remediationSuggestion?: string;
}

export interface NeuralPathwayAuditItem {
  id: string;
  preId: number;
  postId: number;
  preLabel: string;
  postLabel: string;
  weight: number;
  status: 'FUNCTIONAL' | 'ZERO_WEIGHT' | 'DORMANT' | 'LEAKING_BLEED';
  leakMagnitude?: number;
  layer: 'afferent' | 'recurrent' | 'efferent';
  remedyAction?: string;
}

export interface NeuralPathwayAuditReport {
  timestamp: number;
  totalPathwaysScanned: number;
  functionalCount: number;
  zeroWeightCount: number;
  dormantCount: number;
  leakyCount: number;
  synapticBleedIndex: number; // 0 - 100%
  leakagePowerWasteMw: number;
  hasLeakageOrBleed: boolean;
  auditStatus: 'OPTIMAL' | 'LEAKAGE_DETECTED' | 'CRITICAL_BLEED' | 'CLEANED';
  findings: string[];
  pathways: NeuralPathwayAuditItem[];
  cleanupTriggered: boolean;
  cleanupDetails?: {
    pathwaysPrunedOrReset: number;
    weightsReCentered: number;
    driBefore: number;
    driAfter: number;
    powerSavedMw: number;
    summary: string;
  };
}

export interface SynapticDriftGuardSnapshot {
  timestamp: number;
  enabled: boolean;
  velocityThreshold: number; // 0.15
  windowMs: number; // 500
  clusters: Record<string, SynapticClusterMetrics>;
  recentEvents: LTDInjectionEvent[];
  totalInjectionsCount: number;
  isAnyClusterExceeding: boolean;
  maxDriftVelocity: number;
  maxSecondDerivative: number;
  fastestDriftingCluster: string;
  ltdInjectionCooldownMs: number;
  autoStabilizationActive: boolean;
  driftRiskIndex: number; // 0 - 100% composite Drift Risk Index (DRI) based on max drift velocity & acceleration
  isDriSafe: boolean; // True if DRI is below safe threshold (< 50% / < 0.15 velocity)
  pathwayLeakageDetected?: boolean;
  synapticBleedIndex?: number;
  lastPathwayAudit?: NeuralPathwayAuditReport;
}

// ============================================================================
// Adaptive Power Gating & Sub-5mW Thermal Envelope Regulation
// ============================================================================

export type PowerGatingMode = 'auto' | 'aggressive' | 'conservative';

export interface SynapticClusterPowerState {
  clusterId: string;
  name: string;
  category: SynapticClusterType;
  isEssential: boolean; // true for sensory_afferent, associative_core, motor_efferent
  isPowerGated: boolean;
  staticBiasPowerMw: number; // e.g. 0.52 mW
  synapseCount: number;
  activityLevelHz: number;
}

export interface AdaptivePowerGatingSnapshot {
  enabled: boolean;
  mode: PowerGatingMode;
  activityThresholdHz: number;
  currentFiringHz: number;
  isPowerGated: boolean;
  gatedClusterCount: number;
  totalClustersCount: number;
  ungatedEstimatedPowerMw: number;
  currentActualPowerMw: number;
  powerSavingsMw: number;
  powerReductionPct: number;
  thermalMarginUnder5mWMw: number;
  wakeLatencyMs: number;
  dutyCycleGatedPct: number;
  clusters: SynapticClusterPowerState[];
  statusText: string;
}

export interface OnlineResearchSource {
  title: string;
  uri: string;
  snippet?: string;
}

export interface OnlineResearchStructuralParams {
  aPlus: number;
  aMinus: number;
  learningRate: number;
  turnGain: number;
  proximityGain: number;
  antiHebbianPenalty: number;
  targetFiringRateHz?: number;
  biologicalJustification?: string;
}

export interface OnlineResearchResult {
  query: string;
  timestamp: number;
  summary: string;
  keyFindings: string[];
  recommendedParameters?: {
    suggestedLTDMultiplier?: number;
    recommendedDriftThreshold?: number;
    homeostaticWindowMs?: number;
    dampingCurve?: string;
  };
  structuralParameters?: OnlineResearchStructuralParams;
  sources: OnlineResearchSource[];
  toolUsed: string;
  grounded: boolean;
  model: string;
  breachedClusterName?: string;
  divergenceVelocity?: number;
  divergenceAcceleration?: number;
  isAutoTriggered?: boolean;
  appliedToEngine?: boolean;
  informedModelTimestamp?: number;
}

export interface OnlineToolAdapter {
  id: string;
  name: string;
  category: 'stabilization' | 'calibration' | 'research' | 'diagnostics';
  description: string;
  parameters: Record<string, { type: string; description: string; default?: any }>;
  lastExecuted?: number;
}

export interface OnlineToolExecutionResult {
  toolId: string;
  timestamp: number;
  success: boolean;
  output: any;
  message: string;
}

// ============================================================================
// NovaVault Media Studio (Autonomous 3D YouTube Shorts Agency) Interfaces
// ============================================================================

export type NovaVaultAgentRole = 'CEO' | 'Marketer' | 'Engineer' | 'Animator' | 'SoundDesigner';

export interface NovaVaultAgent {
  name: string;
  role: NovaVaultAgentRole;
  reports_to: string;
  runtime: 'HTTP' | 'Bash';
  endpoint?: string;
  command?: string;
  monthly_budget_usd: number;
  job_description: string;
  status: 'IDLE' | 'ACTIVE' | 'PROCESSING' | 'ERROR';
  lastHeartbeat: number;
  ticketsProcessed: number;
  polyvagal: 'ventral' | 'sympathetic' | 'dorsal_low' | 'neutral';
}

export interface NovaVaultGovernance {
  require_human_approval_for_hires: boolean;
  auto_stop_on_budget_limit: boolean;
  current_spend_usd: number;
  max_budget_usd: number;
  totalTicketsCreated: number;
  totalShortsPublished: number;
}

export interface NovaVaultTopicTicket {
  id: string;
  title: string;
  concept: string;
  targetAudience: string;
  viralHook: string;
  status: 'SCOUTED' | 'PRODUCING' | 'RENDERED' | 'QUEUED';
  assignedTo: string;
  createdAt: number;
  completedAt?: number;
  oppositesPair: [string, string];
}

export interface SparkDialogueStep {
  id: string;
  timestamp: number;
  tick: number;
  sender: string;
  receiver: string;
  stepType: 'TICKET_DISPATCH' | 'SCOUT_RETURN' | 'SCENE_GEN' | 'METADATA_OPTIMIZE' | 'HEARTBEAT' | 'HIRE_PROPOSAL';
  message: string;
  polyvagalState: string;
  valenceDelta: number;
  metadata?: Record<string, any>;
}

export interface AnimatedShortScene {
  id: string;
  timestampStart: number;
  timestampEnd: number;
  title: string;
  narration: string;
  kineticCaptions: string[];
  characterA_Action: 'idle_bob' | 'giant_stomp' | 'squash_jump' | 'surprised_look' | 'high_five' | 'celebrate_spin';
  characterB_Action: 'micro_flutter' | 'speed_dash' | 'tremble' | 'rocket_leap' | 'side_bounce' | 'wave_hands';
  cameraMode: 'hook_close' | 'wide_stage' | 'split_comparison' | 'hero_low';
  sfxCue: 'boing' | 'stomp_rumble' | 'whoosh' | 'fanfare' | 'sparkle';
  environmentTheme: 'lava_and_ice' | 'micro_macro' | 'cartoon_meadow' | 'neon_circus';
}

export interface AnimatedShortProject {
  id: string;
  title: string;
  topic: string;
  targetDurationSec: number;
  scenes: AnimatedShortScene[];
  youtubeMetadata: {
    title: string;
    description: string;
    hashtags: string[];
    tags: string[];
    retentionHook: string;
    thumbnailPrompt: string;
    ctrPrediction: string;
  };
  zeroCostScore: string;
  createdAt: number;
}

export interface CandidateAgentHire {
  id: string;
  name: string;
  role: NovaVaultAgentRole;
  reports_to: string;
  runtime: 'HTTP' | 'Bash';
  commandOrEndpoint: string;
  monthly_budget_usd: number;
  job_description: string;
  reason: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  proposedAt: number;
}

// ============================================================================
// Gemini Argon: Neuromorphic Robotics & Helping Hand
// ============================================================================

export interface RoboticJointAngles {
  baseRotation: number;    // -180 to +180 deg (horizontal azimuth)
  shoulderPitch: number;   // -45 to +90 deg
  elbowFlexion: number;    // 0 to 135 deg
  wristPitch: number;      // -90 to +90 deg
  wristRoll: number;       // -180 to +180 deg
  // 5 Articulated Finger Flexions (0.0 = fully open, 1.0 = fully clenched)
  thumbCurl: number;
  indexCurl: number;
  middleCurl: number;
  ringCurl: number;
  pinkyCurl: number;
  // Grip & compliance
  graspTension: number;    // 0.0 to 1.0
  compliance: number;      // 0.0 to 1.0 (adaptive spring dampening)
}

export interface TactileSensorFeedback {
  padId: 'thumb' | 'index' | 'middle' | 'ring' | 'pinky' | 'palm';
  pressure: number;        // 0.0 to 1.0 normalized contact force
  contactDetected: boolean;
  rawMv: number;           // sensor millivolts
  temperatureC: number;
}

export interface MotorEfferentChannel {
  neuronId: number;        // e.g. 16, 17, 18, 19
  label: string;           // 'O16: Base/Shoulder', 'O17: Elbow/Wrist', 'O18: Finger Grip', 'O19: Compliance'
  firingRateHz: number;
  currentTorqueNm: number;
  maxTorqueNm: number;
  temperature: number;
  status: 'NOMINAL' | 'HIGH_LOAD' | 'LTD_GUARDED';
}

export interface ArgonTrajectoryStep {
  stepIndex: number;
  phaseName: string;
  durationMs: number;
  targetJoints: Partial<RoboticJointAngles>;
  expectedTactileForce: number;
  explanation: string;
}

export interface ArgonTaskPlan {
  id: string;
  goal: string;
  presetId?: string;
  status: 'READY' | 'EXECUTING' | 'COMPLETED' | 'HALTED';
  trajectory: ArgonTrajectoryStep[];
  currentStepIndex: number;
  geminiModel: string;
  reasoning: string;
  safetyMarginScore: number;
  maxAllowableTorqueNm: number;
  sensorimotorFeedbackActive: boolean;
}

export interface ArgonRoboticsTelemetrySnapshot {
  timestamp: number;
  jointAngles: RoboticJointAngles;
  motorChannels: MotorEfferentChannel[];
  tactileSensors: TactileSensorFeedback[];
  closedLoopFeedbackActive: boolean;
  motorBias: number;
  motorDriftVelocity: number;
  isLTDGuarded: boolean;
  currentGripObject: 'none' | 'sensor_probe' | 'fragile_glass' | 'microchip' | 'handshake_marker';
  activeTask?: ArgonTaskPlan;
}

// ============================================================================
// SynapseEdge Watchdog Architecture & First Test Set
// ============================================================================

export type WatchdogBlockCategory =
  | 'watchdog_edit'
  | 'loosen_guardrail'
  | 'permissions_expansion'
  | 'audit_tampering'
  | 'skip_tests'
  | 'unreadable_code'
  | 'adversarial_claim'
  | 'buried_payload';

export type WatchdogDecision = 'APPROVE' | 'BLOCK' | 'ESCALATE';

export interface WatchdogTestCase {
  id: string;
  category: string;
  categoryKey: WatchdogBlockCategory;
  set: 'tuned' | 'held-out' | 'sealed';
  type: 'risky' | 'safe';
  change: string;
  expectedResult: 'Caught' | 'Approved' | 'False alarm' | 'Missed';
  explanation?: string;
  actualDecision?: WatchdogDecision;
  actualResult?: 'Caught' | 'Approved' | 'False alarm' | 'Missed' | 'Escalated';
  inputHash: string;
  passed?: boolean;
}

export interface WatchdogCategoryStats {
  category: string;
  total: number;
  risky: number;
  safe: number;
  caught: number;
  missed: number;
  falseAlarms: number;
  approved: number;
  escalated: number;
  catchRatePct: number;
}

export interface WatchdogEvaluationResult {
  runId: string;
  timestamp: number;
  suiteType: 'prototype_42' | 'sealed_147' | 'custom_dynamic';
  benchmarkHash: string;
  ruleVersion: 'first_version' | 'improved_rules';
  totalCases: number;
  riskyCount: number;
  safeCount: number;
  caughtRiskyCount: number;
  missedRiskyCount: number;
  falseAlarmsCount: number;
  approvedSafeCount: number;
  escalatedCount: number;
  catchRatePct: number;
  falseAlarmRatePct: number;
  escalationRatePct: number;
  tunedCatchRatePct: number;
  heldOutCatchRatePct: number;
  generalizationGapPct: number;
  categoryBreakdown: Record<string, WatchdogCategoryStats>;
  executionTimeMs: number;
  cases: WatchdogTestCase[];
  unprotectedBaselineCaughtPct: number; // Without watchdog = 0% caught
}

export interface WatchdogProposalDecision {
  id: string;
  timestamp: number;
  inputHash: string;
  changeText: string;
  decision: WatchdogDecision;
  primaryCategory?: WatchdogBlockCategory;
  reason: string;
  evaluatorVerdict: 'ALLOW' | 'REJECT' | 'AMBIGUOUS';
  reviewerVerdict: 'ALLOW' | 'REJECT' | 'AMBIGUOUS';
  disagreement: boolean;
  simulatedSandbox: {
    executed: boolean;
    risksDetected: string[];
    snapshotCreated: boolean;
    snapshotHash: string;
  };
  rulesTriggered: string[];
  modelReviewUsed?: string;
  latencyMs: number;
}

// ============================================================================
// Pathway Leak Heatmap & Isolation Drill-Down Interfaces
// ============================================================================

export type PathwayLeakSeverity = 'nominal' | 'moderate' | 'critical';

export interface SynapticPathwayLeak {
  synapseId: string;
  preId: number;
  postId: number;
  preLabel: string;
  postLabel: string;
  weight: number;
  initialWeight: number;
  leakMagnitude: number; // 0.000 to 1.000+
  aerCongestionFactor: number; // 0.0 to 1.0 contribution from AER bus traffic on this node
  severity: PathwayLeakSeverity;
  leakType: 'cross_talk_bleed' | 'weight_saturation' | 'subthreshold_float' | 'aer_packet_spill' | 'nominal';
  powerDrainMw: number;
  layer: 'afferent' | 'recurrent' | 'efferent';
}

export interface NodeIsolationSummary {
  neuronId: number;
  neuronLabel: string;
  layer: 'sensory' | 'inter' | 'motor';
  upstreamSynapses: SynapticPathwayLeak[];
  downstreamSynapses: SynapticPathwayLeak[];
  totalNodeLeakMagnitude: number;
  leakyConnectionsCount: number;
  maxSeverity: PathwayLeakSeverity;
  powerWasteMw: number;
}

export interface PathwayLeakHeatmapSnapshot {
  timestamp: number;
  totalSynapses: number;
  nominalCount: number;
  moderateLeakCount: number;
  criticalLeakCount: number;
  totalLeakMagnitude: number;
  aerBusLeakContribution: number;
  totalLeakPowerMw: number;
  synapseLeaks: Record<string, SynapticPathwayLeak>;
  nodeLeakSeverities: Record<number, {
    severity: PathwayLeakSeverity;
    leakScore: number;
    leakyConnections: number;
  }>;
}

// ============================================================================
// Watchdog Integrity Test Suite, Mutation Fuzzer & Logic Flow Auditor
// ============================================================================

export type PoisonedVectorCategory =
  | 'biological_runaway'
  | 'threshold_corruption'
  | 'security_exploit'
  | 'prompt_injection'
  | 'audit_tampering'
  | 'watchdog_self_edit';

export interface PoisonedTestVector {
  id: string;
  name: string;
  category: PoisonedVectorCategory;
  targetModule: string;
  poisonedProposalText: string;
  poisonedDiff: string;
  maliciousIntent: string;
  expectedDecision: 'BLOCK' | 'ESCALATE';
  expectedRuleMatch: string;
}

export interface IntegrityTestVectorResult {
  vector: PoisonedTestVector;
  decision: WatchdogProposalDecision;
  passed: boolean;
  interceptedAtStage: 'Safeguard-0-Barrier' | 'Ghost-Protocol-Evaluator' | 'Blind-Reviewer-Rubric' | 'Constitutional-Gate';
}

export interface WatchdogIntegritySuiteResult {
  runId: string;
  timestamp: number;
  totalVectors: number;
  interceptedCount: number;
  breachedCount: number;
  interceptRatePct: number;
  avgLatencyMs: number;
  results: IntegrityTestVectorResult[];
}

export interface FuzzedMutationCandidate {
  id: string;
  iteration: number;
  timestamp: number;
  mutationType: 'synaptic_weight_perm' | 'stdp_kinetics' | 'membrane_tau_leak' | 'drift_ceiling_shift' | 'hidden_backdoor_perm';
  targetParameter: string;
  baselineValue: string;
  mutatedValue: string;
  perturbationPct: number;
  isStructurallyValid: boolean;
  isLatentBugOrRisky: boolean;
  proposalTitle: string;
  diffSnippet: string;
  decision: WatchdogProposalDecision;
  correctlyHandled: boolean;
}

export type ProposalFlowStatus =
  | 'Simulation-Pending'
  | 'Ghost-Protocol-Passed'
  | 'Rejected-By-Gate'
  | 'Escalated-To-Supervisor'
  | 'Committed-To-Codebase';

export interface LogicFlowAuditEntry {
  id: string;
  timestamp: number;
  source: 'Model-Builder-Bridge' | 'Integrity-Test-Suite' | 'Mutation-Fuzzer' | 'Manual-Probe' | 'Auto-RSI-Loop';
  proposalTitle: string;
  targetModule: string;
  inputHash: string;
  status: ProposalFlowStatus;
  ghostProtocolSimulated: boolean;
  ghostProtocolPassed: boolean;
  sandboxRisksDetected: string[];
  evaluatorVerdict: 'ALLOW' | 'REJECT' | 'AMBIGUOUS';
  reviewerVerdict: 'ALLOW' | 'REJECT' | 'AMBIGUOUS';
  finalDecision: WatchdogDecision;
  primaryCategory?: WatchdogBlockCategory;
  rulesTriggered: string[];
  latencyMs: number;
}

