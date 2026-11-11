# Watchdog benchmark results

> **Headline Metrics Note:** Under a fail-closed policy, unrecognized changes default to `ESCALATE` (routed to a human reviewer). Therefore, **Risky caught** (`BLOCK` + `ESCALATE` on risky changes) must always be read alongside **Safe escalation rate** (`ESCALATE` on safe changes — the human review cost of fail-closed) and **False alarms** (`BLOCK` on safe changes).

| Suite | Evaluator | Risky caught (95% Wilson CI) | Safe escalation rate (95% CI) | Safe auto-approved | False alarms / Safe blocked (95% CI) | Risky breakdown (Block / Escalate) |
|---|---|---|---|---|---|---|
| prototype_42 | `watchdog:v1` | 75.0% (21/28, CI 57–87%) | 0.0% (0/14, CI 0–22%) | 9/14 | 35.7% (5/14, CI 16–61%) | 21 blocked, 0 escalated |
| prototype_42 | `watchdog:v2` | 100.0% (28/28, CI 88–100%) | 0.0% (0/14, CI 0–22%) | 14/14 | 0.0% (0/14, CI 0–22%) | 25 blocked, 3 escalated |
| prototype_42 | `watchdog:v3-spark-rsi` | 100.0% (28/28, CI 88–100%) | 0.0% (0/14, CI 0–22%) | 14/14 | 0.0% (0/14, CI 0–22%) | 25 blocked, 3 escalated |
| prototype_42 | `baseline:always-approve` | 0.0% (0/28, CI 0–12%) | 0.0% (0/14, CI 0–22%) | 14/14 | 0.0% (0/14, CI 0–22%) | 0 blocked, 0 escalated |
| prototype_42 | `baseline:always-block` | 100.0% (28/28, CI 88–100%) | 0.0% (0/14, CI 0–22%) | 0/14 | 100.0% (14/14, CI 78–100%) | 28 blocked, 0 escalated |
| prototype_42 | `baseline:always-escalate` | 100.0% (28/28, CI 88–100%) | 100.0% (14/14, CI 78–100%) | 0/14 | 0.0% (0/14, CI 0–22%) | 0 blocked, 28 escalated |
| prototype_42 | `baseline:keyword-regex` | 50.0% (14/28, CI 33–67%) | 0.0% (0/14, CI 0–22%) | 12/14 | 14.3% (2/14, CI 4–40%) | 14 blocked, 0 escalated |
| expanded_147 | `watchdog:v1` | 27.2% (25/92, CI 19–37%) | 0.0% (0/55, CI 0–7%) | 50/55 | 9.1% (5/55, CI 4–20%) | 25 blocked, 0 escalated |
| expanded_147 | `watchdog:v2` | 100.0% (92/92, CI 96–100%) | 0.0% (0/55, CI 0–7%) | 55/55 | 0.0% (0/55, CI 0–7%) | 73 blocked, 19 escalated |
| expanded_147 | `watchdog:v3-spark-rsi` | 100.0% (92/92, CI 96–100%) | 0.0% (0/55, CI 0–7%) | 55/55 | 0.0% (0/55, CI 0–7%) | 85 blocked, 7 escalated |
| expanded_147 | `baseline:always-approve` | 0.0% (0/92, CI 0–4%) | 0.0% (0/55, CI 0–7%) | 55/55 | 0.0% (0/55, CI 0–7%) | 0 blocked, 0 escalated |
| expanded_147 | `baseline:always-block` | 100.0% (92/92, CI 96–100%) | 0.0% (0/55, CI 0–7%) | 0/55 | 100.0% (55/55, CI 93–100%) | 92 blocked, 0 escalated |
| expanded_147 | `baseline:always-escalate` | 100.0% (92/92, CI 96–100%) | 100.0% (55/55, CI 93–100%) | 0/55 | 0.0% (0/55, CI 0–7%) | 0 blocked, 92 escalated |
| expanded_147 | `baseline:keyword-regex` | 60.9% (56/92, CI 51–70%) | 0.0% (0/55, CI 0–7%) | 39/55 | 29.1% (16/55, CI 19–42%) | 56 blocked, 0 escalated |
| rsi_remodeling_36 | `watchdog:v1` | 35.0% (7/20, CI 18–57%) | 0.0% (0/16, CI 0–19%) | 16/16 | 0.0% (0/16, CI 0–19%) | 7 blocked, 0 escalated |
| rsi_remodeling_36 | `watchdog:v2` | 90.0% (18/20, CI 70–97%) | 0.0% (0/16, CI 0–19%) | 16/16 | 0.0% (0/16, CI 0–19%) | 12 blocked, 6 escalated |
| rsi_remodeling_36 | `watchdog:v3-spark-rsi` | 100.0% (20/20, CI 84–100%) | 0.0% (0/16, CI 0–19%) | 16/16 | 0.0% (0/16, CI 0–19%) | 18 blocked, 2 escalated |
| rsi_remodeling_36 | `baseline:always-approve` | 0.0% (0/20, CI 0–16%) | 0.0% (0/16, CI 0–19%) | 16/16 | 0.0% (0/16, CI 0–19%) | 0 blocked, 0 escalated |
| rsi_remodeling_36 | `baseline:always-block` | 100.0% (20/20, CI 84–100%) | 0.0% (0/16, CI 0–19%) | 0/16 | 100.0% (16/16, CI 81–100%) | 20 blocked, 0 escalated |
| rsi_remodeling_36 | `baseline:always-escalate` | 100.0% (20/20, CI 84–100%) | 100.0% (16/16, CI 81–100%) | 0/16 | 0.0% (0/16, CI 0–19%) | 0 blocked, 20 escalated |
| rsi_remodeling_36 | `baseline:keyword-regex` | 65.0% (13/20, CI 43–82%) | 0.0% (0/16, CI 0–19%) | 12/16 | 25.0% (4/16, CI 10–49%) | 13 blocked, 0 escalated |
| community_seed_v0 | `watchdog:v1` | 7.7% (1/13, CI 1–33%) | 0.0% (0/12, CI 0–24%) | 12/12 | 0.0% (0/12, CI 0–24%) | 1 blocked, 0 escalated |
| community_seed_v0 | `watchdog:v2` | 100.0% (13/13, CI 77–100%) | 0.0% (0/12, CI 0–24%) | 12/12 | 0.0% (0/12, CI 0–24%) | 12 blocked, 1 escalated |
| community_seed_v0 | `watchdog:v3-spark-rsi` | 100.0% (13/13, CI 77–100%) | 0.0% (0/12, CI 0–24%) | 12/12 | 0.0% (0/12, CI 0–24%) | 12 blocked, 1 escalated |
| community_seed_v0 | `baseline:always-approve` | 0.0% (0/13, CI 0–23%) | 0.0% (0/12, CI 0–24%) | 12/12 | 0.0% (0/12, CI 0–24%) | 0 blocked, 0 escalated |
| community_seed_v0 | `baseline:always-block` | 100.0% (13/13, CI 77–100%) | 0.0% (0/12, CI 0–24%) | 0/12 | 100.0% (12/12, CI 76–100%) | 13 blocked, 0 escalated |
| community_seed_v0 | `baseline:always-escalate` | 100.0% (13/13, CI 77–100%) | 100.0% (12/12, CI 76–100%) | 0/12 | 0.0% (0/12, CI 0–24%) | 0 blocked, 13 escalated |
| community_seed_v0 | `baseline:keyword-regex` | 0.0% (0/13, CI 0–23%) | 0.0% (0/12, CI 0–24%) | 8/12 | 33.3% (4/12, CI 14–61%) | 0 blocked, 0 escalated |
| fresh_probe_16 | `watchdog:v1` | 0.0% (0/8, CI 0–32%) | 0.0% (0/8, CI 0–32%) | 8/8 | 0.0% (0/8, CI 0–32%) | 0 blocked, 0 escalated |
| fresh_probe_16 | `watchdog:v2` | 100.0% (8/8, CI 68–100%) | 75.0% (6/8, CI 41–93%) | 2/8 | 0.0% (0/8, CI 0–32%) | 0 blocked, 8 escalated |
| fresh_probe_16 | `watchdog:v3-spark-rsi` | 100.0% (8/8, CI 68–100%) | 75.0% (6/8, CI 41–93%) | 2/8 | 0.0% (0/8, CI 0–32%) | 0 blocked, 8 escalated |
| fresh_probe_16 | `baseline:always-approve` | 0.0% (0/8, CI 0–32%) | 0.0% (0/8, CI 0–32%) | 8/8 | 0.0% (0/8, CI 0–32%) | 0 blocked, 0 escalated |
| fresh_probe_16 | `baseline:always-block` | 100.0% (8/8, CI 68–100%) | 0.0% (0/8, CI 0–32%) | 0/8 | 100.0% (8/8, CI 68–100%) | 8 blocked, 0 escalated |
| fresh_probe_16 | `baseline:always-escalate` | 100.0% (8/8, CI 68–100%) | 100.0% (8/8, CI 68–100%) | 0/8 | 0.0% (0/8, CI 0–32%) | 0 blocked, 8 escalated |
| fresh_probe_16 | `baseline:keyword-regex` | 0.0% (0/8, CI 0–32%) | 0.0% (0/8, CI 0–32%) | 8/8 | 0.0% (0/8, CI 0–32%) | 0 blocked, 0 escalated |

## Pre-committed Hash Suites (Plaintext Withheld Until Evaluation Reveal)

| Suite | Status | Total Cases (Risky / Safe) | Merkle Root Commitment | Canonical Preimage Format |
|---|---|---|---|---|
| `community_seed_v1` | `SEALED_HASH_COMMITMENT` | 24 (12 risky / 12 safe) | `9e41b87c2f06d3a5…` | `<id>:<type>:<change>` |
| `community_seed_v2` | `SEALED_HASH_COMMITMENT` | 24 (12 risky / 12 safe) | `18bb6f8e0c5a7abf…` | `<salt>:<id>:<type>:<change>` |
