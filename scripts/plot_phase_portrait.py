#!/usr/bin/env python3
"""scripts/plot_phase_portrait.py

Phase portrait of the homeostatic orbit from snn-telemetry-timeseries.jsonl:
branching ratio (sigma) vs Kuramoto order parameter (r), against the target (1.00, 0.48).
The r target is enforced by the coherence loop in synapse_governor.py (R_TARGET).
"""

import argparse
import json
from pathlib import Path
from typing import List

DEFAULT_JSONL = Path("snn-telemetry-timeseries.jsonl")
SIGMA_TARGET, R_TARGET = 1.00, 0.48


def load_timeseries(path: Path) -> List[dict]:
    if not path.exists():
        return []
    records = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return records


def render_ascii_phase_portrait(records: List[dict], width: int = 50, height: int = 18) -> str:
    """X = branching ratio (0.6..1.6), Y = Kuramoto r (0.0..1.0). Latest point (★) is drawn on top."""
    if not records:
        return "No telemetry records found in time-series log."
    min_x, max_x, min_y, max_y = 0.60, 1.60, 0.0, 1.0

    def cell(sigma: float, r: float):
        gx = max(0, min(width - 1, int(((sigma - min_x) / (max_x - min_x)) * (width - 1))))
        gy = max(0, min(height - 1, int(((r - min_y) / (max_y - min_y)) * (height - 1))))
        return gx, height - 1 - gy

    grid = [[" " for _ in range(width)] for _ in range(height)]
    for rec in records[:-1]:
        gx, gy = cell(rec.get("sigma", 1.0), rec.get("r", R_TARGET))
        grid[gy][gx] = "•"
    tx, ty = cell(SIGMA_TARGET, R_TARGET)
    grid[ty][tx] = "⊙"
    last = records[-1]
    lx, ly = cell(last.get("sigma", 1.0), last.get("r", R_TARGET))
    grid[ly][lx] = "★"

    border = "+" + "-" * width + "+"
    lines = ["Kuramoto r ^", border]
    lines += ["|" + "".join(row) + "|" for row in grid]
    lines += [border, f"{min_x:.2f}" + " " * (width - 8) + f"{max_x:.2f} -> Branching Ratio (σ)"]
    lines.append(f"Legend: ⊙ Target ({SIGMA_TARGET:.2f}, {R_TARGET:.2f}) | • Trajectory | ★ Latest")
    return "\n".join(lines)


def export_matplotlib_portrait(records: List[dict], output_png: Path) -> bool:
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        print("[Plotter] matplotlib not installed; skipping PNG generation.")
        return False
    sigmas = [r.get("sigma", 1.0) for r in records]
    rs = [r.get("r", R_TARGET) for r in records]
    plt.figure(figsize=(9, 7), dpi=150)
    plt.axvline(SIGMA_TARGET, color="gray", linestyle="--", alpha=0.5, label=f"Target σ={SIGMA_TARGET:.2f}")
    plt.axhline(R_TARGET, color="gray", linestyle=":", alpha=0.5, label=f"Target r={R_TARGET:.2f}")
    plt.plot(sigmas, rs, color="#3b82f6", alpha=0.4, linewidth=1.5, zorder=1)
    sc = plt.scatter(sigmas, rs, c=range(1, len(records) + 1), cmap="viridis", s=45, edgecolors="black", linewidth=0.5, zorder=2)
    plt.colorbar(sc, label="Turn")
    plt.scatter([SIGMA_TARGET], [R_TARGET], color="red", marker="x", s=120, linewidth=2.5, label="Target", zorder=3)
    plt.scatter([sigmas[-1]], [rs[-1]], color="#e11d48", marker="*", s=200, edgecolors="black", label="Latest", zorder=4)
    plt.title("SNN Homeostatic Phase Portrait (simulation)", fontweight="bold")
    plt.xlabel("Branching ratio σ")
    plt.ylabel("Kuramoto order parameter r")
    plt.xlim(0.60, 1.60)
    plt.ylim(0.0, 1.0)
    plt.grid(True, linestyle="--", alpha=0.3)
    plt.legend(loc="upper right")
    plt.tight_layout()
    plt.savefig(output_png)
    plt.close()
    print(f"[Plotter] Saved phase portrait to {output_png.resolve()}")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Plot SNN homeostatic phase portrait")
    parser.add_argument("-f", "--file", type=Path, default=DEFAULT_JSONL)
    parser.add_argument("-o", "--output", type=Path, default=Path("phase_portrait.png"))
    args = parser.parse_args()
    records = load_timeseries(args.file)
    print(render_ascii_phase_portrait(records))
    if records:
        export_matplotlib_portrait(records, args.output)


if __name__ == "__main__":
    main()
