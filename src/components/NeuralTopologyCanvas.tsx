import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  LIFNeuron,
  Synapse,
  SpatialActivityGrid,
  HeatmapLayerType,
  HeatmapDecayMode,
  HeatmapPalette,
  NeuralStimulusChannel,
  SynapticDriftGuardSnapshot,
  PathwayLeakHeatmapSnapshot,
  NodeIsolationSummary,
} from '../types';
import { SNNEngine, StimulusMode } from '../lib/snnEngine';
import {
  Play,
  Pause,
  RotateCcw,
  Zap,
  Activity,
  Layers,
  Sparkles,
  Flame,
  Trash2,
  Sliders,
  Cpu,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Crosshair,
  Wrench,
  ArrowUpRight,
  ArrowDownLeft,
  X,
} from 'lucide-react';
import { HeatMapOverlay } from './HeatMapOverlay';

interface NeuralTopologyCanvasProps {
  neurons: LIFNeuron[];
  synapses: Synapse[];
  engine?: SNNEngine | null;
  driftSnapshot?: SynapticDriftGuardSnapshot | null;
  isPaused: boolean;
  onTogglePause: () => void;
  onResetNetwork: () => void;
  spatialGrid?: SpatialActivityGrid;
  onClearSpatialDensity?: () => void;
  onSetHeatmapDecayMode?: (mode: HeatmapDecayMode) => void;
  currentDecayMode?: HeatmapDecayMode;
  stimulusChannels: NeuralStimulusChannel[];
  stimulusMode: StimulusMode;
  onSetStimulusMode: (mode: StimulusMode) => void;
  onToggleChannel: (id: number) => void;
  onInjectManualPulse: (neuronId: number) => void;
}

interface PooledParticle {
  active: boolean;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  progress: number;
  speed: number;
  color: string;
}

