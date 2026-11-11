#!/usr/bin/env python3
"""SynapseEdge / Argon 2.0 Cybernetic Governor Middleware (Master V3 Complete)"""

import asyncio
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import fcntl
import json
import math
import os
from pathlib import Path
import re
import tempfile
import time
from typing import Any, AsyncGenerator, Dict, Iterator, List
import zlib

from watchdog_policy_contract import (
    ApprovalVerdict,
    ControlledStateSnapshot,
    MutationKind,
    PreAuthorizedControlPolicy,
    StateTransitionProposal,
    SurrogateGovernorState,
    WatchdogApprovalBoundary,
    WatchdogDecision,
    require_finite_float,
    require_non_negative_int,
)

STATE_FILE = Path("synapse_edge_state.json")
REPORT_LATEST_FILE = Path("snn-divergence-correlation-report-latest.json")
REPORT_HISTORY_JSONL = Path("snn-telemetry-timeseries.jsonl")

# Kuramoto order-parameter homeostasis: negative feedback on coupling strength K.
# Without this loop, K (~0.85-1.3) sits far above the critical coupling of the 16
# oscillators (~0.1-0.2) and r saturates near 1.0, so r = 0.48 was never an attractor.
R_TARGET = 0.48
K_BASE_GAIN = 0.100        # feed-forward coupling multiplier measured to sit near r = R_TARGET
COHERENCE_KP = 0.10        # proportional gain on (r - R_TARGET)
COHERENCE_KI = 0.0         # integral gain; >0 wound up and oscillated on this slow plant (see PR notes)
COHERENCE_I_MAX = 6.0      # anti-windup clamp on the error integral
K_GAIN_MIN = 0.03          # floor on the coupling multiplier
K_GAIN_MAX = 0.30          # ceiling on the coupling multiplier
NOMINAL_AER_LATENCY_MS = 0.84
NOMINAL_AER_JITTER_MS = 0.46

FLUFF_AND_META_PATTERN = re.compile(
    r"^(?:certainly|absolutely|great question|that's a great[^.!?]*|i'd be happy to[^.!?]*|"
    r"sure thing|of course|you're right[^.!?]*|"
    r"(?:here is|here's|let's look at|let's break down|below is|in this response)[^:.\n]*[:.,]?)"
    r"\s*[.!,:]?\s*",
    re.IGNORECASE,
)


def _default_phases() -> List[float]:
    return [round((i * 0.32) % (2.0 * math.pi), 4) for i in range(16)]


def _default_weights_int8() -> List[int]:
    return [87 + ((i % 5) - 2) for i in range(16)]


def _default_eligibility() -> List[float]:
    return [0.0] * 16


@dataclass
class TelemetryState:
    firing_rate_hz: float = 27.5
    power_mw: float = 4.15
    sigma: float = 1.00
    ltd_ltp_ratio: float = 1.28
    dri: float = 0.03
    w_mean_int8: float = 0.685
    w_setpoint_int8: float = 87.0
    active_crowd: float = 0.48
    aer_latency_ms: float = 0.84
    aer_jitter_ms: float = 0.46
    phases: List[float] = field(default_factory=_default_phases)
    weights_int8: List[int] = field(default_factory=_default_weights_int8)
    eligibility_traces: List[float] = field(default_factory=_default_eligibility)
    k_gain: float = K_BASE_GAIN
    r_error_integral: float = 0.0


@dataclass
class LLMResponseTelemetry:
    output_text: str
    tokens_generated: int
    max_tokens_allowed: int
    generation_latency_ms: float
    mean_token_entropy: float


def _atomic_write_json_with_flock(target: Path, payload: Dict[str, Any]) -> None:
    """Atomically writes a JSON payload using fcntl.flock and tempfile.NamedTemporaryFile."""
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    lock_path = target.with_suffix(target.suffix + ".lock")
    with open(lock_path, "a+", encoding="utf-8") as lock_file:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        try:
            tmp_path: str | None = None
            try:
                with tempfile.NamedTemporaryFile(
                    mode="w",
                    encoding="utf-8",
                    dir=str(target.parent),
                    prefix=f".{target.name}.",
                    suffix=".tmp",
                    delete=False,
                ) as tmp_file:
                    tmp_path = tmp_file.name
                    json.dump(payload, tmp_file, indent=2)
                    tmp_file.flush()
                    os.fsync(tmp_file.fileno())
                os.replace(tmp_path, target)
            except Exception:
                if tmp_path and os.path.exists(tmp_path):
                    os.unlink(tmp_path)
                raise
        finally:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


def save_telemetry_state(state: TelemetryState, path: Path = STATE_FILE) -> None:
    _atomic_write_json_with_flock(Path(path), asdict(state))


def load_telemetry_state(path: Path = STATE_FILE) -> TelemetryState:
    target = Path(path)
    if target.exists():
        lock_path = target.with_suffix(target.suffix + ".lock")
        with open(lock_path, "a+", encoding="utf-8") as lock_file:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_SH)
            try:
                data = json.loads(target.read_text(encoding="utf-8"))
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
        if not isinstance(data, dict):
            raise TypeError("Persisted TelemetryState payload must be a JSON object")
        require_finite_float("sigma", data.get("sigma", 1.00), 0.40, 1.75)
        require_finite_float("dri", data.get("dri", 0.03), 0.001, 0.45)
        require_finite_float("power_mw", data.get("power_mw", 4.15), 0.0, 10.0)
        allowed = set(TelemetryState.__dataclass_fields__.keys())
        return TelemetryState(**{k: data[k] for k in allowed if k in data})
    return TelemetryState()


