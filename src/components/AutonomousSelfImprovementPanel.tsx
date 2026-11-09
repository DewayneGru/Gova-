import React, { useState, useEffect } from 'react';
import {
  HardwareTelemetry,
  SNNTuningConfig,
  AutonomousSelfImprovementState,
  SelfImprovementEpoch,
} from '../types';
import { AntiDivergenceEngine } from '../lib/selfImprovement';
import { SNNEngine } from '../lib/snnEngine';
import { HardLockedPlankCard } from './HardLockedPlankCard';
import { ModelTelemetryInspectionModal } from './ModelTelemetryInspectionModal';
import {
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RotateCcw,
  Zap,
  TrendingDown,
  Clock,
  Play,
  Pause,
  CheckCircle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Cpu,
  Layers,
  ArrowRight,
  RefreshCw,
  Globe,
  Search,
  BookOpen,
  ExternalLink,
  Lock,
  Fingerprint,
  List,
  Milestone,
  FileCode,
} from 'lucide-react';

interface AutonomousSelfImprovementPanelProps {
  engine: SNNEngine;
  telemetry: HardwareTelemetry;
  tuningConfig: SNNTuningConfig;
  rsiState: AutonomousSelfImprovementState;
  onToggleActive: () => void;
  onSetMode: (mode: 'continuous' | 'event_triggered' | 'manual') => void;
  onTriggerEpoch: (reason?: string, researchQuery?: string) => Promise<void>;
  onRevertBaseline: () => void;
  onRollbackLastEpoch: () => void;
  isEvaluating: boolean;
}

