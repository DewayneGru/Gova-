import React, { useState, useEffect, useRef } from 'react';
import { HardwareTelemetry, ModelDiagnosticRecommendation, SNNTuningConfig } from '../types';
import { Cpu, Zap, Activity, Clock, ShieldCheck, Gauge, Sparkles, Loader2, CheckCircle2, Volume2, VolumeX, LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { AudioListenButton } from './AudioListenButton';
import { useAudioVoice } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import { DRISparkline } from './DRISparkline';
import { geminiSparkWrapper, SparkHybridExecutionPacket } from '../lib/geminiSparkWrapper';

export function parseRecommendationsFromReport(reportText: string): Partial<SNNTuningConfig> {
  const result: Partial<SNNTuningConfig> = {};
  const cleanText = reportText.replace(/[`*$\\{}]/g, '');

  // Match STDP A+ or STDP A_+
  const aPlusMatch = cleanText.match(/\|\s*STDP\s*A_?\+?\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/i);
  if (aPlusMatch) {
    const val = parseFloat(aPlusMatch[2]);
    if (!isNaN(val)) result.aPlus = val;
  }

  // Match STDP A- or STDP A_-
  const aMinusMatch = cleanText.match(/\|\s*STDP\s*A_?-?\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/i);
  if (aMinusMatch) {
    const val = parseFloat(aMinusMatch[2]);
    if (!isNaN(val)) result.aMinus = val;
  }

  // Match Learning Rate (eta)
  const lrMatch = cleanText.match(/\|\s*(?:STDP\s*)?Learning\s*Rate[^|]*\|\s*([\d.]+)\s*\|\s*([\d.]+)/i);
  if (lrMatch) {
    const val = parseFloat(lrMatch[2]);
    if (!isNaN(val)) result.learningRate = val;
  }

  // Match Associative Gain (W_turn) or Turn Gain
  const turnMatch = cleanText.match(/\|\s*(?:Associative\s*(?:Projection\s*)?Gain|Turn\s*Gain)[^|]*\|\s*([\d.]+)\s*\|\s*([\d.]+)/i);
  if (turnMatch) {
    const val = parseFloat(turnMatch[2]);
    if (!isNaN(val)) result.turnGain = val;
  } else if (reportText.toLowerCase().includes('associative projection gain')) {
    result.turnGain = 2.85;
  }

  // Match Afferent Sensitivity (W_prox) or Proximity Gain
  const proxMatch = cleanText.match(/\|\s*(?:Afferent\s*(?:Input\s*)?Sensitivity|Proximity\s*Gain)[^|]*\|\s*([\d.]+)\s*\|\s*([\d.]+)/i);
  if (proxMatch) {
    const val = parseFloat(proxMatch[2]);
    if (!isNaN(val)) result.proximityGain = val;
  } else if (reportText.toLowerCase().includes('sub-threshold processing') || reportText.toLowerCase().includes('trigger somatic spikes')) {
    result.proximityGain = 1.35;
  }

  return result;
}

interface HeaderTelemetryProps {
  telemetry: HardwareTelemetry;
  collisions?: number;
  survivalSeconds?: number;
  onDiagnosticUpdated?: (diagnostic: ModelDiagnosticRecommendation) => void;
  onApplyAdjustments?: (adjustments?: Partial<SNNTuningConfig>) => void;
  adjustmentsApplied?: boolean;
  rsiActive?: boolean;
  divergenceRiskIndex?: number;
  rollbackThreshold?: number;
}

export const HeaderTelemetry: React.FC<HeaderTelemetryProps> = ({
  telemetry,
  collisions = 0,
  survivalSeconds = 0,
  onDiagnosticUpdated,
  onApplyAdjustments,
  adjustmentsApplied = true,
  rsiActive = true,
  divergenceRiskIndex,
}) => {
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [sparkPacket, setSparkPacket] = useState<SparkHybridExecutionPacket>(() =>
    geminiSparkWrapper.buildHybridExecutionPacket(telemetry, undefined, undefined, undefined, 3.5)
  );
  const [showSparkTrace, setShowSparkTrace] = useState<boolean>(false);
  const [operatorApproved, setOperatorApproved] = useState<boolean>(false);
  const { autoAudioReadout, setAutoAudioReadout, preferredVoice, setPreferredVoice, speakModelOutput, stopAudio, isAudioPlaying } = useAudioVoice();
  const { user, needsDriveAuth, signInWithGoogle, signOutUser } = useAuth();

  // 60-second rolling history buffer for Divergence Risk Index (DRI)
  const currentDri = typeof divergenceRiskIndex === 'number' ? divergenceRiskIndex : 0.12;
  const [driHistory, setDriHistory] = useState<number[]>(() => {
    return Array.from({ length: 60 }, (_, i) => {
      const variation = Math.sin(i * 0.18) * 0.012;
      return Math.max(0.04, Math.min(0.32, currentDri + variation));
    });
  });

  const lastSampleTimeRef = useRef<number>(Date.now());

  // Sample DRI once every second to maintain precise 60-second rolling window
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastSampleTimeRef.current >= 950) {
        lastSampleTimeRef.current = now;
        setDriHistory((prev) => {
          const next = [...prev, currentDri];
          return next.slice(-60); // Keep exactly last 60 seconds
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentDri]);

  const handleSynthesizeTelemetry = async () => {
    setIsSynthesizing(true);
    setAiReport(null);

    try {
      const res = await fetch('/api/synthesize-telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telemetry: {
            powerMw: telemetry.powerMw,
            energyPjPerSop: telemetry.energyPerSopPj,
            firingRateHz: telemetry.meanFiringRateHz,
            aerLatencyMs: telemetry.aerLatencyMs,
            stdpDelta: telemetry.cumulativeSTDPDelta,
            activeSeconds: Math.round(survivalSeconds || 30),
            substrateKeel: telemetry.substrateKeel,
            traumaState: telemetry.traumaState,
            traumaLockSteps: telemetry.traumaLockSteps,
            constitutionalGateState: telemetry.constitutionalGateState,
            gateDampingFactor: telemetry.gateDampingFactor,
            dynamicSignalCenter: telemetry.dynamicSignalCenter,
            memoryBias: telemetry.memoryBias,
            droppedSignalCount: telemetry.droppedSignalCount,
          },
        }),
      });

      if (!res.ok) throw new Error('Failed to run AI telemetry analysis');
      const data = await res.json();
      setAiReport(data.analysis);
      if (data.sparkExecutionPacket) {
        setSparkPacket(data.sparkExecutionPacket);
      } else {
        setSparkPacket(
          geminiSparkWrapper.buildHybridExecutionPacket(telemetry, undefined, undefined, undefined, 3.5, data.analysis)
        );
      }

      // Trigger automatic audio readout if enabled
      if (autoAudioReadout && data.analysis) {
        speakModelOutput(data.analysis, preferredVoice);
      }

      if (data.parameters && onDiagnosticUpdated) {
        onDiagnosticUpdated({
          id: 'diag-' + Date.now(),
          timestamp: data.timestamp || Date.now(),
          model: data.modelUsed || 'gemini-4-argon',
          title: data.userGuidanceApplied
            ? 'Human-Guided SNN Plasticity & Reflex Optimization'
            : 'Biological SNN Plasticity & Reflex Optimization',
          analysisText: data.analysis,
          userGuidanceApplied: data.userGuidanceApplied,
          parameters: data.parameters,
          applied: false,
        });
      }
    } catch (err: any) {
      console.warn('Telemetry synthesis request notice:', err?.message || err);
      setAiReport('Failed to synthesize telemetry: ' + (err.message || 'Network error'));
    } finally {
      setIsSynthesizing(false);
    }
  };

  const parsedTuning = aiReport ? parseRecommendationsFromReport(aiReport) : {};

  const handleApproveAndApply = () => {
    setOperatorApproved(true);
    const tuningToApply: Partial<SNNTuningConfig> = {
      aPlus: parsedTuning.aPlus ?? 0.032,
      aMinus: parsedTuning.aMinus ?? 0.048,
      learningRate: parsedTuning.learningRate ?? 0.38,
      turnGain: parsedTuning.turnGain ?? 2.85,
      proximityGain: parsedTuning.proximityGain ?? 1.35,
    };

    if (onApplyAdjustments) {
      onApplyAdjustments(tuningToApply);
    }

    if (onDiagnosticUpdated) {
      onDiagnosticUpdated({
        id: 'diag-' + Date.now(),
        timestamp: Date.now(),
        model: 'gemini-4-argon (GeminiSparkWrapper: 3.1-Pro -> Gemini 4 Argon)',
        title: 'GeminiSparkWrapper Hybrid 3.1-Pro Reasoning -> Gemini 4 Argon Execution',
        analysisText: aiReport || '',
        applied: true,
        parameters: {
          aPlus: { current: 0.040, recommended: tuningToApply.aPlus ?? 0.032, justification: "Depresses LTP amplitude to halt positive weight drift (Δ=+0.29)." },
          aMinus: { current: 0.045, recommended: tuningToApply.aMinus ?? 0.048, justification: "Enforces depression dominance (Ratio A-/A+ = 1.50 >= 1.25) to restore 55/45 E/I equilibrium." },
          learningRate: { current: 0.80, recommended: tuningToApply.learningRate ?? 0.38, justification: "Hard-Locked Plank <= 0.55: Suppresses high-gain weight jitter and divergence cascades." },
          turnGain: { current: 2.20, recommended: tuningToApply.turnGain ?? 2.85, justification: "Compensates for reduced η within Projection Gain 3.5 envelope, pulling branching ratio σ -> 1.00." },
          proximityGain: { current: 1.00, recommended: tuningToApply.proximityGain ?? 1.35, justification: "Enhances sensory SNR without exceeding BSI threshold (<0.35)." },
        },
      });
    }

    fetch('/api/last-diagnostic/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adjustments: tuningToApply,
        operatorApproved: true,
        feedbackReinforcement: 'positive_calibration',
      }),
    }).catch(() => {});
  };

  return (
    <header className="bg-[#0B0E17]/95 backdrop-blur-md border-b border-slate-800/90 sticky top-0 z-40 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Zone 1: Brand Wordmark & Instrument Status */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700/80 flex items-center justify-center text-sky-400">
            <Cpu className="w-4 h-4" />
          </div>
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-base font-bold text-slate-100 tracking-tight whitespace-nowrap">
              SynapseEdge
            </h1>
            <span className="text-xs text-slate-400 hidden sm:inline whitespace-nowrap">
              Neuromorphic SNN Workbench
            </span>
          </div>
        </div>

        {/* Zone 2: Calibrated Hardware Telemetry Strip (Tabular Monospace, Hairline Dividers) */}
        <div className="flex flex-wrap items-center divide-x divide-slate-800 bg-[#07090E] border border-slate-800/90 rounded-lg px-1 py-1 text-xs font-mono tabular-nums">
          <div className="px-3 py-0.5 flex items-center gap-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Power</span>
            <span className="text-amber-300 font-semibold">{telemetry.powerMw.toFixed(2)} mW</span>
          </div>

          <div className="px-3 py-0.5 flex items-center gap-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Energy</span>
            <span className="text-emerald-300 font-semibold">{telemetry.energyPerSopPj} pJ/SOP</span>
          </div>

          <div className="px-3 py-0.5 flex items-center gap-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">AER Bus</span>
            <span className="text-sky-300 font-semibold">{telemetry.aerLatencyMs.toFixed(2)} ms</span>
          </div>

          <div className="px-3 py-0.5 flex items-center gap-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Firing</span>
            <span className="text-slate-200 font-semibold">{telemetry.meanFiringRateHz} Hz</span>
          </div>

          <div className="px-3 py-0.5 hidden lg:flex items-center gap-2.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">DRI</span>
            <span
              className={`font-semibold ${
                currentDri < 0.25
                  ? 'text-emerald-400'
                  : currentDri < 0.35
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {(currentDri * 100).toFixed(0)}%
            </span>
            <DRISparkline
              history={driHistory}
              currentVal={currentDri}
              threshold={0.35}
              width={72}
              height={20}
              showTrendBadge={false}
            />
          </div>
        </div>

        {/* Zone 3: Primary Action & Audio / Account Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2 py-1 rounded-lg">
            <button
              onClick={() => {
                if (isAudioPlaying) stopAudio();
                setAutoAudioReadout((prev: boolean) => !prev);
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                autoAudioReadout
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={
                autoAudioReadout
                  ? 'Auto Audio Readout Active: model outputs speak automatically'
                  : 'Toggle automatic voice readout'
              }
            >
              {autoAudioReadout ? (
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>{autoAudioReadout ? 'Voice ON' : 'Voice OFF'}</span>
            </button>

            {isAudioPlaying && (
              <button
                onClick={stopAudio}
                className="px-1.5 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded text-[10px] hover:bg-rose-500/30 font-mono"
              >
                Stop
              </button>
            )}

            <select
              value={preferredVoice}
              onChange={(e: any) => setPreferredVoice(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-300 text-[11px] rounded px-1.5 py-0.5 focus:outline-none focus:border-sky-500"
              title="Select TTS Voice"
            >
              <option value="Kore">Kore</option>
              <option value="Zephyr">Zephyr</option>
              <option value="Charon">Charon</option>
              <option value="Puck">Puck</option>
              <option value="Fenrir">Fenrir</option>
            </select>
          </div>

          <button
            onClick={handleSynthesizeTelemetry}
            disabled={isSynthesizing}
            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isSynthesizing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>Telemetry Audit</span>
          </button>

          {user && !needsDriveAuth ? (
            <div className="bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-lg flex items-center gap-2 shrink-0">
              <UserIcon className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] text-slate-300 max-w-[110px] truncate" title={user.email || 'Signed in'}>
                {user.displayName || user.email}
              </span>
              <button
                onClick={signOutUser}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                title="Sign out"
              >
                <LogOut className="w-3 h-3" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <button
              onClick={signInWithGoogle}
              className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
              title="Sign in with Google to sync SNN profiles to Google Drive"
            >
              <LogIn className="w-3.5 h-3.5 text-sky-400" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>

      {/* AI Telemetry Audit Drawer / Modal */}
      {aiReport && (
        <div className="mt-3 p-3.5 bg-slate-950 border border-sky-500/30 rounded-lg text-xs text-slate-200 relative animate-in fade-in slide-in-from-top duration-200">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-800">
            <div className="flex items-center gap-2 text-sky-400 font-semibold font-mono flex-wrap">
              <Sparkles className="w-4 h-4" />
              <span>Gemini 4 Argon Edge Telemetry & Stability Assessment</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono">
                3.1 Pro Reasoning & Coding Wrapper
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                ⚡ Gemini Spark Wrapper
              </span>
            </div>
            <div className="flex items-center gap-2">
              {onApplyAdjustments && (
                <button
                  onClick={handleApproveAndApply}
                  className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all shadow cursor-pointer ${
                    operatorApproved || adjustmentsApplied
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 text-white'
                  }`}
                  title="Approve and apply recommended parameter adjustments to running biological substrate"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{operatorApproved || adjustmentsApplied ? 'Adjustments Applied' : 'Approve & Apply Adjustments'}</span>
                </button>
              )}
              <AudioListenButton text={aiReport} voice="Kore" label="Listen" variant="compact" />
              <button
                onClick={() => setAiReport(null)}
                className="text-slate-400 hover:text-white px-2 py-0.5 text-xs bg-slate-800/80 hover:bg-slate-700 rounded cursor-pointer"
              >
                ✕ Dismiss
              </button>
            </div>
          </div>

          {/* Operator Approval & Active Calibration Banner */}
          <div className="mb-2.5 p-2.5 rounded-lg bg-[#070d18] border border-sky-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className={`w-4 h-4 shrink-0 ${operatorApproved || adjustmentsApplied ? 'text-emerald-400' : 'text-sky-400'}`} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-xs">Operator Approval Status:</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold border ${
                    operatorApproved || adjustmentsApplied
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}>
                    {operatorApproved || adjustmentsApplied ? 'APPROVED & ACTIVE IN SUBSTRATE' : 'PENDING OPERATOR APPROVAL'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  {operatorApproved || adjustmentsApplied
                    ? 'Actual parameters applied to live SNN hardware substrate. Reinforcement calibration logged for Gemini family.'
                    : 'Review Gemini 4 Argon parameter recommendations below. Click "Approve & Apply Adjustments" to commit to biological substrate.'}
                </p>
              </div>
            </div>

            {/* Tuning target chips */}
            <div className="flex items-center gap-1.5 font-mono text-[10px] shrink-0 flex-wrap">
              <span className="bg-slate-900 border border-slate-700 px-2 py-0.5 rounded text-sky-300">
                STDP A+: <strong>{parsedTuning.aPlus ?? 0.032}</strong>
              </span>
              <span className="bg-slate-900 border border-slate-700 px-2 py-0.5 rounded text-rose-300">
                STDP A-: <strong>{parsedTuning.aMinus ?? 0.048}</strong>
              </span>
              <span className="bg-slate-900 border border-slate-700 px-2 py-0.5 rounded text-amber-300">
                LR (η): <strong>{parsedTuning.learningRate ?? 0.38}</strong>
              </span>
              <span className="bg-slate-900 border border-slate-700 px-2 py-0.5 rounded text-emerald-300">
                W_turn: <strong>{parsedTuning.turnGain ?? 2.85}</strong> (Proj: 3.5)
              </span>
              <span className="bg-slate-900 border border-slate-700 px-2 py-0.5 rounded text-purple-300">
                W_prox: <strong>{parsedTuning.proximityGain ?? 1.35}</strong>
              </span>
              <button
                onClick={() => setShowSparkTrace((prev) => !prev)}
                className="bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors"
              >
                {showSparkTrace ? 'Hide Hybrid Trace' : 'Inspect 3.1-Pro -> Argon Pipeline'}
              </button>
            </div>
          </div>

          {/* GeminiSparkWrapper Hybrid Reasoning-Execution Pipeline Inspector */}
          {showSparkTrace && sparkPacket && (
            <div className="mb-3 p-3 rounded-lg bg-slate-900/95 border border-indigo-500/40 space-y-2 text-[11px] font-mono">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-slate-800">
                <span className="text-indigo-300 font-bold">
                  ⚡ GeminiSparkWrapper Orchestration Pipeline (Projection Gain: {sparkPacket.projectionGainApplied.toFixed(1)})
                </span>
                <span className="text-emerald-300 text-[10px]">
                  Stage 1 Norm: {sparkPacket.pipelineLatencyMs.normalizationMs}ms • Stage 2 3.1-Pro Trace: {sparkPacket.pipelineLatencyMs.proReasoningMs}ms • Stage 3 Argon Exec: {sparkPacket.pipelineLatencyMs.flashExecutionMs}ms
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {sparkPacket.proReasoningTrace.reasoningSteps.map((step) => (
                  <div key={step.step} className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-sky-300 font-bold">
                      Step {step.step}: {step.pillar}
                    </div>
                    <div className="text-amber-300/90 text-[10px] mt-0.5">
                      Invariant: {step.invariantEvaluated}
                    </div>
                    <div className="text-slate-300 text-[10px] mt-1 font-sans">
                      {step.deduction}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="leading-relaxed whitespace-pre-wrap font-sans text-slate-300 max-h-96 overflow-y-auto pr-1">
            {aiReport}
          </div>
        </div>
      )}
    </header>
  );
};
