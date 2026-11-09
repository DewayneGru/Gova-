import React, { useState, useEffect } from 'react';
import {
  ModelDiagnosticRecommendation,
  SNNTuningConfig,
  UserGuidanceInput,
  SNNPersonalityProfile,
  STDPConfig,
  Synapse,
  UnifiedTelemetrySnapshot,
  ShadowTrialResult,
} from '../types';
import {
  Sparkles,
  CheckCircle2,
  Sliders,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Zap,
  Bot,
  MessageSquarePlus,
  Edit3,
  Volume2,
  VolumeX,
  Globe,
  ExternalLink,
  ShieldCheck,
  FolderOpen,
  Layers,
  FlaskConical,
  TrendingUp,
} from 'lucide-react';
import { AudioListenButton } from './AudioListenButton';
import { useAudioVoice } from '../context/AudioContext';
import { ModelGuidanceDialog } from './ModelGuidanceDialog';
import { SNNPersonalityManager } from './SNNPersonalityManager';
import { ModelTelemetryInspectionModal } from './ModelTelemetryInspectionModal';
import { SNNEngine } from '../lib/snnEngine';

interface ModelAdjustmentsCardProps {
  diagnostic: ModelDiagnosticRecommendation | null;
  activeTuning: SNNTuningConfig;
  currentStdpConfig?: STDPConfig;
  synapses?: Synapse[];
  engine?: SNNEngine;
  onApplyAdjustments: (adjustments?: Partial<SNNTuningConfig>) => void;
  onRevertBaseline: () => void;
  onRequestReAudit?: () => void;
  onRequestGuidedAssessment?: (guidance: UserGuidanceInput) => void;
  onApplyPersonality?: (profile: SNNPersonalityProfile) => void;
  onExportPersonality?: (
    name: string,
    description: string,
    category: SNNPersonalityProfile['category'],
    tags: string[]
  ) => SNNPersonalityProfile;
  onRunShadowTrial?: (adjustments?: Partial<SNNTuningConfig>) => ShadowTrialResult | null;
  onOpenTrendAnalyzer?: () => void;
  homeostaticScalingActive?: boolean;
  isLoading?: boolean;
}

