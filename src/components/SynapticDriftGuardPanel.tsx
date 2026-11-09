import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Zap,
  Activity,
  Sliders,
  RotateCcw,
  Sparkles,
  Search,
  ExternalLink,
  BookOpen,
  Wrench,
  AlertTriangle,
  Flame,
  Layers,
  Cpu,
  Info,
  Play,
  Scissors,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Filter,
  Check,
  Tag,
  FileText,
  X,
} from 'lucide-react';
import {
  SynapticDriftGuardSnapshot,
  OnlineToolAdapter,
  NeuralPathwayAuditReport,
  NeuralPathwayAuditItem,
  LTDInjectionEvent,
  DriftSubsystemSource,
} from '../types';
import { SNNEngine } from '../lib/snnEngine';
import { OnlineResearchAdapter } from './OnlineResearchAdapter';
import { TimeToDriftPredictor } from './TimeToDriftPredictor';

interface Props {
  engine: SNNEngine;
  snapshot: SynapticDriftGuardSnapshot;
  onApplyStructuralParameters?: (params: any, justification: string) => void;
  onInformModelWithResearch?: (query: string, findings: string[]) => Promise<void>;
}

export const SynapticDriftGuardPanel: React.FC<Props> = ({
  engine,
  snapshot,
  onApplyStructuralParameters,
  onInformModelWithResearch,
}) => {
  // Calibration state
  const [threshold, setThreshold] = useState<number>(snapshot.velocityThreshold || 0.15);
  const [windowMs, setWindowMs] = useState<number>(snapshot.windowMs || 500);
  const [autoStabilize, setAutoStabilize] = useState<boolean>(snapshot.autoStabilizationActive);
  
  // Tool execution state
  const [activeToolTab, setActiveToolTab] = useState<'clusters' | 'research' | 'tools' | 'ledger' | 'pathway_audit'>('clusters');
  const [selectedLedgerEvent, setSelectedLedgerEvent] = useState<LTDInjectionEvent | null>(null);
  const [ledgerSubsystemFilter, setLedgerSubsystemFilter] = useState<'all' | DriftSubsystemSource>('all');
  const [toolLogs, setToolLogs] = useState<Array<{ timestamp: string; message: string; success: boolean }>>([
    {
      timestamp: new Date().toLocaleTimeString(),
      message: 'SynapticDriftGuard service initialized. 500ms sliding window active. Drift velocity threshold: 0.15.',
      success: true,
    },
  ]);

  // Neural Pathway Audit State
  const [lastAuditReport, setLastAuditReport] = useState<NeuralPathwayAuditReport | null>(() => {
    return engine.lastPathwayAuditReport || engine.driftGuard.getLastAuditReport() || engine.auditNeuralPathways({ autoCleanIfBleeding: false });
  });
  const [auditFilter, setAuditFilter] = useState<'all' | 'leaky' | 'zero' | 'dormant' | 'functional'>('all');
  const [autoCleanOnBleed, setAutoCleanOnBleed] = useState<boolean>(engine.autoCleanupOnBleed);
  const [isAuditing, setIsAuditing] = useState(false);

  // 60-second rolling history buffer for DRI samples and linear regression prediction
  const liveDRI = snapshot.driftRiskIndex ?? 12.0;
  const [driHistory, setDriHistory] = useState<number[]>(() => {
    return Array.from({ length: 60 }, (_, i) => {
      const variation = Math.sin(i * 0.18) * 1.2;
      return Math.max(4.0, Math.min(32.0, liveDRI + variation));
    });
  });

  const lastSampleTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastSampleTimeRef.current >= 950) {
        lastSampleTimeRef.current = now;
        setDriHistory((prev) => {
          const next = [...prev, liveDRI];
          return next.slice(-60); // Keep last 60 seconds
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [liveDRI]);

  // Quick 60-second linear regression slope and R² calculation
  const { quickRegressionSlope, quickRegressionR2 } = useMemo(() => {
    const n = driHistory.length;
    if (n < 3) return { quickRegressionSlope: 0, quickRegressionR2: 0 };
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += driHistory[i];
      sumXY += i * driHistory[i];
      sumXX += i * i;
      sumYY += driHistory[i] * driHistory[i];
    }
    const meanX = sumX / n;
    const meanY = sumY / n;
    const ssXX = sumXX - n * meanX * meanX;
    const ssYY = sumYY - n * meanY * meanY;
    const ssXY = sumXY - n * meanX * meanY;
    const slope = ssXX !== 0 ? ssXY / ssXX : 0;
    let r2 = 0;
    if (ssXX > 0 && ssYY > 0) {
      const r = ssXY / Math.sqrt(ssXX * ssYY);
      r2 = Math.max(0, Math.min(1, r * r));
    }
    return { quickRegressionSlope: slope, quickRegressionR2: r2 };
  }, [driHistory]);

  const estimatedTimeToDriftSeconds = useMemo(() => {
    if (liveDRI >= 55.0) return 0;
    if (quickRegressionSlope <= 0.005) return null; // Stable equilibrium / non-runaway
    const remaining = 55.0 - liveDRI;
    const sec = Math.round(remaining / quickRegressionSlope);
    return Math.max(0, sec);
  }, [liveDRI, quickRegressionSlope]);

  const quickTimeToDrift = useMemo(() => {
    if (liveDRI >= 55.0) return '0s (RUNAWAY)';
    if (quickRegressionSlope <= 0.005) return '∞ (STABLE)';
    const remaining = 55.0 - liveDRI;
    const sec = Math.round(remaining / quickRegressionSlope);
    if (sec <= 0) return '0s';
    if (sec < 60) return `${sec}s`;
    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  }, [liveDRI, quickRegressionSlope]);

  // Registered tool adapters
  const toolAdapters: OnlineToolAdapter[] = [
    {
      id: 'neural_pathway_audit',
      name: 'Neural Pathway Audit Tool',
      category: 'diagnostics',
      description: 'Scans the SNNEngine synaptic matrix for zero-weight or non-functional pathways and triggers a cleanup routine if pathway leakage or synaptic bleeding is detected.',
      parameters: {
        autoClean: { type: 'boolean', description: 'Trigger cleanup routine immediately if leakage or bleeding is detected', default: true },
        zeroThreshold: { type: 'number', description: 'Zero-weight detection threshold', default: 0.006 },
      },
    },
    {
      id: 'pathway_cleanup_routine',
      name: 'Synaptic Bleed & Pathway Cleanup Routine',
      category: 'stabilization',
      description: 'Prunes diffuse cross-talk bleeding pathways, re-centers zero-weight floating connections, and restores receptive field sparsity.',
      parameters: {},
    },
    {
      id: 'automated_correction_loop',
      name: 'Automated Correction Loop (Multi-Cluster LTD)',
      category: 'stabilization',
      description: 'Triggers targeted corrective LTD injections across all high-drift synaptic clusters simultaneously to bring DRI back to safe operating levels.',
      parameters: {
        forceAll: { type: 'boolean', description: 'Force injection across all clusters regardless of threshold', default: false },
      },
    },
    {
      id: 'trigger_ltd_injection',
      name: 'Corrective LTD Injection Adapter',
      category: 'stabilization',
      description: 'Commands an immediate corrective LTD pulse into a specific synaptic cluster to arrest high drift velocity.',
      parameters: {
        clusterId: { type: 'string', description: 'Target cluster ID', default: 'associative_core' },
        magnitude: { type: 'number', description: 'Depression delta magnitude', default: 0.10 },
      },
    },
    {
      id: 'calibrate_drift_guard',
      name: 'Drift Guard Parameter Calibrator',
      category: 'calibration',
      description: 'Dynamically updates velocity threshold, sliding window, and auto-stabilization states.',
      parameters: {
        threshold: { type: 'number', description: 'Velocity threshold', default: 0.15 },
        windowMs: { type: 'number', description: 'Sliding window in ms', default: 500 },
      },
    },
    {
      id: 'run_cluster_burst_stress',
      name: 'Cluster Hyper-Excitability Stress Adapter',
      category: 'diagnostics',
      description: 'Simulates a burst surge to test second-order derivative detection and verify automated LTD arrest.',
      parameters: {
        clusterId: { type: 'string', description: 'Cluster to stress', default: 'sensory_afferent' },
        burstMagnitude: { type: 'number', description: 'Surge amplitude', default: 0.35 },
      },
    },
  ];

  const handleRunPathwayAudit = (autoClean: boolean = false) => {
    setIsAuditing(true);
    const report = engine.auditNeuralPathways({ autoCleanIfBleeding: autoClean });
    setLastAuditReport(report);
    setIsAuditing(false);
    setToolLogs((prev) => [
      {
        timestamp: new Date().toLocaleTimeString(),
        message: `🔍 Neural Pathway Audit: Scanned ${report.totalPathwaysScanned} pathways. Functional: ${report.functionalCount}, Zero-weight: ${report.zeroWeightCount}, Leaky/Bleed: ${report.leakyCount}. Bleed Index: ${report.synapticBleedIndex}%. Status: ${report.auditStatus}.${report.cleanupTriggered ? ' Automatic cleanup executed.' : ''}`,
        success: !report.hasLeakageOrBleed || report.cleanupTriggered,
      },
      ...prev.slice(0, 20),
    ]);
  };

  const handleRunPathwayCleanup = () => {
    const res = engine.cleanupNeuralPathways(lastAuditReport || undefined);
    const updatedReport = engine.auditNeuralPathways({ autoCleanIfBleeding: false });
    setLastAuditReport(updatedReport);
    setToolLogs((prev) => [
      {
        timestamp: new Date().toLocaleTimeString(),
        message: `🧹 Neural Pathway Cleanup Routine: ${res.pathwaysPrunedOrReset} bleeding pathway(s) pruned, ${res.weightsReCentered} zero-weight pathway(s) re-centered. DRI dropped from ${res.driBefore.toFixed(1)}% to ${res.driAfter.toFixed(1)}% (saved ~${res.powerSavedMw}mW). Matrix sparsity restored.`,
        success: true,
      },
      ...prev.slice(0, 20),
    ]);
  };

  const handleInjectPathwayBleed = () => {
    const res = engine.injectSimulatedPathwayBleed(8);
    const updatedReport = engine.auditNeuralPathways({ autoCleanIfBleeding: false });
    setLastAuditReport(updatedReport);
    setToolLogs((prev) => [
      {
        timestamp: new Date().toLocaleTimeString(),
        message: `⚠️ Test Pathway Bleed Injected: ${res.pathwaysInjected} cross-talk synapses induced with diffuse noise. Bleed index: ${res.bleedIndex}%. DriftGuard monitor flagged pathway leakage!`,
        success: false,
      },
      ...prev.slice(0, 20),
    ]);
  };

  const handleToggleAutoClean = () => {
    const next = !autoCleanOnBleed;
    setAutoCleanOnBleed(next);
    engine.autoCleanupOnBleed = next;
    setToolLogs((prev) => [
      {
        timestamp: new Date().toLocaleTimeString(),
        message: `Auto-Cleanup on Pathway Bleed: ${next ? 'ACTIVATED (will automatically prune when leakage is detected)' : 'DEACTIVATED'}`,
        success: true,
      },
      ...prev.slice(0, 20),
    ]);
  };

  const handleAutomatedCorrectionLoop = () => {
    const res = engine.driftGuard.triggerAutomatedCorrectionLoop(engine.synapses);
    setToolLogs((prev) => [
      {
        timestamp: new Date().toLocaleTimeString(),
        message: `⚡ Correction Loop Triggered: Targeted corrective LTD injected across ${res.events.length} cluster(s) (${res.stabilizedClusters.join(', ')}). DRI restored from ${res.beforeDRI.toFixed(1)}% to ${res.afterDRI.toFixed(1)}% (safe operating level).`,
        success: true,
      },
      ...prev.slice(0, 20),
    ]);
  };

  const handleUpdateCalibration = (newThresh: number, newWin: number, newAuto: boolean) => {
    setThreshold(newThresh);
    setWindowMs(newWin);
    setAutoStabilize(newAuto);
    engine.driftGuard.calibrate({
      threshold: newThresh,
      windowMs: newWin,
      autoStabilization: newAuto,
    });
    setToolLogs((prev) => [
      {
        timestamp: new Date().toLocaleTimeString(),
        message: `Calibrated SynapticDriftGuard: Threshold ${newThresh.toFixed(2)}, Window ${newWin}ms, Auto-LTD: ${newAuto ? 'ON' : 'OFF'}`,
        success: true,
      },
      ...prev.slice(0, 20),
    ]);
  };

  const handleManualLTD = (clusterId: string) => {
    const event = engine.driftGuard.triggerManualLTDInjection(clusterId, engine.synapses, 0.12);
    if (event) {
      setToolLogs((prev) => [
        {
          timestamp: new Date().toLocaleTimeString(),
          message: `Manual Corrective LTD Triggered on '${event.clusterName}': -${event.injectionMagnitude.toFixed(3)} weight delta, ${event.ltdMultiplierApplied.toFixed(2)}x LTD dominance applied.`,
          success: true,
        },
        ...prev.slice(0, 20),
      ]);
    }
  };

  const handleSimulateBurst = (clusterId: string) => {
    const res = engine.driftGuard.injectSimulatedDriftBurst(clusterId, engine.synapses, 0.40);
    setToolLogs((prev) => [
      {
        timestamp: new Date().toLocaleTimeString(),
        message: `Injected simulated high-frequency potentiation into '${res.targetCluster}'. Drift velocity surging! Second-order guard engaging...`,
        success: true,
      },
      ...prev.slice(0, 20),
    ]);
  };



  const clustersList = Object.values(snapshot.clusters || {});
  const isAnyExceeding = snapshot.isAnyClusterExceeding;
  const maxVel = snapshot.maxDriftVelocity;
  const maxAcc = snapshot.maxSecondDerivative;

  return (
    <div className="space-y-6">
      {/* 1. Header & Architectural Overview Card */}
      <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-rose-500/10 via-amber-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div
              className={`p-3 rounded-xl border ${
                isAnyExceeding
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 animate-pulse'
                  : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
              }`}
            >
              {isAnyExceeding ? <ShieldAlert className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  SynapticDriftGuard
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-500/20 border border-indigo-500/30 text-indigo-300">
                  2nd-Order d²w/dt²
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/20 border border-amber-500/30 text-amber-300">
                  500ms Window
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
                  <Tag className="w-3 h-3 text-emerald-400" />
                  <span>Auto-Tag Active</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                Calculates synaptic weight acceleration (d²w/dt²) across functional clusters.
                If drift velocity exceeds <span className="text-rose-400 font-mono font-semibold">0.15</span> over a 500ms window,
                the guard automatically triggers corrective LTD injections to prevent runaway epileptiform saturation.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Automated Correction Loop Button */}
            <button
              onClick={handleAutomatedCorrectionLoop}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all shadow-md active:scale-[0.98] ${
                snapshot.isDriSafe
                  ? 'bg-emerald-600/30 hover:bg-emerald-600/40 border-emerald-500/50 text-emerald-200'
                  : 'bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 border-rose-400 text-white animate-pulse'
              }`}
              title="Triggers targeted LTD injection across all high-drift synaptic clusters to bring the DRI back to safe operating levels"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Correction Loop</span>
            </button>

            {/* Neural Pathway Audit Button */}
            <button
              onClick={() => {
                setActiveToolTab('pathway_audit');
                handleRunPathwayAudit(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                snapshot.pathwayLeakageDetected
                  ? 'bg-rose-600 border-rose-400 text-white animate-pulse shadow-md shadow-rose-600/40'
                  : 'bg-cyan-600/20 border-cyan-500/40 text-cyan-300 hover:bg-cyan-600/30'
              }`}
              title="Audit SNNEngine synaptic matrix for zero-weight and leaky bleeding pathways"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Pathway Audit</span>
              {snapshot.pathwayLeakageDetected && (
                <span className="px-1.5 py-0.2 bg-white text-rose-700 font-bold rounded text-[9px]">
                  LEAK
                </span>
              )}
            </button>

            {/* Emergency Cleanup Button if Bleeding */}
            {snapshot.pathwayLeakageDetected && (
              <button
                onClick={handleRunPathwayCleanup}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500 hover:bg-rose-400 text-white border border-rose-300 shadow-md shadow-rose-500/30 active:scale-[0.98]"
                title="Pathway leakage detected in drift guard monitor! Click to trigger immediate cleanup routine."
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Clean Leaks</span>
              </button>
            )}

            <button
              onClick={() => handleUpdateCalibration(threshold, windowMs, !autoStabilize)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                autoStabilize
                  ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Auto-LTD: {autoStabilize ? 'ENABLED' : 'PAUSED'}</span>
            </button>

            {/* Research Papers Quick Link */}
            <button
              onClick={() => setActiveToolTab('research')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                isAnyExceeding
                  ? 'bg-indigo-600 border-indigo-400 text-white animate-pulse shadow-md shadow-indigo-600/40'
                  : 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30'
              }`}
              title="Query real-time scientific literature via Google Search grounding"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Research Papers</span>
              {isAnyExceeding && (
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
              )}
            </button>

            <button
              onClick={() => handleSimulateBurst('associative_core')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600/30 transition-all"
            >
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              <span>Stress Burst Test</span>
            </button>
          </div>
        </div>

        {/* Real-Time Telemetry Metrics Grid including DRI & Pathway Bleed */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 mt-6">
          {/* 1. DRI Card */}
          <div className={`border rounded-xl p-3.5 transition-all ${
            snapshot.isDriSafe
              ? 'bg-slate-950/60 border-slate-800/80'
              : 'bg-rose-950/30 border-rose-500/40 shadow-lg shadow-rose-950/50'
          }`}>
            <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
              <span>Drift Risk Index (DRI)</span>
              {snapshot.isDriSafe ? (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400 animate-bounce" />
              )}
            </div>
            <div className="text-2xl font-bold font-mono text-white mt-1">
              <span className={snapshot.isDriSafe ? 'text-emerald-400' : 'text-rose-400'}>
                {(snapshot.driftRiskIndex ?? 0).toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] mt-1 text-slate-400">
              <span className={snapshot.isDriSafe ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                {snapshot.isDriSafe ? 'SAFE LEVEL' : 'ELEVATED RISK'}
              </span>
              <span
                className={`font-mono text-[9px] px-1.5 py-0.2 rounded border font-semibold ${
                  quickTimeToDrift.includes('RUNAWAY')
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                    : quickTimeToDrift.includes('STABLE')
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}
                title="Linear regression projection: estimated Time to Drift until 55% runaway"
              >
                TTD: {quickTimeToDrift}
              </span>
            </div>
          </div>

          {/* 2. Max Drift Velocity */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
              <span>Max Drift Velocity</span>
              <Activity className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-white mt-1">
              {maxVel.toFixed(3)}
              <span className="text-xs text-slate-500 font-normal ml-1">/ s</span>
            </div>
            <div className="flex items-center justify-between text-[10px] mt-1 text-slate-400">
              <span>Thresh: {snapshot.velocityThreshold.toFixed(2)} (Alert &gt; 0.85)</span>
              <span className={maxVel > 0.85 ? 'text-red-400 font-black animate-pulse' : maxVel > 0.15 ? 'text-rose-400 font-semibold' : 'text-emerald-400'}>
                {maxVel > 0.85 ? 'CRITICAL > 0.85' : maxVel > 0.15 ? 'BREACH' : 'NOMINAL'}
              </span>
            </div>
          </div>

          {/* 3. Max Acceleration */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
              <span>Max Accel (d²w/dt²)</span>
              <Layers className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-white mt-1">
              {maxAcc.toFixed(3)}
              <span className="text-xs text-slate-500 font-normal ml-1">/ s²</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1 truncate">
              Fastest: <span className="text-slate-200">{snapshot.fastestDriftingCluster}</span>
            </div>
          </div>

          {/* 4. Pathway Bleed & Leakage Monitor Card */}
          <div className={`border rounded-xl p-3.5 transition-all ${
            snapshot.pathwayLeakageDetected
              ? 'bg-rose-950/30 border-rose-500/50 shadow-md shadow-rose-950/40'
              : 'bg-slate-950/60 border-slate-800/80'
          }`}>
            <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
              <span>Pathway Leakage</span>
              {snapshot.pathwayLeakageDetected ? (
                <Scissors className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              )}
            </div>
            <div className="text-2xl font-bold font-mono text-white mt-1 flex items-baseline gap-1.5">
              <span className={snapshot.pathwayLeakageDetected ? 'text-rose-400' : 'text-emerald-400'}>
                {(snapshot.synapticBleedIndex ?? lastAuditReport?.synapticBleedIndex ?? 0).toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-500 uppercase font-mono">Bleed</span>
            </div>
            <div className="flex items-center justify-between text-[10px] mt-1 text-slate-400 truncate">
              <span className={snapshot.pathwayLeakageDetected ? 'text-rose-400 font-semibold' : 'text-emerald-400'}>
                {snapshot.pathwayLeakageDetected ? 'BLEED DETECTED' : 'SPARSITY NOMINAL'}
              </span>
              <button
                onClick={() => {
                  setActiveToolTab('pathway_audit');
                  handleRunPathwayAudit(false);
                }}
                className="text-cyan-400 hover:text-cyan-300 underline font-medium"
              >
                Inspect
              </button>
            </div>
          </div>

          {/* 5. Window Duration */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
              <span>Window Duration</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-white mt-1">
              {snapshot.windowMs}
              <span className="text-xs text-slate-500 font-normal ml-1">ms</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Biological NMDA/LTD
            </div>
          </div>

          {/* 6. LTD Injections */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
              <span>LTD Injections</span>
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-white mt-1">
              {snapshot.totalInjectionsCount}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Cooldown: {snapshot.ltdInjectionCooldownMs}ms
            </div>
          </div>
        </div>

        {/* Dedicated Prominent Hero Card: Visual Time to Drift Radial Gauge (OLS Linear Regression) */}
        <div className={`mt-5 rounded-xl border p-4.5 transition-all ${
          quickTimeToDrift.includes('RUNAWAY')
            ? 'bg-gradient-to-r from-rose-950/60 via-red-950/40 to-slate-950/90 border-rose-500/50 shadow-xl shadow-rose-950/50'
            : quickTimeToDrift.includes('STABLE')
            ? 'bg-gradient-to-r from-emerald-950/30 via-slate-950/80 to-slate-950/90 border-emerald-500/30'
            : 'bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-slate-950/90 border-amber-500/40 shadow-lg shadow-amber-950/40'
        }`}>
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
            {/* Left Column: Metric Overview */}
            <div className="flex items-start sm:items-center gap-3.5 flex-1 min-w-[280px]">
              <div className={`p-3 rounded-xl border shrink-0 ${
                quickTimeToDrift.includes('RUNAWAY')
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 animate-pulse'
                  : quickTimeToDrift.includes('STABLE')
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : 'bg-amber-500/20 border-amber-500/50 text-amber-300'
              }`}>
                <Activity className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
                    Predictive Health Metric
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                    quickTimeToDrift.includes('RUNAWAY')
                      ? 'bg-rose-500/30 text-rose-200 border-rose-400 animate-pulse'
                      : quickTimeToDrift.includes('STABLE')
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                  }`}>
                    {quickTimeToDrift.includes('RUNAWAY') ? 'IMMINENT RUNAWAY' : quickTimeToDrift.includes('STABLE') ? 'EQUILIBRIUM' : 'DIVERGENCE TRENDING'}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white tracking-tight mt-0.5">
                  Estimated Time to Drift: <span className={`font-mono text-xl ${
                    quickTimeToDrift.includes('RUNAWAY')
                      ? 'text-rose-400 animate-pulse font-black'
                      : quickTimeToDrift.includes('STABLE')
                      ? 'text-emerald-400'
                      : 'text-amber-300'
                  }`}>{quickTimeToDrift}</span>
                </h3>
                <div className="flex items-center gap-3.5 text-xs font-mono text-slate-400 mt-1 flex-wrap">
                  <span>60s OLS Slope: <span className="text-slate-200 font-semibold">{(quickRegressionSlope * 100).toFixed(2)}%/s</span></span>
                  <span>Fit (R²): <span className="text-slate-200 font-semibold">{(quickRegressionR2 * 100).toFixed(1)}%</span></span>
                  <span>Runaway Limit: <span className="text-rose-300 font-semibold">55.0% DRI</span></span>
                </div>
              </div>
            </div>

            {/* Middle Column: Visual Semicircular 'Time to Drift' Radial Gauge */}
            <div className="flex flex-col items-center justify-center px-4 py-2 rounded-xl bg-slate-950/70 border border-slate-800/80 shadow-inner shrink-0 self-center">
              <div className="relative w-44 h-24 flex items-center justify-center">
                <svg viewBox="0 0 160 92" className="w-full h-full overflow-visible">
                  <defs>
                    <filter id="gaugeNeedleGlow" x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur stdDeviation="2.5" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>

                  {/* Semicircle background track: Center (80, 80), radius 60 */}
                  <path
                    d="M 20,80 A 60,60 0 0,1 140,80"
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth="9"
                    strokeLinecap="round"
                  />

                  {/* Critical Danger Zone (< 30s): arc 180° to 135° */}
                  <path
                    d="M 20,80 A 60,60 0 0,1 37.6,37.6"
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth="9"
                    strokeLinecap="round"
                    className={estimatedTimeToDriftSeconds !== null && estimatedTimeToDriftSeconds < 30 ? "animate-pulse" : "opacity-75"}
                  />

                  {/* Warning Zone (30s - 75s): arc 135° to 67.5° */}
                  <path
                    d="M 41,34.5 A 60,60 0 0,1 102.9,24.6"
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="9"
                    className="opacity-75"
                  />

                  {/* Safe / Equilibrium Zone (> 75s or null): arc 67.5° to 0° */}
                  <path
                    d="M 106.8,26.2 A 60,60 0 0,1 140,80"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="9"
                    strokeLinecap="round"
                    className="opacity-75"
                  />

                  {/* Indicator Needle */}
                  {(() => {
                    let angle = 0; // 0° is far right (stable)
                    if (estimatedTimeToDriftSeconds === null) {
                      angle = 12; // deep in green
                    } else if (estimatedTimeToDriftSeconds <= 0) {
                      angle = 175; // deep in red
                    } else {
                      const clamped = Math.min(120, Math.max(0, estimatedTimeToDriftSeconds));
                      angle = 180 - (clamped / 120) * 180;
                    }
                    const rad = (angle * Math.PI) / 180;
                    const nx = 80 - 50 * Math.cos(rad);
                    const ny = 80 - 50 * Math.sin(rad);
                    return (
                      <g>
                        <line
                          x1="80"
                          y1="80"
                          x2={nx}
                          y2={ny}
                          stroke="#ffffff"
                          strokeWidth="2.8"
                          strokeLinecap="round"
                          filter="url(#gaugeNeedleGlow)"
                        />
                        <circle cx="80" cy="80" r="5" fill="#38bdf8" />
                        <circle cx="80" cy="80" r="2.5" fill="#0f172a" />
                      </g>
                    );
                  })()}

                  {/* Labels on arc */}
                  <text x="14" y="91" fill="#f43f5e" fontSize="7.5" fontFamily="monospace" fontWeight="bold">0s</text>
                  <text x="32" y="24" fill="#f43f5e" fontSize="7" fontFamily="monospace">30s</text>
                  <text x="73" y="16" fill="#fbbf24" fontSize="7" fontFamily="monospace">60s</text>
                  <text x="135" y="91" fill="#10b981" fontSize="8" fontFamily="monospace" fontWeight="bold">∞</text>
                </svg>

                {/* Digital Seconds Readout */}
                <div className="absolute bottom-0 flex flex-col items-center">
                  <div className="flex items-baseline gap-0.5">
                    <span className={`text-xl font-black font-mono tracking-tight ${
                      estimatedTimeToDriftSeconds === null
                        ? 'text-emerald-400'
                        : estimatedTimeToDriftSeconds < 30
                        ? 'text-rose-400 animate-pulse font-black'
                        : estimatedTimeToDriftSeconds < 75
                        ? 'text-amber-300'
                        : 'text-emerald-400'
                    }`}>
                      {estimatedTimeToDriftSeconds !== null ? estimatedTimeToDriftSeconds : '∞'}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-slate-400">
                      {estimatedTimeToDriftSeconds !== null ? 'sec' : 'STABLE'}
                    </span>
                  </div>
                  <span className="text-[8px] font-mono uppercase tracking-widest text-slate-500 -mt-0.5">
                    Time to Drift
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Immediate Action Button */}
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full lg:w-auto justify-end">
              <button
                onClick={handleAutomatedCorrectionLoop}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 shadow-md shadow-rose-900/40 transition-all active:scale-[0.98] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Arrest Drift Now</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Predictive Divergence Forecaster & Linear Regression (Time to Drift) with Auto-Tagged Spikes */}
      <TimeToDriftPredictor
        driHistory={driHistory}
        currentDRI={liveDRI}
        runawayThreshold={55.0}
        warningThreshold={35.0}
        recentEvents={snapshot.recentEvents}
        engine={engine}
        telemetry={engine.getTelemetry()}
        onTriggerCorrection={handleAutomatedCorrectionLoop}
        onSimulateBurst={() => handleSimulateBurst('associative_core')}
      />

      {/* 3. Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 flex-wrap">
        <button
          onClick={() => setActiveToolTab('clusters')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeToolTab === 'clusters'
              ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Synaptic Clusters ({clustersList.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveToolTab('pathway_audit');
            if (!lastAuditReport) handleRunPathwayAudit(false);
          }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeToolTab === 'pathway_audit'
              ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Search className="w-3.5 h-3.5 text-cyan-300" />
          <span>Neural Pathway Audit</span>
          {snapshot.pathwayLeakageDetected ? (
            <span className="px-1.5 py-0.2 bg-rose-500 text-white rounded text-[9px] font-mono animate-pulse font-bold">
              {lastAuditReport?.leakyCount ?? 1} BLEED
            </span>
          ) : (
            <span className="px-1.5 py-0.2 bg-cyan-500/20 text-cyan-300 rounded text-[9px] font-mono">
              Tool Active
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveToolTab('research')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeToolTab === 'research'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 text-indigo-300" />
          <span>Online Literature Research</span>
          <span className="px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 rounded text-[9px] font-mono">
            Search Grounded
          </span>
        </button>

        <button
          onClick={() => setActiveToolTab('tools')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeToolTab === 'tools'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Wrench className="w-3.5 h-3.5" />
          <span>Online Tool Adapters</span>
        </button>

        <button
          onClick={() => setActiveToolTab('ledger')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeToolTab === 'ledger'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>LTD Injection Ledger ({snapshot.recentEvents?.length || 0})</span>
        </button>
      </div>

      {/* TAB 1: SYNAPTIC CLUSTERS */}
      {activeToolTab === 'clusters' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clustersList.map((cluster) => {
              const velPct = Math.min(100, (cluster.driftVelocity / 0.25) * 100);
              const isBreached = cluster.isExceedingThreshold;
              const isInjecting = cluster.stabilizationState === 'LTD_INJECTING';
              const isRecovering = cluster.stabilizationState === 'RECOVERING';

              return (
                <div
                  key={cluster.clusterId}
                  className={`border rounded-xl p-4.5 transition-all ${
                    isBreached || isInjecting
                      ? 'bg-rose-950/30 border-rose-500/50 shadow-lg shadow-rose-950/20'
                      : isRecovering
                      ? 'bg-amber-950/20 border-amber-500/40'
                      : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-white tracking-tight">
                        {cluster.name}
                      </h4>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {cluster.synapseCount} synapses • Mean: {cluster.meanWeight.toFixed(3)}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        isInjecting
                          ? 'bg-rose-500 text-white animate-pulse'
                          : isBreached
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : isRecovering
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {cluster.stabilizationState}
                    </span>
                  </div>

                  {/* Velocity Gauge Bar */}
                  <div className="mt-4">
                    <div className="flex justify-between text-[11px] font-mono text-slate-300 mb-1">
                      <span>Drift Velocity:</span>
                      <span className={isBreached ? 'text-rose-400 font-bold' : 'text-slate-200'}>
                        {cluster.driftVelocity.toFixed(4)} / s
                      </span>
                    </div>
                    <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800 relative">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isBreached
                            ? 'bg-gradient-to-r from-amber-500 to-rose-600 animate-pulse'
                            : cluster.driftVelocity > 0.10
                            ? 'bg-gradient-to-r from-emerald-500 to-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${velPct}%` }}
                      />
                      {/* Threshold marker at 0.15 (60%) */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-rose-400"
                        style={{ left: '60%' }}
                        title="0.15 Threshold"
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-0.5">
                      <span>0.00</span>
                      <span className="text-rose-400">0.15 limit</span>
                      <span>0.25+</span>
                    </div>
                  </div>

                  {/* Second-order derivative */}
                  <div className="flex items-center justify-between text-[11px] font-mono mt-3 pt-2.5 border-t border-slate-800/80">
                    <span className="text-slate-400">d²w/dt² Acceleration:</span>
                    <span
                      className={`font-semibold ${
                        cluster.secondOrderDerivative > 0.05
                          ? 'text-rose-400'
                          : cluster.secondOrderDerivative < -0.05
                          ? 'text-emerald-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {cluster.secondOrderDerivative > 0 ? '+' : ''}
                      {cluster.secondOrderDerivative.toFixed(4)} / s²
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono mt-1">
                    <span className="text-slate-400">LTD Dominance Scale:</span>
                    <span className="text-amber-300 font-semibold">
                      {cluster.activeLTDMultiplier.toFixed(2)}x
                    </span>
                  </div>

                  {/* Sparkline visualization */}
                  <div className="mt-3 pt-2 border-t border-slate-800/60">
                    <div className="text-[10px] text-slate-500 font-mono mb-1">
                      Recent Velocity Trend (500ms sliding):
                    </div>
                    <div className="flex items-end h-6 gap-1 bg-slate-950/70 p-1 rounded border border-slate-800/50">
                      {cluster.recentVelocities.map((v, idx) => {
                        const h = Math.min(100, Math.max(10, (v / 0.20) * 100));
                        return (
                          <div
                            key={idx}
                            className={`flex-1 rounded-sm transition-all ${
                              v > 0.15 ? 'bg-rose-500' : v > 0.10 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ height: `${h}%` }}
                            title={`Velocity: ${v.toFixed(3)}`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Control Buttons */}
                  <div className="grid grid-cols-2 gap-2 mt-4 pt-2 border-t border-slate-800/80">
                    <button
                      onClick={() => handleManualLTD(cluster.clusterId)}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-rose-600/20 border border-rose-500/30 text-rose-300 hover:bg-rose-600/30 transition-all text-center flex items-center justify-center gap-1"
                    >
                      <Zap className="w-3 h-3 text-rose-400" />
                      <span>Inject LTD</span>
                    </button>
                    <button
                      onClick={() => handleSimulateBurst(cluster.clusterId)}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-all text-center flex items-center justify-center gap-1"
                    >
                      <Flame className="w-3 h-3 text-amber-400" />
                      <span>Burst Stress</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: ONLINE LITERATURE RESEARCH ADAPTER */}
      {activeToolTab === 'research' && (
        <OnlineResearchAdapter
          engine={engine}
          snapshot={snapshot}
          onCalibrationApplied={(msg) => {
            setToolLogs((prev) => [
              {
                timestamp: new Date().toLocaleTimeString(),
                message: msg,
                success: true,
              },
              ...prev.slice(0, 20),
            ]);
          }}
          onStructuralParametersApplied={(params, justification) => {
            if (onApplyStructuralParameters) {
              onApplyStructuralParameters(params, justification);
            }
            setToolLogs((prev) => [
              {
                timestamp: new Date().toLocaleTimeString(),
                message: `🧬 Structural Parameter Update Applied: ${justification}`,
                success: true,
              },
              ...prev.slice(0, 20),
            ]);
          }}
          onInformModelWithResearch={async (q, findings) => {
            if (onInformModelWithResearch) {
              await onInformModelWithResearch(q, findings);
            }
            setToolLogs((prev) => [
              {
                timestamp: new Date().toLocaleTimeString(),
                message: `🧠 SNN Model Informed with Research on "${q}": Synced with Recursive Self-Improvement ledger.`,
                success: true,
              },
              ...prev.slice(0, 20),
            ]);
          }}
        />
      )}

      {/* TAB 3: ONLINE TOOL ADAPTERS */}
      {activeToolTab === 'tools' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Wrench className="w-5 h-5 text-amber-400" />
              <span>Online Tool Adapters Catalog</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Real-time online tool interfaces for orchestrating synaptic stabilization, threshold tuning, and stress tests.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {toolAdapters.map((t) => (
              <div key={t.id} className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold text-amber-400 uppercase">
                      {t.category}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{t.id}</span>
                  </div>
                  <h4 className="text-sm font-bold text-white mt-1">{t.name}</h4>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">{t.description}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80">
                  <button
                    onClick={() => {
                      if (t.id === 'neural_pathway_audit') {
                        setActiveToolTab('pathway_audit');
                        handleRunPathwayAudit(true);
                      }
                      if (t.id === 'pathway_cleanup_routine') handleRunPathwayCleanup();
                      if (t.id === 'automated_correction_loop') handleAutomatedCorrectionLoop();
                      if (t.id === 'trigger_ltd_injection') handleManualLTD('associative_core');
                      if (t.id === 'run_cluster_burst_stress') handleSimulateBurst('sensory_afferent');
                      if (t.id === 'calibrate_drift_guard') handleUpdateCalibration(0.15, 500, true);
                    }}
                    className="w-full py-2 rounded-lg text-xs font-semibold bg-amber-600/20 border border-amber-500/40 text-amber-300 hover:bg-amber-600/30 transition-all flex items-center justify-center gap-2"
                  >
                    <Play className="w-3 h-3" />
                    <span>Execute Tool Action</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Tool Execution Activity Log */}
          <div>
            <h4 className="text-xs font-bold text-slate-300 mb-2">Live Tool Execution Stream:</h4>
            <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 max-h-48 overflow-y-auto space-y-1.5 font-mono text-[11px]">
              {toolLogs.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2 text-slate-400">
                  <span className="text-slate-600">{log.timestamp}</span>
                  <span className={log.success ? 'text-slate-300' : 'text-rose-400'}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: LTD INJECTION LEDGER WITH AUTO-TAG DRIFT EVENTS FORENSICS */}
      {activeToolTab === 'ledger' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Corrective LTD Injection Forensic Audit Trail</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                  <Tag className="w-3 h-3 text-indigo-400" />
                  <span>Auto-Tag Active</span>
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Automatically annotates drift spikes with root-cause subsystem attribution (AER bus saturation vs STDP runaway) for post-mortem forensics.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400 self-start sm:self-center">
              Total Injections: <strong className="text-white">{snapshot.totalInjectionsCount}</strong>
            </span>
          </div>

          {/* Subsystem Distribution & Filter Bar */}
          {snapshot.recentEvents && snapshot.recentEvents.length > 0 && (
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span className="font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Post-Mortem Root Cause Breakdown</span>
                </span>
                <span className="text-[10px] text-slate-500">
                  {snapshot.recentEvents.length} events logged
                </span>
              </div>

              {/* Subsystem Filter Pills */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[10px] font-mono">
                <span className="text-slate-500 mr-1">Filter Source:</span>
                <button
                  onClick={() => setLedgerSubsystemFilter('all')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    ledgerSubsystemFilter === 'all'
                      ? 'bg-slate-700 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All ({snapshot.recentEvents.length})
                </button>
                <button
                  onClick={() => setLedgerSubsystemFilter('aer_bus')}
                  className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                    ledgerSubsystemFilter === 'aer_bus'
                      ? 'bg-cyan-600/40 text-cyan-200 font-bold border border-cyan-500/40'
                      : 'text-slate-400 hover:text-cyan-300'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>AER Saturation ({snapshot.recentEvents.filter((e) => e.primarySubsystem === 'aer_bus').length})</span>
                </button>
                <button
                  onClick={() => setLedgerSubsystemFilter('stdp_engine')}
                  className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                    ledgerSubsystemFilter === 'stdp_engine'
                      ? 'bg-amber-600/40 text-amber-200 font-bold border border-amber-500/40'
                      : 'text-slate-400 hover:text-amber-300'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>STDP Runaway ({snapshot.recentEvents.filter((e) => e.primarySubsystem === 'stdp_engine').length})</span>
                </button>
                <button
                  onClick={() => setLedgerSubsystemFilter('membrane_integrator')}
                  className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                    ledgerSubsystemFilter === 'membrane_integrator'
                      ? 'bg-purple-600/40 text-purple-200 font-bold border border-purple-500/40'
                      : 'text-slate-400 hover:text-purple-300'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  <span>Membrane Leak ({snapshot.recentEvents.filter((e) => e.primarySubsystem === 'membrane_integrator').length})</span>
                </button>
                <button
                  onClick={() => setLedgerSubsystemFilter('reflex_controller')}
                  className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                    ledgerSubsystemFilter === 'reflex_controller'
                      ? 'bg-rose-600/40 text-rose-200 font-bold border border-rose-500/40'
                      : 'text-slate-400 hover:text-rose-300'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  <span>Reflex Divergence ({snapshot.recentEvents.filter((e) => e.primarySubsystem === 'reflex_controller').length})</span>
                </button>
                <button
                  onClick={() => setLedgerSubsystemFilter('synaptic_bleed')}
                  className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                    ledgerSubsystemFilter === 'synaptic_bleed'
                      ? 'bg-emerald-600/40 text-emerald-200 font-bold border border-emerald-500/40'
                      : 'text-slate-400 hover:text-emerald-300'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Synaptic Bleed ({snapshot.recentEvents.filter((e) => e.primarySubsystem === 'synaptic_bleed').length})</span>
                </button>
              </div>
            </div>
          )}

          {snapshot.recentEvents && snapshot.recentEvents.length > 0 ? (
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs font-mono text-slate-300">
                <thead className="bg-slate-950/90 text-slate-500 text-[10px] uppercase border-b border-slate-800">
                  <tr>
                    <th className="p-3">Time</th>
                    <th className="p-3">Auto-Tagged Source</th>
                    <th className="p-3">Cluster</th>
                    <th className="p-3">Drift Velocity</th>
                    <th className="p-3">d²w/dt²</th>
                    <th className="p-3">Depression Δ</th>
                    <th className="p-3">LTD Mult</th>
                    <th className="p-3">Synapses</th>
                    <th className="p-3 text-right">Post-Mortem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {snapshot.recentEvents
                    .filter(
                      (evt) =>
                        ledgerSubsystemFilter === 'all' ||
                        evt.primarySubsystem === ledgerSubsystemFilter
                    )
                    .map((evt) => {
                      const isSelected = selectedLedgerEvent?.id === evt.id;
                      const sub = evt.primarySubsystem || 'stdp_engine';
                      const label = evt.subsystemLabel || (sub === 'aer_bus' ? 'AER Bus Saturation' : 'STDP Runaway');

                      return (
                        <tr
                          key={evt.id}
                          onClick={() => setSelectedLedgerEvent(isSelected ? null : evt)}
                          className={`hover:bg-slate-800/50 cursor-pointer transition-colors ${
                            isSelected ? 'bg-indigo-950/40 ring-1 ring-indigo-500/40' : ''
                          }`}
                        >
                          <td className="p-3 text-slate-400 whitespace-nowrap">
                            {new Date(evt.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 w-fit border ${
                                sub === 'aer_bus'
                                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                  : sub === 'stdp_engine'
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : sub === 'membrane_integrator'
                                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                  : sub === 'reflex_controller'
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              }`}
                            >
                              <Tag className="w-3 h-3" />
                              <span>{label}</span>
                              {evt.confidence && (
                                <span className="text-[9px] opacity-75 font-normal">
                                  ({(evt.confidence * 100).toFixed(0)}%)
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="p-3 text-white font-semibold whitespace-nowrap">
                            {evt.clusterName}
                          </td>
                          <td className="p-3 text-rose-400 font-bold whitespace-nowrap">
                            {evt.driftVelocity.toFixed(4)}
                          </td>
                          <td className="p-3 text-purple-300 font-bold whitespace-nowrap">
                            {evt.secondOrderDerivative.toFixed(4)}
                          </td>
                          <td className="p-3 text-amber-300 whitespace-nowrap">
                            -{evt.injectionMagnitude.toFixed(4)}
                          </td>
                          <td className="p-3 text-emerald-400 whitespace-nowrap">
                            {evt.ltdMultiplierApplied.toFixed(2)}x
                          </td>
                          <td className="p-3 whitespace-nowrap">{evt.synapsesAffected}</td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLedgerEvent(isSelected ? null : evt);
                              }}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded text-[10px] font-semibold"
                            >
                              {isSelected ? 'Close' : 'Inspect'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 text-xs">
              No runaway drift events recorded yet. Synaptic clusters operating in homeostatic equilibrium.
            </div>
          )}

          {/* Selected Event Post-Mortem Forensic Drawer */}
          {selectedLedgerEvent && (
            <div className="p-4 rounded-xl bg-slate-950 border border-indigo-500/40 shadow-xl space-y-3 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Post-Mortem Root Cause:
                  </span>
                  <span className="px-2.5 py-0.5 rounded text-xs font-bold font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                    {selectedLedgerEvent.subsystemLabel || 'STDP Runaway'}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Cluster: <strong className="text-white">{selectedLedgerEvent.clusterName}</strong>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Timestamp: {new Date(selectedLedgerEvent.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedLedgerEvent(null)}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Telemetry Evidence Grid */}
              {selectedLedgerEvent.telemetryEvidence && selectedLedgerEvent.telemetryEvidence.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
                  {selectedLedgerEvent.telemetryEvidence.map((ev, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between"
                    >
                      <span className="text-[10px] text-slate-400 uppercase">{ev.metric}</span>
                      <div className="flex items-center justify-between mt-1">
                        <span
                          className={`font-bold ${
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
              )}

              {/* Forensic Narrative */}
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-300 space-y-1">
                <div className="flex items-center gap-1.5 text-indigo-300 font-bold text-[11px] uppercase">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Forensic Audit Findings</span>
                </div>
                <p className="leading-relaxed">
                  {selectedLedgerEvent.postMortemSummary ||
                    `Drift velocity surged to ${selectedLedgerEvent.driftVelocity.toFixed(4)} with second-order acceleration of ${selectedLedgerEvent.secondOrderDerivative.toFixed(4)}. Corrective LTD applied -${selectedLedgerEvent.injectionMagnitude.toFixed(4)} delta across ${selectedLedgerEvent.synapsesAffected} synapses.`}
                </p>
                {selectedLedgerEvent.remediationSuggestion && (
                  <div className="pt-1.5 border-t border-slate-800/60 flex items-start gap-1.5 text-[11px]">
                    <span className="text-emerald-400 font-bold shrink-0">Remediation:</span>
                    <span className="text-slate-400">{selectedLedgerEvent.remediationSuggestion}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: NEURAL PATHWAY AUDIT TOOL */}
      {activeToolTab === 'pathway_audit' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          {/* Header & Controls */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <Search className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white tracking-tight">
                  Neural Pathway Audit & Leakage Interceptor
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                    lastAuditReport?.auditStatus === 'CLEANED'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : lastAuditReport?.auditStatus === 'CRITICAL_BLEED'
                      ? 'bg-rose-500 text-white animate-pulse border-rose-400'
                      : lastAuditReport?.auditStatus === 'LEAKAGE_DETECTED'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  }`}
                >
                  {lastAuditReport?.auditStatus === 'CLEANED'
                    ? 'CLEANED & RE-CENTERED'
                    : lastAuditReport?.auditStatus || 'OPTIMAL'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Scans the <span className="text-cyan-300 font-mono">SNNEngine</span> synaptic matrix for zero-weight floating pathways,
                non-functional dormant connections, and cross-talk leakage bleed. Triggers immediate homeostatic cleanup to restore
                matrix sparsity and save neuromorphic MAC power.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleRunPathwayAudit(false)}
                disabled={isAuditing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/30 transition-all active:scale-[0.98]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
                <span>Scan Pathways</span>
              </button>

              <button
                onClick={handleRunPathwayCleanup}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all shadow-md active:scale-[0.98] ${
                  lastAuditReport?.hasLeakageOrBleed || snapshot.pathwayLeakageDetected
                    ? 'bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 border-rose-400 text-white animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
                title="Prunes diffuse bleeding pathways, re-centers zero-weight floating synapses, and clamps runaway weights"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Execute Cleanup Routine</span>
              </button>

              <button
                onClick={handleToggleAutoClean}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  autoCleanOnBleed
                    ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Auto-Clean: {autoCleanOnBleed ? 'ON' : 'OFF'}</span>
              </button>

              <button
                onClick={handleInjectPathwayBleed}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-950/40 border border-rose-500/40 text-rose-300 hover:bg-rose-900/50 transition-all"
                title="Inject synthetic cross-talk bleed to test audit and cleanup responses"
              >
                <Flame className="w-3.5 h-3.5 text-rose-400" />
                <span>Inject Test Bleed</span>
              </button>
            </div>
          </div>

          {/* Audit Metrics Breakdown Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Total Scanned */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
              <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
                <span>Total Pathways</span>
                <Cpu className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <div className="text-xl font-bold font-mono text-white mt-1">
                {lastAuditReport?.totalPathwaysScanned || engine.synapses.length}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Silicon Synapses</div>
            </div>

            {/* Functional Active */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
              <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
                <span>Functional</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                {lastAuditReport?.functionalCount ?? 0}
              </div>
              <div className="text-[10px] text-emerald-400/70 mt-0.5">Canonical Pathways</div>
            </div>

            {/* Zero-Weight / Near-Zero */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
              <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
                <span>Zero-Weight</span>
                <Activity className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <div className="text-xl font-bold font-mono text-sky-300 mt-1">
                {lastAuditReport?.zeroWeightCount ?? 0}
              </div>
              <div className="text-[10px] text-sky-400/70 mt-0.5">|w| ≤ 0.006 Noise</div>
            </div>

            {/* Dormant */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
              <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
                <span>Dormant</span>
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <div className="text-xl font-bold font-mono text-indigo-300 mt-1">
                {lastAuditReport?.dormantCount ?? 0}
              </div>
              <div className="text-[10px] text-indigo-400/70 mt-0.5">No Spikes &gt;1.2s</div>
            </div>

            {/* Leaky / Bleeding */}
            <div className={`border rounded-xl p-3 transition-all ${
              (lastAuditReport?.leakyCount ?? 0) > 0
                ? 'bg-rose-950/30 border-rose-500/50 shadow-md shadow-rose-950/30'
                : 'bg-slate-950/70 border-slate-800/80'
            }`}>
              <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
                <span>Leaking / Bleed</span>
                {(lastAuditReport?.leakyCount ?? 0) > 0 ? (
                  <Scissors className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                )}
              </div>
              <div className={`text-xl font-bold font-mono mt-1 ${
                (lastAuditReport?.leakyCount ?? 0) > 0 ? 'text-rose-400' : 'text-slate-300'
              }`}>
                {lastAuditReport?.leakyCount ?? 0}
              </div>
              <div className="text-[10px] text-rose-400/80 mt-0.5 truncate">
                {(lastAuditReport?.leakyCount ?? 0) > 0 ? 'Cross-Talk Leak' : 'Zero Bleed'}
              </div>
            </div>

            {/* Bleed Index & Power Waste */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
              <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
                <span>Bleed Index</span>
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-xl font-bold font-mono text-amber-300 mt-1">
                {(lastAuditReport?.synapticBleedIndex ?? 0).toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Waste: ~{(lastAuditReport?.leakagePowerWasteMw ?? 0).toFixed(2)} mW
              </div>
            </div>
          </div>

          {/* Cleanup Result Banner (if just cleaned) */}
          {lastAuditReport?.cleanupDetails && (
            <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-lg shadow-emerald-950/20">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Cleanup Routine Executed Successfully
                  </h4>
                  <p className="text-xs text-emerald-200 mt-0.5 leading-relaxed">
                    {lastAuditReport.cleanupDetails.summary}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono shrink-0">
                <div className="text-right">
                  <div className="text-slate-400 text-[10px]">DRI RESTORED</div>
                  <div className="text-emerald-400 font-bold">
                    {lastAuditReport.cleanupDetails.driBefore.toFixed(1)}% →{' '}
                    {lastAuditReport.cleanupDetails.driAfter.toFixed(1)}%
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-slate-400 text-[10px]">POWER SAVED</div>
                  <div className="text-amber-300 font-bold">
                    ~{lastAuditReport.cleanupDetails.powerSavedMw} mW
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Findings & Biological Invariants */}
          {lastAuditReport && lastAuditReport.findings.length > 0 && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Info className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Audit Findings & Neuromorphic Diagnosis
                </h4>
              </div>
              <ul className="space-y-1 text-xs text-slate-300 font-mono">
                {lastAuditReport.findings.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-cyan-400 mt-1">•</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Filter Bar & Synaptic Pathways List */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-semibold text-white">Pathway Filter:</span>
                <div className="flex items-center gap-1 flex-wrap">
                  {[
                    { id: 'all', label: `All (${lastAuditReport?.pathways.length || 0})` },
                    { id: 'leaky', label: `Leaky Bleed (${lastAuditReport?.leakyCount || 0})` },
                    { id: 'zero', label: `Zero-Weight (${lastAuditReport?.zeroWeightCount || 0})` },
                    { id: 'dormant', label: `Dormant (${lastAuditReport?.dormantCount || 0})` },
                    { id: 'functional', label: `Functional (${lastAuditReport?.functionalCount || 0})` },
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => setAuditFilter(filter.id as any)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                        auditFilter === filter.id
                          ? 'bg-cyan-600 text-white font-semibold'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              <span className="text-[11px] text-slate-500 font-mono">
                Updated: {new Date(lastAuditReport?.timestamp || Date.now()).toLocaleTimeString()}
              </span>
            </div>

            {/* Scrollable Pathways Table */}
            <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/80">
              <table className="w-full text-left text-xs font-mono text-slate-300">
                <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase sticky top-0 border-b border-slate-800 z-10">
                  <tr>
                    <th className="p-2.5">Pathway (Pre → Post)</th>
                    <th className="p-2.5">Layer</th>
                    <th className="p-2.5">Weight</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Diagnostic / Remedy Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {lastAuditReport?.pathways
                    .filter((p) => {
                      if (auditFilter === 'leaky') return p.status === 'LEAKING_BLEED';
                      if (auditFilter === 'zero') return p.status === 'ZERO_WEIGHT';
                      if (auditFilter === 'dormant') return p.status === 'DORMANT';
                      if (auditFilter === 'functional') return p.status === 'FUNCTIONAL';
                      return true;
                    })
                    .map((item) => (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-800/40 transition-colors ${
                          item.status === 'LEAKING_BLEED'
                            ? 'bg-rose-950/20'
                            : item.status === 'ZERO_WEIGHT'
                            ? 'bg-sky-950/10'
                            : ''
                        }`}
                      >
                        <td className="p-2.5 font-semibold text-white">
                          <span className="text-slate-400 font-normal">N{item.preId}</span> {item.preLabel}{' '}
                          <span className="text-cyan-400">→</span>{' '}
                          <span className="text-slate-400 font-normal">N{item.postId}</span> {item.postLabel}
                        </td>
                        <td className="p-2.5 uppercase text-[10px] text-slate-400">
                          {item.layer}
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`font-mono font-bold ${
                              item.status === 'LEAKING_BLEED'
                                ? 'text-rose-400'
                                : item.weight === 0
                                ? 'text-slate-600'
                                : item.weight > 0
                                ? 'text-emerald-400'
                                : 'text-purple-400'
                            }`}
                          >
                            {item.weight.toFixed(4)}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.status === 'FUNCTIONAL'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : item.status === 'ZERO_WEIGHT'
                                ? 'bg-slate-800 text-slate-400 border border-slate-700'
                                : item.status === 'DORMANT'
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                            }`}
                          >
                            {item.status === 'LEAKING_BLEED' ? 'LEAKING BLEED' : item.status}
                          </span>
                        </td>
                        <td className="p-2.5 text-xs text-slate-400 leading-snug">
                          {item.remedyAction ? (
                            <span className={item.status === 'LEAKING_BLEED' ? 'text-rose-300' : 'text-slate-400'}>
                              {item.remedyAction}
                            </span>
                          ) : (
                            <span className="text-emerald-400/80">Nominal physiological transmission</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
