import React, { useState } from 'react';
import { UserGuidanceInput, SNNTuningConfig } from '../types';
import {
  Sparkles,
  Sliders,
  Zap,
  CheckCircle2,
  X,
  AlertTriangle,
  Lightbulb,
  Cpu,
  ArrowRight,
  RotateCcw,
  Globe,
} from 'lucide-react';

interface ModelGuidanceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitGuidance: (guidance: UserGuidanceInput) => void;
  isLoading: boolean;
  activeTuning: SNNTuningConfig;
}

const PRESET_FOCUS_AREAS = [
  {
    id: 'Search Online Neurocomputational Literature',
    label: 'Search Online Research & Papers',
    desc: 'Ground model assessment with Google Search to retrieve empirical SNN stability papers and benchmarks.',
    icon: Globe,
    color: 'text-purple-400 border-purple-500/40 bg-purple-500/10',
  },
  {
    id: 'Calibrate Association Gain',
    label: 'Calibrate Association Gain',
    desc: 'Increase association interneuron gain and input sensitivity for sharp signal discrimination.',
    icon: Zap,
    color: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
  },
  {
    id: 'Suppress Synchronous Bursts',
    label: 'Suppress Synchronous Bursts',
    desc: 'Enforce dynamic damping and threshold scaling to suppress runaway synchronous burst cascades.',
    icon: AlertTriangle,
    color: 'text-rose-400 border-rose-500/40 bg-rose-500/10',
  },
  {
    id: 'Counter Synaptic Weight Drift',
    label: 'Counter STDP Weight Drift',
    desc: 'Enforce LTD dominance (A-/A+ >= 1.08) to stop runaway synaptic weight saturation.',
    icon: Sliders,
    color: 'text-purple-400 border-purple-500/40 bg-purple-500/10',
  },
  {
    id: 'Conserve Dynamic Power',
    label: 'Conserve Dynamic Power',
    desc: 'Lower learning rate and trim firing rate to reduce CMOS switching power in mW.',
    icon: Cpu,
    color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  },
  {
    id: 'Stabilize Firing Dispersion',
    label: 'Stabilize Firing Dispersion',
    desc: 'Dampen membrane potential fluctuations for stable, homeostatic spike trains.',
    icon: Lightbulb,
    color: 'text-sky-400 border-sky-500/40 bg-sky-500/10',
  },
];

