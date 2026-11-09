import React, { useState } from 'react';
import { Synapse, STDPConfig, SNNTuningConfig, SNNPersonalityProfile } from '../types';
import { Network, Sliders, RefreshCw, Sparkles, CheckCircle2, ShieldAlert } from 'lucide-react';
import { SNNPersonalityManager } from './SNNPersonalityManager';

interface SynapticMatrixViewProps {
  synapses: Synapse[];
  stdpConfig: STDPConfig;
  currentTuning?: SNNTuningConfig;
  onUpdateSTDPConfig: (config: Partial<STDPConfig>) => void;
  onSelectPreset: (preset: 'avoidance' | 'random' | 'bcm_aggressive') => void;
  onUpdateWeight: (synapseId: string, newWeight: number) => void;
  onApplyModelAdjustments?: () => void;
  onApplyPersonality?: (profile: SNNPersonalityProfile) => void;
  onExportPersonality?: (
    name: string,
    description: string,
    category: SNNPersonalityProfile['category'],
    tags: string[]
  ) => SNNPersonalityProfile;
}

export const SynapticMatrixView: React.FC<SynapticMatrixViewProps> = ({
  synapses,
  stdpConfig,
  currentTuning,
  onUpdateSTDPConfig,
  onSelectPreset,
  onUpdateWeight,
  onApplyModelAdjustments,
  onApplyPersonality,
  onExportPersonality,
}) => {
  const [activeMatrixTab, setActiveMatrixTab] = useState<'sensory_to_inter' | 'inter_to_motor'>('sensory_to_inter');
  const [selectedSynapse, setSelectedSynapse] = useState<Synapse | null>(null);

  // Filter synapses by stage
  // Stage 1: Sensory (0..7) -> Inter (8..15)
  // Stage 2: Inter (8..15) -> Motor (16..19)
  const sensoryToInterSynapses = synapses.filter((s) => s.preId < 8 && s.postId >= 8 && s.postId < 16);
  const interToMotorSynapses = synapses.filter((s) => s.preId >= 8 && s.preId < 16 && s.postId >= 16);

  // Calculate weight color: blue for inhibitory (<0), red/amber for excitatory (>0)
  const getWeightColor = (weight: number) => {
    const clamped = Math.max(-1.5, Math.min(1.5, weight));
    if (clamped > 0) {
      const alpha = Math.min(1, Math.max(0.15, clamped / 1.5));
      return `rgba(245, 158, 11, ${alpha})`;
    } else {
      const alpha = Math.min(1, Math.max(0.15, Math.abs(clamped) / 1.5));
      return `rgba(59, 130, 246, ${alpha})`;
    }
  };

  return (
    <div id="synaptic-matrix-panel" className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 shadow">
      {/* Header & Preset Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-slate-100">
            Reconfigurable Synaptic Weight Matrix & STDP Plasticity
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {onApplyPersonality && onExportPersonality && (
            <SNNPersonalityManager
              currentTuning={
                currentTuning || {
                  aPlus: stdpConfig.aPlus,
                  aMinus: stdpConfig.aMinus,
                  learningRate: stdpConfig.learningRate,
                  turnGain: 3.5,
                  proximityGain: 1.65,
                  antiHebbianPenalty: 0.12,
                }
              }
              currentStdpConfig={stdpConfig}
              synapses={synapses}
              onApplyPersonality={onApplyPersonality}
              onExportPersonality={onExportPersonality}
            />
          )}

          <span className="text-slate-400 font-mono hidden sm:inline">Topology Preset:</span>
          {onApplyModelAdjustments && (
            <button
              onClick={onApplyModelAdjustments}
              className="px-2.5 py-1 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded transition-colors font-medium flex items-center gap-1 shadow-sm"
              title="Apply Gemini model's recommended STDP parameters (A+=0.032, A-=0.052, η=0.40)"
            >
              <Sparkles className="w-3 h-3 text-sky-400" />
              Model STDP Preset
            </button>
          )}
          <button
            onClick={() => onSelectPreset('avoidance')}
            className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded transition-colors font-medium flex items-center gap-1"
          >
            <CheckCircle2 className="w-3 h-3" />
            Trained Classifier
          </button>
          <button
            onClick={() => onSelectPreset('random')}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded transition-colors font-medium flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Tabula Rasa
          </button>
        </div>
      </div>

      {/* Two Column Layout: Matrix on Left, STDP Plasticity Engine on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Synaptic Weight Heatmap Matrix */}
        <div className="lg:col-span-7 flex flex-col bg-[#0a0f1d] border border-slate-800 rounded-lg p-3">
          {/* Sub tabs */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveMatrixTab('sensory_to_inter')}
                className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                  activeMatrixTab === 'sensory_to_inter'
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Layer 1: Sensory → Interneurons (8×8)
              </button>
              <button
                onClick={() => setActiveMatrixTab('inter_to_motor')}
                className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                  activeMatrixTab === 'inter_to_motor'
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Layer 2: Interneurons → Efferent Decoders (8×4)
              </button>
            </div>

            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-blue-500 inline-block" /> Inhibitory (-)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" /> Excitatory (+)
              </span>
            </div>
          </div>

          {/* Matrix Grid */}
          {activeMatrixTab === 'sensory_to_inter' ? (
            <div className="overflow-x-auto">
              <div className="min-w-[340px]">
                <div className="grid grid-cols-9 gap-1 text-[10px] font-mono text-slate-400 mb-1">
                  <div className="text-center font-semibold text-slate-300">S \ N</div>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <div key={j} className="text-center text-sky-400">
                      N{8 + j}
                    </div>
                  ))}
                </div>

                {Array.from({ length: 8 }).map((_, preIndex) => (
                  <div key={preIndex} className="grid grid-cols-9 gap-1 mb-1 items-center">
                    <div className="text-[10px] font-mono text-emerald-400 text-center font-medium">
                      S{preIndex}
                    </div>
                    {Array.from({ length: 8 }).map((_, postOffset) => {
                      const postIndex = 8 + postOffset;
                      const syn = sensoryToInterSynapses.find(
                        (s) => s.preId === preIndex && s.postId === postIndex
                      );
                      const weight = syn?.weight ?? 0;
                      const isSelected = selectedSynapse?.id === syn?.id;

                      return (
                        <button
                          key={postOffset}
                          onClick={() => syn && setSelectedSynapse(syn)}
                          style={{ backgroundColor: getWeightColor(weight) }}
                          className={`h-7 rounded text-[10px] font-mono text-slate-950 font-bold transition-transform hover:scale-105 ${
                            isSelected ? 'ring-2 ring-white scale-105' : ''
                          }`}
                          title={`S${preIndex} -> N${postIndex}: weight = ${weight.toFixed(3)}`}
                        >
                          {weight > 0 ? `+${weight.toFixed(1)}` : weight.toFixed(1)}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[300px]">
                <div className="grid grid-cols-5 gap-1.5 text-[10px] font-mono text-slate-400 mb-1.5">
                  <div className="text-center font-semibold text-slate-300">N \ O</div>
                  <div className="text-center text-amber-400">O16 (Left)</div>
                  <div className="text-center text-amber-400">O17 (Right)</div>
                  <div className="text-center text-rose-400">O18 (Novelty)</div>
                  <div className="text-center text-sky-400">O19 (Homeo)</div>
                </div>

                {Array.from({ length: 8 }).map((_, nOffset) => {
                  const preId = 8 + nOffset;
                  return (
                    <div key={nOffset} className="grid grid-cols-5 gap-1.5 mb-1.5 items-center">
                      <div className="text-[10px] font-mono text-sky-400 text-center font-medium">
                        N{preId}
                      </div>
                      {Array.from({ length: 4 }).map((_, mOffset) => {
                        const postId = 16 + mOffset;
                        const syn = interToMotorSynapses.find(
                          (s) => s.preId === preId && s.postId === postId
                        );
                        const weight = syn?.weight ?? 0;
                        const isSelected = selectedSynapse?.id === syn?.id;

                        return (
                          <button
                            key={mOffset}
                            onClick={() => syn && setSelectedSynapse(syn)}
                            style={{ backgroundColor: getWeightColor(weight) }}
                            className={`h-7 rounded text-[10px] font-mono text-slate-950 font-bold transition-transform hover:scale-105 ${
                              isSelected ? 'ring-2 ring-white scale-105' : ''
                            }`}
                            title={`N${preId} -> O${postId}: weight = ${weight.toFixed(3)}`}
                          >
                            {weight > 0 ? `+${weight.toFixed(2)}` : weight.toFixed(2)}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selected Synapse Inspector & Editor */}
          {(() => {
            const currentSelectedSynapse = selectedSynapse
              ? synapses.find((s) => s.id === selectedSynapse.id) || selectedSynapse
              : null;

            if (!currentSelectedSynapse) return null;

            return (
              <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="font-mono text-slate-300">
                  <span className="text-slate-400">Selected Synapse: </span>
                  <strong className="text-sky-300">
                    Node #{currentSelectedSynapse.preId} → Node #{currentSelectedSynapse.postId}
                  </strong>
                  <span className="ml-2 text-amber-400 font-bold">
                    Weight: {currentSelectedSynapse.weight.toFixed(3)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onUpdateWeight(currentSelectedSynapse.id, currentSelectedSynapse.weight - 0.2)}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-mono transition-colors"
                  >
                    -0.2
                  </button>
                  <input
                    type="range"
                    min="-1.5"
                    max="1.5"
                    step="0.05"
                    value={currentSelectedSynapse.weight}
                    onChange={(e) => onUpdateWeight(currentSelectedSynapse.id, parseFloat(e.target.value))}
                    className="w-24 accent-sky-500 cursor-pointer"
                  />
                  <button
                    onClick={() => onUpdateWeight(currentSelectedSynapse.id, currentSelectedSynapse.weight + 0.2)}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-mono transition-colors"
                  >
                    +0.2
                  </button>
                  <button
                    onClick={() => onUpdateWeight(currentSelectedSynapse.id, currentSelectedSynapse.initialWeight)}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-400 rounded transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </div>
            );
          })()}
        </div>

        {/* STDP Plasticity & Learning Engine Controls */}
        <div className="lg:col-span-5 flex flex-col gap-3 bg-[#0a0f1d] border border-slate-800 rounded-lg p-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                STDP Plasticity Tuning
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={stdpConfig.enabled}
                onChange={(e) => onUpdateSTDPConfig({ enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
              <span className="ml-2 text-xs font-medium text-slate-300">
                {stdpConfig.enabled ? 'Active' : 'Frozen'}
              </span>
            </label>
          </div>

          {/* Biological STDP Timing Curve Diagram */}
          <div className="p-2.5 bg-slate-900/90 rounded border border-slate-800 text-[11px] font-mono text-slate-300 space-y-1">
            <div className="flex justify-between text-slate-400 text-[10px]">
              <span>LTD (Pre after Post, Δw &lt; 0)</span>
              <span>LTP (Pre before Post, Δw &gt; 0)</span>
            </div>
            <div className="h-10 w-full flex items-center justify-center bg-slate-950 rounded relative overflow-hidden border border-slate-800/60">
              {/* Zero axis */}
              <div className="absolute w-full h-[1px] bg-slate-700" />
              <div className="absolute h-full w-[1px] bg-slate-700" />
              {/* Left LTD curve */}
              <div className="absolute left-6 bottom-2 text-rose-400 font-bold">
                -A₋ e^(Δt/τ₋)
              </div>
              {/* Right LTP curve */}
              <div className="absolute right-6 top-2 text-emerald-400 font-bold">
                +A₊ e^(-Δt/τ₊)
              </div>
            </div>
            <div className="text-center text-[10px] text-slate-500">
              Spike Timing Window: τ = {stdpConfig.tauPlus}ms
            </div>
          </div>

          {/* Sliders */}
          <div className="space-y-2.5 text-xs">
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Learning Rate ($\eta$):</span>
                <span className="font-mono text-sky-400">{stdpConfig.learningRate.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="2.0"
                step="0.05"
                value={stdpConfig.learningRate}
                onChange={(e) => onUpdateSTDPConfig({ learningRate: parseFloat(e.target.value) })}
                className="w-full accent-sky-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>LTP Potentiation Amplitude ($A_+$):</span>
                <span className="font-mono text-emerald-400">{stdpConfig.aPlus.toFixed(3)}</span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.12"
                step="0.005"
                value={stdpConfig.aPlus}
                onChange={(e) => onUpdateSTDPConfig({ aPlus: parseFloat(e.target.value) })}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>LTD Depression Amplitude ($A_-$):</span>
                <span className="font-mono text-rose-400">{stdpConfig.aMinus.toFixed(3)}</span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.12"
                step="0.005"
                value={stdpConfig.aMinus}
                onChange={(e) => onUpdateSTDPConfig({ aMinus: parseFloat(e.target.value) })}
                className="w-full accent-rose-500 cursor-pointer"
              />
            </div>

            {/* Real-Time Synaptic Weight Decay Multiplier (STDP Leakage Rate) */}
            <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-500/30 space-y-2">
              <div className="flex items-center justify-between text-slate-200">
                <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                  <span>Weight Decay Multiplier:</span>
                </span>
                <span className="font-mono text-amber-400 font-bold bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/40 text-[11px]">
                  {(stdpConfig.weightDecayMultiplier ?? 1.0).toFixed(1)}x
                  <span className="text-[9px] text-amber-200/80 font-normal ml-1">
                    {(stdpConfig.weightDecayMultiplier ?? 1.0) >= 1.8
                      ? 'Aggressive Leak'
                      : (stdpConfig.weightDecayMultiplier ?? 1.0) <= 0.6
                      ? 'High Persistence'
                      : 'Nominal'}
                  </span>
                </span>
              </div>

              <input
                type="range"
                min="0.0"
                max="3.0"
                step="0.1"
                value={stdpConfig.weightDecayMultiplier ?? 1.0}
                onChange={(e) =>
                  onUpdateSTDPConfig({ weightDecayMultiplier: parseFloat(e.target.value) })
                }
                className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded"
              />

              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>0.0x (No Leak)</span>
                <span>1.0x (Nominal)</span>
                <span>3.0x (Max Anti-Saturation)</span>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-1.5 pt-1 border-t border-amber-900/40">
                <span className="text-[9px] text-slate-400 font-mono">Presets:</span>
                {[
                  { label: '0.4x', desc: 'Hold Memory', val: 0.4 },
                  { label: '1.0x', desc: 'Nominal', val: 1.0 },
                  { label: '1.8x', desc: 'Anti-Sat', val: 1.8 },
                  { label: '2.5x', desc: 'High Bleed', val: 2.5 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => onUpdateSTDPConfig({ weightDecayMultiplier: preset.val })}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition border cursor-pointer ${
                      Math.abs((stdpConfig.weightDecayMultiplier ?? 1.0) - preset.val) < 0.05
                        ? 'bg-amber-500 text-black font-bold border-amber-400'
                        : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                    title={preset.desc}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <p className="text-[10px] text-amber-200/70 leading-tight">
                Controls real-time passive STDP weight leakage to bleed accumulated excitation and prevent synaptic saturation.
              </p>
            </div>

            <div className="pt-2 border-t border-slate-800">
              <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                <input
                  type="checkbox"
                  checked={stdpConfig.antiHebbianCollisionModulation}
                  onChange={(e) =>
                    onUpdateSTDPConfig({ antiHebbianCollisionModulation: e.target.checked })
                  }
                  className="rounded border-slate-700 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs">Anti-Hebbian Homeostatic BCM Modulation</span>
              </label>
              <p className="text-[10px] text-slate-500 mt-1 pl-6">
                Dynamically depresses saturated synapses and enforces homeostatic weight balance.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
