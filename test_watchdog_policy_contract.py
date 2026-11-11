#!/usr/bin/env python3
"""Pytest suite for WatchdogApprovalBoundary and PreAuthorizedControlPolicy."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import json
from pathlib import Path
import re
import tempfile
from typing import List, Tuple

try:
    import pytest
except ImportError:
    class _PytestShim:
        @staticmethod
        @contextmanager
        def raises(exc_type, match=None):
            try:
                yield
            except exc_type as exc:
                if match and not re.search(match, str(exc)):
                    raise AssertionError(
                        f"Exception {exc!r} did not match {match!r}"
                    ) from exc
                return
            raise AssertionError(f"Expected {exc_type.__name__} to be raised")

    pytest = _PytestShim()

from watchdog_policy_contract import (
    ApprovalVerdict,
    ControlledStateSnapshot,
    MutationKind,
    PreAuthorizedControlPolicy,
    StateTransitionProposal,
    WatchdogApprovalBoundary,
)


class MockSignedSupervisorReviewer:
    """Test reviewer that approves structural changes only with a valid supervisor reason."""

    def review(
        self,
        proposal: StateTransitionProposal,
        active_policy: PreAuthorizedControlPolicy,
        pre_auth_violations: List[str],
    ) -> Tuple[bool, str]:
        if proposal.reason == "SIGNED_WARRANT_EQ_UPGRADE":
            return True, "SUPERVISOR_KEY_01"
        return False, "SUPERVISOR_DENIED"


def test_pre_authorized_nominal_turn_and_slew_rejection(tmp_path: Path) -> None:
    policy = PreAuthorizedControlPolicy()
    boundary = WatchdogApprovalBoundary(
        policy=policy, audit_log_path=tmp_path / "audit.jsonl"
    )
    s0 = ControlledStateSnapshot()

    # Within pre-authorized step and range envelope
    s1 = ControlledStateSnapshot(
        turn_count=1,
        sigma=1.02,
        order_parameter_r=0.472,
        k_gain=1.19,
        dri=0.163,
        simulated_power_mw=4.39,
        observed_latency_ms=540.0,
        token_budget_utilization=0.15,
        last_token_entropy=0.64,
    )
    d1 = boundary.evaluate_transition(
        StateTransitionProposal(
            kind=MutationKind.TURN_UPDATE, prior_state=s0, candidate_state=s1
        )
    )
    assert d1.verdict == ApprovalVerdict.PRE_AUTHORIZED
    assert d1.approved_state == s1

    # Slew violation: sigma jumps +0.30 (> 0.25 max_single_turn_sigma_step)
    s2_slew = ControlledStateSnapshot(turn_count=2, sigma=1.32)
    d2 = boundary.evaluate_transition(
        StateTransitionProposal(
            kind=MutationKind.TURN_UPDATE, prior_state=s1, candidate_state=s2_slew
        )
    )
    assert d2.verdict == ApprovalVerdict.REJECTED
    assert d2.approved_state == s1  # Prior state strictly preserved
    assert any("SIGMA_SLEW_EXCEEDED" in v for v in d2.violations)


def test_sub_5mw_simulated_power_ceiling_enforced(tmp_path: Path) -> None:
    boundary = WatchdogApprovalBoundary(
        policy=PreAuthorizedControlPolicy(simulated_power_ceiling_mw=5.00),
        audit_log_path=tmp_path / "audit.jsonl",
    )
    s0 = ControlledStateSnapshot()
    s1_over_power = ControlledStateSnapshot(turn_count=1, simulated_power_mw=5.18)

    decision = boundary.evaluate_transition(
        StateTransitionProposal(
            kind=MutationKind.TURN_UPDATE,
            prior_state=s0,
            candidate_state=s1_over_power,
        )
    )
    assert decision.verdict == ApprovalVerdict.REJECTED
    assert any("POWER_CEILING_VIOLATION" in v for v in decision.violations)


def test_reward_pulse_isolation_and_nan_inf_rejection(tmp_path: Path) -> None:
    boundary = WatchdogApprovalBoundary(
        policy=PreAuthorizedControlPolicy(),
        audit_log_path=tmp_path / "audit.jsonl",
    )
    s0 = ControlledStateSnapshot()

    # Reward pulse attempting to mutate k_gain alongside dopamine_trace is rejected
    s_illegal = ControlledStateSnapshot(dopamine_trace=0.20, k_gain=1.40)
    d_illegal = boundary.evaluate_transition(
        StateTransitionProposal(
            kind=MutationKind.REWARD_PULSE,
            prior_state=s0,
            candidate_state=s_illegal,
            raw_reward_input=0.40,
        )
    )
    assert d_illegal.verdict == ApprovalVerdict.REJECTED
    assert (
        "REWARD_PULSE_ILLEGAL_SIDE_EFFECT_ON_NON_DOPAMINE_STATE"
        in d_illegal.violations
    )

    # NaN or Inf in raw_reward_input or candidate state is rejected
    s_valid_dopamine = ControlledStateSnapshot(dopamine_trace=0.20)
    d_nan = boundary.evaluate_transition(
        StateTransitionProposal(
            kind=MutationKind.REWARD_PULSE,
            prior_state=s0,
            candidate_state=s_valid_dopamine,
            raw_reward_input=float("nan"),
        )
    )
    assert d_nan.verdict == ApprovalVerdict.REJECTED
    assert any("INVALID_REWARD_INPUT" in v for v in d_nan.violations)


def test_structural_mutations_require_external_watchdog_approval(tmp_path: Path) -> None:
    policy_v1 = PreAuthorizedControlPolicy(equation_version_id="phase_vector_v1")
    new_policy = PreAuthorizedControlPolicy(equation_version_id="scalar_surrogate_v3.2")
    s0 = ControlledStateSnapshot(equation_version_id="phase_vector_v1")
    s_swap = ControlledStateSnapshot(equation_version_id="scalar_surrogate_v3.2")

    # 1. Default fail-closed boundary blocks equation swap
    fail_closed_boundary = WatchdogApprovalBoundary(
        policy=policy_v1, audit_log_path=tmp_path / "audit_fc.jsonl"
    )
    d_denied = fail_closed_boundary.evaluate_transition(
        StateTransitionProposal(
            kind=MutationKind.EQUATION_SWAP,
            prior_state=s0,
            candidate_state=s_swap,
            proposed_policy=new_policy,
            reason="Attempted unreviewed surrogate replacement",
        )
    )
    assert d_denied.verdict == ApprovalVerdict.REJECTED
    assert fail_closed_boundary.policy.equation_version_id == "phase_vector_v1"

    # 2. Supervisor-backed boundary approves only with explicit warrant
    supervised_boundary = WatchdogApprovalBoundary(
        policy=policy_v1,
        audit_log_path=tmp_path / "audit_sup.jsonl",
        external_reviewer=MockSignedSupervisorReviewer(),
    )
    d_approved = supervised_boundary.evaluate_transition(
        StateTransitionProposal(
            kind=MutationKind.EQUATION_SWAP,
            prior_state=s0,
            candidate_state=s_swap,
            proposed_policy=new_policy,
            reason="SIGNED_WARRANT_EQ_UPGRADE",
        )
    )
    assert d_approved.verdict == ApprovalVerdict.WATCHDOG_APPROVED
    assert supervised_boundary.policy.equation_version_id == "scalar_surrogate_v3.2"


def test_multi_instance_atomic_persistence_and_corrupt_load_rejection(
    tmp_path: Path,
) -> None:
    state_file = tmp_path / "shared_state.json"
    audit_file = tmp_path / "shared_audit.jsonl"
    policy = PreAuthorizedControlPolicy()

    def worker(idx: int) -> bool:
        # Independent WatchdogApprovalBoundary instance per worker
        inst = WatchdogApprovalBoundary(policy=policy, audit_log_path=audit_file)
        snap = ControlledStateSnapshot(
            turn_count=idx + 1, sigma=round(0.95 + (idx % 10) * 0.01, 4)
        )
        dec = inst.persist_verified_state(
            state_file, snap, persist_interval_turns=10
        )
        loaded = inst.load_verified_state(state_file)
        return dec.accepted and (0.75 <= loaded.sigma <= 1.35)

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(worker, range(40)))
    assert all(results)

    # Corrupting {"sigma": "invalid"} raises TypeError immediately on load
    boundary = WatchdogApprovalBoundary(policy=policy, audit_log_path=audit_file)
    corrupt_payload = json.loads(state_file.read_text(encoding="utf-8"))
    corrupt_payload["state"]["sigma"] = "invalid"
    state_file.write_text(json.dumps(corrupt_payload), encoding="utf-8")

    with pytest.raises(TypeError, match="sigma must be a finite float/int"):
        boundary.load_verified_state(state_file)


if __name__ == "__main__":
    for _fn in (
        test_pre_authorized_nominal_turn_and_slew_rejection,
        test_sub_5mw_simulated_power_ceiling_enforced,
        test_reward_pulse_isolation_and_nan_inf_rejection,
        test_structural_mutations_require_external_watchdog_approval,
        test_multi_instance_atomic_persistence_and_corrupt_load_rejection,
    ):
        with tempfile.TemporaryDirectory() as _tmp:
            _fn(Path(_tmp))
    print("ALL 5 WATCHDOG POLICY CONTRACT TESTS PASSED.")
