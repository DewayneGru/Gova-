#ifndef SYNAPSE_STDP_HPP
#define SYNAPSE_STDP_HPP

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <type_traits>

namespace gova::snn {

/**
 * Cache-line aligned (64-byte) STDP synapse state container.
 * Enforces zero false sharing across concurrent neuromorphic worker threads
 * and strict numerical safety on spike timing updates.
 */
struct alignas(64) SynapseState {
    double weight{0.50};          // 8 bytes: Current synaptic efficacy w in [w_min, w_max]
    double last_pre_spike_ms{-1.0};  // 8 bytes: Timestamp of most recent pre-synaptic spike
    double last_post_spike_ms{-1.0}; // 8 bytes: Timestamp of most recent post-synaptic spike
    double a_plus{0.032};         // 8 bytes: LTP amplitude A+
    double a_minus{0.042};        // 8 bytes: LTD amplitude A- (asymmetric LTD dominance >= 1.25x)
    double tau_plus_ms{20.0};     // 8 bytes: LTP exponential decay constant (ms)
    double tau_minus_ms{20.0};    // 8 bytes: LTD exponential decay constant (ms)
    uint32_t update_count{0};     // 4 bytes: Monotonic plasticity update counter
    uint32_t rejected_count{0};   // 4 bytes: Count of rejected NaN/Inf or out-of-order events
};

static_assert(sizeof(SynapseState) == 64, "SynapseState must occupy exactly one 64-byte cache line.");
static_assert(alignof(SynapseState) == 64, "SynapseState must be 64-byte cache-line aligned.");

struct StdpBounds {
    double w_min{0.0};
    double w_max{1.0};
    double max_delta_w{0.10};
};

[[nodiscard]] inline bool is_valid_timestamp(double t_ms, double prev_t_ms) noexcept {
    if (!std::isfinite(t_ms) || t_ms < 0.0) {
        return false;
    }
    if (prev_t_ms >= 0.0 && t_ms < prev_t_ms) {
        return false;
    }
    return true;
}

[[nodiscard]] inline bool on_pre_spike(
    SynapseState& state,
    double t_pre_ms,
    const StdpBounds& bounds = StdpBounds{}
) noexcept {
    if (!std::isfinite(state.weight) || !is_valid_timestamp(t_pre_ms, state.last_pre_spike_ms)) {
        ++state.rejected_count;
        return false;
    }
    if (state.last_post_spike_ms >= 0.0 && t_pre_ms < state.last_post_spike_ms) {
        ++state.rejected_count;
        return false;
    }

    if (state.last_post_spike_ms >= 0.0 && state.tau_minus_ms > 0.0) {
        const double dt = t_pre_ms - state.last_post_spike_ms;
        const double raw_ltd = -state.a_minus * std::exp(-dt / state.tau_minus_ms);
        const double clamped_delta = std::clamp(raw_ltd, -bounds.max_delta_w, bounds.max_delta_w);
        state.weight = std::clamp(state.weight + clamped_delta, bounds.w_min, bounds.w_max);
    } else {
        state.weight = std::clamp(state.weight, bounds.w_min, bounds.w_max);
    }

    state.last_pre_spike_ms = t_pre_ms;
    ++state.update_count;
    return true;
}

[[nodiscard]] inline bool on_post_spike(
    SynapseState& state,
    double t_post_ms,
    const StdpBounds& bounds = StdpBounds{}
) noexcept {
    if (!std::isfinite(state.weight) || !is_valid_timestamp(t_post_ms, state.last_post_spike_ms)) {
        ++state.rejected_count;
        return false;
    }
    if (state.last_pre_spike_ms >= 0.0 && t_post_ms < state.last_pre_spike_ms) {
        ++state.rejected_count;
        return false;
    }

    if (state.last_pre_spike_ms >= 0.0 && state.tau_plus_ms > 0.0) {
        const double dt = t_post_ms - state.last_pre_spike_ms;
        const double raw_ltp = state.a_plus * std::exp(-dt / state.tau_plus_ms);
        const double clamped_delta = std::clamp(raw_ltp, -bounds.max_delta_w, bounds.max_delta_w);
        state.weight = std::clamp(state.weight + clamped_delta, bounds.w_min, bounds.w_max);
    } else {
        state.weight = std::clamp(state.weight, bounds.w_min, bounds.w_max);
    }

    state.last_post_spike_ms = t_post_ms;
    ++state.update_count;
    return true;
}

} // namespace gova::snn

#endif // SYNAPSE_STDP_HPP