export const NeuralTopologyCanvas: React.FC<NeuralTopologyCanvasProps> = ({
  neurons,
  synapses,
  engine,
  driftSnapshot,
  isPaused,
  onTogglePause,
  onResetNetwork,
  spatialGrid,
  onClearSpatialDensity,
  onSetHeatmapDecayMode,
  currentDecayMode = 'dynamic',
  stimulusChannels,
  stimulusMode,
  onSetStimulusMode,
  onToggleChannel,
  onInjectManualPulse,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pre-allocated Particle Pool for zero GC overhead at 60 FPS
  const PARTICLE_POOL_SIZE = 120;
  const particlePoolRef = useRef<PooledParticle[]>(
    Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
      active: false,
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0,
      progress: 0,
      speed: 0.04,
      color: '#38bdf8',
    }))
  );

  const lastSpikeTimesRef = useRef<number[]>(new Array(20).fill(-999));

  // Mutable refs to access latest state inside continuous 60fps loop without tearing down animationFrame
  const neuronsRef = useRef(neurons);
  neuronsRef.current = neurons;

  const synapsesRef = useRef(synapses);
  synapsesRef.current = synapses;

  const engineRef = useRef(engine);
  engineRef.current = engine;

  const spatialGridRef = useRef(spatialGrid);
  spatialGridRef.current = spatialGrid;

  // Heatmap configuration states
  const [showHeatmap, setShowHeatmap] = useState<boolean>(false);
  const [heatmapLayer, setHeatmapLayer] = useState<HeatmapLayerType>('all');
  const [heatmapPalette, setHeatmapPalette] = useState<HeatmapPalette>('cyber');
  const [heatmapOpacity, setHeatmapOpacity] = useState<number>(0.65);
  const [showSynapticWeights, setShowSynapticWeights] = useState<boolean>(true);
  const [showSynapticHeatMap, setShowSynapticHeatMap] = useState<boolean>(true);
  const [showPathwayLeakHeatmap, setShowPathwayLeakHeatmap] = useState<boolean>(true);
  const [selectedNeuronId, setSelectedNeuronId] = useState<number | null>(null);
  const [quickPatchFeedback, setQuickPatchFeedback] = useState<string | null>(null);
  const [leakRefreshTick, setLeakRefreshTick] = useState<number>(0);

  // Automated SNN Spike Synchronization State & Telemetry
  const [syncState, setSyncState] = useState({
    hz: 0,
    sequence: 0,
    jitterMs: 0,
    syncedSpikes: 0,
    status: 'locked' as 'locked' | 'active' | 'quiescent',
    autoLock: true,
  });
  const syncStateRef = useRef(syncState);
  syncStateRef.current = syncState;

  // Offscreen canvas and pixel buffer for zero visual stutter rendering
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const offscreenImageDataRef = useRef<ImageData | null>(null);

  // Synchronized spike wavefront ripples radiating at the exact instant of spikes
  const spikeRipplesRef = useRef<Array<{ x: number; y: number; progress: number; color: string }>>([]);

  const showHeatmapRef = useRef(showHeatmap);
  showHeatmapRef.current = showHeatmap;
  const heatmapLayerRef = useRef(heatmapLayer);
  heatmapLayerRef.current = heatmapLayer;
  const heatmapPaletteRef = useRef(heatmapPalette);
  heatmapPaletteRef.current = heatmapPalette;
  const heatmapOpacityRef = useRef(heatmapOpacity);
  heatmapOpacityRef.current = heatmapOpacity;
  const showSynapticWeightsRef = useRef(showSynapticWeights);
  showSynapticWeightsRef.current = showSynapticWeights;
  const showPathwayLeakHeatmapRef = useRef(showPathwayLeakHeatmap);
  showPathwayLeakHeatmapRef.current = showPathwayLeakHeatmap;
  const selectedNeuronIdRef = useRef(selectedNeuronId);
  selectedNeuronIdRef.current = selectedNeuronId;

  const canvasWidth = 700;
  const canvasHeight = 440;

  // Neuron physical coordinates on canvas
  const neuronPositions = useMemo(() => {
    const map = new Map<number, { x: number; y: number }>();
    // Afferent Input Layer (0..7)
    for (let i = 0; i < 8; i++) {
      map.set(i, { x: 95, y: 46 + i * 48 });
    }
    // Association Interneurons (8..15)
    for (let i = 8; i < 16; i++) {
      map.set(i, { x: 350, y: 46 + (i - 8) * 48 });
    }
    // Output Projection Neurons (16..19)
    for (let i = 16; i < 20; i++) {
      map.set(i, { x: 605, y: 95 + (i - 16) * 75 });
    }
    return map;
  }, []);

  // Automated synchronization mechanism: subscribe to exact SNN spike events
  useEffect(() => {
    if (!engine) return;
    const unsubscribe = engine.subscribeSpikeSync((spikes, syncedGrid, meta) => {
      if (!spatialGrid) {
        spatialGridRef.current = syncedGrid;
      }
      const nextSync = {
        hz: meta.instantaneousHz,
        sequence: meta.syncSequence,
        jitterMs: syncedGrid.instantaneousJitterMs,
        syncedSpikes: syncedGrid.syncedSpikeCount,
        status: syncedGrid.syncStatus,
        autoLock: true,
      };
      syncStateRef.current = nextSync;

      // Update state for UI badges on periodic sync frames
      if (meta.syncSequence % 6 === 0) {
        setSyncState(nextSync);
      }

      // Spawn wavefront ripple pulses at exact coordinates of spike events
      if (spikes && spikes.length > 0) {
        const ripples = spikeRipplesRef.current;
        for (const sp of spikes) {
          const pos = neuronPositions.get(sp.neuronId);
          if (pos && ripples.length < 36) {
            ripples.push({
              x: pos.x,
              y: pos.y,
              progress: 0,
              color: sp.neuronId < 8 ? '#38bdf8' : sp.neuronId < 16 ? '#c084fc' : '#34d399',
            });
          }
        }
      }
    });
    return unsubscribe;
  }, [engine, neuronPositions]);

  // Main continuous 60 FPS animation render loop with zero-allocation particle pooling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const pool = particlePoolRef.current;

    const spawnParticlesForNeuron = (neuronId: number, currentSynapses: Synapse[]) => {
      const posFrom = neuronPositions.get(neuronId);
      if (!posFrom) return;

      const outgoing = currentSynapses.filter((s) => s.preId === neuronId);
      const sampled = outgoing.slice(0, 3);

      for (const syn of sampled) {
        const posTo = neuronPositions.get(syn.postId);
        if (!posTo) continue;

        // Find an inactive slot in pre-allocated pool
        for (let i = 0; i < pool.length; i++) {
          if (!pool[i].active) {
            const p = pool[i];
            p.active = true;
            p.startX = posFrom.x;
            p.startY = posFrom.y;
            p.endX = posTo.x;
            p.endY = posTo.y;
            p.progress = 0;
            p.speed = 0.035 + (i % 5) * 0.005;
            p.color = syn.weight >= 0 ? '#38bdf8' : '#f43f5e';
            break;
          }
        }
      }
    };

    const render = () => {
      // 0. Check for new action-potential spikes to spawn particles
      const activeNeurons = engineRef.current ? engineRef.current.neurons : neuronsRef.current;
      const activeSynapses = engineRef.current ? engineRef.current.synapses : synapsesRef.current;

      for (let i = 0; i < activeNeurons.length; i++) {
        const n = activeNeurons[i];
        if (n.lastSpikeTime > lastSpikeTimesRef.current[n.id]) {
          lastSpikeTimesRef.current[n.id] = n.lastSpikeTime;
          spawnParticlesForNeuron(n.id, activeSynapses);
        }
      }

      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // 1. Silicon Die Background Grid
      ctx.fillStyle = '#060a12';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Subtle circuit grid lines
      ctx.strokeStyle = '#0e1828';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvasWidth; x += 35) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
      }
      for (let y = 0; y < canvasHeight; y += 35) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
      }

      // Column layer region backdrops
      ctx.fillStyle = 'rgba(14, 165, 233, 0.03)';
      ctx.fillRect(30, 20, 130, canvasHeight - 40);
      ctx.fillStyle = 'rgba(168, 85, 247, 0.03)';
      ctx.fillRect(285, 20, 130, canvasHeight - 40);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.03)';
      ctx.fillRect(540, 40, 130, canvasHeight - 80);

      // 2. Render Heatmap with Zero Visual Stutter using Offscreen Canvas & Bilinear Filtering
      const curShowHeatmap = showHeatmapRef.current;
      const curSpatialGrid = spatialGridRef.current || (engineRef.current ? engineRef.current.getSpatialGrid() : undefined);
      if (curShowHeatmap && curSpatialGrid) {
        const cols = curSpatialGrid.cols;
        const rows = curSpatialGrid.rows;

        // Initialize or resize offscreen canvas if needed
        if (!offscreenCanvasRef.current) {
          const osc = document.createElement('canvas');
          osc.width = cols;
          osc.height = rows;
          offscreenCanvasRef.current = osc;
          offscreenCtxRef.current = osc.getContext('2d');
          if (offscreenCtxRef.current) {
            offscreenImageDataRef.current = offscreenCtxRef.current.createImageData(cols, rows);
          }
        }

        const osc = offscreenCanvasRef.current;
        const osCtx = offscreenCtxRef.current;
        const imgData = offscreenImageDataRef.current;

        if (osc && osCtx && imgData) {
          const data = imgData.data;
          const curLayer = heatmapLayerRef.current;
          const densityArr =
            curLayer === 'sensory'
              ? curSpatialGrid.sensoryDensity
              : curLayer === 'reflex'
              ? curSpatialGrid.reflexDensity
              : curSpatialGrid.allDensity;
          const maxD = Math.max(
            0.15,
            curLayer === 'sensory'
              ? curSpatialGrid.maxSensoryDensity
              : curLayer === 'reflex'
              ? curSpatialGrid.maxReflexDensity
              : curSpatialGrid.maxAllDensity
          );
          const curPalette = heatmapPaletteRef.current;
          const totalPix = cols * rows;

          for (let i = 0; i < totalPix; i++) {
            const val = densityArr[i];
            const off = i * 4;
            if (val > 0.04) {
              const norm = Math.min(1.0, val / maxD);
              const alpha = Math.floor(Math.pow(norm, 0.75) * 230);
              if (curPalette === 'cyber') {
                data[off] = Math.floor(norm * 56);
                data[off + 1] = Math.floor(norm * 189);
                data[off + 2] = 255;
                data[off + 3] = alpha;
              } else if (curPalette === 'plasma') {
                data[off] = Math.floor(norm * 244);
                data[off + 1] = Math.floor(norm * 63);
                data[off + 2] = 180;
                data[off + 3] = alpha;
              } else {
                data[off] = Math.floor(norm * 52);
                data[off + 1] = 211;
                data[off + 2] = Math.floor(norm * 153);
                data[off + 3] = alpha;
              }
            } else {
              data[off] = 0;
              data[off + 1] = 0;
              data[off + 2] = 0;
              data[off + 3] = 0;
            }
          }

          osCtx.putImageData(imgData, 0, 0);

          ctx.save();
          ctx.globalAlpha = heatmapOpacityRef.current;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(osc, 0, 0, canvasWidth, canvasHeight);
          ctx.restore();
        }

        // Render synchronous spike wavefront ripple pulses across the heatmap
        const ripples = spikeRipplesRef.current;
        for (let i = ripples.length - 1; i >= 0; i--) {
          const rip = ripples[i];
          rip.progress += 0.045;
          if (rip.progress >= 1.0) {
            ripples.splice(i, 1);
            continue;
          }
          ctx.save();
          ctx.beginPath();
          ctx.arc(rip.x, rip.y, 10 + rip.progress * 35, 0, Math.PI * 2);
          ctx.strokeStyle = rip.color;
          ctx.globalAlpha = (1.0 - rip.progress) * 0.45;
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.restore();
        }
      }

      // 3. Render Synaptic Pathway Connections & Multi-Tier Pathway Leak Heatmap Overlay
      const curShowSynapses = showSynapticWeightsRef.current;
      const curShowLeakMap = showPathwayLeakHeatmapRef.current;
      const curSelectedNeuron = selectedNeuronIdRef.current;
      const leakSnapshot =
        curShowLeakMap && engineRef.current
          ? engineRef.current.getPathwayLeakHeatmapSnapshot()
          : null;
      const pulsePhase = (Math.sin(performance.now() * 0.008) + 1) * 0.5; // 0..1 pulsing factor for critical red leaks

      if (curShowSynapses || curShowLeakMap) {
        for (let i = 0; i < activeSynapses.length; i++) {
          const syn = activeSynapses[i];
          const from = neuronPositions.get(syn.preId);
          const to = neuronPositions.get(syn.postId);
          if (!from || !to) continue;

          const isExcitatory = syn.weight >= 0;
          const absW = Math.abs(syn.weight);
          const mag = Math.min(1.0, absW / 1.5);
          const isUpstreamToSelected = curSelectedNeuron !== null && syn.postId === curSelectedNeuron;
          const isDownstreamFromSelected = curSelectedNeuron !== null && syn.preId === curSelectedNeuron;
          const isConnectedToSelected = isUpstreamToSelected || isDownstreamFromSelected;
          const isDimmedByIsolation = curSelectedNeuron !== null && !isConnectedToSelected;

          const leakInfo = leakSnapshot?.synapseLeaks[syn.id];
          const leakSeverity = leakInfo?.severity || 'nominal';

          // Skip exact zero nominal synapses unless isolated or showing all weights
          if (absW < 0.001 && leakSeverity === 'nominal' && !isConnectedToSelected) {
            continue;
          }

          ctx.beginPath();
          const midX = (from.x + to.x) / 2;
          const midY = (from.y + to.y) / 2 + (syn.preId % 2 === 0 ? -12 : 12);
          ctx.moveTo(from.x, from.y);
          ctx.quadraticCurveTo(midX, midY, to.x, to.y);

          if (isDimmedByIsolation) {
            // Isolation Drill-Down active: dim non-connected background pathways
            ctx.lineWidth = 0.6;
            ctx.strokeStyle = 'rgba(51, 65, 85, 0.10)';
            ctx.stroke();
          } else if (curShowLeakMap) {
            // Multi-tier gradient overlay from Cyan (nominal) -> Amber (moderate) -> Pulsing Red (critical)
            const grad = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
            if (leakSeverity === 'critical') {
              const critAlpha = isConnectedToSelected ? 0.98 : 0.72 + pulsePhase * 0.28;
              grad.addColorStop(0, `rgba(245, 158, 11, ${critAlpha})`);
              grad.addColorStop(0.5, `rgba(239, 68, 68, ${critAlpha})`);
              grad.addColorStop(1, `rgba(244, 63, 94, ${critAlpha})`);
              ctx.lineWidth = isConnectedToSelected ? 3.4 : 2.2 + pulsePhase * 1.0;
              ctx.shadowColor = '#ef4444';
              ctx.shadowBlur = 6 + pulsePhase * 6;
            } else if (leakSeverity === 'moderate') {
              const modAlpha = isConnectedToSelected ? 0.92 : 0.65;
              grad.addColorStop(0, `rgba(6, 182, 212, ${modAlpha})`);
              grad.addColorStop(0.5, `rgba(245, 158, 11, ${modAlpha})`);
              grad.addColorStop(1, `rgba(251, 191, 36, ${modAlpha})`);
              ctx.lineWidth = isConnectedToSelected ? 2.8 : 1.7;
              ctx.shadowColor = '#f59e0b';
              ctx.shadowBlur = 4;
            } else {
              // Nominal pathway: clean cyan gradient
              const nomAlpha = isConnectedToSelected
                ? 0.90
                : Math.max(0.18, 0.15 + mag * 0.42);
              grad.addColorStop(0, `rgba(6, 182, 212, ${nomAlpha})`);
              grad.addColorStop(1, isExcitatory ? `rgba(56, 189, 248, ${nomAlpha})` : `rgba(168, 85, 247, ${nomAlpha})`);
              ctx.lineWidth = isConnectedToSelected ? 2.4 : Math.max(0.8, mag * 2.0);
              ctx.shadowBlur = 0;
            }
            ctx.strokeStyle = grad;
            ctx.stroke();
            ctx.shadowBlur = 0;
          } else {
            ctx.lineWidth = isConnectedToSelected ? 2.5 : Math.max(0.6, mag * 2.0);
            ctx.strokeStyle = isConnectedToSelected
              ? isExcitatory
                ? 'rgba(56, 189, 248, 0.85)'
                : 'rgba(244, 63, 94, 0.85)'
              : isExcitatory
              ? `rgba(56, 189, 248, ${0.12 + mag * 0.35})`
              : `rgba(244, 63, 94, ${0.12 + mag * 0.35})`;
            ctx.stroke();
          }

          // When Isolation Drill-Down is active on a node, render weight badge on connected leaking/active pathways
          if (isConnectedToSelected && (absW > 0.01 || leakSeverity !== 'nominal')) {
            ctx.save();
            ctx.font = 'bold 8px monospace';
            ctx.fillStyle =
              leakSeverity === 'critical'
                ? '#fca5a5'
                : leakSeverity === 'moderate'
                ? '#fde68a'
                : isUpstreamToSelected
                ? '#7dd3fc'
                : '#c4b5fd';
            ctx.textAlign = 'center';
            ctx.fillText(
              `${syn.weight >= 0 ? '+' : ''}${syn.weight.toFixed(2)}`,
              midX,
              midY - 3
            );
            ctx.restore();
          }
        }
      }

      // 4. Update and Render Action Potential Pulses from Pre-allocated Pool
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (!p.active) continue;

        p.progress += p.speed;
        if (p.progress >= 1.0) {
          p.active = false;
          continue;
        }

        const curX = p.startX + (p.endX - p.startX) * p.progress;
        const curY = p.startY + (p.endY - p.startY) * p.progress;

        ctx.beginPath();
        ctx.arc(curX, curY, 3, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // 5. Render Neuron Nodes with Pathway Leak Severity Rings & Isolation Highlights
      for (let i = 0; i < activeNeurons.length; i++) {
        const n = activeNeurons[i];
        const pos = neuronPositions.get(n.id);
        if (!pos) continue;

        const isRefractory = n.refractoryRemaining > 0;
        const isSelected = curSelectedNeuron === n.id;
        const vNorm = Math.max(0, Math.min(1.0, (n.vMem - n.vRest) / (n.vThresh - n.vRest)));
        const nodeLeak = leakSnapshot?.nodeLeakSeverities[n.id];

        // Pathway Leak Severity Halo around leaking nodes
        if (curShowLeakMap && nodeLeak && nodeLeak.severity !== 'nominal') {
          ctx.save();
          ctx.beginPath();
          const haloRadius = nodeLeak.severity === 'critical' ? 21 + pulsePhase * 4 : 19;
          ctx.arc(pos.x, pos.y, haloRadius, 0, Math.PI * 2);
          ctx.strokeStyle =
            nodeLeak.severity === 'critical'
              ? `rgba(239, 68, 68, ${0.65 + pulsePhase * 0.35})`
              : 'rgba(245, 158, 11, 0.75)';
          ctx.lineWidth = nodeLeak.severity === 'critical' ? 2.2 : 1.6;
          ctx.stroke();
          ctx.restore();
        }

        // Spiking glow halo
        if (isRefractory) {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 22, 0, Math.PI * 2);
          ctx.fillStyle = n.layer === 'sensory' ? 'rgba(56, 189, 248, 0.35)' : n.layer === 'inter' ? 'rgba(168, 85, 247, 0.35)' : 'rgba(16, 185, 129, 0.35)';
          ctx.fill();
        }

        // Selection / Isolation Drill-Down ring
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 22, 0, Math.PI * 2);
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 2.2;
          ctx.setLineDash([4, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Outer membrane potential progress ring
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * vNorm);
        ctx.strokeStyle = isRefractory
          ? '#38bdf8'
          : vNorm > 0.7
          ? '#fbbf24'
          : n.layer === 'sensory'
          ? '#38bdf8'
          : n.layer === 'inter'
          ? '#c084fc'
          : '#34d399';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Node circle background
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = isSelected
          ? '#0e7490'
          : nodeLeak?.severity === 'critical'
          ? '#450a0a'
          : isRefractory
          ? '#0369a1'
          : '#0f172a';
        ctx.strokeStyle = isSelected
          ? '#22d3ee'
          : nodeLeak?.severity === 'critical'
          ? '#ef4444'
          : nodeLeak?.severity === 'moderate'
          ? '#f59e0b'
          : isRefractory
          ? '#38bdf8'
          : '#334155';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();

        // Neuron ID label inside circle
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const prefix = n.layer === 'sensory' ? 'E' : n.layer === 'inter' ? 'N' : 'O';
        ctx.fillText(`${prefix}${n.id}`, pos.x, pos.y);

        // Text label & live mV readout
        ctx.font = '10px sans-serif';
        ctx.textAlign = n.layer === 'sensory' ? 'right' : n.layer === 'motor' ? 'left' : 'center';
        const labelX = n.layer === 'sensory' ? pos.x - 20 : n.layer === 'motor' ? pos.x + 20 : pos.x;
        const labelY = n.layer === 'inter' ? pos.y - 18 : pos.y - 2;

        ctx.fillStyle = isSelected
          ? '#22d3ee'
          : nodeLeak?.severity === 'critical'
          ? '#fca5a5'
          : isRefractory
          ? '#38bdf8'
          : '#cbd5e1';
        const shortLabel = n.label.replace(/^([ENMO]\d+:\s*)/, '');
        ctx.fillText(shortLabel, labelX, labelY);

        ctx.font = '9px monospace';
        ctx.fillStyle = '#64748b';
        ctx.fillText(`${n.vMem.toFixed(1)}mV`, labelX, labelY + 12);
      }

      // 6. Layer Headers on top
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.fillText('Afferent Input Layer (E0-E7)', 95, 24);

      ctx.fillStyle = '#c084fc';
      ctx.fillText('Association Interneurons (N8-N15)', 350, 24);

      ctx.fillStyle = '#34d399';
      ctx.fillText('Efferent Decoders (O16-O19)', 605, 36);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [neuronPositions]);

  // Handle clicking on canvas to select / stimulate neuron
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvasWidth / rect.width;
    const scaleY = canvasHeight / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    // Check if clicked near any neuron
    let clickedId: number | null = null;
    neuronPositions.forEach((pos, id) => {
      const dx = pos.x - clickX;
      const dy = pos.y - clickY;
      if (Math.sqrt(dx * dx + dy * dy) <= 18) {
        clickedId = id;
      }
    });

    if (clickedId !== null) {
      setSelectedNeuronId(clickedId);
      onInjectManualPulse(clickedId);
    } else {
      setSelectedNeuronId(null);
    }
  };

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-xl gap-3">
      {/* Canvas Header & Top Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-950 border border-sky-800 text-sky-400">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
              <span>Neuromorphic Silicon Topology & Spiking Dynamics</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                20 LIF Nodes / 96 Synapses
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Event-driven biological signal propagation, membrane potential integration (V_mem), and live STDP weight scaling across 3 cortical processing columns.
            </p>
          </div>
        </div>

        {/* Global Simulation Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onTogglePause}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow transition-all ${
              isPaused
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{isPaused ? 'Resume Simulation' : 'Pause'}</span>
          </button>

          <button
            onClick={onResetNetwork}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
            title="Reset membrane potentials to resting equilibrium"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Reset Potentials</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Container */}
      <div className="relative w-full rounded-lg overflow-hidden border border-slate-800 bg-[#060a12] shadow-inner">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          onClick={handleCanvasClick}
          className="w-full h-auto block cursor-crosshair"
          title="Click any neuron to inject an immediate action-potential spike"
        />

        {/* HeatMapOverlay Visualizing Real-Time Synaptic Density Clusters & Drift Guard Instability Zones */}
        <HeatMapOverlay
          neurons={neurons}
          synapses={synapses}
          neuronPositions={neuronPositions}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          visible={showSynapticHeatMap}
          onToggleVisible={() => setShowSynapticHeatMap(false)}
          driftSnapshot={driftSnapshot || engine?.lastDriftGuardSnapshot || engine?.getDriftGuardSnapshot()}
        />

        {/* Floating Quick Action Overlay */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-2 bg-slate-950/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 shadow-md">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Clockless Event Bus</span>
          </span>

          {showHeatmap && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-purple-950/80 border border-purple-500/40 text-purple-300 text-[10px]">
              <span className={`w-1.5 h-1.5 rounded-full ${syncState.status === 'active' ? 'bg-purple-400 animate-pulse' : 'bg-slate-500'}`} />
              <span>Spike Sync: {syncState.hz.toFixed(1)} Hz</span>
              <span className="text-purple-400/60 font-sans">|</span>
              <span className="text-emerald-400">0ms Jitter</span>
            </span>
          )}

          <span className="text-slate-600">|</span>
          <button
            onClick={() => setShowPathwayLeakHeatmap(!showPathwayLeakHeatmap)}
            className={`text-[10px] px-2 py-0.5 rounded transition cursor-pointer font-semibold ${
              showPathwayLeakHeatmap
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'text-slate-400'
            }`}
            title="Toggle Real-Time Pathway Leak Heatmap (Cyan -> Amber -> Pulsing Red)"
          >
            Pathway Leak Heatmap
          </button>
          <button
            onClick={() => setShowSynapticWeights(!showSynapticWeights)}
            className={`text-[10px] px-2 py-0.5 rounded transition cursor-pointer ${
              showSynapticWeights ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'text-slate-400'
            }`}
          >
            Synapses
          </button>
          <button
            onClick={() => setShowSynapticHeatMap(!showSynapticHeatMap)}
            className={`text-[10px] px-2 py-0.5 rounded transition cursor-pointer ${
              showSynapticHeatMap ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-400'
            }`}
            title="Toggle Synaptic Density Clusters HeatMapOverlay"
          >
            Synaptic HeatMap
          </button>
          <button
            onClick={() => setShowHeatmap(!showHeatmap)}
            className={`text-[10px] px-2 py-0.5 rounded transition cursor-pointer ${
              showHeatmap ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'text-slate-400'
            }`}
          >
            Substrate Activity
          </button>
        </div>

        {/* Bottom-left Multi-Tier Pathway Leak Legend Overlay on Canvas */}
        {showPathwayLeakHeatmap && (
          <div className="absolute bottom-2.5 left-2.5 flex flex-wrap items-center gap-3 bg-slate-950/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-300 shadow-md">
            <span className="font-bold text-slate-200 uppercase tracking-wider">Leak Heatmap:</span>
            <span className="flex items-center gap-1 text-cyan-300">
              <span className="w-2.5 h-1 rounded bg-cyan-400" />
              Nominal (Cyan)
            </span>
            <span className="flex items-center gap-1 text-amber-300">
              <span className="w-2.5 h-1 rounded bg-amber-400" />
              Moderate Leak (Amber)
            </span>
            <span className="flex items-center gap-1 text-rose-300">
              <span className="w-2.5 h-1 rounded bg-rose-500 animate-pulse" />
              Critical Bleed (Pulsing Red)
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-sky-300">Click any node for Isolation Drill-Down & Quick Patch</span>
          </div>
        )}
      </div>

      {/* Real-Time Pathway Leak Heatmap & Isolation Drill-Down Console */}
      {showPathwayLeakHeatmap && engine && (() => {
        const leakSnap: PathwayLeakHeatmapSnapshot = engine.getPathwayLeakHeatmapSnapshot();
        const isolatedSummary: NodeIsolationSummary | null =
          selectedNeuronId !== null ? engine.getNodeIsolationSummary(selectedNeuronId) : null;
        const leakingNodeIds = Object.entries(leakSnap.nodeLeakSeverities)
          .filter(([, info]) => info.severity !== 'nominal')
          .map(([idStr, info]) => ({ id: Number(idStr), ...info }));

        return (
          <div
            key={`leak-panel-${leakRefreshTick}-${selectedNeuronId ?? 'none'}`}
            className="bg-[#080d17] border border-slate-800 rounded-xl p-3.5 flex flex-col gap-3 font-mono text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2">
                {leakSnap.criticalLeakCount > 0 || leakSnap.moderateLeakCount > 0 ? (
                  <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                )}
                <span className="font-bold text-slate-100 uppercase tracking-wider">
                  Pathway Leak Heatmap & Node Isolation Drill-Down
                </span>
                <span className="text-slate-500">·</span>
                <span className="text-[11px] text-slate-300">
                  Nominal: <strong className="text-cyan-400">{leakSnap.nominalCount}</strong>
                  {' · '}
                  Moderate: <strong className="text-amber-400">{leakSnap.moderateLeakCount}</strong>
                  {' · '}
                  Critical: <strong className="text-rose-400">{leakSnap.criticalLeakCount}</strong>
                  {' · '}
                  Leak Power: <strong className="text-slate-200">{leakSnap.totalLeakPowerMw.toFixed(3)} mW</strong>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    const res = engine.injectSimulatedPathwayBleed(6);
                    setQuickPatchFeedback(res.summary);
                    setLeakRefreshTick((t) => t + 1);
                    // Automatically select the first leaking node to showcase Isolation Drill-Down
                    const updatedSnap = engine.getPathwayLeakHeatmapSnapshot();
                    const firstLeaky = Object.entries(updatedSnap.nodeLeakSeverities).find(
                      ([, v]) => v.severity !== 'nominal'
                    );
                    if (firstLeaky) {
                      setSelectedNeuronId(Number(firstLeaky[0]));
                    }
                  }}
                  className="px-2.5 py-1 rounded bg-rose-950/60 hover:bg-rose-900/70 border border-rose-700/60 text-rose-200 text-[11px] font-semibold transition cursor-pointer flex items-center gap-1.5"
                  title="Inject simulated cross-talk bleed to test the multi-tier heatmap and node isolation Quick Patch"
                >
                  <Zap className="w-3 h-3 text-rose-400" />
                  <span>Simulate Pathway Bleed</span>
                </button>

                {(leakSnap.criticalLeakCount > 0 || leakSnap.moderateLeakCount > 0) && (
                  <button
                    onClick={() => {
                      const res = engine.cleanupNeuralPathways();
                      setQuickPatchFeedback(res.summary);
                      setLeakRefreshTick((t) => t + 1);
                    }}
                    className="px-2.5 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900/70 border border-emerald-700/60 text-emerald-200 text-[11px] font-semibold transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Wrench className="w-3 h-3 text-emerald-400" />
                    <span>Scrub All Network Leaks</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quick Node Selector Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-400 flex items-center gap-1">
                  <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Isolate Node:</span>
                </span>
                {neurons.slice(0, 12).map((n) => {
                  const nLeak = leakSnap.nodeLeakSeverities[n.id];
                  const isSel = selectedNeuronId === n.id;
                  const prefix = n.layer === 'sensory' ? 'E' : n.layer === 'inter' ? 'N' : 'O';
                  return (
                    <button
                      key={n.id}
                      onClick={() => setSelectedNeuronId(isSel ? null : n.id)}
                      className={`px-2 py-0.5 rounded border text-[10px] font-bold transition cursor-pointer ${
                        isSel
                          ? 'bg-cyan-600 text-white border-cyan-400 shadow'
                          : nLeak?.severity === 'critical'
                          ? 'bg-rose-950/80 text-rose-300 border-rose-500 animate-pulse'
                          : nLeak?.severity === 'moderate'
                          ? 'bg-amber-950/80 text-amber-300 border-amber-500/70'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {prefix}{n.id}
                      {nLeak && nLeak.leakyConnections > 0 ? ` (${nLeak.leakyConnections})` : ''}
                    </button>
                  );
                })}
                {leakingNodeIds.length > 0 && (
                  <span className="text-rose-400 font-semibold ml-1">
                    {leakingNodeIds.length} leaking node(s) flagged
                  </span>
                )}
              </div>

              {selectedNeuronId !== null && (
                <button
                  onClick={() => setSelectedNeuronId(null)}
                  className="text-slate-400 hover:text-slate-200 flex items-center gap-1 text-[11px] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Exit Isolation</span>
                </button>
              )}
            </div>

            {quickPatchFeedback && (
              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-cyan-500/40 text-cyan-200 text-[11px] flex items-center justify-between gap-2">
                <span>{quickPatchFeedback}</span>
                <button
                  onClick={() => setQuickPatchFeedback(null)}
                  className="text-slate-400 hover:text-slate-200 text-[10px] cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Node Isolation Drill-Down Panel */}
            {isolatedSummary && (
              <div className="bg-slate-950 border border-cyan-500/40 rounded-lg p-3 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <span className="text-cyan-400">ISOLATION DRILL-DOWN:</span>
                      <span>{isolatedSummary.neuronLabel}</span>
                      <span className="text-slate-500">·</span>
                      <span
                        className={
                          isolatedSummary.maxSeverity === 'critical'
                            ? 'text-rose-400 uppercase'
                            : isolatedSummary.maxSeverity === 'moderate'
                            ? 'text-amber-400 uppercase'
                            : 'text-emerald-400 uppercase'
                        }
                      >
                        {isolatedSummary.maxSeverity} STATUS ({isolatedSummary.leakyConnectionsCount} leaky synapses)
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-sans">
                      Highlighting {isolatedSummary.upstreamSynapses.length} upstream afferent and{' '}
                      {isolatedSummary.downstreamSynapses.length} downstream efferent pathways connected to this node.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        const res = engine.quickPatchNodeLeaks(isolatedSummary.neuronId, 'leaky_only');
                        setQuickPatchFeedback(res.summary);
                        setLeakRefreshTick((t) => t + 1);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px] flex items-center gap-1.5 shadow transition cursor-pointer"
                      title="Zero out all bleeding/unconstrained pathways on this node while preserving nominal canonical weights"
                    >
                      <Wrench className="w-3.5 h-3.5" />
                      <span>Quick Patch (Zero Leaking Weights)</span>
                    </button>

                    <button
                      onClick={() => {
                        const res = engine.quickPatchNodeLeaks(isolatedSummary.neuronId, 'all_connected');
                        setQuickPatchFeedback(res.summary);
                        setLeakRefreshTick((t) => t + 1);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-700/60 text-rose-200 font-semibold text-[11px] flex items-center gap-1.5 transition cursor-pointer"
                      title="Zero out all upstream and downstream synaptic weights connected to this node"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Zero All Connected Synapses</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Upstream Incoming Synapses */}
                  <div className="bg-slate-900/70 border border-slate-800 rounded p-2.5 flex flex-col gap-1.5">
                    <div className="text-[11px] font-bold text-sky-300 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                        <span>Upstream Incoming Synapses ({isolatedSummary.upstreamSynapses.length})</span>
                      </span>
                      <span className="text-[10px] text-slate-400">Pre → Node {isolatedSummary.neuronId}</span>
                    </div>
                    <div className="max-h-32 overflow-y-auto flex flex-col gap-1 pr-1">
                      {isolatedSummary.upstreamSynapses.length === 0 ? (
                        <div className="text-[10px] text-slate-500 py-2">No upstream incoming synapses (Sensory Input Node)</div>
                      ) : (
                        isolatedSummary.upstreamSynapses.map((syn) => (
                          <div
                            key={syn.synapseId}
                            className={`flex items-center justify-between px-2 py-1 rounded text-[10px] border ${
                              syn.severity === 'critical'
                                ? 'bg-rose-950/40 border-rose-700/50 text-rose-200'
                                : syn.severity === 'moderate'
                                ? 'bg-amber-950/40 border-amber-700/50 text-amber-200'
                                : 'bg-slate-950/60 border-slate-800/80 text-slate-300'
                            }`}
                          >
                            <span className="truncate max-w-[160px]">{syn.preLabel}</span>
                            <div className="flex items-center gap-2 tabular-nums">
                              <span>w: <strong>{syn.weight.toFixed(3)}</strong></span>
                              {syn.leakMagnitude > 0 && (
                                <span className="text-rose-400">leak: {syn.leakMagnitude.toFixed(3)}</span>
                              )}
                              <span
                                className={
                                  syn.severity === 'critical'
                                    ? 'text-rose-400 font-bold uppercase'
                                    : syn.severity === 'moderate'
                                    ? 'text-amber-400 font-bold uppercase'
                                    : 'text-cyan-400 uppercase'
                                }
                              >
                                {syn.severity}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Downstream Outgoing Synapses */}
                  <div className="bg-slate-900/70 border border-slate-800 rounded p-2.5 flex flex-col gap-1.5">
                    <div className="text-[11px] font-bold text-purple-300 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>Downstream Outgoing Synapses ({isolatedSummary.downstreamSynapses.length})</span>
                      </span>
                      <span className="text-[10px] text-slate-400">Node {isolatedSummary.neuronId} → Post</span>
                    </div>
                    <div className="max-h-32 overflow-y-auto flex flex-col gap-1 pr-1">
                      {isolatedSummary.downstreamSynapses.length === 0 ? (
                        <div className="text-[10px] text-slate-500 py-2">No downstream outgoing synapses (Terminal Output Node)</div>
                      ) : (
                        isolatedSummary.downstreamSynapses.map((syn) => (
                          <div
                            key={syn.synapseId}
                            className={`flex items-center justify-between px-2 py-1 rounded text-[10px] border ${
                              syn.severity === 'critical'
                                ? 'bg-rose-950/40 border-rose-700/50 text-rose-200'
                                : syn.severity === 'moderate'
                                ? 'bg-amber-950/40 border-amber-700/50 text-amber-200'
                                : 'bg-slate-950/60 border-slate-800/80 text-slate-300'
                            }`}
                          >
                            <span className="truncate max-w-[160px]">{syn.postLabel}</span>
                            <div className="flex items-center gap-2 tabular-nums">
                              <span>w: <strong>{syn.weight.toFixed(3)}</strong></span>
                              {syn.leakMagnitude > 0 && (
                                <span className="text-rose-400">leak: {syn.leakMagnitude.toFixed(3)}</span>
                              )}
                              <span
                                className={
                                  syn.severity === 'critical'
                                    ? 'text-rose-400 font-bold uppercase'
                                    : syn.severity === 'moderate'
                                    ? 'text-amber-400 font-bold uppercase'
                                    : 'text-cyan-400 uppercase'
                                }
                              >
                                {syn.severity}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Interactive Stimulus Mode Bar */}
      <div className="bg-[#090e18] border border-slate-800/80 rounded-xl p-3 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <Radio className="w-3.5 h-3.5 text-sky-400" />
            <span className="font-semibold text-slate-200">Neural Input Stimulus Presets:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              onClick={() => onSetStimulusMode('harmonic')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                stimulusMode === 'harmonic'
                  ? 'bg-sky-600 text-white shadow'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Harmonic Resonance (Alpha/Beta)
            </button>
            <button
              onClick={() => onSetStimulusMode('poisson')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                stimulusMode === 'poisson'
                  ? 'bg-sky-600 text-white shadow'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Sparse Poisson Noise
            </button>
            <button
              onClick={() => onSetStimulusMode('burst')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                stimulusMode === 'burst'
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Gamma Burst Stress (65Hz)
            </button>
            <button
              onClick={() => onSetStimulusMode('orthogonal')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                stimulusMode === 'orthogonal'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Orthogonal Pattern Discrimination
            </button>
            <button
              onClick={() => onSetStimulusMode('quiescent')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                stimulusMode === 'quiescent'
                  ? 'bg-amber-600 text-white shadow'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Quiescent Baseline
            </button>
          </div>
        </div>

        {/* Channel Grid Stimulus Toggles (E0 through E7) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-1.5 pt-1">
          {stimulusChannels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => onToggleChannel(ch.id)}
              className={`p-2 rounded-lg border text-left transition-all ${
                ch.active
                  ? 'bg-sky-950/60 border-sky-800/80 text-sky-200'
                  : 'bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span>E{ch.id}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${ch.active ? 'bg-sky-400' : 'bg-slate-600'}`} />
              </div>
              <div className="text-[11px] font-bold mt-0.5 truncate">{ch.frequencyHz} Hz</div>
              <div className="text-[9px] text-slate-400 capitalize truncate">{ch.waveType}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Heatmap Layer Drawer if open */}
      {showHeatmap && (
        <div className="p-3 bg-purple-950/25 border border-purple-900/50 rounded-xl text-xs flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-900/40 pb-2">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-purple-400" />
              <span className="font-semibold text-purple-200">Silicon Substrate 2D Heatmap & SNN Synchronization</span>
            </div>

            {/* Live Automated Spike Synchronization Metrics */}
            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-900/50 border border-purple-500/40 text-purple-200 shadow-sm">
                <span className={`w-2 h-2 rounded-full ${syncState.status === 'active' ? 'bg-emerald-400 animate-ping' : 'bg-slate-400'}`} />
                <span>Phase-Locked Frequency:</span>
                <span className="text-emerald-400 font-bold">{syncState.hz.toFixed(1)} Hz</span>
              </span>

              <span className="px-2 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300">
                Jitter: <span className="text-sky-300">&lt; {syncState.jitterMs.toFixed(1)}ms</span>
              </span>

              <span className="px-2 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300">
                Synced Spikes: <span className="text-purple-300">{syncState.syncedSpikes}</span>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 text-[11px]">Layer:</span>
                <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[11px]">
                  {(['all', 'sensory', 'reflex'] as HeatmapLayerType[]).map((layer) => (
                    <button
                      key={layer}
                      onClick={() => setHeatmapLayer(layer)}
                      className={`px-2 py-0.5 rounded capitalize transition ${
                        heatmapLayer === layer ? 'bg-purple-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {layer}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 text-[11px]">Palette:</span>
                <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[11px]">
                  {(['cyber', 'plasma', 'electric'] as HeatmapPalette[]).map((pal) => (
                    <button
                      key={pal}
                      onClick={() => setHeatmapPalette(pal)}
                      className={`px-2 py-0.5 rounded capitalize transition ${
                        heatmapPalette === pal ? 'bg-purple-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {pal}
                    </button>
                  ))}
                </div>
              </div>

              {onSetHeatmapDecayMode && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 text-[11px]">Decay:</span>
                  <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[11px]">
                    <button
                      onClick={() => onSetHeatmapDecayMode('dynamic')}
                      className={`px-2 py-0.5 rounded transition ${
                        currentDecayMode === 'dynamic' ? 'bg-purple-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Continuous exponential decay based on elapsed simulation delta time"
                    >
                      Dynamic
                    </button>
                    <button
                      onClick={() => onSetHeatmapDecayMode('cumulative')}
                      className={`px-2 py-0.5 rounded transition ${
                        currentDecayMode === 'cumulative' ? 'bg-purple-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Cumulative integration across all spike events"
                    >
                      Cumulative
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px]">Opacity:</span>
                <input
                  type="range"
                  min="0.2"
                  max="1.0"
                  step="0.05"
                  value={heatmapOpacity}
                  onChange={(e) => setHeatmapOpacity(parseFloat(e.target.value))}
                  className="w-16 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
                <span className="text-slate-400 text-[10px] font-mono">{Math.round(heatmapOpacity * 100)}%</span>
              </div>
            </div>

            {onClearSpatialDensity && (
              <button
                onClick={onClearSpatialDensity}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700 transition"
              >
                <Trash2 className="w-3 h-3 text-rose-400" />
                <span>Clear Heatmap</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
