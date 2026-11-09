import React, { useState, useEffect, useRef } from 'react';
import {
  BookOpen,
  Search,
  ExternalLink,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Globe,
  Radio,
  FileText,
  Clock,
  ArrowRight,
  Cpu,
  Layers,
  Activity,
  Check,
} from 'lucide-react';
import {
  SynapticDriftGuardSnapshot,
  OnlineResearchResult,
  OnlineResearchStructuralParams,
  SNNTuningConfig,
} from '../types';
import { SNNEngine } from '../lib/snnEngine';

interface Props {
  engine: SNNEngine;
  snapshot: SynapticDriftGuardSnapshot;
  onCalibrationApplied?: (msg: string) => void;
  onStructuralParametersApplied?: (params: Partial<SNNTuningConfig>, justification: string) => void;
  onInformModelWithResearch?: (query: string, findings: string[]) => Promise<void>;
}

export const OnlineResearchAdapter: React.FC<Props> = ({
  engine,
  snapshot,
  onCalibrationApplied,
  onStructuralParametersApplied,
  onInformModelWithResearch,
}) => {
  const [query, setQuery] = useState<string>(
    'Homeostatic synaptic scaling & SNN stability in biological cortical networks'
  );
  const [isResearching, setIsResearching] = useState<boolean>(false);
  const [researchResult, setResearchResult] = useState<OnlineResearchResult | null>(null);
  const [researchError, setResearchError] = useState<string | null>(null);

  // Auto-fetch on divergence breach toggle
  const [autoFetchOnBreach, setAutoFetchOnBreach] = useState<boolean>(true);
  const [lastBreachQueryTime, setLastBreachQueryTime] = useState<number>(0);

  // Application & Model-Informing state
  const [appliedCalibration, setAppliedCalibration] = useState<boolean>(false);
  const [appliedStructural, setAppliedStructural] = useState<boolean>(false);
  const [isInformingModel, setIsInformingModel] = useState<boolean>(false);
  const [informedModelSuccess, setInformedModelSuccess] = useState<boolean>(false);
  const [statusNotification, setStatusNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const prevIsExceedingRef = useRef<boolean>(false);

  // Preset scientific topics specifically on homeostatic synaptic scaling and SNN stability
  const presetTopics = [
    'Homeostatic synaptic scaling & firing rate setpoints (Turrigiano 2008)',
    'SNN stability & critical branching ratio (Beggs & Plenz 2003)',
    'Second-order synaptic derivative control & corrective LTD injection in cortex',
    'Asymmetric STDP LTD dominance (A- / A+ >= 1.25) to arrest runaway drift',
    'BCM sliding modification threshold under high-frequency burst trains',
    'Runaway excitation mitigation in event-driven neuromorphic silicon (Loihi 2)',
  ];

  // Execute research query with Google Search grounding
  const handleExecuteResearch = async (
    customQuery?: string,
    isDivergenceBreach = false
  ) => {
    const q = (customQuery || query).trim();
    if (!q) return;

    setIsResearching(true);
    setResearchError(null);
    setAppliedCalibration(false);
    setAppliedStructural(false);
    setInformedModelSuccess(false);
    setStatusNotification(null);

    const divergenceContext = {
      isBreach: isDivergenceBreach || snapshot.isAnyClusterExceeding || snapshot.maxDriftVelocity > snapshot.velocityThreshold,
      clusterName: snapshot.fastestDriftingCluster || 'associative_core',
      driftVelocity: snapshot.maxDriftVelocity,
      secondOrderDerivative: snapshot.maxSecondDerivative,
      threshold: snapshot.velocityThreshold,
    };

    try {
      const res = await fetch('/api/adapters/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          focus: 'homeostatic_synaptic_scaling_and_snn_stability',
          divergenceContext,
        }),
      });

      if (!res.ok) {
        throw new Error(`Google Search grounding service returned HTTP ${res.status}`);
      }

      const data: OnlineResearchResult = await res.json();
      setResearchResult(data);
    } catch (err: any) {
      setResearchError(err?.message || 'Failed to retrieve grounded neuromorphic literature.');
    } finally {
      setIsResearching(false);
    }
  };

  // Watch for threshold breach and trigger auto-research if enabled
  useEffect(() => {
    const isBreach = snapshot.isAnyClusterExceeding || snapshot.maxDriftVelocity > snapshot.velocityThreshold;
    const now = Date.now();

    if (isBreach && !prevIsExceedingRef.current && autoFetchOnBreach && now - lastBreachQueryTime > 15000) {
      setLastBreachQueryTime(now);
      const breachQuery = `Real-time stabilization papers for synaptic cluster '${snapshot.fastestDriftingCluster}' with drift velocity ${snapshot.maxDriftVelocity.toFixed(3)} exceeding 0.15 threshold`;
      setQuery(breachQuery);
      handleExecuteResearch(breachQuery, true);
    }

    prevIsExceedingRef.current = isBreach;
  }, [snapshot.isAnyClusterExceeding, snapshot.maxDriftVelocity, snapshot.velocityThreshold, autoFetchOnBreach, lastBreachQueryTime, snapshot.fastestDriftingCluster]);

  // 1. Apply DriftGuard Calibration Parameters (Threshold, Window, LTD Multiplier)
  const handleApplyCalibration = () => {
    if (!researchResult || !researchResult.recommendedParameters) return;
    const { suggestedLTDMultiplier, recommendedDriftThreshold, homeostaticWindowMs } =
      researchResult.recommendedParameters;

    engine.driftGuard.calibrate({
      threshold: recommendedDriftThreshold || 0.15,
      windowMs: homeostaticWindowMs || 500,
      autoStabilization: true,
    });

    setAppliedCalibration(true);
    const msg = `Applied DriftGuard calibration: Threshold ${recommendedDriftThreshold ?? 0.15}, Window ${homeostaticWindowMs ?? 500}ms, LTD ${suggestedLTDMultiplier ?? 1.65}x`;
    if (onCalibrationApplied) onCalibrationApplied(msg);
    setStatusNotification({ message: msg, type: 'info' });
  };

  // 2. Apply Structural Hyperparameters to the SNN Processor Substrate
  const handleApplyStructuralParameters = () => {
    if (!researchResult || !researchResult.structuralParameters) return;
    const sp = researchResult.structuralParameters;

    const structuralConfig: Partial<SNNTuningConfig> = {
      aPlus: sp.aPlus,
      aMinus: sp.aMinus,
      learningRate: sp.learningRate,
      turnGain: sp.turnGain,
      proximityGain: sp.proximityGain,
      antiHebbianPenalty: sp.antiHebbianPenalty,
    };

    // Apply directly to running SNN engine
    engine.applyModelAdjustments(structuralConfig);

    // If drift parameters exist, also sync DriftGuard
    if (researchResult.recommendedParameters) {
      engine.driftGuard.calibrate({
        threshold: researchResult.recommendedParameters.recommendedDriftThreshold || 0.15,
        windowMs: researchResult.recommendedParameters.homeostaticWindowMs || 500,
        autoStabilization: true,
      });
    }

    setAppliedStructural(true);
    setAppliedCalibration(true);

    const justification = sp.biologicalJustification || 'Biologically grounded structural tuning';
    if (onStructuralParametersApplied) {
      onStructuralParametersApplied(structuralConfig, justification);
    }
    if (onCalibrationApplied) {
      onCalibrationApplied(`⚡ Applied Structural SNN Parameters: A+=${sp.aPlus}, A-=${sp.aMinus} (LTD/LTP ${(sp.aMinus / sp.aPlus).toFixed(2)}x), LR=${sp.learningRate}, TurnGain=${sp.turnGain}x, AntiHebbian=${sp.antiHebbianPenalty}`);
    }

    setStatusNotification({
      message: `Structural parameters committed to SNN processor: A+=${sp.aPlus}, A-=${sp.aMinus}, LR=${sp.learningRate}, Turn=${sp.turnGain}x`,
      type: 'success',
    });
  };

  // 3. Present Findings to SNN Model & Trigger Recursive Self-Improvement Evaluation
  const handleInformModelWithResearch = async () => {
    if (!researchResult) return;
    setIsInformingModel(true);
    setStatusNotification(null);

    try {
      const q = researchResult.query;
      const findings = researchResult.keyFindings || [];

      // Trigger evaluation on the server so the model evaluates and commits epoch to RSI ledger
      const res = await fetch('/api/self-improvement/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unifiedTelemetry: engine.getUnifiedTelemetrySnapshot(),
          telemetry: engine.getTelemetry(),
          currentTuning: engine.getTuningConfig(),
          triggerReason: 'online_research_adapter',
          researchQuery: q,
        }),
      });

      if (!res.ok) {
        throw new Error(`RSI evaluation returned HTTP ${res.status}`);
      }

      const rsiData = await res.json();

      // If recommended parameters returned, apply them
      if (rsiData.recommendedParameters) {
        engine.applyModelAdjustments(rsiData.recommendedParameters);
        if (onStructuralParametersApplied) {
          onStructuralParametersApplied(rsiData.recommendedParameters, rsiData.strategy || 'Autonomous grounded update');
        }
      }

      setInformedModelSuccess(true);
      setAppliedStructural(true);

      if (onInformModelWithResearch) {
        await onInformModelWithResearch(q, findings);
      }

      setStatusNotification({
        message: `Model successfully informed! Empirical findings on "${q}" synthesized into RSI Epoch #${rsiData.epoch?.epochNumber || 'N'} and committed to neuromorphic processor.`,
        type: 'success',
      });
    } catch (err: any) {
      setStatusNotification({
        message: `Failed to inform model: ${err?.message || 'Network error'}`,
        type: 'error',
      });
    } finally {
      setIsInformingModel(false);
    }
  };

  const isDivergenceBreached =
    snapshot.isAnyClusterExceeding || snapshot.maxDriftVelocity > snapshot.velocityThreshold;

  const sp = researchResult?.structuralParameters;
  const ltdRatio = sp ? (sp.aMinus / Math.max(0.001, sp.aPlus)).toFixed(2) : '1.63';

  return (
    <div className="space-y-6">
      {/* 1. Threshold Breach Alert & Auto-Trigger Banner */}
      {isDivergenceBreached && (
        <div className="bg-gradient-to-r from-rose-950/80 via-amber-950/40 to-slate-900 border-2 border-rose-500/60 rounded-2xl p-5 shadow-2xl shadow-rose-950/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/30 border border-rose-400 text-rose-300">
              <ShieldAlert className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-rose-500 text-white uppercase tracking-wider">
                  Divergence Threshold Breached
                </span>
                <span className="text-xs font-mono text-rose-300">
                  Cluster: <strong className="text-white">{snapshot.fastestDriftingCluster}</strong>
                </span>
                <span className="text-xs font-mono text-rose-300">
                  Velocity: <strong className="text-white">{snapshot.maxDriftVelocity.toFixed(3)}</strong> / s (&gt; {snapshot.velocityThreshold})
                </span>
              </div>
              <p className="text-xs text-rose-200 mt-1">
                Second-order synaptic drift acceleration (d²w/dt²: {snapshot.maxSecondDerivative.toFixed(3)}/s²) detected runaway potentiation.
                OnlineResearchAdapter is actively searching Google for real-time stabilization papers.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                const breachQuery = `Real-time stabilization papers for synaptic cluster '${snapshot.fastestDriftingCluster}' with drift velocity ${snapshot.maxDriftVelocity.toFixed(3)} exceeding 0.15 threshold`;
                setQuery(breachQuery);
                handleExecuteResearch(breachQuery, true);
              }}
              disabled={isResearching}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-2 shadow-lg shadow-rose-600/40 transition-all disabled:opacity-50"
            >
              {isResearching ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>Fetch Stability Papers Now</span>
            </button>
          </div>
        </div>
      )}

      {/* Status Notification Banner */}
      {statusNotification && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs font-mono ${
            statusNotification.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
              : statusNotification.type === 'error'
              ? 'bg-rose-950/40 border-rose-500/50 text-rose-300'
              : 'bg-sky-950/40 border-sky-500/50 text-sky-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusNotification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : statusNotification.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <Zap className="w-4 h-4 text-sky-400 shrink-0" />
            )}
            <span>{statusNotification.message}</span>
          </div>
          <button
            onClick={() => setStatusNotification(null)}
            className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2. Main Research Adapter Workspace Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-300">
                <BookOpen className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>OnlineResearchAdapter</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Homeostatic Synaptic Scaling & SNN Stability
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Queries Google Search for recent peer-reviewed scientific literature and neuromorphic stability research to inform future structural parameter updates.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Auto-Fetch Toggle */}
            <button
              onClick={() => setAutoFetchOnBreach(!autoFetchOnBreach)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                autoFetchOnBreach
                  ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title="Automatically queries Google Search for papers when a cluster exceeds 0.15 drift velocity"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Auto-Fetch on Breach: {autoFetchOnBreach ? 'ENABLED' : 'PAUSED'}</span>
            </button>

            <span className="px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5">
              <Globe className="w-3 h-3 text-indigo-400" />
              <span>Google Search Grounded</span>
            </span>
          </div>
        </div>

        {/* Preset Scientific Research Topics */}
        <div>
          <div className="text-xs font-semibold text-slate-400 mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span>Empirical Homeostatic Scaling & SNN Stability Topics:</span>
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Click topic to query Google Search</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {presetTopics.map((topic, i) => (
              <button
                key={i}
                onClick={() => {
                  setQuery(topic);
                  handleExecuteResearch(topic);
                }}
                className={`p-2.5 rounded-xl text-xs border transition-all text-left flex items-start gap-2 ${
                  query === topic
                    ? 'bg-indigo-950/60 border-indigo-500/60 text-indigo-200 font-medium shadow-md shadow-indigo-950/40'
                    : 'bg-slate-950/80 hover:bg-slate-800/80 text-slate-300 border-slate-800 hover:border-indigo-500/40'
                }`}
              >
                <span className="text-indigo-400 font-bold shrink-0 mt-0.5">•</span>
                <span className="line-clamp-2 leading-relaxed">{topic}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Search Input Bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Query scientific literature on homeostatic synaptic scaling, SNN stability, or LTD dominance..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 pr-10 font-mono"
              onKeyDown={(e) => e.key === 'Enter' && handleExecuteResearch()}
            />
            <Search className="w-4 h-4 text-slate-500 absolute right-3.5 top-3 pointer-events-none" />
          </div>
          <button
            onClick={() => handleExecuteResearch()}
            disabled={isResearching}
            className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white flex items-center gap-2 transition-all shadow-md shadow-indigo-900/30 disabled:opacity-50 shrink-0"
          >
            {isResearching ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Searching Papers...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Fetch Scientific Papers</span>
              </>
            )}
          </button>
        </div>

        {researchError && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
            {researchError}
          </div>
        )}

        {/* 3. Real-Time Grounded Papers, Scientific Synthesis & Structural Recommendations */}
        {researchResult && (
          <div className="space-y-6 pt-4 border-t border-slate-800 animate-in fade-in duration-300">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-300 font-mono flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Scientific Synthesis & Empirical Grounding ({new Date(researchResult.timestamp).toLocaleTimeString()})</span>
                </span>
                {researchResult.isAutoTriggered && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    Breach Auto-Query: {researchResult.breachedClusterName}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Model: <span className="text-purple-300">{researchResult.model}</span> • Tool: <span className="text-sky-300">{researchResult.toolUsed}</span>
              </span>
            </div>

            {/* Synthesis Body */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-200 leading-relaxed whitespace-pre-line font-sans shadow-inner">
              {researchResult.summary}
            </div>

            {/* Key Findings List */}
            {researchResult.keyFindings && researchResult.keyFindings.length > 0 && (
              <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2">
                <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5 font-mono">
                  <Activity className="w-3.5 h-3.5 text-sky-400" />
                  <span>Key Biological & Architectural Invariants Identified:</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono">
                  {researchResult.keyFindings.map((finding, idx) => (
                    <div key={idx} className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 flex items-start gap-2 text-slate-300">
                      <span className="text-sky-400 font-bold shrink-0 mt-0.5">•</span>
                      <span>{finding}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. STRUCTURAL SNN PROCESSOR PARAMETER UPDATES (Informed by Biological Research) */}
            {sp && (
              <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900 to-purple-950/30 border-2 border-indigo-500/50 rounded-2xl p-5 shadow-2xl space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-indigo-900/50">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-300">
                      <Cpu className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>Structural SNN Parameter Updates for Neuromorphic Processor</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold">
                          Biologically Grounded
                        </span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Parameters structured from literature on homeostatic scaling (Turrigiano) and critical branching (Beggs &amp; Plenz).
                      </p>
                    </div>
                  </div>

                  {/* Dual Action Execution Buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={handleApplyStructuralParameters}
                      disabled={appliedStructural}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shrink-0 ${
                        appliedStructural
                          ? 'bg-emerald-600/30 border border-emerald-500/50 text-emerald-200'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40 active:scale-[0.98]'
                      }`}
                      title="Apply recommended structural parameters directly to the running neuromorphic processor substrate"
                    >
                      {appliedStructural ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Structural Update Applied</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5 text-emerald-300" />
                          <span>Apply to SNN Processor</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleInformModelWithResearch}
                      disabled={isInformingModel || informedModelSuccess}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shrink-0 ${
                        informedModelSuccess
                          ? 'bg-purple-600/30 border border-purple-500/50 text-purple-200'
                          : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-900/40 active:scale-[0.98]'
                      }`}
                      title="Feed this empirical research to the Gemini RSI engine to evaluate and structure future self-improvements"
                    >
                      {isInformingModel ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Informing Model...</span>
                        </>
                      ) : informedModelSuccess ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-purple-300" />
                          <span>Model Informed (RSI Synced)</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                          <span>Present to SNN Model (RSI)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Structural Parameters Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 font-mono text-xs">
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                    <span className="text-[10px] text-slate-400 block">STDP LTP A+</span>
                    <span className="text-base font-bold text-purple-300">{sp.aPlus.toFixed(3)}</span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">Potentiation</span>
                  </div>

                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                    <span className="text-[10px] text-slate-400 block">STDP LTD A-</span>
                    <span className="text-base font-bold text-emerald-400">{sp.aMinus.toFixed(3)}</span>
                    <span className="text-[9px] text-emerald-400 font-semibold block mt-0.5">Ratio {ltdRatio}x</span>
                  </div>

                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                    <span className="text-[10px] text-slate-400 block">Learning Rate η</span>
                    <span className="text-base font-bold text-sky-300">{sp.learningRate.toFixed(2)}</span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">Dampened</span>
                  </div>

                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                    <span className="text-[10px] text-slate-400 block">Turn Gain</span>
                    <span className="text-base font-bold text-amber-300">{sp.turnGain.toFixed(2)}x</span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">Associative</span>
                  </div>

                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                    <span className="text-[10px] text-slate-400 block">Proximity Gain</span>
                    <span className="text-base font-bold text-pink-300">{sp.proximityGain.toFixed(2)}x</span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">Afferent</span>
                  </div>

                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                    <span className="text-[10px] text-slate-400 block">Anti-Hebbian</span>
                    <span className="text-base font-bold text-rose-300">{sp.antiHebbianPenalty.toFixed(2)}</span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">Cross-Talk Shunt</span>
                  </div>

                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                    <span className="text-[10px] text-slate-400 block">Target Rate</span>
                    <span className="text-base font-bold text-cyan-300">{sp.targetFiringRateHz || 28} Hz</span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">Homeostatic</span>
                  </div>
                </div>

                {/* Biological Justification Box */}
                <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl text-xs text-slate-300 flex items-start gap-2.5">
                  <div className="p-1 rounded bg-indigo-500/20 text-indigo-400 mt-0.5">
                    <Globe className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-indigo-300 block text-[11px] font-mono">
                      Biological Justification & Research Invariant:
                    </span>
                    <p className="text-slate-300 text-[11px] font-sans mt-0.5 leading-relaxed">
                      {sp.biologicalJustification || 'Homeostatic synaptic scaling bounds collective firing rate while asymmetric STDP LTD dominance (A- / A+ >= 1.25) arrests runaway weight drift.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 5. Recommended DriftGuard Calibration Card */}
            {researchResult.recommendedParameters && (
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-bold text-amber-300 font-mono">
                      SynapticDriftGuard Velocity & Sliding Window Calibrations:
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Suggested LTD Multiplier:</span>
                      <span className="text-white font-bold text-sm">
                        {researchResult.recommendedParameters.suggestedLTDMultiplier}x
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Drift Velocity Threshold:</span>
                      <span className="text-white font-bold text-sm">
                        {researchResult.recommendedParameters.recommendedDriftThreshold} / s
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Homeostatic Sliding Window:</span>
                      <span className="text-white font-bold text-sm">
                        {researchResult.recommendedParameters.homeostaticWindowMs}ms
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Damping Curve:</span>
                      <span className="text-white font-bold text-sm truncate block">
                        {researchResult.recommendedParameters.dampingCurve || 'quadratic_weighted'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleApplyCalibration}
                  disabled={appliedCalibration}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shrink-0 ${
                    appliedCalibration
                      ? 'bg-amber-600/30 border border-amber-500/50 text-amber-200 cursor-default'
                      : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/30 active:scale-[0.98]'
                  }`}
                >
                  {appliedCalibration ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-amber-400" />
                      <span>DriftGuard Calibrated</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      <span>Calibrate DriftGuard</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* 6. Grounded Real-Time Paper Citations & External Links */}
            {researchResult.sources && researchResult.sources.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-sky-400" />
                    <span>Real-Time Grounded Papers & Scientific Citations ({researchResult.sources.length}):</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">Retrieved via Google Search Grounding</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {researchResult.sources.map((src, idx) => (
                    <a
                      key={idx}
                      href={src.uri}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-start justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-indigo-500/60 hover:bg-slate-900/80 text-xs text-slate-300 hover:text-white transition-all group shadow-sm"
                    >
                      <div className="pr-2 space-y-1">
                        <div className="font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors line-clamp-2">
                          {src.title}
                        </div>
                        {src.snippet && (
                          <p className="text-[11px] text-slate-400 line-clamp-2 font-mono">{src.snippet}</p>
                        )}
                        <span className="text-[10px] text-slate-500 font-mono truncate block max-w-xs">
                          {src.uri}
                        </span>
                      </div>
                      <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 shrink-0 mt-0.5" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
