import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Activity,
  RotateCcw,
  Sparkles,
  Info,
  Flame,
  Tag,
  CheckCircle2,
  X,
  Filter,
  Layers,
  Search,
  Wrench,
  Radio,
  FileText,
} from 'lucide-react';
import {
  DriftSubsystemSource,
  DriftSpikeTag,
  DriftSpikeEvidence,
  LTDInjectionEvent,
  HardwareTelemetry,
} from '../types';
import { classifyDriftSubsystem } from '../lib/synapticDriftGuard';
import { SNNEngine } from '../lib/snnEngine';

interface TimeToDriftPredictorProps {
  driHistory: number[]; // Last 60 seconds of DRI values (in 0-100% or 0-1.0)
  currentDRI: number; // Current live DRI (in 0-100% or 0-1.0)
  runawayThreshold?: number; // Target runaway threshold (default 55.0%)
  warningThreshold?: number; // Pre-emptive warning threshold (default 35.0%)
  recentEvents?: LTDInjectionEvent[];
  engine?: SNNEngine;
  telemetry?: HardwareTelemetry;
  onTriggerCorrection?: () => void;
  onSimulateBurst?: () => void;
  onInspectPostMortem?: (tag: DriftSpikeTag | LTDInjectionEvent) => void;
}

export const TimeToDriftPredictor: React.FC<TimeToDriftPredictorProps> = ({
  driHistory,
  currentDRI,
  runawayThreshold = 55.0,
  warningThreshold = 35.0,
  recentEvents = [],
  engine,
  telemetry,
  onTriggerCorrection,
  onSimulateBurst,
  onInspectPostMortem,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<'runaway' | 'warning'>('runaway');

  // Auto-Tag Drift Events state
  const [autoTagEnabled, setAutoTagEnabled] = useState<boolean>(true);
  const [subsystemFilter, setSubsystemFilter] = useState<'all' | DriftSubsystemSource>('all');
  const [activePostMortem, setActivePostMortem] = useState<DriftSpikeTag | null>(null);

  // Normalize inputs to percentage scale (0 to 100)
  const normalizedCurrentDRI = currentDRI <= 1.0 ? currentDRI * 100 : currentDRI;
  const targetThreshold = selectedTarget === 'runaway' ? runawayThreshold : warningThreshold;

  const normalizedHistory = useMemo(() => {
    if (!driHistory || driHistory.length === 0) {
      return Array(60).fill(normalizedCurrentDRI);
    }
    return driHistory.map((v) => (v <= 1.0 ? v * 100 : v)).slice(-60);
  }, [driHistory, normalizedCurrentDRI]);

  // Linear Regression Calculation: y = m * x + b
  const regression = useMemo(() => {
    const n = normalizedHistory.length;
    if (n < 3) {
      return {
        slope: 0,
        intercept: normalizedCurrentDRI,
        rSquared: 0,
        timeToDriftSeconds: Infinity,
        status: 'STABLE' as const,
        predictedRunawayTime: null,
      };
    }

    // x values are 0, 1, 2, ..., n-1 (seconds)
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i++) {
      const x = i;
      const y = normalizedHistory[i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }

    const meanX = sumX / n;
    const meanY = sumY / n;

    const ssXX = sumXX - n * meanX * meanX;
    const ssXY = sumXY - n * meanX * meanY;

    // Slope (DRI % change per second)
    const slope = ssXX !== 0 ? ssXY / ssXX : 0;
    const intercept = meanY - slope * meanX;

    // Calculate R² (Goodness of Fit)
    let ssTot = 0;
    let ssRes = 0;
    for (let i = 0; i < n; i++) {
      const y = normalizedHistory[i];
      const yPred = slope * i + intercept;
      ssTot += Math.pow(y - meanY, 2);
      ssRes += Math.pow(y - yPred, 2);
    }
    const rSquared = ssTot > 0.001 ? Math.max(0, Math.min(1.0, 1 - ssRes / ssTot)) : 1.0;

    const currentVal = normalizedHistory[n - 1];

    // Compute Time to Drift (TTD)
    let timeToDriftSeconds: number = Infinity;
    let status: 'CRITICAL' | 'WARNING' | 'ELEVATED' | 'STABLE' = 'STABLE';

    if (currentVal >= targetThreshold) {
      timeToDriftSeconds = 0;
      status = 'CRITICAL';
    } else if (slope > 0.005) {
      // Positive drift velocity towards target threshold
      const remainingDRI = targetThreshold - currentVal;
      timeToDriftSeconds = Math.max(1, Math.round(remainingDRI / slope));

      if (timeToDriftSeconds <= 30) {
        status = 'CRITICAL';
      } else if (timeToDriftSeconds <= 90) {
        status = 'WARNING';
      } else {
        status = 'ELEVATED';
      }
    } else {
      // Flat or negative slope (stabilizing or decaying)
      timeToDriftSeconds = Infinity;
      status = 'STABLE';
    }

    const predictedRunawayTime =
      timeToDriftSeconds !== Infinity && timeToDriftSeconds > 0
        ? new Date(Date.now() + timeToDriftSeconds * 1000).toLocaleTimeString()
        : null;

    return {
      slope,
      intercept,
      rSquared,
      timeToDriftSeconds,
      status,
      predictedRunawayTime,
      currentVal,
    };
  }, [normalizedHistory, normalizedCurrentDRI, targetThreshold]);

  // =========================================================================
  // Auto-Tag Drift Events Feature: Annotates drift spikes in the 60s timeline
  // with the primary subsystem source (AER saturation, STDP runaway, etc.)
  // =========================================================================
  const taggedSpikes: DriftSpikeTag[] = useMemo(() => {
    if (!autoTagEnabled || normalizedHistory.length < 5) return [];

    const n = normalizedHistory.length;
    const detected: DriftSpikeTag[] = [];
    const minSeparationSec = 4; // Prevent overlapping annotations
    let lastTaggedIndex = -minSeparationSec;

    // Build context from engine and telemetry
    const aMinus = engine?.stdpConfig?.aMinus ?? 0.052;
    const aPlus = engine?.stdpConfig?.aPlus ?? 0.032;
    const domRatio = aMinus / Math.max(0.001, aPlus);

    const context = {
      aerLatencyMs: telemetry?.aerLatencyMs ?? 1.15,
      droppedSignalCount: telemetry?.droppedSignalCount ?? 0,
      jitterMs: engine?.instantaneousJitterMs ?? 0.12,
      stdpDominanceRatio: domRatio,
      learningRate: engine?.stdpConfig?.learningRate ?? 0.40,
      meanWeight: 0.65,
      saturatedSynapseRatio: 0.08,
      membraneVarianceMv: 2.3,
      motorFiringHz: 28,
      proximityGain: engine?.proximityGain ?? 1.65,
      turnGain: engine?.turnGain ?? 3.50,
      bleedIndex: engine?.driftGuard ? (engine.driftGuard as any).synapticBleedIndex ?? 0.02 : 0.02,
      pathwayLeakageDetected: engine?.driftGuard ? (engine.driftGuard as any).pathwayLeakageDetected ?? false : false,
    };

    // Scan the 60s rolling window for local drift peaks / spikes
    for (let i = 2; i < n - 1; i++) {
      const prev = normalizedHistory[i - 1];
      const curr = normalizedHistory[i];
      const next = normalizedHistory[i + 1];

      // Criteria for drift spike:
      // 1. Local maximum with elevated DRI (>= 22%), or
      // 2. High upward step (>= 3.8% jump in 1 second), or
      // 3. A recorded LTD injection happened at this relative timestamp
      const isLocalPeak = curr >= prev && curr >= next && curr >= 21.0;
      const isSurgeStep = curr - prev >= 3.5 && curr >= 24.0;

      // Check if any recent recorded injection event occurred around this second
      const relativeSecAgo = -(n - 1 - i); // e.g. -22s
      const matchingEvent = recentEvents.find((evt) => {
        const secAgo = Math.round((evt.timestamp - Date.now()) / 1000);
        return Math.abs(secAgo - relativeSecAgo) <= 2;
      });

      if ((isLocalPeak || isSurgeStep || matchingEvent) && i - lastTaggedIndex >= minSeparationSec) {
        lastTaggedIndex = i;

        // Estimate velocity & second derivative at this spike
        const vel = Math.max(0.08, (curr - prev) / 35);
        const prevVel = Math.max(0, (prev - normalizedHistory[i - 2]) / 35);
        const accel = Math.max(0, vel - prevVel);

        let clusterName = 'associative_core';
        let clusterId = 'associative_core';

        if (matchingEvent) {
          clusterId = matchingEvent.clusterId;
          clusterName = matchingEvent.clusterName;
        } else {
          // Heuristic cluster attribution if event not yet recorded
          if (curr >= 40.0) {
            clusterId = 'associative_core';
            clusterName = 'Associative Core Recurrent';
          } else if (context.aerLatencyMs > 1.45 || context.droppedSignalCount > 0) {
            clusterId = 'sensory_afferent';
            clusterName = 'Sensory Afferent Pathways';
          } else if (context.turnGain > 3.65) {
            clusterId = 'motor_efferent';
            clusterName = 'Motor Efferent Reflex';
          } else if (context.pathwayLeakageDetected) {
            clusterId = 'recurrent_interneuron';
            clusterName = 'Recurrent Interneuron Plasticity';
          } else {
            clusterId = 'inhibitory_feedback';
            clusterName = 'Inhibitory Feedback Interneurons';
          }
        }

        const classification = classifyDriftSubsystem(clusterId, vel, accel, context);

        detected.push({
          id: `spike-tag-${i}-${relativeSecAgo}`,
          timestamp: Date.now() + relativeSecAgo * 1000,
          timelineIndex: i,
          relativeSeconds: relativeSecAgo,
          driValue: curr,
          driftVelocity: vel,
          secondOrderDerivative: accel,
          primarySubsystem: matchingEvent?.primarySubsystem ?? classification.primarySubsystem,
          subsystemLabel: matchingEvent?.subsystemLabel ?? classification.subsystemLabel,
          subsystemTagCode: matchingEvent?.subsystemTagCode ?? classification.subsystemTagCode,
          confidence: matchingEvent?.confidence ?? classification.confidence,
          clusterName,
          evidence: matchingEvent?.telemetryEvidence ?? classification.evidence,
          postMortemSummary: matchingEvent?.postMortemSummary ?? classification.postMortemSummary,
          remediationSuggestion: matchingEvent?.remediationSuggestion ?? classification.remediationSuggestion,
        });
      }
    }

    return detected;
  }, [autoTagEnabled, normalizedHistory, recentEvents, engine, telemetry]);

  // Filtered spikes based on operator's active subsystem filter
  const filteredTaggedSpikes = useMemo(() => {
    if (subsystemFilter === 'all') return taggedSpikes;
    return taggedSpikes.filter((s) => s.primarySubsystem === subsystemFilter);
  }, [taggedSpikes, subsystemFilter]);

  // SVG Chart Projection Dimensions
  const chartWidth = 560;
  const chartHeight = 135;
  const paddingLeft = 34;
  const paddingRight = 36;
  const paddingTop = 26; // Room for annotation tag badges at top
  const paddingBottom = 22;

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;

  // Chart covers 60s history (left 50%) + up to 60s future projection (right 50%)
  const totalChartSeconds = 120;
  const maxY = 70; // 0% to 70% DRI scale
  const minY = 0;

  const scaleX = (second: number) => paddingLeft + (second / totalChartSeconds) * innerWidth;
  const scaleY = (val: number) => {
    const clamped = Math.max(minY, Math.min(maxY, val));
    return chartHeight - paddingBottom - ((clamped - minY) / (maxY - minY)) * innerHeight;
  };

  // Historical Polyline Points (0 to 59s)
  const historyPoints = normalizedHistory.map((val, idx) => ({
    x: scaleX(idx),
    y: scaleY(val),
  }));

  const historyD = historyPoints.reduce(
    (acc, pt, idx) => (idx === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`),
    ''
  );

  // Linear Regression Best-Fit Line over Historical Data
  const regStartX = scaleX(0);
  const regStartY = scaleY(regression.intercept);
  const regEndX = scaleX(59);
  const regEndY = scaleY(regression.slope * 59 + regression.intercept);

  // Forward Projected Line (60s to 120s or until intersection)
  const forwardStartX = scaleX(59);
  const forwardStartY = scaleY(normalizedHistory[normalizedHistory.length - 1]);
  const forwardSecondsAhead = Math.min(60, regression.timeToDriftSeconds === Infinity ? 60 : regression.timeToDriftSeconds);
  const forwardEndX = scaleX(59 + forwardSecondsAhead);
  const forwardEndY = scaleY(
    regression.slope > 0
      ? Math.min(maxY, normalizedHistory[normalizedHistory.length - 1] + regression.slope * forwardSecondsAhead)
      : Math.max(0, normalizedHistory[normalizedHistory.length - 1] + regression.slope * forwardSecondsAhead)
  );

  const runawayLineY = scaleY(runawayThreshold);
  const warningLineY = scaleY(warningThreshold);

  // Format Time to Drift String
  const formatTTD = (seconds: number) => {
    if (seconds === 0) return 'BREACHED (0s)';
    if (seconds === Infinity) return 'STABLE (∞)';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  const statusConfig = {
    CRITICAL: {
      border: 'border-rose-500/60',
      bg: 'bg-rose-950/40',
      badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      textColor: 'text-rose-400',
      glow: 'shadow-rose-900/30',
      icon: <ShieldAlert className="w-5 h-5 text-rose-400 animate-pulse" />,
      label: 'IMMINENT DIVERGENCE RUNAWAY',
    },
    WARNING: {
      border: 'border-amber-500/60',
      bg: 'bg-amber-950/30',
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      textColor: 'text-amber-400',
      glow: 'shadow-amber-900/30',
      icon: <AlertTriangle className="w-5 h-5 text-amber-400 animate-bounce" />,
      label: 'ELEVATED DRIFT ACCELERATION',
    },
    ELEVATED: {
      border: 'border-indigo-500/50',
      bg: 'bg-indigo-950/30',
      badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
      textColor: 'text-indigo-300',
      glow: 'shadow-indigo-900/20',
      icon: <TrendingUp className="w-5 h-5 text-indigo-400" />,
      label: 'MILD POSITIVE TRAJECTORY',
    },
    STABLE: {
      border: 'border-emerald-500/40',
      bg: 'bg-emerald-950/20',
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      textColor: 'text-emerald-400',
      glow: 'shadow-emerald-900/20',
      icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />,
      label: 'HOMEOSTATIC EQUILIBRIUM',
    },
  }[regression.status];

  // Helper colors for subsystems
  const getSubsystemColors = (sub: DriftSubsystemSource) => {
    switch (sub) {
      case 'aer_bus':
        return {
          stroke: '#06b6d4',
          fill: '#0891b2',
          badgeBg: 'bg-cyan-500/20',
          badgeText: 'text-cyan-300',
          badgeBorder: 'border-cyan-500/40',
        };
      case 'stdp_engine':
        return {
          stroke: '#f59e0b',
          fill: '#d97706',
          badgeBg: 'bg-amber-500/20',
          badgeText: 'text-amber-300',
          badgeBorder: 'border-amber-500/40',
        };
      case 'membrane_integrator':
        return {
          stroke: '#a855f7',
          fill: '#9333ea',
          badgeBg: 'bg-purple-500/20',
          badgeText: 'text-purple-300',
          badgeBorder: 'border-purple-500/40',
        };
      case 'reflex_controller':
        return {
          stroke: '#f43f5e',
          fill: '#e11d48',
          badgeBg: 'bg-rose-500/20',
          badgeText: 'text-rose-300',
          badgeBorder: 'border-rose-500/40',
        };
      case 'synaptic_bleed':
      default:
        return {
          stroke: '#10b981',
          fill: '#059669',
          badgeBg: 'bg-emerald-500/20',
          badgeText: 'text-emerald-300',
          badgeBorder: 'border-emerald-500/40',
        };
    }
  };

  const handleSelectSpike = (spike: DriftSpikeTag) => {
    setActivePostMortem(spike);
    if (onInspectPostMortem) {
      onInspectPostMortem(spike);
    }
  };

  return (
    <div
      className={`rounded-2xl border ${statusConfig.border} ${statusConfig.bg} p-5 shadow-xl transition-all relative overflow-hidden`}
    >
      {/* Background glow accent */}
      <div className="absolute top-0 right-0 w-80 h-32 bg-gradient-to-l from-indigo-500/10 via-rose-500/5 to-transparent pointer-events-none" />

      {/* Top Header Bar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 shadow-inner">
            {statusConfig.icon}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                Predictive Divergence Forecaster & Linear Regression
              </h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${statusConfig.badge}`}>
                {statusConfig.label}
              </span>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                60s OLS Regression
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Calculates ordinary least squares linear regression over the last 60 seconds of DRI samples to project exact time to divergence runaway.
            </p>
          </div>
        </div>

        {/* Target Ceiling Selection & Simulator Controls */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 font-mono text-[10px]">
            <button
              onClick={() => setSelectedTarget('runaway')}
              className={`px-2.5 py-1 rounded transition-colors ${
                selectedTarget === 'runaway'
                  ? 'bg-rose-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Predict time until critical epileptiform runaway threshold (55.0% DRI)"
            >
              Runaway: 55%
            </button>
            <button
              onClick={() => setSelectedTarget('warning')}
              className={`px-2.5 py-1 rounded transition-colors ${
                selectedTarget === 'warning'
                  ? 'bg-amber-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Predict time until pre-emptive rollback tripwire (35.0% DRI)"
            >
              Warning: 35%
            </button>
          </div>

          {onSimulateBurst && (
            <button
              onClick={onSimulateBurst}
              className="px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 rounded font-semibold flex items-center gap-1.5 transition-colors"
              title="Inject a localized high-frequency burst to test linear regression tilt in real time"
            >
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              <span>Simulate Surge</span>
            </button>
          )}

          {onTriggerCorrection && (
            <button
              onClick={onTriggerCorrection}
              className="px-3 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
              title="Command immediate corrective multi-cluster LTD injection to arrest drift velocity"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Arrest Runaway Now</span>
            </button>
          )}
        </div>
      </div>

      {/* Main KPI Row: Time to Drift, Slope, R², Margin */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
        {/* 1. Time to Drift (Hero KPI) */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-1">
          <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span>Time to Drift (TTD)</span>
            </span>
            <span className="text-[9px] text-slate-500">Target: {targetThreshold}%</span>
          </div>
          <div className={`text-2xl font-bold font-mono tracking-tight ${statusConfig.textColor}`}>
            {formatTTD(regression.timeToDriftSeconds)}
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            {regression.predictedRunawayTime ? (
              <span>ETA: ~{regression.predictedRunawayTime}</span>
            ) : (
              <span>Trajectory stable or negative</span>
            )}
          </div>
        </div>

        {/* 2. Drift Velocity / Regression Slope */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-1">
          <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-purple-400" />
              <span>Drift Velocity Slope (m)</span>
            </span>
            {regression.slope > 0 ? (
              <TrendingUp className="w-3 h-3 text-amber-400" />
            ) : (
              <TrendingDown className="w-3 h-3 text-emerald-400" />
            )}
          </div>
          <div className="text-2xl font-bold font-mono text-white tracking-tight">
            <span className={regression.slope > 0.05 ? 'text-rose-400' : regression.slope > 0 ? 'text-amber-400' : 'text-emerald-400'}>
              {regression.slope >= 0 ? `+${(regression.slope * 100).toFixed(2)}` : (regression.slope * 100).toFixed(2)}
            </span>
            <span className="text-[11px] text-slate-500 font-normal ml-1">% / s</span>
          </div>
          <div className="text-[10px] text-slate-400">
            {regression.slope > 0 ? 'Accelerating positive drift' : 'Equilibrium or decaying drift'}
          </div>
        </div>

        {/* 3. Linear Regression Fit (R²) */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-1">
          <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Trend Line Fit (R²)</span>
            </span>
            <span className="text-[9px] text-slate-500 font-mono">Confidence</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white tracking-tight">
            {(regression.rSquared * 100).toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-400">
            {regression.rSquared > 0.75 ? 'Strong linear consistency' : 'Diffuse fluctuations'}
          </div>
        </div>

        {/* 4. Safety Margin to Ceiling */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-1">
          <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>Safety Margin</span>
            </span>
            <span className="text-[9px] text-slate-500">Live DRI: {regression.currentVal.toFixed(1)}%</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white tracking-tight">
            <span className={targetThreshold - regression.currentVal < 10 ? 'text-rose-400' : 'text-emerald-400'}>
              {Math.max(0, targetThreshold - regression.currentVal).toFixed(1)}%
            </span>
            <span className="text-[11px] text-slate-500 font-normal ml-1">buffer</span>
          </div>
          <div className="text-[10px] text-slate-400">
            {targetThreshold - regression.currentVal < 10 ? 'Critical headroom breach' : 'Nominal operating headroom'}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Auto-Tag Drift Events Control Toolbar & Filter Bar */}
      {/* ========================================================================= */}
      <div className="mt-5 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Master Toggle */}
          <button
            onClick={() => setAutoTagEnabled(!autoTagEnabled)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              autoTagEnabled
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-indigo-400/50 shadow-md shadow-indigo-900/30 ring-1 ring-indigo-400/40'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Auto-Tag Drift Events</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                autoTagEnabled ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {autoTagEnabled ? `${taggedSpikes.length} TAGS` : 'OFF'}
            </span>
          </button>

          {/* Subsystem Tag Filter Pills */}
          {autoTagEnabled && (
            <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-[10px] font-mono overflow-x-auto no-scrollbar">
              <button
                onClick={() => setSubsystemFilter('all')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  subsystemFilter === 'all'
                    ? 'bg-slate-700 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({taggedSpikes.length})
              </button>
              <button
                onClick={() => setSubsystemFilter('aer_bus')}
                className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                  subsystemFilter === 'aer_bus'
                    ? 'bg-cyan-600/40 text-cyan-200 font-bold border border-cyan-500/40'
                    : 'text-slate-400 hover:text-cyan-300'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>AER</span>
              </button>
              <button
                onClick={() => setSubsystemFilter('stdp_engine')}
                className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                  subsystemFilter === 'stdp_engine'
                    ? 'bg-amber-600/40 text-amber-200 font-bold border border-amber-500/40'
                    : 'text-slate-400 hover:text-amber-300'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>STDP</span>
              </button>
              <button
                onClick={() => setSubsystemFilter('membrane_integrator')}
                className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                  subsystemFilter === 'membrane_integrator'
                    ? 'bg-purple-600/40 text-purple-200 font-bold border border-purple-500/40'
                    : 'text-slate-400 hover:text-purple-300'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                <span>MEM</span>
              </button>
              <button
                onClick={() => setSubsystemFilter('reflex_controller')}
                className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                  subsystemFilter === 'reflex_controller'
                    ? 'bg-rose-600/40 text-rose-200 font-bold border border-rose-500/40'
                    : 'text-slate-400 hover:text-rose-300'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                <span>RFLX</span>
              </button>
              <button
                onClick={() => setSubsystemFilter('synaptic_bleed')}
                className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                  subsystemFilter === 'synaptic_bleed'
                    ? 'bg-emerald-600/40 text-emerald-200 font-bold border border-emerald-500/40'
                    : 'text-slate-400 hover:text-emerald-300'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>BLEED</span>
              </button>
            </div>
          )}
        </div>

        <div className="text-[10px] text-slate-400 flex items-center gap-2">
          <span>Click any timeline tag pin for Post-Mortem Forensic Analysis</span>
        </div>
      </div>

      {/* SVG Projection Visualizer with Auto-Tagged Spikes */}
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-0.5 bg-sky-400 inline-block" />
            <span>Empirical 60s DRI</span>
            <span className="w-2.5 h-0.5 bg-amber-400 inline-block border-dashed" />
            <span>Linear Fit</span>
            <span className="w-2.5 h-0.5 bg-rose-400 inline-block border-dashed" />
            <span>Forward Projected Path (60s)</span>
          </span>
          <span className="text-[10px] text-slate-500">
            Horizontal Dashed: 55% Runaway Limit • 35% Warning Tripwire
          </span>
        </div>

        <div className="w-full bg-slate-950 rounded-xl p-2.5 border border-slate-800 overflow-x-auto relative">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full h-32 overflow-visible block"
            preserveAspectRatio="none"
          >
            <defs>
              <filter id="tagGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Background Grid Lines */}
            <line x1={paddingLeft} y1={scaleY(20)} x2={chartWidth - paddingRight} y2={scaleY(20)} stroke="#1e293b" strokeWidth="1" strokeDasharray="3 3" />
            <line x1={paddingLeft} y1={scaleY(40)} x2={chartWidth - paddingRight} y2={scaleY(40)} stroke="#1e293b" strokeWidth="1" strokeDasharray="3 3" />
            <line x1={paddingLeft} y1={scaleY(60)} x2={chartWidth - paddingRight} y2={scaleY(60)} stroke="#1e293b" strokeWidth="1" strokeDasharray="3 3" />

            {/* Middle Divider: Present (t=60s) */}
            <line
              x1={scaleX(59)}
              y1={paddingTop}
              x2={scaleX(59)}
              y2={chartHeight - paddingBottom}
              stroke="#38bdf8"
              strokeWidth="1.2"
              strokeDasharray="2 2"
              strokeOpacity="0.7"
            />
            <text
              x={scaleX(59)}
              y={paddingTop - 4}
              fill="#38bdf8"
              fontSize="8"
              fontFamily="monospace"
              textAnchor="middle"
            >
              NOW (t=0)
            </text>

            {/* Runaway Threshold Ceiling (55%) */}
            <line
              x1={paddingLeft}
              y1={runawayLineY}
              x2={chartWidth - paddingRight}
              y2={runawayLineY}
              stroke="#f43f5e"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              strokeOpacity="0.8"
            />
            <text
              x={chartWidth - paddingRight + 4}
              y={runawayLineY + 3}
              fill="#f43f5e"
              fontSize="8"
              fontFamily="monospace"
            >
              55% RUNAWAY
            </text>

            {/* Warning Threshold Line (35%) */}
            <line
              x1={paddingLeft}
              y1={warningLineY}
              x2={chartWidth - paddingRight}
              y2={warningLineY}
              stroke="#f59e0b"
              strokeWidth="1.2"
              strokeDasharray="3 3"
              strokeOpacity="0.7"
            />
            <text
              x={chartWidth - paddingRight + 4}
              y={warningLineY + 3}
              fill="#f59e0b"
              fontSize="8"
              fontFamily="monospace"
            >
              35% WARN
            </text>

            {/* Y-axis labels */}
            <text x={paddingLeft - 4} y={scaleY(20) + 3} fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="end">20%</text>
            <text x={paddingLeft - 4} y={scaleY(40) + 3} fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="end">40%</text>
            <text x={paddingLeft - 4} y={scaleY(60) + 3} fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="end">60%</text>

            {/* X-axis labels */}
            <text x={scaleX(0)} y={chartHeight - 6} fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="start">-60s</text>
            <text x={scaleX(30)} y={chartHeight - 6} fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="middle">-30s</text>
            <text x={scaleX(59)} y={chartHeight - 6} fill="#38bdf8" fontSize="8" fontFamily="monospace" textAnchor="middle">0s</text>
            <text x={scaleX(90)} y={chartHeight - 6} fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="middle">+30s</text>
            <text x={scaleX(119)} y={chartHeight - 6} fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="end">+60s</text>

            {/* Historical Empirical Line */}
            <path d={historyD} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

            {/* Linear Regression Historical Best-Fit */}
            <line
              x1={regStartX}
              y1={regStartY}
              x2={regEndX}
              y2={regEndY}
              stroke="#fbbf24"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              strokeOpacity="0.8"
            />

            {/* Forward Projected Path */}
            <line
              x1={forwardStartX}
              y1={forwardStartY}
              x2={forwardEndX}
              y2={forwardEndY}
              stroke={regression.slope > 0 ? '#f43f5e' : '#10b981'}
              strokeWidth="2"
              strokeDasharray="4 3"
            />

            {/* Present Head Indicator */}
            <circle
              cx={scaleX(59)}
              y={scaleY(normalizedHistory[normalizedHistory.length - 1])}
              r="3.5"
              fill="#38bdf8"
              className="animate-pulse"
            />

            {/* ================================================================= */}
            {/* Auto-Tagged Drift Spike Pins & Callout Badges on Timeline */}
            {/* ================================================================= */}
            {autoTagEnabled &&
              filteredTaggedSpikes.map((spike) => {
                const px = scaleX(spike.timelineIndex);
                const py = scaleY(spike.driValue);
                const tagAnchorY = Math.max(8, py - 18);
                const colors = getSubsystemColors(spike.primarySubsystem);
                const isSelected = activePostMortem?.id === spike.id;

                return (
                  <g
                    key={spike.id}
                    className="cursor-pointer group"
                    onClick={() => handleSelectSpike(spike)}
                  >
                    {/* Vertical dashed guideline to curve point */}
                    <line
                      x1={px}
                      y1={tagAnchorY + 8}
                      x2={px}
                      y2={py}
                      stroke={colors.stroke}
                      strokeWidth={isSelected ? 1.8 : 1.2}
                      strokeDasharray="2 2"
                      strokeOpacity={isSelected ? 1.0 : 0.75}
                    />

                    {/* Point indicator on the curve */}
                    <circle
                      cx={px}
                      cy={py}
                      r={isSelected ? 4.5 : 3.5}
                      fill={colors.stroke}
                      stroke="#0f172a"
                      strokeWidth="1.5"
                    />

                    {/* Callout pin badge box */}
                    <rect
                      x={px - 16}
                      y={tagAnchorY - 7}
                      width={32}
                      height={13}
                      rx={3}
                      fill="#020617"
                      stroke={colors.stroke}
                      strokeWidth={isSelected ? 1.8 : 1}
                      filter={isSelected ? 'url(#tagGlow)' : undefined}
                      className="transition-all group-hover:brightness-125"
                    />

                    {/* Subsystem Tag Text */}
                    <text
                      x={px}
                      y={tagAnchorY + 2.5}
                      fill={colors.stroke}
                      fontSize="7.5"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                      className="pointer-events-none select-none"
                    >
                      {spike.subsystemTagCode}
                    </text>
                  </g>
                );
              })}

            {/* Intersection / Intercept Target Indicator if projecting towards ceiling */}
            {regression.timeToDriftSeconds !== Infinity && regression.timeToDriftSeconds <= 60 && (
              <circle
                cx={forwardEndX}
                cy={forwardEndY}
                r="4.5"
                fill="#f43f5e"
                stroke="#fff"
                strokeWidth="1.5"
                className="animate-ping"
              />
            )}
          </svg>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Post-Mortem Diagnostic Inspector Modal / Card */}
      {/* ========================================================================= */}
      {activePostMortem && (
        <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-700 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg border ${
                  getSubsystemColors(activePostMortem.primarySubsystem).badgeBg
                } ${getSubsystemColors(activePostMortem.primarySubsystem).badgeBorder}`}
              >
                <Tag
                  className={`w-4 h-4 ${
                    getSubsystemColors(activePostMortem.primarySubsystem).badgeText
                  }`}
                />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Post-Mortem Root Cause:
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-bold font-mono border ${
                      getSubsystemColors(activePostMortem.primarySubsystem).badgeBg
                    } ${getSubsystemColors(activePostMortem.primarySubsystem).badgeText} ${
                      getSubsystemColors(activePostMortem.primarySubsystem).badgeBorder
                    }`}
                  >
                    {activePostMortem.subsystemLabel}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded">
                    {(activePostMortem.confidence * 100).toFixed(0)}% Confidence
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-3">
                  <span>
                    Spike Offset: <strong className="text-sky-300 font-mono">{activePostMortem.relativeSeconds}s ago</strong> (
                    {new Date(activePostMortem.timestamp).toLocaleTimeString()})
                  </span>
                  <span>
                    Cluster: <strong className="text-white">{activePostMortem.clusterName}</strong>
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setActivePostMortem(null)}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Close Post-Mortem Inspector"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Telemetry Evidence Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 text-xs font-mono">
            {activePostMortem.evidence.map((ev, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 flex flex-col justify-between"
              >
                <span className="text-[10px] text-slate-400 uppercase">{ev.metric}</span>
                <div className="flex items-center justify-between mt-1">
                  <span
                    className={`font-bold text-sm ${
                      ev.status === 'critical'
                        ? 'text-rose-400'
                        : ev.status === 'warning'
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {ev.value}
                  </span>
                  <span className="text-[9px] text-slate-500 font-sans">{ev.threshold}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Detailed Forensic Post-Mortem Narrative */}
          <div className="mt-3 p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-300 space-y-1.5">
            <div className="flex items-center gap-1.5 text-indigo-300 font-bold text-[11px] uppercase tracking-wide">
              <FileText className="w-3.5 h-3.5" />
              <span>Diagnostic Post-Mortem Summary</span>
            </div>
            <p className="leading-relaxed text-slate-300">{activePostMortem.postMortemSummary}</p>
            <div className="pt-1.5 border-t border-slate-800/60 flex items-start gap-1.5 text-[11px]">
              <span className="text-emerald-400 font-bold shrink-0">Remediation:</span>
              <span className="text-slate-400">{activePostMortem.remediationSuggestion}</span>
            </div>
          </div>

          {/* Action Row */}
          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[10px] text-slate-500 font-mono">
              Peak DRI: {activePostMortem.driValue.toFixed(1)}% &bull; Velocity: {activePostMortem.driftVelocity.toFixed(4)}
            </span>

            <div className="flex items-center gap-2">
              {onTriggerCorrection && (
                <button
                  onClick={() => {
                    onTriggerCorrection();
                    setActivePostMortem(null);
                  }}
                  className="px-3 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Execute Targeted Remediation</span>
                </button>
              )}
              <button
                onClick={() => setActivePostMortem(null)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold text-xs"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
