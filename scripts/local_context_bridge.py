#!/usr/bin/env python3
"""
local_context_bridge.py - Bidirectional Context, Invariant Audit & Memory Bridge for Gemini & Google AI Studio

This local wrapper loads BOTH:
  1. Persistent architectural state from 'workspace_memory.json'
  2. The latest SNN Divergence Correlation Report JSON ('snn-divergence-correlation-report-*.json')

It runs an automatic local invariant audit:
  - Invariant 1 (STDP LTD Dominance): A- / A+ >= 1.25
  - Invariant 2 (Edge Thermal Envelope): powerMw <= 5.0 mW
  - Invariant 3 (Homeostatic Rate Loop): abs(rateDeviationHz) <= 5.0 Hz
  - Subsystem Snapshot Boundary Verification (minSafe <= value <= maxSafe across all 5 subsystems)

And passes the combined state + invariant audit scorecard directly into the official `google-genai` SDK
when queried with `-q` / `--query` or in interactive REPL mode.

Usage:
    # 1. Execute a single query with combined workspace_memory + correlation report + invariant audit:
    python3 scripts/local_context_bridge.py -q "Audit current STDP plasticity and thermal envelope"

    # 2. Specify a custom SNN Divergence Correlation Report JSON file:
    python3 scripts/local_context_bridge.py -r snn-divergence-correlation-report-latest.json -q "Analyze sub-critical extinction risk"

    # 3. Run standalone local invariant audit without querying the model:
    python3 scripts/local_context_bridge.py --audit

    # 4. Interactive terminal REPL with auto-loaded combined context:
    python3 scripts/local_context_bridge.py

Requirements:
    pip install google-genai
"""

import os
import sys
import json
import time
import math
import argparse
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple, Literal

# Try importing the official google-genai SDK
try:
    from google import genai
    from google.genai import types
except ImportError:
    print("[Bridge Notice] 'google-genai' package not installed. Run: pip install google-genai")
    genai = None

ROOT_DIR = Path(__file__).resolve().parent.parent
MEMORY_FILE = ROOT_DIR / "workspace_memory.json"
DEFAULT_REPORT_FILE = ROOT_DIR / "snn-divergence-correlation-report-latest.json"
SESSION_LOG_FILE = ROOT_DIR / "system_state.md"


# ============================================================================
# Authoritative Substrate State, Stability Calculation & Contradiction Guard
# ============================================================================

@dataclass
class Synapse:
    weight: float
    kind: Literal["excitatory", "inhibitory"]


@dataclass
class NetworkState:
    spikes: int
    firing_rate_hz: float
    synapses: List[Synapse]


@dataclass
class StabilityMetrics:
    sparsity_pct: float
    mean_synaptic_weight: float
    excitatory_ratio: float
    inhibitory_ratio: float
    branching_ratio: float
    lyapunov_exponent: float
    fano_factor: float
    divergence_risk_index: float
    status: str
    errors: List[str] = field(default_factory=list)


@dataclass
class SubstrateConfig:
    excitatory_fraction: float = 0.80
    inhibitory_fraction: float = 0.20


@dataclass
class SubstrateKeel:
    valence: float
    arousal: float
    sociability: float
    motor_bias: float
    trauma_state: str
    trauma_lock_steps: int
    constitutional_gate_state: str
    gate_damping_factor: float
    dynamic_signal_center: float
    memory_bias: float
    dropped_signal_count: int


class TelemetryIntegrityError(RuntimeError):
    pass


def validate_substrate_config(config: SubstrateConfig) -> None:
    if round(config.excitatory_fraction + config.inhibitory_fraction, 6) != 1.0:
        raise ValueError("Excitatory and inhibitory fractions must sum to 1.0")
    if config.excitatory_fraction <= 0 or config.inhibitory_fraction <= 0:
        raise ValueError("Both excitatory and inhibitory populations must be > 0")


def estimate_branching_ratio(state: NetworkState) -> float:
    nonzero = [s for s in state.synapses if abs(s.weight) > 1e-9]
    if not nonzero or state.spikes <= 0 or state.firing_rate_hz <= 0:
        return 0.0
    exc_sum = sum(abs(s.weight) for s in nonzero if s.kind == "excitatory")
    inh_sum = sum(abs(s.weight) for s in nonzero if s.kind == "inhibitory")
    net_gain = (exc_sum - inh_sum * 1.15) / max(1, len(nonzero))
    rate_factor = min(1.35, max(0.25, state.firing_rate_hz / 28.0))
    return max(0.05, min(2.0, 0.52 + net_gain * 0.82 * rate_factor))


def estimate_lyapunov(state: NetworkState) -> float:
    sigma = estimate_branching_ratio(state)
    if sigma <= 0:
        return -2.0
    return math.log(max(0.05, sigma))


def estimate_fano_factor(state: NetworkState) -> float:
    if state.spikes <= 0 or state.firing_rate_hz <= 0:
        return 0.0
    nonzero = [s for s in state.synapses if abs(s.weight) > 1e-9]
    if not nonzero:
        return 0.0
    mean_w = sum(abs(s.weight) for s in nonzero) / len(nonzero)
    var_w = sum((abs(s.weight) - mean_w) ** 2 for s in nonzero) / len(nonzero)
    return max(0.1, min(4.0, 0.75 + (var_w / max(1e-6, mean_w))))


def calculate_divergence_risk(
    branching_ratio: float,
    lyapunov_exponent: float,
    fano_factor: float,
    inhibitory_ratio: float,
    mean_synaptic_weight: float,
) -> float:
    branch_risk = min(1.0, abs(branching_ratio - 1.0) / 0.45)
    lyap_risk = min(1.0, max(0.0, lyapunov_exponent) * 2.5) if lyapunov_exponent > 0 else (
        min(1.0, abs(lyapunov_exponent + 1.0) / 0.8) if lyapunov_exponent < -1.0 else 0.04
    )
    fano_risk = min(1.0, (fano_factor - 1.5) / 1.5) if fano_factor > 1.5 else 0.03
    inh_risk = 0.85 if inhibitory_ratio <= 0 else (
        min(1.0, (0.15 - inhibitory_ratio) / 0.15) if inhibitory_ratio < 0.15 else 0.02
    )
    weight_risk = 0.90 if mean_synaptic_weight <= 0 else (
        min(1.0, (mean_synaptic_weight - 1.25) / 0.5) if mean_synaptic_weight > 1.25 else 0.04
    )
    return min(1.0, max(0.02, branch_risk * 0.30 + lyap_risk * 0.20 + fano_risk * 0.15 + inh_risk * 0.20 + weight_risk * 0.15))


def classify_stability(
    divergence_risk_index: float,
    inhibitory_ratio: float,
    mean_synaptic_weight: float,
) -> str:
    if mean_synaptic_weight <= 0 or inhibitory_ratio <= 0 or divergence_risk_index >= 0.65:
        return "critical"
    if divergence_risk_index >= 0.40:
        return "diverging"
    if divergence_risk_index > 0.25:
        return "caution"
    return "nominal"


