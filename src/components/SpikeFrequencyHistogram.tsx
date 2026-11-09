import React, { useState } from 'react';
import { NetworkFrequencyProfile, NeuronFrequencyData } from '../types';
import {
  BarChart3,
  Activity,
  Layers,
  Sparkles,
  Zap,
  Info,
  Radio,
  Sliders,
  Gauge,
  Cpu,
} from 'lucide-react';

interface SpikeFrequencyHistogramProps {
  profile: NetworkFrequencyProfile;
  onInjectManualPulse?: (neuronId: number) => void;
}

export const SpikeFrequencyHistogram: React.FC<SpikeFrequencyHistogramProps> = ({
  profile,
  onInjectManualPulse,
}) => {
  const [viewMode, setViewMode] = useState<'grouped_bars' | 'distribution_bins'>('grouped_bars');
  const [selectedNeuronId, setSelectedNeuronId] = useState<number | null>(null);

  const { groups, neurons, overall } = profile;

  // Max scale for bar chart: at least 60Hz or peak Hz rounded up
  const maxScaleHz = Math.max(60, Math.ceil(overall.peakHz / 10) * 10);

  // Grouped subsets
  const afferentNeurons = neurons.filter((n) => n.layer === 'sensory');
  const corticalNeurons = neurons.filter((n) => n.layer === 'inter');
  const efferentNeurons = neurons.filter((n) => n.layer === 'motor');

  // Distribution bins: [0-5Hz, 5-15Hz, 15-35Hz, 35-55Hz, >55Hz]
  const bins = [
    { label: 'Quiescent (0-5 Hz)', min: 0, max: 5 },
    { label: 'Low Flux (5-15 Hz)', min: 5, max: 15 },
    { label: 'Nominal Cortical (15-35 Hz)', min: 15, max: 35 },
    { label: 'High Activity (35-55 Hz)', min: 35, max: 55 },
    { label: 'Hyperactive (>55 Hz)', min: 55, max: 9999 },
  ];

  const binData = bins.map((bin) => {
    const affCount = afferentNeurons.filter((n) => n.frequencyHz >= bin.min && n.frequencyHz < bin.max).length;
    const cortCount = corticalNeurons.filter((n) => n.frequencyHz >= bin.min && n.frequencyHz < bin.max).length;
    const effCount = efferentNeurons.filter((n) => n.frequencyHz >= bin.min && n.frequencyHz < bin.max).length;
    return {
      ...bin,
      afferent: affCount,
      cortical: cortCount,
      efferent: effCount,
      total: affCount + cortCount + effCount,
    };
  });

  const maxBinCount = Math.max(1, ...binData.map((b) => b.total));

  return (
    <div
      id="spike-frequency-histogram-card"
      className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-lg flex flex-col gap-3 text-xs"
    >
      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
              <span>Real-Time Spike Frequency Histogram</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                Grouped Biological Spectrum
              </span>
            </h4>
            <p className="text-[11px] text-slate-400">
              Live firing frequencies (Hz) categorized across Afferent, Cortical, and Efferent processing stages.
            </p>
          </div>
        </div>

        {/* View Switcher and Overall Summary */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px] font-medium">
            <button
              onClick={() => setViewMode('grouped_bars')}
              className={`px-2.5 py-1 rounded transition-colors ${
                viewMode === 'grouped_bars'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Grouped Frequency Bars
            </button>
            <button
              onClick={() => setViewMode('distribution_bins')}
              className={`px-2.5 py-1 rounded transition-colors ${
                viewMode === 'distribution_bins'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Frequency Distribution Bins
            </button>
          </div>
        </div>
      </div>

      {/* Additional High-Fidelity Monitoring Bar for the Model & Operator */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
        <div className="bg-[#080d1a] border border-slate-800/90 rounded-lg p-2 flex flex-col justify-between">
          <div className="text-[10px] text-slate-400 flex items-center justify-between">
            <span>Network Mean Firing</span>
            <Activity className="w-3 h-3 text-sky-400" />
          </div>
          <div className="text-base font-bold text-sky-300 mt-0.5">
            {overall.meanHz.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">Hz</span>
          </div>
          <div className="text-[10px] text-slate-500">Peak: {overall.peakHz.toFixed(1)} Hz</div>
        </div>

        <div className="bg-[#080d1a] border border-slate-800/90 rounded-lg p-2 flex flex-col justify-between">
          <div className="text-[10px] text-slate-400 flex items-center justify-between">
            <span>Signal-to-Noise (SNR)</span>
            <Radio className="w-3 h-3 text-emerald-400" />
          </div>
          <div className="text-base font-bold text-emerald-300 mt-0.5">
            +{overall.signalToNoiseRatioDb.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">dB</span>
          </div>
          <div className="text-[10px] text-slate-500">Dispersion: σ={overall.dispersionIndex.toFixed(1)}</div>
        </div>

        <div className="bg-[#080d1a] border border-slate-800/90 rounded-lg p-2 flex flex-col justify-between">
          <div className="text-[10px] text-slate-400 flex items-center justify-between">
            <span>Synaptic Sparsity</span>
            <Sliders className="w-3 h-3 text-purple-400" />
          </div>
          <div className="text-base font-bold text-purple-300 mt-0.5">
            {overall.synapticSparsityPct}% <span className="text-[10px] font-normal text-slate-400">quiescent</span>
          </div>
          <div className="text-[10px] text-slate-500">Preserves Dynamic Range</div>
        </div>

        <div className="bg-[#080d1a] border border-slate-800/90 rounded-lg p-2 flex flex-col justify-between">
          <div className="text-[10px] text-slate-400 flex items-center justify-between">
            <span>Total Spike Events</span>
            <Zap className="w-3 h-3 text-amber-400" />
          </div>
          <div className="text-base font-bold text-amber-300 mt-0.5">
            {(groups.afferent.totalSpikes + groups.cortical.totalSpikes + groups.efferent.totalSpikes).toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500">Clockless AER Stream</div>
        </div>
      </div>

      {/* Main View: Grouped Frequency Bars */}
      {viewMode === 'grouped_bars' && (
        <div className="space-y-3">
          {/* Section 1: Afferent Input Channels (Emerald) */}
          <div className="bg-[#070c18] border border-emerald-950/60 rounded-lg p-2.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span className="font-semibold text-emerald-300 text-xs">
                  {groups.afferent.title} ({groups.afferent.code})
                </span>
                <span className="text-[10px] font-mono text-emerald-400/80 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                  Mean: {groups.afferent.meanHz} Hz | Peak: {groups.afferent.peakHz} Hz
                </span>
              </div>
              <div className="text-[10px] font-mono text-slate-400 flex items-center gap-2">
                <span>Active: {(groups.afferent.activeFraction * 100).toFixed(0)}%</span>
                <span className="text-slate-600">•</span>
                <span>Power: ~{groups.afferent.powerDissipationMw.toFixed(2)} mW</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {afferentNeurons.map((n) => {
                const heightPct = Math.min(100, Math.max(4, (n.frequencyHz / maxScaleHz) * 100));
                const isSelected = selectedNeuronId === n.id;
                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      setSelectedNeuronId(n.id);
                      onInjectManualPulse?.(n.id);
                    }}
                    className={`flex flex-col items-center bg-slate-950/70 border rounded-lg p-1.5 cursor-pointer transition-all hover:border-emerald-400/70 ${
                      isSelected ? 'border-emerald-400 ring-1 ring-emerald-400/50' : 'border-slate-800'
                    }`}
                    title={`Click to pulse ${n.label}: ${n.frequencyHz} Hz, Vm: ${n.vMem}mV`}
                  >
                    <span className="text-[10px] font-mono font-bold text-emerald-400">E{n.id}</span>
                    <div className="w-full h-16 bg-slate-900 rounded relative flex items-end justify-center my-1 overflow-hidden">
                      <div
                        className="w-full bg-gradient-to-t from-emerald-600 to-emerald-400 transition-all duration-300 rounded-t"
                        style={{ height: `${heightPct}%` }}
                      />
                      <span className="absolute top-1 text-[9px] font-mono text-slate-300 font-semibold drop-shadow">
                        {n.frequencyHz.toFixed(0)}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-slate-500">{n.vMem}mV</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Cortical Association Interneurons (Sky) */}
          <div className="bg-[#070c18] border border-sky-950/60 rounded-lg p-2.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                <span className="font-semibold text-sky-300 text-xs">
                  {groups.cortical.title} ({groups.cortical.code})
                </span>
                <span className="text-[10px] font-mono text-sky-400/80 bg-sky-500/10 px-1.5 py-0.2 rounded border border-sky-500/20">
                  Mean: {groups.cortical.meanHz} Hz | Fano Factor: {groups.cortical.fanoFactor}
                </span>
              </div>
              <div className="text-[10px] font-mono text-slate-400 flex items-center gap-2">
                <span>Active: {(groups.cortical.activeFraction * 100).toFixed(0)}%</span>
                <span className="text-slate-600">•</span>
                <span>Power: ~{groups.cortical.powerDissipationMw.toFixed(2)} mW</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {corticalNeurons.map((n) => {
                const heightPct = Math.min(100, Math.max(4, (n.frequencyHz / maxScaleHz) * 100));
                const isSelected = selectedNeuronId === n.id;
                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      setSelectedNeuronId(n.id);
                      onInjectManualPulse?.(n.id);
                    }}
                    className={`flex flex-col items-center bg-slate-950/70 border rounded-lg p-1.5 cursor-pointer transition-all hover:border-sky-400/70 ${
                      isSelected ? 'border-sky-400 ring-1 ring-sky-400/50' : 'border-slate-800'
                    }`}
                    title={`Click to pulse ${n.label}: ${n.frequencyHz} Hz, Vm: ${n.vMem}mV`}
                  >
                    <span className="text-[10px] font-mono font-bold text-sky-400">N{n.id}</span>
                    <div className="w-full h-16 bg-slate-900 rounded relative flex items-end justify-center my-1 overflow-hidden">
                      <div
                        className="w-full bg-gradient-to-t from-sky-600 to-sky-400 transition-all duration-300 rounded-t"
                        style={{ height: `${heightPct}%` }}
                      />
                      <span className="absolute top-1 text-[9px] font-mono text-slate-300 font-semibold drop-shadow">
                        {n.frequencyHz.toFixed(0)}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-slate-500">{n.vMem}mV</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Efferent Decoders (Amber) */}
          <div className="bg-[#070c18] border border-amber-950/60 rounded-lg p-2.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span className="font-semibold text-amber-300 text-xs">
                  {groups.efferent.title} ({groups.efferent.code})
                </span>
                <span className="text-[10px] font-mono text-amber-400/80 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                  Mean: {groups.efferent.meanHz} Hz | Peak: {groups.efferent.peakHz} Hz
                </span>
              </div>
              <div className="text-[10px] font-mono text-slate-400 flex items-center gap-2">
                <span>Active: {(groups.efferent.activeFraction * 100).toFixed(0)}%</span>
                <span className="text-slate-600">•</span>
                <span>Power: ~{groups.efferent.powerDissipationMw.toFixed(2)} mW</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {efferentNeurons.map((n) => {
                const heightPct = Math.min(100, Math.max(4, (n.frequencyHz / maxScaleHz) * 100));
                const isSelected = selectedNeuronId === n.id;
                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      setSelectedNeuronId(n.id);
                      onInjectManualPulse?.(n.id);
                    }}
                    className={`flex flex-col items-center bg-slate-950/70 border rounded-lg p-2 cursor-pointer transition-all hover:border-amber-400/70 ${
                      isSelected ? 'border-amber-400 ring-1 ring-amber-400/50' : 'border-slate-800'
                    }`}
                    title={`Click to pulse ${n.label}: ${n.frequencyHz} Hz, Vm: ${n.vMem}mV`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[10px] font-mono font-bold text-amber-400">O{n.id}</span>
                      <span className="text-[9px] font-sans text-slate-400 truncate max-w-[120px]">
                        {n.label.replace(/^O\d+:\s*/, '')}
                      </span>
                    </div>
                    <div className="w-full h-12 bg-slate-900 rounded relative flex items-end justify-center my-1 overflow-hidden">
                      <div
                        className="w-full bg-gradient-to-t from-amber-600 to-amber-400 transition-all duration-300 rounded-t"
                        style={{ height: `${heightPct}%` }}
                      />
                      <span className="absolute top-1 text-[9px] font-mono text-slate-300 font-semibold drop-shadow">
                        {n.frequencyHz.toFixed(1)} Hz
                      </span>
                    </div>
                    <div className="flex justify-between w-full text-[9px] font-mono text-slate-500">
                      <span>{n.vMem}mV</span>
                      <span>{n.spikeCount} spikes</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Distribution Bins View */}
      {viewMode === 'distribution_bins' && (
        <div className="bg-[#070c18] border border-slate-800/80 rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800/60 pb-2">
            <span>Frequency Range Bins</span>
            <div className="flex items-center gap-3 font-mono text-[10px]">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded bg-emerald-400" /> Afferent
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded bg-sky-400" /> Cortical
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded bg-amber-400" /> Efferent
              </span>
            </div>
          </div>

          <div className="space-y-2.5">
            {binData.map((bin, i) => {
              const affWidthPct = (bin.afferent / (maxBinCount || 1)) * 100;
              const cortWidthPct = (bin.cortical / (maxBinCount || 1)) * 100;
              const effWidthPct = (bin.efferent / (maxBinCount || 1)) * 100;

              return (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-slate-300 font-semibold">{bin.label}</span>
                    <span className="text-slate-400">
                      {bin.total} neuron{bin.total !== 1 ? 's' : ''} (
                      <span className="text-emerald-400">{bin.afferent}E</span>,{' '}
                      <span className="text-sky-400">{bin.cortical}N</span>,{' '}
                      <span className="text-amber-400">{bin.efferent}O</span>)
                    </span>
                  </div>

                  <div className="w-full h-3 bg-slate-950 rounded-full flex overflow-hidden border border-slate-800">
                    <div
                      className="bg-emerald-500 transition-all duration-300"
                      style={{ width: `${affWidthPct}%` }}
                      title={`Afferent: ${bin.afferent}`}
                    />
                    <div
                      className="bg-sky-500 transition-all duration-300"
                      style={{ width: `${cortWidthPct}%` }}
                      title={`Cortical: ${bin.cortical}`}
                    />
                    <div
                      className="bg-amber-500 transition-all duration-300"
                      style={{ width: `${effWidthPct}%` }}
                      title={`Efferent: ${bin.efferent}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer Info on Anti-Divergence Invariant */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[10px] text-slate-400">
        <span className="flex items-center gap-1 text-slate-300">
          <Info className="w-3 h-3 text-sky-400" />
          <span>Biological Cortical Target: 15–40 Hz Nominal | Fano factor $\approx$ 1.0 (Poisson balance)</span>
        </span>
        <span className="font-mono text-emerald-400">
          Click any neuron bar to inject an immediate action-potential test spike.
        </span>
      </div>
    </div>
  );
};