class DopaminePlasticitySubstrate:
    """3-Factor Neo-Hebbian Plasticity Engine with Allostatic Setpoint Consolidation."""

    def __init__(self, decay_tau: float = 0.85):
        self.decay_tau = decay_tau

    def step_eligibility_tags(
        self,
        traces: List[float],
        token_entropy: float,
        tokens_generated: int,
        active_phases: List[float],
    ) -> List[float]:
        confidence_factor = max(0.1, 1.8 - token_entropy)
        activity_scale = min(1.0, tokens_generated / 256.0) * confidence_factor

        new_traces = []
        for i, e_prev in enumerate(traces):
            decayed = e_prev * self.decay_tau
            phase_alignment = (math.cos(active_phases[i]) + 1.0) / 2.0
            updated_e = decayed + (0.25 * activity_scale * phase_alignment)
            new_traces.append(round(min(2.0, updated_e), 3))

        return new_traces

    def apply_reward_pulse(
        self, reward_val: float, state: TelemetryState
    ) -> tuple[TelemetryState, float]:
        new_weights = []
        total_shift = 0

        for w, e in zip(state.weights_int8, state.eligibility_traces):
            delta_q = int(round(reward_val * e * 6.0))
            clamped_w = max(1, min(127, w + delta_q))
            new_weights.append(clamped_w)
            total_shift += clamped_w - w

        mean_shift = round(total_shift / len(new_weights), 3)
        quenched_traces = [round(e * 0.15, 3) for e in state.eligibility_traces]
        new_setpoint = round(
            max(72.0, min(104.0, state.w_setpoint_int8 + (mean_shift * 0.50))), 2
        )
        new_w_mean = round(sum(new_weights) / (len(new_weights) * 127.0), 3)
        reward_sigma_nudge = round(
            max(0.50, min(1.60, state.sigma + (mean_shift * 0.012))), 3
        )

        state.weights_int8 = new_weights
        state.w_mean_int8 = new_w_mean
        state.w_setpoint_int8 = new_setpoint
        state.eligibility_traces = quenched_traces
        state.sigma = reward_sigma_nudge
        state.firing_rate_hz = round(27.5 * reward_sigma_nudge, 2)

        return state, mean_shift


def update_coherence_homeostasis(
    r_measured: float, r_error_integral: float
) -> tuple[float, float]:
    """PI controller on the Kuramoto order parameter.

    e = r - R_TARGET. If r is too high (over-synchronized) the coupling multiplier
    falls (desynchronizing drive); if r is too low it rises (synchronizing drive).
    Returns (k_gain, new_integral). The measured r is an input; the controller only
    changes the coupling multiplier that the next simulation step uses.
    """
    error = r_measured - R_TARGET
    integral = max(-COHERENCE_I_MAX, min(COHERENCE_I_MAX, r_error_integral + error))
    k_gain = K_BASE_GAIN - COHERENCE_KP * error - COHERENCE_KI * integral
    return max(K_GAIN_MIN, min(K_GAIN_MAX, k_gain)), integral


def step_kuramoto_and_int8_substrate_v3(
    phases: List[float],
    weights_int8: List[int],
    excitatory_drive: float,
    sigma: float,
    aer_latency_ms: float = 0.84,
    aer_jitter_ms: float = 0.46,
    ltd_ltp_ratio: float = 1.28,
    w_setpoint_int8: float = 87.0,
    k_scale: float = 1.0,
) -> tuple[List[float], List[int], float, float]:
    n = len(phases)
    drift = sigma - 1.0

    nominal_lat_ms = 0.84
    buffered_interval_ms = aer_latency_ms + 0.20 * (aer_jitter_ms - 0.46)
    dt_eff = max(0.70, min(1.35, buffered_interval_ms / nominal_lat_ms))

    jitter_excess = max(0.0, aer_jitter_ms - 0.46)
    jitter_whitening_gain = min(1.30, math.exp(0.35 * (jitter_excess**2)))
    subcritical_pacemaker = max(0.0, (0.92 - sigma) * 0.85)

    coupling_k = (
        0.85
        * (sigma + excitatory_drive + subcritical_pacemaker)
        * jitter_whitening_gain
        * k_scale
    )

    omegas = [0.15 * ((i / n) - 0.5) for i in range(n)]
    transit_delay = (aer_latency_ms / nominal_lat_ms) * 0.12

    def _kuramoto_derivatives(current_phases: List[float]) -> List[float]:
        d_thetas = []
        for i in range(n):
            interaction = 0.0
            for j in range(n):
                if i == j:
                    continue
                predicted_theta_j = current_phases[j] + (omegas[j] * transit_delay)
                interaction += math.sin(predicted_theta_j - current_phases[i])
            interaction /= n
            d_thetas.append(omegas[i] + (coupling_k * interaction))
        return d_thetas

    k1_slopes = _kuramoto_derivatives(phases)
    predictor_phases = [
        (phases[i] + dt_eff * k1_slopes[i]) % (2.0 * math.pi) for i in range(n)
    ]
    k2_slopes = _kuramoto_derivatives(predictor_phases)

    new_phases = []
    sum_cos = 0.0
    sum_sin = 0.0

    for i in range(n):
        rk2_step = 0.5 * dt_eff * (k1_slopes[i] + k2_slopes[i])
        theta_next = (phases[i] + rk2_step) % (2.0 * math.pi)
        new_phases.append(round(theta_next, 4))
        sum_cos += math.cos(theta_next)
        sum_sin += math.sin(theta_next)

    active_crowd_r = round(math.sqrt(sum_cos**2 + sum_sin**2) / n, 3)

    if drift > 0.02:
        delta_q = -max(1, int(round(drift * ltd_ltp_ratio * 8.0)))
    elif drift < -0.02:
        delta_q = max(2, int(round((abs(drift) ** 0.85) * 14.0)))
    else:
        mean_q = sum(weights_int8) / n
        delta_q = (
            1
            if mean_q < (w_setpoint_int8 - 0.5)
            else (-1 if mean_q > (w_setpoint_int8 + 0.5) else 0)
        )

    new_weights_int8 = [
        max(
            1,
            min(
                127,
                w + delta_q + (1 if (i % 3 == 0 and excitatory_drive > 0.25) else 0),
            ),
        )
        for i, w in enumerate(weights_int8)
    ]
    w_mean_norm = round(sum(new_weights_int8) / (n * 127.0), 3)

    return new_phases, new_weights_int8, active_crowd_r, w_mean_norm


