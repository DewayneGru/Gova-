from dataclasses import asdict, dataclass, field
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile
import time
from typing import Any, Callable, Dict, Optional


def _fsync_directory(dir_path: Path) -> None:
    """Flushes the parent directory entry table to disk for POSIX rename durability."""
    try:
        dir_fd = os.open(str(dir_path), os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    except OSError:
        pass


def _compute_state_digest(state_dict: Dict[str, Any]) -> str:
    canonical = json.dumps(state_dict, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


@dataclass
class AtomicPersistentGovernorState:
    """Thread-safe and process-safe state container utilizing fcntl advisory locking."""

    turn_count: int = 0
    sigma: float = 0.980
    order_parameter_r: float = 0.480
    k_gain: float = 1.150
    dri: float = 0.1600
    simulated_power_mw: float = 4.32
    updated_at: float = field(default_factory=time.time)

    def __post_init__(self) -> None:
        self.validate()

    def validate(self) -> None:
        """Enforces strict numeric types, finiteness, and physical invariant bounds."""
        if isinstance(self.turn_count, bool) or not isinstance(self.turn_count, int):
            raise ValueError(f"turn_count must be an int, got {type(self.turn_count).__name__}")
        if self.turn_count < 0:
            raise ValueError(f"turn_count must be non-negative, got {self.turn_count}")

        numeric_fields = {
            "sigma": (self.sigma, 0.50, 1.50),
            "order_parameter_r": (self.order_parameter_r, 0.0, 1.0),
            "k_gain": (self.k_gain, 0.10, 5.00),
            "dri": (self.dri, 0.005, 0.250),
            "simulated_power_mw": (self.simulated_power_mw, 0.0, 50.0),
            "updated_at": (self.updated_at, 0.0, float("inf")),
        }
        for name, (val, lo, hi) in numeric_fields.items():
            if isinstance(val, bool) or not isinstance(val, (int, float)):
                raise ValueError(f"Field '{name}' must be numeric, got {type(val).__name__}")
            fval = float(val)
            if math.isnan(fval) or math.isinf(fval):
                raise ValueError(f"Field '{name}' must be finite, got {val}")
            if not (lo <= fval <= hi):
                raise ValueError(f"Field '{name}'={fval} violates invariant bounds [{lo}, {hi}]")

    def _write_locked_tempfile(self, target: Path) -> None:
        """Internal helper: writes validated state via NamedTemporaryFile + fsync + replace.
        Caller MUST hold fcntl.LOCK_EX on the companion lock file.
        """
        self.updated_at = time.time()
        self.validate()
        state_dict = asdict(self)
        payload = {
            "version": "1.1",
            "timestamp": self.updated_at,
            "sha256": _compute_state_digest(state_dict),
            "state": state_dict,
        }

        tmp_path: Optional[Path] = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=str(target.parent),
                prefix=f".{target.name}.",
                suffix=".tmp",
                delete=False,
            ) as tmp_file:
                tmp_path = Path(tmp_file.name)
                json.dump(payload, tmp_file, indent=2, sort_keys=True)
                tmp_file.flush()
                os.fsync(tmp_file.fileno())
            os.replace(str(tmp_path), str(target))
            _fsync_directory(target.parent)
        except Exception:
            if tmp_path is not None and tmp_path.exists():
                try:
                    tmp_path.unlink()
                except OSError:
                    pass
            raise

    def persist_atomic(self, state_path: Path) -> None:
        """Saves state atomically using exclusive fcntl advisory locks and tempfile swap."""
        target = Path(state_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        lock_path = target.with_suffix(target.suffix + ".lock")

        with open(lock_path, "a+", encoding="utf-8") as lock_file:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                self._write_locked_tempfile(target)
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

    @classmethod
    def _parse_and_validate_raw(cls, raw: Dict[str, Any]) -> "AtomicPersistentGovernorState":
        if not isinstance(raw, dict):
            raise ValueError("State payload root must be a JSON object")
        state_data = raw.get("state", raw)
        if not isinstance(state_data, dict):
            raise ValueError("State payload 'state' field must be a JSON object")

        expected_sha = raw.get("sha256")
        if expected_sha is not None:
            actual_sha = _compute_state_digest(state_data)
            if actual_sha != expected_sha:
                raise ValueError(
                    f"State SHA-256 integrity mismatch: expected {expected_sha}, got {actual_sha}"
                )

        filtered = {k: v for k, v in state_data.items() if k in cls.__dataclass_fields__}
        return cls(**filtered)

    @classmethod
    def load_atomic(cls, state_path: Path) -> "AtomicPersistentGovernorState":
        """Loads and validates state safely under shared advisory flock (LOCK_SH)."""
        target = Path(state_path)
        if not target.exists():
            return cls()

        lock_path = target.with_suffix(target.suffix + ".lock")
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        with open(lock_path, "a+", encoding="utf-8") as lock_file:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_SH)
            try:
                if not target.exists():
                    return cls()
                raw = json.loads(target.read_text(encoding="utf-8"))
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

        return cls._parse_and_validate_raw(raw)

    @classmethod
    def update_atomic(
        cls,
        state_path: Path,
        mutator: Callable[["AtomicPersistentGovernorState"], None],
    ) -> "AtomicPersistentGovernorState":
        """Executes an atomic Read-Modify-Write transaction under a single LOCK_EX lock.

        Eliminates lost-update race conditions when multiple worker processes
        concurrently increment turn counters or update synaptic state.
        """
        target = Path(state_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        lock_path = target.with_suffix(target.suffix + ".lock")

        with open(lock_path, "a+", encoding="utf-8") as lock_file:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                if target.exists():
                    raw = json.loads(target.read_text(encoding="utf-8"))
                    instance = cls._parse_and_validate_raw(raw)
                else:
                    instance = cls()

                mutator(instance)
                instance._write_locked_tempfile(target)
                return instance
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
