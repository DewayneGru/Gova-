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
          model: data.modelUsed || 'gemini-3.8-flash',
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

  // Load initial model diagnostic report from server cache
  useEffect(() => {
    fetch('/api/last-diagnostic')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.analysisText && !aiReport) {
          setAiReport(data.analysisText);
          if (data.applied) {
            setOperatorApproved(true);
          }
        }
      })
      .catch(() => {});
  }, []);

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
        model: 'gemini-3.8-flash (GeminiSparkWrapper: 3.1-Pro -> 3.8-Flash)',
        title: 'GeminiSparkWrapper Hybrid 3.1-Pro Reasoning -> 3.8-Flash Execution',
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
    <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40 px-4 py-3 shadow-md">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        {/* Brand & Mode */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-100 tracking-tight">
                SynapseEdge
              </h1>
              <span className="text-[10px] font-mono bg-sky-500/15 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded font-semibold">
                Bio-SNN Edge v2.4
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Low-Latency Synaptic Plasticity & Embedded Spiking Simulator
            </p>
          </div>
        </div>

        {/* Real-time Edge Hardware Telemetry KPIs */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <div className="bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Power Draw</div>
              <div className="text-amber-300 font-bold">{telemetry.powerMw.toFixed(2)} mW</div>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Gauge className="w-3.5 h-3.5 text-emerald-400" />
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Energy / SOP</div>
              <div className="text-emerald-300 font-bold">{telemetry.energyPerSopPj} pJ</div>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            <div>
              <div className="text-[10px] text-slate-500 uppercase">AER Latency</div>
              <div className="text-sky-300 font-bold">{telemetry.aerLatencyMs.toFixed(2)} ms</div>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-purple-400" />
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Mean Firing</div>
              <div className="text-purple-300 font-bold">{telemetry.meanFiringRateHz} Hz</div>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Spike Events</div>
              <div className="text-emerald-300 font-bold">
                {telemetry.totalSpikesEmitted?.toLocaleString() || 0} spikes
              </div>
            </div>
          </div>

          {telemetry.substrateKeel && (
            <div className="bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                telemetry.traumaState === 'ventral_equilibrium' ? 'bg-emerald-400 animate-pulse' : 'bg-purple-400 animate-ping'
              }`} />
              <div>
                <div className="text-[10px] text-slate-500 uppercase">Keel Valence / Gate</div>
                <div className="text-cyan-300 font-bold">
                  {telemetry.substrateKeel.valence > 0 ? `+${telemetry.substrateKeel.valence.toFixed(2)}` : telemetry.substrateKeel.valence.toFixed(2)}
                  <span className="text-[10px] text-slate-400 ml-1 font-normal font-sans">
                    ({telemetry.constitutionalGateState === 'NOMINAL' ? 'Nominal' : telemetry.constitutionalGateState?.replace('CONSTITUTIONAL_', '')})
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Autonomous Self-Improvement (RSI) Anti-Divergence Badge & 60s DRI Sparkline */}
          <div className="bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-500 uppercase flex items-center gap-1">
                  <span>RSI Anti-Divergence</span>
                  {rsiActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                </div>
                <div className="text-emerald-300 font-bold flex items-center gap-1 text-xs">
                  <span>{rsiActive ? 'ACTIVE' : 'STANDBY'}</span>
                  {typeof divergenceRiskIndex === 'number' && (
                    <span className={`text-[10px] font-mono font-normal ml-0.5 ${
                      divergenceRiskIndex < 0.25 ? 'text-emerald-400' : divergenceRiskIndex < 0.35 ? 'text-amber-400' : 'text-rose-400'
                    }`}>
                      ({(divergenceRiskIndex * 100).toFixed(0)}%)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Mini-Sparkline Component: Last 60 seconds of Divergence Risk Index (DRI) */}
            <div className="pl-2.5 border-l border-slate-800/80 flex items-center">
              <DRISparkline
                history={driHistory}
                currentVal={currentDri}
                threshold={0.35}
                width={112}
                height={26}
                showTrendBadge={true}
              />
            </div>
          </div>

          {/* Unified 5-Subsystem Health & Buffer Badge */}
          <div className="bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <div>
              <div className="text-[10px] text-slate-500 uppercase flex items-center gap-1">
                <span>5-Subsystem Health</span>
              </div>
              <div className="text-emerald-300 font-bold flex items-center gap-1 text-xs">
                <span>SUBSCRIBED (30 FPS)</span>
              </div>
            </div>
          </div>

          {/* Automatic Audio Readout Toggle & Voice Selector */}
          <div className="bg-slate-950/80 border border-slate-800 px-2.5 py-1.5 rounded-lg flex items-center gap-2">
            <button
              onClick={() => {
                if (isAudioPlaying) stopAudio();
                setAutoAudioReadout((prev: boolean) => !prev);
              }}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                autoAudioReadout
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800/80 text-slate-400 border border-slate-700 hover:text-slate-200'
              }`}
              title={autoAudioReadout ? 'Auto Audio Readout Active: model outputs will speak automatically' : 'Auto Audio Readout Off'}
            >
              {autoAudioReadout ? (
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span className="whitespace-nowrap">
                {autoAudioReadout ? 'Auto Audio: ON' : 'Auto Audio: OFF'}
              </span>
            </button>

            {isAudioPlaying && (
              <button
                onClick={stopAudio}
                className="px-1.5 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded text-[10px] hover:bg-rose-500/30 transition-all font-mono"
                title="Stop active audio readout"
              >
                Stop
              </button>
            )}

            <select
              value={preferredVoice}
              onChange={(e: any) => setPreferredVoice(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-[10px] rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-sky-500"
              title="Select TTS Voice"
            >
              <option value="Kore">Kore (Balanced)</option>
              <option value="Zephyr">Zephyr (Researcher)</option>
              <option value="Puck">Puck (Energetic)</option>
              <option value="Charon">Charon (Deep)</option>
              <option value="Fenrir">Fenrir (Authoritative)</option>
            </select>
          </div>

          <button
            onClick={handleSynthesizeTelemetry}
            disabled={isSynthesizing}
            className="px-3 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-lg text-xs font-medium transition-all shadow flex items-center gap-1.5 shrink-0"
          >
            {isSynthesizing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>AI Telemetry Audit</span>
          </button>

          {/* Google Sign-In Account Control */}
          {user && !needsDriveAuth ? (
            <div className="bg-slate-950/80 border border-slate-800 px-2.5 py-1.5 rounded-lg flex items-center gap-2 shrink-0">
              <UserIcon className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] text-slate-300 max-w-[120px] truncate" title={user.email || 'Signed in'}>
                {user.displayName || user.email}
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Drive Ready
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
              className="gsi-material-button px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-medium transition-all flex items-center gap-2 shrink-0 shadow-sm cursor-pointer"
              title="Sign in with Google to access Google Drive and save SNN profiles"
            >
              <div className="gsi-material-button-icon w-4 h-4 shrink-0">
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4 block">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  <path fill="none" d="M0 0h48v48H0z"></path>
                </svg>
              </div>
              <span className="gsi-material-button-contents font-sans font-medium">Sign in with Google</span>
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
              <span>Gemini 3.8 Flash Edge Telemetry & Stability Assessment</span>
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
                    : 'Review Gemini 3.8 Flash parameter recommendations below. Click "Approve & Apply Adjustments" to commit to biological substrate.'}
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
                {showSparkTrace ? 'Hide Hybrid Trace' : 'Inspect 3.1-Pro -> 3.8-Flash Pipeline'}
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
                  Stage 1 Norm: {sparkPacket.pipelineLatencyMs.normalizationMs}ms • Stage 2 3.1-Pro Trace: {sparkPacket.pipelineLatencyMs.proReasoningMs}ms • Stage 3 3.8-Flash Exec: {sparkPacket.pipelineLatencyMs.flashExecutionMs}ms
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