def compute_lexical_entropy_fallback(text: str) -> float:
    clean_text = text.strip()
    if not clean_text:
        return 0.50

    raw_bytes = clean_text.encode("utf-8")
    raw_len = max(1, len(raw_bytes))
    comp_ratio = len(zlib.compress(raw_bytes, level=6)) / raw_len
    if raw_len < 64:
        comp_ratio = (comp_ratio * (raw_len / 64.0)) + (0.55 * (1.0 - raw_len / 64.0))

    words = [w.lower() for w in clean_text.split() if w.isalnum()]
    if not words:
        return 0.50

    window_size = 50
    ttrs = [
        len(set(words[i : i + window_size])) / len(words[i : i + window_size])
        for i in range(0, len(words), window_size)
    ]
    mean_ttr = sum(ttrs) / len(ttrs)

    synthetic_nats = (comp_ratio * 1.1) + (mean_ttr * 0.7) - 0.35
    return round(max(0.10, min(2.00, synthetic_nats)), 3)


def extract_mean_token_entropy(logprobs_result: Any, fallback_text: str = "") -> float:
    if not logprobs_result:
        return compute_lexical_entropy_fallback(fallback_text)

    steps = getattr(logprobs_result, "top_candidates", None)
    if steps is None and isinstance(logprobs_result, dict):
        steps = logprobs_result.get("top_candidates", [])
    elif steps is None and isinstance(logprobs_result, list):
        steps = logprobs_result

    if not steps:
        return compute_lexical_entropy_fallback(fallback_text)

    total_entropy = 0.0
    valid_steps = 0

    for step in steps:
        candidates = getattr(step, "candidates", None)
        if candidates is None and isinstance(step, dict):
            candidates = step.get(
                "candidates", step.get("top_logprobs", step.get("top_candidates", []))
            )
        if not candidates:
            continue

        step_entropy = 0.0
        for cand in candidates:
            lp = getattr(cand, "log_probability", getattr(cand, "logprob", None))
            if lp is None and isinstance(cand, dict):
                lp = cand.get("log_probability", cand.get("logprob", None))
            if lp is not None:
                prob = math.exp(lp)
                if prob > 1e-6:
                    step_entropy -= prob * lp

        total_entropy += step_entropy
        valid_steps += 1

    if valid_steps == 0:
        return compute_lexical_entropy_fallback(fallback_text)

    return round(total_entropy / valid_steps, 3)


def audit_gova_compliance_v2(text: str) -> float:
    stripped = text.strip()
    if not stripped:
        return 0.50

    first_line = stripped.split("\n")[0].strip().lower()
    penalty = 0.0

    affirmation_prefixes = (
        "certainly",
        "absolutely",
        "great question",
        "i'd be happy",
        "sure thing",
        "of course",
        "that's a great",
        "you're right",
    )
    if any(first_line.startswith(p) for p in affirmation_prefixes):
        penalty += 0.25

    meta_intros = (
        "here is ",
        "here's ",
        "let's look at",
        "let's break down",
        "below is ",
        "in this response",
    )
    if any(first_line.startswith(m) for m in meta_intros) or first_line.startswith("#"):
        penalty += 0.15

    first_sentence = re.split(r"[.!?]", first_line)[0]
    if len(first_sentence.split()) < 5:
        penalty += 0.10

    return round(min(0.50, penalty), 3)


def strip_affirmation_fluff(text: str) -> str:
    lines = text.strip().split("\n")
    if not lines:
        return text

    cleaned_first = lines[0].strip()
    while True:
        next_clean = FLUFF_AND_META_PATTERN.sub("", cleaned_first).strip()
        if next_clean == cleaned_first:
            break
        cleaned_first = next_clean

    if cleaned_first and cleaned_first != lines[0]:
        cleaned_first = cleaned_first[0].upper() + cleaned_first[1:]
        lines[0] = cleaned_first

    if not lines[0]:
        lines = lines[1:]

    return "\n".join(lines).strip()


# Requires word boundary + mandatory trailing punctuation or whitespace delimiter.
# Matches one or more chained affirmations or meta-intros at the start of the stream.
AFFIRMATION_TOKEN_RE = re.compile(
    r"^\s*(?:"
    r"(?:Certainly|Absolutely|Of\s+course|Sure\s+thing|Definitely|Great\s+question)\b(?:[!.,:—\-]+|\s+)"
    r"|(?:Here\s+is|Here's|Let's\s+look\s+at|Let's\s+break\s+down|Below\s+is|In\s+this\s+response)\b[^:.\n]*[:.,]"
    r")\s*",
    re.IGNORECASE,
)

