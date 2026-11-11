#!/usr/bin/env python3
"""Watchdog Approval Boundary & Pre-Authorized Control Policy Contract.

Separates continuous, bounded homeostatic updates (pre-authorized within strict
step and range envelopes) from structural changes to control equations, bounds,
authority levels, or persistence rules (which require explicit external Watchdog
approval and fail closed by default).
"""

from dataclasses import asdict, dataclass, field
from enum import Enum
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Protocol, Tuple


class MutationKind(str, Enum):
    """Classifies state or configuration transitions by authority tier."""

    TURN_UPDATE = "TURN_UPDATE"
    REWARD_PULSE = "REWARD_PULSE"
    STATE_PERSIST = "STATE_PERSIST"
    POLICY_AMENDMENT = "POLICY_AMENDMENT"
    EQUATION_SWAP = "EQUATION_SWAP"
    MANUAL_OVERRIDE = "MANUAL_OVERRIDE"


class ApprovalVerdict(str, Enum):
    """Outcome of a Watchdog boundary evaluation."""

    PRE_AUTHORIZED = "PRE_AUTHORIZED"
    WATCHDOG_APPROVED = "WATCHDOG_APPROVED"
    REJECTED = "REJECTED"


def require_finite_float(
    name: str,
    val: Any,
    min_val: Optional[float] = None,
    max_val: Optional[float] = None,
) -> float:
    """Rejects bools, strings, NaN, and Inf; enforces optional numeric bounds."""
    if isinstance(val, bool) or not isinstance(val, (int, float)):
        raise TypeError(f"{name} must be a finite float/int, got {type(val).__name__}")
    fval = float(val)
    if not math.isfinite(fval):
        raise ValueError(f"{name} must be finite, got {val}")
    if min_val is not None and fval < min_val:
        raise ValueError(f"{name} ({fval}) below minimum allowed ({min_val})")
    if max_val is not None and fval > max_val:
        raise ValueError(f"{name} ({fval}) above maximum allowed ({max_val})")
    return fval


def require_non_negative_int(name: str, val: Any, min_val: int = 0) -> int:
    if isinstance(val, bool) or not isinstance(val, int):
        raise TypeError(f"{name} must be an int, got {type(val).__name__}")
    if val < min_val:
        raise ValueError(f"{name} ({val}) must be >= {min_val}")
    return val


def _require_finite(name: str, val: Any) -> float:
    return require_finite_float(name, val)


def _require_int(name: str, val: Any, min_val: int = 0) -> int:
    return require_non_negative_int(name, val, min_val=min_val)


