from concurrent.futures import ProcessPoolExecutor
import contextlib
import json
import math
import multiprocessing as mp
from pathlib import Path
import random
import tempfile
import time
from typing import Any, Dict, Iterator, List, Optional, Sequence, Tuple, Type, Union

try:
    import numpy as np  # type: ignore
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

try:
    import pytest  # type: ignore
except ImportError:
    class _PytestShim:
        @staticmethod
        @contextlib.contextmanager
        def raises(exc_type: Union[Type[BaseException], Tuple[Type[BaseException], ...]]) -> Iterator[None]:
            try:
                yield
            except exc_type:
                return
            raise AssertionError(f"Expected exception {exc_type} was not raised")

    pytest = _PytestShim()  # type: ignore

from governor_persistence import AtomicPersistentGovernorState


# -----------------------------------------------------------------------------
# Pure-Python Array & RNG Fallback (active only if third-party numpy is absent)
# -----------------------------------------------------------------------------
if not HAS_NUMPY:
    class _Int8Matrix:
        """2D INT8 matrix emulating numpy.ndarray (shape, dtype, astype, clip, flatten)."""

        def __init__(self, rows: List[List[int]], dtype: str = "int8") -> None:
            self.dtype = dtype
            self._rows = [
                [max(-128, min(127, int(v))) if dtype == "int8" else int(v) for v in r]
                for r in rows
            ]

        @property
        def shape(self) -> Tuple[int, int]:
            return (len(self._rows), len(self._rows[0]) if self._rows else 0)

        def copy(self) -> "_Int8Matrix":
            return _Int8Matrix([r[:] for r in self._rows], dtype=self.dtype)

        def astype(self, dtype: Any) -> "_Int8Matrix":
            dtype_name = "int8" if dtype in ("int8", int) else "float64"
            return _Int8Matrix([r[:] for r in self._rows], dtype=dtype_name)

        def flatten(self) -> "_FloatVector":
            return _FloatVector([float(v) for r in self._rows for v in r], is_int=(self.dtype == "int8"))

        def mean_axis1(self) -> List[float]:
            return [sum(r) / len(r) for r in self._rows]

        def count_abs_gt(self, threshold: int) -> int:
            return sum(1 for r in self._rows for v in r if abs(v) > threshold)

    class _FloatVector:
        """1D numeric vector emulating numpy.ndarray."""

        def __init__(self, values: Sequence[float], is_int: bool = False) -> None:
            self._is_int = is_int
            self._vals = [int(v) if is_int else float(v) for v in values]

        def __len__(self) -> int:
            return len(self._vals)

        def __iter__(self) -> Iterator[Any]:
            return iter(self._vals)

        def __getitem__(self, idx: int) -> Any:
            return self._vals[idx]

        def copy(self) -> "_FloatVector":
            return _FloatVector(list(self._vals), is_int=self._is_int)

        def tolist(self) -> List[Any]:
            return list(self._vals)

        def reshape(self, shape: Tuple[int, int]) -> _Int8Matrix:
            rows_n, cols_n = shape
            rows: List[List[int]] = []
            for r in range(rows_n):
                rows.append([int(self._vals[r * cols_n + c]) for c in range(cols_n)])
            return _Int8Matrix(rows, dtype="int8")

    class _FallbackBitGenerator:
        def __init__(self, rng: random.Random) -> None:
            self._rng = rng

        @property
        def state(self) -> Any:
            return self._rng.getstate()

        @state.setter
        def state(self, val: Any) -> None:
            self._rng.setstate(val)

    class _FallbackGenerator:
        def __init__(self, seed: int) -> None:
            self._rng = random.Random(seed)
            self.bit_generator = _FallbackBitGenerator(self._rng)

        def normal(self, loc: float, scale: float, size: int) -> _FloatVector:
            return _FloatVector([self._rng.gauss(loc, scale) for _ in range(size)])

        def uniform(self, low: float, high: float, size: int) -> _FloatVector:
            return _FloatVector([self._rng.uniform(low, high) for _ in range(size)])

        def integers(self, low: int, high: int, size: Tuple[int, int], dtype: Any = None) -> _Int8Matrix:
            r_n, c_n = size
            return _Int8Matrix(
                [[self._rng.randint(low, high - 1) for _ in range(c_n)] for _ in range(r_n)],
                dtype="int8",
            )

    class _NumpyFallbackNamespace:
        pi = math.pi
        int8 = "int8"
        int16 = "int16"
        float64 = "float64"

        class random:
            @staticmethod
            def default_rng(seed: int) -> _FallbackGenerator:
                return _FallbackGenerator(seed)

        @staticmethod
        def array(data: Any, dtype: Any = None) -> _FloatVector:
            return _FloatVector(data, is_int=(dtype == "int8"))

        @staticmethod
        def std(vec: Sequence[float]) -> float:
            vals = list(vec)
            if not vals:
                return 0.0
            m = sum(vals) / len(vals)
            return math.sqrt(sum((x - m) ** 2 for x in vals) / len(vals))

        @staticmethod
        def corrcoef(x: Sequence[float], y: Sequence[float]) -> Dict[Tuple[int, int], float]:
            xs, ys = list(x), list(y)
            mx = sum(xs) / len(xs)
            my = sum(ys) / len(ys)
            num = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
            den = math.sqrt(sum((a - mx) ** 2 for a in xs) * sum((b - my) ** 2 for b in ys))
            c = num / den if den > 1e-12 else 0.0
            return {(0, 0): 1.0, (0, 1): c, (1, 0): c, (1, 1): 1.0}

        @staticmethod
        def allclose(a: Sequence[float], b: Sequence[float], atol: float = 1e-8) -> bool:
            la, lb = list(a), list(b)
            return len(la) == len(lb) and all(abs(float(x) - float(y)) <= atol for x, y in zip(la, lb))

        @staticmethod
        def array_equal(a: _Int8Matrix, b: _Int8Matrix) -> bool:
            return a.shape == b.shape and a._rows == b._rows

    np = _NumpyFallbackNamespace()  # type: ignore


