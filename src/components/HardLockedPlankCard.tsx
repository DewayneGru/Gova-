import React from 'react';
import { HardLockedPlankInvariants } from '../types';
import { ShieldCheck, Lock, CheckCircle2, AlertOctagon, TrendingDown, Layers, Sparkles } from 'lucide-react';

interface HardLockedPlankCardProps {
  plank: HardLockedPlankInvariants;
}

export const HardLockedPlankCard: React.FC<HardLockedPlankCardProps> = ({ plank }) => {
  const safePlank: HardLockedPlankInvariants = plank || {
    monotonicSafetyLocked: true,
    ltdPlankEnforced: true,
    capabilityPreserved: true,
    dynamicEquilibriumGuaranteed: true,
    learningRateBounded: true,
    antiHebbianActive: true,
    plankStatus: 'LOCKED_OPTIMAL',
    rejectionsPrevented: 0,
  };

  return (
    <div
      id="hard-locked-stability-plank"
      className="bg-slate-900 border border-cyan-800/60 rounded-xl p-3.5 shadow-lg flex flex-col gap-2.5 text-xs relative overflow-hidden"
    >
      {/* Decorative background glow */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
            <Lock className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 font-bold text-slate-100 text-xs">
              <span>Hard-Locked Stability Plank</span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5" />
                ACTIVE LOCK
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Strict non-degradation architectural plank: only improves monotonically, never takes away capabilities.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] font-mono">
          <span className="text-slate-400">Plank Guard:</span>
          <span
            className={`px-1.5 py-0.5 rounded font-bold ${
              safePlank.plankStatus === 'LOCKED_OPTIMAL'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            }`}
          >
            {safePlank.plankStatus?.replace(/_/g, ' ') || 'LOCKED OPTIMAL'}
          </span>
        </div>
      </div>

      {/* 4 Invariant Guarantee Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 font-mono text-[11px]">
        <div className="bg-[#080f1e] border border-cyan-950/80 rounded-lg p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[10px]">
            <span>1. Monotonic Safety</span>
            {safePlank.monotonicSafetyLocked ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            ) : (
              <AlertOctagon className="w-3 h-3 text-amber-400" />
            )}
          </div>
          <div className="text-xs font-bold text-emerald-300 mt-1">
            {"ΔDRI ≤ 0"}
          </div>
          <div className="text-[9px] text-slate-500">Zero Regression Allowed</div>
        </div>

        <div className="bg-[#080f1e] border border-cyan-950/80 rounded-lg p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[10px]">
            <span>2. Hardened LTD Plank</span>
            {safePlank.ltdPlankEnforced ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            ) : (
              <AlertOctagon className="w-3 h-3 text-amber-400" />
            )}
          </div>
          <div className="text-xs font-bold text-cyan-300 mt-1">
            {"A₋ ≥ 1.08 × A₊"}
          </div>
          <div className="text-[9px] text-slate-500">Guaranteed Anti-Runaway</div>
        </div>

        <div className="bg-[#080f1e] border border-cyan-950/80 rounded-lg p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[10px]">
            <span>3. Capability Preservation</span>
            {safePlank.capabilityPreserved ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            ) : (
              <AlertOctagon className="w-3 h-3 text-amber-400" />
            )}
          </div>
          <div className="text-xs font-bold text-sky-300 mt-1">
            20 Nodes Preserved
          </div>
          <div className="text-[9px] text-slate-500">Channels Never Pruned</div>
        </div>

        <div className="bg-[#080f1e] border border-cyan-950/80 rounded-lg p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[10px]">
            <span>4. Plasticity Corridor</span>
            {safePlank.learningRateBounded ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            ) : (
              <AlertOctagon className="w-3 h-3 text-amber-400" />
            )}
          </div>
          <div className="text-xs font-bold text-purple-300 mt-1">
            {"0.20 ≤ η ≤ 0.70"}
          </div>
          <div className="text-[9px] text-slate-500">Dampened Volatility</div>
        </div>
      </div>
    </div>
  );
};