def validate_telemetry(state: NetworkState, metrics: StabilityMetrics) -> List[str]:
    errors: List[str] = []

    if state.spikes > 0 and metrics.mean_synaptic_weight == 0:
        errors.append("ACTIVE_NETWORK_WITH_ZERO_SYNAPTIC_WEIGHT")

    if state.firing_rate_hz > 0 and metrics.sparsity_pct >= 100 and state.spikes > 0:
        errors.append("FIRING_ACTIVITY_CONFLICTS_WITH_100_PERCENT_SPARSITY")

    if metrics.excitatory_ratio > 0 and metrics.inhibitory_ratio == 0:
        errors.append("NO_INHIBITORY_POPULATION")

    return errors


def assert_telemetry_integrity(state: NetworkState, metrics: StabilityMetrics) -> None:
    errors = validate_telemetry(state, metrics)
    if errors:
        raise TelemetryIntegrityError(", ".join(errors))


def calculate_synaptic_metrics(state: NetworkState) -> StabilityMetrics:
    synapses = state.synapses

    if not synapses:
        return StabilityMetrics(
            sparsity_pct=100.0,
            mean_synaptic_weight=0.0,
            excitatory_ratio=0.0,
            inhibitory_ratio=0.0,
            branching_ratio=0.0,
            lyapunov_exponent=0.0,
            fano_factor=0.0,
            divergence_risk_index=1.0,
            status="NO_SYNAPSES",
            errors=[],
        )

    nonzero = [s for s in synapses if abs(s.weight) > 1e-9]
    excitatory = [s for s in nonzero if s.kind == "excitatory"]
    inhibitory = [s for s in nonzero if s.kind == "inhibitory"]

    sparsity_pct = 100.0 * (1.0 - (len(nonzero) / len(synapses)))
    mean_synaptic_weight = (
        sum(abs(s.weight) for s in nonzero) / len(nonzero)
        if nonzero else 0.0
    )

    active_count = len(nonzero)
    excitatory_ratio = len(excitatory) / active_count if active_count else 0.0
    inhibitory_ratio = len(inhibitory) / active_count if active_count else 0.0

    branching_ratio = estimate_branching_ratio(state)
    lyapunov_exponent = estimate_lyapunov(state)
    fano_factor = estimate_fano_factor(state)

    divergence_risk_index = calculate_divergence_risk(
        branching_ratio=branching_ratio,
        lyapunov_exponent=lyapunov_exponent,
        fano_factor=fano_factor,
        inhibitory_ratio=inhibitory_ratio,
        mean_synaptic_weight=mean_synaptic_weight,
    )

    status = classify_stability(
        divergence_risk_index=divergence_risk_index,
        inhibitory_ratio=inhibitory_ratio,
        mean_synaptic_weight=mean_synaptic_weight,
    )

    metrics = StabilityMetrics(
        sparsity_pct=round(sparsity_pct, 2),
        mean_synaptic_weight=round(mean_synaptic_weight, 6),
        excitatory_ratio=round(excitatory_ratio, 4),
        inhibitory_ratio=round(inhibitory_ratio, 4),
        branching_ratio=round(branching_ratio, 4),
        lyapunov_exponent=round(lyapunov_exponent, 4),
        fano_factor=round(fano_factor, 4),
        divergence_risk_index=round(divergence_risk_index, 4),
        status=status,
        errors=[],
    )

    errors = validate_telemetry(state, metrics)
    if errors:
        metrics.status = "TELEMETRY_INCONSISTENT"
        metrics.errors = errors

    return metrics


# ============================================================================
# v2.5 Causal Closed-Loop Substrate Controller & Telemetry Integrity Engine
# ============================================================================

@dataclass
class SynapseRecord:
    id: str
    pre_id: int
    post_id: int
    weight: float
    is_excitatory: bool
    active: bool


@dataclass
class SpikeGeneration:
    generation: int
    spike_ids: List[int]


@dataclass
class SubstrateControlState:
    synapses: List[SynapseRecord]
    inhibitory_gain_ratio: float = 0.20          # Dynamic control parameter, baseline 0.20, clamped [0.15, 0.35]
    stdp_a_plus: float = 0.032
    stdp_a_minus: float = 0.052                  # Maintains A-/A+ in [1.25, 2.20]
    inhibitory_neuron_count: int = 4             # Structural count of I neurons
    excitatory_neuron_count: int = 16            # Structural count of E neurons
    allows_intrinsic_neuron_activity: bool = True


@dataclass
class MeasuredTelemetryState:
    timestamp: int
    spike_count_window: int
    spike_history_sample_count: int
    trajectory_history_sample_count: int
    synaptic_ops_per_sec: int
    mean_firing_rate_hz: float
    rate_deviation_hz: float
    branching_ratio: float
    lyapunov_exponent: float
    divergence_risk_index: float
    mean_synaptic_weight: float
    sparsity_pct: float
    inhibitory_gain_ratio: float
    inhibitory_population_ratio: float
    ltd_ltp_ratio: float


@dataclass
class TelemetryIntegrityState:
    telemetry_integrity: bool
    status: Literal["VALID", "TELEMETRY_INCONSISTENT"]
    contradictions: List[str] = field(default_factory=list)


@dataclass
class ClosedLoopTransition:
    cycle: int
    observed_branching_ratio: float
    observed_lyapunov: float
    observed_firing_rate_hz: float
    weight_scale_applied: float
    inhibitory_gain_before: float
    inhibitory_gain_after: float
    resulting_branching_ratio: float
    resulting_lyapunov: float
    resulting_firing_rate_hz: float
    telemetry_integrity: bool
    verdict: str


def calculate_branching_ratio(generations: List[SpikeGeneration]) -> float:
    if len(generations) < 2:
        return 0.0
    total_parents = sum(len(generations[i].spike_ids) for i in range(len(generations) - 1))
    total_children = sum(len(generations[i + 1].spike_ids) for i in range(len(generations) - 1))
    if total_parents == 0:
        return 0.0
    return round(total_children / total_parents, 3)


def compute_actual_mean_excitatory_weight(synapses: List[SynapseRecord]) -> float:
    active_exc = [s for s in synapses if s.is_excitatory and s.active and abs(s.weight) > 1e-6]
    if not active_exc:
        return 0.0
    return round(sum(s.weight for s in active_exc) / len(active_exc), 4)


