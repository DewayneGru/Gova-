import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Radio,
  RefreshCw,
  Zap,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Layers,
  Heart,
  Gauge,
  Info,
  ShieldCheck,
  ArrowRightLeft,
  Waves,
  Cpu,
  TrendingUp,
} from 'lucide-react';
import { SubsystemHeartbeatMetrics, SubsystemId } from '../types';
import {
  TelemetryHealthCheckMonitor,
  globalTelemetryHealthMonitor,
  applySparseCodingBleedValve,
} from '../lib/telemetryHealthMonitor';

interface SubsystemHeartbeatMonitorProps {
  monitor?: TelemetryHealthCheckMonitor;
  onRealignClocks?: () => void;
  className?: string;
  isCompact?: boolean;
}

const SUBSYSTEM_COLORS: Record<SubsystemId, { hex: string; bg: string; text: string; border: string }> = {
  core: { hex: '#38bdf8', bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30' },
  substrateKeel: { hex: '#a855f7', bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  frequencyBands: { hex: '#34d399', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  aerBus: { hex: '#f59e0b', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  synapticStability: { hex: '#f43f5e', bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' },
};

export const SubsystemHeartbeatMonitor: React.FC<SubsystemHeartbeatMonitorProps> = React.memo(({
  monitor = globalTelemetryHealthMonitor,
  onRealignClocks,
  className = '',
  isCompact = false,
}) => {
  const [metrics, setMetrics] = useState<SubsystemHeartbeatMetrics>(() => monitor.getSubsystemHeartbeatMetrics());
  const [isRealigning, setIsRealigning] = useState(false);
  const [realignSuccessMessage, setRealignSuccessMessage] = useState<string | null>(null);
  const [isSimulatingBsiSurge, setIsSimulatingBsiSurge] = useState<boolean>(() => monitor.isSimulatedBsiSurgeActive?.() ?? false);
  const [bleedValveActiveFraction, setBleedValveActiveFraction] = useState<number>(0.65);
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spectralWaveformRef = useRef<HTMLCanvasElement | null>(null);

  // Poll heartbeat phase metrics at 30 FPS / animation frame
  useEffect(() => {
    let animId: number;
    let lastUpdate = 0;

    const tick = (time: number) => {
      // Throttle state update to ~30 FPS
      if (time - lastUpdate >= 33.3) {
        lastUpdate = time;
        setMetrics(monitor.getSubsystemHeartbeatMetrics());
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [monitor]);

  // Canvas circular phase radar rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) - 24;

    ctx.clearRect(0, 0, width, height);

    // Draw background concentric rings
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.lineWidth = 1;
    [0.33, 0.66, 1.0].forEach((ratio) => {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * ratio, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Draw crosshair axes
    ctx.beginPath();
    ctx.moveTo(centerX - radius, centerY);
    ctx.lineTo(centerX + radius, centerY);
    ctx.moveTo(centerX, centerY - radius);
    ctx.lineTo(centerX, centerY + radius);
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.3)';
    ctx.stroke();

    // Draw cardinal phase degree markers
    ctx.fillStyle = '#64748b';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('0°', centerX + radius + 14, centerY);
    ctx.fillText('90°', centerX, centerY + radius + 12);
    ctx.fillText('180°', centerX - radius - 14, centerY);
    ctx.fillText('270°', centerX, centerY - radius - 12);

    // Draw each subsystem's live rotating phase vector
    const phases = Object.values(metrics.phases);
    phases.forEach((p) => {
      const rad = (p.currentPhaseDeg * Math.PI) / 180;
      const color = SUBSYSTEM_COLORS[p.subsystemId]?.hex || '#38bdf8';

      // Vector arm length: master core is full, others scaled by synchrony
      const armLength = radius * (p.subsystemId === 'core' ? 0.95 : 0.85);
      const targetX = centerX + Math.cos(rad) * armLength;
      const targetY = centerY + Math.sin(rad) * armLength;

      // Glow line
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(targetX, targetY);
      ctx.strokeStyle = color;
      ctx.lineWidth = p.subsystemId === 'core' ? 2.5 : 1.8;
      ctx.shadowColor = color;
      ctx.shadowBlur = p.status === 'drift' ? 8 : 4;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Outer phase node
      ctx.beginPath();
      ctx.arc(targetX, targetY, p.subsystemId === 'core' ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Center hub
    ctx.beginPath();
    ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
  }, [metrics]);

  // Canvas waveform rendering for Spectral Coupling Feedback Lag & Correlation
  useEffect(() => {
    const canvas = spectralWaveformRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const tracker = metrics.spectralCouplingTracker;
    const history = tracker?.recentLagHistory || [];

    // Background fill
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, width, height);

    // Gridlines
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.25)';
    ctx.lineWidth = 1;
    for (let y = 15; y < height; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Scaling for feedback lag: 10ms (bottom) to 20ms (top)
    const minLag = 10;
    const maxLag = 20;
    const getYForLag = (lag: number) => {
      const clamped = Math.max(minLag, Math.min(maxLag, lag));
      const norm = (clamped - minLag) / (maxLag - minLag);
      return height - norm * (height - 30) - 15;
    };

    const targetY = getYForLag(15.5);
    const safeTopY = getYForLag(17.5);
    const safeBottomY = getYForLag(13.5);

    // Safe corridor band [13.5, 17.5 ms]
    ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
    ctx.fillRect(0, safeTopY, width, safeBottomY - safeTopY);

    // Target setpoint line (15.5 ms)
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, targetY);
    ctx.lineTo(width, targetY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#34d399';
    ctx.font = '9px monospace';
    ctx.fillText('Target Setpoint: 15.50 ms', 8, targetY - 4);

    if (history.length > 1) {
      // Draw correlation coefficient curve on secondary scale (0.35 to 0.65)
      ctx.beginPath();
      history.forEach((pt, idx) => {
        const x = (idx / (history.length - 1)) * (width - 70) + 10;
        const normCorr = Math.max(0, Math.min(1, (pt.correlationCoefficient - 0.35) / 0.30));
        const y = height - normCorr * (height - 30) - 15;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw feedback lag curve
      ctx.beginPath();
      history.forEach((pt, idx) => {
        const x = (idx / (history.length - 1)) * (width - 70) + 10;
        const y = getYForLag(pt.feedbackLagMs);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      const strokeColor = tracker?.isBsiCompensationActive ? '#10b981' : '#38bdf8';
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.shadowColor = strokeColor;
      ctx.shadowBlur = tracker?.isBsiCompensationActive ? 8 : 4;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw latest endpoint dot
      const lastPt = history[history.length - 1];
      const lastX = (width - 70) + 10;
      const lastY = getYForLag(lastPt.feedbackLagMs);
      ctx.beginPath();
      ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
      ctx.fillStyle = strokeColor;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(`${lastPt.feedbackLagMs.toFixed(2)}ms`, lastX + 6, lastY + 3);
    } else {
      // Default baseline preview line if history is just starting
      ctx.beginPath();
      ctx.moveTo(10, targetY);
      ctx.lineTo(width - 50, targetY);
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
  }, [metrics]);

  const handleRealign = () => {
    setIsRealigning(true);
    monitor.realignSubsystemClocks();
    if (onRealignClocks) {
      onRealignClocks();
    }
    setRealignSuccessMessage('Phase clocks realigned to 0.0ms skew. Global coherence restored.');
    setTimeout(() => {
      setIsRealigning(false);
    }, 400);
    setTimeout(() => {
      setRealignSuccessMessage(null);
    }, 3500);
  };

  const handleToggleAutoRealign = () => {
    monitor.setAutoClockRealign(!metrics.isAutoRealignActive);
    setMetrics(monitor.getSubsystemHeartbeatMetrics());
  };

  const handleToggleSimulateBsiSurge = () => {
    const next = !isSimulatingBsiSurge;
    setIsSimulatingBsiSurge(next);
    if (monitor?.setSimulatedBsiSurge) {
      monitor.setSimulatedBsiSurge(next);
    }
    setMetrics(monitor.getSubsystemHeartbeatMetrics());
  };

  const coherencePct = Math.round(metrics.kuramotoOrderParameter * 100);
  const isCoherenceOptimal = metrics.kuramotoOrderParameter >= 0.90;

  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4 shadow-lg ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400">
            <Heart className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white text-sm">Subsystem Heartbeat Monitor</h3>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                isCoherenceOptimal
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse'
              }`}>
                {isCoherenceOptimal ? 'PHASE LOCKED (ALIGNED)' : 'HIGH JITTER SKEW'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              5-Subsystem clock synchronization & phase offset monitor to prevent temporal drift under burst loads.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleToggleAutoRealign}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-all ${
              metrics.isAutoRealignActive
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
            }`}
            title="Automatically realign subsystem clock domains when phase drift is detected"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Auto Clock Lock: {metrics.isAutoRealignActive ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={handleRealign}
            disabled={isRealigning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs font-medium shadow transition-all disabled:opacity-50 cursor-pointer"
            title="Force immediate zero-phase realign across all five SNN subsystems"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRealigning ? 'animate-spin' : ''}`} />
            <span>Realign Subsystem Clocks</span>
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {realignSuccessMessage && (
        <div className="bg-emerald-950/60 border border-emerald-500/50 rounded-lg p-2.5 flex items-center gap-2 text-xs text-emerald-300 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{realignSuccessMessage}</span>
        </div>
      )}

      {/* Key Metric Gauges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
        <div className="bg-[#090d16] p-3 rounded-lg border border-slate-800">
          <span className="text-slate-400 text-[10px] uppercase block mb-1">Kuramoto Coherence (R)</span>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-xl font-bold ${isCoherenceOptimal ? 'text-emerald-400' : 'text-amber-400'}`}>
              {metrics.kuramotoOrderParameter.toFixed(3)}
            </span>
            <span className="text-[11px] text-slate-400">({coherencePct}%)</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Global phase alignment</span>
        </div>

        <div className="bg-[#090d16] p-3 rounded-lg border border-slate-800">
          <span className="text-slate-400 text-[10px] uppercase block mb-1">Max Inter-Clock Skew</span>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-xl font-bold ${metrics.maxPhaseSkewMs < 1.5 ? 'text-cyan-400' : 'text-amber-400'}`}>
              {metrics.maxPhaseSkewMs.toFixed(2)}
            </span>
            <span className="text-[11px] text-slate-400">ms</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Safe tolerance &lt; 2.50ms</span>
        </div>

        <div className="bg-[#090d16] p-3 rounded-lg border border-slate-800">
          <span className="text-slate-400 text-[10px] uppercase block mb-1">Phase Jitter RMS</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-purple-400">
              {metrics.jitterRmsMs.toFixed(3)}
            </span>
            <span className="text-[11px] text-slate-400">ms</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Microsecond variance</span>
        </div>

        <div className="bg-[#090d16] p-3 rounded-lg border border-slate-800">
          <span className="text-slate-400 text-[10px] uppercase block mb-1">Master Base Rate</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-sky-400">
              {metrics.masterClockHz.toFixed(1)}
            </span>
            <span className="text-[11px] text-slate-400">Hz</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">30 FPS nominal tick</span>
        </div>
      </div>

      {/* Main Body: Circular Phase Radar + 5 Subsystem Breakdown */}
      <div className={`grid grid-cols-1 ${isCompact ? '' : 'lg:grid-cols-12'} gap-4 items-center`}>
        {/* Phase Radar Canvas */}
        <div className={`${isCompact ? '' : 'lg:col-span-5'} flex flex-col items-center justify-center bg-[#090d16] p-3 rounded-xl border border-slate-800`}>
          <div className="text-[11px] font-mono text-slate-400 mb-1 flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>360° Circular Phase Offset Radar</span>
          </div>
          <canvas
            ref={canvasRef}
            width={240}
            height={240}
            className="rounded-lg shadow-inner"
          />
          <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400 mt-2 flex-wrap justify-center">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-sky-400" /> Core
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-purple-400" /> Keel
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Bands
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400" /> AER Bus
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-400" /> STDP
            </span>
          </div>
        </div>

        {/* Subsystem Heartbeat Cards */}
        <div className={`${isCompact ? '' : 'lg:col-span-7'} space-y-2.5`}>
          {(['core', 'substrateKeel', 'frequencyBands', 'aerBus', 'synapticStability'] as SubsystemId[]).map((subId) => {
            const phase = metrics.phases[subId];
            if (!phase) return null;
            const style = SUBSYSTEM_COLORS[subId];
            const isLead = phase.phaseOffsetMs > 0;
            const isLag = phase.phaseOffsetMs < 0;

            return (
              <div
                key={subId}
                className={`p-3 rounded-xl border bg-[#090d16] flex items-center justify-between gap-3 transition-all ${
                  phase.status === 'drift'
                    ? 'border-rose-500/50 bg-rose-950/15'
                    : phase.status === 'marginal'
                    ? 'border-amber-500/40'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-2.5 h-8 rounded-full transition-all"
                    style={{ backgroundColor: style.hex }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-xs truncate">
                        {phase.name}
                      </span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold border ${
                        phase.status === 'locked'
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : phase.status === 'marginal'
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                      }`}>
                        {phase.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>Phase: <strong className="text-slate-200">{phase.currentPhaseDeg}°</strong></span>
                      <span>•</span>
                      <span>Jitter: <strong className="text-slate-300">±{phase.jitterMs.toFixed(3)}ms</strong></span>
                    </div>
                  </div>
                </div>

                {/* Live Offset Metric Badge */}
                <div className="text-right shrink-0">
                  <div className={`text-xs font-mono font-bold ${
                    phase.status === 'locked'
                      ? 'text-emerald-400'
                      : phase.status === 'marginal'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}>
                    {phase.phaseOffsetMs === 0
                      ? '0.00 ms (REF)'
                      : `${isLead ? '+' : ''}${phase.phaseOffsetMs.toFixed(2)} ms`}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {phase.phaseOffsetMs === 0
                      ? 'Master Base Clock'
                      : isLead
                      ? 'Phase Leading'
                      : 'Phase Lagging'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Spectral Coupling Widget: Line Chart Correlating synapticStability <-> frequencyBands */}
      {/* ========================================================================= */}
      {metrics.spectralCouplingTracker && (() => {
        const tracker = metrics.spectralCouplingTracker;
        const history = tracker.recentLagHistory.length > 1
          ? tracker.recentLagHistory
          : Array.from({ length: 24 }, (_, idx) => ({
              timestampMs: Date.now() - (23 - idx) * 80,
              feedbackLagMs: 15.5 + Math.sin(idx * 0.45) * 0.28,
              correlationCoefficient: (tracker.isBsiCompensationActive ? 0.54 : 0.46) + Math.cos(idx * 0.35) * 0.02,
              phaseDisparityMs: 0.42 + Math.abs(Math.sin(idx * 0.3)) * 0.18,
              isBsiCompensationActive: tracker.isBsiCompensationActive || (idx >= 8 && idx <= 16),
              phaseCollisionRiskScore: 0.0,
              synapticStabilityMetric: 0.88 + Math.sin(idx * 0.4) * 0.04,
              frequencyBandMetric: (tracker.isBsiCompensationActive ? 0.24 : 0.22) + Math.cos(idx * 0.4 + 0.5) * 0.03,
              corticalActiveFraction: bleedValveActiveFraction,
              adaptiveThresholdDampingMv: applySparseCodingBleedValve(bleedValveActiveFraction, 24.9).adaptiveThresholdDampingMv,
            }));

        const svgW = 720;
        const svgH = 190;
        const padL = 42;
        const padR = 42;
        const padT = 18;
        const padB = 26;
        const plotW = svgW - padL - padR;
        const plotH = svgH - padT - padB;

        const getX = (idx: number) =>
          padL + (history.length > 1 ? (idx / (history.length - 1)) * plotW : plotW / 2);
        // Primary Y axis: Feedback Lag [12.0ms .. 19.0ms]
        const getLagY = (lagMs: number) => {
          const clamped = Math.max(12.0, Math.min(19.0, lagMs));
          return padT + plotH - ((clamped - 12.0) / 7.0) * plotH;
        };
        // Secondary Y axis: Normalized Coupling / Stability / Frequency [0.0 .. 1.0]
        const getNormY = (val: number) => {
          const clamped = Math.max(0.0, Math.min(1.0, val));
          return padT + plotH - clamped * plotH;
        };

        const lagPolyline = history
          .map((pt, i) => `${getX(i).toFixed(1)},${getLagY(pt.feedbackLagMs).toFixed(1)}`)
          .join(' ');
        const corrPolyline = history
          .map((pt, i) => `${getX(i).toFixed(1)},${getNormY(pt.correlationCoefficient).toFixed(1)}`)
          .join(' ');
        const synPolyline = history
          .map((pt, i) => `${getX(i).toFixed(1)},${getNormY(pt.synapticStabilityMetric ?? 0.88).toFixed(1)}`)
          .join(' ');
        const freqPolyline = history
          .map((pt, i) => `${getX(i).toFixed(1)},${getNormY((pt.frequencyBandMetric ?? 0.24) * 2.2).toFixed(1)}`)
          .join(' ');

        const bleedComputed = applySparseCodingBleedValve(
          bleedValveActiveFraction,
          24.9,
          28.0,
          0.48
        );

        const activeHoverPt =
          hoveredPointIdx !== null && history[hoveredPointIdx]
            ? history[hoveredPointIdx]
            : history[history.length - 1];

        return (
          <div className="bg-[#080d18] border border-cyan-500/30 rounded-xl p-4 space-y-4 shadow-xl relative overflow-hidden">
            {/* Section Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3 relative z-10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
                  <ArrowRightLeft className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-white text-sm tracking-wide">
                      Spectral Coupling Widget: Feedback Lag Line Chart (synapticStability ↔ frequencyBands)
                    </h4>
                    <span className="text-xs font-mono text-slate-400">
                      · {tracker.isBsiCompensationActive ? 'BSI Compensation Active (1.20ms Jitter)' : `Bleed-Valve Jitter (${bleedComputed.phaseJitterMs.toFixed(2)}ms)`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Multi-series line chart correlating <span className="text-rose-400 font-mono">synapticStability</span> metrics, <span className="text-emerald-400 font-mono">frequencyBands</span> oscillations, and feedback lag (τ = 15.5 ms) during BSI compensation events.
                  </p>
                </div>
              </div>

              {/* Interactive Simulation Probe */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleToggleSimulateBsiSurge}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-all cursor-pointer ${
                    isSimulatingBsiSurge
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30'
                      : 'bg-slate-800/80 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/20 hover:text-cyan-200'
                  }`}
                  title="Toggle simulated BSI breach surge (> 0.35 idx) to observe real-time phase dithering and feedback lag compensation"
                >
                  <Zap className={`w-3.5 h-3.5 ${isSimulatingBsiSurge ? 'text-amber-400 animate-bounce' : 'text-cyan-400'}`} />
                  <span>{isSimulatingBsiSurge ? 'Reset BSI Probe' : 'Trigger BSI Compensation Event'}</span>
                </button>
              </div>
            </div>

            {/* 4-Metric Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
              <div className="bg-[#050811] p-3 rounded-lg border border-slate-800/80">
                <span className="text-slate-400 text-[10px] uppercase block mb-1">Feedback Lag (τ)</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold text-cyan-400">
                    {tracker.feedbackLagMs.toFixed(2)}
                  </span>
                  <span className="text-[11px] text-slate-400">ms</span>
                  <span className="text-[10px] text-emerald-400 ml-auto">
                    {tracker.lagDeltaMs >= 0 ? '+' : ''}{tracker.lagDeltaMs.toFixed(2)}ms
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Setpoint: 15.50 ms · Safe [13.5–17.5ms]
                </span>
              </div>

              <div className="bg-[#050811] p-3 rounded-lg border border-slate-800/80">
                <span className="text-slate-400 text-[10px] uppercase block mb-1">Lag Cross-Correlation (r)</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold text-amber-400">
                    {tracker.correlationCoefficient.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400">r(syn, freq)</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  BSI Event Coupling ({tracker.isBsiCompensationActive ? 'Compensated 0.54' : 'Baseline 0.46'})
                </span>
              </div>

              <div className="bg-[#050811] p-3 rounded-lg border border-slate-800/80">
                <span className="text-slate-400 text-[10px] uppercase block mb-1">Sparse Coding Bleed-Valve</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold text-emerald-400">
                    +{bleedComputed.adaptiveThresholdDampingMv.toFixed(2)}
                  </span>
                  <span className="text-[11px] text-slate-400">mV</span>
                  <span className="text-[10px] text-purple-300 ml-auto">
                    Inh: {bleedComputed.inhibitoryGainRatio.toFixed(3)}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Active Crowd: {bleedValveActiveFraction.toFixed(2)} → 0.48 sweet spot
                </span>
              </div>

              <div className="bg-[#050811] p-3 rounded-lg border border-slate-800/80">
                <span className="text-slate-400 text-[10px] uppercase block mb-1">100 Hz FastCascadeTracker</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-bold text-rose-400 truncate">
                    {tracker.fastCascadeStatus?.earliestSpikeSubsystem || 'frequencyBands'}
                  </span>
                  <span className="text-[10px] text-cyan-300 ml-auto">
                    Δt={tracker.fastCascadeStatus?.timeDifferenceMs || 12}ms
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  10ms micro-buffer ({tracker.fastCascadeStatus?.microTickCount ?? 12}/30 hops)
                </span>
              </div>
            </div>

            {/* Interactive SVG Multi-Series Line Chart */}
            <div className="bg-[#050811] p-3.5 rounded-xl border border-slate-800/80 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-slate-200 font-semibold">
                    Spectral Coupling Line Chart: synapticStability ↔ frequencyBands Lag Correlation
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1 text-cyan-400">
                    <span className="w-2.5 h-0.5 bg-cyan-400 rounded-full" /> Feedback Lag τ (ms)
                  </span>
                  <span className="flex items-center gap-1 text-rose-400">
                    <span className="w-2.5 h-0.5 bg-rose-400 rounded-full" /> synapticStability
                  </span>
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="w-2.5 h-0.5 bg-emerald-400 rounded-full" /> frequencyBands
                  </span>
                  <span className="flex items-center gap-1 text-amber-400">
                    <span className="w-2.5 h-0.5 bg-amber-400 rounded-full" /> Correlation r
                  </span>
                </div>
              </div>

              <div className="w-full overflow-hidden rounded-lg border border-slate-800 bg-[#04070e]">
                <svg
                  viewBox={`0 0 ${svgW} ${svgH}`}
                  className="w-full h-48 block select-none"
                  onMouseLeave={() => setHoveredPointIdx(null)}
                >
                  {/* Safe Feedback Lag Corridor [13.5ms .. 17.5ms] */}
                  <rect
                    x={padL}
                    y={getLagY(17.5)}
                    width={plotW}
                    height={getLagY(13.5) - getLagY(17.5)}
                    fill="rgba(16, 185, 129, 0.06)"
                  />

                  {/* Highlight BSI Compensation Event Windows */}
                  {history.map((pt, i) => {
                    if (!pt.isBsiCompensationActive || i === 0) return null;
                    const x0 = getX(i - 1);
                    const x1 = getX(i);
                    return (
                      <rect
                        key={`bsi-win-${i}`}
                        x={x0}
                        y={padT}
                        width={Math.max(2, x1 - x0)}
                        height={plotH}
                        fill="rgba(245, 158, 11, 0.09)"
                      />
                    );
                  })}

                  {/* Horizontal Grid Lines & Labels */}
                  {[13.5, 15.5, 17.5].map((lagVal) => {
                    const y = getLagY(lagVal);
                    return (
                      <g key={lagVal}>
                        <line
                          x1={padL}
                          y1={y}
                          x2={svgW - padR}
                          y2={y}
                          stroke={lagVal === 15.5 ? 'rgba(52, 211, 153, 0.45)' : 'rgba(51, 65, 85, 0.35)'}
                          strokeDasharray={lagVal === 15.5 ? '4 4' : undefined}
                          strokeWidth={lagVal === 15.5 ? 1.2 : 1}
                        />
                        <text
                          x={padL - 6}
                          y={y + 3}
                          textAnchor="end"
                          fill="#64748b"
                          fontSize="9"
                          fontFamily="monospace"
                        >
                          {lagVal.toFixed(1)}ms
                        </text>
                      </g>
                    );
                  })}

                  {/* Right Y-Axis Normalized Labels */}
                  {[0.25, 0.5, 0.75].map((normVal) => {
                    const y = getNormY(normVal);
                    return (
                      <text
                        key={normVal}
                        x={svgW - padR + 6}
                        y={y + 3}
                        textAnchor="start"
                        fill="#64748b"
                        fontSize="9"
                        fontFamily="monospace"
                      >
                        {normVal.toFixed(2)}
                      </text>
                    );
                  })}

                  {/* Series 1: synapticStability Metric Curve (Rose) */}
                  <polyline
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth="1.6"
                    strokeOpacity="0.85"
                    points={synPolyline}
                  />

                  {/* Series 2: frequencyBands Oscillation Metric Curve (Emerald) */}
                  <polyline
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="1.6"
                    strokeOpacity="0.85"
                    points={freqPolyline}
                  />

                  {/* Series 3: Cross-Correlation r(syn, freq) Curve (Amber dashed) */}
                  <polyline
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="1.8"
                    strokeDasharray="3 3"
                    points={corrPolyline}
                  />

                  {/* Series 4: Primary Feedback Lag τ (ms) Curve (Cyan bold) */}
                  <polyline
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2.4"
                    points={lagPolyline}
                  />

                  {/* Interactive Hover Columns & Data Points */}
                  {history.map((pt, i) => {
                    const cx = getX(i);
                    const cy = getLagY(pt.feedbackLagMs);
                    const isHovered = hoveredPointIdx === i || (hoveredPointIdx === null && i === history.length - 1);
                    return (
                      <g
                        key={i}
                        onMouseEnter={() => setHoveredPointIdx(i)}
                        className="cursor-pointer"
                      >
                        <rect
                          x={cx - plotW / history.length / 2}
                          y={padT}
                          width={Math.max(6, plotW / history.length)}
                          height={plotH}
                          fill="transparent"
                        />
                        {isHovered && (
                          <line
                            x1={cx}
                            y1={padT}
                            x2={cx}
                            y2={padT + plotH}
                            stroke="rgba(148, 163, 184, 0.35)"
                            strokeWidth="1"
                          />
                        )}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isHovered ? 4 : 2}
                          fill={pt.isBsiCompensationActive ? '#f59e0b' : '#38bdf8'}
                          stroke="#0f172a"
                          strokeWidth="1"
                        />
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Live Hovered Sample Telemetry Readout + Sparse Coding Bleed-Off Valve Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-[11px] font-mono text-slate-300">
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    Lag τ: <strong className="text-cyan-400">{activeHoverPt.feedbackLagMs.toFixed(2)} ms</strong>
                  </span>
                  <span>·</span>
                  <span>
                    r(syn,freq): <strong className="text-amber-400">{activeHoverPt.correlationCoefficient.toFixed(2)}</strong>
                  </span>
                  <span>·</span>
                  <span>
                    synapticStability: <strong className="text-rose-400">{(activeHoverPt.synapticStabilityMetric ?? 0.88).toFixed(3)}</strong>
                  </span>
                  <span>·</span>
                  <span>
                    frequencyBands: <strong className="text-emerald-400">{(activeHoverPt.frequencyBandMetric ?? 0.24).toFixed(3)}</strong>
                  </span>
                </div>

                {/* Interactive Sparse Coding Bleed-Off Valve Slider */}
                <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded-lg">
                  <span className="text-[10px] text-slate-400">Cortical Crowd:</span>
                  <input
                    type="range"
                    min="0.38"
                    max="0.72"
                    step="0.01"
                    value={bleedValveActiveFraction}
                    onChange={(e) => setBleedValveActiveFraction(parseFloat(e.target.value))}
                    className="w-20 accent-emerald-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-emerald-300 font-bold">
                    {bleedValveActiveFraction.toFixed(2)} → Damping +{bleedComputed.adaptiveThresholdDampingMv.toFixed(2)}mV
                  </span>
                </div>
              </div>
            </div>

            {/* Inter-Subsystem Feedback Coupling Bridge */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
              <div className="bg-[#050811] p-3 rounded-lg border border-rose-500/20 flex items-start gap-2.5">
                <div className="w-2.5 h-8 rounded-full bg-rose-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="text-[10px] text-rose-400 font-bold uppercase block">Source Node</span>
                  <span className="font-bold text-white text-xs block truncate">synapticStability (STDP)</span>
                  <div className="text-[11px] text-slate-400 mt-1 space-y-0.5">
                    <div>Phase: <strong className="text-slate-200">{metrics.phases.synapticStability?.currentPhaseDeg ?? 270}°</strong></div>
                    <div>Offset: <strong className="text-slate-200">{tracker.synapticPhaseOffsetMs.toFixed(2)} ms</strong></div>
                  </div>
                </div>
              </div>

              <div className="bg-[#050811] p-3 rounded-lg border border-cyan-500/20 flex flex-col justify-center items-center text-center">
                <span className="text-[10px] text-cyan-400 font-bold uppercase block mb-1">Feedback Coupling Bridge</span>
                <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                  <span>Δτ = {tracker.feedbackLagMs.toFixed(2)} ms</span>
                  <span>•</span>
                  <span>Δφ = {tracker.effectivePhaseDisparityMs.toFixed(2)} ms</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                  {tracker.isBsiCompensationActive
                    ? 'AER jitter (1.2ms) decorrelates bursts. Subsystem health locked at 100.'
                    : `Bleed-Off Valve active (${bleedComputed.phaseJitterMs.toFixed(2)}ms jitter, +${bleedComputed.adaptiveThresholdDampingMv.toFixed(2)}mV threshold damping).`}
                </p>
              </div>

              <div className="bg-[#050811] p-3 rounded-lg border border-emerald-500/20 flex items-start gap-2.5">
                <div className="w-2.5 h-8 rounded-full bg-emerald-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="text-[10px] text-emerald-400 font-bold uppercase block">Target Node</span>
                  <span className="font-bold text-white text-xs block truncate">frequencyBands (Oscillations)</span>
                  <div className="text-[11px] text-slate-400 mt-1 space-y-0.5">
                    <div>Phase: <strong className="text-slate-200">{metrics.phases.frequencyBands?.currentPhaseDeg ?? 180}°</strong></div>
                    <div>Offset: <strong className="text-slate-200">{tracker.frequencyPhaseOffsetMs.toFixed(2)} ms</strong></div>
                    <div>BSI: <strong className={tracker.burstSynchronyIndex > 0.28 ? 'text-amber-400' : 'text-emerald-400'}>
                      {tracker.burstSynchronyIndex.toFixed(3)} idx
                    </strong></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Footer Info Box */}
      <div className="bg-[#090d16] p-2.5 rounded-lg border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
        <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          The Subsystem Heartbeat Monitor continuously measures temporal phase offsets $\Delta \phi$ between asynchronous neuromorphic layers. During burst stimulus or plasticity surges, clock realignments ensure the 5 SNN subsystems maintain biological coherence and suppress drift-induced cascades.
        </p>
      </div>
    </div>
  );
});

SubsystemHeartbeatMonitor.displayName = 'SubsystemHeartbeatMonitor';
