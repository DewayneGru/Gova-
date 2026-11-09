import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Synapse, LIFNeuron, SynapticDriftGuardSnapshot } from '../types';
import {
  Layers,
  Flame,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Zap,
  Activity,
  Sliders,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react';

export type SynapticClusterLayer = 'all' | 'excitatory' | 'inhibitory' | 'net' | 'drift_instability';

export interface HeatMapOverlayProps {
  neurons: LIFNeuron[];
  synapses: Synapse[];
  neuronPositions: Map<number, { x: number; y: number }>;
  canvasWidth?: number;
  canvasHeight?: number;
  visible: boolean;
  onToggleVisible?: () => void;
  driftSnapshot?: SynapticDriftGuardSnapshot | null;
  className?: string;
}

interface ClusterCentroid {
  id: string;
  name: string;
  x: number;
  y: number;
  totalWeight: number;
  meanWeight: number;
  synapseCount: number;
  dominantType: 'excitatory' | 'inhibitory' | 'balanced';
  color: string;
  // Drift guard instability metrics
  isFlaggedByDriftGuard: boolean;
  driftVelocity: number;
  secondOrderDerivative: number;
  stabilizationState?: string;
  isExceedingThreshold?: boolean;
}

export const HeatMapOverlay: React.FC<HeatMapOverlayProps> = ({
  neurons: _neurons,
  synapses,
  neuronPositions,
  canvasWidth = 700,
  canvasHeight = 440,
  visible,
  onToggleVisible,
  driftSnapshot,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [layerMode, setLayerMode] = useState<SynapticClusterLayer>('all');
  const [opacity, setOpacity] = useState<number>(0.75);
  const [showCentroids, setShowCentroids] = useState<boolean>(true);
  const [weightThreshold, setWeightThreshold] = useState<number>(0.05);
  const [highlightInstabilityOnly, setHighlightInstabilityOnly] = useState<boolean>(false);

  // Extract drift guard metrics for cluster mapping
  const driftClusters = driftSnapshot?.clusters || {};

  // Compute cluster centroids, density metrics, and drift guard instability flags
  const clusterMetrics = useMemo(() => {
    const groups: Record<
      string,
      {
        id: string;
        name: string;
        color: string;
        clusterKey: string;
        synapses: Synapse[];
      }
    > = {
      sensory: {
        id: 'sensory',
        name: 'Sensory Afferent Feeder',
        color: '#06b6d4', // cyan-500
        clusterKey: 'sensory_afferent',
        synapses: synapses.filter((s) => s.preId <= 7 && s.postId >= 8 && s.postId <= 15),
      },
      associative: {
        id: 'associative',
        name: 'Associative Recurrent Core',
        color: '#f59e0b', // amber-500
        clusterKey: 'associative_core',
        synapses: synapses.filter(
          (s) => s.preId >= 8 && s.preId <= 15 && s.postId >= 8 && s.postId <= 15 && s.weight > 0
        ),
      },
      inhibitory: {
        id: 'inhibitory',
        name: 'Lateral GABA Inhibitory',
        color: '#ec4899', // pink-500
        clusterKey: 'inhibitory_feedback',
        synapses: synapses.filter((s) => s.weight < 0),
      },
      motor: {
        id: 'motor',
        name: 'Motor Efferent Decoder',
        color: '#10b981', // emerald-500
        clusterKey: 'motor_efferent',
        synapses: synapses.filter((s) => s.preId >= 8 && s.preId <= 15 && s.postId >= 16),
      },
      recurrent: {
        id: 'recurrent',
        name: 'Recurrent Interneuron Plasticity',
        color: '#8b5cf6', // purple-500
        clusterKey: 'recurrent_interneuron',
        synapses: synapses.filter((s) => s.preId >= 8 && s.postId >= 8 && s.preId !== s.postId),
      },
    };

    const centroids: ClusterCentroid[] = [];

    for (const [key, group] of Object.entries(groups)) {
      if (group.synapses.length === 0) continue;

      let sumX = 0;
      let sumY = 0;
      let totalW = 0;
      let posCount = 0;
      let negCount = 0;

      for (const syn of group.synapses) {
        const p1 = neuronPositions.get(syn.preId);
        const p2 = neuronPositions.get(syn.postId);
        if (p1 && p2) {
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          const w = Math.abs(syn.weight);
          sumX += midX * (w + 0.1);
          sumY += midY * (w + 0.1);
          totalW += w;
          if (syn.weight > 0) posCount++;
          else negCount++;
        }
      }

      const meanW = group.synapses.length > 0 ? totalW / group.synapses.length : 0;
      const normalizer = totalW + group.synapses.length * 0.1;

      // Check if cluster is flagged by SynapticDriftGuard
      const driftInfo = driftClusters[group.clusterKey];
      const driftVelocity = driftInfo?.driftVelocity ?? 0;
      const secondOrderDerivative = driftInfo?.secondOrderDerivative ?? 0;
      const isExceeding = driftInfo?.isExceedingThreshold ?? false;
      const isFlagged =
        isExceeding ||
        driftVelocity >= 0.12 ||
        secondOrderDerivative >= 0.08 ||
        driftInfo?.stabilizationState === 'LTD_INJECTING' ||
        driftInfo?.stabilizationState === 'DRIFTING';

      centroids.push({
        id: key,
        name: group.name,
        x: normalizer > 0 ? sumX / normalizer : canvasWidth / 2,
        y: normalizer > 0 ? sumY / normalizer : canvasHeight / 2,
        totalWeight: Number(totalW.toFixed(2)),
        meanWeight: Number(meanW.toFixed(3)),
        synapseCount: group.synapses.length,
        dominantType: negCount > posCount ? 'inhibitory' : posCount > negCount ? 'excitatory' : 'balanced',
        color: isFlagged ? '#f43f5e' : group.color,
        isFlaggedByDriftGuard: isFlagged,
        driftVelocity,
        secondOrderDerivative,
        stabilizationState: driftInfo?.stabilizationState,
        isExceedingThreshold: isExceeding,
      });
    }

    return centroids;
  }, [synapses, neuronPositions, canvasWidth, canvasHeight, driftClusters]);

  // Render real-time synaptic weight concentration density field and flagged instability zones
  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Create set of flagged cluster IDs
    const flaggedCentroidIds = new Set(
      clusterMetrics.filter((c) => c.isFlaggedByDriftGuard).map((c) => c.id)
    );

    // Filter synapses based on active layerMode, weightThreshold, and instability filter
    const activeSynapses = synapses.filter((s) => {
      const absW = Math.abs(s.weight);
      if (absW < weightThreshold) return false;

      // Drift instability filter: focus specifically on synapses contributing to instability
      if (layerMode === 'drift_instability' || highlightInstabilityOnly) {
        // High-weight synapses in associative core or flagged clusters
        const inSensory = s.preId <= 7 && s.postId >= 8 && s.postId <= 15;
        const inAssociative = s.preId >= 8 && s.postId >= 8 && s.preId <= 15 && s.postId <= 15;
        const inMotor = s.preId >= 8 && s.postId >= 16;
        const inInhibitory = s.weight < 0;

        let clusterMatch = false;
        if (inSensory && flaggedCentroidIds.has('sensory')) clusterMatch = true;
        if (inAssociative && flaggedCentroidIds.has('associative')) clusterMatch = true;
        if (inMotor && flaggedCentroidIds.has('motor')) clusterMatch = true;
        if (inInhibitory && flaggedCentroidIds.has('inhibitory')) clusterMatch = true;

        // Also include heavy synapses (|w| > 0.85) directly driving instability
        return clusterMatch || absW >= 0.85;
      }

      if (layerMode === 'excitatory') return s.weight > 0;
      if (layerMode === 'inhibitory') return s.weight < 0;
      return true;
    });

    if (activeSynapses.length === 0) return;

    ctx.save();
    ctx.globalAlpha = opacity;

    // Render smooth radial density blobs along synaptic transmission vectors
    for (const syn of activeSynapses) {
      const p1 = neuronPositions.get(syn.preId);
      const p2 = neuronPositions.get(syn.postId);
      if (!p1 || !p2) continue;

      const isExcitatory = syn.weight > 0;
      const absW = Math.abs(syn.weight);
      const isHighInstabilityWeight = absW > 0.85;

      // Sample points along synaptic vector
      const samplePoints = [
        { x: p1.x * 0.75 + p2.x * 0.25, y: p1.y * 0.75 + p2.y * 0.25, w: absW * 0.7 },
        { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, w: absW },
        { x: p1.x * 0.25 + p2.x * 0.75, y: p1.y * 0.25 + p2.y * 0.75, w: absW * 0.8 },
      ];

      for (const pt of samplePoints) {
        const radius = Math.max(16, Math.min(55, 20 + pt.w * 35));
        const gradient = ctx.createRadialGradient(pt.x, pt.y, 2, pt.x, pt.y, radius);

        if (layerMode === 'drift_instability' || (highlightInstabilityOnly && isHighInstabilityWeight)) {
          // Hot Crimson/Amber thermal contour for Drift Guard flagged instability zones
          gradient.addColorStop(0, `rgba(244, 63, 94, ${Math.min(0.65, 0.25 + pt.w * 0.4)})`);
          gradient.addColorStop(0.4, `rgba(245, 158, 11, ${Math.min(0.45, 0.15 + pt.w * 0.25)})`);
          gradient.addColorStop(1, 'rgba(225, 29, 72, 0)');
        } else if (layerMode === 'net') {
          // Net mode: Excitatory adds amber/gold, Inhibitory adds violet/indigo
          if (isExcitatory) {
            gradient.addColorStop(0, `rgba(245, 158, 11, ${Math.min(0.45, 0.15 + pt.w * 0.3)})`);
            gradient.addColorStop(0.5, `rgba(217, 119, 6, ${Math.min(0.25, 0.08 + pt.w * 0.15)})`);
            gradient.addColorStop(1, 'rgba(180, 83, 9, 0)');
          } else {
            gradient.addColorStop(0, `rgba(168, 85, 247, ${Math.min(0.45, 0.15 + pt.w * 0.3)})`);
            gradient.addColorStop(0.5, `rgba(147, 51, 234, ${Math.min(0.25, 0.08 + pt.w * 0.15)})`);
            gradient.addColorStop(1, 'rgba(126, 34, 206, 0)');
          }
        } else if (isExcitatory) {
          gradient.addColorStop(0, `rgba(56, 189, 248, ${Math.min(0.55, 0.2 + pt.w * 0.35)})`);
          gradient.addColorStop(0.4, `rgba(251, 191, 36, ${Math.min(0.35, 0.1 + pt.w * 0.25)})`);
          gradient.addColorStop(1, 'rgba(14, 165, 233, 0)');
        } else {
          gradient.addColorStop(0, `rgba(244, 63, 94, ${Math.min(0.6, 0.22 + pt.w * 0.4)})`);
          gradient.addColorStop(0.5, `rgba(192, 38, 211, ${Math.min(0.35, 0.12 + pt.w * 0.25)})`);
          gradient.addColorStop(1, 'rgba(225, 29, 72, 0)');
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Render Synaptic Concentration Centroids & Vector Connectors
    if (showCentroids) {
      for (const centroid of clusterMetrics) {
        if (layerMode === 'excitatory' && centroid.dominantType === 'inhibitory') continue;
        if (layerMode === 'inhibitory' && centroid.dominantType === 'excitatory') continue;
        if (layerMode === 'drift_instability' && !centroid.isFlaggedByDriftGuard) continue;

        ctx.save();
        ctx.strokeStyle = centroid.color;
        ctx.lineWidth = centroid.isFlaggedByDriftGuard ? 2.5 : 1.5;
        ctx.setLineDash(centroid.isFlaggedByDriftGuard ? [4, 2] : [3, 3]);

        // Draw concentration perimeter ring
        const ringRadius = Math.max(18, Math.min(42, 14 + centroid.meanWeight * 28));
        ctx.beginPath();
        ctx.arc(centroid.x, centroid.y, ringRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Pulsating outer warning ring if flagged by SynapticDriftGuard
        if (centroid.isFlaggedByDriftGuard) {
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.6)';
          ctx.lineWidth = 1;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(centroid.x, centroid.y, ringRadius + 8, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Inner glowing core
        ctx.setLineDash([]);
        ctx.fillStyle = centroid.color;
        ctx.beginPath();
        ctx.arc(centroid.x, centroid.y, centroid.isFlaggedByDriftGuard ? 5.5 : 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }

    ctx.restore();
  }, [
    visible,
    synapses,
    neuronPositions,
    canvasWidth,
    canvasHeight,
    layerMode,
    opacity,
    showCentroids,
    weightThreshold,
    highlightInstabilityOnly,
    clusterMetrics,
  ]);

  if (!visible) return null;

  const totalFlaggedCount = clusterMetrics.filter((c) => c.isFlaggedByDriftGuard).length;

  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      {/* Real-time Density Field Canvas */}
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        className="w-full h-full block"
      />

      {/* Centroid Labels & Floating Instability Badges */}
      {showCentroids && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {clusterMetrics.map((c) => {
            if (layerMode === 'excitatory' && c.dominantType === 'inhibitory') return null;
            if (layerMode === 'inhibitory' && c.dominantType === 'excitatory') return null;
            if (layerMode === 'drift_instability' && !c.isFlaggedByDriftGuard) return null;

            return (
              <div
                key={c.id}
                style={{
                  left: `${(c.x / canvasWidth) * 100}%`,
                  top: `${(c.y / canvasHeight) * 100}%`,
                  transform: 'translate(-50%, -120%)',
                }}
                className={`absolute flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-md pointer-events-auto text-[10px] font-mono whitespace-nowrap transition-transform hover:scale-105 shadow-xl border ${
                  c.isFlaggedByDriftGuard
                    ? 'bg-rose-950/90 border-rose-500 text-rose-200 ring-2 ring-rose-500/40 animate-pulse'
                    : 'bg-slate-950/90 border-slate-700/80 text-slate-200'
                }`}
              >
                {c.isFlaggedByDriftGuard ? (
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <span
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ backgroundColor: c.color }}
                  />
                )}
                <span className="font-semibold">{c.name}</span>
                <span className="text-slate-500">|</span>
                <span className="text-amber-300">w̄ {c.meanWeight.toFixed(2)}</span>
                {c.isFlaggedByDriftGuard ? (
                  <span className="text-rose-400 font-bold bg-rose-900/40 px-1 rounded">
                    v: {c.driftVelocity.toFixed(3)}
                  </span>
                ) : (
                  <span className="text-slate-500 text-[9px]">({c.synapseCount} syn)</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Control Ribbon Toolbar at Top-Left */}
      <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-2 bg-slate-950/95 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-[11px] font-mono shadow-2xl pointer-events-auto">
        <div className="flex items-center gap-1.5 text-sky-400 font-semibold pr-2 border-r border-slate-800">
          <Flame className="w-3.5 h-3.5 text-amber-400" />
          <span>HeatMapOverlay</span>
        </div>

        {/* Flagged Drift Guard Instability Zones Quick Filter */}
        <button
          onClick={() => {
            if (layerMode === 'drift_instability') {
              setLayerMode('all');
            } else {
              setLayerMode('drift_instability');
            }
          }}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold transition-all border ${
            layerMode === 'drift_instability'
              ? 'bg-gradient-to-r from-rose-600 to-amber-600 text-white border-rose-400 shadow-md ring-1 ring-rose-400'
              : totalFlaggedCount > 0
              ? 'bg-rose-950/50 text-rose-300 border-rose-800/60 hover:bg-rose-900/60'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
          title="Highlight synaptic density clusters flagged by the SynapticDriftGuard"
        >
          <ShieldAlert className="w-3 h-3 text-rose-400" />
          <span>Drift Instability Zones</span>
          {totalFlaggedCount > 0 && (
            <span className="px-1 py-0.2 bg-rose-500 text-white rounded text-[9px] font-bold">
              {totalFlaggedCount} FLAGGED
            </span>
          )}
        </button>

        {/* Layer Mode Selector */}
        <div className="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded border border-slate-800">
          <button
            onClick={() => setLayerMode('all')}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition ${
              layerMode === 'all' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Show All Synaptic Clusters"
          >
            All
          </button>
          <button
            onClick={() => setLayerMode('excitatory')}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition ${
              layerMode === 'excitatory' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Excitatory (LTP) Concentrations"
          >
            LTP (w&gt;0)
          </button>
          <button
            onClick={() => setLayerMode('inhibitory')}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition ${
              layerMode === 'inhibitory' ? 'bg-pink-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Inhibitory (GABA) Concentrations"
          >
            LTD (w&lt;0)
          </button>
          <button
            onClick={() => setLayerMode('net')}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition ${
              layerMode === 'net' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Net Exc/Inh Balance Field"
          >
            Net
          </button>
        </div>

        {/* Live Drift Guard Status Pill */}
        {driftSnapshot && (
          <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-slate-800 text-[10px]">
            <Activity className="w-3 h-3 text-indigo-400" />
            <span className="text-slate-400">DRI:</span>
            <span
              className={`font-bold ${
                driftSnapshot.isDriSafe ? 'text-emerald-400' : 'text-rose-400 font-black animate-pulse'
              }`}
            >
              {(driftSnapshot.driftRiskIndex ?? 0).toFixed(1)}%
            </span>
          </div>
        )}

        {/* Centroids toggle */}
        <button
          onClick={() => setShowCentroids(!showCentroids)}
          className={`px-1.5 py-0.5 rounded text-[10px] border transition ${
            showCentroids
              ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/40'
              : 'bg-slate-900 text-slate-500 border-slate-800'
          }`}
          title="Toggle Centroid Rings and Drift Beacons"
        >
          Centroids
        </button>

        {onToggleVisible && (
          <button
            onClick={onToggleVisible}
            className="text-slate-400 hover:text-white text-xs px-1"
            title="Hide HeatMapOverlay"
          >
            &times;
          </button>
        )}
      </div>
    </div>
  );
};