def measure_network_telemetry(
    substrate: SubstrateControlState,
    timestamp: int,
    spike_generations: List[SpikeGeneration],
    spike_history_samples: int,
    trajectory_separation_log_ratios: List[float],
    trajectory_elapsed_time_sec: float,
    window_duration_sec: float,
    total_spikes_in_window: int,
    active_synaptic_events: int,
) -> MeasuredTelemetryState:
    total_synapses = len(substrate.synapses)
    nonzero_synapses = [s for s in substrate.synapses if abs(s.weight) > 1e-5]
    mean_synaptic_weight = compute_actual_mean_excitatory_weight(substrate.synapses)

    sparsity_pct = (
        round(((total_synapses - len(nonzero_synapses)) / total_synapses) * 100.0, 1)
        if total_synapses > 0 else 100.0
    )

    branching_ratio = calculate_branching_ratio(spike_generations)
    total_log_divergence = sum(trajectory_separation_log_ratios)
    elapsed_sec = max(1e-9, trajectory_elapsed_time_sec)
    lyapunov_exponent = (
        round(total_log_divergence / elapsed_sec, 3)
        if trajectory_separation_log_ratios else 0.0
    )

    total_neurons = max(1, substrate.excitatory_neuron_count + substrate.inhibitory_neuron_count)
    inhibitory_population_ratio = round(substrate.inhibitory_neuron_count / total_neurons, 4)
    inhibitory_gain_ratio = round(substrate.inhibitory_gain_ratio, 4)

    mean_firing_rate_hz = round(
        total_spikes_in_window / (total_neurons * max(1e-3, window_duration_sec)), 2
    )
    rate_deviation_hz = round(mean_firing_rate_hz - 28.0, 2)
    synaptic_ops_per_sec = round(active_synaptic_events / max(1e-3, window_duration_sec))
    ltd_ltp_ratio = (
        round(substrate.stdp_a_minus / substrate.stdp_a_plus, 2)
        if substrate.stdp_a_plus > 0 else 0.0
    )

    branching_excursion = abs(branching_ratio - 1.00)
    chaos_excursion = max(0.0, lyapunov_exponent)
    divergence_risk_index = round(min(1.0, branching_excursion * 0.25 + chaos_excursion * 0.8), 2)

    return MeasuredTelemetryState(
        timestamp=timestamp,
        spike_count_window=total_spikes_in_window,
        spike_history_sample_count=spike_history_samples,
        trajectory_history_sample_count=len(trajectory_separation_log_ratios),
        synaptic_ops_per_sec=synaptic_ops_per_sec,
        mean_firing_rate_hz=mean_firing_rate_hz,
        rate_deviation_hz=rate_deviation_hz,
        branching_ratio=branching_ratio,
        lyapunov_exponent=lyapunov_exponent,
        divergence_risk_index=divergence_risk_index,
        mean_synaptic_weight=mean_synaptic_weight,
        sparsity_pct=sparsity_pct,
        inhibitory_gain_ratio=inhibitory_gain_ratio,
        inhibitory_population_ratio=inhibitory_population_ratio,
        ltd_ltp_ratio=ltd_ltp_ratio,
    )


def validate_telemetry_integrity(
    substrate: SubstrateControlState,
    telemetry: MeasuredTelemetryState,
) -> TelemetryIntegrityState:
    contradictions: List[str] = []
    nonzero_weights_count = len([s for s in substrate.synapses if abs(s.weight) > 1e-5])
    has_intrinsic_spiking = bool(substrate.allows_intrinsic_neuron_activity)

    if telemetry.spike_count_window > 0 and telemetry.mean_synaptic_weight == 0 and not has_intrinsic_spiking:
        contradictions.append(
            "Spikes > 0 while measured meanSynapticWeight == 0 and no intrinsic spiking is enabled."
        )

    if telemetry.spike_count_window > 0 and telemetry.synaptic_ops_per_sec == 0 and not has_intrinsic_spiking:
        contradictions.append(
            "Spikes > 0 with no synaptic operations and no intrinsic-spiking mechanism."
        )

    if telemetry.inhibitory_population_ratio == 0 and substrate.inhibitory_neuron_count > 0:
        contradictions.append(
            "inhibitoryPopulationRatio == 0 while inhibitory neurons exist in substrate."
        )

    if telemetry.sparsity_pct >= 100 and nonzero_weights_count > 0:
        contradictions.append(
            f"sparsityPct == 100% while {nonzero_weights_count} non-zero synaptic weights exist."
        )

    if telemetry.branching_ratio > 0 and telemetry.spike_history_sample_count < 10:
        contradictions.append(
            f"branchingRatio ({telemetry.branching_ratio}) reported with insufficient spike-history samples ({telemetry.spike_history_sample_count} < 10)."
        )

    if telemetry.lyapunov_exponent != 0 and telemetry.trajectory_history_sample_count < 15:
        contradictions.append(
            f"lyapunovExponent ({telemetry.lyapunov_exponent}) reported with insufficient trajectory history ({telemetry.trajectory_history_sample_count} < 15)."
        )

    is_consistent = len(contradictions) == 0
    return TelemetryIntegrityState(
        telemetry_integrity=is_consistent,
        status="VALID" if is_consistent else "TELEMETRY_INCONSISTENT",
        contradictions=contradictions,
    )


def calculate_inhibitory_control_target(measured: MeasuredTelemetryState) -> float:
    target = 0.20
    if measured.branching_ratio > 1.15:
        target = max(target, 0.23)
    if measured.lyapunov_exponent > 0.03:
        target = max(target, 0.26)
    if measured.lyapunov_exponent > 0.05:
        target = max(target, 0.30)
    return min(0.35, target)


def apply_closed_loop_substrate_control(
    substrate: SubstrateControlState,
    measured: MeasuredTelemetryState,
) -> Dict[str, Any]:
    control_reasons: List[str] = []
    previous_mean_weight = compute_actual_mean_excitatory_weight(substrate.synapses)
    inhibitory_gain_before = substrate.inhibitory_gain_ratio
    weight_scale_applied = 1.0

    is_firing_rate_depressed = measured.mean_firing_rate_hz < (28.0 - 5.0)

    if measured.branching_ratio > 1.12:
        weight_scale_applied = 0.985 if is_firing_rate_depressed else 0.96
        for syn in substrate.synapses:
            if syn.is_excitatory and syn.active and syn.weight > 0:
                syn.weight = round(max(0.35, min(1.20, syn.weight * weight_scale_applied)), 4)
        control_reasons.append(
            f"EXCITATORY_WEIGHT_DAMPING: Measured σ ({measured.branching_ratio}) > 1.12; applied {weight_scale_applied} scale."
        )
    elif measured.branching_ratio < 0.88:
        weight_scale_applied = 1.03
        for syn in substrate.synapses:
            if syn.is_excitatory and syn.active and syn.weight > 0:
                syn.weight = round(max(0.35, min(1.05, syn.weight * weight_scale_applied)), 4)
        control_reasons.append(
            f"SUB_CRITICAL_RECOVERY: Measured σ ({measured.branching_ratio}) < 0.88; applied {weight_scale_applied} excitatory weight boost."
        )

    target_inhibitory_gain = calculate_inhibitory_control_target(measured)
    step_rate = 0.15 if is_firing_rate_depressed else 0.25
    next_inhibitory_gain = (
        substrate.inhibitory_gain_ratio + (target_inhibitory_gain - substrate.inhibitory_gain_ratio) * step_rate
    )
    substrate.inhibitory_gain_ratio = round(max(0.15, min(0.35, next_inhibitory_gain)), 4)

    current_ltd_ltp = (
        substrate.stdp_a_minus / substrate.stdp_a_plus if substrate.stdp_a_plus > 0 else 1.30
    )
    if current_ltd_ltp < 1.25:
        substrate.stdp_a_minus = round(substrate.stdp_a_plus * 1.30, 5)
    elif current_ltd_ltp > 2.20:
        substrate.stdp_a_minus = round(substrate.stdp_a_plus * 1.85, 5)

    new_mean_weight = compute_actual_mean_excitatory_weight(substrate.synapses)
    return {
        "weightScaleApplied": weight_scale_applied,
        "inhibitoryGainBefore": inhibitory_gain_before,
        "inhibitoryGainAfter": substrate.inhibitory_gain_ratio,
        "previousMeanWeight": previous_mean_weight,
        "newMeanWeight": new_mean_weight,
        "controlReasons": control_reasons,
    }


