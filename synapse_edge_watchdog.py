#!/usr/bin/env python3
"""
synapse_edge_watchdog.py
Unified Kuramoto Homeostatic Governor (R_TARGET = 0.48) + Epistemic Watchdog
for Gemini 3.1 Pro scientific reasoning loops.
"""

from __future__ import annotations

import cmath
import hashlib
import hmac
import json
import math
import os
import re
import secrets
import tempfile
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


R_TARGET = 0.48
R_TOLERANCE = 0.06


@dataclass
class ReasoningTelemetry:
    steering_mode_honored: str
    claim_status: str  # "VERIFIED" | "HYPOTHESIS"
    core_mechanism: str
    invariants_checked: list[str]
    hidden_assumptions: list[str]
    falsification_test: str
    ready_for_ledger_commit: bool


@dataclass
class AuditReceipt:
    timestamp_ms: int
    merkle_leaf_hex: str
    hmac_sha256_hex: str
    order_parameter_r: float
    coupling_k: float
    steering_directive: str
    committed: bool
    quarantine_reason: str | None = None


class KuramotoGovernor:
    """
    Regulates reasoning exploration vs. convergence around R_TARGET = 0.48:
        R * exp(i * psi) = (1 / N) * sum_j exp(i * theta_j)
    """

    def __init__(
        self,
        n_oscillators: int = 16,
        r_target: float = R_TARGET,
        gain: float = 0.35,
        k_init: float = 1.10,
    ) -> None:
        self.n = n_oscillators
        self.r_target = r_target
        self.gain = gain
        self.k = k_init
        # Deterministic spread of natural frequencies across cognitive modes
        self.omega = [
            -0.5 + (i / max(1, n_oscillators - 1)) for i in range(n_oscillators)
        ]
        # Initial phases seeded near critical balance
        self.theta = [
            (2.0 * math.pi * i / n_oscillators) * 0.72 for i in range(n_oscillators)
        ]

    def order_parameter(self) -> tuple[float, float]:
        z = sum(cmath.exp(1j * t) for t in self.theta) / self.n
        return abs(z), cmath.phase(z)

    def step(self, novelty_shock: float = 0.0, dt: float = 0.1) -> dict[str, Any]:
        r_curr, psi = self.order_parameter()
        error = self.r_target - r_curr

        # Adapt coupling K to restore homeostatic R_TARGET = 0.48
        self.k = max(0.05, min(4.0, self.k + self.gain * error))

        next_theta: list[float] = []
        for idx, (th, om) in enumerate(zip(self.theta, self.omega)):
            perturbation = novelty_shock * math.sin(idx + 1.0)
            dtheta = om + self.k * r_curr * math.sin(psi - th) + perturbation
            next_theta.append((th + dtheta * dt) % (2.0 * math.pi))
        self.theta = next_theta

        r_new, _ = self.order_parameter()
        if r_new > self.r_target + R_TOLERANCE:
            directive = "DIVERGE_EXPLORE"
        elif r_new < self.r_target - R_TOLERANCE:
            directive = "CONVERGE_SYNTHESIZE"
        else:
            directive = "CRITICAL_BALANCE"

        return {
            "order_parameter_r": round(r_new, 6),
            "r_target": self.r_target,
            "coupling_k": round(self.k, 6),
            "steering_directive": directive,
        }


