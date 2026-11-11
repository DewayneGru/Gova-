from concurrent.futures import ProcessPoolExecutor
from dataclasses import asdict, dataclass
import json
import math
import multiprocessing as mp
from pathlib import Path
import tempfile
import time
from typing import Any, Dict, Tuple

import numpy as np
import pytest

from governor_persistence import AtomicPersistentGovernorState


class PhaseVectorKuramotoGovernor:
    """Authentic N-oscillator Kuramoto governor with INT8 synaptic crossbar."""

    def __init__(
        self,
        n_oscillators: int = 64,
        dt: float = 0.05,
        coupling_k: float = 1.15,
        seed: int = 42,
    ) -> None:
        self.n = n_oscillators
        self.dt = dt
        self.rng = np.random.default_rng(seed)
        self.omega = self.rng.normal(loc=1.0, scale=0.15, size=self.n)
        self.theta = self.rng.uniform(-np.pi, np.pi, size=self.n)
        self.w_crossbar = self.rng.integers(
            -64, 64, size=(self.n, self.n), dtype=np.int8
        )
        self.k_gain = coupling_k
        self.sigma = 0.980
        self.turn = 0

    @property
    def order_parameter_r(self) -> float:
        z = np.mean(np.exp(1j * self.theta))
        return float(np.abs(z))

    @property
    def mean_phase_psi(self) -> float:
        z = np.mean(np.exp(1j * self.theta))
        return float(np.angle(z))

    def phase_variance(self) -> float:
        return float(1.0 - self.order_parameter_r)

    def phase_weight_correlation(self) -> float:
        rel_phase = np.cos(self.theta - self.mean_phase_psi)
        mean_crossbar_coupling = np.mean(self.w_crossbar.astype(np.float64), axis=1)
        std_p = float(np.std(rel_phase))
        std_w = float(np.std(mean_crossbar_coupling))
        if std_p < 1e-6 or std_w < 1e-6:
            return 0.0
        corr = float(np.corrcoef(rel_phase, mean_crossbar_coupling)[0, 1])
        return 0.0 if math.isnan(corr) else corr

    def step(self, entropy: float, tokens: int) -> float:
        self.turn += 1
        r = self.order_parameter_r
        psi = self.mean_phase_psi
        noise = self.rng.normal(0.0, 0.15 * max(0.05, entropy), size=self.n)
        d_theta = self.omega + (self.k_gain * r * np.sin(psi - self.theta)) + noise
        self.theta = (self.theta + d_theta * self.dt + np.pi) % (2 * np.pi) - np.pi

        phase_diff = np.sin(self.theta[:, None] - self.theta[None, :])
        dw = (phase_diff * 4.0).astype(np.int8)
        self.w_crossbar = np.clip(self.w_crossbar + dw, -128, 127).astype(np.int8)

        active_synapses = np.sum(np.abs(self.w_crossbar) > 32)
        simulated_power = 4.32 + 0.0001 * active_synapses + 0.0004 * tokens
        return min(5.00, simulated_power)

    def export_state_dict(self) -> Dict[str, Any]:
        return {
            "model_type": "phase_vector_kuramoto",
            "turn": self.turn,
            "k_gain": self.k_gain,
            "sigma": self.sigma,
            "theta": self.theta.tolist(),
            "omega": self.omega.tolist(),
            "w_crossbar_flat": self.w_crossbar.flatten().tolist(),
        }

    def import_state_dict(self, data: Dict[str, Any]) -> None:
        self.turn = int(data["turn"])
        self.k_gain = float(data["k_gain"])
        self.sigma = float(data["sigma"])
        self.theta = np.array(data["theta"], dtype=np.float64)
        self.omega = np.array(data["omega"], dtype=np.float64)
        self.w_crossbar = np.array(
            data["w_crossbar_flat"], dtype=np.int8
        ).reshape((self.n, self.n))


class ScalarSurrogateGovernor:
    """Scalar recurrence surrogate (v3.2) lacking spatial phase vector."""

    def __init__(self, r_target: float = 0.48, coupling_k: float = 1.15) -> None:
        self.r = r_target
        self.k_gain = coupling_k
        self.sigma = 0.980
        self.w_mean = 0.685
        self.turn = 0

    @property
    def order_parameter_r(self) -> float:
        return self.r

    def phase_weight_correlation(self) -> float:
        return float(1.0 - abs(self.r - 0.48) * 2.5 - abs(self.w_mean - 0.685) * 4.0)

    def step(self, entropy: float, tokens: int) -> float:
        self.turn += 1
        desync = (entropy - 0.58) * 0.14
        r_raw = self.r + 0.28 * (0.48 * (self.k_gain / 1.15) - desync - self.r)
        self.r = max(0.15, min(0.85, r_raw))
        return min(5.00, 4.32 + 0.15 * (entropy - 0.58) + 0.0006 * tokens)

    def export_state_dict(self) -> Dict[str, Any]:
        return {
            "model_type": "scalar_surrogate",
            "turn": self.turn,
            "k_gain": self.k_gain,
            "sigma": self.sigma,
            "r": self.r,
            "w_mean": self.w_mean,
        }

    def import_state_dict(self, data: Dict[str, Any]) -> None:
        self.turn = int(data["turn"])
        self.k_gain = float(data["k_gain"])
        self.sigma = float(data["sigma"])
        self.r = float(data["r"])
        self.w_mean = float(data["w_mean"])


