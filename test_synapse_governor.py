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


if __name__ == "__main__":
    import tempfile
    test_subcritical_anti_starvation_rebound()
    test_kuramoto_rk2_jitter_stability()
    test_stacked_affirmation_stripping()
    test_lexical_entropy_dampening()
    test_3factor_dopamine_consolidation()
    with tempfile.TemporaryDirectory() as tmpdir:
        test_export_telemetry_for_bridge(Path(tmpdir))
    test_streaming_affirmation_sentinel()
    print("ALL 7 V3 MASTER INVARIANT TESTS PASSED.")
