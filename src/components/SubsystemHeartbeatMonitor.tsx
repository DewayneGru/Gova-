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
} from 'lucide-react';
import { SubsystemHeartbeatMetrics, SubsystemId } from '../types';
import { TelemetryHealthCheckMonitor, globalTelemetryHealthMonitor } from '../lib/telemetryHealthMonitor';

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
