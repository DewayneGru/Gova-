#!/usr/bin/env python3
"""SynapseEdge Cybernetic Governor 1,000-Turn Stress Benchmark.

Simulates closed-loop inference runs under variable token entropy regimes:
- Regime A (Turns 1-250): Low-entropy repetitive regime (H ~ 0.18-0.35 nats)
- Regime B (Turns 251-500): Nominal critical regime (H ~ 0.48-0.72 nats)
- Regime C (Turns 501-750): High-entropy chaotic burst regime (H ~ 1.20-1.85 nats)
- Regime D (Turns 751-1000): Recovery & stochastic reward injection

Monitors:
- Dynamic Range Index (DRI) drift and boundary retention ([0.005, 0.250])
- Kuramoto order parameter phase coherence (r) tracking against R_TARGET = 0.48
- True step-wise Finite-Time Lyapunov Exponent (FTLE) on branching ratio sigma
- INT8 crossbar weight saturation & L2 manifold divergence
"""

from dataclasses import asdict, dataclass
import json
import math
from pathlib import Path
import random
import sys
import time
from typing import Any, Dict, List, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from synapse_edge_governor import (
    R_TARGET,
    SynapseEdgeMiddleware,
)

BENCHMARK_STATE = Path("benchmark_synapse_state.json")
BENCHMARK_REPORT = Path("benchmark_snn_report_latest.json")
BENCHMARK_TIMESERIES = Path("benchmark_telemetry_timeseries.jsonl")


@dataclass
class TurnTelemetryMetrics:
    turn: int
    regime: str
    sigma: float
    kuramoto_r: float
    k_gain: float
    dri: float
    power_mw: float
    w_mean_norm: float
    l2_divergence: float
    token_entropy: float
    lyapunov_ftle: float


def generate_synthetic_turn(
    turn_idx: int, rng: random.Random
) -> Tuple[str, float, int, float, str]:
    """Generates synthetic response telemetry across 4 dynamic regimes."""
    if turn_idx <= 250:
        regime = "A_LOW_ENTROPY"
        entropy = rng.uniform(0.18, 0.35)
        tokens = rng.randint(18, 48)
        latency_ms = rng.uniform(320.0, 520.0)
        text = "Synchronized low-variance state output across the bus."
    elif turn_idx <= 500:
        regime = "B_NOMINAL_CRITICAL"
        entropy = rng.uniform(0.48, 0.72)
        tokens = rng.randint(64, 180)
        latency_ms = rng.uniform(620.0, 840.0)
        text = (
            "Phase-weight correlation tracks balanced homeostatic equilibrium "
            "as STDP eligibility traces consolidate against the INT8 setpoint."
        )
    elif turn_idx <= 750:
        regime = "C_HIGH_ENTROPY_BURST"
        entropy = rng.uniform(1.20, 1.85)
        tokens = rng.randint(220, 480)
        latency_ms = rng.uniform(920.0, 1450.0)
        text = (
            "Certainly! Absolutely exceptional stochastic phase-space turbulence! "
            "Erratic divergent permutations trigger GOVA compliance penalty hooks."
        )
    else:
        regime = "D_RECOVERY_REWARDS"
        entropy = rng.uniform(0.42, 0.68)
        tokens = rng.randint(40, 120)
        latency_ms = rng.uniform(550.0, 750.0)
        text = "Sub-threshold CMOS stabilization with active negative feedback damping."

    return text, round(entropy, 3), tokens, round(latency_ms, 2), regime


def compute_windowed_ftle(
    sigma_history: List[float], window: int = 20, eps: float = 1e-4
) -> float:
    """Computes step-wise Finite-Time Lyapunov Exponent around critical sigma* = 1.0."""
    if len(sigma_history) < window + 1:
        return 0.0

    # Evaluate local expansion/contraction ratio |sigma_t - 1| / |sigma_{t-1} - 1|
    recent = sigma_history[-(window + 1) :]
    log_stretches = []
    for k in range(1, len(recent)):
        d_curr = abs(recent[k] - 1.0) + eps
        d_prev = abs(recent[k - 1] - 1.0) + eps
        log_stretches.append(math.log(d_curr / d_prev))

    return round(sum(log_stretches) / window, 4)


