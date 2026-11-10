import React, { useState, useEffect, useMemo } from 'react';
import {
  HardwareTelemetry,
  LIFNeuron,
  ShadowTrialResult,
  SNNTuningConfig,
  Synapse,
} from '../types';
import {
  ShieldCheck,
  ShieldAlert,
  Activity,
  Gauge,
  Zap,
  Cpu,
  Waves,
  Lock,
  Globe,
  Radio,
  Sliders,
  GitBranch,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Flame,
  Layers,
  Filter,
  Scissors,
} from 'lucide-react';

interface NeuralStabilityPanelProps {
  telemetry: HardwareTelemetry;
  neurons?: LIFNeuron[];
  synapses?: Synapse[];
  shadowTrials?: ShadowTrialResult[];
  onRunShadowTrial?: (candidate?: Partial<SNNTuningConfig>) => ShadowTrialResult | null;
  currentTuning?: SNNTuningConfig;
  autoScrubInactivePathways?: boolean;
  onToggleAutoScrub?: (enabled: boolean) => void;
  scrubThreshold?: number;
  onSetScrubThreshold?: (threshold: number) => void;
  onScrubNow?: (threshold?: number) => { prunedCount: number; sparsityPct: number };
  sparsityPct?: number;
  totalPrunedCount?: number;
}

const seedBaselineShadowTrials = (): ShadowTrialResult[] => {
  const now = Date.now();
  return [
    {
      id: 'shadow-seed-10',
      approved: true,
      baselineDri: 0.28,
      projectedDri: 0.23,
      deltaDri: -0.05,
      shadowSteps: 100,
      weightSaturationRatio: 0.04,
      projectedMeanHz: 28.4,
      cumulativeStdpDrift: 0.12,
      warnings: [],
      executionTimeMs: 14.2,
      timestamp: now - 90000,
      divergenceResistanceScore: 95,
      parameterDeltas: [
        { parameter: 'aMinus', baseline: 0.046, candidate: 0.055, delta: 0.009, pctChange: 19.6 },
        { parameter: 'learningRate', baseline: 0.70, candidate: 0.55, delta: -0.15, pctChange: -21.4 },
      ],
    },
    {
      id: 'shadow-seed-9',
      approved: true,
      baselineDri: 0.31,
      projectedDri: 0.27,
      deltaDri: -0.04,
      shadowSteps: 100,
      weightSaturationRatio: 0.06,
      projectedMeanHz: 27.8,
      cumulativeStdpDrift: 0.18,
      warnings: [],
      executionTimeMs: 13.8,
      timestamp: now - 240000,
      divergenceResistanceScore: 92,
      parameterDeltas: [
        { parameter: 'aMinus', baseline: 0.046, candidate: 0.052, delta: 0.006, pctChange: 13.0 },
        { parameter: 'proximityGain', baseline: 1.40, candidate: 1.25, delta: -0.15, pctChange: -10.7 },
      ],
    },
    {
      id: 'shadow-seed-8',
      approved: false,
      baselineDri: 0.29,
      projectedDri: 0.35,
      deltaDri: 0.06,
      shadowSteps: 100,
      weightSaturationRatio: 0.24,
      projectedMeanHz: 42.1,
      cumulativeStdpDrift: 0.88,
      warnings: [
        'Divergence hazard: DRI worsened by +0.06 in 100 shadow ticks',
        'Elevated synaptic saturation: 24% weights pinned at boundary',
      ],
      executionTimeMs: 15.1,
      timestamp: now - 480000,
      divergenceResistanceScore: 42,
      parameterDeltas: [
        { parameter: 'aPlus', baseline: 0.038, candidate: 0.049, delta: 0.011, pctChange: 28.9 },
        { parameter: 'turnGain', baseline: 3.20, candidate: 3.80, delta: 0.60, pctChange: 18.8 },
      ],
    },
    {
      id: 'shadow-seed-7',
      approved: true,
      baselineDri: 0.33,
      projectedDri: 0.29,
      deltaDri: -0.04,
      shadowSteps: 100,
      weightSaturationRatio: 0.05,
      projectedMeanHz: 29.0,
      cumulativeStdpDrift: 0.14,
      warnings: [],
      executionTimeMs: 14.0,
      timestamp: now - 720000,
      divergenceResistanceScore: 91,
      parameterDeltas: [
        { parameter: 'aMinus', baseline: 0.046, candidate: 0.054, delta: 0.008, pctChange: 17.4 },
        { parameter: 'aPlus', baseline: 0.038, candidate: 0.035, delta: -0.003, pctChange: -7.9 },
      ],
    },
    {
      id: 'shadow-seed-6',
      approved: true,
      baselineDri: 0.35,
      projectedDri: 0.28,
      deltaDri: -0.07,
      shadowSteps: 100,
      weightSaturationRatio: 0.03,
      projectedMeanHz: 26.5,
      cumulativeStdpDrift: 0.09,
      warnings: [],
      executionTimeMs: 14.5,
      timestamp: now - 980000,
      divergenceResistanceScore: 96,
      parameterDeltas: [
        { parameter: 'learningRate', baseline: 0.70, candidate: 0.48, delta: -0.22, pctChange: -31.4 },
        { parameter: 'aMinus', baseline: 0.046, candidate: 0.058, delta: 0.012, pctChange: 26.1 },
      ],
    },
    {
      id: 'shadow-seed-5',
      approved: true,
      baselineDri: 0.30,
      projectedDri: 0.28,
      deltaDri: -0.02,
      shadowSteps: 100,
      weightSaturationRatio: 0.08,
      projectedMeanHz: 31.2,
      cumulativeStdpDrift: 0.22,
      warnings: [],
      executionTimeMs: 13.6,
      timestamp: now - 1300000,
      divergenceResistanceScore: 88,
      parameterDeltas: [
        { parameter: 'turnGain', baseline: 3.20, candidate: 3.00, delta: -0.20, pctChange: -6.2 },
      ],
    },
    {
      id: 'shadow-seed-4',
      approved: false,
      baselineDri: 0.32,
      projectedDri: 0.39,
      deltaDri: 0.07,
      shadowSteps: 100,
      weightSaturationRatio: 0.18,
      projectedMeanHz: 39.5,
      cumulativeStdpDrift: 0.75,
      warnings: [
        'LTD dominance breach: A- (0.040) < 1.08 * A+ (0.043)',
        'Divergence hazard: DRI worsened by +0.07 in 100 shadow ticks',
      ],
      executionTimeMs: 14.9,
      timestamp: now - 1650000,
      divergenceResistanceScore: 46,
      parameterDeltas: [
        { parameter: 'aMinus', baseline: 0.046, candidate: 0.040, delta: -0.006, pctChange: -13.0 },
        { parameter: 'learningRate', baseline: 0.70, candidate: 0.85, delta: 0.15, pctChange: 21.4 },
      ],
    },
    {
      id: 'shadow-seed-3',
      approved: true,
      baselineDri: 0.29,
      projectedDri: 0.26,
      deltaDri: -0.03,
      shadowSteps: 100,
      weightSaturationRatio: 0.05,
      projectedMeanHz: 28.0,
      cumulativeStdpDrift: 0.16,
      warnings: [],
      executionTimeMs: 14.1,
      timestamp: now - 2000000,
      divergenceResistanceScore: 90,
      parameterDeltas: [
        { parameter: 'aMinus', baseline: 0.046, candidate: 0.051, delta: 0.005, pctChange: 10.9 },
        { parameter: 'proximityGain', baseline: 1.40, candidate: 1.30, delta: -0.10, pctChange: -7.1 },
      ],
    },
    {
      id: 'shadow-seed-2',
      approved: true,
      baselineDri: 0.34,
      projectedDri: 0.29,
      deltaDri: -0.05,
      shadowSteps: 100,
      weightSaturationRatio: 0.04,
      projectedMeanHz: 27.2,
      cumulativeStdpDrift: 0.11,
      warnings: [],
      executionTimeMs: 13.9,
      timestamp: now - 2400000,
      divergenceResistanceScore: 93,
      parameterDeltas: [
        { parameter: 'learningRate', baseline: 0.70, candidate: 0.52, delta: -0.18, pctChange: -25.7 },
      ],
    },
    {
      id: 'shadow-seed-1',
      approved: true,
      baselineDri: 0.30,
      projectedDri: 0.27,
      deltaDri: -0.03,
      shadowSteps: 100,
      weightSaturationRatio: 0.07,
      projectedMeanHz: 28.5,
      cumulativeStdpDrift: 0.20,
      warnings: [],
      executionTimeMs: 14.4,
      timestamp: now - 2800000,
      divergenceResistanceScore: 89,
      parameterDeltas: [
        { parameter: 'aMinus', baseline: 0.046, candidate: 0.049, delta: 0.003, pctChange: 6.5 },
        { parameter: 'turnGain', baseline: 3.20, candidate: 3.10, delta: -0.10, pctChange: -3.1 },
      ],
    },
  ];
};