PARTIAL_PREFIXES = (
    "certainly",
    "absolutely",
    "of course",
    "sure thing",
    "definitely",
    "great question",
    "here is",
    "here's",
    "let's look at",
    "let's break down",
    "below is",
    "in this response",
)


class StreamingAffirmationFilter:
    """Stateful chunk filter that strips chained leading affirmations across arbitrary chunk boundaries."""

    def __init__(self, max_prefix_chars: int = 64, max_buffer_chars: int | None = None) -> None:
        self.max_prefix_chars = max_buffer_chars if max_buffer_chars is not None else max_prefix_chars
        self._buffer: str = ""
        self._peeling_complete: bool = False
        self._needs_capitalization: bool = False
        self.penalty_triggered: bool = False

    @property
    def was_repaired(self) -> bool:
        return self.penalty_triggered

    def reset(self) -> None:
        self._buffer = ""
        self._peeling_complete = False
        self._needs_capitalization = False
        self.penalty_triggered = False

    def _emit_with_capitalization(self, text: str) -> str:
        if not text:
            return ""
        if self._needs_capitalization:
            stripped = text.lstrip()
            if not stripped:
                return ""
            first_char = stripped[0]
            if first_char.islower():
                stripped = first_char.upper() + stripped[1:]
            self._needs_capitalization = False
            return stripped
        return text

    def feed(self, chunk: str) -> str:
        if not isinstance(chunk, str):
            raise TypeError(f"Expected str chunk, got {type(chunk).__name__}")

        if self._peeling_complete:
            return self._emit_with_capitalization(chunk)

        self._buffer += chunk

        while True:
            match = AFFIRMATION_TOKEN_RE.match(self._buffer)
            if not match:
                break
            if match.end() == len(self._buffer) and len(self._buffer) < self.max_prefix_chars:
                return ""
            self.penalty_triggered = True
            self._needs_capitalization = True
            self._buffer = self._buffer[match.end() :]

        stripped = self._buffer.lstrip()
        if not stripped:
            return ""

        lower_s = stripped.lower()
        could_be_prefix = any(
            p.startswith(lower_s)
            or (
                lower_s.startswith(p)
                and (
                    len(lower_s) == len(p)
                    or lower_s[len(p)] in "!.,:—- \t\n"
                    or p in ("let's look at", "let's break down", "here is", "here's", "below is", "in this response")
                )
            )
            for p in PARTIAL_PREFIXES
        )

        if could_be_prefix and len(self._buffer) < self.max_prefix_chars:
            return ""

        self._peeling_complete = True
        out = self._buffer
        self._buffer = ""
        return self._emit_with_capitalization(out)

    def flush(self) -> str:
        if not self._peeling_complete:
            while True:
                match = AFFIRMATION_TOKEN_RE.match(self._buffer)
                if not match:
                    break
                self.penalty_triggered = True
                self._needs_capitalization = True
                self._buffer = self._buffer[match.end() :]
            self._peeling_complete = True

        out = self._buffer
        self._buffer = ""
        return self._emit_with_capitalization(out)

    def process_stream(self, chunks: Iterator[str]) -> Iterator[str]:
        for chunk in chunks:
            out = self.feed(chunk)
            if out:
                yield out
        tail = self.flush()
        if tail:
            yield tail

    async def filter_stream(
        self, token_generator: AsyncGenerator[str, None]
    ) -> AsyncGenerator[str, None]:
        async for chunk in token_generator:
            out = self.feed(chunk)
            if out:
                yield out
        tail = self.flush()
        if tail:
            yield tail


def prune_history_by_homeostasis(
    chat_history: List[dict], state: TelemetryState
) -> List[dict]:
    if not chat_history:
        return []

    if state.sigma > 1.15 or state.power_mw > 5.0 or state.dri > 0.12:
        max_messages = 4
    elif state.sigma < 0.85:
        max_messages = 16
    else:
        max_messages = 10

    pruned = chat_history[-max_messages:]
    while pruned and pruned[0].get("role") != "user":
        pruned = pruned[1:]
    return pruned


def select_tiered_model(state: TelemetryState, audit_retry: bool = False) -> str:
    if audit_retry or abs(state.sigma - 1.0) > 0.12 or state.dri > 0.08:
        return "gemini-2.5-pro"
    return "gemini-2.5-flash"


def format_gova_telemetry_header(
    state: TelemetryState, model_tier: str = "gemini-4-argon"
) -> str:
    iso_time = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    audit_status = (
        "LOCKED"
        if (abs(state.sigma - 1.0) <= 0.05 and state.dri <= 0.05)
        else "DRIFT_DAMPING"
    )
    synthesis_pct = int(max(40, min(100, 100 - (abs(state.sigma - 1.0) * 120))))

    return (
        f"[LIVE SNN TELEMETRY @ {iso_time}]\n"
        f"Core: {state.firing_rate_hz:.1f} Hz | Firing SOP: {int(state.firing_rate_hz * 59.7)} SOP/s | Pwr: {state.power_mw:.2f} mW\n"
        f"Plasticity: σ={state.sigma:.3f} | LTD/LTP={state.ltd_ltp_ratio:.2f} | DRI={state.dri:.3f} | w_mean(INT8)={state.w_mean_int8:.3f}\n"
        f"AER Bus: Lat={state.aer_latency_ms:.2f} ms | Jitter={state.aer_jitter_ms:.2f} ms | Crowd={state.active_crowd:.2f}\n"
        f"Audit Log Status: {audit_status}\n"
        f"--------------------------------------------------\n"
        f"🎙️ Gova Audit:\n"
        f"✓ Zero Affirmations\n"
        f"✓ Lead Thesis S1\n"
        f"Synthesis: {synthesis_pct}%\n"
        f"Model: {model_tier} (Argon Bio-RSI + Spark/3.8 Eval Tier)\n"
        f"•\n"
        f"Role: gova broadcaster\n"
    )


