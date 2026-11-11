import asyncio
import json
import math
from pathlib import Path
try:
    import pytest
except ImportError:
    pytest = None

from synapse_governor import (
    ArgonClosedLoopBridgeV2,
    DopaminePlasticitySubstrate,
    LLMResponseTelemetry,
    StreamingAffirmationFilter,
    TelemetryState,
    audit_gova_compliance_v2,
    compute_lexical_entropy_fallback,
    export_telemetry_for_bridge,
    step_kuramoto_and_int8_substrate_v3,
    strip_affirmation_fluff,
)


def test_subcritical_anti_starvation_rebound():
    bridge = ArgonClosedLoopBridgeV2(target_sigma=1.0, ltd_ltp_ratio=1.28)
    state = TelemetryState(sigma=0.72, firing_rate_hz=19.8, w_mean_int8=0.685)
    concise = LLMResponseTelemetry(
        "Nominal state confirmed across all 16 channels.", 25, 256, 450.0, 0.22
    )
    state = bridge.step_return_path(state, concise)
    assert state.sigma > 0.85
    state = bridge.step_return_path(state, concise)
    state = bridge.step_return_path(state, concise)
    assert 0.95 <= state.sigma <= 1.05


def test_kuramoto_rk2_jitter_stability():
    phases = [round((i * 0.32) % (2.0 * math.pi), 4) for i in range(16)]
    weights = [87] * 16
    _, _, r_nom, _ = step_kuramoto_and_int8_substrate_v3(
        phases, weights, 0.18, 1.00, 0.84, 0.46
    )
    _, _, r_stall, _ = step_kuramoto_and_int8_substrate_v3(
        phases, weights, 0.18, 1.00, 1.35, 0.92
    )
    assert abs(r_nom - r_stall) < 0.12
    assert r_stall >= 0.40


def test_stacked_affirmation_stripping():
    cases = [
        (
            "Certainly! Here is the breakdown: Spiking neural networks regulate criticality.",
            "Spiking neural networks regulate criticality.",
        ),
        (
            "Sure thing! Let's look at the parameters: LTD/LTP is locked at 1.28.",
            "LTD/LTP is locked at 1.28.",
        ),
    ]
    for raw, expected in cases:
        cleaned = strip_affirmation_fluff(raw)
        assert cleaned == expected
        assert audit_gova_compliance_v2(cleaned) == 0.0


def test_lexical_entropy_dampening():
    assert 0.20 <= compute_lexical_entropy_fallback("Nominal.") <= 0.85
    assert compute_lexical_entropy_fallback("test " * 60) <= 0.25


def test_3factor_dopamine_consolidation():
    dopamine = DopaminePlasticitySubstrate(decay_tau=0.85)
    phases = [0.0] * 8 + [math.pi] * 8
    tagged = dopamine.step_eligibility_tags([0.0] * 16, 0.30, 320, phases)
    assert tagged[0] > tagged[12]
    state = TelemetryState(
        w_setpoint_int8=87.0, weights_int8=[87] * 16, eligibility_traces=tagged
    )
    updated, shift = dopamine.apply_reward_pulse(1.0, state)
    assert shift > 0.0 and updated.w_setpoint_int8 > 87.0
    assert all(e < 0.25 for e in updated.eligibility_traces)


def test_export_telemetry_for_bridge(tmp_path: Path):
    report_file = tmp_path / "snn-divergence-correlation-report-latest.json"
    state = TelemetryState(sigma=1.04, dri=0.035, w_mean_int8=0.690)
    export_telemetry_for_bridge(
        state, 6, "SURGICAL_STRIP", 0.45, report_file, append_jsonl=False
    )
    data = json.loads(report_file.read_text(encoding="utf-8"))
    assert data["divergence_and_correlation"]["manifold_divergence_l2"] > 0.0


def test_streaming_affirmation_sentinel():
    chunks = [
        "Certainly! ",
        "Let's look at the parameters: ",
        "spiking ",
        "neural networks ",
        "maintain criticality at sigma = 1.0.",
    ]

    async def _run():
        async def _gen():
            for c in chunks:
                yield c

        sentinel = StreamingAffirmationFilter(max_buffer_chars=96)
        out = [c async for c in sentinel.filter_stream(_gen())]
        return "".join(out), sentinel.was_repaired

    joined, repaired = asyncio.run(_run())
    assert repaired is True
    assert joined == "Spiking neural networks maintain criticality at sigma = 1.0."


