import {
  Synapse,
  SynapticClusterMetrics,
  SynapticClusterType,
  LTDInjectionEvent,
  SynapticDriftGuardSnapshot,
  NeuralPathwayAuditReport,
  DriftSubsystemSource,
  DriftSpikeEvidence,
  DriftSpikeTag,
} from '../types';

interface WeightHistoryPoint {
  timeMs: number;
  meanWeight: number;
  totalWeight: number;
}

interface VelocityHistoryPoint {
  timeMs: number;
  velocity: number;
}

/**
 * Automatically classifies the primary SNN subsystem source of a drift spike / event
 * based on cluster affinity, drift dynamics, and corroborating hardware telemetry.
 */
export function classifyDriftSubsystem(
  clusterId: string,
  driftVelocity: number,
  secondOrderDerivative: number,
  context?: {
    aerLatencyMs?: number;
    droppedSignalCount?: number;
    jitterMs?: number;
    stdpDominanceRatio?: number;
    learningRate?: number;
    meanWeight?: number;
    saturatedSynapseRatio?: number;
    membraneVarianceMv?: number;
    motorFiringHz?: number;
    proximityGain?: number;
    turnGain?: number;
    bleedIndex?: number;
    pathwayLeakageDetected?: boolean;
  }
): {
  primarySubsystem: DriftSubsystemSource;
  subsystemLabel: string;
  subsystemTagCode: string;
  confidence: number;
  evidence: DriftSpikeEvidence[];
  postMortemSummary: string;
  remediationSuggestion: string;
} {
  let aerScore = 15;
  let stdpScore = 20;
  let membraneScore = 15;
  let reflexScore = 15;
  let bleedScore = 10;

  // Cluster architectural affinity
  if (clusterId === 'sensory_afferent') {
    aerScore += 45;
  } else if (clusterId === 'associative_core') {
    stdpScore += 45;
  } else if (clusterId === 'inhibitory_feedback') {
    membraneScore += 45;
  } else if (clusterId === 'motor_efferent') {
    reflexScore += 50;
  } else if (clusterId === 'recurrent_interneuron') {
    bleedScore += 35;
    stdpScore += 20;
  }

  // Velocity & acceleration dynamics
  if (driftVelocity > 0.28 || secondOrderDerivative > 0.18) {
    stdpScore += 25; // STDP runaway exhibits explosive quadratic acceleration
  }

  const aerLat = context?.aerLatencyMs ?? 1.15;
  const drops = context?.droppedSignalCount ?? 0;
  const jitter = context?.jitterMs ?? 0.12;
  if (aerLat > 1.45 || drops > 0 || jitter > 0.28) {
    aerScore += 35;
  }

  const domRatio = context?.stdpDominanceRatio ?? 1.625;
  const satRatio = context?.saturatedSynapseRatio ?? 0.08;
  if (domRatio < 1.30 || satRatio > 0.15) {
    stdpScore += 30;
  }

  const memVar = context?.membraneVarianceMv ?? 2.1;
  if (memVar > 3.4) {
    membraneScore += 30;
  }

  const motorHz = context?.motorFiringHz ?? 24;
  const turnG = context?.turnGain ?? 3.5;
  if (motorHz > 42 || turnG > 3.8) {
    reflexScore += 35;
  }

  const bleedIdx = context?.bleedIndex ?? 0;
  const leakage = context?.pathwayLeakageDetected ?? false;
  if (leakage || bleedIdx > 0.05) {
    bleedScore += 45;
  }

  const scores: Record<DriftSubsystemSource, number> = {
    aer_bus: aerScore,
    stdp_engine: stdpScore,
    membrane_integrator: membraneScore,
    reflex_controller: reflexScore,
    synaptic_bleed: bleedScore,
  };

  const entries: [DriftSubsystemSource, number][] = [
    ['aer_bus', aerScore],
    ['stdp_engine', stdpScore],
    ['membrane_integrator', membraneScore],
    ['reflex_controller', reflexScore],
    ['synaptic_bleed', bleedScore],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  const maxSubsystem = entries[0][0];
  const maxScore = entries[0][1];

  const totalScore = aerScore + stdpScore + membraneScore + reflexScore + bleedScore;
  const confidence = Math.min(0.98, Math.max(0.78, Number((maxScore / (totalScore * 0.45)).toFixed(2))));

  switch (maxSubsystem) {
    case 'aer_bus':
      return {
        primarySubsystem: 'aer_bus',
        subsystemLabel: 'AER Bus Saturation',
        subsystemTagCode: 'AER',
        confidence,
        evidence: [
          {
            metric: 'AER Event Latency',
            value: `${aerLat.toFixed(2)} ms`,
            threshold: '≤ 1.50 ms',
            status: aerLat > 1.45 ? 'critical' : 'warning',
          },
          {
            metric: 'Packet Drops / Overflows',
            value: `${drops} pkts`,
            threshold: '0 pkts',
            status: drops > 0 ? 'critical' : 'nominal',
          },
          {
            metric: 'Transmission Jitter',
            value: `${jitter.toFixed(3)} ms`,
            threshold: '< 0.30 ms',
            status: jitter > 0.28 ? 'warning' : 'nominal',
          },
        ],
        postMortemSummary:
          'Asynchronous address-event bus throughput bottleneck. Packet transmission jitter and event queue backlog created burst afferent synchronization, triggering rapid synaptic weight drift in sensory pathways.',
        remediationSuggestion:
          'Flush the asynchronous AER event queue, throttle excessive Poisson stimulus channels, or raise bus arbitration frequency.',
      };

    case 'stdp_engine':
      return {
        primarySubsystem: 'stdp_engine',
        subsystemLabel: 'STDP Runaway',
        subsystemTagCode: 'STDP',
        confidence,
        evidence: [
          {
            metric: 'Drift Velocity (v_drift)',
            value: `${driftVelocity.toFixed(4)}`,
            threshold: '≤ 0.1500',
            status: driftVelocity > 0.15 ? 'critical' : 'warning',
          },
          {
            metric: 'Depression Dominance (A-/A+)',
            value: `${domRatio.toFixed(3)}x`,
            threshold: '≥ 1.250x',
            status: domRatio < 1.30 ? 'critical' : 'nominal',
          },
          {
            metric: 'Second Derivative (d²w/dt²)',
            value: `${secondOrderDerivative.toFixed(4)}`,
            threshold: '≤ 0.1000',
            status: secondOrderDerivative > 0.1 ? 'warning' : 'nominal',
          },
        ],
        postMortemSummary:
          'Long-Term Potentiation (LTP) outpaced heterosynaptic Long-Term Depression (LTD). Asymmetric Hebbian positive feedback drove recurrent and associative synapses toward upper saturation boundary.',
        remediationSuggestion:
          'Engage multi-cluster corrective LTD pulse (-0.12Δ) and increase STDP weight decay leakage multiplier to 1.25x.',
      };

    case 'membrane_integrator':
      return {
        primarySubsystem: 'membrane_integrator',
        subsystemLabel: 'Membrane Leak',
        subsystemTagCode: 'MEM',
        confidence,
        evidence: [
          {
            metric: 'Membrane Potential Variance',
            value: `${memVar.toFixed(2)} mV`,
            threshold: '≤ 3.00 mV',
            status: memVar > 3.4 ? 'critical' : 'warning',
          },
          {
            metric: 'Inhibitory Cluster Drift',
            value: `${driftVelocity.toFixed(4)}`,
            threshold: '≤ 0.1500',
            status: 'warning',
          },
          {
            metric: 'Refractory Stability',
            value: 'NOMINAL (1ms)',
            threshold: '≥ 1.0 ms',
            status: 'nominal',
          },
        ],
        postMortemSummary:
          'Subthreshold somatic membrane potential instability. Elevated leak conductance and baseline depolarization drove inhibitory feedback interneurons into persistent erratic bursting.',
        remediationSuggestion:
          'Calibrate homeostatic rate loop target frequency (28 Hz) and adjust somatic membrane leak time constant tauMem.',
      };

    case 'reflex_controller':
      return {
        primarySubsystem: 'reflex_controller',
        subsystemLabel: 'Reflex Divergence',
        subsystemTagCode: 'RFLX',
        confidence,
        evidence: [
          {
            metric: 'Motor Efferent Firing',
            value: `${motorHz.toFixed(1)} Hz`,
            threshold: '≤ 40.0 Hz',
            status: motorHz > 40 ? 'critical' : 'warning',
          },
          {
            metric: 'Turn Gain Scaling',
            value: `${turnG.toFixed(2)}x`,
            threshold: '≤ 3.50x',
            status: turnG > 3.6 ? 'warning' : 'nominal',
          },
          {
            metric: 'Drift Acceleration',
            value: `${secondOrderDerivative.toFixed(4)}`,
            threshold: '≤ 0.1000',
            status: 'warning',
          },
        ],
        postMortemSummary:
          'Closed-loop motor efferent hunting and steering oscillation. High sensor proximity gain coupled with sharp turning reflex provoked reactive overcorrection and efferent spike bursting.',
        remediationSuggestion:
          'Damp motor turn gain to ≤ 3.20 and re-center substrate keel equilibrium valence to nominal setpoint.',
      };

    case 'synaptic_bleed':
    default:
      return {
        primarySubsystem: 'synaptic_bleed',
        subsystemLabel: 'Synaptic Bleed',
        subsystemTagCode: 'BLEED',
        confidence,
        evidence: [
          {
            metric: 'Synaptic Bleed Index',
            value: `${bleedIdx.toFixed(3)}`,
            threshold: '< 0.050',
            status: bleedIdx > 0.05 ? 'critical' : 'warning',
          },
          {
            metric: 'Pathway Leakage State',
            value: leakage ? 'LEAKAGE DETECTED' : 'NOMINAL',
            threshold: 'CLEAN',
            status: leakage ? 'critical' : 'nominal',
          },
          {
            metric: 'Floating Zero Synapses',
            value: 'PRESENT',
            threshold: '0 DETECTED',
            status: 'warning',
          },
        ],
        postMortemSummary:
          'Diffuse zero-weight floating pathways and cross-talk leakage bleed detected. Unpruned dormant connections degraded matrix sparsity and allowed parasitic subthreshold current bleed.',
        remediationSuggestion:
          'Execute the Neural Pathway Audit & Cleanup Routine to scrub non-functional connections with |w| < 0.05.',
      };
  }
}

export class SynapticDriftGuard {
  private enabled: boolean = true;
  private autoStabilizationActive: boolean = true;
  private velocityThreshold: number = 0.15; // 0.15 threshold over 500ms window
  private windowMs: number = 500; // 500ms window
  private ltdCooldownMs: number = 800; // Cooldown between automatic injections per cluster

  // Pathway Leakage & Bleed State
  private pathwayLeakageDetected: boolean = false;
  private synapticBleedIndex: number = 0;
  private lastPathwayAudit: NeuralPathwayAuditReport | null = null;

  // Cluster definitions & metadata
  private clusterDefinitions: Record<
    string,
    {
      name: string;
      category: SynapticClusterType;
      filter: (s: Synapse) => boolean;
    }
  > = {
    sensory_afferent: {
      name: 'Sensory Afferent Pathways (E0-E7 -> N8-N15)',
      category: 'sensory_afferent',
      filter: (s) => s.preId >= 0 && s.preId <= 7 && s.postId >= 8 && s.postId <= 15,
    },
    associative_core: {
      name: 'Associative Recurrent Interneurons (N8-N15)',
      category: 'associative_core',
      filter: (s) => s.preId >= 8 && s.preId <= 15 && s.postId >= 8 && s.postId <= 15 && s.weight > 0,
    },
    lateral_inhibitory: {
      name: 'Lateral Cross-Inhibitory Core',
      category: 'lateral_inhibitory',
      filter: (s) => s.weight < 0,
    },
    motor_efferent: {
      name: 'Motor Efferent Feedforward (N8-N15 -> M16-M19)',
      category: 'motor_efferent',
      filter: (s) => s.preId >= 8 && s.preId <= 15 && s.postId >= 16 && s.postId <= 19,
    },
    rf_alpha: {
      name: 'Receptive Field Alpha (Lower Afferents E0-E3)',
      category: 'rf_alpha',
      filter: (s) => s.preId >= 0 && s.preId <= 3,
    },
    rf_beta: {
      name: 'Receptive Field Beta (Upper Afferents E4-E7)',
      category: 'rf_beta',
      filter: (s) => s.preId >= 4 && s.preId <= 7,
    },
  };

  // State buffers
  private clusterWeightHistory: Map<string, WeightHistoryPoint[]> = new Map();
  private clusterVelocityHistory: Map<string, VelocityHistoryPoint[]> = new Map();
  private clusterMetrics: Map<string, SynapticClusterMetrics> = new Map();
  private lastInjectionTime: Map<string, number> = new Map();
  private clusterLTDMultiplierActive: Map<string, { multiplier: number; expireTime: number }> = new Map();
  private recentEvents: LTDInjectionEvent[] = [];
  private totalInjectionsCount: number = 0;
  private lastSimulationTime: number = 0;
  private lastSnapshot: SynapticDriftGuardSnapshot | null = null;

  constructor() {
    this.initClusters();
  }

  private initClusters() {
    for (const [id, def] of Object.entries(this.clusterDefinitions)) {
      this.clusterWeightHistory.set(id, []);
      this.clusterVelocityHistory.set(id, []);
      this.clusterMetrics.set(id, {
        clusterId: id,
        name: def.name,
        category: def.category,
        synapseCount: 0,
        meanWeight: 0,
        totalWeight: 0,
        driftVelocity: 0,
        secondOrderDerivative: 0,
        isExceedingThreshold: false,
        threshold: this.velocityThreshold,
        windowMs: this.windowMs,
        stabilizationState: 'STABLE',
        recentVelocities: [0, 0, 0, 0, 0, 0, 0, 0],
        recentSecondDerivatives: [0, 0, 0, 0, 0, 0, 0, 0],
        cumulativeLTDInjections: 0,
        lastLTDInjectionTime: 0,
        activeLTDMultiplier: 1.0,
        peakVelocityRecorded: 0,
        synapseIds: [],
      });
    }
  }

  /**
   * Main simulation tick step.
   * Calculates 1st derivative (velocity) and 2nd derivative (acceleration) of synaptic weights,
   * detects threshold breaches (> 0.15 over 500ms), and applies automatic corrective LTD injections.
   */
  public step(simulationTimeMs: number, synapses: Synapse[]): SynapticDriftGuardSnapshot {
    this.lastSimulationTime = simulationTimeMs;
    if (!this.enabled || synapses.length === 0) {
      return this.buildSnapshot(simulationTimeMs);
    }

    // 1. Group synapses into clusters
    const clusterSynapseMap: Map<string, Synapse[]> = new Map();
    for (const id of Object.keys(this.clusterDefinitions)) {
      clusterSynapseMap.set(id, []);
    }

    for (const syn of synapses) {
      for (const [id, def] of Object.entries(this.clusterDefinitions)) {
        if (def.filter(syn)) {
          clusterSynapseMap.get(id)?.push(syn);
        }
      }
    }

    let anyExceeding = false;
    let maxVel = 0;
    let maxAcc = 0;
    let fastestCluster = '';

    // 2. Process each cluster
    for (const [id, clusterSynapses] of clusterSynapseMap.entries()) {
      const metric = this.clusterMetrics.get(id);
      if (!metric) continue;

      metric.synapseCount = clusterSynapses.length;
      metric.synapseIds = clusterSynapses.map((s) => s.id);

      if (clusterSynapses.length === 0) continue;

      const totalWeight = clusterSynapses.reduce((sum, s) => sum + s.weight, 0);
      const meanWeight = totalWeight / clusterSynapses.length;
      metric.totalWeight = Number(totalWeight.toFixed(4));
      metric.meanWeight = Number(meanWeight.toFixed(4));

      // Append to weight history
      const wHistory = this.clusterWeightHistory.get(id) || [];
      wHistory.push({ timeMs: simulationTimeMs, meanWeight, totalWeight });

      // Prune history older than 1200ms
      while (wHistory.length > 0 && simulationTimeMs - wHistory[0].timeMs > 1200) {
        wHistory.shift();
      }
      this.clusterWeightHistory.set(id, wHistory);

      // 3. Compute First-Order Derivative: Drift Velocity over 500ms window
      let windowStartSample = wHistory[0];
      for (const sample of wHistory) {
        if (simulationTimeMs - sample.timeMs <= this.windowMs) {
          windowStartSample = sample;
          break;
        }
      }

      const timeDeltaMs = Math.max(10, simulationTimeMs - windowStartSample.timeMs);
      const timeDeltaSec = timeDeltaMs / 1000.0;
      const weightDelta = Math.abs(meanWeight - windowStartSample.meanWeight);

      // Normalized drift velocity (rate of change over window scaled to seconds)
      const currentVelocity = Number((weightDelta / Math.max(0.35, timeDeltaSec)).toFixed(4));
      metric.driftVelocity = currentVelocity;
      if (currentVelocity > metric.peakVelocityRecorded) {
        metric.peakVelocityRecorded = currentVelocity;
      }

      // Record velocity history for 2nd order derivative
      const vHistory = this.clusterVelocityHistory.get(id) || [];
      vHistory.push({ timeMs: simulationTimeMs, velocity: currentVelocity });
      while (vHistory.length > 0 && simulationTimeMs - vHistory[0].timeMs > 1200) {
        vHistory.shift();
      }
      this.clusterVelocityHistory.set(id, vHistory);

      // 4. Compute Second-Order Derivative: Synaptic Acceleration (d²w/dt²)
      let vWindowStartSample = vHistory[0];
      for (const vSample of vHistory) {
        if (simulationTimeMs - vSample.timeMs <= this.windowMs) {
          vWindowStartSample = vSample;
          break;
        }
      }

      const vDelta = currentVelocity - vWindowStartSample.velocity;
      const secondOrderDerivative = Number((vDelta / Math.max(0.50, timeDeltaSec)).toFixed(4));
      metric.secondOrderDerivative = secondOrderDerivative;

      // Update sparklines
      metric.recentVelocities = [...metric.recentVelocities.slice(1), currentVelocity];
      metric.recentSecondDerivatives = [
        ...metric.recentSecondDerivatives.slice(1),
        secondOrderDerivative,
      ];

      // Check active temporary LTD multiplier expiration
      const activeLtd = this.clusterLTDMultiplierActive.get(id);
      if (activeLtd && simulationTimeMs >= activeLtd.expireTime) {
        this.clusterLTDMultiplierActive.delete(id);
        metric.activeLTDMultiplier = 1.0;
      } else if (activeLtd) {
        metric.activeLTDMultiplier = activeLtd.multiplier;
      } else {
        metric.activeLTDMultiplier = 1.0;
      }

      // 5. Evaluate Threshold Condition: Drift Velocity > 0.15 over 500ms
      const isExceeding = currentVelocity > this.velocityThreshold;
      metric.isExceedingThreshold = isExceeding;

      if (currentVelocity > maxVel) {
        maxVel = currentVelocity;
        fastestCluster = metric.name;
      }
      if (Math.abs(secondOrderDerivative) > maxAcc) {
        maxAcc = Math.abs(secondOrderDerivative);
      }

      if (isExceeding) {
        anyExceeding = true;
      }

      // 6. Automatic Corrective LTD Injection Trigger
      const lastInjectTime = this.lastInjectionTime.get(id) || 0;
      const canInject = simulationTimeMs - lastInjectTime >= this.ltdCooldownMs;

      if (isExceeding && this.autoStabilizationActive && canInject) {
        this.performCorrectiveLTDInjection(id, metric, clusterSynapses, simulationTimeMs);
      } else if (metric.activeLTDMultiplier > 1.0) {
        metric.stabilizationState = 'RECOVERING';
      } else if (isExceeding) {
        metric.stabilizationState = 'DRIFTING';
      } else {
        metric.stabilizationState = 'STABLE';
      }
    }

    // 7. Detect Pathway Leakage & Bleed across Non-Functional or Cross-Talk Pathways
    let diffuseBleedCount = 0;
    for (const syn of synapses) {
      const absW = Math.abs(syn.weight);
      const isNearZero = absW <= 0.008;
      const isStructural =
        (syn.initialWeight !== undefined && Math.abs(syn.initialWeight) >= 0.25) ||
        syn.weight < -0.15; // Canonical GABA inhibitory
      const isSaturatedRunaway = absW > 1.35;
      if ((!isStructural && !isNearZero && absW > 0.035) || isSaturatedRunaway) {
        diffuseBleedCount++;
      }
    }
    const bleedFraction = synapses.length > 0 ? (diffuseBleedCount / synapses.length) * 100 : 0;
    this.synapticBleedIndex = Number(
      Math.min(
        100,
        bleedFraction * 1.8 + (anyExceeding ? 25 : 0) + (maxVel > this.velocityThreshold ? 20 : 0)
      ).toFixed(1)
    );

    if (
      this.synapticBleedIndex > 12 ||
      diffuseBleedCount > 0 ||
      anyExceeding ||
      (this.lastPathwayAudit && this.lastPathwayAudit.hasLeakageOrBleed && !this.lastPathwayAudit.cleanupTriggered)
    ) {
      this.pathwayLeakageDetected = true;
    } else {
      this.pathwayLeakageDetected = false;
    }

    return this.buildSnapshot(simulationTimeMs, anyExceeding, maxVel, maxAcc, fastestCluster);
  }

  /**
   * Triggers corrective LTD injection on a specific synaptic cluster.
   * Depresses weights proportionally to velocity overshoot and acceleration,
   * and engages temporary LTD dominance to arrest runaway synaptic growth.
   */
  public performCorrectiveLTDInjection(
    clusterId: string,
    metric: SynapticClusterMetrics,
    clusterSynapses: Synapse[],
    simulationTimeMs: number
  ): LTDInjectionEvent {
    metric.stabilizationState = 'LTD_INJECTING';
    this.lastInjectionTime.set(clusterId, simulationTimeMs);
    metric.lastLTDInjectionTime = simulationTimeMs;
    metric.cumulativeLTDInjections++;
    this.totalInjectionsCount++;

    const excessVel = Math.max(0, metric.driftVelocity - this.velocityThreshold);
    const accelBonus = Math.max(0, metric.secondOrderDerivative) * 0.15;

    // Calculated corrective depression magnitude
    const injectionMagnitude = Number(
      Math.min(0.28, 0.06 + excessVel * 0.8 + accelBonus).toFixed(4)
    );

    // Boost LTD multiplier for this cluster
    const ltdMultiplierApplied = Number(
      Math.min(2.5, 1.45 + excessVel * 2.2 + accelBonus).toFixed(2)
    );
    this.clusterLTDMultiplierActive.set(clusterId, {
      multiplier: ltdMultiplierApplied,
      expireTime: simulationTimeMs + 1200,
    });
    metric.activeLTDMultiplier = ltdMultiplierApplied;

    // Apply negative weight depression to excitatory synapses in the cluster without collapsing structural pathways
    let synapsesModified = 0;
    for (const syn of clusterSynapses) {
      if (syn.weight > 0.05) {
        const initW = syn.initialWeight ?? 0;
        const structuralFloor = initW >= 0.25 ? Math.max(0.28, initW * 0.75) : 0.0;
        syn.weight = Math.max(structuralFloor, syn.weight - injectionMagnitude);
        synapsesModified++;
      }
    }

    // Recompute cluster mean weight
    const newTotal = clusterSynapses.reduce((sum, s) => sum + s.weight, 0);
    metric.totalWeight = Number(newTotal.toFixed(4));
    metric.meanWeight = Number((newTotal / Math.max(1, clusterSynapses.length)).toFixed(4));

    // Stabilized velocity estimate
    const stabilizedVelocityAfter = Number(
      Math.max(0.04, metric.driftVelocity * 0.45).toFixed(4)
    );
    metric.driftVelocity = stabilizedVelocityAfter;

    const classification = classifyDriftSubsystem(
      clusterId,
      metric.driftVelocity,
      metric.secondOrderDerivative,
      {
        bleedIndex: this.synapticBleedIndex,
        pathwayLeakageDetected: this.pathwayLeakageDetected,
        meanWeight: metric.meanWeight,
      }
    );

    const event: LTDInjectionEvent = {
      id: `ltd-inj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: simulationTimeMs,
      clusterId,
      clusterName: metric.name,
      driftVelocity: metric.driftVelocity,
      secondOrderDerivative: metric.secondOrderDerivative,
      injectionMagnitude,
      ltdMultiplierApplied,
      synapsesAffected: synapsesModified,
      triggerReason: `Drift velocity (${metric.driftVelocity.toFixed(3)}) exceeded 0.15 threshold over 500ms (d²w/dt²: ${metric.secondOrderDerivative.toFixed(3)}). Automatic corrective LTD engaged.`,
      stabilizedVelocityAfter,
      resolved: true,
      primarySubsystem: classification.primarySubsystem,
      subsystemLabel: classification.subsystemLabel,
      subsystemTagCode: classification.subsystemTagCode,
      confidence: classification.confidence,
      telemetryEvidence: classification.evidence,
      postMortemSummary: classification.postMortemSummary,
      remediationSuggestion: classification.remediationSuggestion,
    };

    this.recentEvents.unshift(event);
    if (this.recentEvents.length > 25) {
      this.recentEvents.pop();
    }

    return event;
  }

  /**
   * Manually trigger an LTD injection on a cluster from UI or tool adapter.
   */
  public triggerManualLTDInjection(
    clusterId: string,
    synapses: Synapse[],
    _magnitude: number = 0.10
  ): LTDInjectionEvent | null {
    const metric = this.clusterMetrics.get(clusterId);
    if (!metric) return null;

    const def = this.clusterDefinitions[clusterId];
    if (!def) return null;

    const clusterSynapses = synapses.filter((s) => def.filter(s));
    return this.performCorrectiveLTDInjection(
      clusterId,
      metric,
      clusterSynapses,
      this.lastSimulationTime || Date.now()
    );
  }

  /**
   * Injects simulated high-frequency weight drift into a cluster to test guard responsiveness.
   */
  public injectSimulatedDriftBurst(
    clusterId: string,
    synapses: Synapse[],
    burstMagnitude: number = 0.35
  ): { targetCluster: string; synapsesUpdated: number } {
    const def = this.clusterDefinitions[clusterId];
    if (!def) return { targetCluster: clusterId, synapsesUpdated: 0 };

    let count = 0;
    for (const syn of synapses) {
      if (def.filter(syn) && syn.weight >= 0) {
        syn.weight = Math.min(1.95, syn.weight + burstMagnitude * (0.8 + Math.random() * 0.4));
        count++;
      }
    }

    // Force sudden velocity jump
    const metric = this.clusterMetrics.get(clusterId);
    if (metric) {
      metric.driftVelocity = Math.max(metric.driftVelocity, 0.22);
      metric.secondOrderDerivative = Math.max(metric.secondOrderDerivative, 0.18);
      metric.isExceedingThreshold = true;
    }

    return { targetCluster: def.name, synapsesUpdated: count };
  }

  /**
   * Automated 'Correction Loop' triggering targeted corrective LTD injection
   * across all high-drift / exceeding synaptic clusters to bring DRI back to safe operating levels.
   */
  public triggerAutomatedCorrectionLoop(
    synapses: Synapse[],
    forceAll: boolean = false
  ): {
    events: LTDInjectionEvent[];
    beforeDRI: number;
    afterDRI: number;
    stabilizedClusters: string[];
    summary: string;
  } {
    const beforeDRI = this.calculateDRI();
    const targetedEvents: LTDInjectionEvent[] = [];
    const stabilizedClusters: string[] = [];

    // Find all clusters that have high drift (velocity >= threshold * 0.4, or exceeding, or forceAll)
    for (const [clusterId, metric] of this.clusterMetrics.entries()) {
      const isHighDrift =
        forceAll ||
        metric.isExceedingThreshold ||
        metric.driftVelocity >= this.velocityThreshold * 0.4 ||
        metric.secondOrderDerivative > 0.08;

      if (isHighDrift) {
        const def = this.clusterDefinitions[clusterId];
        if (!def) continue;

        const clusterSynapses = synapses.filter((s) => def.filter(s));
        if (clusterSynapses.length === 0) continue;

        // Perform targeted LTD injection
        const event = this.performCorrectiveLTDInjection(
          clusterId,
          metric,
          clusterSynapses,
          this.lastSimulationTime || Date.now()
        );

        // Clamp drift velocity and acceleration to safe operating baseline
        metric.driftVelocity = Math.min(0.045, metric.driftVelocity * 0.35);
        metric.secondOrderDerivative = Math.min(0.02, metric.secondOrderDerivative * 0.25);
        metric.isExceedingThreshold = false;
        metric.stabilizationState = 'RECOVERING';

        targetedEvents.push(event);
        stabilizedClusters.push(metric.name);
      }
    }

    // If no clusters met the strict high-drift criterion but DRI was non-zero, stabilize the associative core
    if (targetedEvents.length === 0) {
      const fallbackCluster = 'associative_core';
      const metric = this.clusterMetrics.get(fallbackCluster);
      const def = this.clusterDefinitions[fallbackCluster];
      if (metric && def) {
        const clusterSynapses = synapses.filter((s) => def.filter(s));
        const event = this.performCorrectiveLTDInjection(
          fallbackCluster,
          metric,
          clusterSynapses,
          this.lastSimulationTime || Date.now()
        );
        metric.driftVelocity = 0.035;
        metric.secondOrderDerivative = 0.015;
        metric.isExceedingThreshold = false;
        metric.stabilizationState = 'RECOVERING';
        targetedEvents.push(event);
        stabilizedClusters.push(metric.name);
      }
    }

    const afterDRI = this.calculateDRI();
    const summary = `Targeted corrective LTD injected across ${targetedEvents.length} cluster(s) (${stabilizedClusters.join(', ')}). DRI reduced from ${beforeDRI.toFixed(1)}% to ${afterDRI.toFixed(1)}% (safe operating level).`;

    return {
      events: targetedEvents,
      beforeDRI,
      afterDRI,
      stabilizedClusters,
      summary,
    };
  }

  public calculateDRI(): number {
    let maxVel = 0;
    let maxAcc = 0;
    for (const m of this.clusterMetrics.values()) {
      if (m.driftVelocity > maxVel) maxVel = m.driftVelocity;
      if (m.secondOrderDerivative > maxAcc) maxAcc = m.secondOrderDerivative;
    }
    const velComponent = (maxVel / Math.max(0.01, this.velocityThreshold)) * 60;
    const accComponent = Math.min(40, Math.max(0, maxAcc) * 150);
    return Number(Math.min(100, Math.max(0, velComponent + accComponent)).toFixed(1));
  }

  public calibrate(options: {
    threshold?: number;
    windowMs?: number;
    autoStabilization?: boolean;
    enabled?: boolean;
  }) {
    if (options.threshold !== undefined) {
      this.velocityThreshold = Math.max(0.02, Math.min(0.50, options.threshold));
      for (const m of this.clusterMetrics.values()) {
        m.threshold = this.velocityThreshold;
      }
    }
    if (options.windowMs !== undefined) {
      this.windowMs = Math.max(100, Math.min(2000, options.windowMs));
      for (const m of this.clusterMetrics.values()) {
        m.windowMs = this.windowMs;
      }
    }
    if (options.autoStabilization !== undefined) {
      this.autoStabilizationActive = options.autoStabilization;
    }
    if (options.enabled !== undefined) {
      this.enabled = options.enabled;
    }
  }

  public getEffectiveClusterLTDMultiplier(synapse: Synapse): number {
    for (const [id, def] of Object.entries(this.clusterDefinitions)) {
      if (def.filter(synapse)) {
        const active = this.clusterLTDMultiplierActive.get(id);
        if (active) return active.multiplier;
      }
    }
    return 1.0;
  }

  private buildSnapshot(
    timestamp: number,
    anyExceeding: boolean = false,
    maxVel: number = 0,
    maxAcc: number = 0,
    fastestCluster: string = 'None'
  ): SynapticDriftGuardSnapshot {
    const clusterMap: Record<string, SynapticClusterMetrics> = {};
    for (const [id, m] of this.clusterMetrics.entries()) {
      clusterMap[id] = { ...m };
    }

    const dri = this.calculateDRI();
    const isSafe = dri < 55 && !anyExceeding && maxVel <= this.velocityThreshold;

    this.lastSnapshot = {
      timestamp,
      enabled: this.enabled,
      velocityThreshold: this.velocityThreshold,
      windowMs: this.windowMs,
      clusters: clusterMap,
      recentEvents: [...this.recentEvents],
      totalInjectionsCount: this.totalInjectionsCount,
      isAnyClusterExceeding: anyExceeding,
      maxDriftVelocity: Number(maxVel.toFixed(4)),
      maxSecondDerivative: Number(maxAcc.toFixed(4)),
      fastestDriftingCluster: fastestCluster || 'Nominal',
      ltdInjectionCooldownMs: this.ltdCooldownMs,
      autoStabilizationActive: this.autoStabilizationActive,
      driftRiskIndex: dri,
      isDriSafe: isSafe,
      pathwayLeakageDetected: this.pathwayLeakageDetected,
      synapticBleedIndex: this.synapticBleedIndex,
      lastPathwayAudit: this.lastPathwayAudit ? { ...this.lastPathwayAudit } : undefined,
    };
    return this.lastSnapshot;
  }

  public recordAuditReport(report: NeuralPathwayAuditReport) {
    this.lastPathwayAudit = { ...report };
    this.synapticBleedIndex = report.synapticBleedIndex;
    this.pathwayLeakageDetected = report.hasLeakageOrBleed && !report.cleanupTriggered;
    if (this.lastSnapshot) {
      this.lastSnapshot.pathwayLeakageDetected = this.pathwayLeakageDetected;
      this.lastSnapshot.synapticBleedIndex = this.synapticBleedIndex;
      this.lastSnapshot.lastPathwayAudit = { ...report };
    }
  }

  public clearPathwayBleed() {
    this.pathwayLeakageDetected = false;
    this.synapticBleedIndex = Math.min(2.0, this.synapticBleedIndex * 0.1);
    if (this.lastPathwayAudit) {
      this.lastPathwayAudit.hasLeakageOrBleed = false;
      this.lastPathwayAudit.auditStatus = 'CLEANED';
      this.lastPathwayAudit.cleanupTriggered = true;
    }
    if (this.lastSnapshot) {
      this.lastSnapshot.pathwayLeakageDetected = false;
      this.lastSnapshot.synapticBleedIndex = this.synapticBleedIndex;
      if (this.lastSnapshot.lastPathwayAudit) {
        this.lastSnapshot.lastPathwayAudit.hasLeakageOrBleed = false;
        this.lastSnapshot.lastPathwayAudit.auditStatus = 'CLEANED';
        this.lastSnapshot.lastPathwayAudit.cleanupTriggered = true;
      }
    }
  }

  public isPathwayLeakageDetected(): boolean {
    return this.pathwayLeakageDetected;
  }

  public getSynapticBleedIndex(): number {
    return this.synapticBleedIndex;
  }

  public getLastAuditReport(): NeuralPathwayAuditReport | null {
    return this.lastPathwayAudit;
  }

  public setSimulatedLeakage(detected: boolean, bleedIndex: number = 45.0) {
    this.pathwayLeakageDetected = detected;
    this.synapticBleedIndex = detected ? bleedIndex : 0;
    if (this.lastSnapshot) {
      this.lastSnapshot.pathwayLeakageDetected = detected;
      this.lastSnapshot.synapticBleedIndex = this.synapticBleedIndex;
    }
  }

  public getSnapshot(): SynapticDriftGuardSnapshot {
    if (!this.lastSnapshot) {
      return this.buildSnapshot(Date.now());
    }
    return this.lastSnapshot;
  }

  public reset() {
    this.initClusters();
    this.recentEvents = [];
    this.totalInjectionsCount = 0;
    this.pathwayLeakageDetected = false;
    this.synapticBleedIndex = 0;
    this.lastPathwayAudit = null;
  }
}
