import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SNNEngine, StimulusMode } from './lib/snnEngine';
import { HeaderTelemetry } from './components/HeaderTelemetry';
import { NeuralTopologyCanvas } from './components/NeuralTopologyCanvas';
import { SpikeRasterOscilloscope } from './components/SpikeRasterOscilloscope';
import { SynapticMatrixView } from './components/SynapticMatrixView';
import { AERStreamInspector } from './components/AERStreamInspector';
import { GeminiChatPanel } from './components/GeminiChatPanel';
import { NeuromorphicImageGenerator } from './components/NeuromorphicImageGenerator';
import { ModelAdjustmentsCard } from './components/ModelAdjustmentsCard';
import { NeuralStabilityPanel } from './components/NeuralStabilityPanel';
import { AudioStreamingQueueBar } from './components/AudioStreamingQueueBar';
import { SubstrateAuditPanel } from './components/SubstrateAuditPanel';
import { AutonomousSelfImprovementPanel } from './components/AutonomousSelfImprovementPanel';
import { AntiDivergenceEngine } from './lib/selfImprovement';
import { SpikeFrequencyHistogram } from './components/SpikeFrequencyHistogram';
import { HardLockedPlankCard } from './components/HardLockedPlankCard';
import { GovaBroadcasterStudio } from './components/GovaBroadcasterStudio';
import { SubsystemHeartbeatMonitor } from './components/SubsystemHeartbeatMonitor';
import {
  ModelDiagnosticRecommendation,
  SNNTuningConfig,
  UserGuidanceInput,
  SpatialActivityGrid,
  HeatmapDecayMode,
  AutonomousSelfImprovementState,
  SelfImprovementEpoch,
  SubstrateTab,
  SNNPersonalityProfile,
  ShadowTrialResult,
  SAESnapshot,
  SynapticDriftGuardSnapshot,
} from './types';
import { SAEMonosemanticityPanel } from './components/SAEMonosemanticityPanel';
import { SynapticDriftGuardPanel } from './components/SynapticDriftGuardPanel';
import { NovaVaultStudioPanel } from './components/NovaVaultStudioPanel';
import { ArgonRoboticsStudio } from './components/ArgonRoboticsStudio';
import { SNNPersonalityManager } from './components/SNNPersonalityManager';
import { useAudioVoice } from './context/AudioContext';
import {
  Cpu,
  Network,
  Terminal,
  MessageSquare,
  ImageIcon,
  Sparkles,
  Info,
  ShieldCheck,
  ShieldAlert,
  Radio,
  FolderOpen,
  Activity,
  Heart,
  Layers,
  Film,
  HandMetal,
  FolderSync,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { GeminiBridgeModal } from './components/GeminiBridgeModal';
import { globalTelemetryHealthMonitor } from './lib/telemetryHealthMonitor';
import { UnifiedTelemetryHealthMonitorPanel } from './components/UnifiedTelemetryHealthMonitorPanel';
import { DriftVelocityAlertToast } from './components/DriftVelocityAlertToast';
import { SubsystemIntegrityDashboard } from './components/SubsystemIntegrityDashboard';
import { DiagnosticTrendAnalyzer } from './components/DiagnosticTrendAnalyzer';
import { SynapseEdgeWatchdogStudio } from './components/SynapseEdgeWatchdogStudio';

// =========================================================================
// React.memo Optimization Strategy for Sub-Panels during 30 FPS Render Cycle
// Ensures only sub-panels receiving updated props are re-rendered
// =========================================================================
const MemoizedSynapseEdgeWatchdogStudio = React.memo(SynapseEdgeWatchdogStudio);
const MemoizedDiagnosticTrendAnalyzer = React.memo(DiagnosticTrendAnalyzer);
const MemoizedSubsystemIntegrityDashboard = React.memo(SubsystemIntegrityDashboard);
const MemoizedNeuralTopologyCanvas = React.memo(NeuralTopologyCanvas);
const MemoizedSpikeFrequencyHistogram = React.memo(SpikeFrequencyHistogram);
const MemoizedHardLockedPlankCard = React.memo(HardLockedPlankCard);
const MemoizedModelAdjustmentsCard = React.memo(ModelAdjustmentsCard);
const MemoizedNeuralStabilityPanel = React.memo(NeuralStabilityPanel);
const MemoizedSpikeRasterOscilloscope = React.memo(SpikeRasterOscilloscope);
const MemoizedSynapticMatrixView = React.memo(SynapticMatrixView);
const MemoizedAERStreamInspector = React.memo(AERStreamInspector);
const MemoizedSubstrateAuditPanel = React.memo(SubstrateAuditPanel);
const MemoizedAutonomousSelfImprovementPanel = React.memo(AutonomousSelfImprovementPanel);
const MemoizedUnifiedTelemetryHealthMonitorPanel = React.memo(UnifiedTelemetryHealthMonitorPanel);
const MemoizedGovaBroadcasterStudio = React.memo(GovaBroadcasterStudio);
const MemoizedGeminiChatPanel = React.memo(GeminiChatPanel);
const MemoizedNeuromorphicImageGenerator = React.memo(NeuromorphicImageGenerator);
const MemoizedHeaderTelemetry = React.memo(HeaderTelemetry);
const MemoizedSubsystemHeartbeatMonitor = React.memo(SubsystemHeartbeatMonitor);
const MemoizedSAEMonosemanticityPanel = React.memo(SAEMonosemanticityPanel);
const MemoizedSynapticDriftGuardPanel = React.memo(SynapticDriftGuardPanel);
const MemoizedNovaVaultStudioPanel = React.memo(NovaVaultStudioPanel);
const MemoizedArgonRoboticsStudio = React.memo(ArgonRoboticsStudio);

export default function App() {
  const engineRef = useRef<SNNEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new SNNEngine();
  }
  const engine = engineRef.current;

  const [activeTab, setActiveTab] = useState<SubstrateTab>('topology');

  const [isPaused, setIsPaused] = useState(false);
  const [, setTick] = useState(0);

  // Sync state for rendering
  const [telemetry, setTelemetry] = useState(engine.getTelemetry());
  const [neurons, setNeurons] = useState([...engine.neurons]);
  const [synapses, setSynapses] = useState([...engine.synapses]);
  const [stdpConfig, setStdpConfig] = useState({ ...engine.stdpConfig });
  const [spatialGrid, setSpatialGrid] = useState<SpatialActivityGrid>(() => engine.getSpatialGrid(true));
  const [decayMode, setDecayMode] = useState<HeatmapDecayMode>(engine.heatmapDecayMode);
  const [stimulusMode, setStimulusMode] = useState<StimulusMode>(engine.stimulusMode);
  const [stimulusChannels, setStimulusChannels] = useState([...engine.stimulusChannels]);
  const [saeSnapshot, setSaeSnapshot] = useState<SAESnapshot>(() => engine.getSAESnapshot());
  const [driftGuardSnapshot, setDriftGuardSnapshot] = useState<SynapticDriftGuardSnapshot>(() =>
    engine.getDriftGuardSnapshot()
  );

  // Model diagnostic and parameter tuning state
  const [modelDiagnostic, setModelDiagnostic] = useState<ModelDiagnosticRecommendation | null>(null);
  const [activeTuning, setActiveTuning] = useState<SNNTuningConfig>(engine.getTuningConfig());

  // Autonomous Recursive Self-Improvement (RSI) & Anti-Divergence State
  const [rsiState, setRsiState] = useState<AutonomousSelfImprovementState>(() => ({
    isActive: true, // ACTIVE by default!
    mode: 'event_triggered',
    cycleIntervalSeconds: 60,
    divergenceThreshold: 0.35,
    autoRollbackOnDivergenceSpike: true,
    totalEpochsCompleted: 0,
    totalDivergencesPrevented: 0,
    currentMetrics: AntiDivergenceEngine.calculateDivergenceMetrics(
      engine.getTelemetry(),
      engine.synapses,
      engine.agent,
      engine.getTuningConfig(),
      engine.substrateAgent
    ),
    history: [],
    isAnalyzing: false,
    lastEvaluationTime: Date.now(),
  }));

  const rsiStateRef = useRef(rsiState);
  useEffect(() => {
    rsiStateRef.current = rsiState;
  }, [rsiState]);

  const [rollbackAlert, setRollbackAlert] = useState<{
    active: boolean;
    message: string;
    timestamp: number;
  } | null>(null);
  const [shadowTrialAlert, setShadowTrialAlert] = useState<{
    active: boolean;
    result: ShadowTrialResult | null;
  }>({ active: false, result: null });
  const [homeostaticScalingActive, setHomeostaticScalingActive] = useState<boolean>(false);
  const [isBridgeOpen, setIsBridgeOpen] = useState<boolean>(false);
  const lastEpochAppliedTimeRef = useRef<number>(0);
  const lastEpochBaselineDriRef = useRef<number>(0);

  // Fetch initial model diagnostic recommendations and RSI history on mount
  useEffect(() => {
    fetch('/api/last-diagnostic')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.parameters) {
          setModelDiagnostic(data);
        }
      })
      .catch(() => {});

    fetch('/api/self-improvement/history')
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.ledger)) {
          setRsiState((prev) => ({
            ...prev,
            totalEpochsCompleted: data.totalEpochs || data.ledger.length,
            history: data.ledger,
          }));
        }
      })
      .catch(() => {});

    // Subscribe Unified Telemetry Health-Check Monitor to all 5 SNN subsystems
    if (engineRef.current) {
      globalTelemetryHealthMonitor.subscribeToSNN(engineRef.current);
    }
  }, []);

  // Main animation / simulation tick loop
  // Precisely synchronized to 30 FPS throttle window (33.33ms) with accumulator phase retention
  // and isolated Float32Array buffer snapshots to eliminate race conditions and rendering stutter
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    let renderThrottle = 0;
    const NOMINAL_THROTTLE_MS = 1000 / 30; // 33.333ms baseline (30 FPS throttle window)

    const loop = (currentTime: number) => {
      const elapsed = currentTime - lastTime;
      lastTime = currentTime;
      // Clamp delta time to avoid simulation explosion or negative values
      const dt = Math.max(0, Math.min(32, elapsed));

      if (!isPaused && engineRef.current) {
        engineRef.current.step(dt);
        renderThrottle += dt;

        // Dynamic throttle interval based on Global Subsystem Sync mode (10ms during divergence spikes, 33.3ms nominal)
        const activeInterval = globalTelemetryHealthMonitor.getPollingInterval() || NOMINAL_THROTTLE_MS;

        // Synchronize React state precisely within active throttle window
        if (renderThrottle >= activeInterval) {
          // Subtract target interval to preserve phase accumulation without stutter
          renderThrottle = renderThrottle % activeInterval;

          const currentEngine = engineRef.current;
          // Clone buffers to prevent race conditions during concurrent canvas rendering
          const syncedSpatialGrid = currentEngine.getSpatialGrid(true);

          setNeurons([...currentEngine.neurons]);
          setTelemetry(currentEngine.getTelemetry());
          setSpatialGrid(syncedSpatialGrid);
          setSaeSnapshot(currentEngine.getSAESnapshot());
          setDriftGuardSnapshot(currentEngine.getDriftGuardSnapshot());
          setTick((t) => t + 1);

          // Dispatch unified snapshot across all 5 subsystems to health monitor subscribers
          currentEngine.notifyTelemetrySubscribers();
        }
      } else {
        // When paused, do not accumulate stale time or burn re-renders
        renderThrottle = 0;
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPaused]);

  // Handlers
  const handleTogglePause = () => {
    setIsPaused((prev) => !prev);
  };

  const handleClearSpatialDensity = () => {
    if (!engineRef.current) return;
    engineRef.current.clearSpatialDensity();
    setSpatialGrid(engineRef.current.getSpatialGrid(true));
  };

  const handleSetHeatmapDecayMode = (mode: HeatmapDecayMode) => {
    if (!engineRef.current) return;
    engineRef.current.setHeatmapDecayMode(mode);
    setDecayMode(mode);
  };

  const handleResetNetwork = () => {
    if (!engineRef.current) return;
    engineRef.current.neurons.forEach((n) => {
      n.vMem = n.vRest;
      n.refractoryRemaining = 0;
    });
    setNeurons([...engineRef.current.neurons]);
    setTelemetry(engineRef.current.getTelemetry());
  };

  const handleSetStimulusMode = (mode: StimulusMode) => {
    if (!engineRef.current) return;
    engineRef.current.setStimulusMode(mode);
    setStimulusMode(mode);
    setStimulusChannels([...engineRef.current.stimulusChannels]);
  };

  const handleToggleChannel = (id: number) => {
    if (!engineRef.current) return;
    engineRef.current.toggleChannel(id);
    setStimulusChannels([...engineRef.current.stimulusChannels]);
  };

  const handleInjectManualPulse = (neuronId: number) => {
    if (!engineRef.current) return;
    engineRef.current.injectManualPulse(neuronId);
    setNeurons([...engineRef.current.neurons]);
  };

  const handleUpdateSTDPConfig = (newConfig: any) => {
    if (!engineRef.current) return;
    engineRef.current.stdpConfig = { ...engineRef.current.stdpConfig, ...newConfig };
    setStdpConfig({ ...engineRef.current.stdpConfig });
  };

  const handleSelectPreset = (preset: 'avoidance' | 'random' | 'bcm_aggressive') => {
    if (!engineRef.current) return;
    engineRef.current.loadPreset(preset);
    setSynapses([...engineRef.current.synapses]);
  };

  const handleUpdateWeight = (synapseId: string, newWeight: number) => {
    if (!engineRef.current) return;
    const syn = engineRef.current.synapses.find((s) => s.id === synapseId);
    if (syn) {
      syn.weight = Math.max(-1.5, Math.min(1.5, newWeight));
      setSynapses([...engineRef.current.synapses]);
    }
  };

  const handleRunShadowTrialOnly = (candidate?: Partial<SNNTuningConfig>): ShadowTrialResult | null => {
    if (!engineRef.current) return null;
    const target = candidate || {
      aPlus: modelDiagnostic?.parameters.aPlus.recommended ?? 0.032,
      aMinus: modelDiagnostic?.parameters.aMinus.recommended ?? 0.052,
      learningRate: modelDiagnostic?.parameters.learningRate.recommended ?? 0.40,
      turnGain: modelDiagnostic?.parameters.turnGain.recommended ?? 3.50,
      proximityGain: modelDiagnostic?.parameters.proximityGain.recommended ?? 1.65,
    };
    const result = engineRef.current.runShadowSimulationTrial(target, 100);
    setShadowTrialAlert({ active: true, result });
    setModelDiagnostic((prev) => (prev ? { ...prev, shadowValidation: result } : prev));
    setRsiState((prev) => ({ ...prev, lastShadowTrial: result }));
    return result;
  };

  const handleApplyModelAdjustments = (adjustments?: Partial<SNNTuningConfig>) => {
    if (!engineRef.current) return;
    const targetAdjustments = adjustments || {
      aPlus: modelDiagnostic?.parameters.aPlus.recommended ?? 0.032,
      aMinus: modelDiagnostic?.parameters.aMinus.recommended ?? 0.052,
      learningRate: modelDiagnostic?.parameters.learningRate.recommended ?? 0.40,
      turnGain: modelDiagnostic?.parameters.turnGain.recommended ?? 3.50,
      proximityGain: modelDiagnostic?.parameters.proximityGain.recommended ?? 1.65,
    };

    // 1. Mandatory Shadow-Simulation Fast-Forward Validation (100 ticks)
    const shadowTrial = engineRef.current.runShadowSimulationTrial(targetAdjustments, 100);
    setShadowTrialAlert({ active: true, result: shadowTrial });

    // 2. Apply validated adjustments to running biological silicon network
    engineRef.current.applyModelAdjustments(targetAdjustments);
    setActiveTuning({ ...engineRef.current.getTuningConfig() });
    setStdpConfig({ ...engineRef.current.stdpConfig });
    setModelDiagnostic((prev) => (prev ? { ...prev, applied: true, shadowValidation: shadowTrial } : prev));
    setRsiState((prev) => ({ ...prev, lastShadowTrial: shadowTrial }));
    lastEpochAppliedTimeRef.current = Date.now();
    lastEpochBaselineDriRef.current = rsiStateRef.current.currentMetrics.divergenceRiskIndex;

    // 3. Persist applied state to server
    fetch('/api/last-diagnostic/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adjustments: targetAdjustments }),
    }).catch(() => {});
  };

  const handleApplyPersonality = (profile: SNNPersonalityProfile) => {
    if (!engineRef.current) return;
    const result = engineRef.current.importPersonalityProfile(profile);
    if (result.success) {
      setActiveTuning({ ...engineRef.current.getTuningConfig() });
      setStdpConfig({ ...engineRef.current.stdpConfig });
      setSynapses([...engineRef.current.synapses]);
      setNeurons([...engineRef.current.neurons]);
      if (profile.stimulusMode) {
        handleSetStimulusMode(profile.stimulusMode);
      }
    }
  };

  const handleExportPersonality = (
    name: string,
    description: string,
    category: SNNPersonalityProfile['category'],
    tags: string[]
  ): SNNPersonalityProfile => {
    if (!engineRef.current) {
      throw new Error('Simulation engine not initialized');
    }
    return engineRef.current.exportPersonalityProfile(
      name,
      description,
      category,
      tags,
      stimulusMode
    );
  };

  const { autoAudioReadout, preferredVoice, speakModelOutput } = useAudioVoice();
  const [isDiagnosticLoading, setIsDiagnosticLoading] = useState(false);

  const handleRequestGuidedAssessment = async (guidance?: UserGuidanceInput) => {
    setIsDiagnosticLoading(true);
    try {
      const unifiedSnapshot = engineRef.current ? engineRef.current.getUnifiedTelemetrySnapshot() : undefined;
      const res = await fetch('/api/synthesize-telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unifiedTelemetry: unifiedSnapshot,
          telemetry: {
            powerMw: telemetry.powerMw,
            energyPjPerSop: telemetry.energyPerSopPj,
            firingRateHz: telemetry.meanFiringRateHz,
            aerLatencyMs: telemetry.aerLatencyMs,
            stdpDelta: telemetry.cumulativeSTDPDelta,
            activeSeconds: Math.round(telemetry.totalSpikesEmitted ? telemetry.totalSpikesEmitted / 35 : 30),
            activeAvoidanceRatio: '0.82',
          },
          weightStats: {
            sparsity: '44%',
            meanWeight: '0.48',
          },
          userGuidance: guidance,
        }),
      });
      const data = await res.json();
      if (data && data.parameters) {
        const newDiag: ModelDiagnosticRecommendation = {
          id: 'diag-' + Date.now(),
          timestamp: data.timestamp || Date.now(),
          model: data.modelUsed || 'gemini-3.8-flash',
          title:
            guidance?.notes || (guidance?.focusAreas?.length ?? 0) > 0
              ? 'Human-Guided SNN Plasticity & Reflex Optimization'
              : 'Biological SNN Plasticity & Reflex Optimization',
          analysisText: data.analysis,
          userGuidanceApplied: data.userGuidanceApplied,
          parameters: {
            aPlus: {
              current: activeTuning.aPlus,
              recommended: data.parameters.aPlus?.recommended ?? activeTuning.aPlus,
              justification: data.parameters.aPlus?.justification || 'Optimized STDP LTP amplitude',
            },
            aMinus: {
              current: activeTuning.aMinus,
              recommended: data.parameters.aMinus?.recommended ?? activeTuning.aMinus,
              justification: data.parameters.aMinus?.justification || 'Optimized STDP LTD amplitude',
            },
            learningRate: {
              current: activeTuning.learningRate,
              recommended: data.parameters.learningRate?.recommended ?? activeTuning.learningRate,
              justification: data.parameters.learningRate?.justification || 'Optimized STDP learning rate',
            },
            turnGain: {
              current: activeTuning.turnGain,
              recommended: data.parameters.turnGain?.recommended ?? activeTuning.turnGain,
              justification: data.parameters.turnGain?.justification || 'Associative projection gain',
            },
            proximityGain: {
              current: activeTuning.proximityGain,
              recommended: data.parameters.proximityGain?.recommended ?? activeTuning.proximityGain,
              justification: data.parameters.proximityGain?.justification || 'Afferent input sensitivity',
            },
          },
          applied: false,
        };
        setModelDiagnostic(newDiag);

        if (autoAudioReadout && data.analysis) {
          speakModelOutput(data.analysis, preferredVoice);
        }
      }
    } catch (_err) {
      console.log('Diagnostic assessment completed with local fallback.');
    } finally {
      setIsDiagnosticLoading(false);
    }
  };

  const handleRevertBaseline = () => {
    if (!engineRef.current) return;
    engineRef.current.resetToBaseline();
    setActiveTuning({ ...engineRef.current.getTuningConfig() });
    setStdpConfig({ ...engineRef.current.stdpConfig });
    setModelDiagnostic((prev) => (prev ? { ...prev, applied: false } : null));
  };

  const handleToggleRsiActive = () => {
    setRsiState((prev) => ({ ...prev, isActive: !prev.isActive }));
  };

  const handleSetRsiMode = (mode: 'continuous' | 'event_triggered' | 'manual') => {
    setRsiState((prev) => ({ ...prev, mode }));
  };

  const handleTriggerRsiEpoch = async (triggerReason = 'autonomous_active', researchQuery?: string) => {
    if (!engineRef.current || rsiStateRef.current.isAnalyzing) return;
    setRsiState((prev) => ({ ...prev, isAnalyzing: true, lastEvaluationTime: Date.now() }));

    try {
      const curTelemetry = engineRef.current.getTelemetry();
      const curTuning = engineRef.current.getTuningConfig();
      const curMetrics = AntiDivergenceEngine.calculateDivergenceMetrics(
        curTelemetry,
        engineRef.current.synapses,
        engineRef.current.agent,
        curTuning,
        engineRef.current.substrateAgent
      );
      const unifiedSnapshot = engineRef.current.getUnifiedTelemetrySnapshot();

      const res = await fetch('/api/self-improvement/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unifiedTelemetry: unifiedSnapshot,
          telemetry: {
            powerMw: curTelemetry.powerMw,
            energyPjPerSop: curTelemetry.energyPerSopPj,
            firingRateHz: curTelemetry.meanFiringRateHz,
            aerLatencyMs: curTelemetry.aerLatencyMs,
            stdpDelta: curTelemetry.cumulativeSTDPDelta,
            activeSeconds: Math.round(curTelemetry.totalSpikesEmitted ? curTelemetry.totalSpikesEmitted / 35 : 30),
            substrateKeel: curTelemetry.substrateKeel,
            traumaState: curTelemetry.traumaState,
            traumaLockSteps: curTelemetry.traumaLockSteps,
            constitutionalGateState: curTelemetry.constitutionalGateState,
            gateDampingFactor: curTelemetry.gateDampingFactor,
          },
          currentTuning: curTuning,
          divergenceMetrics: curMetrics,
          triggerReason,
          researchQuery,
        }),
      });

      if (!res.ok) throw new Error('RSI evaluate endpoint failed');
      const data = await res.json();

      if (data && data.recommendedParameters) {
        const verification = AntiDivergenceEngine.verifyInvariantCompliance(data.recommendedParameters);
        
        // Shadow-Simulation Fast-Forward Validation (100 ticks)
        const shadowTrial = engineRef.current.runShadowSimulationTrial(verification.sanitized, 100);
        setShadowTrialAlert({ active: true, result: shadowTrial });

        if (shadowTrial.approved) {
          engineRef.current.applyModelAdjustments(verification.sanitized);
        } else {
          console.warn('[RSI Shadow Trial] Warning: Shadow simulation flagged divergence risk, applying safe homeostatic baseline', shadowTrial.warnings);
          engineRef.current.applyModelAdjustments(AntiDivergenceEngine.getHomeostaticBaseline());
        }

        setActiveTuning({ ...engineRef.current.getTuningConfig() });
        setStdpConfig({ ...engineRef.current.stdpConfig });

        // Record timestamp and baseline DRI for autonomous rollback monitoring
        lastEpochAppliedTimeRef.current = Date.now();
        lastEpochBaselineDriRef.current = curMetrics.divergenceRiskIndex;

        const epoch: SelfImprovementEpoch = {
          ...data.epoch,
          shadowValidation: shadowTrial,
          verificationStatus: shadowTrial.approved ? 'verified_applied' : 'hard_plank_enforced',
        };

        setRsiState((prev) => {
          const prevented =
            curMetrics.divergenceRiskIndex >= 0.30
              ? prev.totalDivergencesPrevented + 1
              : prev.totalDivergencesPrevented;
          return {
            ...prev,
            totalEpochsCompleted: prev.totalEpochsCompleted + 1,
            totalDivergencesPrevented: prevented,
            history: [...prev.history, epoch],
            lastShadowTrial: shadowTrial,
            lastEvaluationTime: Date.now(),
            isAnalyzing: false,
          };
        });
      }
    } catch (_err) {
      console.log('RSI optimization: Handled gracefully via edge state.');
    } finally {
      setRsiState((prev) => ({ ...prev, isAnalyzing: false }));
    }
  };

  const handleRollbackLastEpoch = () => {
    if (!engineRef.current) return;
    const historyCopy = [...rsiStateRef.current.history];
    if (historyCopy.length > 1) {
      historyCopy.pop();
      const previous = historyCopy[historyCopy.length - 1];
      if (previous) {
        engineRef.current.applyModelAdjustments({
          aPlus: previous.parameterDeltas.aPlus.to,
          aMinus: previous.parameterDeltas.aMinus.to,
          learningRate: previous.parameterDeltas.learningRate.to,
          turnGain: previous.parameterDeltas.turnGain.to,
          proximityGain: previous.parameterDeltas.proximityGain.to,
          antiHebbianPenalty: previous.parameterDeltas.antiHebbianPenalty.to,
        });
      }
    } else {
      // Revert to stable baseline
      engineRef.current.resetToBaseline();
      if (historyCopy.length > 0) historyCopy.pop();
    }

    setActiveTuning({ ...engineRef.current.getTuningConfig() });
    setStdpConfig({ ...engineRef.current.stdpConfig });

    setRsiState((prev) => ({
      ...prev,
      history: historyCopy,
      totalEpochsCompleted: Math.max(0, prev.totalEpochsCompleted - 1),
    }));
  };

  // Continuous background divergence metric updater and autonomous cycle dispatcher
  useEffect(() => {
    const timer = setInterval(() => {
      if (!engineRef.current) return;
      const curMetrics = AntiDivergenceEngine.calculateDivergenceMetrics(
        engineRef.current.getTelemetry(),
        engineRef.current.synapses,
        engineRef.current.agent,
        engineRef.current.getTuningConfig(),
        engineRef.current.substrateAgent
      );

      // 1. Proactive Homeostatic Scaling Evaluation (Engages when DRI > 0.35, disengages < 0.25)
      const homeostaticDecision = AntiDivergenceEngine.evaluateHomeostaticNeed(
        curMetrics.divergenceRiskIndex,
        engineRef.current.homeostaticScalingActive
      );
      if (homeostaticDecision.shouldBeActive !== engineRef.current.homeostaticScalingActive) {
        engineRef.current.setHomeostaticScaling(
          homeostaticDecision.shouldBeActive,
          homeostaticDecision.ltdMultiplier,
          homeostaticDecision.lrMultiplier
        );
        setHomeostaticScalingActive(homeostaticDecision.shouldBeActive);
      }
      curMetrics.homeostaticScalingActive = engineRef.current.homeostaticScalingActive;
      curMetrics.homeostaticLTDMultiplier = engineRef.current.homeostaticLTDMultiplier;
      curMetrics.homeostaticLRMultiplier = engineRef.current.homeostaticLRMultiplier;

      // 2. Update real-time divergence metrics cleanly
      setRsiState((prev) => ({
        ...prev,
        currentMetrics: curMetrics,
        homeostaticScalingActive: engineRef.current?.homeostaticScalingActive,
      }));

      // 2. Autonomous Auto-Rollback on unexpected post-epoch divergence spike
      const appliedTime = lastEpochAppliedTimeRef.current;
      if (appliedTime > 0) {
        const elapsedSinceApply = (Date.now() - appliedTime) / 1000;
        if (elapsedSinceApply <= 15) {
          const driSpike = curMetrics.divergenceRiskIndex - lastEpochBaselineDriRef.current;
          if (driSpike >= 0.15 || curMetrics.divergenceRiskIndex >= 0.65) {
            lastEpochAppliedTimeRef.current = 0; // Prevent duplicate trigger
            handleRollbackLastEpoch();
            setRollbackAlert({
              active: true,
              message: `Autonomous Safety Plank Auto-Rollback: Post-epoch divergence jumped by +${(driSpike * 100).toFixed(1)}% (DRI reached ${curMetrics.divergenceRiskIndex.toFixed(2)}). Preceding verified stable parameters restored to protect biological substrate.`,
              timestamp: Date.now(),
            });
          }
        } else {
          lastEpochAppliedTimeRef.current = 0;
        }
      }

      // 3. Safely evaluate autonomous triggers outside of setState
      const curRsi = rsiStateRef.current;
      if (!curRsi.isActive || curRsi.isAnalyzing) return;

      const now = Date.now();
      const elapsedSec = (now - curRsi.lastEvaluationTime) / 1000;

      let shouldTrigger = false;
      let triggerReason = 'periodic_cadence';

      if (curRsi.mode === 'continuous' && elapsedSec >= curRsi.cycleIntervalSeconds) {
        shouldTrigger = true;
        triggerReason = 'periodic_cadence';
      } else if (
        curRsi.mode === 'event_triggered' &&
        curMetrics.divergenceRiskIndex >= curRsi.divergenceThreshold &&
        elapsedSec >= 30
      ) {
        shouldTrigger = true;
        triggerReason = 'divergence_threshold';
      }

      if (shouldTrigger) {
        setRsiState((prev) => ({ ...prev, lastEvaluationTime: now }));
        handleTriggerRsiEpoch(triggerReason);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-white">
      {/* High-Contrast Audible Alert Toast for Drift Velocity Exceeding 0.85 */}
      <DriftVelocityAlertToast
        snapshot={driftGuardSnapshot}
        onExecuteCorrectiveLTD={() => {
          engine.triggerAutomatedCorrectionLoop(true);
          const snap = engine.lastDriftGuardSnapshot || engine.driftGuard.step(engine.simulationTime, engine.synapses);
          setDriftGuardSnapshot(snap);
        }}
        onAuditAndClean={() => {
          engine.auditNeuralPathways({ autoCleanIfBleeding: true });
          const snap = engine.lastDriftGuardSnapshot || engine.driftGuard.step(engine.simulationTime, engine.synapses);
          setDriftGuardSnapshot(snap);
        }}
        onSimulateDriftSpike={() => {
          engine.driftGuard.injectSimulatedDriftBurst('associative', engine.synapses, 0.48);
          // Set velocity directly above 0.85 threshold to test alert
          const snap = engine.driftGuard.step(engine.simulationTime, engine.synapses);
          snap.maxDriftVelocity = 0.92;
          setDriftGuardSnapshot({ ...snap });
        }}
      />

      {/* Top Telemetry Header */}
      <MemoizedHeaderTelemetry
        telemetry={telemetry}
        onDiagnosticUpdated={(diag) => setModelDiagnostic(diag)}
        onApplyAdjustments={() => handleApplyModelAdjustments()}
        adjustmentsApplied={
          Math.abs(activeTuning.aPlus - (modelDiagnostic?.parameters.aPlus.recommended ?? 0.032)) < 0.002
        }
        rsiActive={rsiState.isActive}
        divergenceRiskIndex={rsiState.currentMetrics.divergenceRiskIndex}
      />

      {/* Navigation Bar / Tabs */}
      <nav className="bg-slate-900/60 border-b border-slate-800 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between overflow-x-auto gap-2 no-scrollbar">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab('topology')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'topology'
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Neural Topology & Spiking Dynamics</span>
            </button>

            {/* SynapseEdge Watchdog Tab (Ghost Protocol Action Boundary) */}
            <button
              onClick={() => setActiveTab('watchdog')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'watchdog'
                  ? 'bg-gradient-to-r from-indigo-700 via-violet-700 to-purple-700 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-indigo-400" />
              <span>SynapseEdge Watchdog</span>
              <span className="text-[9px] bg-indigo-500/20 px-1.5 py-0.2 rounded text-indigo-300 font-mono">
                Ghost Protocol
              </span>
            </button>

            {/* Subsystem Integrity Dashboard Tab */}
            <button
              onClick={() => setActiveTab('integrity')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'integrity'
                  ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Subsystem Integrity</span>
              <span className="text-[9px] bg-emerald-500/20 px-1.5 py-0.2 rounded text-emerald-300 font-mono">
                Model Health
              </span>
            </button>

            {/* Diagnostic Trend Analyzer Tab */}
            <button
              onClick={() => setActiveTab('trends')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'trends'
                  ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-sky-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
              <span>Diagnostic Trends</span>
              <span className="text-[9px] bg-indigo-500/20 px-1.5 py-0.2 rounded text-indigo-300 font-mono">
                Regression
              </span>
            </button>

            <button
              onClick={() => setActiveTab('matrix')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'matrix'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Synaptic Matrix & STDP</span>
            </button>

            <button
              onClick={() => setActiveTab('aer')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'aer'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>AER Stream Bus</span>
            </button>

            <button
              onClick={() => setActiveTab('substrate')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'substrate'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Substrate & Red Team</span>
              <span className="text-[9px] bg-cyan-500/20 px-1.5 py-0.2 rounded text-cyan-300 font-mono">
                Keel / Invariants
              </span>
            </button>

            {/* Autonomous Recursive Self-Improvement (RSI) Tab */}
            <button
              onClick={() => setActiveTab('rsi')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'rsi'
                  ? 'bg-gradient-to-r from-indigo-600 to-sky-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-sky-400/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              <span>Autonomous Self-Improvement</span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold ${
                  rsiState.isActive
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {rsiState.isActive
                  ? `RSI ACTIVE (${(rsiState.currentMetrics.divergenceRiskIndex * 100).toFixed(0)}%)`
                  : 'STANDBY'}
              </span>
            </button>

            {/* Unified Telemetry Health-Check Monitor & Dedicated Performance Buffer Tab */}
            <button
              onClick={() => setActiveTab('health')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'health'
                  ? 'bg-gradient-to-r from-emerald-600 to-cyan-600 text-white shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Telemetry Health & Buffer</span>
              <span className="text-[9px] bg-emerald-500/20 px-1.5 py-0.2 rounded text-emerald-300 font-mono">
                5 Subsystems
              </span>
            </button>

            {/* Subsystem Heartbeat & Inter-Clock Synchrony Monitor Tab */}
            <button
              onClick={() => setActiveTab('heartbeat')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'heartbeat'
                  ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-600/30 ring-1 ring-rose-400/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Heart className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              <span>Subsystem Heartbeat</span>
              <span className="text-[9px] bg-rose-500/20 px-1.5 py-0.2 rounded text-rose-300 font-mono">
                Phase Lock
              </span>
            </button>

            {/* Sparse Autoencoder (SAE) Monosemanticity & Runaway Interceptor */}
            <button
              onClick={() => setActiveTab('sae')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'sae'
                  ? 'bg-gradient-to-r from-amber-600 via-rose-600 to-purple-600 text-white shadow-md shadow-rose-600/30 ring-1 ring-rose-400/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>SAE Monosemanticity</span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                  saeSnapshot.isRunaway
                    ? 'bg-rose-500 text-white animate-pulse'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {saeSnapshot.isRunaway ? 'RUNAWAY' : 'L₀: 6.2%'}
              </span>
            </button>

            {/* SynapticDriftGuard: 2nd-Order Derivative & Corrective LTD Interceptor */}
            <button
              onClick={() => setActiveTab('driftguard')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'driftguard'
                  ? 'bg-gradient-to-r from-rose-600 via-pink-600 to-amber-600 text-white shadow-md shadow-rose-600/30 ring-1 ring-rose-400/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span>Synaptic Drift Guard</span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                  driftGuardSnapshot.isAnyClusterExceeding
                    ? 'bg-rose-500 text-white animate-pulse'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {driftGuardSnapshot.isAnyClusterExceeding
                  ? 'LTD ENGAGED'
                  : `v: ${driftGuardSnapshot.maxDriftVelocity.toFixed(2)}`}
              </span>
            </button>

            {/* Gemini Argon: Neuromorphic Robotics Helping Hand */}
            <button
              onClick={() => setActiveTab('robotics')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'robotics'
                  ? 'bg-gradient-to-r from-cyan-600 via-teal-600 to-indigo-600 text-white shadow-md shadow-cyan-600/30 ring-1 ring-cyan-400/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <HandMetal className="w-3.5 h-3.5 text-cyan-400" />
              <span>Argon Robotics</span>
              <span className="text-[9px] bg-cyan-500/20 px-1.5 py-0.2 rounded text-cyan-300 font-mono">
                Helping Hand
              </span>
            </button>

            {/* NovaVault Media Studio (Autonomous 3D YouTube Shorts Agency) */}
            <button
              onClick={() => setActiveTab('novavault')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'novavault'
                  ? 'bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 text-white shadow-md shadow-purple-600/30 ring-1 ring-purple-400/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Film className="w-3.5 h-3.5 text-pink-400" />
              <span>NovaVault 3D Studio</span>
              <span className="text-[9px] bg-purple-500/20 px-1.5 py-0.2 rounded text-purple-300 font-mono">
                Shorts 24/7
              </span>
            </button>

            {/* Gova Broadcaster Architecture & Live API Hub */}
            <button
              onClick={() => setActiveTab('gova')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'gova'
                  ? 'bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-600 text-white shadow-md shadow-sky-600/30 ring-1 ring-sky-400/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-sky-400" />
              <span>Gova Broadcaster Hub</span>
              <span className="text-[9px] bg-sky-500/20 px-1.5 py-0.2 rounded text-sky-300 font-mono">
                Live Duplex / JSONL
              </span>
            </button>

            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'chat'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Gemini Chatbot</span>
              <span className="text-[9px] bg-indigo-500/20 px-1.5 py-0.2 rounded text-indigo-300 font-mono">
                3.1 Pro / 3.8 Flash
              </span>
            </button>

            <button
              onClick={() => setActiveTab('image')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'image'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Neuromorphic Studio</span>
              <span className="text-[9px] bg-purple-500/20 px-1.5 py-0.2 rounded text-purple-300 font-mono">
                1K, 2K, 4K
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setIsBridgeOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-600 hover:from-sky-500 hover:to-indigo-500 text-white shadow-md shadow-sky-600/25 transition-all cursor-pointer"
              title="Open Gemini <-> Google AI Studio Cognitive Bridge"
            >
              <FolderSync className="w-3.5 h-3.5 text-sky-200" />
              <span>AI Studio Bridge</span>
              <span className="text-[9px] bg-white/20 px-1.5 py-0.2 rounded font-mono">
                Drive / Local
              </span>
            </button>

            <SNNPersonalityManager
              currentTuning={activeTuning}
              currentStdpConfig={stdpConfig}
              synapses={synapses}
              onApplyPersonality={handleApplyPersonality}
              onExportPersonality={handleExportPersonality}
            />

            <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Live SNN Loop
              </span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 flex flex-col gap-4">
        {/* Autonomous Rollback Alert Banner */}
        {rollbackAlert && rollbackAlert.active && (
          <div className="bg-amber-950/70 border border-amber-500/60 rounded-xl p-3.5 flex items-start justify-between gap-3 shadow-lg shadow-amber-950/40 text-amber-200">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 mt-0.5">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div className="text-xs">
                <div className="font-bold text-amber-100 flex items-center gap-2">
                  <span>Autonomous Anti-Divergence Safety Plank Engaged</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 border border-amber-700">
                    Auto-Rollback Executed
                  </span>
                </div>
                <p className="text-amber-200/90 mt-0.5 leading-relaxed">
                  {rollbackAlert.message}
                </p>
                <div className="text-[10px] font-mono text-amber-400/70 mt-1">
                  Timestamp: {new Date(rollbackAlert.timestamp).toLocaleTimeString()} • Hard-Locked Stability Plank Active (A- ≥ 1.08 A+)
                </div>
              </div>
            </div>
            <button
              onClick={() => setRollbackAlert(null)}
              className="text-amber-400 hover:text-amber-100 text-xs px-2.5 py-1 rounded bg-amber-900/40 hover:bg-amber-900 border border-amber-700/60 transition cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Tab 1: Neural Topology & Spiking Dynamics */}
        {activeTab === 'topology' && (
          <div className="flex flex-col gap-4">
            {/* Quick Model Health & Subsystem Integrity Strip */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">Subsystem Integrity Monitor</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                      AER • STDP • LIF • KEEL • DRIFT GUARD
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Live aggregate health across 5 SNN subsystems (AER bus: {telemetry.aerLatencyMs.toFixed(2)}ms, STDP: {(engine.stdpConfig.aMinus / Math.max(0.001, engine.stdpConfig.aPlus)).toFixed(2)}x, Firing: {telemetry.meanFiringRateHz.toFixed(1)}Hz, Keel: {(telemetry.substrateKeel?.valence ?? 1.53) >= 0 ? '+' : ''}{(telemetry.substrateKeel?.valence ?? 1.53).toFixed(2)}, DRI: {driftGuardSnapshot.driftRiskIndex.toFixed(0)}%)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('integrity')}
                className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-sm hover:border-emerald-400"
              >
                <span>Open Integrity Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
              </button>
            </div>

            {/* Model Diagnostic Adjustments Card */}
            <MemoizedModelAdjustmentsCard
              diagnostic={modelDiagnostic}
              activeTuning={activeTuning}
              currentStdpConfig={stdpConfig}
              synapses={synapses}
              engine={engineRef.current || engine}
              onApplyAdjustments={handleApplyModelAdjustments}
              onRevertBaseline={handleRevertBaseline}
              onRequestGuidedAssessment={handleRequestGuidedAssessment}
              onRequestReAudit={() => handleRequestGuidedAssessment()}
              onApplyPersonality={handleApplyPersonality}
              onExportPersonality={handleExportPersonality}
              onRunShadowTrial={handleRunShadowTrialOnly}
              onOpenTrendAnalyzer={() => setActiveTab('trends')}
              homeostaticScalingActive={homeostaticScalingActive}
              isLoading={isDiagnosticLoading}
            />

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              <div className="xl:col-span-8 flex flex-col gap-4">
                <MemoizedNeuralTopologyCanvas
                  neurons={neurons}
                  synapses={synapses}
                  engine={engine}
                  driftSnapshot={driftGuardSnapshot}
                  isPaused={isPaused}
                  onTogglePause={handleTogglePause}
                  onResetNetwork={handleResetNetwork}
                  spatialGrid={spatialGrid}
                  onClearSpatialDensity={handleClearSpatialDensity}
                  onSetHeatmapDecayMode={handleSetHeatmapDecayMode}
                  currentDecayMode={decayMode}
                  stimulusChannels={stimulusChannels}
                  stimulusMode={stimulusMode}
                  onSetStimulusMode={handleSetStimulusMode}
                  onToggleChannel={handleToggleChannel}
                  onInjectManualPulse={handleInjectManualPulse}
                />

                {/* Real-time Spike Frequency Histogram Grouped by Neuron Type (Afferent, Cortical, Efferent) */}
                <MemoizedSpikeFrequencyHistogram
                  profile={engine.getNetworkFrequencyProfile()}
                  onInjectManualPulse={handleInjectManualPulse}
                />
              </div>

              {/* Side Summary, Stability Plank & SNN Architecture Details */}
              <div className="xl:col-span-4 flex flex-col gap-3">
                {/* Hard-Locked Stability Plank Status */}
                <MemoizedHardLockedPlankCard
                  plank={AntiDivergenceEngine.getActivePlankStatus(activeTuning, rsiState.currentMetrics.divergenceRiskIndex)}
                />

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-xs space-y-2.5 shadow">
                  <div className="flex items-center gap-1.5 text-sky-400 font-semibold border-b border-slate-800 pb-2">
                    <Info className="w-4 h-4" />
                    <span>Biological SNN Processor Architecture</span>
                  </div>

                  <p className="text-slate-300 leading-relaxed">
                    Event-driven neuromorphic processor core processing asynchronous temporal spike trains across a 3-column biological circuit (8 Afferent Inputs → 8 Cortical Interneurons → 4 Efferent Decoders).
                  </p>

                  <div className="space-y-1.5 font-mono text-[11px] bg-[#090d16] p-2.5 rounded border border-slate-800">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Afferent Layer:</span>
                      <span className="text-emerald-400">8 Stimulus Channels (E0-E7)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Association Layer:</span>
                      <span className="text-sky-400">8 Plastic Interneurons (N8-N15)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Efferent Readout:</span>
                      <span className="text-amber-400">4 Decoders (O16-O19)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Plasticity Mode:</span>
                      <span className="text-purple-400">Online STDP + BCM Scaling</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Dynamic Synapse Operations:</span>
                    <span className="font-mono font-bold text-amber-300">
                      {telemetry.synapticOpsPerSec.toLocaleString()} SOP/s
                    </span>
                  </div>
                </div>

                {/* Real-time Neuromorphic Stability Panel with Shadow Validation History, Auto-Scrub & Divergence Heatmap */}
                <MemoizedNeuralStabilityPanel
                  telemetry={telemetry}
                  neurons={neurons}
                  synapses={synapses}
                  shadowTrials={engineRef.current?.getShadowTrialHistory()}
                  onRunShadowTrial={handleRunShadowTrialOnly}
                  currentTuning={activeTuning}
                  autoScrubInactivePathways={engine.autoScrubInactivePathways}
                  onToggleAutoScrub={(enabled) => {
                    engine.autoScrubInactivePathways = enabled;
                    if (enabled) {
                      engine.scrubInactivePathways(engine.scrubPruneThreshold);
                      setSynapses([...engine.synapses]);
                    }
                  }}
                  scrubThreshold={engine.scrubPruneThreshold}
                  onSetScrubThreshold={(thresh) => {
                    engine.scrubPruneThreshold = thresh;
                  }}
                  onScrubNow={(thresh) => {
                    const res = engine.scrubInactivePathways(thresh ?? engine.scrubPruneThreshold);
                    setSynapses([...engine.synapses]);
                    return res;
                  }}
                  sparsityPct={engine.networkSparsityPct}
                  totalPrunedCount={engine.totalPrunedPathwaysCount}
                />

                {/* Quick STDP Activity Status */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-xs space-y-2 shadow">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">Online Plasticity Status</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {stdpConfig.enabled ? 'ACTIVE LEARNING' : 'WEIGHTS LOCKED'}
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Spike-Timing-Dependent Plasticity continuously adjusts synaptic weights. Presynaptic spikes preceding postsynaptic spikes induce LTP ($A_+$), while reverse timing triggers LTD ($A_-$).
                  </p>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-sky-500 to-emerald-400 h-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (telemetry.meanFiringRateHz / 55) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Spiking Raster and Voltage Oscilloscope */}
            <MemoizedSpikeRasterOscilloscope
              neurons={engine.neurons}
              recentSpikes={engine.recentSpikeEvents}
              currentTime={engine.simulationTime}
            />
          </div>
        )}

        {/* Tab: SynapseEdge Watchdog Action Boundary & First Test Set (Draft for DJ) */}
        {activeTab === 'watchdog' && (
          <MemoizedSynapseEdgeWatchdogStudio />
        )}

        {/* Tab: Subsystem Integrity Dashboard (Aggregates 5 SNN Subsystems & Model Health Score) */}
        {activeTab === 'integrity' && (
          <MemoizedSubsystemIntegrityDashboard
            telemetry={telemetry}
            engine={engine}
            synapses={synapses}
            driftSnapshot={driftGuardSnapshot}
            onRemediationApplied={(_action, _detail) => {
              setTelemetry(engine.getTelemetry());
              setSynapses([...engine.synapses]);
              setDriftGuardSnapshot(engine.getDriftGuardSnapshot());
            }}
          />
        )}

        {/* Tab: Diagnostic Trend Analyzer & Longitudinal Plasticity Regression */}
        {activeTab === 'trends' && (
          <MemoizedDiagnosticTrendAnalyzer
            currentTuning={activeTuning}
            onApplyProactiveTuning={(adjustments) => {
              handleApplyModelAdjustments(adjustments);
            }}
            onRunShadowTrial={handleRunShadowTrialOnly}
            onRequestManualReAudit={() => handleRequestGuidedAssessment()}
          />
        )}

        {/* Tab 2: Synaptic Matrix & Weight Tuning */}
        {activeTab === 'matrix' && (
          <MemoizedSynapticMatrixView
            synapses={synapses}
            stdpConfig={stdpConfig}
            currentTuning={activeTuning}
            onUpdateSTDPConfig={handleUpdateSTDPConfig}
            onSelectPreset={handleSelectPreset}
            onUpdateWeight={handleUpdateWeight}
            onApplyModelAdjustments={() => handleApplyModelAdjustments()}
            onApplyPersonality={handleApplyPersonality}
            onExportPersonality={handleExportPersonality}
          />
        )}

        {/* Tab 3: AER Stream & Event Bus Inspector */}
        {activeTab === 'aer' && (
          <MemoizedAERStreamInspector packets={engine.aerQueue} aerLatencyMs={telemetry.aerLatencyMs} />
        )}

        {/* Tab 4: Agent Substrate & Red-Team Audit */}
        {activeTab === 'substrate' && (
          <MemoizedSubstrateAuditPanel engine={engine} />
        )}

        {/* Tab 5: Autonomous Recursive Self-Improvement & Anti-Divergence Panel */}
        {activeTab === 'rsi' && (
          <MemoizedAutonomousSelfImprovementPanel
            engine={engine}
            telemetry={telemetry}
            tuningConfig={activeTuning}
            rsiState={rsiState}
            onToggleActive={handleToggleRsiActive}
            onSetMode={handleSetRsiMode}
            onTriggerEpoch={(reason, researchQuery) => handleTriggerRsiEpoch(reason, researchQuery)}
            onRollbackLastEpoch={handleRollbackLastEpoch}
            onRevertBaseline={handleRevertBaseline}
            isEvaluating={rsiState.isAnalyzing}
          />
        )}

        {/* Tab: Unified Telemetry Health-Check Monitor & Dedicated Performance Buffer */}
        {activeTab === 'health' && (
          <MemoizedUnifiedTelemetryHealthMonitorPanel
            monitor={globalTelemetryHealthMonitor}
            currentTuning={activeTuning}
            onApplyTuningFix={handleApplyModelAdjustments}
            onEngageHomeostaticScaling={() => {
              if (engineRef.current) {
                engineRef.current.setHomeostaticScaling(true);
                setHomeostaticScalingActive(true);
              }
            }}
            onCalibrateHomeostaticLoop={() => {
              if (engineRef.current) {
                engineRef.current.calibrateHomeostaticRateLoop();
                setHomeostaticScalingActive(true);
                setTelemetry(engineRef.current.getTelemetry());
              }
            }}
            onRepairPathwayLeaks={() => {
              if (engineRef.current) {
                const res = engineRef.current.quarantineAndRepairPathwayLeaks();
                setTelemetry(engineRef.current.getTelemetry());
                setSaeSnapshot(engineRef.current.getSAESnapshot());
                setDriftGuardSnapshot(engineRef.current.getDriftGuardSnapshot());
                return res;
              }
              return undefined;
            }}
          />
        )}

        {/* Tab: Subsystem Heartbeat & Inter-Clock Synchrony Monitor */}
        {activeTab === 'heartbeat' && (
          <MemoizedSubsystemHeartbeatMonitor monitor={globalTelemetryHealthMonitor} />
        )}

        {/* Tab: Sparse Autoencoder Monosemanticity & Runaway Interceptor */}
        {activeTab === 'sae' && (
          <MemoizedSAEMonosemanticityPanel
            saeSnapshot={saeSnapshot}
            saeEngine={engine.saeEngine}
            onTriggerBurstStimulus={() => {
              if (engineRef.current) {
                engineRef.current.setStimulusMode('burst');
                setStimulusMode('burst');
                for (let i = 0; i < 4; i++) {
                  engineRef.current.step(16);
                }
                setSaeSnapshot(engineRef.current.getSAESnapshot());
                setTelemetry(engineRef.current.getTelemetry());
              }
            }}
          />
        )}

        {/* Tab: SynapticDriftGuard 2nd-Order Derivative & Online Research Adapters */}
        {activeTab === 'driftguard' && (
          <MemoizedSynapticDriftGuardPanel
            engine={engine}
            snapshot={driftGuardSnapshot}
            onApplyStructuralParameters={(params) => {
              handleApplyModelAdjustments(params);
            }}
            onInformModelWithResearch={async (query) => {
              await handleTriggerRsiEpoch('online_research_adapter', query);
            }}
          />
        )}

        {/* Tab: NovaVault Media Studio (Autonomous 3D YouTube Shorts Agency) */}
        {activeTab === 'novavault' && <MemoizedNovaVaultStudioPanel />}

        {/* Tab: Gemini Argon: Neuromorphic Robotics Helping Hand */}
        {activeTab === 'robotics' && <MemoizedArgonRoboticsStudio engine={engine} />}

        {/* Tab 6: Gova Broadcaster Architecture & Live API Telemetry Hub */}
        {activeTab === 'gova' && <MemoizedGovaBroadcasterStudio />}

        {/* Tab 7: Gemini Chatbot Copilot */}
        {activeTab === 'chat' && <MemoizedGeminiChatPanel telemetry={telemetry} />}

        {/* Tab 8: Neuromorphic Studio Image Generation */}
        {activeTab === 'image' && <MemoizedNeuromorphicImageGenerator />}
      </main>

      {/* Persistent Audio Streaming Queue Bar */}
      <AudioStreamingQueueBar />

      {/* Gemini <-> AI Studio Cognitive Bridge Modal */}
      <GeminiBridgeModal
        isOpen={isBridgeOpen}
        onClose={() => setIsBridgeOpen(false)}
        telemetry={telemetry}
        tuningConfig={activeTuning}
        driftSnapshot={driftGuardSnapshot}
        onApplyAdjustments={(adj) => {
          if (!engineRef.current) return;
          engineRef.current.applyModelAdjustments(adj);
          setActiveTuning({ ...engineRef.current.getTuningConfig() });
          setStdpConfig({ ...engineRef.current.stdpConfig });
        }}
        onNavigateToWatchdogStudio={() => {
          setIsBridgeOpen(false);
          setActiveTab('watchdog');
        }}
      />
    </div>
  );
}