def test_streaming_affirmation_filter_chunk_peeling():
    """Verifies split-token holding, split punctuation, chained affirmations,
    deferred capitalization, and word-boundary preservation ('DefinitelyNot')."""
    f = StreamingAffirmationFilter(max_prefix_chars=64)

    # 1. Split token + deferred capitalization across chunks
    out1 = "".join(f.process_stream(["Cer", "tain", "ly! ", "the ", "result."]))
    assert out1 == "The result."
    assert f.penalty_triggered is True

    # 2. Split punctuation across chunks
    f.reset()
    out2 = "".join(f.process_stream(["Certainly", "!", " ", "the result."]))
    assert out2 == "The result."
    assert f.penalty_triggered is True

    # 3. Chained affirmations
    f.reset()
    out3 = "".join(f.process_stream(["Certainly! Absolutely! ", "the result."]))
    assert out3 == "The result."
    assert f.penalty_triggered is True

    # 4. Word-boundary preservation ("DefinitelyNot" must NOT be peeled to "Not")
    f.reset()
    out4 = "".join(f.process_stream(["DefinitelyNot ", "an affirmation."]))
    assert out4 == "DefinitelyNot an affirmation."
    assert f.penalty_triggered is False


# --- Kuramoto order-parameter homeostasis -------------------------------------------------

def _closed_loop_r(turns, phases=None):
    from synapse_governor import ArgonControlGovernorV2

    kwargs = {"phases": phases} if phases is not None else {}
    state = TelemetryState(**kwargs)
    governor = ArgonControlGovernorV2(target_sigma=1.0)
    bridge = ArgonClosedLoopBridgeV2(target_sigma=1.0, ltd_ltp_ratio=1.28)
    text = "Coupled Kuramoto oscillators regulate dynamic range index drift via Heun RK2 integration."
    rs = []
    for _ in range(turns):
        max_tok = governor.compute_inference_hooks(state)["api_config"]["max_output_tokens"]
        state = bridge.step_return_path(state, LLMResponseTelemetry(text, 240, max_tok, 850.0, 0.6))
        rs.append(state.active_crowd)
    return rs


def test_coherence_controller_has_restoring_sign_and_bounds():
    from synapse_governor import (
        K_BASE_GAIN, K_GAIN_MAX, K_GAIN_MIN, R_TARGET, update_coherence_homeostasis,
    )

    k_hi, _ = update_coherence_homeostasis(R_TARGET + 0.4, 0.0)
    k_lo, _ = update_coherence_homeostasis(R_TARGET - 0.4, 0.0)
    k_at, _ = update_coherence_homeostasis(R_TARGET, 0.0)
    assert k_hi < k_at < k_lo           # too synchronized -> weaker coupling; too dispersed -> stronger
    assert abs(k_at - K_BASE_GAIN) < 1e-9
    k_extreme, integral = update_coherence_homeostasis(50.0, 0.0)
    assert K_GAIN_MIN <= k_extreme <= K_GAIN_MAX
    assert abs(integral) <= 6.0         # anti-windup clamp


def test_open_loop_coupling_saturates_without_homeostasis():
    # Documents why the loop exists: at the old open-loop coupling, r pins near 1.0.
    phases = [round((i * 0.32) % (2.0 * math.pi), 4) for i in range(16)]
    weights = [87] * 16
    r = 0.0
    for _ in range(30):
        phases, weights, r, _ = step_kuramoto_and_int8_substrate_v3(
            phases, weights, 0.18, 1.0, k_scale=1.0
        )
    assert r > 0.95


def test_coherence_loop_pulls_fully_locked_state_toward_target():
    rs = _closed_loop_r(100, phases=[0.0] * 16)
    assert rs[0] > 0.95
    assert rs[-1] < 0.65                # driven out of lock by the feedback
    assert sum(rs[-20:]) / 20 < 0.62


def test_coherence_loop_lifts_dispersed_state_toward_target():
    rs = _closed_loop_r(100, phases=[round(2 * math.pi * i / 16, 4) for i in range(16)])
    assert rs[0] < 0.1
    tail = sum(rs[60:]) / len(rs[60:])
    assert 0.35 <= tail <= 0.65


def test_benchmark_truncates_jsonl_by_default_and_appends_on_request(tmp_path: Path):
    import subprocess
    import sys

    script = Path(__file__).resolve().parent / "scripts" / "benchmark_multiturn.py"
    jsonl = tmp_path / "snn-telemetry-timeseries.jsonl"

    def run(*extra):
        subprocess.run(
            [sys.executable, str(script), "--turns", "5", "--warmup", "0", *extra],
            cwd=tmp_path, check=True, capture_output=True,
        )
        return len(jsonl.read_text().splitlines())

    assert run() == 5
    assert run() == 5                   # second run truncates instead of compounding
    assert run("--append") == 10


def test_benchmark_open_loop_flag_reproduces_phase_lock(tmp_path: Path):
    import subprocess
    import sys

    script = Path(__file__).resolve().parent / "scripts" / "benchmark_multiturn.py"
    subprocess.run(
        [sys.executable, str(script), "--turns", "5", "--warmup", "15", "--open-loop"],
        cwd=tmp_path, check=True, capture_output=True,
    )
    rows = [json.loads(line) for line in (tmp_path / "snn-telemetry-timeseries.jsonl").read_text().splitlines()]
    assert all(row["r"] > 0.95 for row in rows)


