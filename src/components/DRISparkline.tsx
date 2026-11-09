import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, ShieldCheck } from 'lucide-react';

interface DRISparklineProps {
  history: number[]; // Array of last N values (up to 60 seconds)
  currentVal: number; // Current Divergence Risk Index (0.0 to 1.0)
  threshold?: number; // Automatic rollback trigger threshold (default 0.35)
  width?: number; // SVG width (default 124)
  height?: number; // SVG height (default 28)
  showTrendBadge?: boolean;
}

export const DRISparkline: React.FC<DRISparklineProps> = ({
  history,
  currentVal,
  threshold = 0.35,
  width = 124,
  height = 28,
  showTrendBadge = true,
}) => {
  // Ensure we have at least 2 points to draw
  const dataPoints = useMemo(() => {
    if (!history || history.length === 0) {
      return Array(60).fill(currentVal);
    }
    if (history.length === 1) {
      return [history[0], currentVal];
    }
    return history.slice(-60);
  }, [history, currentVal]);

  // Compute stats across the 60-second window
  const stats = useMemo(() => {
    const min = Math.min(...dataPoints);
    const max = Math.max(...dataPoints);
    const first = dataPoints[0];
    const last = dataPoints[dataPoints.length - 1];
    const delta = last - first;
    const avg = dataPoints.reduce((acc, v) => acc + v, 0) / dataPoints.length;
    const isApproachingRollback = last >= threshold * 0.85; // e.g. >= 0.298
    const isExceedingRollback = last >= threshold; // e.g. >= 0.35

    return { min, max, delta, avg, isApproachingRollback, isExceedingRollback };
  }, [dataPoints, threshold]);

  // SVG coordinate calculations
  const { pathD, fillD, thresholdY, lastX, lastY, statusColor } = useMemo(() => {
    const paddingX = 2;
    const paddingY = 4;
    const drawWidth = width - paddingX * 2;
    const drawHeight = height - paddingY * 2;

    // Fixed upper scale to ensure threshold 0.35 is always at ~55% height
    const yMax = Math.max(0.60, stats.max * 1.15);
    const yMin = 0.0;

    const scaleY = (val: number) => {
      const clamped = Math.max(yMin, Math.min(yMax, val));
      const norm = (clamped - yMin) / (yMax - yMin);
      // Invert Y for SVG coordinates (0 is top, height is bottom)
      return height - paddingY - norm * drawHeight;
    };

    const stepX = drawWidth / (dataPoints.length - 1 || 1);

    const points = dataPoints.map((val, idx) => ({
      x: paddingX + idx * stepX,
      y: scaleY(val),
    }));

    // Generate smooth line path string
    const linePath = points.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }, '');

    // Generate filled area path
    const bottomY = height - paddingY;
    const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${bottomY.toFixed(1)} L ${points[0].x.toFixed(1)} ${bottomY.toFixed(1)} Z`;

    const threshY = scaleY(threshold);
    const lastPoint = points[points.length - 1];

    // Status color based on current DRI value and distance to threshold
    let color = '#10b981'; // Emerald nominal
    if (stats.isExceedingRollback) {
      color = '#f43f5e'; // Rose / critical rollback trigger
    } else if (stats.isApproachingRollback) {
      color = '#f59e0b'; // Amber warning
    } else if (currentVal >= 0.25) {
      color = '#fbbf24'; // Warm yellow
    }

    return {
      pathD: linePath,
      fillD: areaPath,
      thresholdY: threshY,
      lastX: lastPoint.x,
      lastY: lastPoint.y,
      statusColor: color,
    };
  }, [dataPoints, width, height, threshold, stats.max, stats.isApproachingRollback, stats.isExceedingRollback, currentVal]);

  const gradientId = useMemo(() => `dri-grad-${Math.random().toString(36).substring(2, 9)}`, []);

  const trendIcon = useMemo(() => {
    if (Math.abs(stats.delta) < 0.015) {
      return <Minus className="w-2.5 h-2.5 text-slate-400" />;
    }
    if (stats.delta > 0) {
      return <TrendingUp className={`w-2.5 h-2.5 ${stats.isApproachingRollback ? 'text-rose-400' : 'text-amber-400'}`} />;
    }
    return <TrendingDown className="w-2.5 h-2.5 text-emerald-400" />;
  }, [stats.delta, stats.isApproachingRollback]);

  const tooltipText = `60s DRI Window:
• Current: ${(currentVal * 100).toFixed(0)}% (${currentVal.toFixed(3)})
• 60s Range: ${(stats.min * 100).toFixed(0)}% – ${(stats.max * 100).toFixed(0)}%
• 60s Trend: ${stats.delta >= 0 ? '+' : ''}${(stats.delta * 100).toFixed(1)}%
• Rollback Tripwire: ${(threshold * 100).toFixed(0)}% (Margin: ${Math.max(0, (threshold - currentVal) * 100).toFixed(0)}%)
${stats.isExceedingRollback ? '⚠️ CRITICAL: Rollback Threshold Exceeded!' : stats.isApproachingRollback ? '⚡ CAUTION: Approaching Auto-Rollback Limit' : '✓ STABLE: Operating within safe margin'}`;

  return (
    <div
      className="flex items-center gap-2 group relative cursor-help"
      title={tooltipText}
    >
      {/* SVG Sparkline Graph */}
      <div className="relative flex items-center justify-center bg-slate-950/90 rounded border border-slate-800/90 px-1 py-0.5 overflow-hidden">
        <svg
          width={width}
          height={height}
          className="overflow-visible block"
          role="img"
          aria-label="60s Divergence Risk Index Sparkline"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={statusColor} stopOpacity="0.38" />
              <stop offset="85%" stopColor={statusColor} stopOpacity="0.04" />
              <stop offset="100%" stopColor={statusColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Critical Rollback Threshold Line (0.35) */}
          <line
            x1="0"
            y1={thresholdY}
            x2={width}
            y2={thresholdY}
            stroke="#f43f5e"
            strokeWidth="1"
            strokeDasharray="2 3"
            strokeOpacity="0.45"
          />

          {/* Gradient Area Fill */}
          <path d={fillD} fill={`url(#${gradientId})`} />

          {/* Sparkline Stroke */}
          <path
            d={pathD}
            fill="none"
            stroke={statusColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Live Head Pulse Dot */}
          <circle
            cx={lastX}
            cy={lastY}
            r="2.5"
            fill={statusColor}
            className={stats.isApproachingRollback ? 'animate-ping' : ''}
          />
          <circle cx={lastX} cy={lastY} r="2.0" fill={statusColor} />
        </svg>

        {/* Faint overlay label for rollback limit indicator */}
        <span
          className="absolute right-1 text-[8px] font-mono text-rose-400/50 pointer-events-none"
          style={{ top: `${Math.max(1, thresholdY - 9)}px` }}
        >
          {threshold * 100}%
        </span>
      </div>

      {/* Mini Trend Summary Indicator */}
      {showTrendBadge && (
        <div className="flex flex-col text-[9px] font-mono leading-none gap-0.5">
          <div className="flex items-center gap-0.5">
            {trendIcon}
            <span
              className={`font-semibold ${
                stats.delta > 0.02
                  ? stats.isApproachingRollback
                    ? 'text-rose-400'
                    : 'text-amber-400'
                  : stats.delta < -0.02
                  ? 'text-emerald-400'
                  : 'text-slate-400'
              }`}
            >
              {stats.delta >= 0 ? `+${(stats.delta * 100).toFixed(0)}%` : `${(stats.delta * 100).toFixed(0)}%`}
            </span>
          </div>
          <span className="text-[8px] text-slate-500 uppercase tracking-tighter">
            60s Trend
          </span>
        </div>
      )}

      {/* Enhanced Tooltip on Hover */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col gap-1 p-2 bg-slate-950/95 border border-slate-700/80 rounded-lg shadow-xl text-[10px] font-mono text-slate-200 z-50 w-56 pointer-events-none backdrop-blur-md">
        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
          <span className="font-bold flex items-center gap-1 text-slate-100">
            {stats.isExceedingRollback ? (
              <AlertTriangle className="w-3 h-3 text-rose-400" />
            ) : (
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
            )}
            60-Second DRI Trajectory
          </span>
          <span
            className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
              stats.isExceedingRollback
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : stats.isApproachingRollback
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
            }`}
          >
            {(currentVal * 100).toFixed(0)}% DRI
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1 text-[9px] text-slate-400 pt-0.5">
          <div>Min: <span className="text-slate-200 font-semibold">{(stats.min * 100).toFixed(0)}%</span></div>
          <div>Max: <span className="text-slate-200 font-semibold">{(stats.max * 100).toFixed(0)}%</span></div>
          <div>60s Δ: <span className={stats.delta > 0 ? 'text-amber-300' : 'text-emerald-300'}>{stats.delta >= 0 ? `+${(stats.delta * 100).toFixed(1)}%` : `${(stats.delta * 100).toFixed(1)}%`}</span></div>
          <div>Rollback: <span className="text-rose-400 font-semibold">{(threshold * 100).toFixed(0)}%</span></div>
        </div>

        <div className="pt-1 text-[8.5px] border-t border-slate-800/80 text-slate-400 leading-tight">
          {stats.isExceedingRollback ? (
            <span className="text-rose-300 font-semibold">Auto-rollback tripwire breached! Stability recovery engaged.</span>
          ) : stats.isApproachingRollback ? (
            <span className="text-amber-300 font-semibold">Warning: Instability buildup approaching 35% auto-rollback ceiling.</span>
          ) : (
            <span className="text-emerald-300">DRI nominal. Closed-loop STDP invariants actively preventing divergence.</span>
          )}
        </div>
      </div>
    </div>
  );
};