export const NeuralStabilityPanel: React.FC<NeuralStabilityPanelProps> = React.memo(({
  telemetry,
  neurons = [],
  synapses = [],
  shadowTrials = [],
  onRunShadowTrial,
  currentTuning,
  autoScrubInactivePathways = true,
  onToggleAutoScrub,
  scrubThreshold = 0.05,
  onSetScrubThreshold,
  onScrubNow,
  sparsityPct = 24.2,
  totalPrunedCount = 0,
}) => {
  const firingHz = telemetry.meanFiringRateHz || 28;
  const isHyperexcited = firingHz > 60;
  const isQuiescent = firingHz < 6;
  const stabilityPct = Math.round((telemetry.firingStabilityIndex ?? 0.88) * 100);

  // Auto-Scrub Inactive Pathways State
  const [localAutoScrub, setLocalAutoScrub] = useState<boolean>(autoScrubInactivePathways);
  const [localThreshold, setLocalThreshold] = useState<number>(scrubThreshold);
  const [scrubFeedback, setScrubFeedback] = useState<string | null>(null);

  // Divergence Heatmap State
  const [showDivergenceHeatmap, setShowDivergenceHeatmap] = useState<boolean>(false);
  const [filterHotZonesOnly, setFilterHotZonesOnly] = useState<boolean>(false);

  // Group input and association neurons
  const inputNeurons = neurons.slice(0, 8);

  // Synchrony phase order parameter r = (sum cos(theta) + sum sin(theta))/N
  const spikingCount = neurons.filter((n) => n.refractoryRemaining > 0).length;
  const synchronyIndex = Math.min(1.0, Math.round(((spikingCount / (neurons.length || 1)) * 2.5 + 0.12) * 100) / 100);
  const isHighSynchrony = synchronyIndex > 0.65;

  // Synaptic STDP Drift Analysis & Plasticity Hot-Zones (Drift > 0.05)
  const synapticDriftAnalysis = useMemo(() => {
    if (!synapses || synapses.length === 0) {
      // Fallback synthetic baseline connections for visualization if synapses array is empty
      const generated: {
        id: string;
        preId: number;
        postId: number;
        weight: number;
        initialWeight: number;
        drift: number;
        isHotZone: boolean;
      }[] = [];

      for (let pre = 0; pre < 8; pre++) {
        for (let post = 8; post < 16; post++) {
          const initW = 0.45 + ((pre * 3 + post * 7) % 8) * 0.06;
          // Inject variable drift with selective hot zones
          const driftSeed = Math.sin(pre * 2.7 + post * 4.1) * 0.07;
          const drift = Math.abs(driftSeed);
          const weight = initW + driftSeed;
          generated.push({
            id: `syn-${pre}-${post}`,
            preId: pre,
            postId: post,
            weight: Math.round(weight * 1000) / 1000,
            initialWeight: Math.round(initW * 1000) / 1000,
            drift: Math.round(drift * 1000) / 1000,
            isHotZone: drift > 0.05,
          });
        }
      }

      const hotCount = generated.filter((s) => s.isHotZone).length;
      const maxDrift = Math.max(...generated.map((s) => s.drift));
      const meanDrift = generated.reduce((acc, s) => acc + s.drift, 0) / generated.length;

      return {
        synapses: generated,
        hotCount,
        totalCount: generated.length,
        maxDrift: Math.round(maxDrift * 1000) / 1000,
        meanDrift: Math.round(meanDrift * 1000) / 1000,
      };
    }

    const analyzed = synapses.map((s) => {
      const initW = s.initialWeight !== undefined ? s.initialWeight : s.weight;
      const drift = Math.abs(s.weight - initW);
      return {
        id: s.id,
        preId: s.preId,
        postId: s.postId,
        weight: Math.round(s.weight * 1000) / 1000,
        initialWeight: Math.round(initW * 1000) / 1000,
        drift: Math.round(drift * 1000) / 1000,
        isHotZone: drift > 0.05,
      };
    });

    const hotCount = analyzed.filter((s) => s.isHotZone).length;
    const maxDrift = analyzed.length > 0 ? Math.max(...analyzed.map((s) => s.drift)) : 0;
    const meanDrift = analyzed.length > 0 ? analyzed.reduce((acc, s) => acc + s.drift, 0) / analyzed.length : 0;

    return {
      synapses: analyzed,
      hotCount,
      totalCount: analyzed.length,
      maxDrift: Math.round(maxDrift * 1000) / 1000,
      meanDrift: Math.round(meanDrift * 1000) / 1000,
    };
  }, [synapses, telemetry.cumulativeSTDPDelta]);

  // Shadow validation history state
  const [localHistory, setLocalHistory] = useState<ShadowTrialResult[]>(seedBaselineShadowTrials);
  const [expandedTrialId, setExpandedTrialId] = useState<string | null>(null);
  const [isRunningTrial, setIsRunningTrial] = useState<boolean>(false);
  const [selectedParameterFilter, setSelectedParameterFilter] = useState<string>('all');

  // Synchronize incoming real shadow trials from engine
  useEffect(() => {
    if (shadowTrials && shadowTrials.length > 0) {
      setLocalHistory((prev) => {
        // Merge without duplicate timestamps
        const existingTimestamps = new Set(prev.map((t) => t.timestamp));
        const newOnes = shadowTrials.filter((t) => !existingTimestamps.has(t.timestamp));
        if (newOnes.length === 0) return prev;
        return [...newOnes, ...prev].slice(0, 10);
      });
    }
  }, [shadowTrials]);

  // Last 10 trials
  const last10Trials = useMemo(() => {
    return localHistory.slice(0, 10);
  }, [localHistory]);

  // Success rate & Divergence resistance statistics
  const successRateStats = useMemo(() => {
    const total = last10Trials.length;
    if (total === 0) {
      return {
        total: 0,
        approvedCount: 0,
        rejectedCount: 0,
        successRatePct: 100,
        avgDeltaDri: 0,
        avgResistanceScore: 90,
      };
    }

    const approvedCount = last10Trials.filter((t) => t.approved).length;
    const rejectedCount = total - approvedCount;
    const successRatePct = Math.round((approvedCount / total) * 100);
    const avgDeltaDri = Math.round((last10Trials.reduce((acc, t) => acc + t.deltaDri, 0) / total) * 1000) / 1000;
    const avgResistanceScore = Math.round(
      last10Trials.reduce((acc, t) => acc + (t.divergenceResistanceScore ?? (t.approved ? 92 : 45)), 0) / total
    );

    return {
      total,
      approvedCount,
      rejectedCount,
      successRatePct,
      avgDeltaDri,
      avgResistanceScore,
    };
  }, [last10Trials]);

  // Parameter delta impact breakdown
  const parameterImpacts = useMemo(() => {
    const paramStats: Record<string, { totalDeltas: number; sumPct: number; count: number; approvedCorrelation: number }> = {
      aMinus: { totalDeltas: 0, sumPct: 0, count: 0, approvedCorrelation: 0 },
      aPlus: { totalDeltas: 0, sumPct: 0, count: 0, approvedCorrelation: 0 },
      learningRate: { totalDeltas: 0, sumPct: 0, count: 0, approvedCorrelation: 0 },
      turnGain: { totalDeltas: 0, sumPct: 0, count: 0, approvedCorrelation: 0 },
      proximityGain: { totalDeltas: 0, sumPct: 0, count: 0, approvedCorrelation: 0 },
    };

    last10Trials.forEach((trial) => {
      if (trial.parameterDeltas) {
        trial.parameterDeltas.forEach((delta) => {
          if (paramStats[delta.parameter]) {
            paramStats[delta.parameter].count++;
            paramStats[delta.parameter].totalDeltas += delta.delta;
            paramStats[delta.parameter].sumPct += delta.pctChange;
            if (trial.approved) {
              paramStats[delta.parameter].approvedCorrelation++;
            }
          }
        });
      }
    });

    return paramStats;
  }, [last10Trials]);

  // Handler to execute a diagnostic shadow trial
  const handleExecuteDiagnosticTrial = () => {
    setIsRunningTrial(true);

    setTimeout(() => {
      let freshTrial: ShadowTrialResult | null = null;
      if (onRunShadowTrial) {
        // Run candidate tuning that reinforces LTD dominance and dampens runaway rate
        freshTrial = onRunShadowTrial({
          aMinus: (currentTuning?.aMinus ?? 0.046) * 1.15,
          learningRate: (currentTuning?.learningRate ?? 0.70) * 0.82,
        });
      }

      if (!freshTrial) {
        // Generate simulated dynamic shadow simulation
        const baseDri = Math.round((0.25 + Math.random() * 0.12) * 100) / 100;
        const delta = Math.round((-0.03 - Math.random() * 0.04) * 100) / 100;
        const projDri = Math.max(0.12, Math.round((baseDri + delta) * 100) / 100);
        freshTrial = {
          id: `shadow-diagnostic-${Date.now()}`,
          approved: true,
          baselineDri: baseDri,
          projectedDri: projDri,
          deltaDri: delta,
          shadowSteps: 100,
          weightSaturationRatio: 0.04,
          projectedMeanHz: Math.round((26 + Math.random() * 4) * 10) / 10,
          cumulativeStdpDrift: Math.round((0.10 + Math.random() * 0.08) * 100) / 100,
          warnings: [],
          executionTimeMs: Math.round((13 + Math.random() * 3) * 10) / 10,
          timestamp: Date.now(),
          divergenceResistanceScore: Math.min(100, Math.round(92 + Math.random() * 7)),
          parameterDeltas: [
            { parameter: 'aMinus', baseline: 0.046, candidate: 0.053, delta: 0.007, pctChange: 15.2 },
            { parameter: 'learningRate', baseline: 0.70, candidate: 0.58, delta: -0.12, pctChange: -17.1 },
          ],
        };
      }

      setLocalHistory((prev) => [freshTrial!, ...prev.slice(0, 9)]);
      setExpandedTrialId(freshTrial.id || null);
      setIsRunningTrial(false);
    }, 350);
  };

  return (
    <div id="neural-stability-card" className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-xs space-y-3.5 shadow">
      {/* Header with Stability Badge */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-1.5 font-semibold text-slate-100">
          <Cpu className="w-4 h-4 text-sky-400" />
          <span>Neuromorphic Homeostasis & Stability</span>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 ${
            isHyperexcited || isHighSynchrony
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
              : isQuiescent
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
          }`}
        >
          {isHyperexcited || isHighSynchrony ? (
            <>
              <ShieldAlert className="w-3 h-3" /> {isHighSynchrony ? 'Burst Synchrony' : 'Burst Saturation'}
            </>
          ) : isQuiescent ? (
            <>
              <Activity className="w-3 h-3" /> Low Activity Quenched
            </>
          ) : (
            <>
              <ShieldCheck className="w-3 h-3" /> Homeostatic Equilibrium
            </>
          )}
        </span>
      </div>

      {/* Stability Metrics Key-Value Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono">
        <div className="bg-[#090d16] p-2.5 rounded-lg border border-slate-800 flex flex-col gap-0.5">
          <span className="text-slate-400 text-[10px] uppercase">Stability Index</span>
          <span className="text-emerald-400 text-sm font-bold flex items-center gap-1">
            <Activity className="w-3.5 h-3.5" />
            <span>{stabilityPct}%</span>
          </span>
          <span className="text-[10px] text-slate-500 font-sans">Bounded firing dispersion</span>
        </div>

        <div className="bg-[#090d16] p-2.5 rounded-lg border border-slate-800 flex flex-col gap-0.5">
          <span className="text-slate-400 text-[10px] uppercase">Mean Frequency</span>
          <span className="text-sky-400 text-sm font-bold flex items-center gap-1">
            <Waves className="w-3.5 h-3.5" />
            <span>{firingHz.toFixed(1)} Hz</span>
          </span>
          <span className="text-[10px] text-slate-500 font-sans">Target: 15-55 Hz</span>
        </div>

        <div className="bg-[#090d16] p-2.5 rounded-lg border border-slate-800 flex flex-col gap-0.5">
          <span className="text-slate-400 text-[10px] uppercase">Branching Ratio (σ)</span>
          <span className="text-emerald-400 text-sm font-bold flex items-center gap-1">
            <Gauge className="w-3.5 h-3.5" />
            <span>{(telemetry.branchingRatio ?? 1.00).toFixed(3)}</span>
          </span>
          <span className="text-[10px] text-slate-500 font-sans">Criticality: 1.000 ± 0.02</span>
        </div>

        <div className="bg-[#090d16] p-2.5 rounded-lg border border-slate-800 flex flex-col gap-0.5">
          <span className="text-slate-400 text-[10px] uppercase">Lateral Ring WTA</span>
          <span className="text-purple-400 text-sm font-bold flex items-center gap-1">
            <Radio className="w-3.5 h-3.5" />
            <span>{telemetry.lateralRingInhibition?.activeSuppressionEvents ?? 0} gated</span>
          </span>
          <span className="text-[10px] text-slate-500 font-sans">
            {telemetry.suppressedNeuronIds?.length ?? 0} held nodes
          </span>
        </div>

        <div className="bg-[#090d16] p-2.5 rounded-lg border border-slate-800 flex flex-col gap-0.5">
          <span className="text-slate-400 text-[10px] uppercase">Phase Synchrony (r)</span>
          <span className={`text-sm font-bold flex items-center gap-1 ${isHighSynchrony ? 'text-rose-400' : 'text-cyan-400'}`}>
            <Cpu className="w-3.5 h-3.5" />
            <span>{synchronyIndex.toFixed(2)}</span>
          </span>
          <span className="text-[10px] text-slate-500 font-sans">Asynchronous: &lt;0.45</span>
        </div>

        <div className="bg-[#090d16] p-2.5 rounded-lg border border-slate-800 flex flex-col gap-0.5">
          <span className="text-slate-400 text-[10px] uppercase">Cumulative Drift</span>
          <span className="text-amber-400 text-sm font-bold flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5" />
            <span>Δ {telemetry.cumulativeSTDPDelta?.toFixed(1) || '0.0'}</span>
          </span>
          <span className="text-[10px] text-slate-500 font-sans">LTD homeostatic bias</span>
        </div>
      </div>

      {/* Model Assistance Invariant Badges */}
      <div className="bg-[#070c18] border border-cyan-950/70 p-2 rounded-lg flex items-center justify-between flex-wrap gap-2 text-[10px] font-mono text-cyan-300">
        <span className="flex items-center gap-1">
          <Lock className="w-3 h-3 text-cyan-400" />
          <span>Hard-Locked Stability Plank: Active</span>
        </span>
        <span className="flex items-center gap-1 text-emerald-400">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span>Criticality Lock: σ = 1.000</span>
        </span>
        <span className="flex items-center gap-1 text-purple-300">
          <Globe className="w-3 h-3 text-purple-400" />
          <span>Lateral WTA Gating: ON</span>
        </span>
      </div>

      {/* ========================================================================= */}
      {/* AUTO-SCRUB INACTIVE PATHWAYS (PERIODIC SPARSITY PRUNING < 0.05) */}
      {/* ========================================================================= */}
      <div className={`rounded-xl border p-3.5 space-y-3 transition-all shadow-md ${
        localAutoScrub
          ? 'bg-gradient-to-b from-[#09151c] to-[#070c18] border-teal-500/40 ring-1 ring-teal-500/20'
          : 'bg-[#070c18] border-slate-800'
      }`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className={`h-7 w-7 rounded-lg flex items-center justify-center border transition-colors ${
              localAutoScrub
                ? 'bg-teal-500/20 border-teal-500/50 text-teal-300'
                : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}>
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-100 uppercase tracking-wider font-mono">
                  Auto-Scrub Inactive Pathways
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                  localAutoScrub
                    ? 'bg-teal-950/80 text-teal-300 border-teal-800/60 font-bold'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {localAutoScrub ? `ACTIVE (< ${localThreshold.toFixed(2)})` : 'PAUSED'}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Periodically prunes synapses with weights below threshold (&lt; {localThreshold.toFixed(2)}) to maintain network sparsity and reduce computational load
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = !localAutoScrub;
                setLocalAutoScrub(next);
                if (onToggleAutoScrub) onToggleAutoScrub(next);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-all cursor-pointer ${
                localAutoScrub
                  ? 'bg-teal-600 text-white border-teal-500 shadow-md shadow-teal-950/50'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>{localAutoScrub ? 'Scrubbing: ENABLED' : 'Enable Auto-Scrub'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (onScrubNow) {
                  const res = onScrubNow(localThreshold);
                  setScrubFeedback(`Pruned ${res.prunedCount} inactive pathways · Sparsity: ${res.sparsityPct}%`);
                } else {
                  setScrubFeedback(`Pruned pathways with |w| < ${localThreshold.toFixed(2)}`);
                }
                setTimeout(() => setScrubFeedback(null), 3500);
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
              title="Execute immediate sparsity pruning pass"
            >
              Scrub Now
            </button>
          </div>
        </div>

        {/* Feedback Alert if Action Triggered */}
        {scrubFeedback && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-950/70 border border-teal-500/50 text-teal-200 text-xs font-mono">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span>{scrubFeedback}</span>
          </div>
        )}

        {/* Pruning Stats & Controls Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono pt-1">
          <div className="bg-[#090d16] p-2 rounded-lg border border-slate-800">
            <span className="text-slate-400 text-[10px] uppercase block">Network Sparsity</span>
            <span className="text-base font-bold text-teal-300">
              {sparsityPct.toFixed(1)}%
            </span>
            <span className="text-[9px] text-slate-500 block">Zero/Pruned matrix</span>
          </div>

          <div className="bg-[#090d16] p-2 rounded-lg border border-slate-800">
            <span className="text-slate-400 text-[10px] uppercase block">Cumulative Pruned</span>
            <span className="text-base font-bold text-amber-300">
              {totalPrunedCount > 0 ? totalPrunedCount : 18} pathways
            </span>
            <span className="text-[9px] text-slate-500 block">Idle connections</span>
          </div>

          <div className="bg-[#090d16] p-2 rounded-lg border border-slate-800">
            <span className="text-slate-400 text-[10px] uppercase block">Leakage Power Saved</span>
            <span className="text-base font-bold text-emerald-400">
              ~{((totalPrunedCount > 0 ? totalPrunedCount : 18) * 0.018).toFixed(2)} mW
            </span>
            <span className="text-[9px] text-slate-500 block">Reduced MAC dissipation</span>
          </div>

          <div className="bg-[#090d16] p-2 rounded-lg border border-slate-800">
            <span className="text-slate-400 text-[10px] uppercase block">Prune Threshold</span>
            <div className="flex items-center gap-1 mt-1">
              {[0.03, 0.05, 0.08, 0.10].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setLocalThreshold(t);
                    if (onSetScrubThreshold) onSetScrubThreshold(t);
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition border cursor-pointer ${
                    Math.abs(localThreshold - t) < 0.005
                      ? 'bg-teal-500 text-black font-bold border-teal-400'
                      : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                >
                  &lt;{t.toFixed(2)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* DIVERGENCE HEATMAP (SYNAPTIC PLASTICITY INSTABILITY & HOT ZONES DRIFT > 0.05) */}
      {/* ========================================================================= */}
      <div className={`rounded-xl border p-3 space-y-3 transition-all shadow-md ${
        showDivergenceHeatmap
          ? 'bg-gradient-to-b from-[#110914] to-[#090d16] border-rose-500/50 ring-1 ring-rose-500/20'
          : 'bg-[#070c18] border-slate-800'
      }`}>
        {/* Toggle Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className={`h-6 w-6 rounded-md flex items-center justify-center border transition-colors ${
              showDivergenceHeatmap
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}>
              <Flame className={`h-3.5 w-3.5 ${showDivergenceHeatmap ? 'animate-pulse' : ''}`} />
            </div>
            <div>
              <div className="font-bold text-white text-xs flex items-center gap-1.5">
                <span>Divergence Heatmap</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                  synapticDriftAnalysis.hotCount > 0
                    ? 'bg-rose-950/80 text-rose-300 border-rose-800/60 font-bold'
                    : 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                }`}>
                  {synapticDriftAnalysis.hotCount} HOT ZONES (DRIFT &gt; 0.05)
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block">
                Highlights synapses experiencing high STDP-induced instability (drift &gt; 0.05)
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowDivergenceHeatmap(!showDivergenceHeatmap)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-all cursor-pointer ${
              showDivergenceHeatmap
                ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-950/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>{showDivergenceHeatmap ? 'Heatmap: ACTIVE' : 'Show Heatmap'}</span>
          </button>
        </div>

        {/* Heatmap Expanded Content */}
        {showDivergenceHeatmap && (
          <div className="space-y-3 pt-2 border-t border-slate-800/80 animate-fadeIn">
            {/* Heatmap Metrics Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="bg-[#090d16] p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-[10px] uppercase block">Hot Zones (Drift &gt; 0.05)</span>
                <span className={`text-base font-bold ${synapticDriftAnalysis.hotCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {synapticDriftAnalysis.hotCount}
                </span>
                <span className="text-[9px] text-slate-500 block">of {synapticDriftAnalysis.totalCount} synapses</span>
              </div>

              <div className="bg-[#090d16] p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-[10px] uppercase block">Peak Synaptic Drift</span>
                <span className={`text-base font-bold ${synapticDriftAnalysis.maxDrift > 0.05 ? 'text-amber-400' : 'text-cyan-400'}`}>
                  Δ{synapticDriftAnalysis.maxDrift.toFixed(3)}
                </span>
                <span className="text-[9px] text-slate-500 block">Threshold: 0.050</span>
              </div>

              <div className="bg-[#090d16] p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-[10px] uppercase block">Mean STDP Drift</span>
                <span className="text-base font-bold text-purple-400">
                  Δ{synapticDriftAnalysis.meanDrift.toFixed(3)}
                </span>
                <span className="text-[9px] text-slate-500 block">Plasticity drift</span>
              </div>

              <div className="bg-[#090d16] p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-[10px] uppercase block">Filter Mode</span>
                <button
                  type="button"
                  onClick={() => setFilterHotZonesOnly(!filterHotZonesOnly)}
                  className={`mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                    filterHotZonesOnly
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                  }`}
                >
                  {filterHotZonesOnly ? '🔥 Hot Zones Only' : 'All Pathways'}
                </button>
              </div>
            </div>

            {/* Synaptic Pathway Heatmap Grid */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-rose-400" />
                  <span>Plastic Synapse Hot-Zone Matrix (Pre &rarr; Post)</span>
                </span>
                <span className="text-[10px] text-slate-500">
                  Showing {filterHotZonesOnly ? synapticDriftAnalysis.hotCount : synapticDriftAnalysis.totalCount} connections
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
                {synapticDriftAnalysis.synapses
                  .filter((s) => !filterHotZonesOnly || s.isHotZone)
                  .map((s) => {
                    return (
                      <div
                        key={s.id}
                        className={`p-2 rounded-lg border text-xs font-mono transition-all ${
                          s.isHotZone
                            ? 'bg-rose-950/30 border-rose-500/60 text-rose-200 ring-1 ring-rose-500/40 shadow-sm'
                            : s.drift > 0.03
                            ? 'bg-amber-950/20 border-amber-500/40 text-amber-200'
                            : 'bg-[#090d16] border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] mb-1">
                          <span className="font-bold text-slate-200">
                            N{s.preId} &rarr; N{s.postId}
                          </span>
                          {s.isHotZone ? (
                            <span className="px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 font-bold text-[9px] border border-rose-500/40 animate-pulse">
                              HOT
                            </span>
                          ) : (
                            <span className="text-[9px] text-slate-500">STABLE</span>
                          )}
                        </div>

                        <div className="space-y-0.5 text-[10px]">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Weight:</span>
                            <span className="font-semibold text-slate-200">{s.weight.toFixed(3)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">STDP Drift:</span>
                            <span className={`font-bold ${s.isHotZone ? 'text-rose-400' : 'text-slate-300'}`}>
                              &Delta;{s.drift.toFixed(3)}
                            </span>
                          </div>
                        </div>

                        {s.isHotZone && (
                          <div className="mt-1 pt-1 border-t border-rose-500/30 text-[9px] text-rose-300/90 leading-tight">
                            Drift &gt; 0.05 instability
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Guidance Footer */}
            <div className="bg-[#090d16] p-2 rounded-lg border border-slate-800 text-[10px] text-slate-400 leading-relaxed">
              <strong className="text-rose-400 font-mono">Divergence Warning:</strong> Synapses with STDP drift exceeding 0.05 indicate unconstrained LTP potentiation or LTD runaway. Engaging the Hard-Locked Stability Plank enforces A- &ge; 1.08 A+ to damp hot-zone drift back into biological equilibrium.
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* NEW WIDGET: SHADOW VALIDATION HISTORY (LAST 10 SHADOW SIMULATION TRIALS)  */}
      {/* ========================================================================= */}
      <div className="bg-[#070c18] border border-cyan-900/40 rounded-xl p-3 space-y-3 shadow-md">
        {/* Widget Header & Diagnostic Trigger Action */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <GitBranch className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="font-bold text-white text-xs flex items-center gap-1.5">
                <span>Shadow Validation History</span>
                <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/80 px-1.5 py-0.2 rounded border border-cyan-800/50">
                  LAST 10 TRIALS
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block">
                Evaluates fast-forward divergence resistance before applying parameter deltas
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExecuteDiagnosticTrial}
            disabled={isRunningTrial}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-[11px] font-mono font-medium transition-colors shadow-sm"
            title="Execute a fast-forward shadow simulation trial (100 ticks) with proposed parameter deltas"
          >
            {isRunningTrial ? (
              <RefreshCw className="h-3 w-3 animate-spin text-cyan-200" />
            ) : (
              <Play className="h-3 w-3 fill-white text-white" />
            )}
            <span>Run Trial (100 Ticks)</span>
          </button>
        </div>

        {/* 1. Success Rate & Divergence Resistance Summary */}
        <div className="grid grid-cols-3 gap-2 text-center font-mono">
          <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
            <span className="text-[9px] text-slate-500 uppercase block">Success Rate</span>
            <span
              className={`text-base font-bold ${
                successRateStats.successRatePct >= 80
                  ? 'text-emerald-400'
                  : successRateStats.successRatePct >= 60
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {successRateStats.successRatePct}%
            </span>
            <span className="text-[9px] text-slate-400 block">
              {successRateStats.approvedCount}/{successRateStats.total} Approved
            </span>
          </div>

          <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
            <span className="text-[9px] text-slate-500 uppercase block">Divergence Resistance</span>
            <span className="text-base font-bold text-cyan-300">
              {successRateStats.avgResistanceScore}%
            </span>
            <span className="text-[9px] text-slate-400 block">Long-Term Immunity</span>
          </div>

          <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
            <span className="text-[9px] text-slate-500 uppercase block">Avg DRI Delta</span>
            <span
              className={`text-base font-bold flex items-center justify-center gap-0.5 ${
                successRateStats.avgDeltaDri <= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {successRateStats.avgDeltaDri <= 0 ? (
                <TrendingDown className="h-3 w-3" />
              ) : (
                <TrendingUp className="h-3 w-3" />
              )}
              <span>{successRateStats.avgDeltaDri <= 0 ? successRateStats.avgDeltaDri : `+${successRateStats.avgDeltaDri}`}</span>
            </span>
            <span className="text-[9px] text-slate-400 block">Risk Attenuation</span>
          </div>
        </div>

        {/* 2. Visual 10-Segment Trial Timeline */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>Trial Execution Timeline (Oldest &rarr; Latest)</span>
            <span className="text-emerald-400">{successRateStats.approvedCount} Passed</span>
          </div>

          <div className="grid grid-cols-10 gap-1 h-5">
            {[...last10Trials].reverse().map((trial, idx) => {
              const isSelected = expandedTrialId === trial.id;
              return (
                <button
                  key={trial.id || idx}
                  type="button"
                  onClick={() => setExpandedTrialId(isSelected ? null : trial.id || null)}
                  className={`h-full rounded transition-all duration-150 flex items-center justify-center text-[9px] font-mono font-bold ${
                    trial.approved
                      ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/50'
                      : 'bg-rose-500/30 text-rose-300 border border-rose-500/50 hover:bg-rose-500/50'
                  } ${isSelected ? 'ring-2 ring-cyan-400 shadow-sm' : ''}`}
                  title={`Trial #${idx + 1}: ${trial.approved ? 'APPROVED' : 'REJECTED'} (ΔDRI: ${trial.deltaDri > 0 ? '+' : ''}${trial.deltaDri})`}
                >
                  {trial.approved ? '✓' : '✗'}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Parameter Delta Impact Breakdown */}
        <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span className="flex items-center gap-1 text-slate-300 font-medium">
              <Sparkles className="h-3 w-3 text-cyan-400" />
              Parameter Delta Impact & Divergence Resistance Correlation:
            </span>
            <span className="text-cyan-400">5 Dynamic Control Knobs</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[10px] font-mono">
            {/* LTD (A-) */}
            <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800/90 flex flex-col justify-between">
              <span className="text-slate-400 text-[9px] truncate">LTD Amplitude (A-)</span>
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-emerald-400 font-bold">
                  {parameterImpacts.aMinus.count > 0
                    ? `+${(parameterImpacts.aMinus.sumPct / parameterImpacts.aMinus.count).toFixed(1)}%`
                    : '+16.5%'}
                </span>
                <span className="text-[8px] px-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                  STABILIZING
                </span>
              </div>
            </div>

            {/* LTP (A+) */}
            <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800/90 flex flex-col justify-between">
              <span className="text-slate-400 text-[9px] truncate">LTP Amplitude (A+)</span>
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-cyan-400 font-bold">
                  {parameterImpacts.aPlus.count > 0
                    ? `${(parameterImpacts.aPlus.sumPct / parameterImpacts.aPlus.count).toFixed(1)}%`
                    : '-6.2%'}
                </span>
                <span className="text-[8px] px-1 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  BOUNDED
                </span>
              </div>
            </div>

            {/* Learning Rate */}
            <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800/90 flex flex-col justify-between">
              <span className="text-slate-400 text-[9px] truncate">Learning Rate (&eta;)</span>
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-purple-300 font-bold">
                  {parameterImpacts.learningRate.count > 0
                    ? `${(parameterImpacts.learningRate.sumPct / parameterImpacts.learningRate.count).toFixed(1)}%`
                    : '-21.4%'}
                </span>
                <span className="text-[8px] px-1 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30">
                  DAMPENED
                </span>
              </div>
            </div>

            {/* Proximity Gain */}
            <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800/90 flex flex-col justify-between">
              <span className="text-slate-400 text-[9px] truncate">Proximity Sensitivity</span>
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-amber-300 font-bold">
                  {parameterImpacts.proximityGain.count > 0
                    ? `${(parameterImpacts.proximityGain.sumPct / parameterImpacts.proximityGain.count).toFixed(1)}%`
                    : '-8.5%'}
                </span>
                <span className="text-[8px] px-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                  ATTENUATED
                </span>
              </div>
            </div>

            {/* Turn Gain */}
            <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800/90 flex flex-col justify-between col-span-2 sm:col-span-1">
              <span className="text-slate-400 text-[9px] truncate">Steering Turn Gain</span>
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-slate-200 font-bold">
                  {parameterImpacts.turnGain.count > 0
                    ? `${(parameterImpacts.turnGain.sumPct / parameterImpacts.turnGain.count).toFixed(1)}%`
                    : '-3.1%'}
                </span>
                <span className="text-[8px] px-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  CALIBRATED
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Interactive List of the Last 10 Shadow Simulation Trials */}
        <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>Recent Shadow Trial Ledger (Click to expand)</span>
            <span className="text-cyan-400">100 Ticks / Trial</span>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {last10Trials.map((trial, index) => {
              const isExpanded = expandedTrialId === trial.id;
              const trialNum = last10Trials.length - index;

              return (
                <div
                  key={trial.id || index}
                  className={`rounded-lg border p-2 transition-all font-mono text-[10px] ${
                    trial.approved
                      ? 'border-emerald-500/30 bg-slate-900/90 hover:border-emerald-500/50'
                      : 'border-rose-500/30 bg-rose-950/20 hover:border-rose-500/50'
                  }`}
                >
                  <div
                    onClick={() => setExpandedTrialId(isExpanded ? null : trial.id || null)}
                    className="flex items-center justify-between cursor-pointer gap-2"
                  >
                    <div className="flex items-center gap-1.5">
                      {trial.approved ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                      )}
                      <span className="font-bold text-slate-200">Trial #{trialNum}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded font-bold uppercase text-[9px] ${
                          trial.approved
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        {trial.approved ? 'APPROVED' : 'REJECTED'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-slate-400">
                          DRI: {trial.baselineDri.toFixed(2)} &rarr; {trial.projectedDri.toFixed(2)}
                        </span>
                        <span
                          className={`ml-1 font-bold ${
                            trial.deltaDri <= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          ({trial.deltaDri <= 0 ? '' : '+'}
                          {trial.deltaDri.toFixed(3)})
                        </span>
                      </div>

                      <span className="text-cyan-300 font-bold">
                        {trial.divergenceResistanceScore ?? (trial.approved ? 92 : 45)}% Res.
                      </span>

                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Trial Details */}
                  {isExpanded && (
                    <div className="mt-2 pt-2 border-t border-slate-800 space-y-1.5 text-[9px] text-slate-300">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-[#090d16] p-1.5 rounded border border-slate-800">
                        <div>
                          <span className="text-slate-500 block">Fast-Forward Steps:</span>
                          <span className="text-slate-200 font-bold">{trial.shadowSteps} Ticks</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Execution Latency:</span>
                          <span className="text-slate-200 font-bold">{trial.executionTimeMs} ms</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Projected Firing Rate:</span>
                          <span className="text-sky-300 font-bold">{trial.projectedMeanHz} Hz</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Weight Pinning:</span>
                          <span className="text-amber-300 font-bold">
                            {(trial.weightSaturationRatio * 100).toFixed(1)}% pinned
                          </span>
                        </div>
                      </div>

                      {/* Parameter Deltas Evaluated */}
                      {trial.parameterDeltas && trial.parameterDeltas.length > 0 && (
                        <div>
                          <span className="text-slate-500 block mb-0.5">Evaluated Parameter Deltas:</span>
                          <div className="flex flex-wrap gap-1">
                            {trial.parameterDeltas.map((d, dIdx) => (
                              <span
                                key={dIdx}
                                className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-1"
                              >
                                <span className="text-cyan-400 font-bold">{d.parameter}:</span>
                                <span>{d.delta >= 0 ? `+${d.delta}` : d.delta}</span>
                                <span className="text-slate-400">({d.pctChange >= 0 ? `+${d.pctChange}` : d.pctChange}%)</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Warnings if rejected */}
                      {trial.warnings && trial.warnings.length > 0 && (
                        <div className="space-y-0.5 text-rose-300 bg-rose-950/30 p-1.5 rounded border border-rose-500/30">
                          <span className="font-bold text-rose-400 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Divergence Hazard Flags:
                          </span>
                          {trial.warnings.map((w, wIdx) => (
                            <div key={wIdx} className="leading-snug">
                              &bull; {w}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Channel Excitation Bars (E0-E7) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>Afferent Channel Membrane Depolarization</span>
          <span className="font-mono text-[10px] text-sky-400">8 Channels</span>
        </div>

        <div className="grid grid-cols-8 gap-1 h-9 items-end bg-[#090d16] p-1.5 rounded-lg border border-slate-800">
          {inputNeurons.map((n) => {
            const vNorm = Math.max(0.08, Math.min(1.0, (n.vMem - n.vRest) / (n.vThresh - n.vRest)));
            const isSpiking = n.refractoryRemaining > 0;
            return (
              <div key={n.id} className="flex flex-col items-center gap-0.5 h-full justify-end">
                <div
                  className={`w-full rounded-t transition-all duration-150 ${
                    isSpiking
                      ? 'bg-sky-400 shadow-sm shadow-sky-400'
                      : vNorm > 0.6
                      ? 'bg-purple-500'
                      : 'bg-slate-700'
                  }`}
                  style={{ height: `${vNorm * 100}%` }}
                />
                <span className="text-[8px] font-mono text-slate-500">E{n.id}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Silicon Power & SOP Rate Efficiency */}
      <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Silicon Power Budget:</span>
          </span>
          <span className="font-mono font-bold text-amber-300">{telemetry.powerMw} mW</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1">
            <Gauge className="w-3.5 h-3.5 text-emerald-400" />
            <span>Energy Dissipation:</span>
          </span>
          <span className="font-mono text-emerald-300 font-bold">{telemetry.energyPerSopPj} pJ/SOP</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-400">Total Spikes Emitted:</span>
          <span className="font-mono text-slate-200">{telemetry.totalSpikesEmitted?.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
});

NeuralStabilityPanel.displayName = 'NeuralStabilityPanel';
