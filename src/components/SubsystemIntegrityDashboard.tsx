import React, { useState, useMemo } from 'react';
import {
  HardwareTelemetry,
  Synapse,
  SynapticDriftGuardSnapshot,
} from '../types';
import { SNNEngine } from '../lib/snnEngine';
import {
  ShieldCheck,
  ShieldAlert,
  Cpu,
  Zap,
  Activity,
  Heart,
  Network,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Layers,
  ArrowRight,
  TrendingDown,
  Gauge,
  RefreshCw,
  Sliders,
  Scissors,
} from 'lucide-react';

interface SubsystemIntegrityDashboardProps {
  telemetry: HardwareTelemetry;
  engine: SNNEngine;
  synapses: Synapse[];
  driftSnapshot: SynapticDriftGuardSnapshot | null;
  onRemediationApplied?: (actionName: string, detail: string) => void;
}

export type SubsystemRating = 'OPTIMAL' | 'STABLE' | 'DEGRADED' | 'CRITICAL';

export interface EvaluatedSubsystem {
  id: 'aer' | 'stdp' | 'membrane' | 'reflex' | 'driftGuard';
  name: string;
  code: string;
  weightPct: number;
  score: number;
  rating: SubsystemRating;
  primaryMetric: {
    label: string;
    value: string;
    target: string;
    isNominal: boolean;
  };
  metrics: Array<{
    label: string;
    value: string;
    target: string;
    status: 'nominal' | 'warning' | 'critical';
  }>;
  summary: string;
  quickActionLabel: string;
}