def run_stress_benchmark(
    total_turns: int = 1000, seed: int = 42
) -> List[TurnTelemetryMetrics]:
    rng = random.Random(seed)

    # Clean prior artifacts
    for p in [BENCHMARK_STATE, BENCHMARK_REPORT, BENCHMARK_TIMESERIES]:
        if p.exists():
            p.unlink()

    middleware = SynapseEdgeMiddleware(
        state_path=BENCHMARK_STATE,
        persist_interval_turns=10,
    )

    records: List[TurnTelemetryMetrics] = []
    sigma_history: List[float] = [middleware.state.sigma]
    lyapunov_window = 20

    print("=" * 86)
    print(
        f"Starting SynapseEdge {total_turns}-Turn Stress Benchmark | "
        f"Target r = {R_TARGET} | Seed = {seed}"
    )
    print("=" * 86)
    header = (
        f"{'Turn':>5} | {'Regime':<20} | {'Sigma':>6} | {'r':>6} | "
        f"{'K_Gain':>6} | {'DRI':>7} | {'P(mW)':>6} | {'w_mean':>6} | {'FTLE':>7}"
    )
    print(header)
    print("-" * 86)

    start_time = time.perf_counter()

    with BENCHMARK_TIMESERIES.open("w", encoding="utf-8") as ts_file:
        for turn in range(1, total_turns + 1):
            text, entropy, tokens, latency_ms, regime = generate_synthetic_turn(
                turn, rng
            )

            hooks = middleware.get_generation_config()
            max_tokens = hooks["api_config"]["max_output_tokens"]

            cleaned_text, report = middleware.process_completed_turn(
                raw_output_text=text,
                tokens_generated=tokens,
                max_tokens_allowed=max_tokens,
                generation_latency_ms=latency_ms,
                mean_token_entropy=entropy,
            )

            # Stochastic reward pulses in Regime D to test dopamine quench under stress
            if regime == "D_RECOVERY_REWARDS" and (turn % 25 == 0):
                reward_val = 0.60 if rng.random() > 0.3 else -0.35
                middleware.deliver_reward(reward_val)

            t = report["telemetry"]
            d = report["divergence_and_correlation"]
            curr_sigma = t["branching_ratio_sigma"]
            sigma_history.append(curr_sigma)

            ftle = compute_windowed_ftle(sigma_history, window=lyapunov_window)

            metric = TurnTelemetryMetrics(
                turn=turn,
                regime=regime,
                sigma=curr_sigma,
                kuramoto_r=t["kuramoto_order_parameter_r"],
                k_gain=t["kuramoto_k_gain"],
                dri=t["dynamic_range_index_dri"],
                power_mw=t["power_mw"],
                w_mean_norm=t["weight_mean_norm"],
                l2_divergence=d["manifold_divergence_l2"],
                token_entropy=entropy,
                lyapunov_ftle=ftle,
            )
            records.append(metric)
            ts_file.write(json.dumps(asdict(metric)) + "\n")

            if turn % 50 == 0 or turn in (1, 251, 501, 751, total_turns):
                print(
                    f"{turn:>5} | {regime:<20} | {metric.sigma:>6.3f} | "
                    f"{metric.kuramoto_r:>6.3f} | {metric.k_gain:>6.4f} | "
                    f"{metric.dri:>7.4f} | {metric.power_mw:>6.2f} | "
                    f"{metric.w_mean_norm:>6.3f} | {metric.lyapunov_ftle:>+7.4f}"
                )

    elapsed = time.perf_counter() - start_time
    print("-" * 86)
    print(
        f"Benchmark completed: {total_turns} turns in {elapsed:.2f}s "
        f"({total_turns / elapsed:.1f} turns/sec)\n"
    )

    return records