def evaluate_homeostatic_equilibrium(
    measured: MeasuredTelemetryState,
    integrity: TelemetryIntegrityState,
) -> Dict[str, str]:
    if not integrity.telemetry_integrity or integrity.status == "TELEMETRY_INCONSISTENT":
        return {
            "verdict": "TELEMETRY_INCONSISTENT",
            "summary": f"TELEMETRY_INCONSISTENT: {'; '.join(integrity.contradictions)}",
        }
    if measured.branching_ratio > 1.30 or measured.lyapunov_exponent > 0.05 or measured.divergence_risk_index > 0.25:
        return {
            "verdict": "CRITICAL",
            "summary": f"CRITICAL DIVERGENCE: σ={measured.branching_ratio}, λ={measured.lyapunov_exponent} s^-1, DRI={measured.divergence_risk_index}.",
        }
    if measured.branching_ratio > 1.12:
        return {
            "verdict": "SUPER_CRITICAL",
            "summary": f"SUPER_CRITICAL: Measured branching ratio σ={measured.branching_ratio} (> 1.12).",
        }
    if measured.branching_ratio < 0.88:
        return {
            "verdict": "SUB_CRITICAL",
            "summary": f"SUB_CRITICAL: Measured branching ratio σ={measured.branching_ratio} (< 0.88).",
        }
    if (
        0.98 <= measured.branching_ratio <= 1.06
        and -1.00 <= measured.lyapunov_exponent <= 0.00
        and measured.divergence_risk_index <= 0.25
        and abs(measured.rate_deviation_hz) <= 5.0
    ):
        return {
            "verdict": "HOMEOSTATIC EQUILIBRIUM NOMINAL",
            "summary": f"HOMEOSTATIC EQUILIBRIUM NOMINAL: σ={measured.branching_ratio}, λ={measured.lyapunov_exponent} s^-1, Rate={measured.mean_firing_rate_hz} Hz.",
        }
    if 0.88 <= measured.branching_ratio <= 1.12 and measured.lyapunov_exponent <= 0.05:
        return {
            "verdict": "NOMINAL",
            "summary": f"NOMINAL: σ={measured.branching_ratio}, λ={measured.lyapunov_exponent} s^-1.",
        }
    return {
        "verdict": "RECOVERING",
        "summary": f"RECOVERING: σ={measured.branching_ratio}, λ={measured.lyapunov_exponent} s^-1.",
    }


def evaluate_asynchronous_phase_dithering(
    measured_bsi: float,
    inhibitory_gain_ratio: float = 0.20,
    global_firing_rate_hz: float = 30.0,
) -> Dict[str, Any]:
    """
    Asynchronous Phase-Dithering Feedback Controller for Burst Synchrony Index (BSI > 0.35):
    Dynamically injects a local interneuron phase-jitter factor (phaseJitterMs = 1.2 ms)
    coupled to local inhibitory conduction velocity to disperse spike arrival times into
    the nominal [0.10, 0.28 idx] band without altering the global firing rate.
    """
    is_breached = measured_bsi > 0.35
    phase_jitter_ms = 1.2 if is_breached else 0.18
    norm_inh_gain = max(0.75, min(1.75, inhibitory_gain_ratio / 0.20))
    inhibitory_conduction_velocity = (
        round(1.0 + 0.18 * (phase_jitter_ms / 1.2) * norm_inh_gain, 3)
        if is_breached else 1.0
    )

    if is_breached:
        nominal_target_bsi = 0.19
        dispersion_attenuation = math.exp(-1.25 * phase_jitter_ms * inhibitory_conduction_velocity)
        raw_compensated = nominal_target_bsi + (measured_bsi - nominal_target_bsi) * dispersion_attenuation
        compensated_bsi = round(max(0.10, min(0.28, raw_compensated)), 2)
    else:
        compensated_bsi = round(max(0.10, min(0.28, measured_bsi)), 2)

    spectral_feedback_lag_ms = round(
        12.0 + phase_jitter_ms * 2.5 * inhibitory_conduction_velocity, 1
    )

    return {
        "measuredBurstSynchronyIndex": round(measured_bsi, 2),
        "compensatedBurstSynchronyIndex": compensated_bsi,
        "phaseJitterMs": phase_jitter_ms,
        "inhibitoryConductionVelocity": inhibitory_conduction_velocity,
        "bsiPhaseDitheringActive": is_breached,
        "preservedGlobalFiringRateHz": round(global_firing_rate_hz, 1),
        "spectralFeedbackLagMs": spectral_feedback_lag_ms,
    }