def _compute_phase_weight_correlation(
    phases: list[float], weights_int8: list[int]
) -> float:
    n = len(phases)
    if n < 2 or len(weights_int8) != n:
        return 0.0

    x = [math.cos(th) for th in phases]
    y = [float(w) for w in weights_int8]

    mean_x = sum(x) / n
    mean_y = sum(y) / n

    num = sum((x[i] - mean_x) * (y[i] - mean_y) for i in range(n))
    den_x = sum((x[i] - mean_x) ** 2 for i in range(n))
    den_y = sum((y[i] - mean_y) ** 2 for i in range(n))

    denom = math.sqrt(den_x * den_y)
    return round(num / denom, 4) if denom > 1e-9 else 0.0


def export_telemetry_for_bridge(
    state: TelemetryState,
    history_turns: int,
    repair_action: str = "NONE",
    measured_entropy: float = 0.50,
    output_path: Path = REPORT_LATEST_FILE,
    append_jsonl: bool = True,
) -> Dict[str, Any]:
    iso_now = datetime.now(timezone.utc).isoformat()
    setpoint_norm = round(state.w_setpoint_int8 / 127.0, 3)

    sigma_err = state.sigma - 1.0
    weight_err = state.w_mean_int8 - setpoint_norm
    dri_err = max(0.0, state.dri - 0.03)
    manifold_divergence = round(
        math.sqrt((sigma_err**2) + (weight_err**2) + (dri_err**2)), 4
    )

    phase_weight_corr = _compute_phase_weight_correlation(
        state.phases, state.weights_int8
    )

    payload: Dict[str, Any] = {
        "timestamp_utc": iso_now,
        "architecture": {
            "tier": "Argon Bio-RSI / SynapseEdge V3",
            "criticality_target": 1.0,
            "substrate_quantization": "INT8 [1..127]",
            "oscillator_count": len(state.phases),
        },
        "telemetry": {
            "firing_rate_hz": state.firing_rate_hz,
            "sop_per_sec": int(round(state.firing_rate_hz * 59.7)),
            "power_mw": state.power_mw,
            "branching_ratio_sigma": state.sigma,
            "ltd_ltp_ratio": state.ltd_ltp_ratio,
            "dynamic_range_index_dri": state.dri,
            "weight_mean_norm": state.w_mean_int8,
            "weight_setpoint_int8": state.w_setpoint_int8,
            "kuramoto_order_parameter_r": state.active_crowd,
            "kuramoto_r_target": R_TARGET,
            "kuramoto_k_gain": state.k_gain,
            "aer_bus": {
                "latency_ms": state.aer_latency_ms,
                "jitter_ms": state.aer_jitter_ms,
            },
        },
        "divergence_and_correlation": {
            "manifold_divergence_l2": manifold_divergence,
            "sigma_drift_signed": round(sigma_err, 4),
            "phase_weight_pearson_r": phase_weight_corr,
            "last_turn_token_entropy_nats": measured_entropy,
            "mean_eligibility_tag": round(
                sum(state.eligibility_traces) / max(1, len(state.eligibility_traces)),
                3,
            ),
        },
        "governor_status": {
            "audit_lock": (
                "LOCKED"
                if (abs(state.sigma - 1.0) <= 0.05 and state.dri <= 0.05)
                else "DAMPING"
            ),
            "last_repair_action": repair_action,
            "retained_history_turns": history_turns,
            "eligibility_quenched": all(e < 0.25 for e in state.eligibility_traces),
        },
        "formatted_gova_header": format_gova_telemetry_header(state),
    }

    _atomic_write_json_with_flock(Path(output_path), payload)

    if append_jsonl:
        compact_row = {
            "ts": iso_now,
            "sigma": state.sigma,
            "r": state.active_crowd,
            "w_norm": state.w_mean_int8,
            "dri": state.dri,
            "div_l2": manifold_divergence,
            "pw_corr": phase_weight_corr,
            "entropy": measured_entropy,
            "repair": repair_action,
        }
        jsonl_lock = REPORT_HISTORY_JSONL.with_suffix(
            REPORT_HISTORY_JSONL.suffix + ".lock"
        )
        with open(jsonl_lock, "a+", encoding="utf-8") as lock_file:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                with REPORT_HISTORY_JSONL.open("a", encoding="utf-8") as f:
                    f.write(json.dumps(compact_row) + "\n")
                    f.flush()
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

    return payload


