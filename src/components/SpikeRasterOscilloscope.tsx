import React, { useRef, useEffect } from 'react';
import { LIFNeuron } from '../types';
import { Activity, Zap } from 'lucide-react';

interface SpikeRasterOscilloscopeProps {
  neurons: LIFNeuron[];
  recentSpikes: Array<{ time: number; neuronId: number; layer: string }>;
  currentTime: number;
}

export const SpikeRasterOscilloscope: React.FC<SpikeRasterOscilloscopeProps> = ({
  neurons,
  recentSpikes,
  currentTime,
}) => {
  const rasterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const oscCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const voltageBufferRef = useRef<Array<{ time: number; vSensory: number; vInter: number; vMotor: number }>>([]);

  // Accumulate voltage buffer for oscilloscope
  useEffect(() => {
    const sNeuron = neurons[0]?.vMem ?? -70;
    const iNeuron = neurons[8]?.vMem ?? -70;
    const mNeuron = neurons[16]?.vMem ?? -70;

    voltageBufferRef.current.push({
      time: currentTime,
      vSensory: sNeuron,
      vInter: iNeuron,
      vMotor: mNeuron,
    });

    if (voltageBufferRef.current.length > 200) {
      voltageBufferRef.current.shift();
    }
  }, [currentTime, neurons]);

  // Render Raster Plot
  useEffect(() => {
    const canvas = rasterCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const timeWindow = 2500; // Show last 2.5 seconds

    ctx.fillStyle = '#0a0f1d';
    ctx.fillRect(0, 0, width, height);

    // Draw horizontal lane dividers
    const totalNeurons = neurons.length;
    const laneHeight = height / totalNeurons;

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= totalNeurons; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * laneHeight);
      ctx.lineTo(width, i * laneHeight);
      ctx.stroke();
    }

    // Layer grouping backgrounds
    // Sensory: 0..7 (emerald)
    ctx.fillStyle = 'rgba(16, 185, 129, 0.04)';
    ctx.fillRect(0, 0, width, 8 * laneHeight);
    // Interneuron: 8..15 (sky)
    ctx.fillStyle = 'rgba(56, 189, 248, 0.04)';
    ctx.fillRect(0, 8 * laneHeight, width, 8 * laneHeight);
    // Motor: 16..19 (amber)
    ctx.fillStyle = 'rgba(245, 158, 11, 0.04)';
    ctx.fillRect(0, 16 * laneHeight, width, 4 * laneHeight);

    // Plot spike ticks
    for (const spike of recentSpikes) {
      const dt = currentTime - spike.time;
      if (dt < 0 || dt > timeWindow) continue;

      const x = width - (dt / timeWindow) * width;
      const y = (spike.neuronId + 0.5) * laneHeight;

      let color = '#38bdf8';
      if (spike.neuronId < 8) color = '#10b981'; // Sensory
      else if (spike.neuronId >= 16) color = '#f59e0b'; // Motor

      ctx.fillStyle = color;
      ctx.fillRect(x - 1.5, y - laneHeight * 0.4, 3, laneHeight * 0.8);
    }

    // Current time scan line
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(width - 1, 0);
    ctx.lineTo(width - 1, height);
    ctx.stroke();
  }, [recentSpikes, currentTime, neurons]);

  // Render Membrane Potential Oscilloscope
  useEffect(() => {
    const canvas = oscCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#0a0f1d';
    ctx.fillRect(0, 0, width, height);

    // Voltage mapping: -80mV to +30mV (range 110mV)
    const minV = -85;
    const maxV = 10;
    const mapY = (v: number) => height - ((v - minV) / (maxV - minV)) * height;

    // Draw Threshold line (-55 mV)
    const threshY = mapY(-55);
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.45)';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, threshY);
    ctx.lineTo(width, threshY);
    ctx.stroke();

    // Draw Resting Potential line (-70 mV)
    const restY = mapY(-70);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.beginPath();
    ctx.moveTo(0, restY);
    ctx.lineTo(width, restY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Labels
    ctx.fillStyle = 'rgba(244, 63, 94, 0.7)';
    ctx.font = '9px monospace';
    ctx.fillText('Threshold (-55mV)', 6, threshY - 3);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.fillText('Rest (-70mV)', 6, restY - 3);

    const buf = voltageBufferRef.current;
    if (buf.length < 2) return;

    // Draw Sensory (Emerald) trace
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#10b981';
    ctx.beginPath();
    for (let i = 0; i < buf.length; i++) {
      const x = (i / (buf.length - 1)) * width;
      const y = mapY(buf[i].vSensory);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw Interneuron (Sky) trace
    ctx.strokeStyle = '#38bdf8';
    ctx.beginPath();
    for (let i = 0; i < buf.length; i++) {
      const x = (i / (buf.length - 1)) * width;
      const y = mapY(buf[i].vInter);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw Motor (Amber) trace
    ctx.strokeStyle = '#f59e0b';
    ctx.beginPath();
    for (let i = 0; i < buf.length; i++) {
      const x = (i / (buf.length - 1)) * width;
      const y = mapY(buf[i].vMotor);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [currentTime]);

  return (
    <div id="spiking-oscilloscope-container" className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* 1. Spiking Raster Plot */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col shadow">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
          <div className="flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              Real-Time Spiking Raster (20 LIF Neurons)
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-2 h-2 rounded-sm bg-emerald-500" /> S0-S7
            </span>
            <span className="flex items-center gap-1 text-sky-400">
              <span className="w-2 h-2 rounded-sm bg-sky-500" /> N8-N15
            </span>
            <span className="flex items-center gap-1 text-amber-400">
              <span className="w-2 h-2 rounded-sm bg-amber-500" /> O16-O19
            </span>
          </div>
        </div>

        <div className="relative w-full h-36 bg-[#0a0f1d] rounded border border-slate-800/80 overflow-hidden">
          <canvas ref={rasterCanvasRef} width={420} height={144} className="w-full h-full block" />
        </div>
      </div>

      {/* 2. Membrane Potential Oscilloscope */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col shadow">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
          <div className="flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              Membrane Potential Dynamics ($V_m$)
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="text-emerald-400">Afferent (E0)</span>
            <span className="text-sky-400">Interneuron (N8)</span>
            <span className="text-amber-400">Efferent Output (O16)</span>
          </div>
        </div>

        <div className="relative w-full h-36 bg-[#0a0f1d] rounded border border-slate-800/80 overflow-hidden">
          <canvas ref={oscCanvasRef} width={420} height={144} className="w-full h-full block" />
        </div>
      </div>
    </div>
  );
};
