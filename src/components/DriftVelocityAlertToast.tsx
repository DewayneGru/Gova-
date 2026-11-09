import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SynapticDriftGuardSnapshot } from '../types';
import {
  AlertTriangle,
  Volume2,
  VolumeX,
  X,
  Zap,
  Activity,
  ShieldAlert,
  Flame,
  CheckCircle,
} from 'lucide-react';

export interface DriftVelocityAlertToastProps {
  snapshot: SynapticDriftGuardSnapshot | null;
  onExecuteCorrectiveLTD: () => void;
  onAuditAndClean?: () => void;
  onSimulateDriftSpike?: () => void;
}

export const DriftVelocityAlertToast: React.FC<DriftVelocityAlertToastProps> = ({
  snapshot,
  onExecuteCorrectiveLTD,
  onAuditAndClean,
  onSimulateDriftSpike,
}) => {
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [lastAlertVelocity, setLastAlertVelocity] = useState<number>(0);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastSoundPlayedRef = useRef<number>(0);
  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);

  const maxVelocity = snapshot?.maxDriftVelocity ?? 0;
  const isExceeding085 = maxVelocity > 0.85;

  // Synthesize warning dual-tone chime using Web Audio API
  const playAlertSound = useCallback(() => {
    if (isMuted) return;
    const now = Date.now();
    // Debounce to at most once every 4 seconds
    if (now - lastSoundPlayedRef.current < 4000) return;
    lastSoundPlayedRef.current = now;

    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioContextClass();
      }

      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const t = ctx.currentTime;

      // Pulse 1: 960 Hz High Warning
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(960, t);
      osc1.frequency.exponentialRampToValueAtTime(740, t + 0.16);

      gain1.gain.setValueAtTime(0.001, t);
      gain1.gain.linearRampToValueAtTime(0.25, t + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(t);
      osc1.stop(t + 0.2);

      // Pulse 2: 640 Hz Lower Warning Pulse
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(640, t + 0.22);
      osc2.frequency.exponentialRampToValueAtTime(480, t + 0.42);

      gain2.gain.setValueAtTime(0.001, t + 0.22);
      gain2.gain.linearRampToValueAtTime(0.32, t + 0.25);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(t + 0.22);
      osc2.stop(t + 0.46);
    } catch (e) {
      console.warn('AudioContext alert playback error:', e);
    }
  }, [isMuted]);

  // Check condition and trigger alert
  useEffect(() => {
    if (isExceeding085) {
      setLastAlertVelocity(maxVelocity);
      if (!isDismissed) {
        playAlertSound();
      }
    } else {
      // Auto-clear dismiss state once velocity falls back safely below 0.85
      if (maxVelocity < 0.65 && isDismissed) {
        setIsDismissed(false);
      }
    }
  }, [maxVelocity, isExceeding085, isDismissed, playAlertSound]);

  // Dismiss toast for 10 seconds
  const handleDismiss = () => {
    setIsDismissed(true);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      setIsDismissed(false);
    }, 10000);
  };

  const handleExecuteLTD = () => {
    onExecuteCorrectiveLTD();
    setActionFeedback('Corrective LTD Loop Injected — Runaway Arrested');
    setTimeout(() => setActionFeedback(null), 3500);
  };

  const handleAudit = () => {
    if (onAuditAndClean) {
      onAuditAndClean();
      setActionFeedback('Neural Pathway Bleed Purged');
      setTimeout(() => setActionFeedback(null), 3500);
    }
  };

  if (!isExceeding085 && !actionFeedback) {
    return null;
  }

  if (isDismissed && !actionFeedback) {
    return (
      <div className="fixed top-16 right-5 z-50">
        <button
          onClick={() => setIsDismissed(false)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/90 border border-red-500 text-red-200 text-xs font-mono font-bold shadow-lg animate-pulse"
        >
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span>Drift Alert Muted ({maxVelocity.toFixed(2)})</span>
        </button>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="fixed top-16 right-5 z-50 max-w-md w-[92vw] sm:w-[420px] transition-all transform animate-in fade-in slide-in-from-top-4 duration-300"
    >
      <div className="relative rounded-xl bg-black border-2 border-red-500 shadow-[0_0_35px_rgba(239,68,68,0.75)] ring-2 ring-red-500/40 p-4 text-white font-sans backdrop-blur-xl">
        {/* Pulsing Alert Banner Header */}
        <div className="flex items-start justify-between gap-3 border-b border-red-500/40 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-red-600 text-white shadow-lg animate-pulse">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black tracking-wider uppercase text-red-400 bg-red-950/80 px-2 py-0.5 rounded border border-red-500/60 font-mono">
                  CRITICAL RUNAWAY &gt; 0.85
                </span>
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              </div>
              <h4 className="text-sm font-bold text-white mt-0.5">
                Synaptic Drift Velocity Exceeded
              </h4>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Audio Mute / Unmute Toggle */}
            <button
              onClick={() => {
                setIsMuted(!isMuted);
                if (isMuted) playAlertSound();
              }}
              className={`p-1.5 rounded-lg border transition ${
                isMuted
                  ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  : 'bg-red-950/80 border-red-600 text-red-300 hover:bg-red-900'
              }`}
              title={isMuted ? 'Unmute audible chime' : 'Mute audible chime'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Dismiss button */}
            <button
              onClick={handleDismiss}
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Dismiss for 10 seconds"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Telemetry Metrics High-Contrast Grid */}
        <div className="grid grid-cols-2 gap-2 my-3 font-mono text-xs">
          <div className="p-2 rounded-lg bg-red-950/40 border border-red-500/40">
            <div className="text-[10px] text-red-300 uppercase font-sans font-medium">
              Registered Velocity
            </div>
            <div className="text-xl font-black text-red-400 mt-0.5">
              {maxVelocity.toFixed(3)}
              <span className="text-xs font-normal text-red-300 ml-1">/ 0.85</span>
            </div>
          </div>

          <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-700">
            <div className="text-[10px] text-slate-400 uppercase font-sans font-medium">
              Affected Hub
            </div>
            <div className="text-xs font-bold text-amber-300 mt-1 truncate" title={snapshot?.fastestDriftingCluster}>
              {snapshot?.fastestDriftingCluster || 'Associative Core'}
            </div>
          </div>
        </div>

        {/* Warning copy */}
        <p className="text-xs text-slate-200 leading-relaxed mb-3">
          Synaptic Drift Guard registered violent plasticity divergence. Unchecked STDP acceleration
          threatens to saturate dynamic weights. Engage corrective LTD loop to arrest runaway.
        </p>

        {/* Feedback notification if action executed */}
        {actionFeedback && (
          <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-emerald-950 border border-emerald-500 text-emerald-200 text-xs font-mono font-semibold">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExecuteLTD}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-xs font-bold font-mono tracking-wide shadow-lg shadow-red-900/50 transition-all cursor-pointer"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Execute Corrective LTD Loop</span>
          </button>

          {onAuditAndClean && (
            <button
              onClick={handleAudit}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-mono font-medium transition cursor-pointer"
              title="Audit and purge near-zero floating pathways"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Clean Bleed</span>
            </button>
          )}

          {onSimulateDriftSpike && (
            <button
              onClick={onSimulateDriftSpike}
              className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 text-[10px] font-mono transition"
              title="Test 0.92 Velocity Spike Alert"
            >
              Test 0.92 Spike
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