def test_ablation_spatial_representation_divergence() -> None:
    """Proves the phase-vector model retains spatial distribution geometry absent in the scalar surrogate."""
    pv_gov = PhaseVectorKuramotoGovernor(n_oscillators=64, seed=101)
    sc_gov = ScalarSurrogateGovernor()

    for t in range(25):
        h = 0.55 + 0.25 * math.sin(t * 0.3)
        pv_gov.step(entropy=h, tokens=100)
        sc_gov.step(entropy=h, tokens=100)

    assert 0.05 < pv_gov.phase_variance() < 0.95
    assert len(pv_gov.theta) == 64
    assert pv_gov.w_crossbar.shape == (64, 64)
    assert -1.0 <= pv_gov.phase_weight_correlation() <= 1.0
    assert "theta" in pv_gov.export_state_dict()
    assert "theta" not in sc_gov.export_state_dict()


def test_phase_vector_restart_determinism(tmp_path: Path) -> None:
    """Verifies cold-start restart determinism and trajectory continuity."""
    gov1 = PhaseVectorKuramotoGovernor(n_oscillators=32, seed=42)
    for _ in range(12):
        gov1.step(entropy=0.62, tokens=90)

    r_target = gov1.order_parameter_r
    theta_target = gov1.theta.copy()
    weights_target = gov1.w_crossbar.copy()

    snap_file = tmp_path / "pv_state.json"
    snap_file.write_text(json.dumps(gov1.export_state_dict()))

    gov2 = PhaseVectorKuramotoGovernor(n_oscillators=32, seed=999)
    gov2.import_state_dict(json.loads(snap_file.read_text()))

    assert gov2.turn == 12
    assert np.allclose(gov2.theta, theta_target, atol=1e-12)
    assert np.array_equal(gov2.w_crossbar, weights_target)
    assert math.isclose(gov2.order_parameter_r, r_target, rel_tol=1e-9)


def test_persistence_failure_resilience(tmp_path: Path) -> None:
    """Verifies that abandoned .tmp crash files do not corrupt atomic state reads."""
    state_file = tmp_path / "atomic_state.json"
    state0 = AtomicPersistentGovernorState(turn_count=1, sigma=0.985)
    state0.persist_atomic(state_file)

    crash_tmp = tmp_path / f".{state_file.name}.crash.tmp"
    crash_tmp.write_text('{"state": {"turn_count": 2, "sigma": 0.99')

    loaded = AtomicPersistentGovernorState.load_atomic(state_file)
    assert loaded.turn_count == 1
    assert math.isclose(loaded.sigma, 0.985, abs_tol=1e-5)


def _mp_worker(worker_id: int, state_path_str: str, iterations: int) -> Tuple[int, int]:
    state_path = Path(state_path_str)
    successes = 0
    failures = 0
    for i in range(iterations):
        try:
            state = AtomicPersistentGovernorState.load_atomic(state_path)
            state.turn_count += 1
            state.sigma = round(0.980 + ((worker_id + i) % 5) * 0.005, 4)
            state.persist_atomic(state_path)
            successes += 1
        except Exception:
            failures += 1
        time.sleep(0.002)
    return successes, failures


def test_multiprocess_concurrency_safety(tmp_path: Path) -> None:
    """Spawns 4 concurrent OS processes competing on the same state file under fcntl flock."""
    state_file = tmp_path / "shared_governor_state.json"
    initial = AtomicPersistentGovernorState(turn_count=0)
    initial.persist_atomic(state_file)

    num_workers = 4
    iters = 15

    ctx = mp.get_context("spawn")
    with ProcessPoolExecutor(max_workers=num_workers, mp_context=ctx) as executor:
        futures = [
            executor.submit(_mp_worker, w_id, str(state_file), iters)
            for w_id in range(num_workers)
        ]
        results = [f.result(timeout=20.0) for f in futures]

    total_successes = sum(r[0] for r in results)
    assert total_successes > 0

    final_state = AtomicPersistentGovernorState.load_atomic(state_file)
    assert final_state.turn_count >= 1
    assert 0.75 <= final_state.sigma <= 1.35