import React, { useState, useEffect, useRef } from 'react';
import { HardwareTelemetry, ModelDiagnosticRecommendation } from '../types';
import { Cpu, Zap, Activity, Clock, ShieldCheck, Gauge, Sparkles, Loader2, CheckCircle2, Volume2, VolumeX, LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { AudioListenButton } from './AudioListenButton';
import { useAudioVoice } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import { DRISparkline } from './DRISparkline';

interface HeaderTelemetryProps {
  telemetry: HardwareTelemetry;
  collisions?: number;
  survivalSeconds?: number;
  onDiagnosticUpdated?: (diagnostic: ModelDiagnosticRecommendation) => void;
  onApplyAdjustments?: () => void;
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
  const { autoAudioReadout, setAutoAudioReadout, preferredVoice, setPreferredVoice, speakModelOutput, stopAudio, isAudioPlaying } = useAudioVoice();
  const { user, signInWithGoogle, signOutUser } = useAuth();

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
          {user ? (
            <div className="bg-slate-950/80 border border-slate-800 px-2.5 py-1.5 rounded-lg flex items-center gap-2 shrink-0">
              <UserIcon className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] text-slate-300 max-w-[120px] truncate" title={user.email || 'Signed in'}>
                {user.displayName || user.email}
              </span>
              <button
                onClick={signOutUser}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] flex items-center gap-1 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-3 h-3" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <button
              onClick={signInWithGoogle}
              className="px-2.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 shrink-0"
              title="Sign in with Google to save custom SNN profiles to your account"
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
            <div className="flex items-center gap-2 text-sky-400 font-semibold font-mono">
              <Sparkles className="w-4 h-4" />
              <span>Gemini 3.8 Flash Edge Telemetry & Stability Assessment</span>
            </div>
            <div className="flex items-center gap-2">
              {onApplyAdjustments && (
                <button
                  onClick={onApplyAdjustments}
                  className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-all ${
                    adjustmentsApplied
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-sky-600 hover:bg-sky-500 text-white shadow'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{adjustmentsApplied ? 'Adjustments Applied' : 'Apply Adjustments Now'}</span>
                </button>
              )}
              <AudioListenButton text={aiReport} voice="Kore" label="Listen to Audit" variant="compact" />
              <button
                onClick={() => setAiReport(null)}
                className="text-slate-400 hover:text-white px-2 py-0.5 text-xs bg-slate-800/80 hover:bg-slate-700 rounded"
              >
                ✕ Dismiss
              </button>
            </div>
          </div>
          <div className="leading-relaxed whitespace-pre-wrap font-sans text-slate-300 max-h-96 overflow-y-auto pr-1">
            {aiReport}
          </div>
        </div>
      )}
    </header>
  );
};