export const ModelAdjustmentsCard: React.FC<ModelAdjustmentsCardProps> = ({
  diagnostic,
  activeTuning,
  currentStdpConfig,
  synapses,
  engine,
  onApplyAdjustments,
  onRevertBaseline,
  onRequestReAudit,
  onRequestGuidedAssessment,
  onApplyPersonality,
  onExportPersonality,
  onRunShadowTrial,
  onOpenTrendAnalyzer,
  homeostaticScalingActive = false,
  isLoading = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isGuidanceOpen, setIsGuidanceOpen] = useState(false);
  const [isEditingFixes, setIsEditingFixes] = useState(false);
  const [isTelemetryModalOpen, setIsTelemetryModalOpen] = useState(false);
  const {
    autoAudioReadout,
    setAutoAudioReadout,
    isAudioPlaying,
    stopAudio,
  } = useAudioVoice();

  // Fine-tuning draft state
  const [draftAplus, setDraftAplus] = useState(diagnostic?.parameters.aPlus.recommended ?? 0.032);
  const [draftAminus, setDraftAminus] = useState(diagnostic?.parameters.aMinus.recommended ?? 0.052);
  const [draftLR, setDraftLR] = useState(diagnostic?.parameters.learningRate.recommended ?? 0.40);
  const [draftTurn, setDraftTurn] = useState(diagnostic?.parameters.turnGain.recommended ?? 3.50);
  const [draftProx, setDraftProx] = useState(diagnostic?.parameters.proximityGain.recommended ?? 1.65);

  // Synchronize draft state when a new diagnostic or guidance result arrives
  useEffect(() => {
    if (diagnostic?.parameters) {
      setDraftAplus(diagnostic.parameters.aPlus.recommended);
      setDraftAminus(diagnostic.parameters.aMinus.recommended);
      setDraftLR(diagnostic.parameters.learningRate.recommended);
      setDraftTurn(diagnostic.parameters.turnGain.recommended);
      setDraftProx(diagnostic.parameters.proximityGain.recommended);
    }
  }, [diagnostic?.id, diagnostic?.timestamp]);

  if (!diagnostic) {
    return (
      <div className="bg-[#0b101e] border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col gap-3 relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-300">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-slate-100 tracking-wide uppercase">
                  SNN Model Plasticity Diagnostics & Closed-Loop Tuning
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-semibold">
                  Baseline Mode
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                Awaiting closed-loop neural audit • Biological plasticity invariants active
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onRequestReAudit && (
              <button
                onClick={onRequestReAudit}
                disabled={isLoading}
                className="px-3 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-sky-600/20 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isLoading ? 'Auditing SNN...' : 'Run Model Diagnostic Audit'}</span>
              </button>
            )}

            <button
              onClick={() => setIsGuidanceOpen(true)}
              className="px-3 py-1.5 bg-sky-950/80 hover:bg-sky-900 border border-sky-800 text-sky-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Recommend Fixes</span>
            </button>

            {engine && (
              <button
                onClick={() => setIsTelemetryModalOpen(true)}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-sky-500/50 text-slate-300 hover:text-sky-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                title="Inspect the exact 5-subsystem unified telemetry stream that Gemini ingests"
              >
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                <span>Inspect Ingested Telemetry (5 Pillars)</span>
              </button>
            )}

            {onApplyPersonality && onExportPersonality && currentStdpConfig && synapses && (
              <SNNPersonalityManager
                currentTuning={activeTuning}
                currentStdpConfig={currentStdpConfig}
                synapses={synapses}
                onApplyPersonality={onApplyPersonality}
                onExportPersonality={onExportPersonality}
              />
            )}
          </div>
        </div>

        {/* Current Active Specs Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-[11px]">
          <div className="bg-slate-950/80 p-2 rounded border border-slate-800/80">
            <span className="text-slate-500 block text-[9px]">LTP (A+)</span>
            <span className="text-emerald-400 font-bold">{activeTuning.aPlus.toFixed(3)}</span>
          </div>
          <div className="bg-slate-950/80 p-2 rounded border border-slate-800/80">
            <span className="text-slate-500 block text-[9px]">LTD (A-)</span>
            <span className="text-rose-400 font-bold">{activeTuning.aMinus.toFixed(3)}</span>
          </div>
          <div className="bg-slate-950/80 p-2 rounded border border-slate-800/80">
            <span className="text-slate-500 block text-[9px]">Learning Rate</span>
            <span className="text-sky-400 font-bold">{activeTuning.learningRate.toFixed(2)}</span>
          </div>
          <div className="bg-slate-950/80 p-2 rounded border border-slate-800/80">
            <span className="text-slate-500 block text-[9px]">Turn Gain</span>
            <span className="text-amber-400 font-bold">{activeTuning.turnGain.toFixed(2)}</span>
          </div>
          <div className="bg-slate-950/80 p-2 rounded border border-slate-800/80">
            <span className="text-slate-500 block text-[9px]">Afferent Gain</span>
            <span className="text-purple-400 font-bold">{activeTuning.proximityGain.toFixed(2)}</span>
          </div>
        </div>

        {/* Guidance Dialog Modal */}
        <ModelGuidanceDialog
          isOpen={isGuidanceOpen}
          onClose={() => setIsGuidanceOpen(false)}
          onSubmitGuidance={(guidance) => {
            setIsGuidanceOpen(false);
            if (onRequestGuidedAssessment) {
              onRequestGuidedAssessment(guidance);
            }
          }}
          isLoading={isLoading}
          activeTuning={activeTuning}
        />

        {/* Model Telemetry Inspection Modal */}
        <ModelTelemetryInspectionModal
          isOpen={isTelemetryModalOpen}
          onClose={() => setIsTelemetryModalOpen(false)}
          snapshot={engine ? engine.getUnifiedTelemetrySnapshot() : null}
          tuningConfig={activeTuning}
          onTriggerAudit={onRequestReAudit}
          isLoading={isLoading}
        />
      </div>
    );
  }

  // Check if current active parameters match the recommended ones
  const isAplusTuned = Math.abs(activeTuning.aPlus - diagnostic.parameters.aPlus.recommended) < 0.002;
  const isAminusTuned = Math.abs(activeTuning.aMinus - diagnostic.parameters.aMinus.recommended) < 0.002;
  const isLRTuned = Math.abs(activeTuning.learningRate - diagnostic.parameters.learningRate.recommended) < 0.02;
  const isTurnTuned = Math.abs(activeTuning.turnGain - diagnostic.parameters.turnGain.recommended) < 0.1;
  const isProxTuned = Math.abs(activeTuning.proximityGain - diagnostic.parameters.proximityGain.recommended) < 0.1;

  const allAdjustmentsApplied = isAplusTuned && isAminusTuned && isLRTuned && isTurnTuned && isProxTuned;

  return (
    <div className="bg-[#0b101e] border border-sky-500/30 rounded-xl p-4 shadow-lg flex flex-col gap-3 relative overflow-hidden transition-all">
      {/* Glow accent */}
      <div className="absolute top-0 right-0 w-48 h-16 bg-gradient-to-l from-sky-500/10 to-transparent pointer-events-none" />

      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-300">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-100 tracking-wide uppercase">
                Model's Last Diagnostic & Parameter Tuning
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-semibold">
                {diagnostic.model}
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Generated {new Date(diagnostic.timestamp).toLocaleTimeString()} • Closed-loop stability optimization
            </div>
          </div>
        </div>

        {/* Action badges and controls */}
        <div className="flex items-center gap-2">
          {allAdjustmentsApplied ? (
            <span className="flex items-center gap-1 text-[11px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-1 rounded font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Adjustments Active
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-1 rounded font-medium">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Pending Application
            </span>
          )}

          {/* Guide Model Button */}
          <button
            id="btn-open-model-guidance"
            onClick={() => setIsGuidanceOpen(true)}
            className="px-2.5 py-1 bg-gradient-to-r from-sky-600/30 to-indigo-600/30 hover:from-sky-600/50 hover:to-indigo-600/50 border border-sky-500/50 text-sky-200 rounded text-xs flex items-center gap-1.5 font-medium transition-all shadow-sm"
            title="Help the model with its assessment and recommend specific things to fix"
          >
            <MessageSquarePlus className="w-3.5 h-3.5 text-sky-400" />
            <span>Help Model & Recommend Fixes</span>
          </button>

          {engine && (
            <button
              onClick={() => setIsTelemetryModalOpen(true)}
              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-sky-500/50 text-slate-300 hover:text-sky-300 rounded text-xs flex items-center gap-1.5 font-medium transition-colors"
              title="Inspect the exact 5-subsystem unified telemetry stream that Gemini ingests"
            >
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              <span>Inspect Telemetry (5 Pillars)</span>
            </button>
          )}

          <AudioListenButton
            text={diagnostic.analysisText}
            voice="Kore"
            label="Listen to Model"
            variant="compact"
          />

          <button
            onClick={() => {
              if (isAudioPlaying) stopAudio();
              setAutoAudioReadout((prev: boolean) => !prev);
            }}
            className={`px-2 py-1 rounded text-xs flex items-center gap-1 font-medium transition-colors ${
              autoAudioReadout
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
            }`}
            title="Toggle Automatic Audio Readout for all model outputs"
          >
            {autoAudioReadout ? <Volume2 className="w-3 h-3 text-emerald-400" /> : <VolumeX className="w-3 h-3 text-slate-400" />}
            <span>Auto: {autoAudioReadout ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs flex items-center gap-1 font-medium transition-colors"
          >
            {isExpanded ? (
              <>
                <span>Hide Full Report</span>
                <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                <span>View Full Report</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Operator Guidance Active Banner if present */}
      {diagnostic.userGuidanceApplied && (
        <div className="bg-sky-950/40 border border-sky-500/30 rounded-lg p-2.5 flex items-start gap-2.5 text-xs animate-in fade-in duration-150">
          <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5 flex-1">
            <div className="text-sky-300 font-semibold flex items-center justify-between">
              <span>Human-Guided Assessment Applied</span>
              <span className="text-[10px] font-mono text-slate-400">
                Fixes Incorporated into Model Recommendations
              </span>
            </div>
            {diagnostic.userGuidanceApplied.focusAreas && diagnostic.userGuidanceApplied.focusAreas.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {diagnostic.userGuidanceApplied.focusAreas.map((area, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] font-mono bg-sky-500/20 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded"
                  >
                    ✓ {area}
                  </span>
                ))}
              </div>
            )}
            {diagnostic.userGuidanceApplied.notes && (
              <p className="text-slate-300 text-[11px] italic pt-0.5">
                "{diagnostic.userGuidanceApplied.notes}"
              </p>
            )}
          </div>
        </div>
      )}

      {/* Google Search Grounding & Literature Citations Banner if present */}
      {diagnostic.searchGrounding && (
        <div className="bg-purple-950/30 border border-purple-800/50 rounded-lg p-2.5 space-y-1.5 text-xs animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-purple-300 font-semibold text-xs">
            <span className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-purple-400" />
              <span>Google Search Grounding: Online Literature Citations</span>
            </span>
            <span className="text-[10px] font-mono text-purple-400 bg-purple-900/40 border border-purple-700/50 px-2 py-0.5 rounded">
              Empirical Literature Grounded
            </span>
          </div>

          {diagnostic.searchGrounding.searchQueries && diagnostic.searchGrounding.searchQueries.length > 0 && (
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-[10px] text-slate-400">Search Queries:</span>
              {diagnostic.searchGrounding.searchQueries.map((q, idx) => (
                <span
                  key={idx}
                  className="text-[9px] font-mono bg-purple-900/50 text-purple-200 border border-purple-700/60 px-1.5 py-0.2 rounded"
                >
                  "{q}"
                </span>
              ))}
            </div>
          )}

          {diagnostic.searchGrounding.sources && diagnostic.searchGrounding.sources.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-purple-900/40 font-mono text-[10px]">
              <span className="text-[10px] text-slate-400 block font-sans">Retrieved Empirical Sources:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {diagnostic.searchGrounding.sources.map((src, idx) => (
                  <a
                    key={idx}
                    href={src.url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-1.5 rounded bg-slate-950/70 border border-purple-900/50 text-purple-300 hover:text-purple-100 hover:border-purple-500 transition-colors"
                  >
                    <span className="truncate max-w-[240px]">{src.title}</span>
                    <ExternalLink className="w-2.5 h-2.5 text-purple-400 shrink-0 ml-1" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fine-Tuning Active Banner if editing */}
      {isEditingFixes && (
        <div className="bg-amber-950/40 border border-amber-500/40 rounded-lg p-2.5 flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Fine-Tuning Mode:</strong> Adjust the draft parameter values directly in the table below, then click <em>"Apply Custom Tuned Fixes to Simulation"</em>.
            </span>
          </div>
          <button
            onClick={() => {
              setDraftAplus(diagnostic.parameters.aPlus.recommended);
              setDraftAminus(diagnostic.parameters.aMinus.recommended);
              setDraftLR(diagnostic.parameters.learningRate.recommended);
              setDraftTurn(diagnostic.parameters.turnGain.recommended);
              setDraftProx(diagnostic.parameters.proximityGain.recommended);
            }}
            className="text-[11px] font-mono px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded"
          >
            Reset to Model Recommended
          </button>
        </div>
      )}

      {/* Proactive Homeostatic Scaling Active Banner */}
      {homeostaticScalingActive && (
        <div className="bg-rose-950/40 border border-rose-500/50 rounded-lg p-2.5 flex items-start gap-2.5 text-xs text-rose-200">
          <Zap className="w-4 h-4 text-rose-400 shrink-0 mt-0.5 animate-pulse" />
          <div className="space-y-0.5 flex-1">
            <div className="font-bold flex items-center justify-between text-rose-300">
              <span className="flex items-center gap-1.5">
                <span>Proactive Homeostatic Scaling Active</span>
              </span>
              <span className="text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded">
                DRI &gt; 0.35 Plasticity Safeguard
              </span>
            </div>
            <p className="text-rose-200/90 text-[11px] leading-relaxed">
              Live Divergence Risk Index exceeded 0.35 threshold. Proactively amplifying LTD depression ratio (+20%) and dampening learning rate (-25%) in real time to stabilize synaptic weights until DRI recovers below 0.25.
            </p>
          </div>
        </div>
      )}

      {/* Model Parameter Adjustments Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
              <th className="py-1.5 px-2">Hardware/STDP Parameter</th>
              <th className="py-1.5 px-2">Baseline</th>
              <th className={`py-1.5 px-2 ${isEditingFixes ? 'text-amber-300 font-bold' : 'text-sky-400'}`}>
                {isEditingFixes ? 'Custom Draft Tuning' : 'Model Recommended'}
              </th>
              <th className="py-1.5 px-2">Current Active</th>
              <th className="py-1.5 px-2">Engineering Justification</th>
              <th className="py-1.5 px-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-[11px]">
            {/* STDP A+ */}
            <tr className="hover:bg-slate-900/40 transition-colors">
              <td className="py-2 px-2 font-medium text-slate-200">
                STDP LTP Amplitude ($A_+$)
              </td>
              <td className="py-2 px-2 text-slate-400">{diagnostic.parameters.aPlus.current.toFixed(3)}</td>
              <td className="py-2 px-2 text-emerald-400 font-bold">
                {isEditingFixes ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setDraftAplus((p) => Math.max(0.01, +(p - 0.002).toFixed(3)))}
                      className="w-5 h-5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center justify-center font-bold"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="0.002"
                      min="0.01"
                      max="0.06"
                      value={draftAplus}
                      onChange={(e) => setDraftAplus(parseFloat(e.target.value) || 0)}
                      className="w-16 bg-slate-950 border border-amber-500/60 rounded px-1 py-0.5 text-amber-300 font-bold text-center text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setDraftAplus((p) => Math.min(0.06, +(p + 0.002).toFixed(3)))}
                      className="w-5 h-5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center justify-center font-bold"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  diagnostic.parameters.aPlus.recommended.toFixed(3)
                )}
              </td>
              <td className="py-2 px-2 font-bold text-sky-300">
                {activeTuning.aPlus.toFixed(3)}
              </td>
              <td className="py-2 px-2 text-slate-300 font-sans text-xs">
                {diagnostic.parameters.aPlus.justification}
              </td>
              <td className="py-2 px-2 text-center">
                {isAplusTuned ? (
                  <span className="text-emerald-400 font-sans text-xs">✓ Tuned</span>
                ) : (
                  <span className="text-amber-400 font-sans text-xs">Baseline</span>
                )}
              </td>
            </tr>

            {/* STDP A- */}
            <tr className="hover:bg-slate-900/40 transition-colors">
              <td className="py-2 px-2 font-medium text-slate-200">
                STDP LTD Amplitude ($A_-$)
              </td>
              <td className="py-2 px-2 text-slate-400">{diagnostic.parameters.aMinus.current.toFixed(3)}</td>
              <td className="py-2 px-2 text-rose-400 font-bold">
                {isEditingFixes ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setDraftAminus((p) => Math.max(0.02, +(p - 0.002).toFixed(3)))}
                      className="w-5 h-5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center justify-center font-bold"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="0.002"
                      min="0.02"
                      max="0.08"
                      value={draftAminus}
                      onChange={(e) => setDraftAminus(parseFloat(e.target.value) || 0)}
                      className="w-16 bg-slate-950 border border-amber-500/60 rounded px-1 py-0.5 text-amber-300 font-bold text-center text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setDraftAminus((p) => Math.min(0.08, +(p + 0.002).toFixed(3)))}
                      className="w-5 h-5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center justify-center font-bold"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  diagnostic.parameters.aMinus.recommended.toFixed(3)
                )}
              </td>
              <td className="py-2 px-2 font-bold text-sky-300">
                {activeTuning.aMinus.toFixed(3)}
              </td>
              <td className="py-2 px-2 text-slate-300 font-sans text-xs">
                {diagnostic.parameters.aMinus.justification}
              </td>
              <td className="py-2 px-2 text-center">
                {isAminusTuned ? (
                  <span className="text-emerald-400 font-sans text-xs">✓ Tuned</span>
                ) : (
                  <span className="text-amber-400 font-sans text-xs">Baseline</span>
                )}
              </td>
            </tr>

            {/* Learning Rate */}
            <tr className="hover:bg-slate-900/40 transition-colors">
              <td className="py-2 px-2 font-medium text-slate-200">
                STDP Learning Rate ($\eta$)
              </td>
              <td className="py-2 px-2 text-slate-400">{diagnostic.parameters.learningRate.current.toFixed(2)}</td>
              <td className="py-2 px-2 text-amber-300 font-bold">
                {isEditingFixes ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setDraftLR((p) => Math.max(0.1, +(p - 0.05).toFixed(2)))}
                      className="w-5 h-5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center justify-center font-bold"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      max="1.0"
                      value={draftLR}
                      onChange={(e) => setDraftLR(parseFloat(e.target.value) || 0)}
                      className="w-16 bg-slate-950 border border-amber-500/60 rounded px-1 py-0.5 text-amber-300 font-bold text-center text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setDraftLR((p) => Math.min(1.0, +(p + 0.05).toFixed(2)))}
                      className="w-5 h-5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center justify-center font-bold"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  diagnostic.parameters.learningRate.recommended.toFixed(2)
                )}
              </td>
              <td className="py-2 px-2 font-bold text-sky-300">
                {activeTuning.learningRate.toFixed(2)}
              </td>
              <td className="py-2 px-2 text-slate-300 font-sans text-xs">
                {diagnostic.parameters.learningRate.justification}
              </td>
              <td className="py-2 px-2 text-center">
                {isLRTuned ? (
                  <span className="text-emerald-400 font-sans text-xs">✓ Tuned</span>
                ) : (
                  <span className="text-amber-400 font-sans text-xs">Baseline</span>
                )}
              </td>
            </tr>

            {/* Associative Projection Gain */}
            <tr className="hover:bg-slate-900/40 transition-colors">
              <td className="py-2 px-2 font-medium text-slate-200">
                Associative Projection Gain
              </td>
              <td className="py-2 px-2 text-slate-400">{diagnostic.parameters.turnGain.current.toFixed(2)}</td>
              <td className="py-2 px-2 text-purple-400 font-bold">
                {isEditingFixes ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setDraftTurn((p) => Math.max(1.5, +(p - 0.1).toFixed(2)))}
                      className="w-5 h-5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center justify-center font-bold"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="0.1"
                      min="1.5"
                      max="6.0"
                      value={draftTurn}
                      onChange={(e) => setDraftTurn(parseFloat(e.target.value) || 0)}
                      className="w-16 bg-slate-950 border border-amber-500/60 rounded px-1 py-0.5 text-amber-300 font-bold text-center text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setDraftTurn((p) => Math.min(6.0, +(p + 0.1).toFixed(2)))}
                      className="w-5 h-5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center justify-center font-bold"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  diagnostic.parameters.turnGain.recommended.toFixed(2)
                )}
              </td>
              <td className="py-2 px-2 font-bold text-sky-300">
                {activeTuning.turnGain.toFixed(2)}
              </td>
              <td className="py-2 px-2 text-slate-300 font-sans text-xs">
                {diagnostic.parameters.turnGain.justification}
              </td>
              <td className="py-2 px-2 text-center">
                {isTurnTuned ? (
                  <span className="text-emerald-400 font-sans text-xs">✓ Tuned</span>
                ) : (
                  <span className="text-amber-400 font-sans text-xs">Baseline</span>
                )}
              </td>
            </tr>

            {/* Proximity Gain */}
            <tr className="hover:bg-slate-900/40 transition-colors">
              <td className="py-2 px-2 font-medium text-slate-200">
                Afferent Input Sensitivity
              </td>
              <td className="py-2 px-2 text-slate-400">{diagnostic.parameters.proximityGain.current.toFixed(2)}</td>
              <td className="py-2 px-2 text-cyan-400 font-bold">
                {isEditingFixes ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setDraftProx((p) => Math.max(0.5, +(p - 0.05).toFixed(2)))}
                      className="w-5 h-5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center justify-center font-bold"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="0.05"
                      min="0.5"
                      max="3.5"
                      value={draftProx}
                      onChange={(e) => setDraftProx(parseFloat(e.target.value) || 0)}
                      className="w-16 bg-slate-950 border border-amber-500/60 rounded px-1 py-0.5 text-amber-300 font-bold text-center text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setDraftProx((p) => Math.min(3.5, +(p + 0.05).toFixed(2)))}
                      className="w-5 h-5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center justify-center font-bold"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  diagnostic.parameters.proximityGain.recommended.toFixed(2)
                )}
              </td>
              <td className="py-2 px-2 font-bold text-sky-300">
                {activeTuning.proximityGain.toFixed(2)}
              </td>
              <td className="py-2 px-2 text-slate-300 font-sans text-xs">
                {diagnostic.parameters.proximityGain.justification}
              </td>
              <td className="py-2 px-2 text-center">
                {isProxTuned ? (
                  <span className="text-emerald-400 font-sans text-xs">✓ Tuned</span>
                ) : (
                  <span className="text-amber-400 font-sans text-xs">Baseline</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Shadow-Simulation Fast-Forward Validation Trial Verdict Banner */}
      {diagnostic.shadowValidation && (
        <div
          className={`p-3 rounded-lg border text-xs flex flex-col gap-1.5 transition-all ${
            diagnostic.shadowValidation.approved
              ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
              : 'bg-amber-950/30 border-amber-500/40 text-amber-200'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Shadow-Simulation Fast-Forward Validation (100 Ticks Sandbox)</span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold border ${
                  diagnostic.shadowValidation.approved
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}
              >
                {diagnostic.shadowValidation.approved ? 'APPROVED / ZERO DRIFT DIVERGENCE' : 'ELEVATED RISK CLAMPED'}
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700">
              Projected DRI: {diagnostic.shadowValidation.projectedDri.toFixed(2)} (Δ {diagnostic.shadowValidation.deltaDri >= 0 ? `+${diagnostic.shadowValidation.deltaDri.toFixed(3)}` : diagnostic.shadowValidation.deltaDri.toFixed(3)})
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] pt-1">
            <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/80">
              <span className="text-slate-400 block text-[9px]">Trial Duration</span>
              <span className="text-white font-semibold">{diagnostic.shadowValidation.executionTimeMs} ms</span>
            </div>
            <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/80">
              <span className="text-slate-400 block text-[9px]">Saturation Ratio</span>
              <span className="text-white font-semibold">{(diagnostic.shadowValidation.weightSaturationRatio * 100).toFixed(0)}%</span>
            </div>
            <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/80">
              <span className="text-slate-400 block text-[9px]">Projected Mean Rate</span>
              <span className="text-white font-semibold">{diagnostic.shadowValidation.projectedMeanHz} Hz</span>
            </div>
            <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/80">
              <span className="text-slate-400 block text-[9px]">Cumulative STDP Drift</span>
              <span className="text-white font-semibold">{diagnostic.shadowValidation.cumulativeStdpDrift}</span>
            </div>
          </div>

          {diagnostic.shadowValidation.warnings && diagnostic.shadowValidation.warnings.length > 0 && (
            <div className="text-[11px] text-amber-300/90 pt-1 flex items-start gap-1">
              <span className="text-amber-400 font-bold shrink-0">Audit Warning:</span>
              <span>{diagnostic.shadowValidation.warnings.join(' • ')}</span>
            </div>
          )}
        </div>
      )}

      {/* Control Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              if (isEditingFixes) {
                onApplyAdjustments({
                  aPlus: draftAplus,
                  aMinus: draftAminus,
                  learningRate: draftLR,
                  turnGain: draftTurn,
                  proximityGain: draftProx,
                });
                setIsEditingFixes(false);
              } else {
                onApplyAdjustments({
                  aPlus: diagnostic.parameters.aPlus.recommended,
                  aMinus: diagnostic.parameters.aMinus.recommended,
                  learningRate: diagnostic.parameters.learningRate.recommended,
                  turnGain: diagnostic.parameters.turnGain.recommended,
                  proximityGain: diagnostic.parameters.proximityGain.recommended,
                });
              }
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow ${
              allAdjustmentsApplied && !isEditingFixes
                ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 cursor-default'
                : 'bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white shadow-sky-600/25 cursor-pointer'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {isEditingFixes
                ? 'Apply Custom Tuned Fixes to Simulation'
                : allAdjustmentsApplied
                ? 'Model Adjustments Currently Applied'
                : 'Apply Model Adjustments to Live Simulation'}
            </span>
          </button>

          <button
            onClick={() => {
              if (!isEditingFixes) {
                setDraftAplus(diagnostic.parameters.aPlus.recommended);
                setDraftAminus(diagnostic.parameters.aMinus.recommended);
                setDraftLR(diagnostic.parameters.learningRate.recommended);
                setDraftTurn(diagnostic.parameters.turnGain.recommended);
                setDraftProx(diagnostic.parameters.proximityGain.recommended);
              }
              setIsEditingFixes((prev) => !prev);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              isEditingFixes
                ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{isEditingFixes ? 'Cancel Custom Tweak' : 'Fine-Tune Fixes'}</span>
          </button>

          {onRunShadowTrial && (
            <button
              onClick={() => {
                const candidate = isEditingFixes
                  ? {
                      aPlus: draftAplus,
                      aMinus: draftAminus,
                      learningRate: draftLR,
                      turnGain: draftTurn,
                      proximityGain: draftProx,
                    }
                  : {
                      aPlus: diagnostic?.parameters.aPlus.recommended,
                      aMinus: diagnostic?.parameters.aMinus.recommended,
                      learningRate: diagnostic?.parameters.learningRate.recommended,
                      turnGain: diagnostic?.parameters.turnGain.recommended,
                      proximityGain: diagnostic?.parameters.proximityGain.recommended,
                    };
                onRunShadowTrial(candidate);
              }}
              className="px-3 py-1.5 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/80 text-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              title="Test candidate parameters on a cloned virtual SNN network for 100 fast-forward ticks before applying"
            >
              <FlaskConical className="w-3.5 h-3.5 text-indigo-400" />
              <span>Run Shadow Trial (100 Ticks)</span>
            </button>
          )}

          {onOpenTrendAnalyzer && (
            <button
              onClick={onOpenTrendAnalyzer}
              className="px-3 py-1.5 bg-gradient-to-r from-indigo-900/90 to-purple-900/90 hover:from-indigo-800 hover:to-purple-800 border border-indigo-500/50 text-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer hover:border-indigo-400"
              title="Launch Diagnostic Trend Analyzer: multi-epoch longitudinal regression and plasticity bottleneck preemption"
            >
              <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
              <span>Diagnostic Trend Analyzer</span>
            </button>
          )}

          <button
            onClick={onRevertBaseline}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Revert to Baseline</span>
          </button>

          {onApplyPersonality && onExportPersonality && currentStdpConfig && synapses && (
            <SNNPersonalityManager
              currentTuning={activeTuning}
              currentStdpConfig={currentStdpConfig}
              synapses={synapses}
              onApplyPersonality={onApplyPersonality}
              onExportPersonality={onExportPersonality}
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsGuidanceOpen(true)}
            className="px-3 py-1.5 bg-sky-950/80 hover:bg-sky-900 border border-sky-800 text-sky-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Recommend Fixes to Model</span>
          </button>

          {onRequestReAudit && (
            <button
              onClick={onRequestReAudit}
              disabled={isLoading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Re-Audit Baseline</span>
            </button>
          )}
        </div>
      </div>

      {/* Expanded Full Diagnostic Report */}
      {isExpanded && (
        <div className="mt-2 p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 font-sans leading-relaxed whitespace-pre-wrap animate-in fade-in duration-200">
          <div className="text-[11px] font-mono text-sky-400 font-semibold mb-2 pb-1 border-b border-slate-800 flex justify-between items-center">
            <span>Raw Model Output & Deductions</span>
            <AudioListenButton text={diagnostic.analysisText} voice="Kore" label="Listen" variant="compact" />
          </div>
          {diagnostic.analysisText}
        </div>
      )}

      {/* Guidance Dialog Modal */}
      <ModelGuidanceDialog
        isOpen={isGuidanceOpen}
        onClose={() => setIsGuidanceOpen(false)}
        onSubmitGuidance={(guidance) => {
          setIsGuidanceOpen(false);
          if (onRequestGuidedAssessment) {
            onRequestGuidedAssessment(guidance);
          }
        }}
        isLoading={isLoading}
        activeTuning={activeTuning}
      />

      {/* Model Telemetry Inspection Modal */}
      <ModelTelemetryInspectionModal
        isOpen={isTelemetryModalOpen}
        onClose={() => setIsTelemetryModalOpen(false)}
        snapshot={engine ? engine.getUnifiedTelemetrySnapshot() : null}
        tuningConfig={activeTuning}
        onTriggerAudit={onRequestReAudit}
        isLoading={isLoading}
      />
    </div>
  );
};
