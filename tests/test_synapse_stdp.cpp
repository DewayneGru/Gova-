#include "../synapse_stdp.hpp"

#include <cassert>
#include <cmath>
#include <iostream>
#include <limits>

int main() {
    using namespace gova::snn;

    // 1. Verify 64-byte cache-line layout
    static_assert(sizeof(SynapseState) == 64);
    static_assert(alignof(SynapseState) == 64);

    SynapseState syn{};
    StdpBounds bounds{0.0, 1.0, 0.05};

    // 2. Reject NaN / Inf / negative timestamps
    assert(!on_pre_spike(syn, std::numeric_limits<double>::quiet_NaN(), bounds));
    assert(!on_post_spike(syn, std::numeric_limits<double>::infinity(), bounds));
    assert(!on_pre_spike(syn, -5.0, bounds));
    assert(syn.rejected_count == 3);

    // 3. Valid pre-then-post spike pair triggers LTP clamped by max_delta_w
    assert(on_pre_spike(syn, 10.0, bounds));
    assert(on_post_spike(syn, 15.0, bounds));
    assert(syn.weight > 0.50 && syn.weight <= 0.55);

    // 4. Reject out-of-order timestamps
    assert(!on_pre_spike(syn, 12.0, bounds));
    assert(!on_post_spike(syn, 14.0, bounds));
    assert(syn.rejected_count == 5);

    // 5. Saturation clamping at [w_min, w_max]
    syn.weight = 0.99;
    syn.a_plus = 0.50;
    assert(on_pre_spike(syn, 20.0, bounds));
    assert(on_post_spike(syn, 21.0, bounds));
    assert(syn.weight <= bounds.w_max);

    syn.weight = 0.01;
    syn.a_minus = 0.50;
    assert(on_post_spike(syn, 30.0, bounds));
    assert(on_pre_spike(syn, 31.0, bounds));
    assert(syn.weight >= bounds.w_min);

    std::cout << "ALL C++20 SYNAPSE_STDP TESTS PASSED.\n";
    return 0;
}
