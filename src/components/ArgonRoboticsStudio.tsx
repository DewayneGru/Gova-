import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  HandMetal,
  Cpu,
  Zap,
  Activity,
  Sliders,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Compass,
  Radio,
  RefreshCw,
  Power,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  RoboticJointAngles,
  TactileSensorFeedback,
  MotorEfferentChannel,
  ArgonTaskPlan,
  ArgonTrajectoryStep,
} from '../types';
import { SNNEngine } from '../lib/snnEngine';
import { ThreeRoboticHand } from './ThreeRoboticHand';

interface Props {
  engine?: SNNEngine;
}

export const ArgonRoboticsStudio: React.FC<Props> = ({ engine }) => {
  // Current mechanical joint angles
  const [joints, setJoints] = useState<RoboticJointAngles>({
    baseRotation: 0,
    shoulderPitch: 22,
    elbowFlexion: 42,
    wristPitch: 12,
    wristRoll: -20,
    thumbCurl: 0.15,
    indexCurl: 0.2,
    middleCurl: 0.2,
    ringCurl: 0.25,
    pinkyCurl: 0.25,
    graspTension: 0.1,
    compliance: 0.85,
  });

  // Selected target object
  const [objectType, setObjectType] = useState<
    'none' | 'handshake_marker' | 'fragile_glass' | 'microchip' | 'sensor_probe'
  >('handshake_marker');

  // Closed loop sensorimotor feedback toggle
  const [closedLoopActive, setClosedLoopActive] = useState<boolean>(true);

  // Compliance mode toggle
  const [complianceMode, setComplianceMode] = useState<boolean>(true);

  // Tactile feedback state
  const [tactileReadings, setTactileReadings] = useState<TactileSensorFeedback[]>([
    { padId: 'thumb', pressure: 0.12, contactDetected: true, rawMv: 1100, temperatureC: 36.4 },
    { padId: 'index', pressure: 0.18, contactDetected: true, rawMv: 1450, temperatureC: 36.5 },
    { padId: 'middle', pressure: 0.15, contactDetected: true, rawMv: 1250, temperatureC: 36.3 },
    { padId: 'ring', pressure: 0.08, contactDetected: false, rawMv: 600, temperatureC: 36.2 },
    { padId: 'pinky', pressure: 0.05, contactDetected: false, rawMv: 400, temperatureC: 36.1 },
    { padId: 'palm', pressure: 0.02, contactDetected: false, rawMv: 250, temperatureC: 36.6 },
  ]);

  // Motor channels telemetry
  const [motorChannels, setMotorChannels] = useState<MotorEfferentChannel[]>([
    { neuronId: 16, label: 'O16: Base/Shoulder', firingRateHz: 18, currentTorqueNm: 0.85, maxTorqueNm: 3.5, temperature: 38.2, status: 'NOMINAL' },
    { neuronId: 17, label: 'O17: Elbow/Wrist', firingRateHz: 24, currentTorqueNm: 1.15, maxTorqueNm: 3.5, temperature: 40.1, status: 'NOMINAL' },
    { neuronId: 18, label: 'O18: Finger Gripper', firingRateHz: 14, currentTorqueNm: 0.62, maxTorqueNm: 2.0, temperature: 37.5, status: 'NOMINAL' },
    { neuronId: 19, label: 'O19: Bio-Compliance', firingRateHz: 32, currentTorqueNm: 0.35, maxTorqueNm: 1.5, temperature: 36.8, status: 'NOMINAL' },
  ]);

  // Gemini Argon Task Planner state
  const [goalPrompt, setGoalPrompt] = useState<string>('Assisted friendly handshake with human-safe compliance');
  const [activePlan, setActivePlan] = useState<ArgonTaskPlan | null>(null);
  const [isPlanning, setIsPlanning] = useState<boolean>(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [executingStepIndex, setExecutingStepIndex] = useState<number>(-1);
  const [isPlayingTrajectory, setIsPlayingTrajectory] = useState<boolean>(false);
  const trajectoryTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Manual teleop drawer open/close
  const [showManualTeleop, setShowManualTeleop] = useState<boolean>(false);

  // Presets library
  const taskPresets = [
    {
      id: 'handshake',
      title: '🤝 Friendly Handshake',
      goal: 'Anthropomorphic helping hand reach and compliant human clasp',
      object: 'handshake_marker' as const,
    },
    {
      id: 'microchip',
      title: '🤏 Precision Micro-Assembly',
      goal: 'Sub-millimeter index-thumb pinch for delicate semiconductor wafer',
      object: 'microchip' as const,
    },
    {
      id: 'fragile_glass',
      title: '🧪 Fragile Specimen Hold',
      goal: 'Multi-pad adaptive envelope grasp with pressure threshold gating',
      object: 'fragile_glass' as const,
    },
    {
      id: 'sensor_probe',
      title: '⚡ Diagnostics Probe Align',
      goal: 'Firm three-finger grip and axial alignment of electronic sensor probe',
      object: 'sensor_probe' as const,
    },
  ];

  // Request trajectory from Gemini Argon
  const handleRequestArgonPlan = async (presetGoal?: string, presetObj?: typeof objectType) => {
    const finalGoal = presetGoal || goalPrompt;
    const finalObj = presetObj || objectType;
    if (!finalGoal.trim()) return;

    setIsPlanning(true);
    setPlanError(null);
    try {
      const res = await fetch('/api/robotics/argon-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: finalGoal,
          objectContext: finalObj,
          complianceMode,
          currentJoints: joints,
        }),
      });

      if (!res.ok) {
        throw new Error(`Argon planner returned HTTP ${res.status}`);
      }

      const plan: ArgonTaskPlan = await res.json();
      setActivePlan(plan);
      setExecutingStepIndex(0);

      // Automatically apply step 1
      if (plan.trajectory && plan.trajectory.length > 0) {
        applyTrajectoryStep(plan.trajectory[0]);
      }
    } catch (err: any) {
      setPlanError(err?.message || 'Failed to generate Argon trajectory plan.');
    } finally {
      setIsPlanning(false);
    }
  };

  // Apply a specific trajectory step
  const applyTrajectoryStep = useCallback((step: ArgonTrajectoryStep) => {
    setJoints((prev) => ({
      ...prev,
      ...step.targetJoints,
    }));
  }, []);

  // Step through trajectory automatically
  const handlePlayTrajectory = () => {
    if (!activePlan || !activePlan.trajectory || activePlan.trajectory.length === 0) return;

    if (isPlayingTrajectory) {
      // Pause
      if (trajectoryTimerRef.current) clearTimeout(trajectoryTimerRef.current);
      setIsPlayingTrajectory(false);
      return;
    }

    setIsPlayingTrajectory(true);
    let step = executingStepIndex >= activePlan.trajectory.length - 1 ? 0 : executingStepIndex;

    const playNext = (index: number) => {
      if (!activePlan || index >= activePlan.trajectory.length) {
        setIsPlayingTrajectory(false);
        return;
      }
      setExecutingStepIndex(index);
      const currStep = activePlan.trajectory[index];
      applyTrajectoryStep(currStep);

      const duration = currStep.durationMs || 1000;
      trajectoryTimerRef.current = setTimeout(() => {
        playNext(index + 1);
      }, duration);
    };

    playNext(step);
  };

  useEffect(() => {
    return () => {
      if (trajectoryTimerRef.current) clearTimeout(trajectoryTimerRef.current);
    };
  }, []);

  // Gesture Quick Triggers
  const triggerGesture = (gesture: 'open' | 'helping_hand' | 'pinch' | 'clench' | 'point' | 'peace' | 'thumbs_up' | 'wave') => {
    if (isPlayingTrajectory && trajectoryTimerRef.current) {
      clearTimeout(trajectoryTimerRef.current);
      setIsPlayingTrajectory(false);
    }

    if (gesture === 'open') {
      setJoints((prev) => ({
        ...prev,
        thumbCurl: 0.05,
        indexCurl: 0.05,
        middleCurl: 0.05,
        ringCurl: 0.05,
        pinkyCurl: 0.05,
        graspTension: 0.0,
      }));
    } else if (gesture === 'helping_hand') {
      setJoints((prev) => ({
        ...prev,
        baseRotation: 0,
        shoulderPitch: 25,
        elbowFlexion: 45,
        wristPitch: 15,
        wristRoll: -20,
        thumbCurl: 0.2,
        indexCurl: 0.25,
        middleCurl: 0.25,
        ringCurl: 0.3,
        pinkyCurl: 0.3,
        graspTension: 0.15,
        compliance: 0.88,
      }));
    } else if (gesture === 'pinch') {
      setJoints((prev) => ({
        ...prev,
        thumbCurl: 0.55,
        indexCurl: 0.62,
        middleCurl: 0.85,
        ringCurl: 0.9,
        pinkyCurl: 0.95,
        graspTension: 0.45,
      }));
    } else if (gesture === 'clench') {
      setJoints((prev) => ({
        ...prev,
        thumbCurl: 0.85,
        indexCurl: 0.9,
        middleCurl: 0.92,
        ringCurl: 0.95,
        pinkyCurl: 0.95,
        graspTension: 0.85,
      }));
    } else if (gesture === 'point') {
      setJoints((prev) => ({
        ...prev,
        thumbCurl: 0.7,
        indexCurl: 0.05,
        middleCurl: 0.9,
        ringCurl: 0.9,
        pinkyCurl: 0.9,
        wristPitch: 8,
      }));
    } else if (gesture === 'peace') {
      setJoints((prev) => ({
        ...prev,
        thumbCurl: 0.8,
        indexCurl: 0.05,
        middleCurl: 0.05,
        ringCurl: 0.9,
        pinkyCurl: 0.9,
      }));
    } else if (gesture === 'thumbs_up') {
      setJoints((prev) => ({
        ...prev,
        thumbCurl: 0.0,
        indexCurl: 0.9,
        middleCurl: 0.92,
        ringCurl: 0.92,
        pinkyCurl: 0.95,
        wristRoll: 45,
      }));
    } else if (gesture === 'wave') {
      // Oscillate wrist
      let count = 0;
      const interval = setInterval(() => {
        count++;
        setJoints((prev) => ({
          ...prev,
          wristRoll: Math.sin(count * 0.8) * 35,
          thumbCurl: 0.2,
          indexCurl: 0.15,
          middleCurl: 0.15,
          ringCurl: 0.2,
          pinkyCurl: 0.2,
        }));
        if (count > 12) {
          clearInterval(interval);
          setJoints((prev) => ({ ...prev, wristRoll: -20 }));
        }
      }, 100);
    }
  };

  // Close the sensorimotor loop: feed tactile feedback back into SNN engine
  const handleTactileUpdate = useCallback(
    (feedback: TactileSensorFeedback[]) => {
      setTactileReadings(feedback);

      if (closedLoopActive && engine) {
        const contactPads = feedback.filter((f) => f.contactDetected);
        if (contactPads.length > 0) {
          const avgP = contactPads.reduce((s, p) => s + p.pressure, 0) / contactPads.length;
          // Deposit spatial activity into sensory layer
          engine.depositSpatialActivity(0.5, 0.5, 'sensory', Math.min(1.8, 0.4 + avgP * 1.5));
          // Stimulate sensory afferents E0 and E1 via manual pulse injection
          if (avgP > 0.15) {
            engine.injectManualPulse(0);
            engine.injectManualPulse(1);
          }
        }
      }
    },
    [closedLoopActive, engine]
  );

  // Sync with SNN engine efferent firing rates
  useEffect(() => {
    const interval = setInterval(() => {
      if (!engine) return;
      try {
        const freqProfile = engine.getNetworkFrequencyProfile();
        const efferentHz = Math.round(freqProfile.groups?.efferent?.meanHz || 18);
        const motorNeurons = engine.neurons.filter((n) => n.layer === 'motor');

        const rates = motorNeurons.slice(0, 4).map((m, idx) => {
          const jitter = Math.sin(Date.now() * 0.003 + idx) * 3;
          return Math.max(4, Math.round(efferentHz + jitter));
        });

        while (rates.length < 4) {
          rates.push(Math.round(15 + Math.random() * 5));
        }

        setMotorChannels([
          { neuronId: 16, label: 'O16: Base/Shoulder', firingRateHz: rates[0], currentTorqueNm: Number((0.6 + rates[0] * 0.04).toFixed(2)), maxTorqueNm: 3.5, temperature: 38.2, status: rates[0] > 60 ? 'HIGH_LOAD' : 'NOMINAL' },
          { neuronId: 17, label: 'O17: Elbow/Wrist', firingRateHz: rates[1], currentTorqueNm: Number((0.8 + rates[1] * 0.035).toFixed(2)), maxTorqueNm: 3.5, temperature: 39.8, status: rates[1] > 60 ? 'HIGH_LOAD' : 'NOMINAL' },
          { neuronId: 18, label: 'O18: Finger Gripper', firingRateHz: rates[2], currentTorqueNm: Number((0.4 + rates[2] * 0.025).toFixed(2)), maxTorqueNm: 2.0, temperature: 37.4, status: 'NOMINAL' },
          { neuronId: 19, label: 'O19: Bio-Compliance', firingRateHz: rates[3], currentTorqueNm: Number((0.2 + rates[3] * 0.02).toFixed(2)), maxTorqueNm: 1.5, temperature: 36.5, status: 'NOMINAL' },
        ]);
      } catch {
        // Fallback default rates
      }
    }, 600);

    return () => clearInterval(interval);
  }, [engine]);

  // Load initial plan on mount
  useEffect(() => {
    handleRequestArgonPlan(taskPresets[0].goal, taskPresets[0].object);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const driftGuard = engine?.driftGuard;
  const isLTDGuarded = driftGuard ? driftGuard.getSnapshot().isAnyClusterExceeding : false;

  return (
    <div className="space-y-6">
      {/* 1. Header & Architecture Overview */}
      <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-cyan-500/10 via-indigo-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl border bg-cyan-500/20 border-cyan-500/40 text-cyan-400 shadow-lg shadow-cyan-500/10">
              <HandMetal className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Gemini Argon — Neuromorphic Robotics Helping Hand
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-cyan-500/20 border border-cyan-500/30 text-cyan-300">
                  6-DOF Articulation
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-500/20 border border-indigo-500/30 text-indigo-300">
                  5-Finger Anthropomorphic
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/20 border border-emerald-500/30 text-emerald-300">
                  SNN Decoders (O16-O19)
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl">
                Embodied bio-inspired robotic manipulator driven by SNN motor efferent channels with closed-loop
                tactile sensing. Uses Gemini Argon vision-motor planning with human-safe compliance and SynapticDriftGuard
                LTD dampening to guarantee stable, tremor-free physical collaboration.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Sensorimotor Closed Loop Toggle */}
            <button
              onClick={() => setClosedLoopActive(!closedLoopActive)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                closedLoopActive
                  ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title="When enabled, tactile contact sends biological spike trains into afferent neurons E0-E3"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Closed Loop: {closedLoopActive ? 'ACTIVE' : 'OPEN'}</span>
            </button>

            {/* Compliance Mode */}
            <button
              onClick={() => setComplianceMode(!complianceMode)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                complianceMode
                  ? 'bg-cyan-600/20 border-cyan-500/40 text-cyan-300 hover:bg-cyan-600/30'
                  : 'bg-amber-600/20 border-amber-500/40 text-amber-300'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{complianceMode ? 'Human Compliance' : 'Rigid Torque'}</span>
            </button>

            {/* Emergency LTD Arrest */}
            <button
              onClick={() => {
                if (engine) {
                  engine.driftGuard.triggerManualLTDInjection('motor_efferent', engine.synapses, 0.18);
                }
                setJoints((prev) => ({ ...prev, graspTension: 0.0, compliance: 1.0 }));
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600/30 transition-all"
              title="Commands emergency LTD depression to halt motor drift and relax grip"
            >
              <Power className="w-3.5 h-3.5" />
              <span>LTD Motor Arrest</span>
            </button>
          </div>
        </div>

        {/* Telemetry Status Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-5">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
              <span>Efferent Motor Firing</span>
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="text-xl font-bold font-mono text-white mt-1">
              {motorChannels.reduce((sum, m) => sum + m.firingRateHz, 0)}
              <span className="text-xs text-slate-500 font-normal ml-1">Hz Total</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Decoders O16 - O19 active
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
              <span>Tactile Force Peak</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-xl font-bold font-mono text-white mt-1">
              {(Math.max(...tactileReadings.map((t) => t.pressure)) * 100).toFixed(0)}%
              <span className="text-xs text-slate-500 font-normal ml-1">
                ({tactileReadings.filter((t) => t.contactDetected).length} pads in contact)
              </span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Threshold: &lt; 75% for soft grip
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
              <span>Bio-Compliance</span>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold font-mono text-white mt-1">
              {((joints.compliance || 0.85) * 100).toFixed(0)}%
              <span className="text-xs text-emerald-400 font-normal ml-1">Adaptive</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Spring dampening active
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
              <span>Motor Synaptic Guard</span>
              {isLTDGuarded ? (
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              )}
            </div>
            <div className="text-xl font-bold font-mono text-white mt-1">
              <span className={isLTDGuarded ? 'text-rose-400' : 'text-emerald-400'}>
                {isLTDGuarded ? 'LTD ARREST' : 'STABILIZED'}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Second-order d²w/dt² monitored
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Studio Workstation: 3D Viewport on Left, Gemini Argon Copilot & Telemetry on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: 3D Viewport & Gesture Toolbar (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <ThreeRoboticHand
            jointAngles={joints}
            isLTDGuarded={isLTDGuarded}
            motorBias={engine?.substrateAgent ? engine.substrateAgent.getEffectiveKeel().motor_bias : 0}
            motorFiringRates={motorChannels.map((m) => m.firingRateHz)}
            objectType={objectType}
            onTactileUpdate={handleTactileUpdate}
          />

          {/* Target Object Selector */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-white">Target Object in Reach Zone:</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: 'handshake_marker', label: '🤝 Human Handshake', desc: 'Compliant guide' },
                { id: 'fragile_glass', label: '🧪 Fragile Glass', desc: 'Soft envelope' },
                { id: 'microchip', label: '🤏 Silicon Chip', desc: 'Sub-mm pinch' },
                { id: 'sensor_probe', label: '⚡ Probe Tool', desc: 'Axial clasp' },
                { id: 'none', label: '⭕ Free Space', desc: 'No object' },
              ].map((obj) => (
                <button
                  key={obj.id}
                  onClick={() => setObjectType(obj.id as any)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    objectType === obj.id
                      ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                      : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {obj.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Gesture Toolbar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                <HandMetal className="w-4 h-4 text-indigo-400" />
                <span>Helping Hand Express Gestures:</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Autonomous Biokinematics</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                onClick={() => triggerGesture('helping_hand')}
                className="p-2.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <span>🤝 Helping Reach</span>
              </button>
              <button
                onClick={() => triggerGesture('open')}
                className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <span>✋ Open Palm</span>
              </button>
              <button
                onClick={() => triggerGesture('pinch')}
                className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <span>🤏 Precision Pinch</span>
              </button>
              <button
                onClick={() => triggerGesture('clench')}
                className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <span>✊ Adaptive Clench</span>
              </button>
              <button
                onClick={() => triggerGesture('point')}
                className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <span>☝️ Point / Direct</span>
              </button>
              <button
                onClick={() => triggerGesture('peace')}
                className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <span>✌️ Peace / V</span>
              </button>
              <button
                onClick={() => triggerGesture('thumbs_up')}
                className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <span>👍 Thumbs Up</span>
              </button>
              <button
                onClick={() => triggerGesture('wave')}
                className="p-2.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <span>👋 Friendly Wave</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Gemini Argon Planner & Telemetry (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Gemini Argon Vision-Motor Copilot Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">Gemini Argon Cognitive Planner</h3>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-500/20 border border-indigo-500/30 text-indigo-300">
                gemini-4-argon
              </span>
            </div>

            {/* Quick Presets */}
            <div className="grid grid-cols-2 gap-2">
              {taskPresets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setGoalPrompt(p.goal);
                    setObjectType(p.object);
                    handleRequestArgonPlan(p.goal, p.object);
                  }}
                  className="p-2 rounded-xl text-left bg-slate-950/70 hover:bg-slate-800 border border-slate-800/80 hover:border-cyan-500/50 transition-all group"
                >
                  <div className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
                    {p.title}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">{p.goal}</div>
                </button>
              ))}
            </div>

            {/* Custom Prompt Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={goalPrompt}
                onChange={(e) => setGoalPrompt(e.target.value)}
                placeholder="Enter custom robotic reach or helping hand instruction..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                onKeyDown={(e) => e.key === 'Enter' && handleRequestArgonPlan()}
              />
              <button
                onClick={() => handleRequestArgonPlan()}
                disabled={isPlanning}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                {isPlanning ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>Plan</span>
              </button>
            </div>

            {planError && (
              <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
                {planError}
              </div>
            )}

            {/* Active Trajectory Playback Timeline */}
            {activePlan && activePlan.trajectory && activePlan.trajectory.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePlayTrajectory}
                      className="p-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-all shadow-md shadow-cyan-600/30"
                    >
                      {isPlayingTrajectory ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    <span className="text-xs font-bold text-white">
                      Trajectory Timeline ({activePlan.trajectory.length} Phases)
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                    <span>Safety:</span>
                    <span className="text-emerald-400 font-bold">{activePlan.safetyMarginScore}%</span>
                    <span>• Max Torque:</span>
                    <span className="text-cyan-300 font-bold">{activePlan.maxAllowableTorqueNm} Nm</span>
                  </div>
                </div>

                {/* Steps List */}
                <div className="space-y-2">
                  {activePlan.trajectory.map((step, idx) => {
                    const isCurrent = executingStepIndex === idx;
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setExecutingStepIndex(idx);
                          applyTrajectoryStep(step);
                        }}
                        className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          isCurrent
                            ? 'bg-cyan-950/40 border-cyan-500/60 shadow-md shadow-cyan-950/40 text-white'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-bold">
                            <span
                              className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-mono ${
                                isCurrent ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {step.stepIndex}
                            </span>
                            <span className={isCurrent ? 'text-cyan-300' : 'text-slate-200'}>
                              {step.phaseName}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500">{step.durationMs}ms</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">{step.explanation}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Reasoning Quote */}
                <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 text-[11px] text-slate-300 leading-relaxed font-sans italic">
                  "{activePlan.reasoning}"
                </div>
              </div>
            )}
          </div>

          {/* Motor Efferents & Tactile Gauges */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>SNN Motor Efferents & Tactile Sensors</span>
            </h3>

            {/* Motor Efferents Firing Rates */}
            <div className="space-y-2">
              {motorChannels.map((ch) => (
                <div key={ch.neuronId} className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200">{ch.label}</span>
                    <span className="font-mono text-cyan-400 font-bold">{ch.firingRateHz} Hz</span>
                  </div>
                  {/* Progress Bar */}
                  <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1.5 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (ch.firingRateHz / 80) * 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-1">
                    <span>Torque: {ch.currentTorqueNm.toFixed(2)} / {ch.maxTorqueNm} Nm</span>
                    <span>Temp: {ch.temperature}°C</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Tactile Sensor Array */}
            <div className="pt-3 border-t border-slate-800">
              <div className="text-xs font-bold text-slate-300 mb-2 flex items-center justify-between">
                <span>Tactile Pad Feedback (6 Zones):</span>
                <span className="text-[10px] text-emerald-400 font-mono">
                  {tactileReadings.filter((t) => t.contactDetected).length} in Contact
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {tactileReadings.map((t) => (
                  <div
                    key={t.padId}
                    className={`p-2 rounded-xl border text-center transition-all ${
                      t.contactDetected
                        ? 'bg-cyan-950/40 border-cyan-500/50 shadow-sm shadow-cyan-500/20'
                        : 'bg-slate-950/60 border-slate-800'
                    }`}
                  >
                    <div className="text-[10px] font-mono text-slate-400 uppercase">{t.padId}</div>
                    <div
                      className={`text-sm font-bold font-mono mt-0.5 ${
                        t.contactDetected ? 'text-cyan-300' : 'text-slate-500'
                      }`}
                    >
                      {(t.pressure * 100).toFixed(0)}%
                    </div>
                    <div className="text-[9px] text-slate-500 font-mono">{t.rawMv}mV</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Manual Joint Teleoperation Drawer (Collapsible) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <button
          onClick={() => setShowManualTeleop(!showManualTeleop)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-bold text-white">Manual 6-DOF Kinematic Joint Overrides</span>
            <span className="text-[10px] font-mono text-slate-500 px-2 py-0.5 rounded bg-slate-800">
              Direct Servo Control
            </span>
          </div>
          {showManualTeleop ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {showManualTeleop && (
          <div className="p-6 pt-2 border-t border-slate-800 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Base Rotation */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Base Rotation (Azimuth)</span>
                  <span className="font-mono text-cyan-400">{joints.baseRotation}°</span>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={joints.baseRotation}
                  onChange={(e) => setJoints((prev) => ({ ...prev, baseRotation: Number(e.target.value) }))}
                  className="w-full accent-cyan-500"
                />
              </div>

              {/* Shoulder Pitch */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Shoulder Pitch</span>
                  <span className="font-mono text-cyan-400">{joints.shoulderPitch}°</span>
                </div>
                <input
                  type="range"
                  min="-30"
                  max="80"
                  value={joints.shoulderPitch}
                  onChange={(e) => setJoints((prev) => ({ ...prev, shoulderPitch: Number(e.target.value) }))}
                  className="w-full accent-cyan-500"
                />
              </div>

              {/* Elbow Flexion */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Elbow Flexion</span>
                  <span className="font-mono text-cyan-400">{joints.elbowFlexion}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="125"
                  value={joints.elbowFlexion}
                  onChange={(e) => setJoints((prev) => ({ ...prev, elbowFlexion: Number(e.target.value) }))}
                  className="w-full accent-cyan-500"
                />
              </div>

              {/* Wrist Pitch */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Wrist Pitch</span>
                  <span className="font-mono text-cyan-400">{joints.wristPitch}°</span>
                </div>
                <input
                  type="range"
                  min="-60"
                  max="60"
                  value={joints.wristPitch}
                  onChange={(e) => setJoints((prev) => ({ ...prev, wristPitch: Number(e.target.value) }))}
                  className="w-full accent-cyan-500"
                />
              </div>

              {/* Wrist Roll */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Wrist Roll</span>
                  <span className="font-mono text-cyan-400">{joints.wristRoll}°</span>
                </div>
                <input
                  type="range"
                  min="-120"
                  max="120"
                  value={joints.wristRoll}
                  onChange={(e) => setJoints((prev) => ({ ...prev, wristRoll: Number(e.target.value) }))}
                  className="w-full accent-cyan-500"
                />
              </div>

              {/* Grasp Tension */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Grasp Tension & Force</span>
                  <span className="font-mono text-cyan-400">{((joints.graspTension || 0) * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={joints.graspTension || 0}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setJoints((prev) => ({
                      ...prev,
                      graspTension: v,
                      thumbCurl: v * 0.8,
                      indexCurl: v * 0.85,
                      middleCurl: v * 0.88,
                      ringCurl: v * 0.9,
                      pinkyCurl: v * 0.9,
                    }));
                  }}
                  className="w-full accent-cyan-500"
                />
              </div>
            </div>

            {/* Individual Finger Sliders */}
            <div className="pt-4 border-t border-slate-800">
              <div className="text-xs font-semibold text-slate-400 mb-3">5-Finger Individual Articulation:</div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {(['thumb', 'index', 'middle', 'ring', 'pinky'] as const).map((finger) => {
                  const key = `${finger}Curl` as keyof RoboticJointAngles;
                  const val = (joints[key] as number) || 0;
                  return (
                    <div key={finger} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-300 capitalize">
                        <span>{finger}</span>
                        <span className="font-mono text-cyan-400">{(val * 100).toFixed(0)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.02"
                        value={val}
                        onChange={(e) =>
                          setJoints((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                        }
                        className="w-full accent-indigo-500"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
