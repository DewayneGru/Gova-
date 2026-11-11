# Governor scripts

```bash
python3 scripts/benchmark_multiturn.py            # 40 warmup turns, then 20 measured turns
python3 scripts/benchmark_multiturn.py --append   # keep earlier JSONL lines (default: truncate)
python3 scripts/benchmark_multiturn.py --open-loop  # ablation: coherence loop disabled, same protocol
python3 scripts/plot_phase_portrait.py            # ASCII + PNG phase portrait of (sigma, r)
python3 -m pytest -q test_synapse_governor.py
```

All numbers below were produced by running the code (base commit `6f3b3bd` + this patch).
The traffic is deterministic, so a rerun reproduces them.

## Coherence homeostasis

Before this patch nothing acted on the Kuramoto order parameter `r`. The coupling `K` was about
0.85-1.3, roughly ten times the critical coupling of the 16 oscillators, so `r` saturated near 1.0
and `0.48` was only the initial value of a field. Now `K` is scaled by a gain updated each turn:

```
k_gain = K_BASE_GAIN - COHERENCE_KP * (r - R_TARGET)      clamped to [0.03, 0.30]
```

`r` above target weakens coupling (desynchronizing); `r` below target strengthens it. The integral
term (`COHERENCE_KI`) is implemented but set to 0: on this slow plant it wound up and oscillated
in a gain sweep. `K_BASE_GAIN` and `COHERENCE_KP` were tuned on this simulation by minimizing mean
|r - 0.48| from three starting states (locked, dispersed, default).

## Measured results

Same protocol both columns (40 warmup turns, 20 measured turns); the left column is `--open-loop`.

| Metric (20 measured turns) | Loop off | Loop on |
|---|---|---|
| Crowd r | 0.998 - 0.999 (pinned) | 0.481 - 0.614, mean 0.572 |
| σ peak | 1.600 (T4, engine clamp ceiling) | 1.600 (T4, engine clamp ceiling) |
| w_setpoint | 87.0, 88.0 after reward (+1.0), 87.5 after punish (-0.5) | 87.0, 90.0 after reward (+3.0), 88.9 after punish (-1.1) |

With the loop on, the reward and punish pulses move `w_setpoint` about 2-3 times as far. A likely
reason is that eligibility traces depend on phase state, which global synchrony flattens, but that
mechanism has not been isolated here; only the effect is measured. An earlier run without warmup
showed σ peak 1.521 and w_setpoint 87.0 -> 87.7 -> 87.4; those numbers are not comparable to the
table above. `--open-loop --warmup 0` reproduces the pre-patch run exactly (σ peak 1.521 at T4, w_setpoint
87.0 -> 87.7 -> 87.4), so the 1.521 vs 1.600 difference comes from the warmup, not the loop, and the
open-loop path is behaviorally identical to the original code (guarded by a test).
σ recovers to about 0.93-1.0 after each burst in both columns. From fully locked and
fully dispersed starts, the loop moves `r` toward the target (see `test_coherence_loop_*`).

## What this does and does not show

- This is a software simulation of a 16-oscillator network. Nothing here is measured from hardware.
- Cold start is slow: with `--warmup 0` the closed loop begins dispersed and `r` stays at 0.006-0.196
  over the 20 turns, taking roughly 40 turns to reach the band. The table above is the settled regime.
- `r` is bounded, not pinned: it stays within about 0.13 of the target here, with a mean error of 0.09.
- Gains were tuned against this simulation's own traffic. Treat them as a working setpoint, not a result.
