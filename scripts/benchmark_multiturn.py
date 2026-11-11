#!/usr/bin/env python3
"""scripts/benchmark_multiturn.py

Closed-loop stress test of the governor + return bridge + Kuramoto coherence homeostasis.

Protocol: `--warmup` quiet turns let the coherence loop settle (not logged), then `--turns`
measured turns inject two fluff bursts (T4, T11), concise-command phases (T7, T12, T13) and
dopamine pulses (T8 reward, T14 punish). Traffic is deterministic, so runs are reproducible.

Every number printed comes from executing synapse_governor.py; nothing is estimated.
By default the time-series JSONL is truncated at start so runs do not compound; pass --append
to keep earlier lines.
"""

import argparse
from pathlib import Path
import sys

# Ensure the repository root is importable when invoked as `python3 scripts/...`
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import synapse_governor as governor_module  # noqa: E402
from synapse_governor import (  # noqa: E402
    R_TARGET,
    REPORT_HISTORY_JSONL,
    ArgonClosedLoopBridgeV2,
    ArgonControlGovernorV2,
    DopaminePlasticitySubstrate,
    LLMResponseTelemetry,
    TelemetryState,
    export_telemetry_for_bridge,
    strip_affirmation_fluff,
)

BENCHMARK_REPORT = Path("snn-divergence-correlation-report-benchmark.json")
STANDARD = ("Standard Analytical Stream", "Coupled Kuramoto oscillators regulate dynamic range index drift via Heun RK2 integration.", 240, 0.60, 850.0)
FLUFF = ("Supercritical Fluff Burst", "Certainly! That's a great question. SNN criticality is maintained across turns.", 920, 1.65, 2200.0)
CONCISE = ("Concise Deterministic Cmd", "Telemetry state nominal across channels.", 32, 0.20, 410.0)


def _traffic(turn: int):
    if turn in (4, 11):
        return FLUFF
    if turn in (7, 12, 13):
        return CONCISE
    return STANDARD


def run_benchmark(n_turns: int = 20, warmup: int = 40, append: bool = False, open_loop: bool = False) -> list:
    # The --open-loop ablation swaps out one governor function; always restore it so an
    # in-process open-loop run cannot silently turn later closed-loop runs into open-loop ones.
    original = governor_module.update_coherence_homeostasis
    try:
        return _run_benchmark(n_turns, warmup, append, open_loop)
    finally:
        governor_module.update_coherence_homeostasis = original


def _run_benchmark(n_turns: int, warmup: int, append: bool, open_loop: bool) -> list:
    governor = ArgonControlGovernorV2(target_sigma=1.0)
    bridge = ArgonClosedLoopBridgeV2(target_sigma=1.0, ltd_ltp_ratio=1.28)
    dopamine = DopaminePlasticitySubstrate(decay_tau=0.85)
    state = TelemetryState()
    if open_loop:
        # Ablation: pin the coupling multiplier at the original open-loop value (1.0).
        governor_module.update_coherence_homeostasis = lambda r, integral: (1.0, 0.0)
        state.k_gain = 1.0

    for _ in range(warmup):  # settle the coherence loop on quiet traffic; not logged
        max_tok = governor.compute_inference_hooks(state)["api_config"]["max_output_tokens"]
        _, raw, tokens, entropy, lat = STANDARD
        state = bridge.step_return_path(state, LLMResponseTelemetry(raw, tokens, max_tok, lat, entropy))

    if not append:
        REPORT_HISTORY_JSONL.write_text("", encoding="utf-8")

    mode = "OPEN LOOP (coherence loop disabled)" if open_loop else "closed loop"
    print(f"=== {n_turns}-Turn Neuromorphic Governance Benchmark ({mode}, warmup={warmup}, r target={R_TARGET}) ===\n")
    print(f"{'Turn':<5} | {'Pre-σ':<6} | {'Temp':<6} | {'MaxTok':<6} | {'Repair':<14} | {'Post-σ':<6} | {'Crowd r':<8} | {'K gain':<7} | {'w_Setpt':<8} | Traffic Profile")
    print("-" * 122)

    rows = []
    for turn in range(1, n_turns + 1):
        hooks = governor.compute_inference_hooks(state)
        temp = hooks["api_config"]["temperature"]
        max_tok = hooks["api_config"]["max_output_tokens"]
        pre_sigma = state.sigma

        profile, raw_text, tokens, entropy, lat_ms = _traffic(turn)
        cleaned = strip_affirmation_fluff(raw_text)
        repair_action = "SURGICAL_STRIP" if cleaned != raw_text else "NONE"
        sim_out = LLMResponseTelemetry(
            output_text=raw_text if repair_action == "SURGICAL_STRIP" else cleaned,
            tokens_generated=tokens, max_tokens_allowed=max_tok,
            generation_latency_ms=lat_ms, mean_token_entropy=entropy,
        )
        state = bridge.step_return_path(state, sim_out)

        note = ""
        if turn == 8:
            state, _ = dopamine.apply_reward_pulse(1.0, state)
            note = " [REWARD +1.0]"
        elif turn == 14:
            state, _ = dopamine.apply_reward_pulse(-0.8, state)
            note = " [PUNISH -0.8]"

        export_telemetry_for_bridge(
            state=state, history_turns=min(turn, 10), repair_action=repair_action,
            measured_entropy=entropy, output_path=BENCHMARK_REPORT, append_jsonl=True,
        )
        rows.append((turn, state.sigma, state.active_crowd, state.k_gain, state.w_setpoint_int8))
        print(
            f"T{turn:<4} | {pre_sigma:<6.3f} | {temp:<6.3f} | {max_tok:<6} | {repair_action:<14} | "
            f"{state.sigma:<6.3f} | {state.active_crowd:<8.3f} | {state.k_gain:<7.4f} | "
            f"{state.w_setpoint_int8:<8.1f} | {profile}{note}"
        )

    rs = [r[2] for r in rows]
    sig = [r[1] for r in rows]
    print(
        f"\nSummary: σ peak {max(sig):.3f} (T{sig.index(max(sig)) + 1}), "
        f"r range {min(rs):.3f}-{max(rs):.3f}, mean r {sum(rs) / len(rs):.3f} (target {R_TARGET}), "
        f"w_setpoint {rows[0][4]:.1f} -> {rows[-1][4]:.1f}"
    )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Multi-turn closed-loop governance benchmark")
    parser.add_argument("--turns", type=int, default=20)
    parser.add_argument("--warmup", type=int, default=40, help="quiet settling turns before measurement")
    parser.add_argument("--append", action="store_true", help="keep existing JSONL lines instead of truncating")
    parser.add_argument("--open-loop", action="store_true", help="ablation: disable the coherence loop (coupling pinned at 1.0)")
    args = parser.parse_args()
    run_benchmark(args.turns, args.warmup, args.append, args.open_loop)


if __name__ == "__main__":
    main()