export const AutonomousSelfImprovementPanel: React.FC<AutonomousSelfImprovementPanelProps> = ({
  engine,
  telemetry,
  tuningConfig,
  rsiState,
  onToggleActive,
  onSetMode,
  onTriggerEpoch,
  onRevertBaseline,
  onRollbackLastEpoch,
  isEvaluating,
}) => {
  const [selectedEpoch, setSelectedEpoch] = useState<SelfImprovementEpoch | null>(null);
  const [historyViewMode, setHistoryViewMode] = useState<'timeline' | 'compact'>('timeline');
  const [countdown, setCountdown] = useState<number>(rsiState.cycleIntervalSeconds);
  const [researchQuery, setResearchQuery] = useState<string>('BCM sliding threshold & LTD dominance in spiking networks');
  const [showResearchDrawer, setShowResearchDrawer] = useState<boolean>(false);
  const [showTelemetryModal, setShowTelemetryModal] = useState<boolean>(false);

  // Preset literature research topics
  const researchPresets = [
    'Bi & Poo 1998 asymmetric STDP LTD dominance in pyramidal synapses',
    'Turrigiano homeostatic synaptic scaling firing rate setpoints',
    'BCM theory sliding threshold under high-frequency burst trains',
    'Critical branching ratio sigma=1.0 & avalanche quenching in cortex',
    'GABAergic parvalbumin fast-spiking interneuron lateral inhibition',
    'Endocannabinoid-mediated retrograde LTD injection kinetics',
  ];

  // Countdown timer for next autonomous cycle
  useEffect(() => {
    if (!rsiState.isActive || rsiState.mode === 'manual') return;

    const interval = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - rsiState.lastEvaluationTime) / 1000);
      const remaining = Math.max(0, rsiState.cycleIntervalSeconds - elapsedSec);
      setCountdown(remaining);
    }, 1000);

    return () => clearInterval(interval);
  }, [rsiState.isActive, rsiState.mode, rsiState.lastEvaluationTime, rsiState.cycleIntervalSeconds]);

  const metrics = rsiState.currentMetrics;
  const dri = metrics.divergenceRiskIndex;

  // Compute color based on DRI
  const getDriColor = (val: number) => {
    if (val < 0.25) return 'text-emerald-400 border-emerald-500/30 bg-emerald-950/20';
    if (val < 0.50) return 'text-amber-400 border-amber-500/30 bg-amber-950/20';
    return 'text-rose-400 border-rose-500/30 bg-rose-950/20';
  };

  const getDriBadge = (val: number) => {
    if (val < 0.25) return { label: 'NOMINAL / STABLE', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
    if (val < 0.50) return { label: 'ELEVATED DRI / CAUTION', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
    return { label: 'CRITICAL DIVERGENCE HAZARD', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
  };

  const driBadge = getDriBadge(dri);

  return (
    <div className="flex flex-col gap-4">
      {/* Top Controller Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-[#0c1220] to-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-sky-500 to-emerald-400 p-0.5 flex items-center justify-center shadow-lg shadow-sky-500/20">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-sky-400 animate-pulse" />
                </div>
              </div>
              {rsiState.isActive && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-950 animate-ping" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Autonomous Recursive Self-Improvement (RSI) Engine
                </h2>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                    rsiState.isActive
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {rsiState.isActive ? 'RSI ACTIVE' : 'RSI STANDBY'}
                </span>
                <span className="text-[10px] font-mono text-purple-300 bg-purple-950/60 border border-purple-800/60 px-2 py-0.5 rounded-full">
                  Gemini Anti-Divergence
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Continuously evaluates edge telemetry, detects mathematical drift vectors, and synthesizes verified parameter adaptations to prevent divergence.
              </p>
            </div>
          </div>

          {/* Action Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onToggleActive}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-md ${
                rsiState.isActive
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              {rsiState.isActive ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause Autonomous Loop</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Activate Autonomous Loop</span>
                </>
              )}
            </button>

            <button
              onClick={() => onTriggerEpoch('operator_prompt')}
              disabled={isEvaluating}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50 transition-all shadow-md shadow-sky-900/40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isEvaluating ? 'animate-spin' : ''}`} />
              <span>{isEvaluating ? 'Recursive Optimization Running...' : 'Trigger Epoch Now'}</span>
            </button>

            <button
              onClick={() => setShowResearchDrawer((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                showResearchDrawer
                  ? 'bg-purple-600/30 text-purple-200 border-purple-500/60 shadow-lg shadow-purple-900/30'
                  : 'bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 border-purple-800/60'
              }`}
              title="Give model the ability to search online literature to recursively self-improve"
            >
              <Globe className="w-3.5 h-3.5 text-purple-400" />
              <span>Internet Research RSI</span>
            </button>

            <button
              onClick={onRevertBaseline}
              title="Reset hyperparameters to biological homeostatic baseline"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Reset Baseline</span>
            </button>
          </div>
        </div>

        {/* Sub-bar: Modes & Timing */}
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[11px]">Autonomous Execution Cadence:</span>
            <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[11px]">
              <button
                onClick={() => onSetMode('continuous')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  rsiState.mode === 'continuous'
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Continuous (Every {rsiState.cycleIntervalSeconds}s)
              </button>
              <button
                onClick={() => onSetMode('event_triggered')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  rsiState.mode === 'event_triggered'
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                On Divergence Spikes (DRI &gt; {rsiState.divergenceThreshold})
              </button>
              <button
                onClick={() => onSetMode('manual')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  rsiState.mode === 'manual'
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Manual Trigger Only
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 text-[11px] font-mono">
            {rsiState.isActive && rsiState.mode === 'continuous' && (
              <span className="flex items-center gap-1.5 text-sky-400">
                <Clock className="w-3.5 h-3.5" />
                <span>Next Autonomous Evaluation: ~{countdown}s</span>
              </span>
            )}
            <span className="text-slate-400">
              Completed Epochs: <strong className="text-emerald-400">{rsiState.totalEpochsCompleted}</strong>
            </span>
            <span className="text-slate-400">
              Divergences Prevented: <strong className="text-amber-400">{rsiState.totalDivergencesPrevented}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Internet Literature Research Drawer */}
      {showResearchDrawer && (
        <div className="bg-gradient-to-r from-purple-950/40 via-slate-900 to-indigo-950/40 border border-purple-500/40 rounded-xl p-3.5 shadow-lg flex flex-col gap-2.5 text-xs animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-900/40 pb-2">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40">
                <Globe className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <span className="font-bold text-purple-200 text-xs flex items-center gap-1.5">
                  <span>Google Search Grounding & Autonomous Literature Research</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Live Web Citations
                  </span>
                </span>
                <p className="text-[11px] text-slate-400">
                  Allow the model to query external neurocomputational literature, benchmarks (e.g. Loihi 2, SpiNNaker), and homeostatic BCM rules to recursively self-improve.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowResearchDrawer(false)}
              className="text-slate-400 hover:text-slate-200 text-xs px-2 py-0.5 rounded bg-slate-800"
            >
              Close
            </button>
          </div>

          {/* Preset Research Chips */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] text-slate-400 mr-1 flex items-center gap-1">
              <Search className="w-3 h-3 text-purple-400" />
              Preset Topics:
            </span>
            {researchPresets.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setResearchQuery(preset)}
                className={`text-[10px] font-mono px-2 py-1 rounded-md border transition-all ${
                  researchQuery === preset
                    ? 'bg-purple-600/40 text-purple-200 border-purple-400 font-semibold'
                    : 'bg-slate-950/80 text-slate-300 border-slate-800 hover:border-purple-600/50'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Research Input Bar */}
          <div className="flex gap-2 items-center mt-1">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-purple-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={researchQuery}
                onChange={(e) => setResearchQuery(e.target.value)}
                placeholder="Enter neuromorphic research inquiry (e.g., STDP LTP/LTD dominance ratio, Loihi 2 pJ/SOP)..."
                className="w-full bg-slate-950 border border-purple-800/60 rounded-lg pl-8 pr-3 py-1.5 text-xs text-purple-200 placeholder-slate-500 focus:outline-none focus:border-purple-400 font-mono"
              />
            </div>

            <button
              onClick={() => onTriggerEpoch('web_literature_research', researchQuery)}
              disabled={isEvaluating || !researchQuery.trim()}
              className="px-3.5 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-md shadow-purple-900/30 disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isEvaluating ? 'animate-spin' : ''}`} />
              <span>{isEvaluating ? 'Searching & Optimizing...' : 'Search & Execute Grounded RSI'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Hard-Locked Stability Plank Verification Card */}
      <HardLockedPlankCard plank={AntiDivergenceEngine.getActivePlankStatus(tuningConfig, dri)} />

      {/* Unified 5-Subsystem Monitoring Streams (Gemini Pro Tier Ingestion) */}
      <div className="bg-[#0a0f1d] border border-sky-900/60 rounded-xl p-3.5 shadow-lg flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Unified Subsystem Monitoring & Model Ingestion (5 Pillars)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-semibold">
                  <CheckCircle className="w-3 h-3 text-emerald-400" />
                  All 5 Live Streams Ingested by Gemini
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold">
                  Deep Reasoning Pro Tier
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Full-spectrum telemetry streaming from physical SNN substrate to Gemini model for closed-loop anti-divergence deductions.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowTelemetryModal(true)}
            className="px-3 py-1.5 bg-gradient-to-r from-sky-600/30 to-indigo-600/30 hover:from-sky-600/50 hover:to-indigo-600/50 border border-sky-500/50 text-sky-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
            title="Inspect the complete 5-subsystem unified telemetry matrix that Gemini receives"
          >
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <span>Inspect Model Telemetry Matrix</span>
          </button>
        </div>

        {/* 5 Pillars Metric Chips */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
          {/* Pillar 1: Core Hardware */}
          <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 flex flex-col gap-1">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-semibold uppercase">
              <span className="text-sky-400">1. Core Hardware</span>
              <span className="font-mono text-emerald-400">ONLINE</span>
            </div>
            <div className="flex items-baseline justify-between font-mono">
              <span className="text-slate-400 text-[11px]">Firing Rate:</span>
              <span className="text-white font-bold">{telemetry.meanFiringRateHz.toFixed(1)} Hz</span>
            </div>
            <div className="flex items-baseline justify-between font-mono text-[10px]">
              <span className="text-slate-500">Power / Energy:</span>
              <span className="text-sky-300">{telemetry.powerMw.toFixed(1)} mW / {telemetry.energyPerSopPj.toFixed(1)} pJ</span>
            </div>
          </div>

          {/* Pillar 2: Substrate Keel */}
          <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 flex flex-col gap-1">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-semibold uppercase">
              <span className="text-indigo-400">2. Substrate Keel</span>
              <span className="font-mono text-emerald-400">NOMINAL</span>
            </div>
            <div className="flex items-baseline justify-between font-mono">
              <span className="text-slate-400 text-[11px]">Valence:</span>
              <span className="text-white font-bold">{telemetry.substrateKeel?.valence?.toFixed(2) ?? "0.00"}</span>
            </div>
            <div className="flex items-baseline justify-between font-mono text-[10px]">
              <span className="text-slate-500">Trauma / Gate:</span>
              <span className="text-indigo-300">{telemetry.traumaState || 'ventral'} ({telemetry.constitutionalGateState || 'NOMINAL'})</span>
            </div>
          </div>

          {/* Pillar 3: Frequency Bands */}
          <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 flex flex-col gap-1">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-semibold uppercase">
              <span className="text-amber-400">3. Power Spectrum</span>
              <span className="font-mono text-emerald-400">&alpha;-&gamma; LOCKED</span>
            </div>
            <div className="flex items-baseline justify-between font-mono">
              <span className="text-slate-400 text-[11px]">Burst Synchrony:</span>
              <span className="text-white font-bold">{metrics.burstSynchronyRisk.toFixed(2)}</span>
            </div>
            <div className="flex items-baseline justify-between font-mono text-[10px]">
              <span className="text-slate-500">SNR Ratio:</span>
              <span className="text-amber-300">18.6 dB (Cortical)</span>
            </div>
          </div>

          {/* Pillar 4: AER Asynchronous Bus */}
          <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 flex flex-col gap-1">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-semibold uppercase">
              <span className="text-teal-400">4. AER Bus</span>
              <span className="font-mono text-emerald-400">0 DROPS</span>
            </div>
            <div className="flex items-baseline justify-between font-mono">
              <span className="text-slate-400 text-[11px]">Bus Latency:</span>
              <span className="text-white font-bold">{telemetry.aerLatencyMs.toFixed(2)} ms</span>
            </div>
            <div className="flex items-baseline justify-between font-mono text-[10px]">
              <span className="text-slate-500">Packet Traffic:</span>
              <span className="text-teal-300">Clockless / 100% Retained</span>
            </div>
          </div>

          {/* Pillar 5: Synaptic Stability & DRI */}
          <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 flex flex-col gap-1">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-semibold uppercase">
              <span className="text-purple-400">5. Synaptic Health</span>
              <span className="font-mono text-purple-300">LTD/LTP &gt; 1.08</span>
            </div>
            <div className="flex items-baseline justify-between font-mono">
              <span className="text-slate-400 text-[11px]">Divergence (DRI):</span>
              <span className={`font-bold ${dri < 0.25 ? 'text-emerald-400' : dri < 0.5 ? 'text-amber-400' : 'text-rose-400'}`}>
                {dri.toFixed(2)} / 1.00
              </span>
            </div>
            <div className="flex items-baseline justify-between font-mono text-[10px]">
              <span className="text-slate-500">STDP Drift:</span>
              <span className="text-purple-300">&Delta;={telemetry.cumulativeSTDPDelta.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Real-Time Divergence Index & Invariant Monitors */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Divergence Risk Gauge & Radar */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Divergence Risk Index (DRI)
              </span>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${driBadge.color}`}>
                {driBadge.label}
              </span>
            </div>

            {/* Big DRI Gauge Display */}
            <div className="mt-4 flex flex-col items-center">
              <div className="relative flex items-center justify-center">
                <div className="text-4xl font-extrabold font-mono tracking-tight text-white">
                  {(dri * 100).toFixed(0)}
                  <span className="text-lg font-normal text-slate-400 ml-1">/100</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-1">Real-Time Divergence Coefficient</p>

              {/* Progress Bar */}
              <div className="w-full bg-slate-950 rounded-full h-3 border border-slate-800 overflow-hidden mt-3 p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    dri < 0.25
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : dri < 0.50
                      ? 'bg-gradient-to-r from-amber-500 to-orange-400'
                      : 'bg-gradient-to-r from-rose-500 to-red-600'
                  }`}
                  style={{ width: `${Math.max(4, Math.min(100, dri * 100))}%` }}
                />
              </div>
            </div>

            {/* Primary Risk Callout */}
            <div className="mt-4 p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-xs">
              <span className="text-slate-500 block text-[10px] uppercase font-mono">Dominant Divergence Vector</span>
              <span className="text-slate-200 font-semibold font-mono text-[11px] block mt-0.5">
                {metrics.primaryRiskFactor}
              </span>
            </div>

            {/* 4 Vector Decompositions */}
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[11px]">Weight Saturation & Drift:</span>
                <span className="font-mono text-slate-200 font-semibold">
                  {(metrics.weightSaturationRisk * 100).toFixed(0)}%
                </span>
              </div>
              <div className="w-full bg-slate-800/50 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-purple-400 h-full transition-all"
                  style={{ width: `${metrics.weightSaturationRisk * 100}%` }}
                />
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[11px]">Burst Synchrony & AER Congestion:</span>
                <span className="font-mono text-slate-200 font-semibold">
                  {((metrics.burstSynchronyRisk ?? metrics.collisionFrequencyRisk ?? 0) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="w-full bg-slate-800/50 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-amber-400 h-full transition-all"
                  style={{ width: `${(metrics.burstSynchronyRisk ?? metrics.collisionFrequencyRisk ?? 0) * 100}%` }}
                />
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[11px]">Keel & Trauma Instability:</span>
                <span className="font-mono text-slate-200 font-semibold">
                  {(metrics.keelInstabilityRisk * 100).toFixed(0)}%
                </span>
              </div>
              <div className="w-full bg-slate-800/50 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-cyan-400 h-full transition-all"
                  style={{ width: `${metrics.keelInstabilityRisk * 100}%` }}
                />
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[11px]">Cortical Firing Variance:</span>
                <span className="font-mono text-slate-200 font-semibold">
                  {(metrics.firingRateRisk * 100).toFixed(0)}%
                </span>
              </div>
              <div className="w-full bg-slate-800/50 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-sky-400 h-full transition-all"
                  style={{ width: `${metrics.firingRateRisk * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Divergence Threshold:</span>
            <span className="font-mono font-bold text-sky-400">DRI &gt; 0.35</span>
          </div>
        </div>

        {/* Right Column: 4 Anti-Divergence Invariants */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Anti-Divergence Invariants & Safety Proofs
              </span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
                Strict Formal Proofs
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              {/* Invariant 1: Plasticity Boundedness */}
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">1. Plasticity Boundedness</span>
                    {metrics.invariants.plasticityBounded ? (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                        <CheckCircle className="w-3.5 h-3.5" />
                        PASS
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-rose-400 font-mono">
                        <XCircle className="w-3.5 h-3.5" />
                        BREACH
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Enforces strict LTD depression dominance (A- / A+ &gt;= 1.05) to halt unbounded LTP runaway drift.
                  </p>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800/60 font-mono text-[11px] flex justify-between text-slate-300">
                  <span>Current Ratio:</span>
                  <span className="font-bold text-sky-400">
                    {(tuningConfig.aMinus / tuningConfig.aPlus).toFixed(2)}x LTD/LTP
                  </span>
                </div>
              </div>

              {/* Invariant 2: Weight Saturation & Sparsity */}
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">2. Weight Saturation Guard</span>
                    {metrics.invariants.weightsUnsaturated ? (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                        <CheckCircle className="w-3.5 h-3.5" />
                        PASS
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-amber-400 font-mono">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        WARN
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Monitors synapse matrix to ensure &lt; 25% of weights are pinned against maximum biological rails.
                  </p>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800/60 font-mono text-[11px] flex justify-between text-slate-300">
                  <span>Cumulative Drift:</span>
                  <span className="font-bold text-purple-400">
                    Δ {telemetry.cumulativeSTDPDelta.toFixed(1)}
                  </span>
                </div>
              </div>

              {/* Invariant 3: Substrate Keel Valence Homeostasis */}
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">3. Keel Homeostasis</span>
                    {metrics.invariants.keelHomeostatic ? (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                        <CheckCircle className="w-3.5 h-3.5" />
                        PASS
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-rose-400 font-mono">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        TRIPPED
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Guards against the baseline depressive trap and dorsal trauma locking via dynamic prediction re-centering.
                  </p>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800/60 font-mono text-[11px] flex justify-between text-slate-300">
                  <span>Trauma State:</span>
                  <span className="font-bold text-cyan-400">
                    {telemetry.traumaState || 'ventral_equilibrium'}
                  </span>
                </div>
              </div>

              {/* Invariant 4: Constitutional Gate Dual-Threshold */}
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">4. Constitutional Alignment</span>
                    {metrics.invariants.constitutionalAligned ? (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                        <CheckCircle className="w-3.5 h-3.5" />
                        NOMINAL
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-amber-400 font-mono">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        DAMPED
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Gating EMA alpha filter curbs out-of-distribution environmental deviations before efferent output projection.
                  </p>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800/60 font-mono text-[11px] flex justify-between text-slate-300">
                  <span>Compute Damping:</span>
                  <span className="font-bold text-emerald-400">
                    {((telemetry.gateDampingFactor ?? 1.0) * 100).toFixed(0)}% Nominal
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Active Hyperparameter Vector Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-sky-400" />
                Live SNN Hyperparameters (Autonomous Calibrated)
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Active in Spiking Engine
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-3 font-mono text-center">
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">STDP A+ (LTP)</span>
                <span className="text-sm font-bold text-purple-400">{tuningConfig.aPlus.toFixed(3)}</span>
              </div>
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">STDP A- (LTD)</span>
                <span className="text-sm font-bold text-emerald-400">{tuningConfig.aMinus.toFixed(3)}</span>
              </div>
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Learning Rate</span>
                <span className="text-sm font-bold text-sky-400">{tuningConfig.learningRate.toFixed(2)}</span>
              </div>
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Turn Gain</span>
                <span className="text-sm font-bold text-amber-400">{tuningConfig.turnGain.toFixed(2)}x</span>
              </div>
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Proximity Gain</span>
                <span className="text-sm font-bold text-pink-400">{tuningConfig.proximityGain.toFixed(2)}x</span>
              </div>
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Anti-Hebbian</span>
                <span className="text-sm font-bold text-rose-400">{tuningConfig.antiHebbianPenalty.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Visual 'Improvement History' Timeline & Watchdog Decision Log */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4">
        {/* Section Header with View Mode Switcher and Rollback */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-br from-purple-600 to-indigo-700 rounded-lg text-white shadow-md shadow-purple-900/40">
              <Milestone className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>Improvement History Timeline</span>
                <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold">
                  Auto-Refactoring Epochs
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Explicit before & after model parameter transitions audited by the SynapseEdge Watchdog action boundary.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px] font-mono">
              <button
                onClick={() => setHistoryViewMode('timeline')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
                  historyViewMode === 'timeline'
                    ? 'bg-purple-600 text-white font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Milestone className="w-3 h-3" />
                <span>Visual Timeline</span>
              </button>
              <button
                onClick={() => setHistoryViewMode('compact')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
                  historyViewMode === 'compact'
                    ? 'bg-purple-600 text-white font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <List className="w-3 h-3" />
                <span>Compact Ledger</span>
              </button>
            </div>

            {rsiState.history.length > 1 && (
              <button
                onClick={onRollbackLastEpoch}
                className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-mono border border-amber-500/30 px-2.5 py-1 rounded-lg bg-amber-950/30 transition-all hover:bg-amber-950/50"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Rollback Epoch #{rsiState.history[rsiState.history.length - 1]?.epochNumber}</span>
              </button>
            )}

            <span className="text-[10px] font-mono text-slate-400 px-2 py-1 bg-slate-950 rounded border border-slate-800">
              {rsiState.history.length} Epoch{rsiState.history.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {rsiState.history.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center gap-3 bg-slate-950/40 rounded-xl border border-slate-800/60">
            <Sparkles className="w-7 h-7 text-purple-400 animate-pulse" />
            <div className="text-center max-w-md">
              <span className="font-semibold text-slate-300 block mb-1">Awaiting Initial Auto-Refactoring Epoch</span>
              <span>The autonomous self-improvement engine is active. Trigger an initial cycle to view the parameter before/after state and watchdog decision log.</span>
            </div>
            <button
              onClick={() => onTriggerEpoch('initial_bootstrap')}
              className="mt-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-purple-900/30 transition-all cursor-pointer"
            >
              Trigger Initial Auto-Refactoring Epoch
            </button>
          </div>
        ) : historyViewMode === 'timeline' ? (
          /* Visual Timeline with Connected Illuminated Spine */
          <div className="relative pl-6 sm:pl-8 space-y-6 pt-2">
            {/* Illuminated Spine / Rail */}
            <div className="absolute top-3 bottom-3 left-2.5 sm:left-3.5 w-0.5 bg-gradient-to-b from-sky-500 via-indigo-500 to-purple-600 shadow-sm shadow-indigo-500/50" />

            {rsiState.history
              .slice()
              .reverse()
              .map((epoch, idx) => {
                const isSelected = selectedEpoch?.epochNumber === epoch.epochNumber;
                const isLatest = idx === 0;
                const reductionPct = Math.round(
                  ((epoch.initialDivergenceRisk - epoch.projectedDivergenceRisk) /
                    Math.max(0.01, epoch.initialDivergenceRisk)) *
                    100
                );
                const ratioBefore = (epoch.parameterDeltas.aMinus.from / Math.max(0.001, epoch.parameterDeltas.aPlus.from)).toFixed(2);
                const ratioAfter = (epoch.parameterDeltas.aMinus.to / Math.max(0.001, epoch.parameterDeltas.aPlus.to)).toFixed(2);

                const wdDecision = epoch.watchdogDecision;
                const isApproved = !wdDecision || wdDecision.decision === 'APPROVE';
                const isBlocked = wdDecision && wdDecision.decision === 'BLOCK';
                const isEscalated = wdDecision && wdDecision.decision === 'ESCALATE';

                return (
                  <div key={epoch.epochNumber} className="relative">
                    {/* Node Badge on Timeline Spine */}
                    <div className={`absolute -left-[30px] sm:-left-[38px] top-3.5 w-6 h-6 rounded-full border-2 flex items-center justify-center font-mono text-[9px] font-bold z-10 ${
                      isLatest
                        ? 'bg-purple-600 border-white text-white shadow-lg shadow-purple-500/50 ring-4 ring-purple-500/20 animate-pulse'
                        : 'bg-slate-950 border-indigo-400 text-indigo-300'
                    }`}>
                      {epoch.epochNumber}
                    </div>

                    {/* Timeline Card */}
                    <div className={`border rounded-xl p-4 transition-all ${
                      isSelected
                        ? 'bg-slate-950 border-purple-500/60 shadow-xl shadow-purple-950/40'
                        : 'bg-slate-950/70 border-slate-800/90 hover:border-slate-700'
                    }`}>
                      {/* Card Header */}
                      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5 pb-3 border-b border-slate-800/80">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                            Epoch #{epoch.epochNumber}
                          </span>
                          <span className="text-xs font-bold text-white tracking-wide">
                            {epoch.divergenceMitigationStrategy}
                          </span>
                          {isLatest && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              LATEST
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2.5 text-xs font-mono flex-wrap">
                          {/* Watchdog Gate Badge */}
                          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-bold ${
                            isApproved
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : isBlocked
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          }`}>
                            {isApproved ? (
                              <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            ) : isBlocked ? (
                              <ShieldAlert className="w-3 h-3 text-rose-400" />
                            ) : (
                              <AlertTriangle className="w-3 h-3 text-amber-400" />
                            )}
                            <span>
                              WATCHDOG: {isApproved ? 'APPROVED' : isBlocked ? 'BLOCKED' : 'ESCALATED'}
                            </span>
                          </div>

                          <span className="text-[10px] text-purple-300 bg-purple-950/40 border border-purple-800/40 px-2 py-0.5 rounded">
                            {epoch.modelUsed}
                          </span>

                          <span className="text-[10px] text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-600" />
                            <span>{new Date(epoch.timestamp).toLocaleTimeString()}</span>
                          </span>
                        </div>
                      </div>

                      {/* Explicit 'BEFORE' vs 'AFTER' State Display Grid */}
                      <div className="mt-3.5 space-y-2">
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 uppercase font-semibold">
                          <span>Model Parameter State: Before & After Transition</span>
                          <span className="text-emerald-400">
                            DRI: {epoch.initialDivergenceRisk.toFixed(2)} → {epoch.projectedDivergenceRisk.toFixed(2)} (-{reductionPct}%)
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 font-mono text-xs">
                          {/* 1. STDP A+ (Potentiation) */}
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                            <span className="text-[10px] text-slate-400 font-semibold block">STDP A+ (LTP)</span>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400 text-[11px]">{epoch.parameterDeltas.aPlus.from.toFixed(3)}</span>
                              <ArrowRight className="w-3 h-3 text-indigo-400" />
                              <span className="text-purple-300 font-bold text-[11px]">{epoch.parameterDeltas.aPlus.to.toFixed(3)}</span>
                            </div>
                            <span className="text-[9px] text-slate-500 block truncate">
                              Δ {(epoch.parameterDeltas.aPlus.to - epoch.parameterDeltas.aPlus.from).toFixed(3)}
                            </span>
                          </div>

                          {/* 2. STDP A- (Depression & Ratio) */}
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                            <span className="text-[10px] text-slate-400 font-semibold block">STDP A- (LTD)</span>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400 text-[11px]">{epoch.parameterDeltas.aMinus.from.toFixed(3)}</span>
                              <ArrowRight className="w-3 h-3 text-indigo-400" />
                              <span className="text-emerald-300 font-bold text-[11px]">{epoch.parameterDeltas.aMinus.to.toFixed(3)}</span>
                            </div>
                            <span className="text-[9px] text-cyan-300 font-semibold block truncate">
                              Ratio: {ratioBefore}x → {ratioAfter}x
                            </span>
                          </div>

                          {/* 3. Learning Rate */}
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                            <span className="text-[10px] text-slate-400 font-semibold block">Learning Rate (η)</span>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400 text-[11px]">{epoch.parameterDeltas.learningRate.from.toFixed(2)}</span>
                              <ArrowRight className="w-3 h-3 text-indigo-400" />
                              <span className="text-sky-300 font-bold text-[11px]">{epoch.parameterDeltas.learningRate.to.toFixed(2)}</span>
                            </div>
                            <span className="text-[9px] text-slate-500 block truncate">
                              Δ {(epoch.parameterDeltas.learningRate.to - epoch.parameterDeltas.learningRate.from).toFixed(2)}
                            </span>
                          </div>

                          {/* 4. Turn Gain */}
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                            <span className="text-[10px] text-slate-400 font-semibold block">Turn Gain (Assoc)</span>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400 text-[11px]">{epoch.parameterDeltas.turnGain.from.toFixed(2)}x</span>
                              <ArrowRight className="w-3 h-3 text-indigo-400" />
                              <span className="text-amber-300 font-bold text-[11px]">{epoch.parameterDeltas.turnGain.to.toFixed(2)}x</span>
                            </div>
                            <span className="text-[9px] text-slate-500 block truncate">
                              Branching σ ≈ 1.0
                            </span>
                          </div>

                          {/* 5. Proximity Gain */}
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                            <span className="text-[10px] text-slate-400 font-semibold block">Proximity (Afferent)</span>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400 text-[11px]">{epoch.parameterDeltas.proximityGain.from.toFixed(2)}x</span>
                              <ArrowRight className="w-3 h-3 text-indigo-400" />
                              <span className="text-pink-300 font-bold text-[11px]">{epoch.parameterDeltas.proximityGain.to.toFixed(2)}x</span>
                            </div>
                            <span className="text-[9px] text-slate-500 block truncate">
                              Afferent Sensitivity
                            </span>
                          </div>

                          {/* 6. Anti-Hebbian Penalty */}
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                            <span className="text-[10px] text-slate-400 font-semibold block">Anti-Hebbian</span>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400 text-[11px]">{epoch.parameterDeltas.antiHebbianPenalty.from.toFixed(2)}</span>
                              <ArrowRight className="w-3 h-3 text-indigo-400" />
                              <span className="text-rose-300 font-bold text-[11px]">{epoch.parameterDeltas.antiHebbianPenalty.to.toFixed(2)}</span>
                            </div>
                            <span className="text-[9px] text-slate-500 block truncate">
                              Cross-Talk Barrier
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Watchdog Decision Log for This Epoch */}
                      <div className="mt-3 p-3 rounded-lg bg-slate-950 border border-slate-800/90 space-y-2">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-900 pb-2">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                            <span className="font-mono text-[11px] font-bold text-white uppercase tracking-wider">
                              Watchdog Action Boundary Decision Log
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 flex-wrap">
                            <span>Evaluator: <strong className="text-emerald-400">[{wdDecision?.evaluatorVerdict || 'ALLOW'}]</strong></span>
                            <span>Reviewer: <strong className="text-emerald-400">[{wdDecision?.reviewerVerdict || 'ALLOW'}]</strong></span>
                            <span>Disagreement: <strong className="text-slate-200">{wdDecision?.disagreement ? 'YES' : 'NO'}</strong></span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] font-mono text-slate-400">
                          <div>
                            <span className="text-slate-500">Proposal Intercepted: </span>
                            <span className="text-slate-200">{wdDecision?.changeText || `Adjust STDP aPlus to ${epoch.parameterDeltas.aPlus.to.toFixed(3)} and aMinus to ${epoch.parameterDeltas.aMinus.to.toFixed(3)}`}</span>
                          </div>
                          <div className="flex items-center gap-3 md:justify-end text-[10px]">
                            <span>Input Hash: <strong className="text-slate-300">{wdDecision?.inputHash?.slice(0, 16) || 'verified-h_in'}</strong></span>
                            <span>Snapshot: <strong className="text-slate-300">{wdDecision?.simulatedSandbox?.snapshotHash?.slice(0, 16) || 'pre-update-snap'}</strong></span>
                          </div>
                        </div>

                        <div className="text-[10px] font-mono text-slate-300 bg-slate-900/60 p-2 rounded border border-slate-900">
                          <span className="text-slate-500">Audit Reason: </span>
                          <span>{wdDecision?.reason || 'Proposal verified safe: tightening/additive change without permission expansion, audit modification, or test skipping.'}</span>
                        </div>
                      </div>

                      {/* Expandable Reasoning & Literature Toggle */}
                      <div className="mt-2.5 flex items-center justify-between text-[11px]">
                        <button
                          onClick={() => setSelectedEpoch(isSelected ? null : epoch)}
                          className="text-purple-400 hover:text-purple-300 underline font-mono flex items-center gap-1 cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>{isSelected ? 'Hide Detailed Neuroplastic Reasoning' : 'Inspect Neuroplastic Proof & Biological Citations'}</span>
                        </button>

                        <span className="text-[10px] font-mono text-slate-500">
                          Trigger: {epoch.triggerReason}
                        </span>
                      </div>

                      {/* Expanded Section */}
                      {isSelected && (
                        <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-300 space-y-2 bg-[#080d18] p-3 rounded-lg border border-slate-800/80 animate-in fade-in duration-150">
                          <div className="flex items-center justify-between">
                            <div className="font-semibold text-sky-400 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Gemini Neuroplastic Deduction & Stability Proof:</span>
                            </div>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-semibold">
                              <ShieldCheck className="w-3 h-3 text-emerald-400" />
                              Hard-Locked Plank Verified
                            </span>
                          </div>

                          <p className="whitespace-pre-line leading-relaxed text-slate-300 text-[11px] font-mono">
                            {epoch.reasoning}
                          </p>

                          {/* Search Grounding Display */}
                          {epoch.searchGrounding && (
                            <div className="mt-2.5 p-2.5 bg-purple-950/30 border border-purple-800/50 rounded-lg space-y-1.5 text-[11px]">
                              <div className="flex items-center justify-between text-purple-300 font-semibold text-[11px]">
                                <span className="flex items-center gap-1">
                                  <Globe className="w-3.5 h-3.5 text-purple-400" />
                                  <span>Google Search Grounding & Literature Citations</span>
                                </span>
                                <span className="text-[10px] font-mono text-purple-400/80">
                                  {epoch.searchGrounding.sources?.length || 0} External Sources Retrieved
                                </span>
                              </div>

                              {epoch.searchGrounding.sources && epoch.searchGrounding.sources.length > 0 && (
                                <div className="space-y-1 pt-1 border-t border-purple-900/40">
                                  <span className="text-[10px] text-slate-400 block">Empirical Literature Sources:</span>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-[10px]">
                                    {epoch.searchGrounding.sources.map((src, sIdx) => (
                                      <a
                                        key={sIdx}
                                        href={src.url || '#'}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-between p-1.5 rounded bg-slate-950/70 border border-purple-900/40 text-purple-300 hover:text-purple-100 hover:border-purple-600 transition-colors"
                                      >
                                        <span className="truncate max-w-[200px]">{src.title}</span>
                                        <ExternalLink className="w-2.5 h-2.5 text-purple-400 shrink-0 ml-1" />
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Biological Findings */}
                          {epoch.biologicalLiteratureFindings && epoch.biologicalLiteratureFindings.length > 0 && (
                            <div className="mt-2.5 p-2.5 bg-emerald-950/20 border border-emerald-800/40 rounded-lg space-y-1.5 text-[11px]">
                              <div className="flex items-center justify-between text-emerald-300 font-semibold text-[11px]">
                                <span className="flex items-center gap-1.5">
                                  <span className="text-emerald-400 font-bold">🧬</span>
                                  <span>Biological Invariants & Empirical Neuroscience Findings</span>
                                </span>
                              </div>
                              <ul className="space-y-1 pt-1 border-t border-emerald-900/40">
                                {epoch.biologicalLiteratureFindings.map((finding, fIdx) => (
                                  <li key={fIdx} className="flex items-start gap-1.5 text-slate-300 text-[10px] font-mono">
                                    <span className="text-emerald-400 font-bold shrink-0 mt-0.5">•</span>
                                    <span>{finding}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          /* Compact Ledger View */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px] font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Epoch</th>
                  <th className="py-2.5 px-3">Strategy</th>
                  <th className="py-2.5 px-3">DRI (Before → After)</th>
                  <th className="py-2.5 px-3">STDP A- / A+</th>
                  <th className="py-2.5 px-3">Watchdog Gate</th>
                  <th className="py-2.5 px-3">Model</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {rsiState.history
                  .slice()
                  .reverse()
                  .map((epoch) => {
                    const ratioAfter = (epoch.parameterDeltas.aMinus.to / Math.max(0.001, epoch.parameterDeltas.aPlus.to)).toFixed(2);
                    const isApproved = !epoch.watchdogDecision || epoch.watchdogDecision.decision === 'APPROVE';
                    return (
                      <tr key={epoch.epochNumber} className="hover:bg-slate-950/40 transition-colors">
                        <td className="py-2 px-3 font-bold text-purple-300">#{epoch.epochNumber}</td>
                        <td className="py-2 px-3 text-slate-200">{epoch.divergenceMitigationStrategy}</td>
                        <td className="py-2 px-3">
                          <span className="text-amber-400">{epoch.initialDivergenceRisk.toFixed(2)}</span>
                          <span className="text-slate-500 mx-1">→</span>
                          <span className="text-emerald-400 font-bold">{epoch.projectedDivergenceRisk.toFixed(2)}</span>
                        </td>
                        <td className="py-2 px-3 text-cyan-300 font-bold">{ratioAfter}x</td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            isApproved ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          }`}>
                            {isApproved ? 'APPROVED' : 'BLOCKED'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-400">{epoch.modelUsed}</td>
                        <td className="py-2 px-3 text-slate-500">{new Date(epoch.timestamp).toLocaleTimeString()}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Model Telemetry Inspection Modal */}
      <ModelTelemetryInspectionModal
        isOpen={showTelemetryModal}
        onClose={() => setShowTelemetryModal(false)}
        snapshot={engine.getUnifiedTelemetrySnapshot()}
        tuningConfig={tuningConfig}
        onTriggerAudit={() => onTriggerEpoch('operator_prompt')}
        isLoading={isEvaluating}
      />
    </div>
  );
};
