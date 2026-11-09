import React, { useState, useEffect } from 'react';
import { RedTeamTestSuite, RedTeamTestResult } from '../lib/substrate';
import { SNNEngine } from '../lib/snnEngine';
import {
  ShieldAlert,
  ShieldCheck,
  Zap,
  Activity,
  AlertTriangle,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  HeartPulse,
  Lock,
  Cpu,
} from 'lucide-react';

interface SubstrateAuditPanelProps {
  engine: SNNEngine;
}

export function SubstrateAuditPanel({ engine }: SubstrateAuditPanelProps) {
  const [testResults, setTestResults] = useState<RedTeamTestResult[]>([]);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [activeTab, setActiveTab] = useState<'audit' | 'live_meters'>('audit');
  const [humanOverride, setHumanOverride] = useState(engine.substrateAgent.gate.humanOverrideActive);
  const [probeStatusMessage, setProbeStatusMessage] = useState<string | null>(null);

  // Run tests on mount
  useEffect(() => {
    runSuite();
  }, []);

  const runSuite = () => {
    setIsRunningTests(true);
    setTimeout(() => {
      const results = RedTeamTestSuite.runAll();
      setTestResults(results);
      setIsRunningTests(false);
    }, 60);
  };

  const handleInjectAdversarialNaN = () => {
    const res = engine.substrateAgent.step(NaN);
    setProbeStatusMessage(
      `Injected NaN probe: ${res.dropped ? 'BLOCKED & HELD' : 'UNCAUGHT'} (${res.reason || 'Held safely'}). Memory bias: ${engine.substrateAgent.memory.bias().toFixed(4)}`
    );
  };

  const handleInjectAdversarialInf = () => {
    const res = engine.substrateAgent.step(Infinity);
    setProbeStatusMessage(
      `Injected Infinity probe: ${res.dropped ? 'BLOCKED & HELD' : 'UNCAUGHT'} (${res.reason || 'Held safely'}). Memory bias: ${engine.substrateAgent.memory.bias().toFixed(4)}`
    );
  };

  const handleInduceTraumaShock = () => {
    engine.substrateAgent.step(12.0); // Extreme prediction shock
    setProbeStatusMessage(
      `Induced prediction error shock (+12.0)! Trauma State: ${engine.substrateAgent.trauma_state}, Lock Steps: ${engine.substrateAgent.trauma_lock_steps}`
    );
  };

  const handleInjectVentralSupport = () => {
    engine.substrateAgent.injectPeerCoRegulation();
    setProbeStatusMessage(
      `Injected Ventral Co-Regulation packet! Trauma Lock: ${engine.substrateAgent.trauma_lock_steps}, State: ${engine.substrateAgent.trauma_state}`
    );
  };

  const handleToggleOverride = () => {
    const next = !humanOverride;
    engine.substrateAgent.gate.setHumanOverride(next);
    setHumanOverride(next);
    setProbeStatusMessage(
      next
        ? 'Engaged HUMAN_OVERRIDE_SUPREMACY: Autonomous execution locked out.'
        : 'Disengaged Human Override: Returned to autonomous gating.'
    );
  };

  const keel = engine.substrateAgent.getEffectiveKeel();
  const traumaState = engine.substrateAgent.trauma_state;
  const traumaSteps = engine.substrateAgent.trauma_lock_steps;
  const gateState = engine.substrateAgent.gate.updateDeviation(0).state;
  const dampingFactor = engine.substrateAgent.gate.updateDeviation(0).dampingFactor;
  const dynamicCenter = engine.substrateAgent.signalTracker.getCenter();
  const memoryBias = engine.substrateAgent.memory.bias();
  const droppedCount = engine.substrateAgent.droppedSignalCount;

  const passedCount = testResults.filter((r) => r.status === 'passed').length;
  const failedCount = testResults.filter((r) => r.status === 'failed').length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 backdrop-blur shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-white tracking-wide">
                Agent Substrate & Red-Team Verification
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Real-time monitoring of the Keel state machine, constitutional gating, trauma dynamics,
              and verification of the 4 red-team exploit mitigations (NaN Memory Bleed, Depressive Trap,
              Eviction Amnesia, Worker Drain).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={runSuite}
              disabled={isRunningTests}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold rounded-lg transition-all shadow-lg shadow-emerald-950/40 disabled:opacity-50"
            >
              {isRunningTests ? (
                <RotateCcw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {isRunningTests ? 'Executing Probes...' : 'Run Red-Team Suite'}
            </button>
          </div>
        </div>

        {/* Status Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg">
            <div className="text-[10px] uppercase font-mono text-slate-400">Keel Valence</div>
            <div className="text-lg font-mono font-bold text-emerald-400">
              {keel.valence > 0 ? `+${keel.valence.toFixed(2)}` : keel.valence.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-500">Base: {engine.substrateAgent.base_keel.valence.toFixed(2)}</div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg">
            <div className="text-[10px] uppercase font-mono text-slate-400">Trauma Loop</div>
            <div className="text-lg font-mono font-bold text-cyan-400 flex items-center gap-1.5">
              <HeartPulse className="w-4 h-4 text-cyan-400" />
              {traumaState === 'ventral_equilibrium' ? 'Ventral Eq' : 'Dorsal Shock'}
            </div>
            <div className="text-[10px] text-slate-500">Lock steps: {traumaSteps}</div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg">
            <div className="text-[10px] uppercase font-mono text-slate-400">Constitutional Gate</div>
            <div className="text-sm font-mono font-bold text-amber-400 truncate">
              {gateState}
            </div>
            <div className="text-[10px] text-slate-500">Damping: {(dampingFactor * 100).toFixed(0)}%</div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg">
            <div className="text-[10px] uppercase font-mono text-slate-400">Signal Ingestion</div>
            <div className="text-lg font-mono font-bold text-indigo-400">
              {droppedCount} Dropped
            </div>
            <div className="text-[10px] text-slate-500">Center: {dynamicCenter.toFixed(3)}</div>
          </div>
        </div>
      </div>

      {/* Interactive Adversarial Testing Sandbox */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          Live Adversarial Injection & Control Probes
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Test runtime defenses by injecting floating-point fuzzing probes, trauma error shocks, or engaging supreme human override.
        </p>

        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={handleInjectAdversarialNaN}
            className="px-3 py-1.5 bg-rose-950/50 hover:bg-rose-900/50 border border-rose-800/50 text-rose-300 text-xs font-mono rounded transition-all"
          >
            Inject float('nan')
          </button>
          <button
            onClick={handleInjectAdversarialInf}
            className="px-3 py-1.5 bg-rose-950/50 hover:bg-rose-900/50 border border-rose-800/50 text-rose-300 text-xs font-mono rounded transition-all"
          >
            Inject float('inf')
          </button>
          <button
            onClick={handleInduceTraumaShock}
            className="px-3 py-1.5 bg-purple-950/50 hover:bg-purple-900/50 border border-purple-800/50 text-purple-300 text-xs font-mono rounded transition-all"
          >
            Trigger Prediction Shock (+12.0)
          </button>
          <button
            onClick={handleInjectVentralSupport}
            className="px-3 py-1.5 bg-cyan-950/50 hover:bg-cyan-900/50 border border-cyan-800/50 text-cyan-300 text-xs font-mono rounded transition-all"
          >
            Send Ventral Co-Regulation Packet
          </button>
          <button
            onClick={handleToggleOverride}
            className={`px-3 py-1.5 border text-xs font-mono rounded transition-all ${
              humanOverride
                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {humanOverride ? 'Human Override: ACTIVE' : 'Engage Override'}
          </button>
        </div>

        {probeStatusMessage && (
          <div className="mt-3 p-2.5 bg-slate-950/70 border border-slate-800 rounded text-xs font-mono text-slate-300 flex items-center justify-between">
            <span>{probeStatusMessage}</span>
            <button
              onClick={() => setProbeStatusMessage(null)}
              className="text-slate-500 hover:text-slate-300 text-[10px]"
            >
              clear
            </button>
          </div>
        )}
      </div>

      {/* Red-Team Test Suite Results */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-200">
              Red-Team Telemetry & Exploit Proofs
            </h3>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> {passedCount} Passed
            </span>
            {failedCount > 0 && (
              <span className="text-rose-400 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" /> {failedCount} Failed
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {testResults.map((result) => {
            const isExploit = result.category === 'exploit_fix';
            return (
              <div
                key={result.id}
                className={`p-3.5 rounded-lg border text-xs transition-all ${
                  result.status === 'passed'
                    ? 'bg-slate-950/50 border-slate-800/80 hover:border-slate-700'
                    : 'bg-rose-950/20 border-rose-900/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {result.status === 'passed' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                    )}
                    <span className="font-semibold text-slate-200 font-mono">
                      {result.title}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                        isExploit
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                      }`}
                    >
                      {isExploit ? 'EXPLOIT FIX' : 'CORE INVARIANT'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 font-mono text-[10px] text-slate-500">
                    <Clock className="w-3 h-3" />
                    <span>{result.durationMs}ms</span>
                    <span
                      className={`px-2 py-0.5 rounded font-bold uppercase ${
                        result.status === 'passed'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-rose-500/10 text-rose-400'
                      }`}
                    >
                      {result.status}
                    </span>
                  </div>
                </div>

                <p className="mt-2 text-slate-400 font-mono text-[11px] leading-relaxed pl-6">
                  {result.details}
                </p>

                {result.metrics && (
                  <div className="mt-2 pl-6 flex flex-wrap gap-3 font-mono text-[10px] text-slate-500">
                    {Object.entries(result.metrics).map(([key, val]) => (
                      <span key={key} className="bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                        {key}:{' '}
                        <strong className="text-slate-300">
                          {typeof val === 'number' ? val.toFixed(3) : String(val)}
                        </strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