export const ModelGuidanceDialog: React.FC<ModelGuidanceDialogProps> = ({
  isOpen,
  onClose,
  onSubmitGuidance,
  isLoading,
  activeTuning,
}) => {
  const [selectedFocus, setSelectedFocus] = useState<string[]>([
    'Calibrate Association Gain',
    'Counter Synaptic Weight Drift',
  ]);
  const [operatorNotes, setOperatorNotes] = useState(
    'I noticed the network occasionally produces runaway synchronous bursts during high input rates, and synaptic weights tend to drift toward positive saturation. Please calibrate association gain and enforce stronger LTD depression.'
  );
  const [prioritizedParam, setPrioritizedParam] = useState<
    'turnGain' | 'proximityGain' | 'learningRate' | 'stdpRatio' | 'all'
  >('all');
  const [showAdvancedSliders, setShowAdvancedSliders] = useState(false);
  const [customTurnGain, setCustomTurnGain] = useState(activeTuning.turnGain);
  const [customProxGain, setCustomProxGain] = useState(activeTuning.proximityGain);
  const [customLearningRate, setCustomLearningRate] = useState(activeTuning.learningRate);
  const [customAplus, setCustomAplus] = useState(activeTuning.aPlus);
  const [customAminus, setCustomAminus] = useState(activeTuning.aMinus);

  if (!isOpen) return null;

  const toggleFocus = (id: string) => {
    setSelectedFocus((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const guidance: UserGuidanceInput = {
      notes: operatorNotes.trim(),
      focusAreas: selectedFocus,
      prioritizedParam,
      customOverrides: showAdvancedSliders
        ? {
            turnGain: customTurnGain,
            proximityGain: customProxGain,
            learningRate: customLearningRate,
            aPlus: customAplus,
            aMinus: customAminus,
          }
        : undefined,
    };
    onSubmitGuidance(guidance);
  };

  return (
    <div
      id="model-guidance-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="bg-[#0b101e] border border-sky-500/40 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>Guide Model Assessment & Recommend Fixes</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  Human-in-the-Loop
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Provide your observations and recommend target fixes to direct Gemini's diagnostic assessment.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Preset Focus Area Chips */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-semibold flex items-center justify-between">
              <span>1. Select What You Recommend Fixing (Focus Areas):</span>
              <span className="text-[11px] text-slate-500 font-normal">
                Click to toggle recommendations
              </span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PRESET_FOCUS_AREAS.map((preset) => {
                const isSelected = selectedFocus.includes(preset.id);
                const Icon = preset.icon;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => toggleFocus(preset.id)}
                    className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                      isSelected
                        ? `${preset.color} shadow-sm ring-1 ring-sky-500/30`
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-850 hover:border-slate-700'
                    }`}
                  >
                    <div
                      className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                        isSelected ? 'bg-white/10' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <span>{preset.label}</span>
                        {isSelected && <CheckCircle2 className="w-3 h-3 text-sky-400 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                        {preset.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* User Observations & Instructions Field */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-semibold flex items-center justify-between">
              <span>2. Your Observations & Recommended Fixes (Operator Notes):</span>
              <span className="text-[11px] text-sky-400 font-mono">
                Model will directly address this
              </span>
            </label>
            <textarea
              rows={3}
              value={operatorNotes}
              onChange={(e) => setOperatorNotes(e.target.value)}
              placeholder="e.g., I observed high-frequency burst synchrony in the association layer. Please calibrate the LTD ratio to suppress runaway potentiation and stabilize dynamic gain."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl p-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 font-sans text-xs leading-relaxed shadow-inner"
            />
          </div>

          {/* Priority Parameter Selector */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-semibold flex items-center justify-between">
              <span>3. Prioritize Tuning On:</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all', label: 'Balanced SNN Tuning (All)' },
                { id: 'turnGain', label: 'Steering Turn Gain' },
                { id: 'proximityGain', label: 'Sensor Proximity Gain' },
                { id: 'stdpRatio', label: 'STDP A-/A+ Plasticity' },
                { id: 'learningRate', label: 'Learning Rate (η)' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPrioritizedParam(opt.id as any)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
                    prioritizedParam === opt.id
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/60 font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced Pre-Tuning Sliders Toggle */}
          <div className="pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setShowAdvancedSliders((prev) => !prev)}
              className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1.5 font-medium transition-colors"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>
                {showAdvancedSliders
                  ? 'Hide Manual Parameter Pre-Sets'
                  : 'Optional: Suggest Exact Numerical Overrides'}
              </span>
            </button>

            {showAdvancedSliders && (
              <div className="mt-3 p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3 font-mono text-[11px] animate-in fade-in duration-150">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Target Associative Projection Gain:</span>
                  <span className="text-amber-300 font-bold">{customTurnGain.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="1.5"
                  max="5.0"
                  step="0.1"
                  value={customTurnGain}
                  onChange={(e) => setCustomTurnGain(parseFloat(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />

                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Target Afferent Input Sensitivity:</span>
                  <span className="text-sky-300 font-bold">{customProxGain.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="3.0"
                  step="0.05"
                  value={customProxGain}
                  onChange={(e) => setCustomProxGain(parseFloat(e.target.value))}
                  className="w-full accent-sky-400 cursor-pointer"
                />

                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Target STDP Learning Rate (η):</span>
                  <span className="text-purple-300 font-bold">{customLearningRate.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.2"
                  step="0.05"
                  value={customLearningRate}
                  onChange={(e) => setCustomLearningRate(parseFloat(e.target.value))}
                  className="w-full accent-purple-400 cursor-pointer"
                />

                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Target STDP LTP Amplitude (A+):</span>
                  <span className="text-emerald-300 font-bold">{customAplus.toFixed(3)}</span>
                </div>
                <input
                  type="range"
                  min="0.01"
                  max="0.06"
                  step="0.002"
                  value={customAplus}
                  onChange={(e) => setCustomAplus(parseFloat(e.target.value))}
                  className="w-full accent-emerald-400 cursor-pointer"
                />

                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Target STDP LTD Amplitude (A-):</span>
                  <span className="text-rose-300 font-bold">{customAminus.toFixed(3)}</span>
                </div>
                <input
                  type="range"
                  min="0.02"
                  max="0.08"
                  step="0.002"
                  value={customAminus}
                  onChange={(e) => setCustomAminus(parseFloat(e.target.value))}
                  className="w-full accent-rose-400 cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-sky-600/25 transition-all disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isLoading ? 'Running Guided Assessment...' : 'Run Guided Assessment with Fixes'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
