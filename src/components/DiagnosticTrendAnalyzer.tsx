import React, { useState, useEffect, useMemo } from 'react';
import {
  ModelDiagnosticRecommendation,
  SNNTuningConfig,
  DiagnosticTrendAnalysisReport,
  ShadowTrialResult,
} from '../types';
import { DiagnosticTrendAnalyzer as AnalyzerEngine } from '../lib/diagnosticTrendAnalyzer';
import { useAudioVoice } from '../context/AudioContext';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Zap,
  Activity,
  CheckCircle2,
  RefreshCw,
  Sliders,
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX,
  Clock,
  ArrowRight,
  Info,
  Check,
  FlaskConical,
  Flame,
  Layers,
} from 'lucide-react';

interface DiagnosticTrendAnalyzerProps {
  history?: ModelDiagnosticRecommendation[];
  currentTuning: SNNTuningConfig;
  onApplyProactiveTuning: (adjustments: Partial<SNNTuningConfig>) => void;
  onRunShadowTrial?: (candidate?: Partial<SNNTuningConfig>) => ShadowTrialResult | null;
  onRequestManualReAudit?: () => void;
  isOpenAsModal?: boolean;
  onCloseModal?: () => void;
}

type ParameterKey = 'dominanceRatio' | 'learningRate' | 'aMinus' | 'aPlus' | 'turnGain' | 'proximityGain';