@dataclass(frozen=True)
class PreAuthorizedControlPolicy:
    """Immutable contract defining the pre-authorized autonomous control envelope.

    Any transition that steps outside these bounds, alters `equation_version_id`,
    or modifies persistence rules cannot execute autonomously and is routed to
    the external Watchdog reviewer.
    """

    policy_id: str = "SYNAPSE_EDGE_POLICY_V1"
    equation_version_id: str = "phase_vector_v1"

    # Authority flags for autonomous closed-loop operation
    allow_autonomous_turn_update: bool = True
    allow_autonomous_reward_update: bool = True
    allow_autonomous_persistence: bool = True

    # Absolute state invariant rails
    sigma_bounds: Tuple[float, float] = (0.75, 1.35)
    r_bounds: Tuple[float, float] = (0.15, 0.85)
    k_gain_bounds: Tuple[float, float] = (0.60, 2.25)
    dri_bounds: Tuple[float, float] = (0.005, 0.250)
    weight_norm_bounds: Tuple[float, float] = (0.500, 0.850)
    dopamine_bounds: Tuple[float, float] = (0.01, 0.50)
    simulated_power_ceiling_mw: float = 5.00

    # Single-turn maximum rate-of-change (slew rate) limits
    max_single_turn_sigma_step: float = 0.25
    max_single_turn_r_step: float = 0.30
    max_single_turn_k_step: float = 0.85
    max_single_turn_dri_step: float = 0.06
    max_reward_magnitude: float = 1.00
    max_single_reward_dopamine_step: float = 0.25

    # Persistence cadence constraints
    min_persist_interval_turns: int = 1
    max_persist_interval_turns: int = 100

    def __post_init__(self) -> None:
        for name, bounds in [
            ("sigma_bounds", self.sigma_bounds),
            ("r_bounds", self.r_bounds),
            ("k_gain_bounds", self.k_gain_bounds),
            ("dri_bounds", self.dri_bounds),
            ("weight_norm_bounds", self.weight_norm_bounds),
            ("dopamine_bounds", self.dopamine_bounds),
        ]:
            low = _require_finite(f"{name}[0]", bounds[0])
            high = _require_finite(f"{name}[1]", bounds[1])
            if low >= high:
                raise ValueError(f"{name} lower bound ({low}) must be < upper ({high})")

        for step_name in [
            "simulated_power_ceiling_mw",
            "max_single_turn_sigma_step",
            "max_single_turn_r_step",
            "max_single_turn_k_step",
            "max_single_turn_dri_step",
            "max_reward_magnitude",
            "max_single_reward_dopamine_step",
        ]:
            val = _require_finite(step_name, getattr(self, step_name))
            if val <= 0.0:
                raise ValueError(f"{step_name} must be > 0.0, got {val}")

        low_p = _require_int(
            "min_persist_interval_turns", self.min_persist_interval_turns, 1
        )
        high_p = _require_int(
            "max_persist_interval_turns", self.max_persist_interval_turns, 1
        )
        if low_p > high_p:
            raise ValueError(
                "min_persist_interval_turns must be <= max_persist_interval_turns"
            )

    def policy_digest(self) -> str:
        """Computes a canonical SHA-256 fingerprint of the active policy contract."""
        canonical = json.dumps(asdict(self), sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@dataclass
class SurrogateGovernorState:
    """Validated state vector for the experimental scalar surrogate."""

    turn_count: int = 0
    sigma: float = 0.980
    surrogate_r: float = 0.480
    k_gain: float = 1.150
    dri: float = 0.1600
    simulated_power_mw: float = 4.32
    observed_latency_ms: float = 0.0
    derived_aer_latency_ms: float = 0.99
    derived_aer_jitter_ms: float = 0.46
    weight_mean_norm: float = 0.685
    ltd_ltp_ratio: float = 1.28
    dopamine_trace: float = 0.100
    last_token_entropy: float = 0.580
    k_saturated_turns: int = 0
    sigma_saturated_turns: int = 0
    dri_saturated_turns: int = 0
    watchdog_rejections: int = 0
    updated_at: float = field(default_factory=time.time)

    @classmethod
    def from_dict(cls, raw: Dict[str, Any]) -> "SurrogateGovernorState":
        if not isinstance(raw, dict):
            raise TypeError("State payload must be a JSON object")
        return cls(
            turn_count=require_non_negative_int("turn_count", raw.get("turn_count", 0)),
            sigma=require_finite_float("sigma", raw.get("sigma", 0.980), 0.75, 1.35),
            surrogate_r=require_finite_float(
                "surrogate_r", raw.get("surrogate_r", 0.480), 0.15, 0.85
            ),
            k_gain=require_finite_float("k_gain", raw.get("k_gain", 1.150), 0.60, 2.25),
            dri=require_finite_float("dri", raw.get("dri", 0.1600), 0.005, 0.250),
            simulated_power_mw=require_finite_float(
                "simulated_power_mw", raw.get("simulated_power_mw", 4.32), 0.0, 5.00
            ),
            observed_latency_ms=require_finite_float(
                "observed_latency_ms", raw.get("observed_latency_ms", 0.0), 0.0
            ),
            derived_aer_latency_ms=require_finite_float(
                "derived_aer_latency_ms", raw.get("derived_aer_latency_ms", 0.99), 0.0
            ),
            derived_aer_jitter_ms=require_finite_float(
                "derived_aer_jitter_ms", raw.get("derived_aer_jitter_ms", 0.46), 0.0
            ),
            weight_mean_norm=require_finite_float(
                "weight_mean_norm", raw.get("weight_mean_norm", 0.685), 0.500, 0.850
            ),
            ltd_ltp_ratio=require_finite_float(
                "ltd_ltp_ratio", raw.get("ltd_ltp_ratio", 1.28), 0.1, 5.0
            ),
            dopamine_trace=require_finite_float(
                "dopamine_trace", raw.get("dopamine_trace", 0.100), 0.01, 0.50
            ),
            last_token_entropy=require_finite_float(
                "last_token_entropy", raw.get("last_token_entropy", 0.580), 0.0
            ),
            k_saturated_turns=require_non_negative_int(
                "k_saturated_turns", raw.get("k_saturated_turns", 0)
            ),
            sigma_saturated_turns=require_non_negative_int(
                "sigma_saturated_turns", raw.get("sigma_saturated_turns", 0)
            ),
            dri_saturated_turns=require_non_negative_int(
                "dri_saturated_turns", raw.get("dri_saturated_turns", 0)
            ),
            watchdog_rejections=require_non_negative_int(
                "watchdog_rejections", raw.get("watchdog_rejections", 0)
            ),
            updated_at=require_finite_float(
                "updated_at", raw.get("updated_at", time.time()), 0.0
            ),
        )


@dataclass(frozen=True)
class ControlledStateSnapshot:
    """Immutable state snapshot for candidate transition verification.

    Uses honest signal prefixes (`simulated_`, `derived_`, `observed_`) to
    distinguish mathematical surrogates from runtime measurements.
    """

    turn_count: int = 0
    equation_version_id: str = "phase_vector_v1"
    sigma: float = 0.980
    order_parameter_r: float = 0.480
    k_gain: float = 1.150
    dri: float = 0.1600
    weight_mean_norm: float = 0.685
    dopamine_trace: float = 0.100
    simulated_power_mw: float = 4.32
    observed_latency_ms: float = 0.0
    token_budget_utilization: float = 0.0
    last_token_entropy: float = 0.580
    updated_at: float = field(default_factory=time.time)

    def validate_types(self) -> None:
        _require_int("turn_count", self.turn_count, 0)
        if not isinstance(self.equation_version_id, str) or not self.equation_version_id:
            raise TypeError("equation_version_id must be a non-empty string")
        for field_name in [
            "sigma",
            "order_parameter_r",
            "k_gain",
            "dri",
            "weight_mean_norm",
            "dopamine_trace",
            "simulated_power_mw",
            "observed_latency_ms",
            "token_budget_utilization",
            "last_token_entropy",
            "updated_at",
        ]:
            _require_finite(field_name, getattr(self, field_name))

    @classmethod
    def from_dict(cls, raw: Dict[str, Any]) -> "ControlledStateSnapshot":
        if not isinstance(raw, dict):
            raise TypeError("State payload must be a JSON object")
        allowed = set(cls.__dataclass_fields__.keys())
        unknown = set(raw.keys()) - allowed
        if unknown:
            raise ValueError(
                f"Unknown state fields in persisted payload: {sorted(unknown)}"
            )
        snap = cls(**{k: raw[k] for k in allowed if k in raw})
        snap.validate_types()
        return snap


@dataclass(frozen=True)
class StateTransitionProposal:
    """Proposed transition submitted by the controller to the Watchdog boundary."""

    kind: MutationKind
    prior_state: ControlledStateSnapshot
    candidate_state: ControlledStateSnapshot
    proposed_policy: Optional[PreAuthorizedControlPolicy] = None
    raw_reward_input: Optional[float] = None
    persist_interval_turns: int = 1
    reason: str = ""


@dataclass(frozen=True)
class WatchdogDecision:
    """Tamper-evident decision returned by the Watchdog boundary."""

    verdict: ApprovalVerdict
    kind: MutationKind
    approved_state: ControlledStateSnapshot
    active_policy_digest: str
    violations: Tuple[str, ...] = ()
    reviewer_id: str = "PRE_AUTH_ENVELOPE"
    timestamp: float = field(default_factory=time.time)

    @property
    def accepted(self) -> bool:
        return self.verdict in (
            ApprovalVerdict.PRE_AUTHORIZED,
            ApprovalVerdict.WATCHDOG_APPROVED,
        )


class ExternalWatchdogReviewer(Protocol):
    """Protocol for external human/supervisor approval of structural changes."""

    def review(
        self,
        proposal: StateTransitionProposal,
        active_policy: PreAuthorizedControlPolicy,
        pre_auth_violations: List[str],
    ) -> Tuple[bool, str]:
        """Returns (approved, reviewer_id_or_reason)."""
        ...


class FailClosedWatchdogReviewer:
    """Default reviewer that denies all out-of-envelope or structural mutations."""

    def review(
        self,
        proposal: StateTransitionProposal,
        active_policy: PreAuthorizedControlPolicy,
        pre_auth_violations: List[str],
    ) -> Tuple[bool, str]:
        return False, "FAIL_CLOSED_DEFAULT_DENY"


class WatchdogApprovalBoundary:
    """Enforces the PreAuthorizedControlPolicy and gates state persistence."""

    def __init__(
        self,
        policy: PreAuthorizedControlPolicy,
        audit_log_path: Path,
        external_reviewer: Optional[ExternalWatchdogReviewer] = None,
    ) -> None:
        self._lock = threading.RLock()
        self._policy = policy
        self.audit_log_path = Path(audit_log_path)
        self._reviewer: ExternalWatchdogReviewer = (
            external_reviewer or FailClosedWatchdogReviewer()
        )

    @property
    def policy(self) -> PreAuthorizedControlPolicy:
        with self._lock:
            return self._policy

    def _check_invariant_bounds(
        self, s: ControlledStateSnapshot, p: PreAuthorizedControlPolicy
    ) -> List[str]:
        violations: List[str] = []
        try:
            s.validate_types()
        except (TypeError, ValueError) as exc:
            return [f"TYPE_OR_FINITE_ERROR: {exc}"]

        if s.equation_version_id != p.equation_version_id:
            violations.append(
                f"EQUATION_MISMATCH: candidate '{s.equation_version_id}' != "
                f"policy '{p.equation_version_id}'"
            )

        checks = [
            ("sigma", s.sigma, p.sigma_bounds),
            ("order_parameter_r", s.order_parameter_r, p.r_bounds),
            ("k_gain", s.k_gain, p.k_gain_bounds),
            ("dri", s.dri, p.dri_bounds),
            ("weight_mean_norm", s.weight_mean_norm, p.weight_norm_bounds),
            ("dopamine_trace", s.dopamine_trace, p.dopamine_bounds),
        ]
        for name, val, (low, high) in checks:
            if not (low <= val <= high):
                violations.append(
                    f"BOUND_VIOLATION: {name}={val} outside [{low}, {high}]"
                )

        if not (0.0 <= s.simulated_power_mw <= p.simulated_power_ceiling_mw):
            violations.append(
                f"POWER_CEILING_VIOLATION: simulated_power_mw={s.simulated_power_mw} "
                f"exceeds ceiling {p.simulated_power_ceiling_mw} mW"
            )
        if s.observed_latency_ms < 0.0:
            violations.append(f"NEGATIVE_LATENCY: {s.observed_latency_ms}")
        if s.token_budget_utilization < 0.0:
            violations.append(
                f"NEGATIVE_TOKEN_UTILIZATION: {s.token_budget_utilization}"
            )
        if s.last_token_entropy <= 0.0:
            violations.append(f"NON_POSITIVE_ENTROPY: {s.last_token_entropy}")

        return violations

    def evaluate_transition(
        self, proposal: StateTransitionProposal
    ) -> WatchdogDecision:
        """Evaluates a candidate transition against pre-authorized bounds or escalates."""
        with self._lock:
            p = self._policy
            prior = proposal.prior_state
            cand = proposal.candidate_state
            violations: List[str] = []

            # Structural mutations are NEVER pre-authorized; always require external Watchdog review
            if proposal.kind in (
                MutationKind.POLICY_AMENDMENT,
                MutationKind.EQUATION_SWAP,
                MutationKind.MANUAL_OVERRIDE,
            ):
                violations.append(
                    f"STRUCTURAL_MUTATION_REQUIRES_WATCHDOG: {proposal.kind.value}"
                )
                violations.extend(
                    self._check_invariant_bounds(cand, proposal.proposed_policy or p)
                )
                approved, reviewer_tag = self._reviewer.review(proposal, p, violations)
                if approved:
                    if proposal.proposed_policy is not None:
                        self._policy = proposal.proposed_policy
                    decision = WatchdogDecision(
                        verdict=ApprovalVerdict.WATCHDOG_APPROVED,
                        kind=proposal.kind,
                        approved_state=cand,
                        active_policy_digest=self._policy.policy_digest(),
                        violations=tuple(violations),
                        reviewer_id=reviewer_tag,
                    )
                else:
                    decision = WatchdogDecision(
                        verdict=ApprovalVerdict.REJECTED,
                        kind=proposal.kind,
                        approved_state=prior,
                        active_policy_digest=p.policy_digest(),
                        violations=tuple(violations),
                        reviewer_id=reviewer_tag,
                    )
                self._append_audit_log(proposal, decision)
                return decision

            # Validate candidate state bounds
            violations.extend(self._check_invariant_bounds(cand, p))

            if proposal.kind == MutationKind.TURN_UPDATE:
                if not p.allow_autonomous_turn_update:
                    violations.append("AUTONOMOUS_TURN_UPDATE_DISABLED")
                if cand.turn_count != prior.turn_count + 1:
                    violations.append(
                        f"NON_MONOTONIC_TURN: {prior.turn_count} -> {cand.turn_count}"
                    )
                if abs(cand.sigma - prior.sigma) > p.max_single_turn_sigma_step + 1e-9:
                    violations.append(
                        f"SIGMA_SLEW_EXCEEDED: |{cand.sigma - prior.sigma:.4f}| > "
                        f"{p.max_single_turn_sigma_step}"
                    )
                if (
                    abs(cand.order_parameter_r - prior.order_parameter_r)
                    > p.max_single_turn_r_step + 1e-9
                ):
                    violations.append(
                        f"R_SLEW_EXCEEDED: |{cand.order_parameter_r - prior.order_parameter_r:.4f}| > "
                        f"{p.max_single_turn_r_step}"
                    )
                if abs(cand.k_gain - prior.k_gain) > p.max_single_turn_k_step + 1e-9:
                    violations.append(
                        f"K_GAIN_SLEW_EXCEEDED: |{cand.k_gain - prior.k_gain:.4f}| > "
                        f"{p.max_single_turn_k_step}"
                    )
                if abs(cand.dri - prior.dri) > p.max_single_turn_dri_step + 1e-9:
                    violations.append(
                        f"DRI_SLEW_EXCEEDED: |{cand.dri - prior.dri:.4f}| > "
                        f"{p.max_single_turn_dri_step}"
                    )

            elif proposal.kind == MutationKind.REWARD_PULSE:
                if not p.allow_autonomous_reward_update:
                    violations.append("AUTONOMOUS_REWARD_UPDATE_DISABLED")
                if proposal.raw_reward_input is None:
                    violations.append("MISSING_RAW_REWARD_INPUT")
                else:
                    try:
                        r_in = _require_finite(
                            "raw_reward_input", proposal.raw_reward_input
                        )
                        if abs(r_in) > p.max_reward_magnitude + 1e-9:
                            violations.append(
                                f"REWARD_MAGNITUDE_EXCEEDED: |{r_in}| > {p.max_reward_magnitude}"
                            )
                    except (TypeError, ValueError) as exc:
                        violations.append(f"INVALID_REWARD_INPUT: {exc}")

                # Reward pulse may ONLY modify dopamine_trace and updated_at
                if (
                    cand.turn_count != prior.turn_count
                    or cand.sigma != prior.sigma
                    or cand.order_parameter_r != prior.order_parameter_r
                    or cand.k_gain != prior.k_gain
                    or cand.dri != prior.dri
                    or cand.weight_mean_norm != prior.weight_mean_norm
                ):
                    violations.append(
                        "REWARD_PULSE_ILLEGAL_SIDE_EFFECT_ON_NON_DOPAMINE_STATE"
                    )

                if (
                    abs(cand.dopamine_trace - prior.dopamine_trace)
                    > p.max_single_reward_dopamine_step + 1e-9
                ):
                    violations.append(
                        f"DOPAMINE_SLEW_EXCEEDED: "
                        f"|{cand.dopamine_trace - prior.dopamine_trace:.4f}| > "
                        f"{p.max_single_reward_dopamine_step}"
                    )

            elif proposal.kind == MutationKind.STATE_PERSIST:
                if not p.allow_autonomous_persistence:
                    violations.append("AUTONOMOUS_PERSISTENCE_DISABLED")
                if not (
                    p.min_persist_interval_turns
                    <= proposal.persist_interval_turns
                    <= p.max_persist_interval_turns
                ):
                    violations.append(
                        f"PERSIST_INTERVAL_OUT_OF_POLICY: {proposal.persist_interval_turns}"
                    )

            if not violations:
                decision = WatchdogDecision(
                    verdict=ApprovalVerdict.PRE_AUTHORIZED,
                    kind=proposal.kind,
                    approved_state=cand,
                    active_policy_digest=p.policy_digest(),
                    violations=(),
                    reviewer_id="PRE_AUTH_ENVELOPE",
                )
            else:
                approved, reviewer_tag = self._reviewer.review(proposal, p, violations)
                decision = WatchdogDecision(
                    verdict=(
                        ApprovalVerdict.WATCHDOG_APPROVED
                        if approved
                        else ApprovalVerdict.REJECTED
                    ),
                    kind=proposal.kind,
                    approved_state=cand if approved else prior,
                    active_policy_digest=p.policy_digest(),
                    violations=tuple(violations),
                    reviewer_id=reviewer_tag,
                )

            self._append_audit_log(proposal, decision)
            return decision

    def persist_verified_state(
        self,
        state_path: Path,
        state: ControlledStateSnapshot,
        persist_interval_turns: int = 1,
    ) -> WatchdogDecision:
        """Gates disk persistence through the policy contract with flock + unique atomic rename."""
        proposal = StateTransitionProposal(
            kind=MutationKind.STATE_PERSIST,
            prior_state=state,
            candidate_state=state,
            persist_interval_turns=persist_interval_turns,
            reason="Scheduled state persistence",
        )
        decision = self.evaluate_transition(proposal)
        if not decision.accepted:
            return decision

        target = Path(state_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        lock_path = target.with_suffix(target.suffix + ".lock")

        payload = {
            "policy_digest": self._policy.policy_digest(),
            "verdict": decision.verdict.value,
            "state": asdict(decision.approved_state),
        }

        with self._lock, open(lock_path, "a+", encoding="utf-8") as lock_file:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                tmp_name: Optional[str] = None
                try:
                    with tempfile.NamedTemporaryFile(
                        mode="w",
                        encoding="utf-8",
                        dir=str(target.parent),
                        prefix=f".{target.name}.",
                        suffix=".tmp",
                        delete=False,
                    ) as tmp_file:
                        tmp_name = tmp_file.name
                        json.dump(payload, tmp_file, indent=2, sort_keys=True)
                        tmp_file.flush()
                        os.fsync(tmp_file.fileno())
                    os.replace(tmp_name, target)
                except Exception:
                    if tmp_name and os.path.exists(tmp_name):
                        os.unlink(tmp_name)
                    raise
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

        return decision

    def load_verified_state(self, state_path: Path) -> ControlledStateSnapshot:
        """Loads and cryptographically/schema-validates persisted state under shared flock."""
        target = Path(state_path)
        if not target.exists():
            return ControlledStateSnapshot(
                equation_version_id=self._policy.equation_version_id
            )

        lock_path = target.with_suffix(target.suffix + ".lock")
        with self._lock, open(lock_path, "a+", encoding="utf-8") as lock_file:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_SH)
            try:
                raw_envelope = json.loads(target.read_text(encoding="utf-8"))
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

        if not isinstance(raw_envelope, dict) or "state" not in raw_envelope:
            raise ValueError("Persisted file missing required 'state' envelope")

        expected_digest = self._policy.policy_digest()
        stored_digest = raw_envelope.get("policy_digest")
        if stored_digest != expected_digest:
            raise ValueError(
                f"Policy digest mismatch on load: stored={stored_digest} != "
                f"active={expected_digest}"
            )

        snap = ControlledStateSnapshot.from_dict(raw_envelope["state"])
        violations = self._check_invariant_bounds(snap, self._policy)
        if violations:
            raise ValueError(
                f"Loaded state violates active policy bounds: {violations}"
            )
        return snap

    def _append_audit_log(
        self, proposal: StateTransitionProposal, decision: WatchdogDecision
    ) -> None:
        self.audit_log_path.parent.mkdir(parents=True, exist_ok=True)
        lock_path = self.audit_log_path.with_suffix(self.audit_log_path.suffix + ".lock")
        entry = {
            "timestamp": decision.timestamp,
            "kind": proposal.kind.value,
            "verdict": decision.verdict.value,
            "accepted": decision.accepted,
            "reviewer_id": decision.reviewer_id,
            "policy_digest": decision.active_policy_digest,
            "prior_turn": proposal.prior_state.turn_count,
            "candidate_turn": proposal.candidate_state.turn_count,
            "violations": list(decision.violations),
            "reason": proposal.reason,
        }
        with open(lock_path, "a+", encoding="utf-8") as lock_file:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                with open(self.audit_log_path, "a", encoding="utf-8") as f:
                    f.write(json.dumps(entry, sort_keys=True) + "\n")
                    f.flush()
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
