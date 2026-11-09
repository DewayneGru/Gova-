import React, { useState } from 'react';
import { AERPacket } from '../types';
import { Terminal, Radio, Pause, Play, Trash2, Cpu, ArrowDownUp } from 'lucide-react';

interface AERStreamInspectorProps {
  packets: AERPacket[];
  aerLatencyMs: number;
}

export const AERStreamInspector: React.FC<AERStreamInspectorProps> = ({
  packets,
  aerLatencyMs,
}) => {
  const [isStreamFrozen, setIsStreamFrozen] = useState(false);
  const [frozenPackets, setFrozenPackets] = useState<AERPacket[]>([]);
  const [filterLayer, setFilterLayer] = useState<'all' | 'sensory' | 'inter' | 'motor'>('all');

  const handleToggleFreeze = () => {
    if (!isStreamFrozen) {
      setFrozenPackets([...packets]);
    }
    setIsStreamFrozen(!isStreamFrozen);
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
        <div className="bg-[#0a0f1d] border border-slate-800 p-2 rounded">
          <div className="text-slate-500 text-[10px]">AER Bus Latency</div>
          <div className="text-emerald-400 font-bold">{aerLatencyMs.toFixed(2)} ms</div>
        </div>
        <div className="bg-[#0a0f1d] border border-slate-800 p-2 rounded">
          <div className="text-slate-500 text-[10px]">Bus Throughput</div>
          <div className="text-sky-400 font-bold">~{Math.max(12, packets.length * 16)} kEvents/s</div>
        </div>
        <div className="bg-[#0a0f1d] border border-slate-800 p-2 rounded">
          <div className="text-slate-500 text-[10px]">Transport Protocol</div>
          <div className="text-amber-400 font-bold">AER 4-Phase Bundled-Data</div>
        </div>
        <div className="bg-[#0a0f1d] border border-slate-800 p-2 rounded">
          <div className="text-slate-500 text-[10px]">Payload Format</div>
          <div className="text-slate-300 font-bold">16-bit Addr:Timestamp</div>
        </div>
      </div>

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

            return (
              <div
                key={pkt.id}
                className="flex items-center justify-between gap-2 px-2 py-0.5 rounded hover:bg-slate-900/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 w-16 text-[10px]">
                    +{pkt.timestamp}ms
                  </span>
                  <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                  <span className={`px-1.5 py-0.2 rounded text-[9px] uppercase tracking-wider ${layerBadge}`}>
                    {pkt.layer}
                  </span>
                  <span className="text-slate-200 font-medium">{pkt.neuronLabel}</span>
                </div>

                <div className="flex items-center gap-3 text-slate-400">
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