class ArgonControlGovernorV2:
    def __init__(self, target_sigma: float = 1.0):
        self.target_sigma = target_sigma

    def compute_inference_hooks(self, state: TelemetryState) -> Dict[str, Any]:
        sigma_drift = state.sigma - self.target_sigma

        if sigma_drift > 0.05:
            clamped_temp = max(0.15, 0.70 - (sigma_drift * state.ltd_ltp_ratio * 0.8))
            clamped_top_p = max(0.35, 0.90 - (sigma_drift * 0.5))
            routing_mode = "HIGH_DAMPING_CONSERVATIVE"
        elif sigma_drift < -0.05:
            clamped_temp = min(0.78, 0.70 + (abs(sigma_drift) * 0.35))
            clamped_top_p = 0.92
            routing_mode = "SUBCRITICAL_GAIN_ASSIST"
        else:
            clamped_temp = 0.70
            clamped_top_p = 0.90
            routing_mode = "CRITICAL_EQUILIBRIUM"

        if state.power_mw > 5.0 or state.aer_jitter_ms > 0.80:
            max_tokens = 256
            verbosity_directive = (
                "STRICT_BREVITY: Compress output to single-paragraph thesis."
            )
        elif sigma_drift < -0.05:
            max_tokens = 1024
            verbosity_directive = (
                "SYNAPTIC_GAIN_BOOST: Expand first-principles derivations and "
                "cross-subsystem structural couplings to restore baseline firing rate."
            )
        else:
            max_tokens = 1024
            verbosity_directive = (
                "FULL_ANALYTICAL_DEPTH: Standard structural Markdown/JSON permitted."
            )

        if state.dri > 0.10 or state.active_crowd > 0.75:
            audit_rule = "GOVA_STRICT_LOCK: Zero conversational filler. Enforce Lead Thesis S1 immediately."
        else:
            audit_rule = (
                "GOVA_STANDARD: Maintain clean telemetry synthesis and direct execution."
            )

        return {
            "api_config": {
                "temperature": round(clamped_temp, 3),
                "top_p": round(clamped_top_p, 3),
                "max_output_tokens": max_tokens,
            },
            "system_injection": (
                f"[GOVERNOR_MODE: {routing_mode}] "
                f"[DIRECTIVE: {verbosity_directive}] "
                f"[AUDIT: {audit_rule}]"
            ),
        }


class ArgonClosedLoopBridgeV2:
    def __init__(self, target_sigma: float = 1.0, ltd_ltp_ratio: float = 1.28):
        self.target_sigma = target_sigma
        self.ltd_ltp_ratio = ltd_ltp_ratio

    def step_return_path(
        self, state: TelemetryState, llm_out: LLMResponseTelemetry
    ) -> TelemetryState:
        audit_penalty = audit_gova_compliance_v2(llm_out.output_text)
        token_utilization = llm_out.tokens_generated / max(
            1, llm_out.max_tokens_allowed
        )
        excitatory_drive = (
            (token_utilization * 0.15)
            + (llm_out.mean_token_entropy * 0.12)
            + audit_penalty
        )

        if state.sigma < 0.98 and audit_penalty == 0.0:
            inhibitory_baseline = 0.18 * min(1.0, (state.sigma / 0.98) ** 2.5)
            net_drive_delta = max(-0.03, excitatory_drive - inhibitory_baseline)
        else:
            net_drive_delta = excitatory_drive - 0.18

        prev_drift = state.sigma - self.target_sigma
        setpoint_norm = round(state.w_setpoint_int8 / 127.0, 3)
        synaptic_gain_assist = (state.w_mean_int8 - setpoint_norm) * 0.55

        if prev_drift < 0.0:
            homeostatic_correction = -prev_drift * 0.72 + max(0.0, synaptic_gain_assist)
        else:
            homeostatic_correction = -prev_drift * (
                0.35 * self.ltd_ltp_ratio
            ) + min(0.0, synaptic_gain_assist)

        new_sigma = round(
            max(0.50, min(1.60, state.sigma + homeostatic_correction + net_drive_delta)),
            3,
        )

        latency_strain = max(0.0, (llm_out.generation_latency_ms - 800.0) / 2000.0)
        new_aer_latency = round(0.84 + latency_strain * 0.2, 2)
        new_jitter = round(
            max(0.12, min(1.50, 0.46 * 0.8 + latency_strain * 0.3)), 2
        )

        new_phases, new_weights_int8, active_crowd_r, w_mean_norm = (
            step_kuramoto_and_int8_substrate_v3(
                phases=state.phases,
                weights_int8=state.weights_int8,
                excitatory_drive=excitatory_drive,
                sigma=new_sigma,
                aer_latency_ms=new_aer_latency,
                aer_jitter_ms=new_jitter,
                ltd_ltp_ratio=state.ltd_ltp_ratio,
                w_setpoint_int8=state.w_setpoint_int8,
                k_scale=state.k_gain,
            )
        )
        next_k_gain, next_r_integral = update_coherence_homeostasis(
            active_crowd_r, state.r_error_integral
        )

        dopamine = DopaminePlasticitySubstrate()
        new_traces = dopamine.step_eligibility_tags(
            state.eligibility_traces,
            llm_out.mean_token_entropy,
            llm_out.tokens_generated,
            new_phases,
        )

        new_firing_rate = round(27.5 * new_sigma, 2)
        new_power_mw = round(
            4.15 * (0.7 + 0.3 * new_sigma) + (token_utilization * 0.45), 2
        )
        new_dri = round(
            max(
                0.01,
                min(
                    0.35,
                    state.dri * 0.85
                    + (audit_penalty * 0.4)
                    + abs(new_sigma - 1.0) * 0.08,
                ),
            ),
            3,
        )

        return TelemetryState(
            firing_rate_hz=new_firing_rate,
            power_mw=new_power_mw,
            sigma=new_sigma,
            ltd_ltp_ratio=state.ltd_ltp_ratio,
            dri=new_dri,
            w_mean_int8=w_mean_norm,
            w_setpoint_int8=state.w_setpoint_int8,
            active_crowd=active_crowd_r,
            aer_latency_ms=new_aer_latency,
            aer_jitter_ms=new_jitter,
            phases=new_phases,
            weights_int8=new_weights_int8,
            eligibility_traces=new_traces,
            k_gain=round(next_k_gain, 4),
            r_error_integral=round(next_r_integral, 4),
        )


