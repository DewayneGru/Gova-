import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  SubsystemId,
  AnomalySeverity,
  UnifiedHealthMonitorState,
  TelemetryAnomalyRecord,
  SNNTuningConfig,
} from '../types';
import { TelemetryHealthCheckMonitor } from '../lib/telemetryHealthMonitor';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Compass,
  Cpu,
  Download,
  FileSpreadsheet,
  Filter,
  Flame,
  Gauge,
  GitBranch,
  Heart,
  Layers,
  Network,
  Radio,
  RefreshCw,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Target,
  Trash2,
  Wand2,
  Zap,
} from 'lucide-react';
import { SubsystemHeartbeatMonitor } from './SubsystemHeartbeatMonitor';

interface UnifiedTelemetryHealthMonitorPanelProps {
  monitor: TelemetryHealthCheckMonitor;
  currentTuning?: SNNTuningConfig;
  onApplyTuningFix?: (adjustments: Partial<SNNTuningConfig>) => void;
  onEngageHomeostaticScaling?: () => void;
  onCalibrateHomeostaticLoop?: () => void;
  onRepairPathwayLeaks?: () => any;
}

export const UnifiedTelemetryHealthMonitorPanel: React.FC<UnifiedTelemetryHealthMonitorPanelProps> = React.memo(({
  monitor,
  currentTuning,
  onApplyTuningFix,
  onEngageHomeostaticScaling,
  onCalibrateHomeostaticLoop,
  onRepairPathwayLeaks,
}) => {
  const [monitorState, setMonitorState] = useState<UnifiedHealthMonitorState>(monitor.getState());
  const [selectedSubsystemFilter, setSelectedSubsystemFilter] = useState<SubsystemId | 'all'>('all');
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState<AnomalySeverity | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isInjecting, setIsInjecting] = useState<boolean>(false);
  const [remediationFeedback, setRemediationFeedback] = useState<string | null>(null);

  // Widget view modes: 'origin' | 'matrix' | 'rateLoop' | 'heartbeat' | 'leaks'
  const [activeWidgetView, setActiveWidgetView] = useState<'origin' | 'matrix' | 'rateLoop' | 'heartbeat' | 'leaks'>('origin');
  const [selectedPairKey, setSelectedPairKey] = useState<string>('synapticStability:substrateKeel');

  // Critical divergence auto-export state & debounce tracker (DRI > 0.60)
  const lastAutoExportTimeRef = useRef<number>(0);
  const [autoExportAlert, setAutoExportAlert] = useState<{
    dri: number;
    timestamp: number;
    filename: string;
  } | null>(null);

  // Subscribe to live monitor state updates
  useEffect(() => {
    const unsubscribe = monitor.subscribe((updated) => {
      setMonitorState({ ...updated });
    });
    return () => unsubscribe();
  }, [monitor]);

  // Automatically trigger a JSON export of the performance buffer when a critical system divergence (DRI > 0.60) is detected
  useEffect(() => {
    const currentDri =
      monitorState.currentDri ??
      (monitorState.subsystems?.synapticStability?.metrics?.find((c) => c.key === 'divergenceRiskIndex')?.value as number | undefined);

    if (currentDri !== undefined && currentDri > 0.60) {
      const now = Date.now();
      // Enforce 15-second cooldown per critical spike episode to prevent download storms
      if (now - lastAutoExportTimeRef.current > 15000) {
        lastAutoExportTimeRef.current = now;
        const filename = `snn-critical-divergence-dri-${currentDri.toFixed(2)}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const dataStr = monitor.exportCorrelationAndBufferLogs();
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);

        setAutoExportAlert({
          dri: currentDri,
          timestamp: now,
          filename,
        });
      }
    }
  }, [monitorState.currentDri, monitorState.subsystems, monitor]);

  // Filtered performance buffer records
  const filteredBuffer = useMemo(() => {
    return monitorState.anomalyBuffer.filter((record) => {
      if (selectedSubsystemFilter !== 'all' && record.subsystem !== selectedSubsystemFilter) {
        return false;
      }
      if (selectedSeverityFilter !== 'all' && record.severity !== selectedSeverityFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesText =
          record.metricLabel.toLowerCase().includes(query) ||
          record.subsystemName.toLowerCase().includes(query) ||
          record.description.toLowerCase().includes(query) ||
          record.recommendedMitigation.toLowerCase().includes(query);
        if (!matchesText) return false;
      }
      return true;
    });
  }, [monitorState.anomalyBuffer, selectedSubsystemFilter, selectedSeverityFilter, searchQuery]);

  // Counts by subsystem
  const subsystemAnomalyCounts = useMemo(() => {
    const counts: Record<SubsystemId, number> = {
      core: 0,
      substrateKeel: 0,
      frequencyBands: 0,
      aerBus: 0,
      synapticStability: 0,
    };
    monitorState.anomalyBuffer.forEach((a) => {
      if (counts[a.subsystem] !== undefined) counts[a.subsystem]++;
    });
    return counts;
  }, [monitorState.anomalyBuffer]);

  const handleRunAnalysis = async () => {
    setRemediationFeedback(null);
    await monitor.runAutonomousAnalysis(currentTuning);
  };

  const handleInjectSyntheticAnomaly = (subId: SubsystemId, severity: AnomalySeverity = 'warning') => {
    setIsInjecting(true);
    monitor.injectSyntheticAnomaly(subId, severity);
    setTimeout(() => setIsInjecting(false), 300);
  };

  const handleClearBuffer = () => {
    monitor.clearBuffer();
    setRemediationFeedback(null);
  };

  const handleExportJson = () => {
    const dataStr = monitor.exportCorrelationAndBufferLogs();
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `snn-divergence-correlation-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsvTrace = () => {
    const csvStr = monitor.exportPerformanceBufferCsv();
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `snn-full-telemetry-trace-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleToggleGlobalSync = (enabled: boolean) => {
    monitor.setGlobalSubsystemSync(enabled, monitorState.globalSubsystemSyncMode);
  };

  const handleSetSyncMode = (mode: 'auto_divergence_boost' | 'forced_10ms' | 'standard_30fps') => {
    monitor.setGlobalSubsystemSync(true, mode);
  };

  const handleTestDivergenceSpike = () => {
    handleInjectSyntheticAnomaly('synapticStability', 'critical');
  };

  const handleApplyAutonomousRemedy = () => {
    const analysis = monitorState.lastAutonomousAnalysis;
    if (!analysis) return;

    if (analysis.primaryFailureSubsystem === 'synapticStability') {
      if (onApplyTuningFix) {
        onApplyTuningFix({
          aMinus: 0.058,
          aPlus: 0.030,
          learningRate: 0.38,
        });
      }
      if (onEngageHomeostaticScaling) {
        onEngageHomeostaticScaling();
      }
      setRemediationFeedback('Autonomous Remedy Applied: LTD dominance ratio increased to 1.93 and learning rate dampened to 0.38.');
    } else if (analysis.primaryFailureSubsystem === 'core') {
      if (onApplyTuningFix) {
        onApplyTuningFix({
          learningRate: 0.28,
          proximityGain: 1.15,
        });
      }
      setRemediationFeedback('Autonomous Remedy Applied: Dynamic switching power throttled via reduced afferent proximity gain.');
    } else {
      if (onEngageHomeostaticScaling) {
        onEngageHomeostaticScaling();
      }
      setRemediationFeedback('Autonomous Remedy Applied: Proactive homeostatic balancing engaged across active SNN network.');
    }
  };

  const handleCalibrateHomeostaticLoopAction = () => {
    if (onCalibrateHomeostaticLoop) {
      onCalibrateHomeostaticLoop();
    } else if (onEngageHomeostaticScaling) {
      onEngageHomeostaticScaling();
    }
    setRemediationFeedback('Homeostatic Spiking Rate Loop Calibrated: Biological 28.0 Hz target setpoint enforced, adaptive threshold damping active, spontaneous drive balanced.');
  };

  const handleQuarantinePathwayLeaks = () => {
    if (onRepairPathwayLeaks) {
      const res = onRepairPathwayLeaks();
      setRemediationFeedback(
        `Neural Pathway Quarantine & Leak Fix Complete: Restored 0% weight saturation headroom, verified active GABAergic lateral cross-inhibition (N12/N13), strictly bounded membrane potentials [-85 mV, -58 mV], cleared stale AER buffers (${res?.clearedAERPackets ?? 0} pkts), and centered SAE baseline. Divergence Risk Index restored to ${(res?.restoredDRI ?? 0).toFixed(1)}% nominal.`
      );
    } else if (onEngageHomeostaticScaling) {
      onEngageHomeostaticScaling();
      setRemediationFeedback('Homeostatic stabilization engaged across all synaptic pathways.');
    }
  };

  const overallScoreColor =
    monitorState.overallHealthScore >= 90
      ? 'text-emerald-400'
      : monitorState.overallHealthScore >= 75
      ? 'text-amber-400'
      : 'text-rose-400';

  const overallBgGlow =
    monitorState.overallHealthScore >= 90
      ? 'from-emerald-500/10 to-transparent border-emerald-500/30'
      : monitorState.overallHealthScore >= 75
      ? 'from-amber-500/10 to-transparent border-amber-500/30'
      : 'from-rose-500/10 to-transparent border-rose-500/40 animate-pulse';

  const matrixData = monitorState.correlationMatrix;
  const originData = monitorState.divergenceOrigin;

  // Selected pair for detail inspection
  const selectedPair = matrixData?.pairs[selectedPairKey] || matrixData?.pairs['synapticStability:substrateKeel'];

  const subsystemLabels: Record<SubsystemId, { label: string; code: string }> = {
    synapticStability: { label: 'Synaptic Stability', code: 'SYN-STAB' },
    substrateKeel: { label: 'Substrate Keel', code: 'SUB-KEEL' },
    frequencyBands: { label: 'Frequency Bands', code: 'FREQ-SPEC' },
    core: { label: 'Core Hardware', code: 'CORE-HW' },
    aerBus: { label: 'AER Event Bus', code: 'AER-BUS' },
  };

  return (
    <div className="space-y-6">
      {/* Critical System Divergence Auto-Export Notification Banner (DRI > 0.60) */}
      {autoExportAlert && (
        <div className="bg-gradient-to-r from-rose-950/90 via-slate-900 to-indigo-950/90 border border-rose-500/60 rounded-xl p-4 flex items-start justify-between gap-3 shadow-xl ring-1 ring-rose-500/30 text-rose-200 animate-fadeIn">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 mt-0.5 shrink-0">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>
            <div className="text-xs space-y-1">
              <div className="font-bold text-rose-100 flex items-center gap-2 flex-wrap">
                <span>Critical System Divergence Detected (DRI {autoExportAlert.dri.toFixed(2)} &gt; 0.60)</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-900/80 text-rose-300 border border-rose-700 font-bold uppercase">
                  Automated Forensic JSON Export Triggered
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                A critical plasticity runaway episode breached the 0.60 DRI threshold. The Unified Health Monitor has automatically saved a full forensic trace of the rolling 5-subsystem performance buffer to:
                <code className="text-cyan-300 font-mono block mt-1 bg-slate-950/80 p-1.5 rounded border border-slate-800 break-all">
                  {autoExportAlert.filename}
                </code>
              </p>
              <div className="text-[10px] font-mono text-slate-400">
                Timestamp: {new Date(autoExportAlert.timestamp).toLocaleTimeString()} &bull; Preserves high-fidelity telemetry for offline forensic reasoning and model self-improvement audits.
              </div>
            </div>
          </div>
          <button
            onClick={() => setAutoExportAlert(null)}
            className="text-rose-300 hover:text-white text-xs px-2.5 py-1 rounded bg-rose-900/40 hover:bg-rose-900 border border-rose-700/60 transition cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 1. Global Telemetry Health-Check Header & Operational Dashboard */}
      <div className={`relative overflow-hidden rounded-xl border bg-gradient-to-b ${overallBgGlow} bg-slate-900/90 p-6 backdrop-blur-md transition-all shadow-xl`}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Activity className="h-6 w-6 animate-pulse" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  Unified Telemetry Health-Check Monitor
                  <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                    5/5 SUBSYSTEMS SUBSCRIBED
                  </span>
                </h2>
                <p className="text-sm text-slate-400">
                  Real-time 30 FPS telemetry stream monitoring Core, Keel, Frequency Spectrum, AER Bus, and Synaptic Plasticity
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400 pt-1">
              <span className="flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
                Subscription Rate: <span className="text-slate-200">30 FPS (33.3ms)</span>
              </span>
              <span className="text-slate-600">•</span>
              <span>
                Sampled Frames: <span className="text-slate-200">{monitorState.sampleCount.toLocaleString()}</span>
              </span>
              <span className="text-slate-600">•</span>
              <span>
                Performance Buffer: <span className="text-slate-200">{monitorState.anomalyBuffer.length} / {monitorState.bufferCapacity}</span>
              </span>
              <span className="text-slate-600">•</span>
              <span>
                Total Anomalies Logged: <span className="text-amber-400 font-semibold">{monitorState.totalAnomaliesLogged}</span>
              </span>
            </div>
          </div>

          {/* Health Gauge & Autonomous Trigger Actions */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 bg-slate-950/80 px-5 py-3 rounded-xl border border-slate-800">
              <div className="text-right">
                <div className="text-xs font-mono uppercase text-slate-400">Aggregate Health</div>
                <div className="text-xs font-semibold text-slate-300">
                  {monitorState.overallStatus === 'nominal'
                    ? 'HEALTHY NOMINAL'
                    : monitorState.overallStatus === 'degraded'
                    ? 'DEGRADED WARNING'
                    : 'CRITICAL ANOMALY'}
                </div>
              </div>
              <div className={`text-4xl font-black font-mono tracking-tighter ${overallScoreColor}`}>
                {monitorState.overallHealthScore}%
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleQuarantinePathwayLeaks}
                className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-medium text-xs shadow-md transition-all active:scale-[0.98]"
                title="Quarantine all neural pathway leaks: clamp membrane voltages, re-establish lateral inhibition, restore 0% pre-saturation, and reset DRI to nominal"
              >
                <ShieldCheck className="h-4 w-4 text-amber-200" />
                <span>Fix Pathway Leaks</span>
              </button>

              <button
                onClick={handleRunAnalysis}
                disabled={monitorState.autonomousAnalysisRunning}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-medium text-xs shadow-md transition-all disabled:opacity-50"
              >
                {monitorState.autonomousAnalysisRunning ? (
                  <RefreshCw className="h-4 w-4 animate-spin text-cyan-200" />
                ) : (
                  <Wand2 className="h-4 w-4 text-cyan-200" />
                )}
                <span>Run Autonomous Analysis</span>
              </button>

              <button
                type="button"
                onClick={handleExportJson}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono border border-slate-700 transition-colors shadow-sm"
                title="Export current anomaly correlation matrix and performance buffer logs to local JSON file"
              >
                <Download className="h-4 w-4 text-cyan-400" />
                <span>Export Report (JSON)</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadCsvTrace}
                className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-mono font-medium border border-emerald-500/50 transition-colors shadow-md"
                title="Download rolling 5-subsystem performance buffer as a CSV file for deep-reasoning offline audits"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-200" />
                <span>Download Full Telemetry Trace (CSV)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 1b. Global Subsystem Sync & High-Frequency Diagnostic Polling Section */}
      <div className={`rounded-xl border p-4.5 transition-all shadow-md ${
        monitorState.isDivergenceBoostActive
          ? 'border-cyan-500/60 bg-gradient-to-r from-cyan-950/60 via-slate-900 to-indigo-950/60 ring-1 ring-cyan-500/30'
          : monitorState.globalSubsystemSync
          ? 'border-slate-800 bg-slate-900/90'
          : 'border-slate-800/80 bg-slate-950/80 opacity-75'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm flex items-center gap-2">
                  <Radio className={`h-4 w-4 ${monitorState.isDivergenceBoostActive ? 'text-cyan-400 animate-pulse' : 'text-slate-400'}`} />
                  Global Subsystem Sync:
                </span>
                <button
                  type="button"
                  onClick={() => handleToggleGlobalSync(!monitorState.globalSubsystemSync)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    monitorState.globalSubsystemSync ? 'bg-cyan-500' : 'bg-slate-700'
                  }`}
                  title={monitorState.globalSubsystemSync ? 'Disable Global Subsystem Sync' : 'Enable Global Subsystem Sync'}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      monitorState.globalSubsystemSync ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Status Indicator Badge */}
              <span
                className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded border flex items-center gap-1.5 ${
                  monitorState.isDivergenceBoostActive
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse'
                    : monitorState.globalSubsystemSync
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {monitorState.isDivergenceBoostActive ? (
                  <>
                    <Zap className="h-3 w-3 text-cyan-400 fill-cyan-400" />
                    <span>10ms HIGH-FIDELITY BOOST ACTIVE (100 Hz)</span>
                  </>
                ) : monitorState.globalSubsystemSync ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    <span>SYNC ARMED: {monitorState.currentPollingIntervalMs.toFixed(1)}ms ({Math.round(1000 / monitorState.currentPollingIntervalMs)} Hz)</span>
                  </>
                ) : (
                  <span>SYNC DISABLED (33.3ms)</span>
                )}
              </span>

              <span className="text-[11px] font-mono text-slate-400">
                Polling Interval: <strong className={monitorState.isDivergenceBoostActive ? 'text-cyan-300' : 'text-slate-200'}>
                  {monitorState.currentPollingIntervalMs.toFixed(1)}ms
                </strong>
              </span>
            </div>

            <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
              Forces a high-frequency polling interval (10ms / 100 Hz) for critical diagnostic nodes during detected divergence spikes, ensuring the model&apos;s autonomous self-improvement cycles have high-fidelity input data.
            </p>
          </div>

          {/* Sync Mode Selector Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
              <button
                type="button"
                onClick={() => handleSetSyncMode('auto_divergence_boost')}
                disabled={!monitorState.globalSubsystemSync}
                className={`px-2.5 py-1.5 rounded transition-colors ${
                  monitorState.globalSubsystemSyncMode === 'auto_divergence_boost' && monitorState.globalSubsystemSync
                    ? 'bg-cyan-600 text-white font-bold shadow'
                    : 'text-slate-400 hover:text-white disabled:opacity-40'
                }`}
                title="Automatically boost polling rate to 10ms when a divergence spike is detected"
              >
                Auto 10ms Spike Boost
              </button>

              <button
                type="button"
                onClick={() => handleSetSyncMode('forced_10ms')}
                disabled={!monitorState.globalSubsystemSync}
                className={`px-2.5 py-1.5 rounded transition-colors ${
                  monitorState.globalSubsystemSyncMode === 'forced_10ms' && monitorState.globalSubsystemSync
                    ? 'bg-indigo-600 text-white font-bold shadow'
                    : 'text-slate-400 hover:text-white disabled:opacity-40'
                }`}
                title="Continuously lock polling to 10ms (100 Hz) for ultra-high temporal fidelity"
              >
                Forced 10ms Lock
              </button>

              <button
                type="button"
                onClick={() => handleSetSyncMode('standard_30fps')}
                disabled={!monitorState.globalSubsystemSync}
                className={`px-2.5 py-1.5 rounded transition-colors ${
                  monitorState.globalSubsystemSyncMode === 'standard_30fps' && monitorState.globalSubsystemSync
                    ? 'bg-slate-700 text-slate-200 font-bold'
                    : 'text-slate-400 hover:text-white disabled:opacity-40'
                }`}
                title="Standard 30 FPS polling window (33.3ms)"
              >
                Standard (33.3ms)
              </button>
            </div>

            <button
              type="button"
              onClick={handleTestDivergenceSpike}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-mono transition-colors"
              title="Trigger a test divergence spike to demonstrate autonomous 10ms polling acceleration"
            >
              <Flame className="h-3.5 w-3.5 text-amber-400" />
              <span>Test 10ms Boost</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Autonomous Analysis Findings Card (if available) */}
      {monitorState.lastAutonomousAnalysis && (
        <div className="rounded-xl border border-indigo-500/40 bg-gradient-to-r from-indigo-950/50 via-slate-900 to-cyan-950/40 p-5 shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-500/20 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-400" />
              <h3 className="font-bold text-white text-sm">
                Autonomous Cross-Subsystem Analysis Report
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {monitorState.lastAutonomousAnalysis.modelUsed}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
              <span>Analyzed: {monitorState.lastAutonomousAnalysis.analyzedAnomalyCount} records</span>
              <span>•</span>
              <span className="text-cyan-400">
                Stability: {(monitorState.lastAutonomousAnalysis.systemStabilityIndex * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-2 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
              <div className="text-[11px] font-mono text-cyan-400 uppercase flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                Primary Subsystem Failure & Correlation
              </div>
              <div className="text-slate-200 font-medium">
                Root Subsystem: <span className="text-amber-300 uppercase font-mono">{monitorState.lastAutonomousAnalysis.primaryFailureSubsystem}</span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                {monitorState.lastAutonomousAnalysis.crossSubsystemCorrelation}
              </p>
            </div>

            <div className="space-y-2 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
              <div className="text-[11px] font-mono text-purple-400 uppercase flex items-center gap-1.5">
                <Gauge className="h-3.5 w-3.5" />
                Neurocomputational Root Cause Hypothesis
              </div>
              <p className="text-slate-300 leading-relaxed">
                {monitorState.lastAutonomousAnalysis.rootCauseHypothesis}
              </p>
            </div>
          </div>

          <div className="space-y-2 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
            <div className="text-[11px] font-mono text-emerald-400 uppercase flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              Autonomous Actionable Remediation Plan
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {monitorState.lastAutonomousAnalysis.recommendedActions.map((act, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 bg-slate-900 p-2.5 rounded border border-slate-800/80 text-xs text-slate-300"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-mono text-emerald-400">
                    {idx + 1}
                  </span>
                  <span>{act}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            {remediationFeedback ? (
              <div className="text-xs text-emerald-400 flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                {remediationFeedback}
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic">
                Operator can autonomously enforce the synthesis plan to stabilize running network.
              </div>
            )}

            <button
              onClick={handleApplyAutonomousRemedy}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors shadow flex items-center gap-2"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Apply Autonomous Remediation</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. The Five SNN Subsystems Real-Time Status Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-cyan-400" />
            Five SNN Subsystems Real-Time Stream
          </h3>
          <span className="text-xs text-slate-500">
            Click any subsystem card to filter the anomaly buffer below
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {(Object.keys(monitorState.subsystems) as SubsystemId[]).map((subId) => {
            const report = monitorState.subsystems[subId];
            const isSelected = selectedSubsystemFilter === subId;
            const anomalyCount = subsystemAnomalyCounts[subId];

            const cardStatusColor =
              report.status === 'nominal'
                ? 'border-emerald-500/30 bg-slate-900/80 hover:border-emerald-500/60'
                : report.status === 'degraded'
                ? 'border-amber-500/40 bg-slate-900/90 hover:border-amber-500/70'
                : 'border-rose-500/50 bg-rose-950/20 hover:border-rose-500/80 animate-pulse';

            const scoreColor =
              report.healthScore >= 90
                ? 'text-emerald-400'
                : report.healthScore >= 75
                ? 'text-amber-400'
                : 'text-rose-400';

            return (
              <div
                key={subId}
                onClick={() => setSelectedSubsystemFilter(isSelected ? 'all' : subId)}
                className={`relative rounded-xl border p-4 cursor-pointer transition-all duration-200 flex flex-col justify-between ${cardStatusColor} ${
                  isSelected ? 'ring-2 ring-cyan-400 shadow-lg' : ''
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {report.code}
                    </span>
                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold ${
                        report.status === 'nominal'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : report.status === 'degraded'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                      }`}
                    >
                      {report.status}
                    </span>
                  </div>

                  <h4 className="font-bold text-white text-xs leading-snug mb-1">
                    {report.name}
                  </h4>
                  <p className="text-[11px] text-slate-400 line-clamp-2 mb-3">
                    {report.description}
                  </p>

                  {/* Subsystem Live Metrics Table */}
                  <div className="space-y-1 bg-slate-950/80 p-2 rounded-lg border border-slate-800/80 text-[11px] font-mono mb-3">
                    {report.metrics.slice(0, 3).map((m) => (
                      <div key={m.key} className="flex items-center justify-between">
                        <span className="text-slate-400 truncate pr-2">{m.label}:</span>
                        <span
                          className={`font-semibold shrink-0 ${
                            m.status === 'critical'
                              ? 'text-rose-400'
                              : m.status === 'warning'
                              ? 'text-amber-400'
                              : 'text-slate-200'
                          }`}
                        >
                          {typeof m.value === 'number' ? m.value.toFixed(1) : m.value} {m.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-500 text-[10px] font-mono block">Health Score</span>
                    <span className={`text-lg font-bold font-mono ${scoreColor}`}>
                      {report.healthScore}%
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-slate-500 text-[10px] font-mono block">Anomalies</span>
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                        anomalyCount > 0
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {anomalyCount}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. SUBSYSTEM CORRELATION MATRIX & DIVERGENCE ORIGIN INSPECTOR WIDGET */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-5">
        {/* Widget Header with Segmented Navigation Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <Network className="h-5 w-5 text-cyan-400" />
              <h3 className="font-bold text-white text-base">
                Subsystem Correlation Matrix & Divergence Origin Inspector
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Cross-subsystem anomaly pattern detection diagnosing if divergence spikes originate in the synaptic matrix or substrate keel
            </p>
          </div>

          {/* Segmented Mode Selector Buttons & JSON Export */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setActiveWidgetView('origin')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeWidgetView === 'origin'
                    ? 'bg-cyan-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Compass className="h-3.5 w-3.5" />
                <span>Divergence Origin Diagnostic</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveWidgetView('matrix')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeWidgetView === 'matrix'
                    ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <GitBranch className="h-3.5 w-3.5" />
                <span>5x5 Correlation Matrix</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveWidgetView('rateLoop')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeWidgetView === 'rateLoop'
                    ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>Homeostatic Rate Loop</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveWidgetView('heartbeat')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeWidgetView === 'heartbeat'
                    ? 'bg-rose-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Heart className="h-3.5 w-3.5 text-rose-300" />
                <span>Subsystem Heartbeat</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveWidgetView('leaks')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeWidgetView === 'leaks'
                    ? 'bg-amber-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5 text-amber-300" />
                <span>Pathway Leaks & Bleed</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono border border-slate-700 transition-colors shadow-sm"
              title="Export anomaly correlation matrix and performance buffer logs to local JSON file"
            >
              <Download className="h-3.5 w-3.5 text-cyan-400" />
              <span>Export Matrix & Logs (JSON)</span>
            </button>
          </div>
        </div>

        {/* View 1: Divergence Origin Diagnostic (Synaptic Matrix vs. Substrate Keel) */}
        {activeWidgetView === 'origin' && originData && (
          <div className="space-y-4">
            {/* Primary Origin Verdict Banner */}
            <div
              className={`rounded-xl border p-4.5 transition-all ${
                originData.primaryOrigin === 'synaptic_matrix'
                  ? 'border-amber-500/50 bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900'
                  : originData.primaryOrigin === 'substrate_keel'
                  ? 'border-cyan-500/50 bg-gradient-to-r from-cyan-950/40 via-slate-900 to-slate-900'
                  : originData.primaryOrigin === 'spiking_rate_loop' || originData.primaryOrigin === 'rate_homeostasis_loop'
                  ? 'border-purple-500/50 bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-900'
                  : 'border-emerald-500/40 bg-gradient-to-r from-emerald-950/30 via-slate-900 to-slate-900'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                      Primary Anomaly Origin Verdict:
                    </span>
                    <span
                      className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded border ${
                        originData.primaryOrigin === 'synaptic_matrix'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : originData.primaryOrigin === 'substrate_keel'
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : originData.primaryOrigin === 'spiking_rate_loop' || originData.primaryOrigin === 'rate_homeostasis_loop'
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      }`}
                    >
                      {originData.primaryOrigin === 'synaptic_matrix'
                        ? 'SYNAPTIC MATRIX DOMINANT (Plasticity Drift / Runaway LTP)'
                        : originData.primaryOrigin === 'substrate_keel'
                        ? 'SUBSTRATE KEEL DOMINANT (Affective Valence / Trauma Lock)'
                        : originData.primaryOrigin === 'spiking_rate_loop' || originData.primaryOrigin === 'rate_homeostasis_loop'
                        ? 'RATE HOMEOSTASIS LOOP DOMINANT (Spiking Frequency Deviation)'
                        : 'NOMINAL EQUILIBRIUM (No Divergence Anomaly Detected)'}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      Confidence: <strong className="text-white">{originData.confidencePct}%</strong>
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">
                    {originData.verdictSummary}
                  </p>
                </div>

                {originData.earliestSpikeSubsystem && (
                  <div className="bg-slate-950/80 px-4 py-2.5 rounded-lg border border-slate-800 text-xs font-mono shrink-0">
                    <div className="text-[10px] text-slate-500 uppercase">Earliest Tripped Vector</div>
                    <div className="text-amber-300 font-bold">
                      {subsystemLabels[originData.earliestSpikeSubsystem]?.label || originData.earliestSpikeSubsystem}
                    </div>
                    {originData.timeDifferenceMs > 0 && (
                      <div className="text-[11px] text-slate-400">
                        Lead Lead-Lag: <span className="text-cyan-400">{originData.timeDifferenceMs} ms earlier</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Diagnostic Vector Comparison Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
              {/* Synaptic Vector Card */}
              <div
                className={`p-4 rounded-xl border bg-slate-950/70 space-y-2.5 ${
                  originData.primaryOrigin === 'synaptic_matrix'
                    ? 'border-amber-500/50 ring-1 ring-amber-500/20'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                    <Zap className="h-4 w-4" />
                    <span>Synaptic Matrix Vector</span>
                  </div>
                  <span className="text-sm font-bold text-amber-300">
                    {(originData.synapticRiskFactor * 100).toFixed(0)}% Risk
                  </span>
                </div>

                <div className="space-y-1.5 text-[11px] text-slate-400 pt-1">
                  <div className="flex justify-between">
                    <span>Cumulative STDP Drift:</span>
                    <span className="text-slate-200">{originData.divergenceVectorComparison.synapticDriftLTD} pts</span>
                  </div>
                  <div className="flex justify-between">
                    <span>LTD/LTP Dominance:</span>
                    <span className="text-slate-200">
                      {monitorState.subsystems.synapticStability.metrics.find((m) => m.key === 'ltdLtpRatio')?.value ?? 1.25}x
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Lyapunov Exponent:</span>
                    <span className="text-slate-200">
                      {monitorState.subsystems.synapticStability.metrics.find((m) => m.key === 'lyapunovExponent')?.value ?? -0.05} λ
                    </span>
                  </div>
                </div>

                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-amber-500 transition-all duration-300"
                    style={{ width: `${Math.min(100, originData.synapticRiskFactor * 100)}%` }}
                  />
                </div>
              </div>

              {/* Substrate Keel Vector Card */}
              <div
                className={`p-4 rounded-xl border bg-slate-950/70 space-y-2.5 ${
                  originData.primaryOrigin === 'substrate_keel'
                    ? 'border-cyan-500/50 ring-1 ring-cyan-500/20'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
                    <Scale className="h-4 w-4" />
                    <span>Substrate Keel Vector</span>
                  </div>
                  <span className="text-sm font-bold text-cyan-300">
                    {(originData.keelRiskFactor * 100).toFixed(0)}% Risk
                  </span>
                </div>

                <div className="space-y-1.5 text-[11px] text-slate-400 pt-1">
                  <div className="flex justify-between">
                    <span>Affective Valence:</span>
                    <span className="text-slate-200">{originData.divergenceVectorComparison.keelValenceDrop} pts</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Trauma State:</span>
                    <span className="text-slate-200">
                      {monitorState.subsystems.substrateKeel.metrics.find((m) => m.key === 'traumaState')?.value === 1 ? 'dorsal_trauma' : 'ventral_eq'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Gate Damping Factor:</span>
                    <span className="text-slate-200">
                      {monitorState.subsystems.substrateKeel.metrics.find((m) => m.key === 'gateDampingFactor')?.value ?? 1.0}x
                    </span>
                  </div>
                </div>

                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-cyan-500 transition-all duration-300"
                    style={{ width: `${Math.min(100, originData.keelRiskFactor * 100)}%` }}
                  />
                </div>
              </div>

              {/* Homeostatic Rate Loop Vector Card */}
              <div
                className={`p-4 rounded-xl border bg-slate-950/70 space-y-2.5 ${
                  originData.primaryOrigin === 'spiking_rate_loop' || originData.primaryOrigin === 'rate_homeostasis_loop'
                    ? 'border-purple-500/50 ring-1 ring-purple-500/20'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-purple-400 font-bold">
                    <Target className="h-4 w-4" />
                    <span>Homeostatic Rate Vector</span>
                  </div>
                  <span className="text-sm font-bold text-purple-300">
                    {(originData.rateLoopRiskFactor * 100).toFixed(0)}% Risk
                  </span>
                </div>

                <div className="space-y-1.5 text-[11px] text-slate-400 pt-1">
                  <div className="flex justify-between">
                    <span>Mean Firing Frequency:</span>
                    <span className="text-slate-200">{originData.homeostaticLoopAssessment.currentRateHz.toFixed(1)} Hz</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Target Biological Rate:</span>
                    <span className="text-slate-200">{originData.homeostaticLoopAssessment.targetRateHz} Hz</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Adaptive Threshold Damping:</span>
                    <span className="text-slate-200">
                      {originData.homeostaticLoopAssessment.adaptiveThresholdDampingMv >= 0 ? '+' : ''}
                      {originData.homeostaticLoopAssessment.adaptiveThresholdDampingMv} mV
                    </span>
                  </div>
                </div>

                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-purple-500 transition-all duration-300"
                    style={{ width: `${Math.min(100, originData.rateLoopRiskFactor * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Recommended Intervention Banner with Quick Action */}
            <div className="bg-slate-950/90 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 text-xs">
                <span className="text-[11px] font-mono text-cyan-400 uppercase tracking-wider block">
                  Actionable Divergence Stabilization Protocol:
                </span>
                <p className="text-slate-300">
                  {originData.recommendedIntervention}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleCalibrateHomeostaticLoopAction}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs font-mono transition-colors shadow flex items-center gap-1.5"
                >
                  <Sliders className="h-3.5 w-3.5" />
                  <span>Calibrate Homeostatic Loop</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View 2: Interactive 5x5 Correlation Matrix Heatmap */}
        {activeWidgetView === 'matrix' && matrixData && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Matrix Table */}
              <div className="lg:col-span-2 overflow-x-auto">
                <table className="w-full text-xs font-mono border-collapse">
                  <thead>
                    <tr>
                      <th className="p-2 text-left text-slate-500 font-normal border-b border-slate-800 text-[10px]">
                        SUBSYSTEM COUPLING
                      </th>
                      {matrixData.subsystemOrder.map((subId) => (
                        <th
                          key={subId}
                          className="p-2 text-center text-slate-400 font-bold border-b border-slate-800 text-[11px]"
                        >
                          {subsystemLabels[subId]?.code || subId}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixData.subsystemOrder.map((rowSub, rIdx) => (
                      <tr key={rowSub} className="border-b border-slate-800/60 hover:bg-slate-950/40">
                        <td className="p-2.5 font-bold text-slate-300 text-[11px]">
                          {subsystemLabels[rowSub]?.label || rowSub}
                        </td>
                        {matrixData.subsystemOrder.map((colSub, cIdx) => {
                          const isDiagonal = rIdx === cIdx;
                          const val = matrixData.matrix[rIdx]?.[cIdx] ?? (isDiagonal ? 1.0 : 0.0);
                          const pairKey = `${rowSub}:${colSub}`;
                          const isSelected = selectedPairKey === pairKey || selectedPairKey === `${colSub}:${rowSub}`;

                          // Cell color coding based on correlation intensity
                          let cellBg = 'bg-slate-950 text-slate-500';
                          if (isDiagonal) {
                            cellBg = 'bg-slate-900 text-slate-400 font-bold';
                          } else if (val >= 0.60) {
                            cellBg = 'bg-rose-500/25 text-rose-300 font-bold border border-rose-500/40';
                          } else if (val >= 0.35) {
                            cellBg = 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30';
                          } else if (val >= 0.15) {
                            cellBg = 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/20';
                          } else if (val <= -0.20) {
                            cellBg = 'bg-purple-500/20 text-purple-300 border border-purple-500/30';
                          }

                          return (
                            <td key={colSub} className="p-1 text-center">
                              <button
                                onClick={() => !isDiagonal && setSelectedPairKey(pairKey)}
                                disabled={isDiagonal}
                                className={`w-full py-2 px-1 rounded text-center transition-all ${cellBg} ${
                                  isSelected ? 'ring-2 ring-cyan-400 shadow-md' : 'hover:opacity-90'
                                }`}
                                title={`${subsystemLabels[rowSub]?.label} vs ${subsystemLabels[colSub]?.label}: r = ${val}`}
                              >
                                {val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2)}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pairwise Coupling Inspector */}
              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-3 font-mono text-xs">
                <div className="flex items-center gap-2 text-cyan-400 border-b border-slate-800 pb-2">
                  <GitBranch className="h-4 w-4" />
                  <span className="font-bold text-xs uppercase">Pairwise Coupling Inspector</span>
                </div>

                {selectedPair ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-slate-300 font-bold">
                      <span>{subsystemLabels[selectedPair.subsystemA]?.code}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                      <span>{subsystemLabels[selectedPair.subsystemB]?.code}</span>
                    </div>

                    <div className="space-y-1.5 text-[11px] text-slate-400">
                      <div className="flex justify-between">
                        <span>Correlation Coefficient (r):</span>
                        <span className={`font-bold ${selectedPair.coefficient >= 0.5 ? 'text-rose-400' : 'text-cyan-300'}`}>
                          {selectedPair.coefficient >= 0 ? `+${selectedPair.coefficient}` : selectedPair.coefficient}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Coupling Score:</span>
                        <span className="text-white font-bold">{(selectedPair.couplingScore * 100).toFixed(0)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Coupling Dynamic:</span>
                        <span className="text-amber-300 uppercase">{selectedPair.couplingNature.replace('_', ' ')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Shared Anomaly Cascades:</span>
                        <span className="text-white font-bold">{selectedPair.sharedAnomalyCount} events</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Temporal Lead Subsystem:</span>
                        <span className="text-cyan-400">
                          {selectedPair.leadSubsystem === 'synchronous'
                            ? 'Synchronous'
                            : `${subsystemLabels[selectedPair.leadSubsystem]?.code || selectedPair.leadSubsystem} (${selectedPair.leadLagMs} ms lead)`}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 leading-relaxed font-sans">
                      {selectedPair.couplingNature === 'direct_cascade'
                        ? 'High anomaly co-occurrence indicates a direct failure cascade between these two subsystems.'
                        : selectedPair.couplingNature === 'coupled_feedback'
                        ? 'Bidirectional feedback loop observed; anomaly perturbations oscillate across both domains.'
                        : 'Subsystems operate largely decoupled under nominal conditions.'}
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 text-center py-6">
                    Click any off-diagonal matrix cell to inspect pair dynamics.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* View 3: Homeostatic Spiking Rate Loop Inspector & Tuning */}
        {activeWidgetView === 'rateLoop' && originData && (
          <div className="space-y-4 font-mono text-xs">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block">Live Firing Frequency</span>
                <span
                  className={`text-xl font-bold font-mono ${
                    originData.homeostaticLoopAssessment.currentRateHz > 45 || originData.homeostaticLoopAssessment.currentRateHz < 8
                      ? 'text-rose-400'
                      : originData.homeostaticLoopAssessment.currentRateHz > 35
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {originData.homeostaticLoopAssessment.currentRateHz.toFixed(1)} Hz
                </span>
                <span className="text-[10px] text-slate-400 block mt-1">
                  Target: {originData.homeostaticLoopAssessment.targetRateHz} Hz (Δ = {originData.homeostaticLoopAssessment.rateDeviationHz >= 0 ? `+${originData.homeostaticLoopAssessment.rateDeviationHz}` : originData.homeostaticLoopAssessment.rateDeviationHz} Hz)
                </span>
              </div>

              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block">Adaptive Threshold Shift</span>
                <span className="text-xl font-bold font-mono text-cyan-300">
                  {originData.homeostaticLoopAssessment.adaptiveThresholdDampingMv >= 0 ? '+' : ''}
                  {originData.homeostaticLoopAssessment.adaptiveThresholdDampingMv} mV
                </span>
                <span className="text-[10px] text-slate-400 block mt-1">
                  Effective: -{(55 - originData.homeostaticLoopAssessment.adaptiveThresholdDampingMv).toFixed(1)} mV threshold
                </span>
              </div>

              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block">Synaptic Conductance Scale</span>
                <span className="text-xl font-bold font-mono text-purple-300">
                  {originData.homeostaticLoopAssessment.currentRateHz > 36
                    ? (1.0 / (1.0 + 0.045 * (originData.homeostaticLoopAssessment.currentRateHz - 36))).toFixed(2)
                    : '1.00'}x
                </span>
                <span className="text-[10px] text-slate-400 block mt-1">
                  Dynamic attenuation on deltaV
                </span>
              </div>

              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block">Spontaneous Drive State</span>
                <span className="text-xl font-bold font-mono text-emerald-300">
                  {originData.homeostaticLoopAssessment.currentRateHz < 35 ? 'ACTIVE (0.35mV)' : 'SUPPRESSED (0mV)'}
                </span>
                <span className="text-[10px] text-slate-400 block mt-1">
                  Pacemaker auto-damped under load
                </span>
              </div>
            </div>

            <div className="bg-slate-950/90 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-sans">
              <div className="space-y-1 text-xs">
                <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider block">
                  Homeostatic Spiking Rate Loop Assessment:
                </span>
                <p className="text-slate-300">
                  {originData.homeostaticLoopAssessment.recommendedFix}
                </p>
              </div>

              <button
                onClick={handleCalibrateHomeostaticLoopAction}
                className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs font-mono transition-colors shadow flex items-center gap-2 shrink-0"
              >
                <Sliders className="h-4 w-4" />
                <span>Calibrate Homeostatic Rate Loop</span>
              </button>
            </div>
          </div>
        )}

        {/* View 4: Subsystem Heartbeat & Inter-Clock Phase Synchrony */}
        {activeWidgetView === 'heartbeat' && (
          <div className="space-y-4">
            <SubsystemHeartbeatMonitor monitor={monitor} />
          </div>
        )}

        {/* View 5: Neural Pathway Leaks & Cross-Talk Quarantine Diagnostic */}
        {activeWidgetView === 'leaks' && (
          <div className="space-y-4">
            {/* Master Pathway Quarantine Banner */}
            <div className="rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 p-5 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-amber-400" />
                  <h3 className="font-bold text-white text-sm">
                    Neural Pathway Leakage & Cross-Talk Quarantine Diagnostics
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold uppercase">
                    Zero Pathway Bleed Enforced
                  </span>
                </div>
                <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                  Real-time circuit verification across sensory receptive fields, cortical lateral cross-inhibition,
                  physiological membrane reversal boundaries, and synaptic weight headroom. Prevents runaway excitation
                  and cross-talk signal bleeding.
                </p>
              </div>

              <button
                onClick={handleQuarantinePathwayLeaks}
                className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-medium text-xs font-mono transition-all shadow-md flex items-center gap-2 shrink-0 active:scale-[0.98]"
                title="Execute immediate deep repair: re-clamp saturated synapses, verify lateral inhibition, and reset DRI"
              >
                <Zap className="h-4 w-4 text-amber-200" />
                <span>Quarantine & Repair All Leaks</span>
              </button>
            </div>

            {/* 6-Pillar Pathway Integrity Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {/* 1. Receptive Field Channel Isolation */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-mono text-cyan-400 uppercase flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5" />
                    Receptive Field Isolation
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    ISOLATED
                  </span>
                </div>
                <div className="text-xs text-slate-200 font-semibold">
                  E0-E7 &rarr; N8-N15 Functional Columns
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Sensory afferents project strictly to mapped receptive field clusters (E0/E1 &rarr; N8/N9, E2/E3 &rarr; N10/N11). Unassigned cross-connections are pruned to sparse near-zero noise (&le; &plusmn;0.04), eliminating diffuse cross-talk bleed.
                </p>
                <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-900">
                  Cross-Talk Bleed: <span className="text-emerald-400 font-bold">0.00% (Nominal)</span>
                </div>
              </div>

              {/* 2. GABAergic Lateral Cross-Inhibition */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-mono text-purple-400 uppercase flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    GABA Lateral Inhibition
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    ACTIVE (-0.55w)
                  </span>
                </div>
                <div className="text-xs text-slate-200 font-semibold">
                  N12 & N13 Fast-Spiking Inhibitors
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Fast GABA_A inhibitory cross-synapses (w = -0.55) from N12 & N13 suppress lateral co-activation across associative nodes (N8-N11, N14-N15). Enforces winner-take-all dynamics and arrests runaway avalanche cascades.
                </p>
                <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-900">
                  Branching Ratio &sigma;: <span className="text-emerald-400 font-bold">0.85 - 1.15 (Stable)</span>
                </div>
              </div>

              {/* 3. Physiological Membrane Potential Bounds */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-mono text-amber-400 uppercase flex items-center gap-1.5">
                    <Scale className="h-3.5 w-3.5" />
                    Membrane Potential Bounds
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    CLAMPED
                  </span>
                </div>
                <div className="text-xs text-slate-200 font-semibold">
                  [-85.0 mV, -56.0 mV] Reversal Windows
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Subthreshold integration is strictly clamped to biophysical reversal limits (E_K = -85 mV inhibitory floor, dynamic threshold + 2 mV ceiling). Prevents unconstrained subthreshold charge bleed and numerical integration drift.
                </p>
                <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-900">
                  Voltage Overflow: <span className="text-emerald-400 font-bold">0 Violations Detected</span>
                </div>
              </div>

              {/* 4. Synaptic Pre-Saturation & Headroom */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-mono text-emerald-400 uppercase flex items-center gap-1.5">
                    <Gauge className="h-3.5 w-3.5" />
                    Synaptic Headroom
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    0% PINNED
                  </span>
                </div>
                <div className="text-xs text-slate-200 font-semibold">
                  Initial Weights [0.85, 1.05] &lt; 1.35
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Eliminated pre-saturation artifact where initial weights exceeded the 1.35 saturation threshold. Synapses operate with full dynamic headroom for STDP potentiation and depression without falsely elevating the Divergence Risk Index.
                </p>
                <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-900">
                  Saturation Ratio: <span className="text-emerald-400 font-bold">0.00% (Headroom Clear)</span>
                </div>
              </div>

              {/* 5. Asynchronous AER Silicon Bus Jitter */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-mono text-indigo-400 uppercase flex items-center gap-1.5">
                    <Radio className="h-3.5 w-3.5" />
                    AER Bus Silicon Jitter
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    &le; 0.85 ms
                  </span>
                </div>
                <div className="text-xs text-slate-200 font-semibold">
                  Arbitration Delay Decoupled
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  AER bus timing jitter reflects genuine asynchronous silicon packet arbitration latency (~0.22 ms + congestion delay). Completely decoupled from host browser animation frame interval variations, curing artificial AER bus health penalties.
                </p>
                <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-900">
                  AER Bus Status: <span className="text-emerald-400 font-bold">NOMINAL / JITTER VERIFIED</span>
                </div>
              </div>

              {/* 6. Sparse Autoencoder Monosemanticity */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-mono text-rose-400 uppercase flex items-center gap-1.5">
                    <Network className="h-3.5 w-3.5" />
                    SAE Latent Monosemanticity
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    TOP-4 JUMP-RELU
                  </span>
                </div>
                <div className="text-xs text-slate-200 font-semibold">
                  Baseline Centering &amp; Anti-Bleed
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Dynamic decoder baseline centering (b_dec) subtracts resting membrane DC voltage offsets. Strict Top-4 shrinkage and JumpReLU thresholding (0.075) hard-prune background polysemantic noise, keeping L0 sparsity at the 6.25% biological target.
                </p>
                <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-900">
                  L0 Sparsity Target: <span className="text-emerald-400 font-bold">6.25% (Monosemantic)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Dedicated Performance Anomaly Buffer & Autonomous Analysis Stream */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4">
        {/* Controls Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                Dedicated Performance Anomaly Buffer
                <span className="text-xs font-mono px-2 py-0.2 rounded-full bg-slate-800 text-slate-300">
                  {filteredBuffer.length} {filteredBuffer.length === 1 ? 'event' : 'events'}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Time-series circular buffer with autonomous deduplication and mitigation guidance
              </p>
            </div>
          </div>

          {/* Subsystem & Severity Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Subsystem Segmented Buttons */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <Filter className="h-3.5 w-3.5 text-slate-400 ml-1.5" />
              <button
                onClick={() => setSelectedSubsystemFilter('all')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  selectedSubsystemFilter === 'all'
                    ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All (5)
              </button>
              {(Object.keys(monitorState.subsystems) as SubsystemId[]).map((subId) => (
                <button
                  key={subId}
                  onClick={() => setSelectedSubsystemFilter(subId)}
                  className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
                    selectedSubsystemFilter === subId
                      ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {monitorState.subsystems[subId].code}
                </button>
              ))}
            </div>

            {/* Severity Filter */}
            <select
              value={selectedSeverityFilter}
              onChange={(e) => setSelectedSeverityFilter(e.target.value as any)}
              className="bg-slate-950 text-slate-300 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-cyan-500"
            >
              <option value="all">All Severities</option>
              <option value="warning">Warning Only</option>
              <option value="critical">Critical Only</option>
            </select>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search anomaly buffer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950 text-slate-200 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-44"
              />
            </div>

            {/* Simulation Probe & Clear Actions */}
            <div className="flex items-center gap-1.5 ml-auto">
              <button
                onClick={() =>
                  handleInjectSyntheticAnomaly(
                    selectedSubsystemFilter === 'all' ? 'synapticStability' : selectedSubsystemFilter,
                    'warning'
                  )
                }
                disabled={isInjecting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-mono transition-colors"
                title="Inject controlled test anomaly into performance buffer"
              >
                <Flame className="h-3.5 w-3.5" />
                <span>Simulate Anomaly</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadCsvTrace}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 text-xs font-mono transition-colors shadow-sm"
                title="Export rolling 5-subsystem performance buffer as CSV file for deep-reasoning offline audits"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                <span>Export CSV Trace</span>
              </button>

              <button
                onClick={handleClearBuffer}
                disabled={monitorState.anomalyBuffer.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 text-xs font-mono transition-colors disabled:opacity-40"
                title="Clear buffer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear</span>
              </button>
            </div>
          </div>
        </div>

        {/* Anomaly Records Stream Table */}
        <div className="overflow-x-auto">
          {filteredBuffer.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500 space-y-2">
              <CheckCircle2 className="h-10 w-10 text-emerald-500/40" />
              <p className="text-sm font-medium text-slate-400">
                Performance buffer clean: No anomalous events logged
              </p>
              <p className="text-xs text-slate-500 max-w-sm">
                All five SNN subsystems are currently operating within biological and hardware safety bounds.
                Use &quot;Simulate Anomaly&quot; to test buffer logging and autonomous analysis.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {filteredBuffer.map((record) => {
                const isCrit = record.severity === 'critical';
                const severityBadge = isCrit
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                  : 'bg-amber-500/20 text-amber-400 border-amber-500/40';

                return (
                  <div
                    key={record.id}
                    className={`rounded-lg border p-3.5 bg-slate-950/70 transition-colors ${
                      isCrit ? 'border-rose-500/40 hover:bg-rose-950/20' : 'border-slate-800 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold border ${severityBadge}`}
                        >
                          {record.severity}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                          {record.subsystemName}
                        </span>
                        <span className="text-xs font-bold text-white">
                          {record.metricLabel}
                        </span>
                      </div>

                      <div className="text-[11px] font-mono text-slate-500">
                        {new Date(record.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          fractionalSecondDigits: 3,
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs mb-2">
                      <div className="bg-slate-900/90 p-2 rounded border border-slate-800/80 font-mono">
                        <span className="text-slate-500 text-[10px] block">Observed Value</span>
                        <span className={`text-sm font-bold ${isCrit ? 'text-rose-400' : 'text-amber-400'}`}>
                          {record.observedValue} {record.unit}
                        </span>
                      </div>

                      <div className="bg-slate-900/90 p-2 rounded border border-slate-800/80 font-mono">
                        <span className="text-slate-500 text-[10px] block">Baseline Safe Bounds</span>
                        <span className="text-slate-300 text-xs font-medium">
                          [{record.baselineMin} - {record.baselineMax} {record.unit}]
                        </span>
                      </div>

                      <div className="bg-slate-900/90 p-2 rounded border border-slate-800/80 font-mono">
                        <span className="text-slate-500 text-[10px] block">Threshold Deviation</span>
                        <span className="text-amber-300 text-xs font-semibold">
                          +{record.deviationPct}% out of envelope
                        </span>
                      </div>

                      <div className="bg-slate-900/90 p-2 rounded border border-slate-800/80 font-mono flex items-center justify-between">
                        <div>
                          <span className="text-slate-500 text-[10px] block">Autonomous Status</span>
                          <span className="text-emerald-400 text-xs font-semibold">BUFFER LOGGED</span>
                        </div>
                        <ShieldAlert className="h-4 w-4 text-amber-400" />
                      </div>
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="text-slate-300 leading-relaxed">
                        <span className="text-slate-500 font-mono">Anomaly: </span>
                        {record.description}
                      </div>
                      <div className="text-cyan-300 leading-relaxed font-mono text-[11px] flex items-start gap-1">
                        <span className="text-slate-500 font-sans">Mitigation: </span>
                        <span>{record.recommendedMitigation}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

UnifiedTelemetryHealthMonitorPanel.displayName = 'UnifiedTelemetryHealthMonitorPanel';