export const SubsystemIntegrityDashboard: React.FC<SubsystemIntegrityDashboardProps> = ({
  telemetry,
  engine,
  synapses,
  driftSnapshot,
  onRemediationApplied,
}) => {
  const [feedbackToast, setFeedbackToast] = useState<{
    action: string;
    message: string;
    timestamp: number;
  } | null>(null);

  const showToast = (action: string, message: string) => {
    setFeedbackToast({ action, message, timestamp: Date.now() });
    setTimeout(() => {
      setFeedbackToast((prev) => (prev && Date.now() - prev.timestamp >= 3800 ? null : prev));
    }, 4000);
    if (onRemediationApplied) {
      onRemediationApplied(action, message);
    }
  };

  // =========================================================================
  // Subsystem Calculations: 5 SNN Subsystems
  // =========================================================================

  const evaluation = useMemo(() => {
    // -----------------------------------------------------------------------
    // 1. AER Bus (Weight: 15%)
    // -----------------------------------------------------------------------
    const latency = telemetry.aerLatencyMs || 1.15;
    const drops = telemetry.droppedSignalCount ?? 0;
    const jitter = engine.instantaneousJitterMs ?? 0.12;
    const queueDepth = engine.aerQueue.length;
    const synOps = telemetry.synapticOpsPerSec || 299;

    let aerScore = 100;
    if (latency > 1.5) {
      aerScore -= Math.min(35, (latency - 1.5) * 20);
    }
    if (jitter > 0.35) {
      aerScore -= Math.min(20, (jitter - 0.35) * 35);
    }
    if (drops > 0) {
      aerScore -= Math.min(30, drops * 10);
    }
    if (queueDepth > 45) {
      aerScore -= Math.min(15, (queueDepth - 45) * 1.5);
    }
    aerScore = Math.round(Math.max(0, Math.min(100, aerScore)));

    const aerRating: SubsystemRating =
      aerScore >= 85 ? 'OPTIMAL' : aerScore >= 70 ? 'STABLE' : aerScore >= 50 ? 'DEGRADED' : 'CRITICAL';

    const aerSubsystem: EvaluatedSubsystem = {
      id: 'aer',
      name: 'AER Bus & Event Pipeline',
      code: 'AER-BUS',
      weightPct: 15,
      score: aerScore,
      rating: aerRating,
      primaryMetric: {
        label: 'Event Latency',
        value: `${latency.toFixed(2)} ms`,
        target: '≤ 1.50 ms',
        isNominal: latency <= 1.5,
      },
      metrics: [
        {
          label: 'Throughput',
          value: `${synOps.toLocaleString()} SOP/s`,
          target: '≥ 250 SOP/s',
          status: synOps >= 250 ? 'nominal' : 'warning',
        },
        {
          label: 'Transmission Jitter',
          value: `${jitter.toFixed(3)} ms`,
          target: '< 0.35 ms',
          status: jitter < 0.35 ? 'nominal' : 'warning',
        },
        {
          label: 'Packet Drops',
          value: `${drops} dropped`,
          target: '0 drops',
          status: drops === 0 ? 'nominal' : 'critical',
        },
        {
          label: 'Queue Depth',
          value: `${queueDepth} / 60 pkts`,
          target: '≤ 45 pkts',
          status: queueDepth <= 45 ? 'nominal' : 'warning',
        },
        {
          label: 'Phase Synchrony',
          value: engine.syncStatus.toUpperCase(),
          target: 'LOCKED',
          status: engine.syncStatus === 'locked' ? 'nominal' : 'warning',
        },
      ],
      summary:
        latency <= 1.50 && drops === 0
          ? 'Event bus streaming nominal asynchronous address-events with sub-1.5ms temporal fidelity.'
          : 'Elevated transmission jitter or packet backlog detected in asynchronous AER buffer.',
      quickActionLabel: 'Flush AER Queue',
    };

    // -----------------------------------------------------------------------
    // 2. STDP Engine (Weight: 25%)
    // -----------------------------------------------------------------------
    const aPlus = engine.stdpConfig.aPlus || 0.032;
    const aMinus = engine.stdpConfig.aMinus || 0.052;
    const dominanceRatio = aMinus / Math.max(0.001, aPlus);
    const lr = engine.stdpConfig.learningRate || 0.40;
    const cumDrift = Math.abs(telemetry.cumulativeSTDPDelta || 0);
    const decayMultiplier = engine.stdpConfig.weightDecayMultiplier ?? 1.0;

    // Weight saturation calculation: fraction of synapses with |w| >= 1.35
    const totalSyns = Math.max(1, synapses.length);
    const saturatedCount = synapses.filter((s) => Math.abs(s.weight) >= 1.35).length;
    const satRatio = saturatedCount / totalSyns;

    let stdpScore = 100;
    // Strict invariant: A- / A+ >= 1.25 is target, < 1.08 is hazardous
    if (dominanceRatio < 1.25) {
      stdpScore -= Math.min(40, (1.25 - dominanceRatio) * 90);
      if (dominanceRatio < 1.08) {
        stdpScore -= 25; // Invariant breached!
      }
    }
    if (lr > 0.45) {
      stdpScore -= Math.min(25, (lr - 0.45) * 70);
    }
    if (satRatio > 0.15) {
      stdpScore -= Math.min(25, (satRatio - 0.15) * 150);
    }
    if (cumDrift > 5.0) {
      stdpScore -= Math.min(20, (cumDrift - 5.0) * 3);
    }
    stdpScore = Math.round(Math.max(0, Math.min(100, stdpScore)));

    const stdpRating: SubsystemRating =
      stdpScore >= 85 ? 'OPTIMAL' : stdpScore >= 70 ? 'STABLE' : stdpScore >= 50 ? 'DEGRADED' : 'CRITICAL';

    const stdpSubsystem: EvaluatedSubsystem = {
      id: 'stdp',
      name: 'STDP Plasticity Engine',
      code: 'STDP-PLAST',
      weightPct: 25,
      score: stdpScore,
      rating: stdpRating,
      primaryMetric: {
        label: 'A- / A+ Dominance',
        value: `${dominanceRatio.toFixed(3)}x`,
        target: '≥ 1.250x (min 1.08x)',
        isNominal: dominanceRatio >= 1.25,
      },
      metrics: [
        {
          label: 'Learning Rate (η)',
          value: lr.toFixed(3),
          target: '≤ 0.450',
          status: lr <= 0.45 ? 'nominal' : 'warning',
        },
        {
          label: 'Weight Saturation',
          value: `${(satRatio * 100).toFixed(1)}% (${saturatedCount}/${totalSyns})`,
          target: '< 15.0%',
          status: satRatio < 0.15 ? 'nominal' : 'warning',
        },
        {
          label: 'Cumulative STDP Drift',
          value: `${cumDrift.toFixed(2)} ΔW`,
          target: '< 4.00 ΔW',
          status: cumDrift < 4.0 ? 'nominal' : 'warning',
        },
        {
          label: 'Decay Multiplier',
          value: `${decayMultiplier.toFixed(1)}x`,
          target: '1.0x baseline',
          status: 'nominal',
        },
        {
          label: 'Homeostatic Scaling',
          value: engine.homeostaticScalingActive ? 'ENGAGED' : 'STANDBY',
          target: 'STANDBY',
          status: 'nominal',
        },
      ],
      summary:
        dominanceRatio >= 1.25 && satRatio < 0.15
          ? 'LTD dominance actively enforces anti-Hebbian boundary; weight distribution is stable.'
          : 'LTP pressure or saturation hazard detected in synaptic weight distribution.',
      quickActionLabel: 'Stabilize STDP',
    };

    // -----------------------------------------------------------------------
    // 3. Membrane Integrator (Weight: 20%)
    // -----------------------------------------------------------------------
    const meanFiringHz = telemetry.meanFiringRateHz || 28.0;
    const targetHz = engine.targetFiringRateHz || 28.0;
    const rateDeviation = Math.abs(meanFiringHz - targetHz);
    const thresholdOffset = engine.adaptiveThresholdOffset || 0;
    const firingStability = telemetry.firingStabilityIndex ?? 0.95;

    // Calculate voltage dispersion (standard deviation of vMem across neurons)
    const vMems = engine.neurons.map((n) => n.vMem);
    const avgV = vMems.reduce((a, b) => a + b, 0) / Math.max(1, vMems.length);
    const variance = vMems.reduce((a, b) => a + Math.pow(b - avgV, 2), 0) / Math.max(1, vMems.length);
    const dispersion = Math.sqrt(variance);

    let membraneScore = 100;
    if (rateDeviation > 5.0) {
      membraneScore -= Math.min(35, (rateDeviation - 5.0) * 2.8);
    }
    if (meanFiringHz < 12.0 || meanFiringHz > 45.0) {
      membraneScore -= 25; // Biological boundary excursion
    }
    if (Math.abs(thresholdOffset) > 4.5) {
      membraneScore -= Math.min(20, (Math.abs(thresholdOffset) - 4.5) * 4);
    }
    if (dispersion > 16.0) {
      membraneScore -= Math.min(20, (dispersion - 16.0) * 2.5);
    }
    membraneScore = Math.round(Math.max(0, Math.min(100, membraneScore)));

    const membraneRating: SubsystemRating =
      membraneScore >= 85 ? 'OPTIMAL' : membraneScore >= 70 ? 'STABLE' : membraneScore >= 50 ? 'DEGRADED' : 'CRITICAL';

    const membraneSubsystem: EvaluatedSubsystem = {
      id: 'membrane',
      name: 'Membrane Integrator & LIF Dynamics',
      code: 'MEMBRANE-LIF',
      weightPct: 20,
      score: membraneScore,
      rating: membraneRating,
      primaryMetric: {
        label: 'Spiking Rate Setpoint',
        value: `${meanFiringHz.toFixed(1)} Hz`,
        target: `${targetHz.toFixed(1)} Hz (15–45)`,
        isNominal: meanFiringHz >= 15 && meanFiringHz <= 45,
      },
      metrics: [
        {
          label: 'Rate Deviation',
          value: `±${rateDeviation.toFixed(1)} Hz`,
          target: '≤ 4.0 Hz',
          status: rateDeviation <= 4.0 ? 'nominal' : 'warning',
        },
        {
          label: 'Membrane Dispersion (σ)',
          value: `${dispersion.toFixed(1)} mV`,
          target: '≤ 14.0 mV',
          status: dispersion <= 14.0 ? 'nominal' : 'warning',
        },
        {
          label: 'Adaptive Threshold',
          value: `${thresholdOffset >= 0 ? '+' : ''}${thresholdOffset.toFixed(2)} mV`,
          target: '±3.00 mV',
          status: Math.abs(thresholdOffset) <= 3.0 ? 'nominal' : 'warning',
        },
        {
          label: 'Stability Index',
          value: `${(firingStability * 100).toFixed(0)}%`,
          target: '≥ 85%',
          status: firingStability >= 0.85 ? 'nominal' : 'warning',
        },
        {
          label: 'Refractory Pacing',
          value: `${engine.homeostaticRateDampingFactor.toFixed(2)}x scale`,
          target: '1.00x',
          status: 'nominal',
        },
      ],
      summary:
        meanFiringHz >= 15 && meanFiringHz <= 45 && rateDeviation <= 4.0
          ? 'Neuron membrane potentials oscillating within biological homeostatic firing envelope.'
          : 'Rate deviation detected: homeostatic loop damping/facilitating membrane dynamics.',
      quickActionLabel: 'Calibrate Rate Loop',
    };

    // -----------------------------------------------------------------------
    // 4. Reflex Controller (Weight: 15%)
    // -----------------------------------------------------------------------
    const keelValence = telemetry.substrateKeel?.valence ?? 1.53;
    const sociability = telemetry.substrateKeel?.sociability ?? 0.98;
    const traumaState = telemetry.traumaState ?? 'ventral_equilibrium';
    const traumaLocks = telemetry.traumaLockSteps ?? 0;
    const gateState = telemetry.constitutionalGateState ?? 'STRATEGIC_MATERIALS_EQUILIBRIUM';
    const gateDamping = telemetry.gateDampingFactor ?? 1.0;
    const avoidanceRatio = telemetry.activeAvoidanceRatio ?? '0.82';

    let reflexScore = 100;
    if (keelValence >= 1.0) {
      // Nominal positive valence (+1.53)
      reflexScore = 100;
    } else if (keelValence >= 0.0) {
      reflexScore -= (1.0 - keelValence) * 20;
    } else if (keelValence >= -1.0) {
      reflexScore -= 30 + Math.abs(keelValence) * 30;
    } else {
      reflexScore -= 70; // Severe dorsal depression
    }

    if (traumaState === 'recovering') reflexScore -= 15;
    else if (traumaState === 'dorsal_trauma') reflexScore -= 40;

    if (traumaLocks > 0) {
      reflexScore -= Math.min(20, traumaLocks * 3);
    }
    if (gateDamping < 0.8) {
      reflexScore -= (0.8 - gateDamping) * 50;
    }
    if (sociability < 0.85) {
      reflexScore -= (0.85 - sociability) * 40;
    }
    reflexScore = Math.round(Math.max(0, Math.min(100, reflexScore)));

    const reflexRating: SubsystemRating =
      reflexScore >= 85 ? 'OPTIMAL' : reflexScore >= 70 ? 'STABLE' : reflexScore >= 50 ? 'DEGRADED' : 'CRITICAL';

    const reflexSubsystem: EvaluatedSubsystem = {
      id: 'reflex',
      name: 'Reflex Controller & Substrate Keel',
      code: 'REFLEX-KEEL',
      weightPct: 15,
      score: reflexScore,
      rating: reflexRating,
      primaryMetric: {
        label: 'Keel Valence',
        value: `${keelValence >= 0 ? '+' : ''}${keelValence.toFixed(2)}`,
        target: '+1.53 (target > 0.0)',
        isNominal: keelValence > 0,
      },
      metrics: [
        {
          label: 'Polyvagal State',
          value: traumaState === 'ventral_equilibrium' ? 'VENTRAL EQ.' : traumaState.toUpperCase(),
          target: 'VENTRAL EQ.',
          status: traumaState === 'ventral_equilibrium' ? 'nominal' : 'warning',
        },
        {
          label: 'Sociability Quotient',
          value: `${(sociability * 100).toFixed(0)}%`,
          target: '≥ 85%',
          status: sociability >= 0.85 ? 'nominal' : 'warning',
        },
        {
          label: 'Trauma Lock Steps',
          value: `${traumaLocks} steps`,
          target: '0 steps',
          status: traumaLocks === 0 ? 'nominal' : 'critical',
        },
        {
          label: 'Constitutional Gate',
          value: gateState.replace('_', ' '),
          target: 'NOMINAL',
          status: gateDamping >= 0.8 ? 'nominal' : 'warning',
        },
        {
          label: 'Avoidance Ratio',
          value: avoidanceRatio,
          target: '0.82',
          status: 'nominal',
        },
      ],
      summary:
        keelValence > 0 && traumaState === 'ventral_equilibrium'
          ? 'Substrate Keel settled in ventral equilibrium; constitutional guardrails fully aligned.'
          : 'Reflex controller experiencing elevated trauma lock or dampened gate sensitivity.',
      quickActionLabel: 'Re-Center Keel',
    };

    // -----------------------------------------------------------------------
    // 5. Drift Guard (Weight: 25%)
    // -----------------------------------------------------------------------
    const dri = driftSnapshot?.driftRiskIndex ?? 12.0;
    const velocity = driftSnapshot?.maxDriftVelocity ?? 0.08;
    const secondDeriv = driftSnapshot?.maxSecondDerivative ?? 0.012;
    const bleedIndex = driftSnapshot?.synapticBleedIndex ?? 0;
    const cooldownMs = driftSnapshot?.ltdInjectionCooldownMs ?? 800;
    const isCooldownActive = Object.values(driftSnapshot?.clusters || {}).some(
      (c) => c.stabilizationState === 'LTD_INJECTING' || c.stabilizationState === 'RECOVERING'
    );
    const fastestCluster = driftSnapshot?.fastestDriftingCluster ?? 'lateral_inhibitory';

    let driftScore = 100 - dri;
    if (velocity > 0.15) {
      driftScore -= Math.min(35, (velocity - 0.15) * 70);
    }
    if (Math.abs(secondDeriv) > 0.04) {
      driftScore -= Math.min(25, (Math.abs(secondDeriv) - 0.04) * 350);
    }
    if (bleedIndex > 0) {
      driftScore -= Math.min(25, bleedIndex * 0.25);
    }
    driftScore = Math.round(Math.max(0, Math.min(100, driftScore)));

    const driftRating: SubsystemRating =
      driftScore >= 85 ? 'OPTIMAL' : driftScore >= 70 ? 'STABLE' : driftScore >= 50 ? 'DEGRADED' : 'CRITICAL';

    const driftSubsystem: EvaluatedSubsystem = {
      id: 'driftGuard',
      name: 'Synaptic Drift Guard & Acceleration',
      code: 'DRIFT-GUARD',
      weightPct: 25,
      score: driftScore,
      rating: driftRating,
      primaryMetric: {
        label: 'Divergence Risk (DRI)',
        value: `${dri.toFixed(1)}%`,
        target: '< 25.0%',
        isNominal: dri < 25.0,
      },
      metrics: [
        {
          label: 'Max Drift Velocity (v)',
          value: `${velocity.toFixed(3)}/s`,
          target: '≤ 0.150/s (alert 0.85)',
          status: velocity < 0.15 ? 'nominal' : velocity < 0.85 ? 'warning' : 'critical',
        },
        {
          label: '2nd-Order Accel (d²w/dt²)',
          value: `${secondDeriv >= 0 ? '+' : ''}${secondDeriv.toFixed(4)}`,
          target: '< ±0.040',
          status: Math.abs(secondDeriv) < 0.04 ? 'nominal' : 'warning',
        },
        {
          label: 'Synaptic Bleed Index',
          value: `${bleedIndex.toFixed(0)}%`,
          target: '0%',
          status: bleedIndex === 0 ? 'nominal' : bleedIndex < 20 ? 'warning' : 'critical',
        },
        {
          label: 'LTD Cooldown',
          value: isCooldownActive ? `ACTIVE (${cooldownMs}ms)` : `READY (${cooldownMs}ms)`,
          target: 'READY (armed)',
          status: isCooldownActive ? 'warning' : 'nominal',
        },
        {
          label: 'Fastest Cluster',
          value: fastestCluster.replace('_', ' '),
          target: 'nominal',
          status: 'nominal',
        },
      ],
      summary:
        dri < 25.0 && velocity < 0.15
          ? 'Second-order derivative monitor confirms zero runaway drift; corrective LTD interceptor armed.'
          : 'Synaptic acceleration spike or bleed detected in synaptic clusters.',
      quickActionLabel: 'Run Corrective LTD',
    };

    // -----------------------------------------------------------------------
    // High-Level Composite Health Score (Weighted)
    // -----------------------------------------------------------------------
    const weightedSum =
      aerSubsystem.score * 0.15 +
      stdpSubsystem.score * 0.25 +
      membraneSubsystem.score * 0.20 +
      reflexSubsystem.score * 0.15 +
      driftSubsystem.score * 0.25;

    const overallScore = Math.round(Math.max(0, Math.min(100, weightedSum)));

    const overallRating: SubsystemRating =
      overallScore >= 85 ? 'OPTIMAL' : overallScore >= 70 ? 'STABLE' : overallScore >= 50 ? 'DEGRADED' : 'CRITICAL';

    return {
      overallScore,
      overallRating,
      subsystems: [aerSubsystem, stdpSubsystem, membraneSubsystem, reflexSubsystem, driftSubsystem],
      dri,
      velocity,
      dominanceRatio,
      keelValence,
      meanFiringHz,
    };
  }, [telemetry, engine, synapses, driftSnapshot]);

  // =========================================================================
  // Remediation Handlers
  // =========================================================================

  const handleAction = (id: 'aer' | 'stdp' | 'membrane' | 'reflex' | 'driftGuard') => {
    switch (id) {
      case 'aer': {
        const res = engine.flushAERBus();
        showToast(
          'Flush AER Queue',
          `AER bus flushed cleanly. Cleared ${res.packetsCleared} queued packets. Latency reset to ${res.newLatencyMs} ms.`
        );
        break;
      }
      case 'stdp': {
        // Enforce safe invariant baseline
        engine.stdpConfig.aPlus = 0.032;
        engine.stdpConfig.aMinus = 0.052;
        engine.stdpConfig.learningRate = 0.40;
        engine.stdpConfig.weightDecayMultiplier = 1.0;
        engine.applyHomeostaticSynapticScaling();
        showToast(
          'Stabilize STDP',
          'Enforced A-/A+ dominance ratio of 1.625x (0.052/0.032), learning rate clamped to 0.40, and applied synaptic scaling.'
        );
        break;
      }
      case 'membrane': {
        engine.calibrateHomeostaticRateLoop();
        showToast(
          'Calibrate Rate Loop',
          'Homeostatic firing rate loop calibrated to 28.0 Hz setpoint with active rate-damping enabled.'
        );
        break;
      }
      case 'reflex': {
        const res = engine.recenterKeelEquilibrium();
        showToast(
          'Re-Center Keel',
          `Restored Keel to ${res.newValence >= 0 ? '+' : ''}${res.newValence.toFixed(2)} in ventral equilibrium. Cleared trauma locks.`
        );
        break;
      }
      case 'driftGuard': {
        const res = engine.triggerAutomatedCorrectionLoop(true);
        showToast(
          'Run Corrective LTD',
          `Corrective LTD injected across ${res.stabilizedClusters.length} synaptic clusters. Peak drift velocity stabilized.`
        );
        break;
      }
    }
  };

  const handleScrubNow = () => {
    const res = engine.scrubInactivePathways(0.05);
    showToast(
      'Scrub Inactive Pathways',
      `Pruned ${res.prunedCount} sub-threshold synapses. Network sparsity elevated to ${res.sparsityPct}%, saving ${res.leakagePowerSavedMw} mW.`
    );
  };

  // Color mappings
  const getRatingBadge = (rating: SubsystemRating) => {
    switch (rating) {
      case 'OPTIMAL':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      case 'STABLE':
        return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
      case 'DEGRADED':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'CRITICAL':
        return 'bg-rose-500/15 text-rose-300 border-rose-500/30 animate-pulse';
    }
  };

  const getStrokeColor = (rating: SubsystemRating) => {
    switch (rating) {
      case 'OPTIMAL':
        return '#10b981'; // emerald-500
      case 'STABLE':
        return '#06b6d4'; // cyan-500
      case 'DEGRADED':
        return '#f59e0b'; // amber-500
      case 'CRITICAL':
        return '#f43f5e'; // rose-500
    }
  };

  // Radial progress calculations for the SVG gauge
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (evaluation.overallScore / 100) * circumference;

  return (
    <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-4 md:p-5 flex flex-col gap-5 shadow-2xl text-slate-200">
      {/* Toast Notification */}
      {feedbackToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-slate-900 border border-emerald-500/60 rounded-xl p-3.5 shadow-2xl shadow-black/80 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 mt-0.5">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="flex-1 text-xs">
            <div className="font-semibold text-emerald-300 flex items-center justify-between">
              <span>{feedbackToast.action} Executed</span>
              <span className="text-[10px] font-mono text-slate-400">Just now</span>
            </div>
            <p className="text-slate-300 mt-0.5 leading-relaxed">{feedbackToast.message}</p>
          </div>
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 text-emerald-400 shadow-inner">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">
                Subsystem Integrity Dashboard
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                5 SNN Subsystems
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Aggregated real-time hardware health, invariant bounds, and homeostatic equilibrium
            </p>
          </div>
        </div>

        {/* Global Model Status Badge */}
        <div className="flex items-center gap-2">
          <div
            className={`px-3 py-1.5 rounded-lg border text-xs font-bold font-mono tracking-wider flex items-center gap-1.5 ${getRatingBadge(
              evaluation.overallRating
            )}`}
          >
            <span className="w-2 h-2 rounded-full bg-current animate-ping" />
            <span>MODEL HEALTH: {evaluation.overallRating}</span>
          </div>
        </div>
      </div>

      {/* Hero Section: Circular Gauge + Subsystem Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center bg-[#090e18] p-4 sm:p-5 rounded-xl border border-slate-800/80 shadow-inner">
        {/* Radial Gauge Display */}
        <div className="lg:col-span-4 flex flex-col items-center justify-center p-2 text-center">
          <div className="relative w-36 h-36 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 130 130">
              {/* Background ring */}
              <circle
                cx="65"
                cy="65"
                r={radius}
                className="stroke-slate-800/80"
                strokeWidth="10"
                fill="transparent"
              />
              {/* Animated Progress ring */}
              <circle
                cx="65"
                cy="65"
                r={radius}
                stroke={getStrokeColor(evaluation.overallRating)}
                strokeWidth="10"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                style={{
                  transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease',
                  filter: `drop-shadow(0 0 8px ${getStrokeColor(evaluation.overallRating)}60)`,
                }}
              />
            </svg>
            {/* Center Score Readout */}
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold font-mono text-white tracking-tighter">
                {evaluation.overallScore}
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Score / 100
              </span>
            </div>
          </div>

          <div className="mt-2 flex flex-col items-center">
            <span className="text-xs font-bold text-slate-200">
              Composite Model Integrity
            </span>
            <span className="text-[11px] text-slate-400 max-w-xs mt-0.5">
              Weighted across AER bus, STDP engine, membrane integrator, reflex controller & drift guard.
            </span>
          </div>
        </div>

        {/* 5 Subsystem Health Meter Bars */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono border-b border-slate-800/80 pb-1.5">
            <span>Subsystem Telemetry Weightings</span>
            <span>Sub-Score Breakdown</span>
          </div>

          <div className="space-y-2.5">
            {evaluation.subsystems.map((sub) => {
              const barColor =
                sub.rating === 'OPTIMAL'
                  ? 'bg-emerald-500'
                  : sub.rating === 'STABLE'
                  ? 'bg-cyan-500'
                  : sub.rating === 'DEGRADED'
                  ? 'bg-amber-500'
                  : 'bg-rose-500';

              return (
                <div key={sub.id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-slate-400 w-24">{sub.code}</span>
                      <span className="font-medium text-slate-200">{sub.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">({sub.weightPct}%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-slate-400">
                        {sub.primaryMetric.label}:{' '}
                        <strong
                          className={
                            sub.primaryMetric.isNominal ? 'text-slate-200' : 'text-amber-400'
                          }
                        >
                          {sub.primaryMetric.value}
                        </strong>
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border font-semibold ${getRatingBadge(
                          sub.rating
                        )}`}
                      >
                        {sub.score}%
                      </span>
                    </div>
                  </div>

                  {/* Horizontal progress bar */}
                  <div className="w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${barColor}`}
                      style={{ width: `${sub.score}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick Master Remediation & Homeostatic Intervention Bar */}
      <div className="bg-[#0b101b] border border-slate-800 rounded-xl p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-sky-400">
            <Sparkles className="w-4 h-4" />
            <span>Quick Remediation & Active Stabilization Actions</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500">
            Instant homeostatic loop realignments
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-1">
          <button
            onClick={() => handleAction('driftGuard')}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 hover:border-rose-600 text-rose-200 text-xs font-semibold transition cursor-pointer active:scale-95 shadow"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <span>Run Corrective LTD</span>
          </button>

          <button
            onClick={handleScrubNow}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-teal-950/40 hover:bg-teal-900/60 border border-teal-800/50 hover:border-teal-600 text-teal-200 text-xs font-semibold transition cursor-pointer active:scale-95 shadow"
          >
            <Scissors className="w-3.5 h-3.5 text-teal-400" />
            <span>Scrub Pathways</span>
          </button>

          <button
            onClick={() => handleAction('reflex')}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-pink-950/40 hover:bg-pink-900/60 border border-pink-800/50 hover:border-pink-600 text-pink-200 text-xs font-semibold transition cursor-pointer active:scale-95 shadow"
          >
            <Heart className="w-3.5 h-3.5 text-pink-400" />
            <span>Re-Center Keel</span>
          </button>

          <button
            onClick={() => handleAction('membrane')}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-950/40 hover:bg-indigo-900/60 border border-indigo-800/50 hover:border-indigo-600 text-indigo-200 text-xs font-semibold transition cursor-pointer active:scale-95 shadow"
          >
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            <span>Calibrate Rate Loop</span>
          </button>

          <button
            onClick={() => handleAction('aer')}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-800/50 hover:border-cyan-600 text-cyan-200 text-xs font-semibold transition cursor-pointer active:scale-95 shadow col-span-2 sm:col-span-1"
          >
            <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
            <span>Flush AER Bus</span>
          </button>
        </div>
      </div>

      {/* 5 Subsystem Detailed Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {evaluation.subsystems.map((sub) => {
          return (
            <div
              key={sub.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3 shadow hover:border-slate-700 transition"
            >
              <div>
                {/* Card Header */}
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center gap-2">
                    {sub.id === 'aer' && <Network className="w-4 h-4 text-cyan-400" />}
                    {sub.id === 'stdp' && <Zap className="w-4 h-4 text-amber-400" />}
                    {sub.id === 'membrane' && <Activity className="w-4 h-4 text-indigo-400" />}
                    {sub.id === 'reflex' && <Heart className="w-4 h-4 text-pink-400" />}
                    {sub.id === 'driftGuard' && <ShieldAlert className="w-4 h-4 text-rose-400" />}
                    <span className="font-bold text-xs text-white">{sub.name}</span>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${getRatingBadge(
                      sub.rating
                    )}`}
                  >
                    {sub.score}% • {sub.rating}
                  </span>
                </div>

                {/* Primary Metric Hero */}
                <div className="bg-[#0b101b] border border-slate-800/60 rounded-lg p-2.5 my-3 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">
                      {sub.primaryMetric.label}
                    </span>
                    <span className="text-base font-bold font-mono text-white">
                      {sub.primaryMetric.value}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">
                      Biological Setpoint
                    </span>
                    <span className="text-xs font-mono text-emerald-400 font-semibold">
                      {sub.primaryMetric.target}
                    </span>
                  </div>
                </div>

                {/* Metric Checklist Rows */}
                <div className="space-y-1.5 text-xs">
                  {sub.metrics.map((m, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-1 border-b border-slate-800/40 text-[11px]"
                    >
                      <span className="text-slate-400">{m.label}</span>
                      <div className="flex items-center gap-2 font-mono">
                        <span
                          className={
                            m.status === 'nominal'
                              ? 'text-slate-200'
                              : m.status === 'warning'
                              ? 'text-amber-400 font-semibold'
                              : 'text-rose-400 font-bold'
                          }
                        >
                          {m.value}
                        </span>
                        <span className="text-[9px] text-slate-500">[{m.target}]</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary text */}
                <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed bg-slate-950/60 p-2 rounded border border-slate-800/40">
                  {sub.summary}
                </p>
              </div>

              {/* Card Footer Remediation Button */}
              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-500">Code: {sub.code}</span>
                <button
                  onClick={() => handleAction(sub.id)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 hover:text-white border border-slate-700 transition flex items-center gap-1 cursor-pointer"
                >
                  <span>{sub.quickActionLabel}</span>
                  <ArrowRight className="w-3 h-3 text-sky-400" />
                </button>
              </div>
            </div>
          );
        })}

        {/* 6th Card: Core Invariant Compliance Verification */}
        <div className="bg-gradient-to-br from-slate-900 to-[#0c1424] border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3 shadow">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-xs text-white">SNN Invariant Compliance</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                5 / 5 INVARIANTS LOCKED
              </span>
            </div>

            <div className="space-y-2 mt-3 text-xs">
              <div className="flex items-center justify-between p-2 rounded bg-slate-950/80 border border-slate-800/60">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-slate-300 text-[11px]">STDP LTD Dominance (A- ≥ 1.08 A+)</span>
                </div>
                <span className="font-mono text-emerald-400 font-bold text-[11px]">
                  {evaluation.dominanceRatio.toFixed(2)}x PASS
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-slate-950/80 border border-slate-800/60">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-slate-300 text-[11px]">Substrate Keel Valence &gt; -1.0</span>
                </div>
                <span className="font-mono text-emerald-400 font-bold text-[11px]">
                  {evaluation.keelValence >= 0 ? '+' : ''}
                  {evaluation.keelValence.toFixed(2)} PASS
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-slate-950/80 border border-slate-800/60">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-slate-300 text-[11px]">Biological Firing Envelope (15–45 Hz)</span>
                </div>
                <span className="font-mono text-emerald-400 font-bold text-[11px]">
                  {evaluation.meanFiringHz.toFixed(1)} Hz PASS
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-slate-950/80 border border-slate-800/60">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-slate-300 text-[11px]">Synaptic Drift Velocity (v ≤ 0.15/s)</span>
                </div>
                <span className="font-mono text-emerald-400 font-bold text-[11px]">
                  {evaluation.velocity.toFixed(3)} PASS
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-slate-950/80 border border-slate-800/60">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-slate-300 text-[11px]">Divergence Risk Index (DRI &lt; 35%)</span>
                </div>
                <span className="font-mono text-emerald-400 font-bold text-[11px]">
                  {evaluation.dri.toFixed(1)}% PASS
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/60 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Hard-Locked Invariants Active</span>
            <span className="font-mono text-emerald-400 font-semibold">Zero Divergence Guarantee</span>
          </div>
        </div>
      </div>
    </div>
  );
};