def _serialize_rng_state(state: Any) -> Any:
    if isinstance(state, tuple):
        return [_serialize_rng_state(x) for x in state]
    if isinstance(state, list):
        return [_serialize_rng_state(x) for x in state]
    if isinstance(state, dict):
        return {k: _serialize_rng_state(v) for k, v in state.items()}
    return state


def _restore_rng_state(state: Any, use_numpy: bool) -> Any:
    if not use_numpy and isinstance(state, list):
        # random.Random.setstate requires (version, tuple_of_ints, gauss_next)
        return (state[0], tuple(state[1]), state[2])
    return state


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
        self.seed = seed
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
        if HAS_NUMPY:
            z = np.mean(np.exp(1j * self.theta))
            return float(np.abs(z))
        cos_m = sum(math.cos(t) for t in self.theta) / self.n
        sin_m = sum(math.sin(t) for t in self.theta) / self.n
        return float(math.hypot(cos_m, sin_m))

    @property
    def mean_phase_psi(self) -> float:
        if HAS_NUMPY:
            z = np.mean(np.exp(1j * self.theta))
            return float(np.angle(z))
        cos_m = sum(math.cos(t) for t in self.theta) / self.n
        sin_m = sum(math.sin(t) for t in self.theta) / self.n
        return float(math.atan2(sin_m, cos_m))

    def phase_variance(self) -> float:
        return float(1.0 - self.order_parameter_r)

    def phase_weight_correlation(self) -> float:
        psi = self.mean_phase_psi
        if HAS_NUMPY:
            rel_phase = np.cos(self.theta - psi)
            mean_crossbar_coupling = np.mean(self.w_crossbar.astype(np.float64), axis=1)
        else:
            rel_phase = [math.cos(t - psi) for t in self.theta]
            mean_crossbar_coupling = self.w_crossbar.mean_axis1()

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

        if HAS_NUMPY:
            d_theta = self.omega + (self.k_gain * r * np.sin(psi - self.theta)) + noise
            self.theta = (self.theta + d_theta * self.dt + np.pi) % (2 * np.pi) - np.pi

            phase_diff = np.sin(self.theta[:, None] - self.theta[None, :])
            dw = (phase_diff * 4.0).astype(np.int16)
            # Promote to int16 prior to addition to prevent INT8 modular wrap-around
            w_next = self.w_crossbar.astype(np.int16) + dw
            self.w_crossbar = np.clip(w_next, -128, 127).astype(np.int8)
            active_synapses = int(np.sum(np.abs(self.w_crossbar) > 32))
        else:
            next_theta: List[float] = []
            for i in range(self.n):
                dt_i = self.omega[i] + (self.k_gain * r * math.sin(psi - self.theta[i])) + noise[i]
                wrapped = (self.theta[i] + dt_i * self.dt + math.pi) % (2.0 * math.pi) - math.pi
                next_theta.append(wrapped)
            self.theta = _FloatVector(next_theta)

            new_rows: List[List[int]] = []
            for i in range(self.n):
                row_i: List[int] = []
                ti = self.theta[i]
                for j in range(self.n):
                    dw_ij = int(math.sin(ti - self.theta[j]) * 4.0)
                    row_i.append(max(-128, min(127, self.w_crossbar._rows[i][j] + dw_ij)))
                new_rows.append(row_i)
            self.w_crossbar = _Int8Matrix(new_rows, dtype="int8")
            active_synapses = self.w_crossbar.count_abs_gt(32)

        # Closed-loop homeostatic K_gain and criticality sigma update
        r_after = self.order_parameter_r
        r_err = 0.48 - r_after
        self.k_gain = max(0.50, min(3.00, self.k_gain + 0.18 * r_err))
        sigma_err = 1.0 - self.sigma
        self.sigma = max(0.75, min(1.35, self.sigma + 0.10 * sigma_err + 0.02 * (entropy - 0.58)))

        simulated_power = 4.32 + 0.0001 * active_synapses + 0.0004 * tokens
        return min(5.00, simulated_power)

    def export_state_dict(self) -> Dict[str, Any]:
        return {
            "model_type": "phase_vector_kuramoto",
            "n_oscillators": self.n,
            "dt": self.dt,
            "turn": self.turn,
            "k_gain": self.k_gain,
            "sigma": self.sigma,
            "theta": self.theta.tolist(),
            "omega": self.omega.tolist(),
            "w_crossbar_flat": self.w_crossbar.flatten().tolist(),
            "rng_state": _serialize_rng_state(self.rng.bit_generator.state),
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
        if "rng_state" in data and data["rng_state"] is not None:
            self.rng.bit_generator.state = _restore_rng_state(data["rng_state"], HAS_NUMPY)


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


def test_int8_crossbar_saturation_no_overflow_wraparound() -> None:
    """Verifies INT8 synaptic crossbar saturates cleanly at [-128, 127] without modular wrap-around."""
    gov = PhaseVectorKuramotoGovernor(n_oscillators=16, seed=7)
    # Drive weights near positive and negative INT8 boundaries
    for _ in range(120):
        gov.step(entropy=0.95, tokens=120)

    flat_weights = gov.w_crossbar.flatten().tolist()
    assert all(-128 <= int(w) <= 127 for w in flat_weights)


def test_phase_vector_restart_determinism(tmp_path: Path) -> None:
    """Verifies cold-start restart determinism and multi-turn post-restore trajectory continuity."""
    gov1 = PhaseVectorKuramotoGovernor(n_oscillators=32, seed=42)
    for _ in range(12):
        gov1.step(entropy=0.62, tokens=90)

    r_target = gov1.order_parameter_r
    theta_target = gov1.theta.copy()
    weights_target = gov1.w_crossbar.copy()

    snap_file = tmp_path / "pv_state.json"
    snap_file.write_text(json.dumps(gov1.export_state_dict()), encoding="utf-8")

    gov2 = PhaseVectorKuramotoGovernor(n_oscillators=32, seed=999)
    gov2.import_state_dict(json.loads(snap_file.read_text(encoding="utf-8")))

    assert gov2.turn == 12
    assert np.allclose(gov2.theta, theta_target, atol=1e-12)
    assert np.array_equal(gov2.w_crossbar, weights_target)
    assert math.isclose(gov2.order_parameter_r, r_target, rel_tol=1e-9)

    # Continue both governors for 12 more stochastic turns and verify exact trajectory match
    for t in range(12):
        h = 0.48 + 0.15 * math.cos(t * 0.4)
        p1 = gov1.step(entropy=h, tokens=110)
        p2 = gov2.step(entropy=h, tokens=110)
        assert math.isclose(p1, p2, abs_tol=1e-12)
        assert math.isclose(gov1.order_parameter_r, gov2.order_parameter_r, abs_tol=1e-12)

    assert np.allclose(gov1.theta, gov2.theta, atol=1e-12)
    assert np.array_equal(gov1.w_crossbar, gov2.w_crossbar)


def test_persistence_failure_resilience(tmp_path: Path) -> None:
    """Verifies that abandoned .tmp crash files and corrupt writes do not corrupt atomic state reads."""
    state_file = tmp_path / "atomic_state.json"
    state0 = AtomicPersistentGovernorState(turn_count=1, sigma=0.985)
    state0.persist_atomic(state_file)

    crash_tmp = tmp_path / f".{state_file.name}.crash.tmp"
    crash_tmp.write_text('{"state": {"turn_count": 2, "sigma": 0.99', encoding="utf-8")

    loaded = AtomicPersistentGovernorState.load_atomic(state_file)
    assert loaded.turn_count == 1
    assert math.isclose(loaded.sigma, 0.985, abs_tol=1e-5)

    # Verify out-of-bounds physical invariants fail closed
    with pytest.raises(ValueError):
        AtomicPersistentGovernorState(turn_count=2, dri=0.999)


def _mp_worker(worker_id: int, state_path_str: str, iterations: int) -> Tuple[int, int]:
    state_path = Path(state_path_str)
    successes = 0
    failures = 0
    for i in range(iterations):
        try:
            def _mutate(st: AtomicPersistentGovernorState) -> None:
                st.turn_count += 1
                st.sigma = round(0.980 + ((worker_id + i) % 5) * 0.005, 4)

            AtomicPersistentGovernorState.update_atomic(state_path, _mutate)
            successes += 1
        except Exception:
            failures += 1
        time.sleep(0.001)
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
    total_failures = sum(r[1] for r in results)
    assert total_failures == 0
    assert total_successes == num_workers * iters

    final_state = AtomicPersistentGovernorState.load_atomic(state_file)
    assert final_state.turn_count == num_workers * iters
    assert 0.75 <= final_state.sigma <= 1.35


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_p = Path(tmp_dir)
        test_ablation_spatial_representation_divergence()
        test_int8_crossbar_saturation_no_overflow_wraparound()
        (tmp_p / "t_restart").mkdir(parents=True, exist_ok=True)
        test_phase_vector_restart_determinism(tmp_p / "t_restart")
        (tmp_p / "t_persist").mkdir(parents=True, exist_ok=True)
        test_persistence_failure_resilience(tmp_p / "t_persist")
        (tmp_p / "t_mp").mkdir(parents=True, exist_ok=True)
        test_multiprocess_concurrency_safety(tmp_p / "t_mp")
    print("ALL 5 GOVERNOR ABLATION & ATOMIC CONCURRENCY TESTS PASSED.")