class EpistemicWatchdog:
    """
    Gates Gemini 3.1 Pro reasoning outputs:
    1. Extracts and validates structured telemetry.
    2. Quarantines unverified/unfalsifiable outputs to scratchpad storage.
    3. Commits verified derivations to an atomic, HMAC-signed ledger.
    """

    def __init__(self, state_dir: Path, signing_key: bytes) -> None:
        self.state_dir = state_dir
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.ledger_path = self.state_dir / "silver_committed_ledger.jsonl"
        self.scratchpad_path = self.state_dir / "silver_scratchpad_quarantine.jsonl"
        self.signing_key = signing_key
        self.governor = KuramotoGovernor()

    @staticmethod
    def extract_telemetry(raw_model_output: str) -> ReasoningTelemetry:
        blocks = re.findall(r"```json\s*(.*?)\s*```", raw_model_output, flags=re.DOTALL)
        if not blocks:
            raise ValueError("Missing mandatory ```json telemetry block in model output.")
        data = json.loads(blocks[-1])
        return ReasoningTelemetry(
            steering_mode_honored=str(data.get("steering_mode_honored", "UNKNOWN")),
            claim_status=str(data.get("claim_status", "HYPOTHESIS")).upper(),
            core_mechanism=str(data.get("core_mechanism", "")).strip(),
            invariants_checked=list(data.get("invariants_checked", [])),
            hidden_assumptions=list(data.get("hidden_assumptions", [])),
            falsification_test=str(data.get("falsification_test", "")).strip(),
            ready_for_ledger_commit=bool(data.get("ready_for_ledger_commit", False)),
        )

    def _sign_record(self, raw_bytes: bytes) -> tuple[str, str]:
        # Matches telemetryGate.ts: SHA-256("leaf:" || rawBody) + HMAC-SHA256
        merkle_leaf = hashlib.sha256(b"leaf:" + raw_bytes).hexdigest()
        mac = hmac.new(self.signing_key, raw_bytes, hashlib.sha256).hexdigest()
        return merkle_leaf, mac

    @staticmethod
    def _atomic_append_jsonl(target_path: Path, record: dict[str, Any]) -> None:
        existing = target_path.read_text(encoding="utf-8") if target_path.exists() else ""
        updated = existing + json.dumps(record, separators=(",", ":")) + "\n"
        with tempfile.NamedTemporaryFile(
            "w", dir=target_path.parent, delete=False, encoding="utf-8"
        ) as tmp:
            tmp.write(updated)
            tmp_path = Path(tmp.name)
        os.replace(tmp_path, target_path)

    def evaluate_and_route(self, prompt_id: str, raw_model_output: str) -> AuditReceipt:
        telemetry = self.extract_telemetry(raw_model_output)

        # Apply novelty shock if output is purely speculative hypothesis
        novelty = 0.25 if telemetry.claim_status == "HYPOTHESIS" else -0.10
        gov_state = self.governor.step(novelty_shock=novelty)

        # Epistemic gate checks
        quarantine_reason: str | None = None
        if not telemetry.core_mechanism:
            quarantine_reason = "Empty core_mechanism."
        elif len(telemetry.falsification_test) < 15:
            quarantine_reason = "Missing concrete falsification_test."
        elif not telemetry.invariants_checked:
            quarantine_reason = "No physical/mathematical invariants verified."
        elif telemetry.claim_status != "VERIFIED" or not telemetry.ready_for_ledger_commit:
            quarantine_reason = f"Status is {telemetry.claim_status}; isolated in scratchpad."

        committed = quarantine_reason is None
        ts_ms = int(time.time() * 1000)

        envelope = {
            "prompt_id": prompt_id,
            "timestamp_ms": ts_ms,
            "governor": gov_state,
            "telemetry": asdict(telemetry),
            "committed": committed,
            "quarantine_reason": quarantine_reason,
        }
        raw_envelope = json.dumps(envelope, sort_keys=True, separators=(",", ":")).encode("utf-8")
        leaf_hex, mac_hex = self._sign_record(raw_envelope)

        signed_record = {
            "envelope": envelope,
            "merkle_leaf": leaf_hex,
            "hmac_sha256": mac_hex,
        }

        destination = self.ledger_path if committed else self.scratchpad_path
        self._atomic_append_jsonl(destination, signed_record)

        return AuditReceipt(
            timestamp_ms=ts_ms,
            merkle_leaf_hex=leaf_hex,
            hmac_sha256_hex=mac_hex,
            order_parameter_r=gov_state["order_parameter_r"],
            coupling_k=gov_state["coupling_k"],
            steering_directive=gov_state["steering_directive"],
            committed=committed,
            quarantine_reason=quarantine_reason,
        )


if __name__ == "__main__":
    # Quick smoke test verifying Watchdog gating + Kuramoto homeostasis
    key = os.environ.get("SYNAPSE_HMAC_KEY", "").encode("utf-8") or secrets.token_bytes(32)
    wd = EpistemicWatchdog(state_dir=Path("./.silver_state"), signing_key=key)

    sample_response = """
    ### Mechanistic Derivation
    To prevent runaway excitatory gain in a sparse cortical router without external clock sync,
    local inhibitory conductance must scale proportionally to the rolling branching ratio sigma.

    ```json
    {
      "steering_mode_honored": "CRITICAL_BALANCE",
      "claim_status": "VERIFIED",
      "core_mechanism": "Proportional inhibitory conductance feedback clamps branching ratio sigma -> 1.0 under asynchronous spike arrival.",
      "invariants_checked": ["Lyapunov stability dV/dt <= 0", "Dimensionless branching ratio invariance"],
      "hidden_assumptions": ["Bounded synaptic transmission delay tau < 5ms"],
      "falsification_test": "Sweep tau from 1ms to 20ms in synapse_stdp.hpp benchmark; if R diverges > 0.75 before tau=5ms, hypothesis fails.",
      "ready_for_ledger_commit": true
    }
    ```
    """
    receipt = wd.evaluate_and_route("smoke-test-001", sample_response)
    print(json.dumps(asdict(receipt), indent=2))