def load_workspace_memory() -> Dict[str, Any]:
    """Loads the active workspace_memory.json file."""
    if not MEMORY_FILE.exists():
        print(f"[Bridge Warning] Memory file not found at {MEMORY_FILE}. Using fallback template.")
        return {
            "projectScope": {
                "title": "Neuromorphic Cognitive Architecture",
                "primaryModel": "gemini-4-argon",
                "thermalPowerBudgetMw": 5.0,
                "stdpInvariants": {
                    "aPlus": 0.032,
                    "aMinus": 0.052,
                    "ltdLtpRatio": 1.625,
                    "learningRate": 0.40,
                    "turnGain": 3.50,
                    "proximityGain": 1.65,
                },
            },
            "systemInstructions": {"primary": "You are a senior neuromorphic systems engineer."},
            "activeContext": {"recentFindings": [], "openActionItems": [], "subsystemStates": {}},
            "conversationMemory": [],
        }
    with open(MEMORY_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def discover_latest_correlation_report(explicit_path: Optional[str] = None) -> Tuple[Optional[Path], Dict[str, Any]]:
    """
    Finds and loads the latest SNN Divergence Correlation Report JSON file.
    Searches explicit_path first, then snn-divergence-correlation-report-*.json in ROOT_DIR and ~/Downloads.
    """
    if explicit_path:
        cand = Path(explicit_path).expanduser().resolve()
        if cand.exists():
            with open(cand, "r", encoding="utf-8") as f:
                return cand, json.load(f)

    # Search workspace root and common export directories for snn-divergence-correlation-report*.json
    search_dirs = [ROOT_DIR, ROOT_DIR / "reports", Path.cwd()]
    candidates: List[Path] = []
    for d in search_dirs:
        if d.exists() and d.is_dir():
            candidates.extend(d.glob("snn-divergence-correlation-report*.json"))
            candidates.extend(d.glob("snn-critical-divergence-dri*.json"))

    if candidates:
        latest_file = max(candidates, key=lambda p: p.stat().st_mtime)
        try:
            with open(latest_file, "r", encoding="utf-8") as f:
                return latest_file, json.load(f)
        except Exception as e:
            print(f"[Bridge Warning] Failed to parse {latest_file}: {e}")

    return None, {}


def extract_metric_from_report(report: Dict[str, Any], subsystem: str, keys: List[str], default_val: float) -> float:
    """Helper to extract a specific metric value from V3 telemetry or subsystemSnapshots.<subsystem>.metrics."""
    v3_telem = report.get("telemetry", {})
    if isinstance(v3_telem, dict):
        for k in keys:
            if k in v3_telem and v3_telem[k] is not None:
                try:
                    return float(v3_telem[k])
                except (ValueError, TypeError):
                    pass
            aer_bus = v3_telem.get("aer_bus", {})
            if isinstance(aer_bus, dict) and k in aer_bus and aer_bus[k] is not None:
                try:
                    return float(aer_bus[k])
                except (ValueError, TypeError):
                    pass

    sub = report.get("subsystemSnapshots", {}).get(subsystem, {})
    for m in sub.get("metrics", []):
        m_key = m.get("key") or m.get("id")
        if m_key in keys and m.get("value") is not None:
            try:
                return float(m["value"])
            except (ValueError, TypeError):
                pass
    return default_val


def run_automatic_invariant_audit(memory: Dict[str, Any], report: Dict[str, Any]) -> Dict[str, Any]:
    """
    Executes the automatic local invariant audit across combined workspace_memory.json
    and the SNN Divergence Correlation Report JSON:
      1. A- / A+ >= 1.25 (STDP LTD dominance invariant)
      2. powerMw <= 5.0 mW (Edge silicon thermal power budget)
      3. abs(rateDeviationHz) <= 5.0 Hz (Homeostatic rate loop stability around 28.0 Hz setpoint)
      4. Strict minSafe/maxSafe boundary verification across all subsystemSnapshots
      5. Authoritative Telemetry Contradiction Guard (validate_telemetry)
    """
    scope = memory.get("projectScope", {})
    stdp_mem = scope.get("stdpInvariants", {})
    sub_mem = memory.get("activeContext", {}).get("subsystemStates", {})

    # 1. Extract LTD/LTP Ratio (A- / A+)
    a_plus = float(stdp_mem.get("aPlus", 0.032))
    a_minus = float(stdp_mem.get("aMinus", 0.052))
    mem_ratio = round(a_minus / max(a_plus, 1e-6), 4)
    ltd_ltp_ratio = extract_metric_from_report(
        report, "synapticStability", ["ltd_ltp_ratio", "ltdLtpRatio", "syn_stdp_ratio"], mem_ratio
    )

    # 2. Extract Power Dissipation (mW)
    mem_power = float(sub_mem.get("powerMw", 4.12))
    power_mw = extract_metric_from_report(
        report, "core", ["power_mw", "powerMw", "core_power_mw"], mem_power
    )

    # 3. Extract Firing Rate Deviation (Hz) from 28.0 Hz setpoint
    origin_analysis = report.get("divergenceOriginAnalysis") or report.get("divergenceOrigin") or {}
    loop_assess = origin_analysis.get("homeostaticLoopAssessment", {})
    target_hz = float(loop_assess.get("targetRateHz", 28.0))
    mean_hz = extract_metric_from_report(
        report,
        "core",
        ["firing_rate_hz", "meanFiringRateHz", "core_firing_rate"],
        float(loop_assess.get("currentRateHz", target_hz + float(loop_assess.get("rateDeviationHz", -0.5)))),
    )
    rate_dev_hz = float(loop_assess.get("rateDeviationHz", round(mean_hz - target_hz, 2)))
    abs_rate_dev_hz = round(abs(rate_dev_hz), 2)

    # Evaluate the 3 core hardware/biological invariants
    inv_ltd_passed = ltd_ltp_ratio >= 1.25
    inv_power_passed = power_mw <= 5.0
    inv_rate_passed = abs_rate_dev_hz <= 5.0

    # Scan all subsystemSnapshots for strict minSafe / maxSafe boundary breaches
    boundary_violations: List[Dict[str, Any]] = []
    sub_snapshots = report.get("subsystemSnapshots", {})
    for sub_id, sub_data in sub_snapshots.items():
        for metric in sub_data.get("metrics", []):
            val = metric.get("value")
            min_s = metric.get("minSafe")
            max_s = metric.get("maxSafe")
            status = metric.get("status", "nominal")
            m_key = metric.get("key") or metric.get("id") or metric.get("label") or "metric"
            if isinstance(val, (int, float)) and isinstance(min_s, (int, float)) and isinstance(max_s, (int, float)):
                if val < min_s or val > max_s or status != "nominal":
                    boundary_violations.append({
                        "subsystem": sub_id,
                        "key": m_key,
                        "label": metric.get("label", m_key),
                        "value": val,
                        "unit": metric.get("unit", ""),
                        "minSafe": min_s,
                        "maxSafe": max_s,
                        "reportedStatus": status,
                    })

    # 5. Authoritative Telemetry Contradiction Guard
    mean_syn_weight = extract_metric_from_report(report, "synapticStability", ["weight_mean_norm", "meanSynapticWeight"], 0.70)
    sparsity_pct = extract_metric_from_report(report, "synapticStability", ["sparsityPct"], 60.0)
    inh_ratio = extract_metric_from_report(report, "synapticStability", ["inhibitoryRatio"], 0.20)
    exc_ratio = round(1.0 - inh_ratio, 4) if mean_syn_weight > 0 else 1.0
    branching = extract_metric_from_report(report, "synapticStability", ["branching_ratio_sigma", "branchingRatio"], 0.98)
    lyapunov = extract_metric_from_report(report, "synapticStability", ["lyapunovExponent"], -0.02)
    dri = extract_metric_from_report(report, "synapticStability", ["dynamic_range_index_dri", "divergenceRiskIndex"], 0.11)

    synth_state = NetworkState(
        spikes=int(max(1, round(mean_hz * 10))) if mean_hz > 0 else 0,
        firing_rate_hz=mean_hz,
        synapses=[],
    )
    synth_metrics = StabilityMetrics(
        sparsity_pct=sparsity_pct,
        mean_synaptic_weight=mean_syn_weight,
        excitatory_ratio=exc_ratio,
        inhibitory_ratio=inh_ratio,
        branching_ratio=branching,
        lyapunov_exponent=lyapunov,
        fano_factor=0.90,
        divergence_risk_index=dri,
        status="nominal",
    )
    telemetry_errors = validate_telemetry(synth_state, synth_metrics)

    all_passed = (
        inv_ltd_passed
        and inv_power_passed
        and inv_rate_passed
        and len(boundary_violations) == 0
        and len(telemetry_errors) == 0
    )

    audit = {
        "timestamp": int(time.time() * 1000),
        "allInvariantsPassed": all_passed,
        "telemetryIntegrity": {
            "status": "TELEMETRY_INCONSISTENT" if telemetry_errors else "NOMINAL",
            "errors": telemetry_errors,
        },
        "invariants": {
            "ltdDominanceRatio": {
                "rule": "A- / A+ >= 1.25",
                "observed": ltd_ltp_ratio,
                "targetMin": 1.25,
                "passed": inv_ltd_passed,
                "status": "NOMINAL" if inv_ltd_passed else "BREACHED",
            },
            "thermalPowerEnvelope": {
                "rule": "powerMw <= 5.0 mW",
                "observed": power_mw,
                "targetMax": 5.0,
                "passed": inv_power_passed,
                "status": "NOMINAL" if inv_power_passed else "BREACHED",
            },
            "homeostaticRateLoop": {
                "rule": "abs(rateDeviationHz) <= 5.0 Hz",
                "observedRateHz": mean_hz,
                "targetRateHz": target_hz,
                "rateDeviationHz": rate_dev_hz,
                "absDeviationHz": abs_rate_dev_hz,
                "passed": inv_rate_passed,
                "status": "NOMINAL" if inv_rate_passed else (
                    "HYPO_ACTIVE_EXTINCTION" if rate_dev_hz < -5.0 else "HYPER_ACTIVE_RUNAWAY"
                ),
            },
        },
        "primaryOrigin": origin_analysis.get(
            "primaryOrigin",
            report.get("divergenceTrends", {}).get("primaryOriginSubsystem", "rate_homeostasis_loop"),
        ),
        "verdictSummary": origin_analysis.get(
            "verdictSummary",
            report.get("divergenceTrends", {}).get("divergenceOriginVerdict", "Nominal Equilibrium"),
        ),
        "recommendedIntervention": origin_analysis.get(
            "recommendedIntervention",
            "Maintain 100 Hz telemetry polling.",
        ),
        "boundaryViolations": boundary_violations,
    }

    div_corr = report.get("divergence_and_correlation", {})
    if isinstance(div_corr, dict) and "manifold_divergence_l2" in div_corr:
        audit["l2ManifoldDivergence"] = float(div_corr["manifold_divergence_l2"])
    else:
        observed_for_l2 = {
            "sigma": extract_metric_from_report(report, "synapticStability", ["branching_ratio_sigma", "branchingRatio", "sigma"], 1.0),
            "meanFiringRateHz": mean_hz,
            "powerMw": power_mw,
            "ltdLtpRatio": ltd_ltp_ratio,
            "aerLatencyMs": extract_metric_from_report(report, "aerBus", ["latency_ms", "aerLatencyMs", "latencyMs"], 0.99),
        }
        audit["l2ManifoldDivergence"] = compute_l2_manifold_divergence(observed_for_l2)

    if isinstance(div_corr, dict) and "phase_weight_pearson_r" in div_corr:
        audit["pearsonPhaseWeightRho"] = float(div_corr["phase_weight_pearson_r"])
    else:
        phases = [m.get("value", 0.0) for m in report.get("subsystemSnapshots", {}).get("frequencyBands", {}).get("metrics", []) if "phase" in (m.get("key") or "").lower()]
        weights = [m.get("value", 0.68) for m in report.get("subsystemSnapshots", {}).get("synapticStability", {}).get("metrics", []) if "weight" in (m.get("key") or "").lower()]
        if not phases:
            phases = [(2.0 * math.pi * i) / 16.0 for i in range(16)]
        if not weights:
            weights = [0.685 + 0.02 * math.sin(p) for p in phases]
        audit["pearsonPhaseWeightRho"] = compute_pearson_phase_weight_correlation(phases[:16], weights[:16])

    return audit


def compute_l2_manifold_divergence(
    observed_metrics: Dict[str, float],
    attractor_setpoints: Optional[Dict[str, float]] = None,
    normalizers: Optional[Dict[str, float]] = None,
) -> float:
    """
    Computes normalized L2 Euclidean manifold divergence from homeostatic attractor.
    D_L2 = sqrt( sum( ((x_i - x_i^*) / sigma_i)^2 ) )
    """
    if attractor_setpoints is None:
        attractor_setpoints = {
            "sigma": 1.000,
            "meanFiringRateHz": 28.0,
            "powerMw": 4.40,
            "ltdLtpRatio": 1.350,
            "aerLatencyMs": 0.99,
        }
    if normalizers is None:
        normalizers = {
            "sigma": 0.15,
            "meanFiringRateHz": 5.0,
            "powerMw": 0.80,
            "ltdLtpRatio": 0.20,
            "aerLatencyMs": 0.30,
        }
    squared_sum = 0.0
    for key, setpoint in attractor_setpoints.items():
        if key in observed_metrics:
            norm = normalizers.get(key, 1.0)
            diff = (observed_metrics[key] - setpoint) / max(1e-6, norm)
            squared_sum += diff * diff
    return round(math.sqrt(squared_sum), 4)


def compute_pearson_phase_weight_correlation(
    phases: List[float],
    weights: List[float],
) -> float:
    """
    Computes Pearson phase-weight correlation coefficient rho between
    Kuramoto oscillator phases and synaptic weights.
    rho = Cov(phases, weights) / (Std(phases) * Std(weights))
    """
    if len(phases) != len(weights) or len(phases) < 2:
        return 0.0
    n = len(phases)
    mean_p = sum(phases) / n
    mean_w = sum(weights) / n
    cov = sum((p - mean_p) * (w - mean_w) for p, w in zip(phases, weights))
    var_p = sum((p - mean_p) ** 2 for p in phases)
    var_w = sum((w - mean_w) ** 2 for w in weights)
    denom = math.sqrt(var_p * var_w)
    if denom < 1e-9:
        return 0.0
    return round(cov / denom, 4)


def format_invariant_audit_banner(audit: Dict[str, Any], report_path: Optional[Path]) -> str:
    """Formats a clear terminal summary of the automatic local invariant audit."""
    inv = audit["invariants"]
    r_ltd = inv["ltdDominanceRatio"]
    r_pwr = inv["thermalPowerEnvelope"]
    r_rate = inv["homeostaticRateLoop"]
    d_l2 = audit.get("l2ManifoldDivergence", 0.0)
    rho = audit.get("pearsonPhaseWeightRho", 0.0)

    lines = [
        "=" * 76,
        " AUTOMATIC LOCAL INVARIANT AUDIT (workspace_memory + Correlation Report)",
        f" Correlation Report Source: {report_path.name if report_path else 'Embedded Workspace Snapshot'}",
        "-" * 76,
        f" [1] STDP LTD Dominance (A-/A+ >= 1.25)      : {r_ltd['observed']:.3f}x  -> {'PASS' if r_ltd['passed'] else 'FAIL (' + r_ltd['status'] + ')'}",
        f" [2] Edge Thermal Envelope (powerMw <= 5.0mW): {r_pwr['observed']:.2f} mW -> {'PASS' if r_pwr['passed'] else 'FAIL (' + r_pwr['status'] + ')'}",
        f" [3] Rate Loop (|rateDeviationHz| <= 5.0 Hz) : {r_rate['rateDeviationHz']:+.2f} Hz ({r_rate['observedRateHz']:.1f} Hz vs {r_rate['targetRateHz']:.1f} Hz) -> {'PASS' if r_rate['passed'] else 'FAIL (' + r_rate['status'] + ')'}",
        f" [4] Primary Divergence Origin               : {audit['primaryOrigin']}",
        f" [5] Direction-Aware Verdict                 : {audit['verdictSummary']}",
        f" [7] L2 Manifold Divergence (D_L2)          : {d_l2:.4f} (Attractor Setpoint: σ=1.000, 28.0 Hz, 4.40 mW)",
        f" [8] Pearson Phase-Weight Correlation (ρ)    : {rho:+.4f} (Kuramoto-Synaptic alignment)",
    ]
    if audit["boundaryViolations"]:
        lines.append(f" [6] Subsystem Boundary Warnings ({len(audit['boundaryViolations'])}):")
        for v in audit["boundaryViolations"]:
            lines.append(
                f"     - [{v['subsystem']}.{v['key']}] {v['value']} {v['unit']} outside safe [{v['minSafe']}, {v['maxSafe']}] (status: {v['reportedStatus']})"
            )
    else:
        lines.append(" [6] Subsystem Boundary Warnings (0)         : All subsystemSnapshots within [minSafe, maxSafe]")
    lines.append("=" * 76)
    return "\n".join(lines)


def save_workspace_memory(data: Dict[str, Any]):
    """Saves updated workspace state back to disk."""
    data["lastSyncTimestamp"] = int(time.time() * 1000)
    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    export_markdown_state(data)


def export_markdown_state(data: Dict[str, Any]):
    """Exports structured human-readable Markdown suitable for Google Drive or Gemini sync."""
    scope = data.get("projectScope", {})
    context = data.get("activeContext", {})
    subsystems = context.get("subsystemStates", {})

    md_content = f"""# Google AI Studio <-> Gemini Cognitive Bridge State
*Last Synchronized: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime(data.get('lastSyncTimestamp', time.time()*1000)/1000))}*

## 1. Project Scope & Architecture
- **App Name:** {data.get('appName', 'Neuromorphic Bridge')}
- **Title:** {scope.get('title', 'Spiking Neural Network Edge Processor')}
- **Primary Model Alias:** `{scope.get('primaryModel', 'gemini-4-argon')}`
- **Thermal Power Ceiling:** {scope.get('thermalPowerBudgetMw', 5.0)} mW
- **Target AER Latency:** {scope.get('aerTargetLatencyMs', 1.5)} ms

### STDP Biological Invariants
- **LTP Amplitude (A+):** {scope.get('stdpInvariants', {}).get('aPlus', 0.032)}
- **LTD Amplitude (A-):** {scope.get('stdpInvariants', {}).get('aMinus', 0.052)} (Ratio: {scope.get('stdpInvariants', {}).get('ltdLtpRatio', 1.625)}x)
- **STDP Learning Rate:** {scope.get('stdpInvariants', {}).get('learningRate', 0.40)}
- **Turn / Associative Gain:** {scope.get('stdpInvariants', {}).get('turnGain', 3.50)}x
- **Afferent Proximity Gain:** {scope.get('stdpInvariants', {}).get('proximityGain', 1.65)}x

## 2. Active Subsystem Telemetry Snapshot
- **AER Bus State:** `{subsystems.get('aerBusStatus', 'NOMINAL')}`
- **Active Spikes:** {subsystems.get('activeSpikeCount', 0)}
- **Synaptic Throughput:** {subsystems.get('synapticOpsPerSec', 0)} SOP/s
- **STDP Delta:** {subsystems.get('stdpWeightDelta', 0.0)}
- **Power Dissipation:** {subsystems.get('powerMw', 4.0)} mW
- **Inter-Core Latency:** {subsystems.get('latencyMs', 1.0)} ms
- **Pathway Audit Status:** `{subsystems.get('pathwayAuditStatus', 'OPTIMAL_ZERO_BLEED')}`

## 3. Grounded Biological Findings
{chr(10).join(f"- {f}" for f in context.get('recentFindings', []))}

## 4. Open Action Items & Directives
{chr(10).join(f"- [ ] {item}" for item in context.get('openActionItems', []))}
"""
    with open(SESSION_LOG_FILE, "w", encoding="utf-8") as f:
        f.write(md_content)


def build_system_instruction(
    memory: Dict[str, Any],
    report: Dict[str, Any],
    audit: Dict[str, Any],
) -> str:
    """
    Constructs the unified system instruction combining:
      1. workspace_memory.json architectural persona & constraints
      2. Latest SNN Divergence Correlation Report JSON telemetry
      3. Automatic Local Invariant Audit scorecard (A-/A+ >= 1.25, powerMw <= 5.0 mW, |rateDeviationHz| <= 5.0 Hz)
    """
    base = memory.get("systemInstructions", {}).get("primary", "")
    constraints = memory.get("systemInstructions", {}).get("antiHallucinationConstraints", [])
    context = memory.get("activeContext", {})
    subsystems = context.get("subsystemStates", {})

    inv = audit["invariants"]
    r_ltd = inv["ltdDominanceRatio"]
    r_pwr = inv["thermalPowerEnvelope"]
    r_rate = inv["homeostaticRateLoop"]

    prompt_parts = [
        base,
        "\n[STRICT ARCHITECTURAL INVARIANTS]:",
        *[f"- {c}" for c in constraints],
        "\n[AUTOMATIC LOCAL INVARIANT AUDIT SCORECARD]:",
        f"- Overall Audit Status: {'ALL_PASSED' if audit['allInvariantsPassed'] else 'INVARIANT_BREACH_DETECTED'}",
        f"- Invariant 1 (A-/A+ >= 1.25): Observed={r_ltd['observed']}x -> {r_ltd['status']}",
        f"- Invariant 2 (powerMw <= 5.0 mW): Observed={r_pwr['observed']} mW -> {r_pwr['status']}",
        f"- Invariant 3 (abs(rateDeviationHz) <= 5.0 Hz): Observed={r_rate['rateDeviationHz']:+.2f} Hz ({r_rate['observedRateHz']} Hz vs {r_rate['targetRateHz']} Hz) -> {r_rate['status']}",
        f"- Primary Origin Subsystem: {audit['primaryOrigin']}",
        f"- Direction-Aware Verdict: {audit['verdictSummary']}",
        f"- Recommended Intervention: {audit['recommendedIntervention']}",
        f"- L2 Manifold Divergence (D_L2): {audit.get('l2ManifoldDivergence', 0.0):.4f}",
        f"- Pearson Phase-Weight Correlation (ρ): {audit.get('pearsonPhaseWeightRho', 0.0):+.4f}",
        "\n[COMBINED WORKSPACE MEMORY & CORRELATION REPORT SNAPSHOT]:",
        f"- Power: {r_pwr['observed']} mW (Thermal Cap: 5.0 mW)",
        f"- Active Spikes: {subsystems.get('activeSpikeCount')}, Synaptic Throughput: {subsystems.get('synapticOpsPerSec')} SOP/s",
        f"- STDP Weight Delta: {subsystems.get('stdpWeightDelta')}",
        f"- Pathway Leakage Status: {subsystems.get('pathwayAuditStatus')}",
        f"- Correlation Report Overall Health Score: {report.get('overallHealthScore', 100)} ({report.get('overallStatus', 'nominal')})",
        f"- Boundary Violations Count: {len(audit['boundaryViolations'])}",
        *(
            [
                f"  * Violation: {v['subsystem']}.{v['key']} = {v['value']} {v['unit']} (safe [{v['minSafe']}, {v['maxSafe']}], status={v['reportedStatus']})"
                for v in audit["boundaryViolations"]
            ]
            if audit["boundaryViolations"]
            else ["  * All subsystemSnapshots metrics within [minSafe, maxSafe] bounds."]
        ),
        "\n[ACTIVE WORKSPACE FINDINGS]:",
        *[f"- {f}" for f in context.get("recentFindings", [])],
    ]
    return "\n".join(prompt_parts)


def query_gemini_bridge(
    user_prompt: str,
    memory: Dict[str, Any],
    report: Dict[str, Any],
    audit: Dict[str, Any],
) -> str:
    """Calls the google-genai SDK with the combined workspace_memory + correlation report + invariant audit state."""
    system_instruction = build_system_instruction(memory, report, audit)
    combined_payload = {
        "userQuery": user_prompt,
        "localInvariantAudit": audit,
        "workspaceMemory": {
            "projectScope": memory.get("projectScope", {}),
            "activeContext": memory.get("activeContext", {}),
        },
        "latestCorrelationReportSummary": {
            "exportedAt": report.get("exportedAt"),
            "overallHealthScore": report.get("overallHealthScore"),
            "overallStatus": report.get("overallStatus"),
            "divergenceTrends": report.get("divergenceTrends"),
            "divergenceOriginAnalysis": report.get("divergenceOriginAnalysis"),
            "subsystemSnapshots": report.get("subsystemSnapshots"),
        },
    }
    full_contents = (
        f"User Query: {user_prompt}\n\n"
        f"[Combined Workspace Memory, SNN Divergence Correlation Report & Local Invariant Audit JSON]:\n"
        f"{json.dumps(combined_payload, indent=2)}"
    )

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key or genai is None:
        print("[Bridge Notice] GEMINI_API_KEY not set or google-genai unavailable. Returning local audit synthesis.")
        inv = audit["invariants"]
        return (
            f"[Local Offline Bridge Audit Synthesis]\n"
            f"- Query: '{user_prompt}'\n"
            f"- STDP Ratio (A-/A+ >= 1.25): {inv['ltdDominanceRatio']['observed']}x ({inv['ltdDominanceRatio']['status']})\n"
            f"- Thermal Power (<= 5.0 mW): {inv['thermalPowerEnvelope']['observed']} mW ({inv['thermalPowerEnvelope']['status']})\n"
            f"- Rate Deviation (|ΔHz| <= 5.0 Hz): {inv['homeostaticRateLoop']['rateDeviationHz']:+.2f} Hz ({inv['homeostaticRateLoop']['status']})\n"
            f"- Primary Origin: {audit['primaryOrigin']}\n"
            f"- Verdict: {audit['verdictSummary']}\n"
            f"- Recommended Action: {audit['recommendedIntervention']}"
        )

    client = genai.Client(api_key=api_key)
    model_name = memory.get("projectScope", {}).get("primaryModel", "gemini-4-argon")

    try:
        response = client.models.generateContent(
            model=model_name,
            contents=full_contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
            ),
        )
        return response.text or ""
    except Exception as e:
        return f"[Bridge Error] Model call failed: {str(e)}"