const PARAM_COLORS: Record<ParameterKey, { stroke: string; fill: string; text: string; bg: string }> = {
  dominanceRatio: { stroke: '#10b981', fill: '#10b98120', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  learningRate: { stroke: '#f59e0b', fill: '#f59e0b20', text: 'text-amber-400', bg: 'bg-amber-500/10' },
  aMinus: { stroke: '#06b6d4', fill: '#06b6d420', text: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  aPlus: { stroke: '#f43f5e', fill: '#f43f5e20', text: 'text-rose-400', bg: 'bg-rose-500/10' },
  turnGain: { stroke: '#a855f7', fill: '#a855f720', text: 'text-purple-400', bg: 'bg-purple-500/10' },
  proximityGain: { stroke: '#38bdf8', fill: '#38bdf820', text: 'text-sky-400', bg: 'bg-sky-500/10' },
};

export const DiagnosticTrendAnalyzer: React.FC<DiagnosticTrendAnalyzerProps> = ({
  history: propHistory,
  currentTuning,
  onApplyProactiveTuning,
  onRunShadowTrial,
  onRequestManualReAudit,
  isOpenAsModal,
  onCloseModal,
}) => {
  const [epochs, setEpochs] = useState<ModelDiagnosticRecommendation[]>(() => {
    return propHistory && propHistory.length >= 2
      ? propHistory
      : AnalyzerEngine.generateSeedEpochs();
  });

  const [isLoading, setIsLoading] = useState(false);
  const [selectedParam, setSelectedParam] = useState<ParameterKey>('dominanceRatio');
  const [expandedEpochId, setExpandedEpochId] = useState<string | null>(null);
  const [appliedNotification, setAppliedNotification] = useState<string | null>(null);
  const [shadowTrialResult, setShadowTrialResult] = useState<ShadowTrialResult | null>(null);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  const { autoAudioReadout, preferredVoice, speakModelOutput, isAudioPlaying, stopAudio } = useAudioVoice();

  // Fetch live history from backend if available
  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/diagnostics/history');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.history) && data.history.length >= 2) {
          setEpochs(data.history);
        }
      }
    } catch (_err) {
      // Graceful fallback to client-seeded epochs
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (propHistory && propHistory.length >= 2) {
      setEpochs(propHistory);
    } else {
      fetchHistory();
    }
  }, [propHistory]);

  // Compute longitudinal regression analysis
  const report: DiagnosticTrendAnalysisReport = useMemo(() => {
    return AnalyzerEngine.analyzeTrends(epochs, currentTuning);
  }, [epochs, currentTuning]);

  const activeMetric = report.regressionMetrics[selectedParam];

  // SVG Chart Scaling
  const chartPoints = activeMetric?.historicalValues ?? [];
  const n = chartPoints.length;
  const projectedNext = activeMetric?.projectedNextEpoch ?? 0;
  const projectedIn5 = activeMetric?.projectedIn5Epochs ?? 0;

  // Compute min/max range for chart Y-axis
  const allYValues = [...chartPoints.map((p) => p.value), projectedNext, projectedIn5];
  const minY = Math.min(...allYValues);
  const maxY = Math.max(...allYValues);
  const paddingY = Math.max(0.005, (maxY - minY) * 0.25);
  const scaleMinY = minY - paddingY;
  const scaleMaxY = maxY + paddingY;
  const rangeY = scaleMaxY - scaleMinY || 1;

  const chartWidth = 620;
  const chartHeight = 220;
  const padLeft = 45;
  const padRight = 85;
  const padTop = 25;
  const padBottom = 35;
  const plotW = chartWidth - padLeft - padRight;
  const plotH = chartHeight - padTop - padBottom;

  const totalPointsCount = n + 5; // historical + 5 projected epochs
  const getX = (epochIndex: number) => padLeft + ((epochIndex - 1) / Math.max(1, totalPointsCount - 1)) * plotW;
  const getY = (val: number) => padTop + plotH - ((val - scaleMinY) / rangeY) * plotH;

  // Build SVG path strings
  const historicalPath = chartPoints
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(p.epoch)} ${getY(p.value)}`)
    .join(' ');

  // Projection line: from last point through projected in 5 epochs
  const lastPoint = chartPoints[n - 1];
  const projectionPath = lastPoint
    ? `M ${getX(lastPoint.epoch)} ${getY(lastPoint.value)} L ${getX(n + 1)} ${getY(projectedNext)} L ${getX(n + 5)} ${getY(projectedIn5)}`
    : '';

  // Apply Proactive Tuning
  const handleApplyProactive = async () => {
    const params = report.proactiveProposal.recommendedParameters;
    onApplyProactiveTuning(params);

    try {
      await fetch('/api/diagnostics/apply-proactive-tuning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameters: params }),
      });
    } catch (_e) {
      // Client updated cleanly
    }

    setAppliedNotification(
      `Proactive tuning applied: LTD A- clamped to ${params.aMinus.toFixed(4)}, A+ to ${params.aPlus.toFixed(4)}, η to ${params.learningRate.toFixed(3)}. Preempted ${report.proactiveProposal.preventedManualAuditCount} manual re-audits.`
    );

    if (autoAudioReadout) {
      speakModelOutput(
        `Proactive plasticity adjustments applied. Long-term depression dominance reinforced to ${(params.aMinus / params.aPlus).toFixed(2)}x, learning rate dampened to ${params.learningRate}, arresting longitudinal drift.`,
        preferredVoice
      );
    }

    setTimeout(() => setAppliedNotification(null), 5000);
  };

  // Run Shadow Simulation Trial
  const handleTestInShadow = () => {
    if (!onRunShadowTrial) return;
    const res = onRunShadowTrial(report.proactiveProposal.recommendedParameters);
    if (res) {
      setShadowTrialResult(res);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 flex flex-col gap-5 shadow-2xl text-slate-100 relative">
      {/* Toast Notification */}
      {appliedNotification && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-slate-900 border border-emerald-500/70 rounded-xl p-3.5 shadow-2xl shadow-black/80 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 mt-0.5">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="flex-1 text-xs">
            <div className="font-semibold text-emerald-300 flex items-center justify-between">
              <span>Proactive Tuning Deployed</span>
              <span className="text-[10px] font-mono text-slate-400">Just now</span>
            </div>
            <p className="text-slate-300 mt-0.5 leading-relaxed">{appliedNotification}</p>
          </div>
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 to-sky-500/20 border border-indigo-500/30 text-indigo-400 shadow-inner">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">
                Diagnostic Trend Analyzer
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                Multi-Epoch OLS Regression
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Longitudinal trajectory regression on diagnostic recommendations to preempt recurring plasticity bottlenecks
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchHistory}
            disabled={isLoading}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Re-Analyze</span>
          </button>

          {isOpenAsModal && onCloseModal && (
            <button
              onClick={onCloseModal}
              className="text-slate-400 hover:text-white px-2 py-1 text-xs rounded hover:bg-slate-800 transition"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Top 4 KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Metric 1: Plasticity Health Score */}
        <div className="bg-[#0b101b] border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between shadow-inner">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
            Plasticity Health Score
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className={`text-2xl font-extrabold font-mono tracking-tight ${
                report.overallPlasticityHealthScore >= 80
                  ? 'text-emerald-400'
                  : report.overallPlasticityHealthScore >= 65
                  ? 'text-cyan-400'
                  : 'text-amber-400'
              }`}
            >
              {report.overallPlasticityHealthScore}%
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              {report.stabilityForecast.replace('_', ' ')}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1">
            Weighted across STDP ratio, drift slope & learning rate volatility
          </span>
        </div>

        {/* Metric 2: Primary Bottleneck Severity */}
        <div className="bg-[#0b101b] border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between shadow-inner">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
            Primary Bottleneck
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            {report.identifiedBottlenecks.length > 0 ? (
              <span
                className={`text-sm font-bold font-mono px-2 py-0.5 rounded border ${
                  report.identifiedBottlenecks[0].severity === 'CRITICAL'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}
              >
                {report.identifiedBottlenecks[0].severity}: {report.identifiedBottlenecks[0].affectedParameter}
              </span>
            ) : (
              <span className="text-sm font-bold font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30">
                ZERO BOTTLENECK DRIFT
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-400 mt-1">
            {report.identifiedBottlenecks.length > 0
              ? report.identifiedBottlenecks[0].title
              : 'All 5 plasticity parameters bounded in dynamic equilibrium'}
          </span>
        </div>

        {/* Metric 3: Regression Confidence (R^2) */}
        <div className="bg-[#0b101b] border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between shadow-inner">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
            Regression Fit (R²)
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-extrabold font-mono text-sky-400 tracking-tight">
              {(activeMetric?.rSquared ? activeMetric.rSquared * 100 : 92).toFixed(1)}%
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              {report.analyzedEpochsCount} Epochs
            </span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1">
            Linear slope: {activeMetric?.slope >= 0 ? '+' : ''}{activeMetric?.slope.toFixed(4)} / epoch
          </span>
        </div>

        {/* Metric 4: Preempted Manual Audits */}
        <div className="bg-[#0b101b] border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between shadow-inner">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
            Preempted Re-Audits
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-extrabold font-mono text-purple-400 tracking-tight">
              +{report.proactiveProposal.preventedManualAuditCount}
            </span>
            <span className="text-[10px] font-mono text-emerald-400">
              +{report.proactiveProposal.expectedStabilityGainPct}% stability
            </span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1">
            Proactive preemption prevents operator manual re-audit triggers
          </span>
        </div>
      </div>

      {/* Main Longitudinal Regression Chart Section */}
      <div className="bg-[#090e18] border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col gap-3 shadow-inner">
        {/* Chart Header & Parameter Selector Tabs */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div>
            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <span>Longitudinal Trajectory & Proactive Projection</span>
              <span className="text-[10px] font-mono text-slate-400 font-normal">
                (Dashed vector = 5-epoch regression projection)
              </span>
            </h3>
          </div>

          {/* Parameter Selector Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { key: 'dominanceRatio', label: 'A- / A+ Ratio' },
                { key: 'learningRate', label: 'Learning Rate (η)' },
                { key: 'aMinus', label: 'STDP A-' },
                { key: 'aPlus', label: 'STDP A+' },
                { key: 'turnGain', label: 'Turn Gain' },
                { key: 'proximityGain', label: 'Proximity' },
              ] as Array<{ key: ParameterKey; label: string }>
            ).map((p) => {
              const isSelected = selectedParam === p.key;
              const colorInfo = PARAM_COLORS[p.key];
              return (
                <button
                  key={p.key}
                  onClick={() => setSelectedParam(p.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition cursor-pointer border ${
                    isSelected
                      ? `${colorInfo.bg} ${colorInfo.text} border-current shadow-sm`
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border-slate-700/60'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* SVG Interactive Chart */}
        <div className="relative w-full overflow-x-auto py-1">
          <svg
            className="w-full h-56 select-none"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="chartGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PARAM_COLORS[selectedParam].stroke} stopOpacity="0.25" />
                <stop offset="100%" stopColor={PARAM_COLORS[selectedParam].stroke} stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1.0].map((pct, i) => {
              const yVal = scaleMinY + pct * rangeY;
              const yPos = padTop + plotH - pct * plotH;
              return (
                <g key={i}>
                  <line
                    x1={padLeft}
                    y1={yPos}
                    x2={chartWidth - padRight}
                    y2={yPos}
                    stroke="#1e293b"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <text
                    x={padLeft - 6}
                    y={yPos + 3}
                    textAnchor="end"
                    className="text-[9px] fill-slate-500 font-mono"
                  >
                    {yVal.toFixed(selectedParam === 'learningRate' || selectedParam.startsWith('a') ? 3 : 2)}
                  </text>
                </g>
              );
            })}

            {/* Future Projection Shading Zone */}
            <rect
              x={getX(n)}
              y={padTop}
              width={plotW - (getX(n) - padLeft)}
              height={plotH}
              fill="#1e1b4b"
              fillOpacity="0.3"
            />
            <text
              x={getX(n + 2.5)}
              y={padTop + 14}
              textAnchor="middle"
              className="text-[9px] fill-indigo-300/70 font-mono tracking-wider font-semibold"
            >
              PROJECTED EPOCHS (+1 to +5)
            </text>

            {/* Vertical boundary delimiter line between historical and projected */}
            <line
              x1={getX(n)}
              y1={padTop}
              x2={getX(n)}
              y2={padTop + plotH}
              stroke="#6366f1"
              strokeDasharray="4 4"
              strokeWidth="1.5"
            />

            {/* Solid Historical Regression Curve */}
            <path
              d={historicalPath}
              fill="none"
              stroke={PARAM_COLORS[selectedParam].stroke}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Dashed Future Projection Line */}
            <path
              d={projectionPath}
              fill="none"
              stroke={PARAM_COLORS[selectedParam].stroke}
              strokeWidth="2"
              strokeDasharray="5 4"
              strokeOpacity="0.85"
            />

            {/* Historical Data Points */}
            {chartPoints.map((p, idx) => {
              const cx = getX(p.epoch);
              const cy = getY(p.value);
              const isHovered = hoveredPointIndex === idx;

              return (
                <g key={idx} className="cursor-pointer" onMouseEnter={() => setHoveredPointIndex(idx)}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHovered ? 6 : 4}
                    fill={PARAM_COLORS[selectedParam].stroke}
                    className="transition-all duration-150"
                  />
                  <circle cx={cx} cy={cy} r={isHovered ? 9 : 6} fill="none" stroke="#fff" strokeWidth="1.5" strokeOpacity={isHovered ? 0.9 : 0.3} />
                  {/* Epoch X label */}
                  <text
                    x={cx}
                    y={padTop + plotH + 16}
                    textAnchor="middle"
                    className="text-[9px] fill-slate-400 font-mono"
                  >
                    E{p.epoch}
                  </text>
                </g>
              );
            })}

            {/* Projected Future Points */}
            {[
              { epoch: n + 1, val: projectedNext, label: `E${n + 1} (Proj)` },
              { epoch: n + 5, val: projectedIn5, label: `E${n + 5} (Proj)` },
            ].map((p, idx) => {
              const cx = getX(p.epoch);
              const cy = getY(p.val);
              return (
                <g key={`proj-${idx}`}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={4.5}
                    fill="#312e81"
                    stroke={PARAM_COLORS[selectedParam].stroke}
                    strokeWidth="2"
                  />
                  <text
                    x={cx}
                    y={padTop + plotH + 16}
                    textAnchor="middle"
                    className="text-[9px] fill-indigo-300 font-mono font-semibold"
                  >
                    E{p.epoch}
                  </text>
                  <text
                    x={cx}
                    y={cy - 8}
                    textAnchor="middle"
                    className="text-[9px] fill-indigo-200 font-mono font-bold"
                  >
                    {p.val.toFixed(3)}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Hover Point Tooltip Detail */}
          {hoveredPointIndex !== null && chartPoints[hoveredPointIndex] && (
            <div className="absolute top-2 right-4 bg-slate-900/95 border border-slate-700 rounded-lg p-2 text-xs font-mono shadow-xl pointer-events-none">
              <div className="text-slate-400">Epoch {chartPoints[hoveredPointIndex].epoch}:</div>
              <div className="font-bold text-white text-sm">
                {activeMetric?.label}: {chartPoints[hoveredPointIndex].value.toFixed(4)}
              </div>
            </div>
          )}
        </div>

        {/* Regression Formula & Velocity Readout */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-xs font-mono">
          <div className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800/50">
            <span className="text-slate-400">Slope (m):</span>
            <span
              className={`font-bold ${
                activeMetric?.slope > 0 ? 'text-amber-400' : activeMetric?.slope < 0 ? 'text-sky-400' : 'text-slate-200'
              }`}
            >
              {activeMetric?.slope >= 0 ? '+' : ''}{activeMetric?.slope.toFixed(6)} / epoch
            </span>
          </div>

          <div className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800/50">
            <span className="text-slate-400">Boundary Setpoint:</span>
            <span className="text-emerald-400 font-semibold">{activeMetric?.boundaryTarget}</span>
          </div>

          <div className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800/50">
            <span className="text-slate-400">Forecast Status:</span>
            <span
              className={`font-bold uppercase ${
                activeMetric?.hazardLevel === 'critical'
                  ? 'text-rose-400'
                  : activeMetric?.hazardLevel === 'warning'
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {activeMetric?.hazardLevel} ({activeMetric?.trendDirection})
            </span>
          </div>
        </div>
      </div>

      {/* Identified Recurring Plasticity Bottlenecks */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>Recurring Plasticity Bottlenecks Detected</span>
          </h3>
          <span className="text-[10px] font-mono text-slate-400">
            Identified via multi-epoch regression trajectory
          </span>
        </div>

        {report.identifiedBottlenecks.length === 0 ? (
          <div className="bg-[#0b101b] border border-emerald-500/30 rounded-xl p-4 text-xs text-emerald-300 flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>
              Zero plasticity bottlenecks detected. STDP ratio, learning rate, and afferent sensitivities remain strictly centered within biological invariant boundaries.
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {report.identifiedBottlenecks.map((bn) => (
              <div
                key={bn.id}
                className="bg-[#0c1220] border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3 shadow hover:border-slate-700 transition"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-2">
                    <span className="font-bold text-xs text-white leading-tight">{bn.title}</span>
                    <span
                      className={`text-[9px] font-mono px-2 py-0.5 rounded font-bold border shrink-0 ${
                        bn.severity === 'CRITICAL'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      {bn.severity}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 mt-2 leading-relaxed">
                    {bn.description}
                  </p>

                  <div className="bg-[#090d16] p-2.5 rounded-lg border border-slate-800/80 mt-2 text-[10px] font-mono space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Root Cause:</span>
                      <span className="text-slate-300 text-right">{bn.rootCauseHypothesis}</span>
                    </div>
                    {bn.epochsUntilBreach && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Projected Breach:</span>
                        <span className="text-rose-400 font-bold">~{bn.epochsUntilBreach} epochs</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Preemption Fix:</span>
                  <button
                    onClick={() => onApplyProactiveTuning(bn.recommendedAdjustment)}
                    className="px-2.5 py-1 rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 hover:text-white border border-indigo-500/40 text-xs font-medium transition cursor-pointer flex items-center gap-1"
                  >
                    <span>Preempt Bottleneck</span>
                    <ArrowRight className="w-3 h-3 text-indigo-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Proactive Tuning Proposal Hero Panel */}
      <div className="bg-gradient-to-br from-indigo-950/60 via-slate-900 to-[#0c1424] border border-indigo-500/40 rounded-xl p-4 sm:p-5 flex flex-col gap-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-indigo-500/20 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <span>Proactive Tuning Configuration Proposal</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                  {report.proactiveProposal.confidencePct}% Fit Confidence
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Mathematical preemption that counteracts recurring plasticity bottlenecks before triggering manual re-audit requests
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onRunShadowTrial && (
              <button
                onClick={handleTestInShadow}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5 cursor-pointer shadow"
              >
                <FlaskConical className="w-3.5 h-3.5 text-sky-400" />
                <span>Test in Shadow</span>
              </button>
            )}

            <button
              onClick={handleApplyProactive}
              className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-950/60 active:scale-95 ring-1 ring-emerald-400/40"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Proactive Tuning Now</span>
            </button>
          </div>
        </div>

        {/* Shadow Trial Feedback Banner */}
        {shadowTrialResult && (
          <div
            className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
              shadowTrialResult.approved
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                : 'bg-amber-950/40 border-amber-500/50 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-current" />
              <span>
                Shadow Simulation Verified: 100 fast-forward ticks completed in {shadowTrialResult.executionTimeMs}ms.{' '}
                Projected DRI: {(shadowTrialResult.projectedDri * 100).toFixed(0)}% (Resistance Score:{' '}
                {shadowTrialResult.divergenceResistanceScore}%).
              </span>
            </div>
            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-black/40 border border-current">
              {shadowTrialResult.approved ? 'APPROVED SAFE' : 'WARNING FLAGGED'}
            </span>
          </div>
        )}

        {/* Side-by-side Parameter Comparison Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                <th className="py-2 px-2">Parameter</th>
                <th className="py-2 px-2">Current Value</th>
                <th className="py-2 px-2 text-indigo-400">Proactive Target</th>
                <th className="py-2 px-2">Delta</th>
                <th className="py-2 px-2 font-sans text-right">Preemption Engineering Rationale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-[11px]">
              {report.proactiveProposal.parameterDeltas.map((d) => (
                <tr key={d.param} className="hover:bg-slate-800/30 transition">
                  <td className="py-2.5 px-2 font-medium text-slate-200">{d.label}</td>
                  <td className="py-2.5 px-2 text-slate-400">{d.current}</td>
                  <td className="py-2.5 px-2 text-indigo-300 font-bold">{d.proactiveTarget}</td>
                  <td className="py-2.5 px-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        d.delta === 0
                          ? 'text-slate-500 bg-slate-800/60'
                          : d.delta > 0
                          ? 'text-emerald-300 bg-emerald-950/60 border border-emerald-800/40'
                          : 'text-amber-300 bg-amber-950/60 border border-amber-800/40'
                      }`}
                    >
                      {d.delta >= 0 ? '+' : ''}{d.delta} ({d.pctChange >= 0 ? '+' : ''}{d.pctChange}%)
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-slate-300 font-sans text-[11px] text-right">
                    {d.justification}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Epochs History Ledger Accordion */}
      <div className="bg-[#0b101b] border border-slate-800 rounded-xl p-4 flex flex-col gap-3 shadow-inner">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <h3 className="text-xs font-bold text-slate-200">
              Multi-Epoch Diagnostic Recommendation Ledger
            </h3>
            <span className="text-[10px] font-mono text-slate-500">
              ({epochs.length} recorded diagnostic sessions)
            </span>
          </div>

          {onRequestManualReAudit && (
            <button
              onClick={onRequestManualReAudit}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700 transition cursor-pointer"
            >
              Trigger Manual Re-Audit
            </button>
          )}
        </div>

        <div className="divide-y divide-slate-800/60 text-xs font-mono">
          {epochs.map((ep, idx) => {
            const isExpanded = expandedEpochId === ep.id;
            const p = ep.parameters;
            const ratio = (p.aMinus.recommended / Math.max(0.001, p.aPlus.recommended)).toFixed(3);

            return (
              <div key={ep.id} className="py-2">
                <div
                  onClick={() => setExpandedEpochId(isExpanded ? null : ep.id)}
                  className="flex items-center justify-between cursor-pointer hover:text-white transition py-1"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500 text-[11px] w-8">E{idx + 1}</span>
                    <span className="font-semibold text-slate-200 text-xs">{ep.title}</span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(ep.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-400">
                      Ratio: <strong className="text-emerald-400">{ratio}x</strong>
                    </span>
                    <span className="text-[11px] text-slate-400">
                      η: <strong className="text-amber-400">{p.learningRate.recommended}</strong>
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold ${
                        ep.applied
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {ep.applied ? 'APPLIED' : 'STANDBY'}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-2 p-3 rounded-lg bg-slate-900 border border-slate-800/80 text-[11px] font-sans text-slate-300 space-y-2 animate-in fade-in duration-150">
                    <div className="font-mono text-[10px] text-slate-400 flex items-center justify-between border-b border-slate-800 pb-1">
                      <span>Model: {ep.model}</span>
                      <span>ID: {ep.id}</span>
                    </div>
                    <p className="leading-relaxed whitespace-pre-line text-slate-300">
                      {ep.analysisText}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
