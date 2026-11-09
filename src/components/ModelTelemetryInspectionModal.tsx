import React, { useState } from 'react';
import { UnifiedTelemetrySnapshot, SNNTuningConfig } from '../types';
import {
  Layers,
  X,
  Activity,
  Cpu,
  ShieldCheck,
  Radio,
  Zap,
  CheckCircle2,
  Copy,
  Check,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

interface ModelTelemetryInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: UnifiedTelemetrySnapshot | null;
  tuningConfig?: SNNTuningConfig;
  onTriggerAudit?: () => void;
  isLoading?: boolean;
}

export const ModelTelemetryInspectionModal: React.FC<ModelTelemetryInspectionModalProps> = ({
  isOpen,
  onClose,
  snapshot,
  tuningConfig,
  onTriggerAudit,
  isLoading = false,
}) => {
  const [activeTab, setActiveTab] = useState<'matrix' | 'json' | 'methodology'>('matrix');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyJson = () => {
    if (!snapshot) return;
    navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getDriColor = (val: number) => {
    if (val < 0.25) return 'text-emerald-400 bg-emerald-950/40 border-emerald-500/30';
    if (val < 0.50) return 'text-amber-400 bg-amber-950/40 border-amber-500/30';
    return 'text-rose-400 bg-rose-950/40 border-rose-500/30';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0b1020] border border-sky-500/30 rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl shadow-sky-950/60 overflow-hidden text-slate-100">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 p-0.5 flex items-center justify-center">
              <div className="w-full h-full bg-[#0b1020] rounded-[10px] flex items-center justify-center">
                <Layers className="w-5 h-5 text-sky-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                  Model Telemetry Ingestion Matrix
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  All 5 Subsystems Live
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 font-semibold">
                  Deep Reasoning Pro Tier
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Exact multimodal telemetry ingested by Gemini for mathematical diagnostic proofs and recursive parameter self-improvement.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onTriggerAudit && (
              <button
                onClick={onTriggerAudit}
                disabled={isLoading}
                className="px-3 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow transition-all disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-sky-300" />
                <span>{isLoading ? 'Auditing...' : 'Run Audit with This Telemetry'}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-4 py-2 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 font-mono">
            <button
              onClick={() => setActiveTab('matrix')}
              className={`px-3 py-1 rounded-lg transition-all ${
                activeTab === 'matrix'
                  ? 'bg-sky-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              5 Subsystem Matrix
            </button>
            <button
              onClick={() => setActiveTab('methodology')}
              className={`px-3 py-1 rounded-lg transition-all ${
                activeTab === 'methodology'
                  ? 'bg-purple-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              How Gemini Derives Improvements
            </button>
            <button
              onClick={() => setActiveTab('json')}
              className={`px-3 py-1 rounded-lg transition-all ${
                activeTab === 'json'
                  ? 'bg-indigo-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              Raw Ingested JSON Snapshot
            </button>
          </div>

          {activeTab === 'json' && (
            <button
              onClick={handleCopyJson}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px] transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              <span>{copied ? 'Copied' : 'Copy JSON Payload'}</span>
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
          {activeTab === 'matrix' && (
            <div className="space-y-4">
              {snapshot ? (
                <>
                  {/* Pillar 1: Core Hardware */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-sky-400" />
                        <span className="font-bold text-xs uppercase tracking-wider text-sky-300">
                          Pillar 1: Core Hardware Telemetry & Energy dissipation
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
                        Active Hardware Stream
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Mean Firing Rate</span>
                        <span className="text-white font-bold text-sm">
                          {snapshot.core.meanFiringRateHz.toFixed(1)} Hz
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Power Consumption</span>
                        <span className="text-sky-400 font-bold text-sm">
                          {snapshot.core.powerMw.toFixed(2)} mW
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Energy per SOP</span>
                        <span className="text-emerald-400 font-bold text-sm">
                          {snapshot.core.energyPerSopPj.toFixed(1)} pJ/SOP
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Total Spikes Emitted</span>
                        <span className="text-purple-400 font-bold text-sm">
                          {snapshot.core.totalSpikesEmitted.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                      <span>Active Simulation Duration: <strong className="text-slate-200 font-mono">{snapshot.core.activeSeconds}s</strong></span>
                      <span>Synaptic Operations/sec: <strong className="text-sky-300 font-mono">{snapshot.core.synapticOpsPerSec.toLocaleString()} SOP/s</strong></span>
                    </div>
                  </div>

                  {/* Pillar 2: Substrate Keel Dynamics & Trauma State */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-cyan-400" />
                        <span className="font-bold text-xs uppercase tracking-wider text-cyan-300">
                          Pillar 2: Biological Substrate Keel & Trauma State
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded">
                        Affective Equilibrium
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Valence / Arousal</span>
                        <span className="text-cyan-300 font-bold text-sm">
                          {snapshot.substrateKeel.valence.toFixed(2)} / {snapshot.substrateKeel.arousal.toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Trauma State</span>
                        <span className="text-emerald-400 font-bold text-sm capitalize">
                          {snapshot.substrateKeel.traumaState.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Constitutional Gate</span>
                        <span className="text-amber-300 font-bold text-sm">
                          {snapshot.substrateKeel.constitutionalGateState}
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Gate Damping Factor</span>
                        <span className="text-emerald-400 font-bold text-sm">
                          {(snapshot.substrateKeel.gateDampingFactor * 100).toFixed(0)}% Nominal
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                      <span>Signal Center: <strong className="text-slate-200 font-mono">{snapshot.substrateKeel.dynamicSignalCenter}</strong></span>
                      <span>Trauma Lock Steps: <strong className="text-slate-200 font-mono">{snapshot.substrateKeel.traumaLockSteps}</strong></span>
                      <span>Dropped Signals: <strong className="text-emerald-300 font-mono">{snapshot.substrateKeel.droppedSignalCount}</strong></span>
                    </div>
                  </div>

                  {/* Pillar 3: Frequency Spectrum & Power Bands */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-amber-400" />
                        <span className="font-bold text-xs uppercase tracking-wider text-amber-300">
                          Pillar 3: Frequency Spectrum & Power Band Decomposition
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
                        FFT Spectral Locked
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-xs text-center">
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[9px] text-slate-500 block">&delta; Delta (&lt;4Hz)</span>
                        <span className="text-white font-bold">{snapshot.frequencyBands.deltaBandHz.toFixed(2)}</span>
                      </div>
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[9px] text-slate-500 block">&theta; Theta (4-8Hz)</span>
                        <span className="text-sky-400 font-bold">{snapshot.frequencyBands.thetaBandHz.toFixed(2)}</span>
                      </div>
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[9px] text-slate-500 block">&alpha; Alpha (8-13Hz)</span>
                        <span className="text-emerald-400 font-bold">{snapshot.frequencyBands.alphaBandHz.toFixed(2)}</span>
                      </div>
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[9px] text-slate-500 block">&beta; Beta (13-30Hz)</span>
                        <span className="text-amber-400 font-bold">{snapshot.frequencyBands.betaBandHz.toFixed(2)}</span>
                      </div>
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[9px] text-slate-500 block">&gamma; Gamma (&gt;30Hz)</span>
                        <span className="text-purple-400 font-bold">{snapshot.frequencyBands.gammaBandHz.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                      <span>Peak Frequency: <strong className="text-white font-mono">{snapshot.frequencyBands.peakHz.toFixed(1)} Hz</strong></span>
                      <span>Burst Synchrony Index: <strong className="text-amber-300 font-mono">{snapshot.frequencyBands.burstSynchronyIndex.toFixed(2)}</strong></span>
                      <span>SNR Ratio: <strong className="text-emerald-300 font-mono">{snapshot.frequencyBands.signalToNoiseRatioDb.toFixed(1)} dB</strong></span>
                    </div>
                  </div>

                  {/* Pillar 4: AER Asynchronous Bus Traffic */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <Radio className="w-4 h-4 text-teal-400" />
                        <span className="font-bold text-xs uppercase tracking-wider text-teal-300">
                          Pillar 4: Address Event Representation (AER) Bus Stream
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-teal-400 bg-teal-950/60 border border-teal-800/60 px-2 py-0.5 rounded">
                        Clockless Neuromorphic Bus
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">AER Latency</span>
                        <span className="text-teal-300 font-bold text-sm">
                          {snapshot.aerBus.aerLatencyMs.toFixed(2)} ms
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Event Throughput</span>
                        <span className="text-white font-bold text-sm">
                          {snapshot.aerBus.eventRatePerSec.toLocaleString()} ev/s
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Jitter</span>
                        <span className="text-emerald-400 font-bold text-sm">
                          {snapshot.aerBus.jitterMs.toFixed(2)} ms
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Bus Congestion</span>
                        <span className="text-emerald-400 font-bold text-sm">
                          {snapshot.aerBus.busStatus} (0 Drops)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Pillar 5: Synaptic Stability & Weight Matrix Health */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-purple-400" />
                        <span className="font-bold text-xs uppercase tracking-wider text-purple-300">
                          Pillar 5: Synaptic Plasticity Health & Divergence Risk Index (DRI)
                        </span>
                      </div>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${getDriColor(snapshot.synapticStability.divergenceRiskIndex)}`}>
                        DRI: {(snapshot.synapticStability.divergenceRiskIndex * 100).toFixed(0)}% ({snapshot.synapticStability.status.toUpperCase()})
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">LTD/LTP Dominance Ratio</span>
                        <span className="text-purple-300 font-bold text-sm">
                          {snapshot.synapticStability.ltdLtpRatio.toFixed(2)}x (≥ 1.08 Hard-Locked)
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Lyapunov Exponent λ</span>
                        <span className="text-emerald-400 font-bold text-sm">
                          {snapshot.synapticStability.lyapunovExponent.toFixed(2)} (Subcritical)
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Branching Ratio σ</span>
                        <span className="text-sky-300 font-bold text-sm">
                          {snapshot.synapticStability.branchingRatio.toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Weight Kurtosis / Fano</span>
                        <span className="text-amber-300 font-bold text-sm">
                          {snapshot.synapticStability.weightKurtosis.toFixed(1)} / {snapshot.synapticStability.fanoFactor.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                      <span>Matrix Sparsity: <strong className="text-white font-mono">{snapshot.synapticStability.sparsityPct.toFixed(1)}%</strong></span>
                      <span>Exc/Inh Balance: <strong className="text-white font-mono">{(snapshot.synapticStability.excitatoryRatio * 100).toFixed(0)}% / {(snapshot.synapticStability.inhibitoryRatio * 100).toFixed(0)}%</strong></span>
                      <span>Cumulative STDP Drift: <strong className="text-purple-300 font-mono">Δ={snapshot.synapticStability.stdpCumulativeDelta.toFixed(2)}</strong></span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-slate-400">
                  Initializing unified telemetry bus...
                </div>
              )}
            </div>
          )}

          {activeTab === 'methodology' && (
            <div className="space-y-4 text-xs text-slate-300 leading-relaxed font-sans">
              <div className="bg-purple-950/30 border border-purple-800/50 rounded-xl p-4 space-y-2">
                <h4 className="text-sm font-bold text-purple-200 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  Gemini Deep Reasoning: Mathematical Audit & Improvement Process
                </h4>
                <p>
                  Gemini ingests all 5 physical subsystem streams in a single atomic snapshot. Instead of simple heuristics, Gemini performs formal neurocomputational derivations to balance biological realism with computational stability.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                  <span className="font-bold text-sky-400 uppercase tracking-wider text-[11px] block">
                    1. Anti-Runaway Plasticity Plank
                  </span>
                  <p className="text-slate-400">
                    Calculates the exact ratio of Long-Term Depression (A-) to Long-Term Potentiation (A+). To prevent runaway weight explosion, the model strictly enforces A- / A+ &ge; 1.08, ensuring that synaptic pruning outpaces excitation during bursts.
                  </p>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                  <span className="font-bold text-emerald-400 uppercase tracking-wider text-[11px] block">
                    2. Spectral Synchrony & Criticality (&sigma; &approx; 1.0)
                  </span>
                  <p className="text-slate-400">
                    Audits the Branching Ratio &sigma; and Lyapunov Exponent &lambda; from frequency band power and burst synchrony. If synchrony exceeds safe boundaries, Gemini dials back afferent sensitivity (G_afferent) to keep the system at the edge of chaos without seizing.
                  </p>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                  <span className="font-bold text-cyan-400 uppercase tracking-wider text-[11px] block">
                    3. Substrate Keel & Trauma Equilibrium
                  </span>
                  <p className="text-slate-400">
                    Cross-examines valence, arousal, and constitutional gate damping. If dorsal trauma lock is detected, Gemini adjusts the associative projection gain (G_assoc) and Anti-Hebbian penalty (&lambda;) to re-center the dynamic signal tracker.
                  </p>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                  <span className="font-bold text-amber-400 uppercase tracking-wider text-[11px] block">
                    4. Autonomous Closed-Loop & Auto-Rollback Sentry
                  </span>
                  <p className="text-slate-400">
                    In Autonomous Mode, Gemini's approved improvements are applied immediately to the running simulation. The real-time Sentry monitors DRI for 15 seconds: if divergence spikes by &ge; +0.15 or exceeds 0.65, parameters are automatically rolled back.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'json' && (
            <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 font-mono text-[11px] text-emerald-400 overflow-x-auto max-h-[500px]">
              <pre>{JSON.stringify(snapshot, null, 2)}</pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs font-mono text-slate-400">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Hard-Locked Stability Plank Active (A- ≥ 1.08 A+, η ∈ [0.20, 0.70])
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