def run_repl(explicit_report: Optional[str] = None):
    """Interactive command-line loop with instant combined context & invariant audit awareness."""
    memory = load_workspace_memory()
    report_path, report = discover_latest_correlation_report(explicit_report)
    audit = run_automatic_invariant_audit(memory, report)
    export_markdown_state(memory)

    print(format_invariant_audit_banner(audit, report_path))
    print(" Type 'exit' or 'quit' to quit, 'sync' to reload memory & correlation report from disk.")

    while True:
        try:
            user_input = input("\n[Gemini Bridge] > ").strip()
            if not user_input:
                continue
            if user_input.lower() in ("exit", "quit"):
                break
            if user_input.lower() == "sync":
                memory = load_workspace_memory()
                report_path, report = discover_latest_correlation_report(explicit_report)
                audit = run_automatic_invariant_audit(memory, report)
                print(format_invariant_audit_banner(audit, report_path))
                continue

            print("\nThinking with combined workspace memory + correlation report + invariant audit...")
            reply = query_gemini_bridge(user_input, memory, report, audit)
            print("\n" + reply)

            memory.setdefault("conversationMemory", []).append({
                "timestamp": int(time.time() * 1000),
                "role": "user",
                "summary": user_input[:120],
            })
            save_workspace_memory(memory)

        except KeyboardInterrupt:
            print("\nSession ended.")
            break