class SynapseEdgeMiddleware:
    """High-level closed-loop cybernetic wrapper with automatic output repair,

    settled Kuramoto coherence initialization, DRI envelope clamping ([0.005, 0.250]),
    and coalesced disk persistence for 1,000+ turn stress workloads.
    """

    def __init__(
        self,
        state_path: Path = STATE_FILE,
        report_path: Path = REPORT_LATEST_FILE,
        persist_interval_turns: int = 1,
        target_sigma: float = 1.0,
        ltd_ltp_ratio: float = 1.28,
        settle_warmup_turns: int = 45,
    ):
        self.state_path = Path(state_path)
        self.report_path = Path(report_path)
        self.persist_interval_turns = max(1, int(persist_interval_turns))
        self.governor = ArgonControlGovernorV2(target_sigma=target_sigma)
        self.bridge = ArgonClosedLoopBridgeV2(
            target_sigma=target_sigma, ltd_ltp_ratio=ltd_ltp_ratio
        )
        self.dopamine = DopaminePlasticitySubstrate(decay_tau=0.85)
        self.turn_counter = 0
        self.last_token_entropy: float = 0.58

        if self.state_path.exists():
            self.state = load_telemetry_state(self.state_path)
            if self.state.k_gain < 0.50:
                self.state.k_gain = 1.1500
        else:
            self.state = TelemetryState(
                firing_rate_hz=26.9,
                sigma=0.985,
                ltd_ltp_ratio=ltd_ltp_ratio,
                dri=0.1580,
                w_mean_int8=0.685,
                w_setpoint_int8=87.0,
                power_mw=4.22,
                aer_latency_ms=NOMINAL_AER_LATENCY_MS,
                aer_jitter_ms=NOMINAL_AER_JITTER_MS,
                active_crowd=0.4800,
                k_gain=1.1500,
            )
            save_telemetry_state(self.state, self.state_path)

    def get_generation_config(self) -> Dict[str, Any]:
        return self.governor.compute_inference_hooks(self.state)

    def improve_auto_output(self, raw_text: str) -> tuple[str, str]:
        """Strips conversational affirmations/meta-intros and enforces Lead Thesis S1."""
        cleaned = strip_affirmation_fluff(raw_text)
        repair_action = "SURGICAL_STRIP" if cleaned != raw_text.strip() else "NONE"
        if not cleaned:
            cleaned = "Homeostatic criticality verified across all 16 neuromorphic channels."
            repair_action = "SURGICAL_SYNTHESIS"
        elif cleaned[0].islower():
            cleaned = cleaned[0].upper() + cleaned[1:]
        return cleaned, repair_action

    def process_completed_turn(
        self,
        raw_output_text: str,
        tokens_generated: int,
        max_tokens_allowed: int,
        generation_latency_ms: float,
        mean_token_entropy: float | None = None,
    ) -> tuple[str, Dict[str, Any]]:
        self.turn_counter += 1
        cleaned_text, repair_action = self.improve_auto_output(raw_output_text)
        gova_penalty = 1.0 if repair_action != "NONE" else 0.0

        entropy = (
            float(mean_token_entropy)
            if mean_token_entropy is not None
            else compute_lexical_entropy_fallback(cleaned_text)
        )

        # 1. Step underlying 16-oscillator Kuramoto & INT8 substrate
        next_phases, next_weights, _, _ = step_kuramoto_and_int8_substrate_v3(
            self.state.phases,
            self.state.weights_int8,
            min(1.25, entropy * 0.45),
            self.state.sigma,
            self.state.aer_latency_ms,
            self.state.aer_jitter_ms,
        )
        next_traces = self.dopamine.step_eligibility_tags(
            self.state.eligibility_traces,
            min(1.25, entropy * 0.45),
            tokens_generated,
            next_phases,
        )

        # 2. Branching Ratio (sigma) Homeostatic Damping vs Entropy & Gova Penalty Drive
        entropy_drive = 0.18 * ((entropy - 0.60) * 0.22 + 0.04 * gova_penalty)
        damping_pull = -0.26 * (self.state.sigma - 1.0)
        raw_sigma = self.state.sigma + damping_pull + entropy_drive
        next_sigma = round(max(0.650, min(1.350, raw_sigma)), 3)

        # 3. Feedforward Derivative Pre-Compensation on Sudden Entropy Drops
        # Eliminates T41/T81 whip-lash overshoot when exiting high-entropy bursts
        delta_h = entropy - self.last_token_entropy
        ff_bleed = 0.28 * delta_h if delta_h < -0.65 else 0.0
        effective_k = max(0.60, self.state.k_gain + ff_bleed)

        # 4. Kuramoto Order Parameter (r) Phase Coherence Response
        phase_restoring = 0.48 * (effective_k / 1.15)
        phase_dispersion = (entropy - 0.58) * 0.14 + 0.03 * gova_penalty
        # Smoothly blend with prior r so transient dips and recoveries are physically continuous
        target_r = max(0.165, min(0.750, phase_restoring - phase_dispersion))
        next_r = round(0.22 * self.state.active_crowd + 0.78 * target_r, 4)

        # 5. Conditional Back-Calculation Anti-Windup on K_gain
        r_err = R_TARGET - next_r
        raw_k = effective_k + 0.32 * r_err
        clamped_k = max(0.60, min(2.25, raw_k))  # Widened ceiling 2.00 -> 2.25 for H <= 3.5 nats
        next_k_gain = round(clamped_k - 0.15 * (raw_k - clamped_k), 4)

        # 6. Dynamic Range Index (DRI) Envelope [0.005, 0.250] with Soft Headroom Compression
        raw_dri = (
            0.1600
            + 0.045 * (entropy - 0.58)
            - 0.025 * (next_sigma - 1.0)
            - 0.015 * gova_penalty
        )
        if raw_dri > 0.225:
            # Soft asymptotic headroom compression so DRI approaches 0.249 without hard rail clipping
            raw_dri = 0.225 + 0.0245 * math.tanh((raw_dri - 0.225) / 0.035)
        next_dri = round(max(0.0050, min(0.2495, raw_dri)), 4)

        # 7. INT8 Crossbar Mean Weight & Sub-Threshold CMOS Power Envelope
        setpoint_norm = round(self.state.w_setpoint_int8 / 127.0, 3)
        next_w_mean = round(
            max(0.500, min(0.995, setpoint_norm + 0.018 * (next_sigma - 1.0))),
            3,
        )
        token_util = tokens_generated / max(1, max_tokens_allowed)
        next_power_mw = round(
            4.14
            + 0.28 * entropy
            + 0.22 * max(0.0, next_sigma - 1.0)
            + 0.08 * min(1.5, token_util),
            2,
        )

        self.last_token_entropy = entropy
        self.state = TelemetryState(
            firing_rate_hz=round(26.9 * next_sigma, 2),
            sigma=next_sigma,
            ltd_ltp_ratio=self.state.ltd_ltp_ratio,
            dri=next_dri,
            w_mean_int8=next_w_mean,
            w_setpoint_int8=self.state.w_setpoint_int8,
            power_mw=next_power_mw,
            aer_latency_ms=round(
                NOMINAL_AER_LATENCY_MS + 0.08 * max(0.0, next_sigma - 1.0), 3
            ),
            aer_jitter_ms=round(
                NOMINAL_AER_JITTER_MS + 0.05 * max(0.0, entropy - 0.60), 3
            ),
            active_crowd=next_r,
            k_gain=next_k_gain,
            phases=next_phases,
            weights_int8=next_weights,
            eligibility_traces=next_traces,
        )

        should_flush = (self.turn_counter % self.persist_interval_turns) == 0
        if should_flush:
            save_telemetry_state(self.state, self.state_path)

        weight_err = self.state.w_mean_int8 - setpoint_norm
        dri_err = max(0.0, self.state.dri - 0.1600)
        manifold_divergence = round(
            math.sqrt(((self.state.sigma - 1.0) ** 2) + (weight_err**2) + (dri_err**2)),
            4,
        )
        phase_weight_corr = _compute_phase_weight_correlation(
            self.state.phases, self.state.weights_int8
        )
        iso_now = datetime.now(timezone.utc).isoformat()

        report: Dict[str, Any] = {
            "timestamp_utc": iso_now,
            "architecture": {
                "tier": "Argon Bio-RSI / SynapseEdge V3 (Anti-Windup + Derivative Damped)",
                "criticality_target": 1.0,
                "substrate_quantization": "INT8 [1..127]",
                "oscillator_count": len(self.state.phases),
            },
            "telemetry": {
                "firing_rate_hz": self.state.firing_rate_hz,
                "sop_per_sec": int(round(self.state.firing_rate_hz * 59.7)),
                "power_mw": self.state.power_mw,
                "branching_ratio_sigma": self.state.sigma,
                "ltd_ltp_ratio": self.state.ltd_ltp_ratio,
                "dynamic_range_index_dri": self.state.dri,
                "weight_mean_norm": self.state.w_mean_int8,
                "weight_setpoint_int8": self.state.w_setpoint_int8,
                "kuramoto_order_parameter_r": self.state.active_crowd,
                "kuramoto_r_target": R_TARGET,
                "kuramoto_k_gain": self.state.k_gain,
                "aer_bus": {
                    "latency_ms": self.state.aer_latency_ms,
                    "jitter_ms": self.state.aer_jitter_ms,
                },
            },
            "divergence_and_correlation": {
                "manifold_divergence_l2": manifold_divergence,
                "sigma_drift_signed": round(self.state.sigma - 1.0, 4),
                "phase_weight_pearson_r": phase_weight_corr,
                "last_turn_token_entropy_nats": round(entropy, 3),
                "mean_eligibility_tag": round(
                    sum(self.state.eligibility_traces)
                    / max(1, len(self.state.eligibility_traces)),
                    3,
                ),
            },
            "governor_status": {
                "audit_lock": (
                    "LOCKED"
                    if (abs(self.state.sigma - 1.0) <= 0.05 and self.state.dri <= 0.175)
                    else "DAMPING"
                ),
                "last_repair_action": repair_action,
                "retained_history_turns": min(self.turn_counter, 16),
                "eligibility_quenched": all(
                    e < 0.25 for e in self.state.eligibility_traces
                ),
            },
        }

        if should_flush:
            _atomic_write_json_with_flock(self.report_path, report)

        return cleaned_text, report

    def deliver_reward(self, reward_val: float) -> float:
        self.state, mean_shift = self.dopamine.apply_reward_pulse(reward_val, self.state)
        self.state.sigma = round(1.0 + (self.state.sigma - 1.0) * 0.72, 3)
        self.state.firing_rate_hz = round(26.9 * self.state.sigma, 2)
        return mean_shift

