#!/usr/bin/env python3
"""Comprehensive verification suite for SynapseEdge v2.6 Production Master Bundle."""

from pathlib import Path
import tempfile

from synapse_edge_v26_master_bundle import (
    ControlledStateSnapshot,
    DeterministicAerRingBuffer,
    IntrinsicThetaHomeostasisSimulator,
    PreAuthorizedControlPolicy,
    StreamingAffirmationFilter,
    WatchdogApprovalBoundary,
)


def test_v26_streaming_affirmation_filter() -> None:
    filt = StreamingAffirmationFilter()
    chunks = ["Certainly", "! ", "Absolutely! ", "the ", "Kuramoto manifold converges."]
    output = "".join(filt.filter_stream(chunks))
    assert filt.penalty_triggered is True
    assert output == "The Kuramoto manifold converges."

    # Word-boundary protection: "DefinitelyNot" must not be stripped
    filt.reset()
    out2 = "".join(filt.filter_stream(["DefinitelyNot ", "a filler token."]))
    assert filt.penalty_triggered is False
    assert out2 == "DefinitelyNot a filler token."


def test_v26_deterministic_aer_ring_buffer() -> None:
    ring = DeterministicAerRingBuffer(capacity_pow2=8)
    assert ring.enqueue(neuron_id=12, timestamp_us=1000, payload_int8=-45) is True
    assert ring.enqueue(neuron_id=19, timestamp_us=1080, payload_int8=64) is True
    assert ring.enqueue(neuron_id=23, timestamp_us=1250, payload_int8=15) is True
    assert ring.size == 3

    # Dequeue packets older than or equal to 150 us at current_us = 1260
    # Packet 1 (age 260 us) and Packet 2 (age 180 us) qualify; Packet 3 (age 10 us) remains
    burst = ring.dequeue_burst_zero_alloc(max_window_us=150, current_us=1260)
    assert len(burst) == 2
    assert int(burst[0, 0]) == 12
    assert int(burst[0, 1]) == 1000
    assert int(burst[0, 2]) == -45
    assert int(burst[1, 0]) == 19
    assert int(burst[1, 2]) == 64
    assert ring.size == 1


def test_v26_intrinsic_theta_homeostasis_10k_sop() -> None:
    sim = IntrinsicThetaHomeostasisSimulator()
    res = sim.simulate_sparse_scaling()
    assert res["sop_per_sec"] == 10508
    assert 4.00 <= res["power_mw"] <= 4.65
    assert res["theta_adapt_mv"] > -50.0
    assert res["dri"] == 0.034
    assert res["sigma"] == 1.000


def test_v26_watchdog_boundary_and_atomic_persistence() -> None:
    boundary = WatchdogApprovalBoundary()
    s0 = ControlledStateSnapshot(turn_count=0)
    s1 = ControlledStateSnapshot(
        turn_count=1,
        weight_mean_norm=0.6650,
        simulated_power_mw=4.030,
        aer_jitter_ms=0.104,
        sop_per_sec=10508,
    )
    ok, violations = boundary.evaluate_transition(s0, s1)
    assert ok is True
    assert violations == []

    # Reject excessive weight slew (> 0.025) and jitter (> 0.150 ms)
    s_bad = ControlledStateSnapshot(
        turn_count=2,
        weight_mean_norm=0.7100,
        simulated_power_mw=4.420,
        aer_jitter_ms=0.195,
    )
    ok_bad, violations_bad = boundary.evaluate_transition(s1, s_bad)
    assert ok_bad is False
    assert len(violations_bad) == 2

    with tempfile.TemporaryDirectory() as tmp_dir:
        state_path = Path(tmp_dir) / "v26_state.json"
        boundary.persist_atomic(state_path, s1)
        loaded = boundary.load_atomic(state_path)
        assert loaded.turn_count == 1
        assert loaded.sop_per_sec == 10508
        assert abs(loaded.weight_mean_norm - 0.6650) < 1e-6

        # Policy mismatch fails closed
        other_boundary = WatchdogApprovalBoundary(
            PreAuthorizedControlPolicy(equation_version_id="tampered_v0.0")
        )
        try:
            other_boundary.load_atomic(state_path, verify_policy_digest=True)
            raise AssertionError("Expected PermissionError on policy_digest mismatch")
        except PermissionError:
            pass


if __name__ == "__main__":
    test_v26_streaming_affirmation_filter()
    test_v26_deterministic_aer_ring_buffer()
    test_v26_intrinsic_theta_homeostasis_10k_sop()
    test_v26_watchdog_boundary_and_atomic_persistence()
    print("ALL 4 SYNAPSE_EDGE V2.6 MASTER BUNDLE TESTS PASSED.")
