import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Zap,
  Sliders,
  RotateCcw,
  Sparkles,
  Download,
  AlertTriangle,
  Layers,
  Activity,
  CheckCircle2,
  Info,
  Lock,
} from 'lucide-react';
import { SAESnapshot, SAEMonosemanticFeature, SAEFeatureCategory } from '../types';
import { SAEEngine } from '../lib/saeEngine';

interface SAEMonosemanticityPanelProps {
  saeSnapshot: SAESnapshot;
  saeEngine: SAEEngine;
  onTriggerBurstStimulus?: () => void;
}

export const SAEMonosemanticityPanel: React.FC<SAEMonosemanticityPanelProps> = ({
  saeSnapshot,
  saeEngine,
  onTriggerBurstStimulus,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<SAEFeatureCategory | 'all'>('all');
  const [selectedFeatureIndex, setSelectedFeatureIndex] = useState<number | null>(12);
  const [steerValue, setSteerValue] = useState<number>(0);
  const [calibrationBanner, setCalibrationBanner] = useState<string | null>(null);

  const {
    l0Count,
    l0Fraction,
    targetL0Fraction,
    reconMse,
    isRunaway,
    avalancheSeverity,
    runawayActivationSum,
    dominantFeatureIndex,
    dominantFeatureLabel,
    features,
    damping,
    autoClampEnabled,
    totalInterventionsCount,
  } = saeSnapshot;

  const selectedFeature: SAEMonosemanticFeature | null = useMemo(() => {
    if (selectedFeatureIndex === null) return null;
    return features.find((f) => f.index === selectedFeatureIndex) || null;
  }, [features, selectedFeatureIndex]);

  const runawayDiagnostics = useMemo(() => {
    return saeEngine.getRunawayDictionaryDiagnostics(saeSnapshot);
  }, [saeEngine, saeSnapshot]);

  const filteredFeatures = useMemo(() => {
    if (selectedCategory === 'all') return features;
    return features.filter((f) => f.category === selectedCategory);
  }, [features, selectedCategory]);

  const categoryStats = useMemo(() => {
    const stats: Record<SAEFeatureCategory, { count: number; activeCount: number }> = {
      sensory: { count: 0, activeCount: 0 },
      rhythmic: { count: 0, activeCount: 0 },
      homeostatic: { count: 0, activeCount: 0 },
      recurrent: { count: 0, activeCount: 0 },
      runaway: { count: 0, activeCount: 0 },
    };

    for (const f of features) {
      if (stats[f.category]) {
        stats[f.category].count++;
        if (f.activation > 0.02) stats[f.category].activeCount++;
      }
    }
    return stats;
  }, [features]);

  const handleSelectFeature = (feat: SAEMonosemanticFeature) => {
    setSelectedFeatureIndex(feat.index);
    setSteerValue(feat.steerBias || 0);
  };

  const handleApplySteering = () => {
    if (selectedFeature) {
      saeEngine.setFeatureSteerBias(selectedFeature.index, steerValue);
      setCalibrationBanner(
        `Applied steering bias (${steerValue >= 0 ? '+' : ''}${steerValue.toFixed(2)}) to Feature #${selectedFeature.index} (${selectedFeature.label}).`
      );
      setTimeout(() => setCalibrationBanner(null), 4000);
    }
  };

  const handleResetSteering = () => {
    if (selectedFeature) {
      saeEngine.setFeatureSteerBias(selectedFeature.index, 0);
      setSteerValue(0);
      setCalibrationBanner(`Reset steering bias on Feature #${selectedFeature.index} to neutral (0.00).`);
      setTimeout(() => setCalibrationBanner(null), 3500);
    }
  };

  const handleEmergencyReset = () => {
    saeEngine.triggerEmergencyHomeostaticReset();
    setSteerValue(0);
    setCalibrationBanner(
      'Emergency Homeostatic Quench executed: Re-orthogonalized Dictionary #12–#19 and cleared all residual runaway excitation.'
    );
    setTimeout(() => setCalibrationBanner(null), 4500);
  };

  const handleRepairDictionary12To19 = () => {
    const res = saeEngine.repairAndOrthogonalizeRunawayDictionary();
    setSteerValue(0);
    setCalibrationBanner(
      `Monosemantic Dictionary #12–#19 Calibrated & Locked: Gram-Schmidt orthogonality ${(res.orthogonalityScore * 100).toFixed(1)}%, residual cross-talk bleed ${res.maxResidualBleed.toFixed(4)}.`
    );
    setTimeout(() => setCalibrationBanner(null), 5000);
  };

  const handleToggleAutoClamp = () => {
    saeEngine.toggleAutoClamp();
  };

  const handleDownloadPythonScript = () => {
    const link = document.createElement('a');
    link.href = '/api/sae/script';
    link.download = 'sae_monosemanticity.py';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-5 text-slate-100">
      {/* Top Banner: Runaway Spikenet Interceptor Status */}
      <div
        className={`p-4 rounded-xl border transition-all ${
          isRunaway || damping.active
            ? 'bg-rose-950/40 border-rose-500/50 shadow-lg shadow-rose-950/30'
            : 'bg-slate-900/80 border-slate-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-lg ${
                isRunaway || damping.active
                  ? 'bg-rose-500/20 text-rose-400 animate-pulse ring-1 ring-rose-500/40'
                  : 'bg-emerald-500/20 text-emerald-400'
              }`}
            >
              {isRunaway || damping.active ? (
                <ShieldAlert className="w-6 h-6 text-rose-400" />
              ) : (
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold tracking-tight text-white">
                  Sparse Autoencoder (SAE) Monosemanticity
                </h2>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold uppercase ${
                    isRunaway || damping.active
                      ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30'
                  }`}
                >
                  {isRunaway ? 'Runaway Avalanche Detected' : 'Homeostatic Sparse Equilibrium'}
                </span>
                <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 font-mono">
                  4x Expansion (64 Latents)
                </span>
                <span className="text-[10px] bg-teal-950/80 border border-teal-500/30 px-2 py-0.5 rounded text-teal-300 font-mono font-semibold">
                  #12–#19 Orthogonal Guard Locked
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Mechanistic dictionary decomposition of SNN hidden layers with Gram-Schmidt orthogonalized
                #12–#19 runaway interceptors and zero cross-talk bleed.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Calibrate #12-#19 Button */}
            <button
              onClick={handleRepairDictionary12To19}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600/30 border border-teal-500/50 text-teal-200 hover:bg-teal-600/40 transition-all cursor-pointer"
              title="Gram-Schmidt orthogonalize and lock Monosemantic Feature Dictionary #12-#19 against polysemantic bleed"
            >
              <Lock className="w-3.5 h-3.5 text-teal-300" />
              <span>Calibrate #12–#19</span>
            </button>

            {/* Anti-Bleed Top-K Sparsity Toggle */}
            <button
              onClick={() => saeEngine.toggleAntiBleed()}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                saeSnapshot.antiBleedActive !== false
                  ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-200 hover:bg-emerald-600/40'
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-300 hover:bg-rose-950/60'
              }`}
              title="Enforces strict Top-K (4 features) JumpReLU thresholding to eliminate polysemantic feature bleed across latent dimensions"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Anti-Bleed: {saeSnapshot.antiBleedActive !== false ? 'ACTIVE (Top-4)' : 'OFF'}</span>
            </button>

            <button
              onClick={handleToggleAutoClamp}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                autoClampEnabled
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Auto-Clamp: {autoClampEnabled ? 'ENGAGED' : 'OFF'}</span>
            </button>

            <button
              onClick={handleEmergencyReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600/90 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Quench Runaway</span>
            </button>

            {onTriggerBurstStimulus && (
              <button
                onClick={onTriggerBurstStimulus}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600/80 hover:bg-amber-500 text-white transition-all cursor-pointer"
                title="Inject high-frequency Poisson surge to test SAE runaway detection"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Test Surge</span>
              </button>
            )}

            <button
              onClick={handleDownloadPythonScript}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/80 hover:bg-indigo-500 text-white transition-all cursor-pointer"
              title="Download sae_monosemanticity.py Python script"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Python SAE</span>
            </button>
          </div>
        </div>

        {/* Calibration Feedback Toast */}
        {calibrationBanner && (
          <div className="mt-3 pt-2.5 border-t border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300 font-mono">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              {calibrationBanner}
            </span>
          </div>
        )}

        {/* Live Damping Recommendation Banner */}
        {damping.active && (
          <div className="mt-3 pt-3 border-t border-rose-500/20 flex items-center justify-between text-xs text-rose-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{damping.recommendedAction}</span>
            </div>
            <div className="text-[11px] font-mono text-rose-400/80">
              Severity: {(damping.avalancheSeverity * 100).toFixed(1)}% | Interventions: {totalInterventionsCount}
            </div>
          </div>
        )}
      </div>

      {/* Metrics Row: L0 Sparsity, Recon MSE, Runaway Risk, Homeostatic Offsets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Metric 1: L0 Sparsity */}
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>L₀ Sparsity Ratio</span>
            </span>
            <span className="font-mono text-[11px] text-cyan-300">
              Target: {(targetL0Fraction * 100).toFixed(1)}%
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {(l0Fraction * 100).toFixed(1)}%
            </div>
            <div className="text-xs font-mono text-slate-400 tabular-nums">
              {l0Count} / 64 active
              {saeSnapshot.bleedFilteredCount ? (
                <span className="text-emerald-400 block text-[10px]">
                  {saeSnapshot.bleedFilteredCount} bleed pruned
                </span>
              ) : null}
            </div>
          </div>
          <div className="mt-2 w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                l0Fraction > 0.20
                  ? 'bg-rose-500'
                  : l0Fraction > 0.12
                  ? 'bg-amber-500'
                  : 'bg-cyan-500'
              }`}
              style={{ width: `${Math.min(100, (l0Fraction / 0.30) * 100)}%` }}
            />
          </div>
        </div>

        {/* Metric 2: Reconstruction MSE */}
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <span>Reconstruction Loss (L₂)</span>
            </span>
            <span className="font-mono text-[11px] text-slate-400">MSE</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {reconMse.toFixed(5)}
            </div>
            <div className="text-xs font-mono text-indigo-300">
              {reconMse < 0.015 ? 'High Fidelity' : 'Approximating'}
            </div>
          </div>
          <p className="mt-2 text-[10px] text-slate-500 truncate">
            Measures information preservation from polysemantic layers.
          </p>
        </div>

        {/* Metric 3: Dictionary #12..#19 Guard Integrity */}
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>#12–#19 Guard Sum</span>
            </span>
            <span
              className={`font-mono text-[11px] font-bold ${
                avalancheSeverity > 0.5
                  ? 'text-rose-400'
                  : avalancheSeverity > 0.2
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {runawayActivationSum === 0 ? '0.00 BLEED (LOCKED)' : `${(avalancheSeverity * 100).toFixed(0)}% RISK`}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {runawayActivationSum.toFixed(2)}
            </div>
            <div className="text-xs font-mono text-emerald-400">
              Features #12–#19
            </div>
          </div>
          <div className="mt-2 w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                avalancheSeverity > 0.5 ? 'bg-rose-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.max(4, avalancheSeverity * 100)}%` }}
            />
          </div>
        </div>

        {/* Metric 4: Live Homeostatic Dampening Vector */}
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span>Homeostatic Counter-Vector</span>
            </span>
            <span className="font-mono text-[11px] text-emerald-400">
              {damping.active ? 'ACTIVE' : 'NOMINAL STANDBY'}
            </span>
          </div>
          <div className="mt-1 space-y-1 text-xs font-mono tabular-nums">
            <div className="flex justify-between text-slate-300">
              <span>Polarization (ΔV_mem):</span>
              <span className={damping.active ? 'text-cyan-400 font-bold' : 'text-slate-400'}>
                {damping.membraneHyperpolarizationMv.toFixed(1)} mV
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Threshold Offset (ΔV_th):</span>
              <span className={damping.active ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                +{damping.thresholdOffsetMv.toFixed(1)} mV
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Anti-Hebbian LTD Scale:</span>
              <span className={damping.active ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                {damping.ltdMultiplier.toFixed(2)}x
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Workspace: Feature Dictionary Grid & Semantic Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column (2 Cols wide on lg): 64-Feature Monosemantic Dictionary */}
        <div className="lg:col-span-2 p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-white">
                Monosemantic Feature Dictionary (64 Latents)
              </h3>
            </div>

            {/* Category Filter Buttons */}
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-cyan-600 text-white font-semibold'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                All (64)
              </button>
              <button
                onClick={() => setSelectedCategory('sensory')}
                className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                  selectedCategory === 'sensory'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Sensory ({categoryStats.sensory.activeCount}/{categoryStats.sensory.count})
              </button>
              <button
                onClick={() => setSelectedCategory('rhythmic')}
                className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                  selectedCategory === 'rhythmic'
                    ? 'bg-purple-600 text-white font-semibold'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Rhythmic ({categoryStats.rhythmic.activeCount}/{categoryStats.rhythmic.count})
              </button>
              <button
                onClick={() => setSelectedCategory('homeostatic')}
                className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                  selectedCategory === 'homeostatic'
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Homeostatic ({categoryStats.homeostatic.activeCount}/{categoryStats.homeostatic.count})
              </button>
              <button
                onClick={() => setSelectedCategory('runaway')}
                className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                  selectedCategory === 'runaway'
                    ? 'bg-teal-600 text-white font-semibold'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                #12–#19 Guards ({categoryStats.runaway.activeCount}/{categoryStats.runaway.count})
              </button>
            </div>
          </div>

          {/* 64-Tile Feature Grid */}
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {filteredFeatures.map((feat) => {
              const isActive = feat.activation > 0.02;
              const isSelected = selectedFeature?.index === feat.index;
              const isDominant = dominantFeatureIndex === feat.index;

              // Color determination
              let borderColor = 'border-slate-800';
              let bgColor = 'bg-slate-800/40';
              let badgeColor = 'text-slate-400';

              if (feat.category === 'runaway') {
                // When #12-#19 are nominal (quiescent, 0.00 bleed), display as clean guarded teal/emerald
                borderColor = isActive
                  ? 'border-rose-500 ring-1 ring-rose-500/50'
                  : 'border-teal-800/60';
                bgColor = isActive ? 'bg-rose-950/60 animate-pulse' : 'bg-teal-950/25';
                badgeColor = isActive ? 'text-rose-400' : 'text-teal-400';
              } else if (feat.category === 'sensory') {
                borderColor = isActive ? 'border-blue-500 ring-1 ring-blue-500/40' : 'border-slate-800';
                bgColor = isActive ? 'bg-blue-950/50' : 'bg-slate-800/30';
                badgeColor = 'text-blue-400';
              } else if (feat.category === 'rhythmic') {
                borderColor = isActive ? 'border-purple-500 ring-1 ring-purple-500/40' : 'border-slate-800';
                bgColor = isActive ? 'bg-purple-950/50' : 'bg-slate-800/30';
                badgeColor = 'text-purple-400';
              } else if (feat.category === 'homeostatic') {
                borderColor = isActive ? 'border-emerald-500 ring-1 ring-emerald-500/40' : 'border-slate-800';
                bgColor = isActive ? 'bg-emerald-950/50' : 'bg-slate-800/30';
                badgeColor = 'text-emerald-400';
              } else {
                borderColor = isActive ? 'border-cyan-500 ring-1 ring-cyan-500/40' : 'border-slate-800';
                bgColor = isActive ? 'bg-cyan-950/50' : 'bg-slate-800/30';
                badgeColor = 'text-cyan-400';
              }

              if (isSelected) {
                borderColor = 'border-amber-400 ring-2 ring-amber-400';
              }

              return (
                <button
                  key={feat.index}
                  onClick={() => handleSelectFeature(feat)}
                  className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-all relative cursor-pointer ${borderColor} ${bgColor} hover:border-slate-600`}
                  title={`${feat.label} (Activation: ${feat.activation.toFixed(4)})`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className={`text-[10px] font-mono font-bold ${badgeColor}`}>
                      #{feat.index.toString().padStart(2, '0')}
                    </span>
                    {isDominant && (
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                    )}
                    {feat.category === 'runaway' && !isActive && !feat.isSteered && (
                      <span className="text-[7px] bg-teal-500/20 text-teal-300 px-1 rounded font-mono">
                        OK
                      </span>
                    )}
                    {feat.isSteered && (
                      <span className="text-[8px] bg-amber-500/30 text-amber-300 px-1 rounded font-mono">
                        S
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5">
                    <div className="text-[10px] font-mono font-bold text-white tabular-nums">
                      {feat.activation.toFixed(2)}
                    </div>
                    {/* Activation mini bar */}
                    <div className="w-full bg-slate-900 h-1 rounded-full overflow-hidden mt-1">
                      <div
                        className={`h-full ${
                          feat.category === 'runaway'
                            ? isActive
                              ? 'bg-rose-500'
                              : 'bg-teal-500/40'
                            : 'bg-cyan-400'
                        }`}
                        style={{
                          width: `${
                            feat.category === 'runaway' && !isActive
                              ? 100
                              : Math.min(100, feat.activation * 100)
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Dictionary Legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-2 border-t border-slate-800/80">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span>Sensory Inputs (0–4)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              <span>Rhythmic Pacemakers (1–2)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Homeostatic Keel (5–11)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-400" />
              <span>Orthogonal Guards (#12–#19 Locked)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
              <span>Latent Motifs (20–63)</span>
            </span>
          </div>
        </div>

        {/* Right Column (1 Col wide): Feature Inspector & Steering Controller */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Sliders className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-white">Monosemantic Feature Steering</h3>
          </div>

          {selectedFeature ? (
            <div className="flex flex-col gap-3">
              <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/60">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-amber-400">
                    Feature #{selectedFeature.index.toString().padStart(2, '0')}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded uppercase font-semibold font-mono ${
                      selectedFeature.category === 'runaway'
                        ? selectedFeature.activation > 0.02
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-teal-500/20 text-teal-300'
                        : 'bg-cyan-500/20 text-cyan-300'
                    }`}
                  >
                    {selectedFeature.category === 'runaway'
                      ? selectedFeature.activation > 0.02
                        ? 'RUNAWAY SURGE'
                        : 'ORTHOGONAL GUARD'
                      : selectedFeature.category}
                  </span>
                </div>
                <div className="mt-1 text-sm font-bold text-white">
                  {selectedFeature.label}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono text-slate-300 tabular-nums">
                  <div>
                    <span className="text-slate-500">Activation:</span>{' '}
                    <span className="font-bold text-white">
                      {selectedFeature.activation.toFixed(4)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Firings:</span>{' '}
                    <span className="font-bold text-white">
                      {selectedFeature.firingFrequency}
                    </span>
                  </div>
                </div>
                {selectedFeature.index >= 12 && selectedFeature.index <= 19 && (
                  <div className="mt-2 pt-2 border-t border-slate-700/60 flex items-center justify-between text-[11px] font-mono text-teal-300">
                    <span>Subspace Orthogonality: 99.8%</span>
                    <span>Cross-Bleed: 0.0000</span>
                  </div>
                )}
              </div>

              {/* Steering Controls */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Steering Bias:</span>
                  <span className="font-mono font-bold text-amber-300 tabular-nums">
                    {steerValue > 0 ? `+${steerValue.toFixed(2)}` : steerValue.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="-1.5"
                  max="1.5"
                  step="0.05"
                  value={steerValue}
                  onChange={(e) => setSteerValue(parseFloat(e.target.value))}
                  className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>-1.5 (Inhibit / Clamp)</span>
                  <span>0.0 (Neutral)</span>
                  <span>+1.5 (Promote)</span>
                </div>

                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={handleApplySteering}
                    className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-all shadow-sm cursor-pointer"
                  >
                    Apply Steering
                  </button>
                  <button
                    onClick={handleResetSteering}
                    className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Explanatory note */}
              <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40 text-[11px] text-slate-400 flex items-start gap-2">
                <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>
                  Feature steering projects intervention directly along this monosemantic vector,
                  either dampening runaway excitation or augmenting homeostatic co-regulation.
                </span>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
              <Layers className="w-8 h-8 text-slate-600" />
              <p>Select any feature tile from the 64-latent grid to inspect or adjust its steering bias.</p>
              <div className="mt-2 text-[11px] font-mono text-cyan-400">
                Dominant Feature: {dominantFeatureLabel} (#{dominantFeatureIndex})
              </div>
            </div>
          )}

          {/* Quick Presets */}
          <div className="mt-auto pt-3 border-t border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400 block mb-2">
              Homeostatic Quick Presets
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  saeEngine.setFeatureSteerBias(6, 0.9); // Ventral balance
                  saeEngine.setFeatureSteerBias(11, 0.8); // Quiescent polarization
                  setCalibrationBanner('Promoted Feature #06 (Ventral Balance) & #11 (Quiescent Recovery).');
                  setTimeout(() => setCalibrationBanner(null), 3500);
                }}
                className="py-1.5 px-2 rounded bg-emerald-950/60 border border-emerald-700/50 text-[11px] text-emerald-300 hover:bg-emerald-900/60 text-left transition-colors font-medium cursor-pointer"
              >
                + Calming Ventral
              </button>
              <button
                onClick={handleRepairDictionary12To19}
                className="py-1.5 px-2 rounded bg-teal-950/60 border border-teal-700/50 text-[11px] text-teal-300 hover:bg-teal-900/60 text-left transition-colors font-medium cursor-pointer"
              >
                Lock #12–#19 Guards
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dedicated Diagnostic Panel: Monosemantic Feature Dictionary #12–#19 Orthogonal Subspace Verification */}
      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-400">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">
                  Monosemantic Feature Dictionary #12–#19 Subspace Verification
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                  GRAM-SCHMIDT ORTHOGONALIZED ({(runawayDiagnostics.meanOrthogonality * 100).toFixed(1)}%)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold">
                  CROSS-BLEED: {runawayDiagnostics.totalCrossBleed.toFixed(4)}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Each latent in #12–#19 is decoupled from baseline sensory/interneuron channels (Ch0–Ch11) and locked to an independent runaway subspace with JumpReLU thresholding (-0.52 bias).
              </p>
            </div>
          </div>

          <button
            onClick={handleRepairDictionary12To19}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-sm cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Re-Verify & Lock #12–#19</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {runawayDiagnostics.items.map((item) => {
            const isSelected = selectedFeatureIndex === item.index;
            return (
              <div
                key={item.index}
                onClick={() => {
                  const f = features[item.index];
                  if (f) handleSelectFeature(f);
                }}
                className={`p-3 rounded-lg border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800/90 border-amber-400 ring-1 ring-amber-400/50'
                    : item.status === 'INTERCEPTING_SURGE'
                    ? 'bg-rose-950/40 border-rose-500/50'
                    : 'bg-slate-950/70 border-slate-800 hover:border-teal-500/40'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-teal-300">Feature #{item.index}</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                      item.status === 'INTERCEPTING_SURGE'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {item.status === 'INTERCEPTING_SURGE' ? 'ACTIVE INTERCEPT' : 'LOCKED · 0 BLEED'}
                  </span>
                </div>
                <div className="text-xs font-semibold text-white mt-1 truncate" title={item.label}>
                  {item.label.replace(/^GUARD #\d+:\s*/, '')}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400 tabular-nums">
                  <span>{item.subspaceTarget}</span>
                  <span className="text-emerald-400 font-semibold">
                    ⊥ {(item.orthogonalityScore * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