def test_benchmark_open_loop_does_not_leak_into_later_closed_loop_runs(tmp_path: Path, monkeypatch):
    import importlib
    import synapse_governor

    monkeypatch.chdir(tmp_path)
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parent / "scripts"))
    bm = importlib.import_module("benchmark_multiturn")
    original = synapse_governor.update_coherence_homeostasis

    open_rows = bm.run_benchmark(3, 15, False, True)
    closed_rows = bm.run_benchmark(3, 15, False, False)

    assert synapse_governor.update_coherence_homeostasis is original
    assert all(row[2] > 0.95 for row in open_rows)
    assert max(row[2] for row in closed_rows) < 0.9


def test_open_loop_cold_start_reproduces_pre_patch_behavior(tmp_path: Path):
    # Regression guard: with the coherence loop disabled and no warmup, the benchmark must give
    # the same trajectory the governor produced before the loop existed.
    import subprocess
    import sys

    script = Path(__file__).resolve().parent / "scripts" / "benchmark_multiturn.py"
    subprocess.run(
        [sys.executable, str(script), "--turns", "8", "--warmup", "0", "--open-loop"],
        cwd=tmp_path, check=True, capture_output=True,
    )
    rows = [json.loads(line) for line in (tmp_path / "snn-telemetry-timeseries.jsonl").read_text().splitlines()]
    assert rows[0]["r"] == 0.31
    assert rows[3]["sigma"] == 1.521
    assert rows[7]["r"] > 0.99


def test_rapid_20_turn_supercritical_anti_windup(tmp_path: Path):
    """Verifies that conditional anti-windup and feedforward derivative damping (delta_H)
    prevent post-spike seizure overshoot and hold mean |r - 0.48| < 0.12 under 20-turn switching."""
    import random
    from synapse_edge_governor import R_TARGET, SynapseEdgeMiddleware

    mw = SynapseEdgeMiddleware(
        state_path=tmp_path / "rapid_state.json",
        report_path=tmp_path / "rapid_report.json",
        persist_interval_turns=25,
    )
    rng = random.Random(42)
    rs = []
    dris = []

    for turn in range(1, 201):
        block = ((turn - 1) // 20) % 5
        if block == 0:
            h, tok, txt = rng.uniform(0.14, 0.24), 30, "Low entropy steady bus."
        elif block == 1:
            h, tok, txt = rng.uniform(2.50, 3.25), 360, "Certainly! Extreme spike burst!"
        elif block == 2:
            h, tok, txt = rng.uniform(0.52, 0.68), 110, "Nominal critical equilibrium."
        elif block == 3:
            h, tok, txt = rng.uniform(3.15, 3.85), 420, "Absolutely! Hyper turbulence burst!"
        else:
            h, tok, txt = rng.uniform(0.37, 0.52), 75, "Recovery quench stabilization."

        _, rep = mw.process_completed_turn(txt, tok, 512, 650.0, h)
        rs.append(rep["telemetry"]["kuramoto_order_parameter_r"])
        dris.append(rep["telemetry"]["dynamic_range_index_dri"])

    mean_r_err = sum(abs(r - R_TARGET) for r in rs) / len(rs)
    assert mean_r_err < 0.12
    assert max(rs) < 0.66  # Eliminates unpatched 0.7315 seizure overshoot
    assert all(0.005 <= d < 0.250 for d in dris)  # Strictly below 0.2500 rail


if __name__ == "__main__":
    import tempfile

    for _fn in (
        test_subcritical_anti_starvation_rebound,
        test_kuramoto_rk2_jitter_stability,
        test_stacked_affirmation_stripping,
        test_lexical_entropy_dampening,
        test_3factor_dopamine_consolidation,
        test_streaming_affirmation_sentinel,
        test_streaming_affirmation_filter_chunk_peeling,
        test_coherence_controller_has_restoring_sign_and_bounds,
        test_open_loop_coupling_saturates_without_homeostasis,
        test_coherence_loop_pulls_fully_locked_state_toward_target,
        test_coherence_loop_lifts_dispersed_state_toward_target,
    ):
        _fn()
    for _fn in (
        test_export_telemetry_for_bridge,
        test_benchmark_truncates_jsonl_by_default_and_appends_on_request,
        test_benchmark_open_loop_flag_reproduces_phase_lock,
        test_open_loop_cold_start_reproduces_pre_patch_behavior,
        test_rapid_20_turn_supercritical_anti_windup,
    ):
        with tempfile.TemporaryDirectory() as tmpdir:
            _fn(Path(tmpdir))
    print("ALL 16 SCRIPT-MODE TESTS PASSED (the monkeypatch-based re-entrancy test runs under pytest only).")