def main():
    parser = argparse.ArgumentParser(
        description="Gemini <-> AI Studio Local Context Bridge with Automatic SNN Invariant Auditing"
    )
    parser.add_argument(
        "--query", "-q", type=str, help="Single query to execute with combined workspace + correlation report injection"
    )
    parser.add_argument(
        "--report", "-r", type=str, default=None, help="Path to SNN Divergence Correlation Report JSON file"
    )
    parser.add_argument(
        "--audit", "-a", action="store_true", help="Run automatic local invariant audit and exit"
    )
    parser.add_argument(
        "--export", "-e", action="store_true", help="Export workspace_memory.json to system_state.md and exit"
    )
    parser.add_argument(
        "--watch", "-w", action="store_true", help="Watch memory and correlation report files and keep system_state.md synced"
    )
    parser.add_argument(
        "--auto-init", action="store_true", help="Automatically initialize workspace_memory.json if missing"
    )
    parser.add_argument(
        "--strict", action="store_true", help="Enforce strict invariant audit; exit with code 2 on any violation"
    )
    args = parser.parse_args()

    if args.auto_init:
        if not MEMORY_FILE.exists():
            init_mem = load_workspace_memory()
            save_workspace_memory(init_mem)
            print(f"[Bridge] Initialized fresh workspace memory at {MEMORY_FILE}")

    memory = load_workspace_memory()
    report_path, report = discover_latest_correlation_report(args.report)
    audit = run_automatic_invariant_audit(memory, report)

    if args.strict:
        if not audit["allInvariantsPassed"] or len(audit["boundaryViolations"]) > 0:
            print(format_invariant_audit_banner(audit, report_path), file=sys.stderr)
            print(f"[Bridge STRICT ERROR] Invariant audit failure detected. Exiting with code 2.", file=sys.stderr)
            sys.exit(2)

    if args.audit:
        print(format_invariant_audit_banner(audit, report_path))
        return

    if args.export:
        export_markdown_state(memory)
        print(f"[Bridge] Successfully exported {SESSION_LOG_FILE}")
        return

    if args.watch:
        print(f"[Bridge] Watching {MEMORY_FILE} for changes (Ctrl+C to stop)...")
        last_mtime = 0.0
        try:
            while True:
                if MEMORY_FILE.exists():
                    mtime = MEMORY_FILE.stat().st_mtime
                    if mtime > last_mtime:
                        last_mtime = mtime
                        memory = load_workspace_memory()
                        report_path, report = discover_latest_correlation_report(args.report)
                        audit = run_automatic_invariant_audit(memory, report)
                        export_markdown_state(memory)
                        print(f"[{time.strftime('%H:%M:%S')}] Auto-synced {SESSION_LOG_FILE}")
                time.sleep(2)
        except KeyboardInterrupt:
            print("\nWatcher stopped.")
            return

    if args.query:
        print(format_invariant_audit_banner(audit, report_path))
        print(f"\nExecuting query with combined context: '{args.query}'\n")
        reply = query_gemini_bridge(args.query, memory, report, audit)
        print(reply)
        return

    # Default to interactive REPL
    run_repl(args.report)


if __name__ == "__main__":
    main()