def analyze_stability_metrics(records: List[TurnTelemetryMetrics]) -> Dict[str, Any]:
    """Computes distribution envelopes, per-regime stats, and stability invariants."""
    sigmas = [r.sigma for r in records]
    rs = [r.kuramoto_r for r in records]
    dris = [r.dri for r in records]
    powers = [r.power_mw for r in records]
    ftles = [r.lyapunov_ftle for r in records[20:]]
    weights = [r.w_mean_norm for r in records]
    divs = [r.l2_divergence for r in records]
    r_errors = [abs(r - R_TARGET) for r in rs]

    mean_r_err = sum(r_errors) / len(r_errors)
    dri_in_bounds = all(0.005 <= d <= 0.250 for d in dris)
    mean_ftle = sum(ftles) / len(ftles) if ftles else 0.0

    # Per-regime breakdown
    regimes: Dict[str, List[TurnTelemetryMetrics]] = {}
    for rec in records:
        regimes.setdefault(rec.regime, []).append(rec)

    regime_summary = {}
    for reg_name, reg_recs in regimes.items():
        regime_summary[reg_name] = {
            "turns": len(reg_recs),
            "mean_sigma": round(sum(x.sigma for x in reg_recs) / len(reg_recs), 4),
            "mean_r": round(sum(x.kuramoto_r for x in reg_recs) / len(reg_recs), 4),
            "mean_dri": round(sum(x.dri for x in reg_recs) / len(reg_recs), 4),
            "mean_power_mw": round(sum(x.power_mw for x in reg_recs) / len(reg_recs), 2),
            "mean_ftle": round(
                sum(x.lyapunov_ftle for x in reg_recs) / len(reg_recs), 4
            ),
        }

    audit_payload = {
        "total_turns": len(records),
        "invariants": {
            "kuramoto_tracking_pass": mean_r_err < 0.12,
            "dri_boundedness_pass": dri_in_bounds,
            "lyapunov_dissipative_pass": mean_ftle <= 0.05,
        },
        "global_envelopes": {
            "mean_r": round(sum(rs) / len(rs), 4),
            "min_r": round(min(rs), 4),
            "max_r": round(max(rs), 4),
            "mean_r_error": round(mean_r_err, 4),
            "mean_dri": round(sum(dris) / len(dris), 4),
            "min_dri": round(min(dris), 4),
            "max_dri": round(max(dris), 4),
            "mean_ftle": round(mean_ftle, 4),
            "sigma_range": [round(min(sigmas), 3), round(max(sigmas), 3)],
            "power_mw_range": [round(min(powers), 2), round(max(powers), 2)],
            "weight_norm_range": [round(min(weights), 3), round(max(weights), 3)],
            "mean_l2_divergence": round(sum(divs) / len(divs), 4),
        },
        "regime_breakdown": regime_summary,
    }

    BENCHMARK_REPORT.write_text(json.dumps(audit_payload, indent=2), encoding="utf-8")

    print("=" * 86)
    print("STABILITY & CONVERGENCE AUDIT REPORT (1,000 Synthetic Turns)")
    print("=" * 86)

    print("\n1. Kuramoto Phase Coherence Homeostasis (Target r = 0.48):")
    print(f"   - Mean r:              {audit_payload['global_envelopes']['mean_r']:.4f}")
    print(f"   - Min / Max r:         {min(rs):.4f} / {max(rs):.4f}")
    print(f"   - Mean |r - R_TARGET|: {mean_r_err:.4f}")
    print(
        f"   - Tracking Invariant:  "
        f"{'PASS (bounded around 0.48)' if mean_r_err < 0.12 else 'FAIL'}"
    )

    print("\n2. Dynamic Range Index (DRI) Invariant Envelope [0.005, 0.250]:")
    print(f"   - Mean DRI:            {audit_payload['global_envelopes']['mean_dri']:.4f}")
    print(f"   - Min / Max DRI:       {min(dris):.4f} / {max(dris):.4f}")
    print(
        f"   - DRI Boundedness:     "
        f"{'PASS (0 violations)' if dri_in_bounds else 'FAIL'}"
    )

    print("\n3. Finite-Time Lyapunov Stability (Step-Ratio FTLE on Critical Branching):")
    print(f"   - Mean FTLE:           {mean_ftle:+.4f}")
    print(f"   - Min / Max FTLE:      {min(ftles):+.4f} / {max(ftles):+.4f}")
    print(
        f"   - Orbit Contraction:   "
        f"{'PASS (Non-divergent attractor)' if mean_ftle <= 0.05 else 'WARNING (Net Expansion)'}"
    )

    print("\n4. Per-Regime Telemetry Breakdown:")
    print(
        f"   {'Regime':<22} | {'Mean Sigma':>10} | {'Mean r':>8} | "
        f"{'Mean DRI':>8} | {'Mean P(mW)':>10} | {'Mean FTLE':>9}"
    )
    print("   " + "-" * 79)
    for reg_name, stats in regime_summary.items():
        print(
            f"   {reg_name:<22} | {stats['mean_sigma']:>10.4f} | "
            f"{stats['mean_r']:>8.4f} | {stats['mean_dri']:>8.4f} | "
            f"{stats['mean_power_mw']:>10.2f} | {stats['mean_ftle']:>+9.4f}"
        )

    print("\n5. Substrate Crossbar & Physical Envelope:")
    print(
        f"   - Sigma Envelope:      [{min(sigmas):.3f}, {max(sigmas):.3f}] "
        f"(Mean: {sum(sigmas) / len(sigmas):.3f})"
    )
    print(
        f"   - Power Envelope:      [{min(powers):.2f} mW, {max(powers):.2f} mW] "
        f"(Mean: {sum(powers) / len(powers):.2f} mW)"
    )
    print(
        f"   - Weight Mean Norm:    [{min(weights):.3f}, {max(weights):.3f}] "
        f"(Setpoint: 0.685)"
    )
    print(f"   - Mean L2 Divergence:  {sum(divs) / len(divs):.4f}")
    print(f"   - Artifacts Saved:     {BENCHMARK_TIMESERIES}, {BENCHMARK_REPORT}")
    print("=" * 86)

    return audit_payload


if __name__ == "__main__":
    records = run_stress_benchmark(total_turns=1000, seed=42)
    analyze_stability_metrics(records)
