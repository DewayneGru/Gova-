"""
Sparse Autoencoder (SAE) for Scaling Monosemanticity & Runaway Spikenet Stabilization.

Mechanistic interpretability module decomposing polysemantic spiking neural network (SNN)
activations into overcomplete, monosemantic dictionary features. Detects high-frequency
avalanche cascades, runaway positive feedback loops, and hyperexcitation, and provides
proactive homeostatic counter-measures (polarization dampening, threshold elevation,
synaptic drift clamping, and feature steering).
"""

import math
import random
import time
from typing import List, Dict, Any, Optional, Tuple


def clamp(val: float, low: float = 0.0, high: float = 1.0) -> float:
    """Zero-dependency native float clamp."""
    return max(low, min(high, float(val)))


def vector_norm(v: List[float]) -> float:
    """Computes Euclidean (L2) norm of a vector."""
    return math.sqrt(sum(x * x for x in v))


def normalize_vector(v: List[float]) -> List[float]:
    """Normalizes vector to unit length."""
    norm = vector_norm(v)
    if norm < 1e-9:
        return [0.0] * len(v)
    return [x / norm for x in v]


class SparseAutoencoder:
    """
    Overcomplete Sparse Autoencoder with tied or untied decoders for dictionary learning
    and monosemantic feature decomposition of neural activations.
    """
    def __init__(
        self,
        input_dim: int = 16,
        expansion_factor: int = 4,
        l1_coeff: float = 0.008,
        learning_rate: float = 0.015,
        target_sparsity: float = 0.0625,  # Target L0: ~6.25% (e.g., 4 active out of 64 features)
        seed: int = 42
    ):
        self.input_dim = input_dim
        self.dict_dim = input_dim * expansion_factor
        self.expansion_factor = expansion_factor
        self.l1_coeff = l1_coeff
        self.learning_rate = learning_rate
        self.target_sparsity = target_sparsity

        rng = random.Random(seed)
        # Initialize decoder weights with unit-norm columns
        self.w_dec: List[List[float]] = []  # dict_dim columns of length input_dim
        for _ in range(self.dict_dim):
            col = [rng.gauss(0.0, 1.0 / math.sqrt(input_dim)) for _ in range(input_dim)]
            self.w_dec.append(normalize_vector(col))

        # Encoder weights (transpose of decoder initialized with scale)
        self.w_enc: List[List[float]] = [
            [self.w_dec[f][i] for i in range(input_dim)]
            for f in range(self.dict_dim)
        ]
        self.b_enc: List[float] = [0.0] * self.dict_dim
        self.b_dec: List[float] = [0.0] * input_dim

        # Running statistics
        self.feature_firing_counts: List[int] = [0] * self.dict_dim
        self.total_steps: int = 0
        self.running_l0: float = 0.0
        self.running_recon_error: float = 0.0
        self.feature_labels: Dict[int, str] = self._generate_canonical_feature_labels()

    def _generate_canonical_feature_labels(self) -> Dict[int, str]:
        """Provides human-interpretable labels for canonical emergent monosemantic features."""
        canonical = {
            0: "Sensory Coherence (Low Jitter)",
            1: "Rhythmic Delta Oscillator (0.5 - 3Hz)",
            2: "Harmonic Gamma Synchronization (40Hz)",
            3: "Afferent Spike Influx (Channel 0-3)",
            4: "Sensory Spike Influx (Channel 4-7)",
            5: "Inter-Subsystem Phase Alignment",
            6: "Ventral Homeostatic Balance",
            7: "Balanced Recurrent Excitation",
            8: "Substrate Thermal Dissipation",
            9: "Anti-Hebbian Synaptic Pruning",
            10: "STDP Balanced Plasticity Drift",
            11: "Quiescent Recovery Polarization",
            # Runaway / Instability Monosemantic Features (Indices 12-19)
            12: "RUNAWAY: Avalanche Cascade Onset",
            13: "RUNAWAY: High-Frequency Seizure Burst",
            14: "RUNAWAY: Positive-Feedback Saturation",
            15: "RUNAWAY: Refractory Exhaustion Burst",
            16: "RUNAWAY: LTD Synaptic Drift Collapse",
            17: "RUNAWAY: Cross-Layer Hyperexcitation",
            18: "RUNAWAY: Thermal Runaway Warning",
            19: "RUNAWAY: Spatial Density Singularity"
        }
        for f in range(20, self.dict_dim):
            canonical[f] = f"Latent Monosemantic Motif #{f}"
        return canonical

    def encode(self, x: List[float]) -> List[float]:
        """
        f(x) = ReLU( W_enc * (x - b_dec) + b_enc )
        Decomposes polysemantic activation vector into sparse monosemantic feature activations.
        """
        x_centered = [x[i] - self.b_dec[i] for i in range(min(len(x), self.input_dim))]
        # Pad with 0.0 if x is smaller than input_dim
        if len(x_centered) < self.input_dim:
            x_centered.extend([0.0] * (self.input_dim - len(x_centered)))

        features: List[float] = [0.0] * self.dict_dim
        for f in range(self.dict_dim):
            dot = sum(self.w_enc[f][i] * x_centered[i] for i in range(self.input_dim))
            val = dot + self.b_enc[f]
            features[f] = max(0.0, val)  # ReLU activation
        return features

    def decode(self, f: List[float]) -> List[float]:
        """
        Reconstructs input from feature activations:
        x_hat = sum_i( f_i * W_dec[:, i] ) + b_dec
        """
        recon = list(self.b_dec)
        for feat_idx in range(min(len(f), self.dict_dim)):
            act = f[feat_idx]
            if act > 0.0:
                col = self.w_dec[feat_idx]
                for i in range(self.input_dim):
                    recon[i] += act * col[i]
        return recon

    def forward(self, x: List[float]) -> Dict[str, Any]:
        """
        Full pass returning features, reconstruction, L0 sparsity, L2 reconstruction error,
        and runaway risk indicators.
        """
        features = self.encode(x)
        x_hat = self.decode(features)

        # Truncate or pad x for metric calculation
        x_target = x[:self.input_dim]
        if len(x_target) < self.input_dim:
            x_target = x_target + [0.0] * (self.input_dim - len(x_target))

        # Reconstruction error (MSE / L2)
        diff = [x_target[i] - x_hat[i] for i in range(self.input_dim)]
        recon_mse = sum(d * d for d in diff) / float(self.input_dim)
        recon_l2 = math.sqrt(sum(d * d for d in diff))

        # L0 Sparsity (Fraction of non-zero active features > 0.02 threshold)
        active_features = [i for i, val in enumerate(features) if val > 0.02]
        l0_count = len(active_features)
        l0_fraction = l0_count / float(self.dict_dim)

        # L1 Sparsity Loss
        l1_sum = sum(features)

        # Runaway detection metrics
        # Inspect weights of runaway features (12..19)
        runaway_indices = [idx for idx in range(12, min(20, self.dict_dim))]
        runaway_activation_sum = sum(features[idx] for idx in runaway_indices)
        max_runaway_act = max((features[idx] for idx in runaway_indices), default=0.0)

        # Anomaly trigger: High runaway feature activation or violent L0 deviation
        is_runaway = (max_runaway_act > 0.35) or (runaway_activation_sum > 0.85) or (l0_fraction > 0.30)
        avalanche_severity = clamp(
            (max_runaway_act / 0.80) * 0.6 + (l0_fraction / 0.40) * 0.4,
            0.0,
            1.0
        )

        # Update stats
        self.total_steps += 1
        for idx in active_features:
            self.feature_firing_counts[idx] += 1
        alpha = 0.05
        self.running_l0 = (1.0 - alpha) * self.running_l0 + alpha * l0_fraction
        self.running_recon_error = (1.0 - alpha) * self.running_recon_error + alpha * recon_mse

        return {
            "features": features,
            "x_hat": x_hat,
            "l0_count": l0_count,
            "l0_fraction": l0_fraction,
            "l1_sum": l1_sum,
            "recon_mse": recon_mse,
            "recon_l2": recon_l2,
            "active_feature_indices": active_features,
            "is_runaway": is_runaway,
            "avalanche_severity": avalanche_severity,
            "runaway_activation_sum": runaway_activation_sum,
            "max_runaway_act": max_runaway_act,
            "dominant_feature_index": max(range(len(features)), key=lambda i: features[i]) if features else 0
        }

    def compute_homeostatic_damping(self, sae_result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculates proactive homeostatic intervention vector to quell runaway spikenets:
        - Hyperpolarizing counter-current injection (delta_v_mem < 0)
        - Dynamic threshold offset elevation (delta_v_th > 0)
        - Anti-Hebbian LTD scaling multiplier
        - Refractory extension factor
        """
        severity = sae_result.get("avalanche_severity", 0.0)
        is_runaway = sae_result.get("is_runaway", False)

        if not is_runaway and severity < 0.20:
            return {
                "active": False,
                "membrane_hyperpolarization_mv": 0.0,
                "threshold_offset_mv": 0.0,
                "ltd_multiplier": 1.0,
                "learning_rate_dampener": 1.0,
                "refractory_extension_ms": 0.0,
                "recommended_action": "SNN in homeostatic equilibrium."
            }

        # Calculate proportional damping
        hyperpolarize_mv = -1.0 * (severity * 14.5)  # Up to -14.5 mV counter-polarization
        threshold_boost_mv = severity * 12.0  # Up to +12 mV threshold elevation to silence cascades
        ltd_multiplier = 1.0 + (severity * 0.85)  # Boost LTD up to 1.85x to prune runaway synapses
        lr_dampener = max(0.20, 1.0 - (severity * 0.70))  # Scale down learning rate during panic
        refractory_extension = severity * 4.5  # Add up to 4.5ms refractory penalty

        return {
            "active": True,
            "avalanche_severity": round(severity, 4),
            "membrane_hyperpolarization_mv": round(hyperpolarize_mv, 3),
            "threshold_offset_mv": round(threshold_boost_mv, 3),
            "ltd_multiplier": round(ltd_multiplier, 3),
            "learning_rate_dampener": round(lr_dampener, 3),
            "refractory_extension_ms": round(refractory_extension, 2),
            "recommended_action": (
                f"INTERVENTION ENGAGED: Avalanche severity {severity:.2f}. "
                f"Injecting {hyperpolarize_mv:.1f}mV hyperpolarization, "
                f"+{threshold_boost_mv:.1f}mV threshold offset, and {ltd_multiplier:.2f}x LTD scaling."
            )
        }

    def train_step(self, x: List[float]) -> float:
        """
        Single gradient descent step minimizing MSE reconstruction + L1 sparsity penalty.
        Weights of decoder are re-normalized to unit sphere after step.
        """
        features = self.encode(x)
        x_hat = self.decode(features)

        x_target = x[:self.input_dim]
        if len(x_target) < self.input_dim:
            x_target = x_target + [0.0] * (self.input_dim - len(x_target))

        # Error gradient w.r.t reconstruction: e = (x_hat - x)
        recon_err = [x_hat[i] - x_target[i] for i in range(self.input_dim)]

        # Backpropagation to decoder and encoder
        for f in range(self.dict_dim):
            act = features[f]
            if act <= 0.0:
                continue

            # Decoder update
            for i in range(self.input_dim):
                self.w_dec[f][i] -= self.learning_rate * recon_err[i] * act
            self.w_dec[f] = normalize_vector(self.w_dec[f])

            # Encoder update
            d_relu = 1.0 if act > 0.0 else 0.0
            d_act = sum(recon_err[i] * self.w_dec[f][i] for i in range(self.input_dim)) + self.l1_coeff
            grad_enc = d_act * d_relu

            for i in range(self.input_dim):
                self.w_enc[f][i] -= self.learning_rate * grad_enc * (x_target[i] - self.b_dec[i])
            self.b_enc[f] -= self.learning_rate * grad_enc

        # Decoder bias update
        for i in range(self.input_dim):
            self.b_dec[i] -= self.learning_rate * recon_err[i]

        mse = sum(e * e for e in recon_err) / float(self.input_dim)
        return mse


class ActivationCollector:
    """
    Collects real-time neuromorphic activations across layers (afferent, sensory,
    interneuron, motor/reflex) into high-fidelity snapshots for dictionary training.
    """
    def __init__(self, max_buffer_size: int = 500):
        self.buffer: List[List[float]] = []
        self.max_buffer_size = max_buffer_size

    def collect(self, activation_vector: List[float]):
        """Appends an activation vector into rolling buffer."""
        self.buffer.append(list(activation_vector))
        if len(self.buffer) > self.max_buffer_size:
            self.buffer.pop(0)

    def sample_batch(self, batch_size: int = 16) -> List[List[float]]:
        """Randomly samples a batch of activations for offline dictionary training."""
        if not self.buffer:
            return []
        sample_count = min(batch_size, len(self.buffer))
        return random.sample(self.buffer, sample_count)


class RunawaySpikenetStabilizer:
    """
    Coordinating bridge between SNN activation telemetry and Sparse Autoencoder
    monosemanticity feature space to permanently prevent runaway spiking dynamics.
    """
    def __init__(self, sae: Optional[SparseAutoencoder] = None):
        self.sae = sae or SparseAutoencoder(input_dim=16, expansion_factor=4)
        self.collector = ActivationCollector(max_buffer_size=1000)
        self.interventions_count = 0
        self.last_intervention_time = 0.0
        self.history: List[Dict[str, Any]] = []

    def process_spikenet_tick(self, activation_vector: List[float]) -> Dict[str, Any]:
        """
        Processes one telemetry tick: decomposes activations, checks for runaway motifs,
        and generates immediate stabilizing commands.
        """
        self.collector.collect(activation_vector)
        analysis = self.sae.forward(activation_vector)
        damping = self.sae.compute_homeostatic_damping(analysis)

        if damping.get("active", False):
            self.interventions_count += 1
            self.last_intervention_time = time.time()

        record = {
            "timestamp": time.time(),
            "l0_fraction": analysis["l0_fraction"],
            "recon_mse": analysis["recon_mse"],
            "avalanche_severity": analysis["avalanche_severity"],
            "is_runaway": analysis["is_runaway"],
            "damping": damping,
            "dominant_feature": self.sae.feature_labels.get(analysis["dominant_feature_index"], "Unknown")
        }

        self.history.append(record)
        if len(self.history) > 100:
            self.history.pop(0)

        return {
            "analysis": analysis,
            "damping": damping,
            "interventions_count": self.interventions_count,
            "dominant_feature_name": record["dominant_feature"]
        }


# Quick sanity test when executed directly
if __name__ == "__main__":
    print("Initializing Sparse Autoencoder for Scaling Monosemanticity...")
    sae = SparseAutoencoder(input_dim=16, expansion_factor=4)
    stabilizer = RunawaySpikenetStabilizer(sae)

    # 1. Normal biological activation
    normal_activations = [0.15, 0.0, 0.42, 0.05, 0.0, 0.0, 0.88, 0.12, 0.0, 0.0, 0.0, 0.35, 0.0, 0.0, 0.0, 0.10]
    out_normal = stabilizer.process_spikenet_tick(normal_activations)
    print(f"Normal Tick -> L0: {out_normal['analysis']['l0_fraction']:.2f}, Severity: {out_normal['analysis']['avalanche_severity']:.2f}, Active: {out_normal['damping']['active']}")

    # 2. Runaway hyperexcitation explosion (seizure/avalanche pattern)
    runaway_activations = [0.95, 0.89, 0.99, 0.84, 0.91, 0.78, 0.96, 0.88, 0.82, 0.90, 0.87, 0.93, 0.85, 0.94, 0.80, 0.92]
    out_runaway = stabilizer.process_spikenet_tick(runaway_activations)
    print(f"Runaway Tick -> L0: {out_runaway['analysis']['l0_fraction']:.2f}, Severity: {out_runaway['analysis']['avalanche_severity']:.2f}, Active: {out_runaway['damping']['active']}")
    print(f"Damping Action -> {out_runaway['damping']['recommended_action']}")
