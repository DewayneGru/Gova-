from dataclasses import asdict, dataclass, field
import fcntl
import json
import os
from pathlib import Path
import tempfile
import time
from typing import Any, Dict


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

    def persist_atomic(self, state_path: Path) -> None:
        """Saves state atomically using exclusive fcntl advisory locks and tempfile swap."""
        target = Path(state_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        lock_path = target.with_suffix(target.suffix + ".lock")

        payload = {
            "version": "1.0",
            "timestamp": time.time(),
            "state": asdict(self),
        }

        with open(lock_path, "a+", encoding="utf-8") as lock_file:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                fd, tmp_name = tempfile.mkstemp(
                    dir=str(target.parent),
                    prefix=f".{target.name}.",
                    suffix=".tmp",
                )
                try:
                    with os.fdopen(fd, "w", encoding="utf-8") as tmp_file:
                        json.dump(payload, tmp_file, indent=2, sort_keys=True)
                        tmp_file.flush()
                        os.fsync(tmp_file.fileno())
                    os.replace(tmp_name, target)
                except Exception:
                    if os.path.exists(tmp_name):
                        os.unlink(tmp_name)
                    raise
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

    @classmethod
    def load_atomic(cls, state_path: Path) -> "AtomicPersistentGovernorState":
        """Loads state safely under shared advisory flock."""
        target = Path(state_path)
        if not target.exists():
            return cls()

        lock_path = target.with_suffix(target.suffix + ".lock")
        with open(lock_path, "a+", encoding="utf-8") as lock_file:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_SH)
            try:
                raw = json.loads(target.read_text(encoding="utf-8"))
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

        state_data = raw.get("state", raw)
        return cls(**{k: v for k, v in state_data.items() if k in cls.__dataclass_fields__})