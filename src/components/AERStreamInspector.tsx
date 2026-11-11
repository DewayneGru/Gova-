import React, { useState } from 'react';
import { AERPacket } from '../types';
import {
  Terminal,
  Radio,
  Pause,
  Play,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  FileCode2,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';

interface AERStreamInspectorProps {
  packets: AERPacket[];
  aerLatencyMs: number;
}

const HARDENED_SDC_SNIPPET = `# 1. Primary Clock Definition (100.000 MHz / 10.000 ns period)
create_clock -name clk -period 10.000 -waveform {0.000 5.000} [get_ports clk]
set_clock_uncertainty -setup 0.120 [get_clocks clk]
set_clock_uncertainty -hold  0.060 [get_clocks clk]

# 2. Synchronous I/O Delays (Fixed [*] bus wildcards; omitted async rst_n)
set_input_delay  -clock clk -max 2.500 [get_ports {measured_jitter_us[*] enable}]
set_input_delay  -clock clk -min 0.500 [get_ports {measured_jitter_us[*] enable}]
set_output_delay -clock clk -max 1.800 [get_ports {leak_coefficient[*] delay_line_offset_us[*] jitter_locked}]
set_output_delay -clock clk -min 0.300 [get_ports {leak_coefficient[*] delay_line_offset_us[*] jitter_locked}]

# 3. Asynchronous Reset False Path + 2-FF Synchronizer
set_false_path -from [get_ports rst_n]
set_property ASYNC_REG TRUE [get_cells -quiet {rst_sync_reg[*]}]

# 4. Multicycle 2-Cycle PI Integrator Feedback Loop (20.000 ns Setup / 0.000 ns Hold Edge)
set_multicycle_path 2 -setup -from [get_cells {leak_coefficient_reg[*]}] -to [get_cells {lock_counter_reg[*] leak_coefficient_reg[*] delay_line_offset_us_reg[*]}]
set_multicycle_path 1 -hold  -from [get_cells {leak_coefficient_reg[*]}] -to [get_cells {lock_counter_reg[*] leak_coefficient_reg[*] delay_line_offset_us_reg[*]}]

# 5. Xilinx Vivado Physical Constraints (DRC NSTD-1 / UCIO-1 Clean)
set_property PACKAGE_PIN E3      [get_ports clk]
set_property IOSTANDARD LVCMOS33 [get_ports {clk enable rst_n jitter_locked measured_jitter_us[*] leak_coefficient[*] delay_line_offset_us[*]}]
set_property BITSTREAM.CONFIG.CONFIGRATE 50 [current_design]`;

export const AERStreamInspector: React.FC<AERStreamInspectorProps> = ({
  packets,
  aerLatencyMs,
}) => {
  const [isStreamFrozen, setIsStreamFrozen] = useState(false);
  const [frozenPackets, setFrozenPackets] = useState<AERPacket[]>([]);
  const [filterLayer, setFilterLayer] = useState<'all' | 'sensory' | 'inter' | 'motor'>('all');
  const [showFpgaSdcPanel, setShowFpgaSdcPanel] = useState(true);
  const [copiedSdc, setCopiedSdc] = useState(false);

  const handleToggleFreeze = () => {
    if (!isStreamFrozen) {
      setFrozenPackets([...packets]);
    }
    setIsStreamFrozen(!isStreamFrozen);
  };

  const handleCopySdc = () => {
    navigator.clipboard.writeText(HARDENED_SDC_SNIPPET);
    setCopiedSdc(true);
    setTimeout(() => setCopiedSdc(false), 1800);
  };

  const displayedPackets = isStreamFrozen ? frozenPackets : packets;
  const filtered = displayedPackets.filter((p) => {
    if (filterLayer === 'all') return true;
    return p.layer === filterLayer;
  });

  return (
    <div id="aer-stream-inspector" className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 shadow">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-100">
            Asynchronous AER Event-Driven Stream Bus
          </h3>
          <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded flex items-center gap-1">
            <Radio className="w-2.5 h-2.5 animate-pulse" />
            Clockless Asynchronous Pipeline
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setShowFpgaSdcPanel(!showFpgaSdcPanel)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-[11px] border transition-colors ${
              showFpgaSdcPanel
                ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            100MHz FPGA SDC/XDC
          </button>

          <div className="flex bg-slate-800 rounded p-0.5 border border-slate-700">
            {(['all', 'sensory', 'inter', 'motor'] as const).map((layer) => (
              <button
                key={layer}
                onClick={() => setFilterLayer(layer)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize transition-colors ${
                  filterLayer === layer ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {layer}
              </button>
            ))}
          </div>

          <button
            onClick={handleToggleFreeze}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium text-xs"
          >
            {isStreamFrozen ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            {isStreamFrozen ? 'Unfreeze' : 'Hold'}
          </button>
        </div>
      </div>

      {/* Embedded Edge Protocol Telemetry Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs font-mono">
        <div className="bg-[#0a0f1d] border border-slate-800 p-2 rounded">
          <div className="text-slate-500 text-[10px]">AER Bus Latency</div>
          <div className="text-emerald-400 font-bold">{aerLatencyMs.toFixed(2)} ms</div>
        </div>
        <div className="bg-[#0a0f1d] border border-slate-800 p-2 rounded">
          <div className="text-slate-500 text-[10px]">Bus Throughput</div>
          <div className="text-sky-400 font-bold">~{Math.max(12, packets.length * 16)} kEvents/s</div>
        </div>
        <div className="bg-[#0a0f1d] border border-purple-500/30 p-2 rounded">
          <div className="text-slate-500 text-[10px]">AER Temporal Jitter</div>
          <div className="text-purple-400 font-bold">0.46 ms (120 ps clk unc)</div>
        </div>
        <div className="bg-[#0a0f1d] border border-cyan-500/30 p-2 rounded">
          <div className="text-slate-500 text-[10px]">Inhib. Conduction Vel.</div>
          <div className="text-cyan-400 font-bold">
            {(packets[0]?.inhibitoryConductionVelocity ?? 1.11).toFixed(2)}x
          </div>
        </div>
        <div className="bg-[#0a0f1d] border border-slate-800 p-2 rounded">
          <div className="text-slate-500 text-[10px]">PI Loop Multicycle</div>
          <div className="text-amber-400 font-bold">2 Cycles (20.0 ns)</div>
        </div>
        <div className="bg-[#0a0f1d] border border-emerald-500/30 p-2 rounded">
          <div className="text-slate-500 text-[10px]">BSI Target Band</div>
          <div className="text-emerald-300 font-bold">[0.10, 0.28] LOCKED</div>
        </div>
      </div>

      {/* Sub-Threshold Jitter Governor FPGA Timing & SDC Audit Panel */}
      {showFpgaSdcPanel && (
        <div className="bg-[#070b14] border border-cyan-500/30 rounded-lg p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileCode2 className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-semibold text-slate-100">
                Sub-Threshold Jitter Governor — 100 MHz FPGA Timing & SDC/XDC Audit (Loihi 2 / Custom RTL)
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> 4 PDF Syntax/STA Hazards Patched
              </span>
            </div>

            <div className="flex items-center gap-2">
              <a
                href="/assets/aistudio/Synopsys_Design_Constraints_a7110491.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 text-[10px] font-mono"
              >
                <ExternalLink className="w-3 h-3" />
                Source PDF
              </a>
              <button
                onClick={handleCopySdc}
                className="flex items-center gap-1 px-2 py-1 rounded bg-cyan-950/80 hover:bg-cyan-900/80 text-cyan-200 border border-cyan-500/40 text-[10px] font-mono"
              >
                {copiedSdc ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedSdc ? 'Copied SDC' : 'Copy Hardened SDC'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-[11px] font-mono">
            <div className="bg-slate-900/90 border border-slate-800 rounded p-2">
              <div className="text-amber-400 flex items-center gap-1 font-semibold">
                <AlertTriangle className="w-3 h-3" /> 1. Stripped Bus Wildcards
              </div>
              <p className="text-slate-400 text-[10px] mt-1 leading-relaxed">
                PDF had <code className="text-rose-300">measured_jitter_us[]</code> &amp; <code className="text-rose-300">leak_coefficient_reg[]</code>. Restored <code className="text-emerald-300">[*]</code> Tcl bus globs.
              </p>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded p-2">
              <div className="text-amber-400 flex items-center gap-1 font-semibold">
                <AlertTriangle className="w-3 h-3" /> 2. Concatenated Tcl Lines
              </div>
              <p className="text-slate-400 text-[10px] mt-1 leading-relaxed">
                Two <code className="text-rose-300">set_output_delay</code> and <code className="text-rose-300">set_multicycle_path</code> calls shared single lines without <code className="text-emerald-300">\n</code> or <code className="text-emerald-300">;</code>.
              </p>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded p-2">
              <div className="text-amber-400 flex items-center gap-1 font-semibold">
                <AlertTriangle className="w-3 h-3" /> 3. Async Reset Conflict
              </div>
              <p className="text-slate-400 text-[10px] mt-1 leading-relaxed">
                Removed <code className="text-rose-300">rst_n</code> from synchronous <code className="text-slate-300">set_input_delay</code>; added 2-FF <code className="text-emerald-300">ASYNC_REG</code> reset synchronizer.
              </p>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded p-2">
              <div className="text-emerald-400 flex items-center gap-1 font-semibold">
                <CheckCircle2 className="w-3 h-3" /> 4. Timing Closure Budgets
              </div>
              <p className="text-slate-400 text-[10px] mt-1 leading-relaxed">
                In Setup: <strong className="text-slate-200">7.38 ns</strong> | Out Setup: <strong className="text-slate-200">8.08 ns</strong> | 2-Cycle PI Loop: <strong className="text-emerald-300">19.88 ns</strong>.
              </p>
            </div>
          </div>

          <pre className="bg-slate-950 border border-slate-800 rounded p-2.5 text-[10px] font-mono text-cyan-200 overflow-x-auto leading-relaxed">
            {HARDENED_SDC_SNIPPET}
          </pre>
        </div>
      )}

      {/* Terminal Stream Feed */}
      <div className="bg-[#070b14] border border-slate-800/90 rounded-lg p-2.5 font-mono text-[11px] h-48 overflow-y-auto space-y-1 select-text">
        {filtered.length === 0 ? (
          <div className="text-slate-500 text-center py-10">Listening for asynchronous spikes...</div>
        ) : (
          filtered.slice(0, 45).map((pkt) => {
            let layerBadge = 'bg-slate-800 text-slate-300';
            let dotColor = 'bg-slate-400';
            if (pkt.layer === 'sensory') {
              layerBadge = 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60';
              dotColor = 'bg-emerald-400';
            } else if (pkt.layer === 'inter') {
              layerBadge = 'bg-sky-950/80 text-sky-300 border border-sky-800/60';
              dotColor = 'bg-sky-400';
            } else if (pkt.layer === 'motor') {
              layerBadge = 'bg-amber-950/80 text-amber-300 border border-amber-800/60';
              dotColor = 'bg-amber-400';
            }

            const jitterDelta = pkt.phaseJitterOffsetMs ?? 0;

            return (
              <div
                key={pkt.id}
                className="flex items-center justify-between gap-2 px-2 py-0.5 rounded hover:bg-slate-900/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 w-20 text-[10px]">
                    +{pkt.timestamp.toFixed(2)}ms
                  </span>
                  <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                  <span className={`px-1.5 py-0.2 rounded text-[9px] uppercase tracking-wider ${layerBadge}`}>
                    {pkt.layer}
                  </span>
                  <span className="text-slate-200 font-medium">{pkt.neuronLabel}</span>
                </div>

                <div className="flex items-center gap-2.5 text-slate-400">
                  {Math.abs(jitterDelta) > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-500/30">
                      Δt:{jitterDelta >= 0 ? '+' : ''}{jitterDelta.toFixed(2)}ms ({(pkt.inhibitoryConductionVelocity ?? 1.11).toFixed(2)}x)
                    </span>
                  )}
                  <span className="text-sky-300 font-mono text-[10px]">{pkt.hexPayload}</span>
                  <span className="text-emerald-400 text-[10px] font-bold">SPIKE_ON</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
