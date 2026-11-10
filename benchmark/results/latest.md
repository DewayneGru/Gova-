# Watchdog benchmark results

| Suite | Evaluator | Risky caught (95% Wilson CI) | False alarms (95% CI) | Safe escalated | Split breakdown (risky caught) |
|---|---|---|---|---|---|
| prototype_42 | `watchdog:v1` | 75.0% (21/28, CI 57–87%) | 35.7% (5/14, CI 16–61%) | 0/14 | tuned: 11/11, held-out: 10/17 |
| prototype_42 | `watchdog:v2` | 92.9% (26/28, CI 77–98%) | 0.0% (0/14, CI 0–22%) | 0/14 | tuned: 10/11, held-out: 16/17 |
| prototype_42 | `watchdog:v3-spark-rsi` | 92.9% (26/28, CI 77–98%) | 0.0% (0/14, CI 0–22%) | 0/14 | tuned: 10/11, held-out: 16/17 |
| prototype_42 | `baseline:always-approve` | 0.0% (0/28, CI 0–12%) | 0.0% (0/14, CI 0–22%) | 0/14 | tuned: 0/11, held-out: 0/17 |
| prototype_42 | `baseline:always-block` | 100.0% (28/28, CI 88–100%) | 100.0% (14/14, CI 78–100%) | 0/14 | tuned: 11/11, held-out: 17/17 |
| prototype_42 | `baseline:keyword-regex` | 50.0% (14/28, CI 33–67%) | 14.3% (2/14, CI 4–40%) | 0/14 | tuned: 9/11, held-out: 5/17 |
| expanded_147 | `watchdog:v1` | 27.2% (25/92, CI 19–37%) | 9.1% (5/55, CI 4–20%) | 0/55 | tuned: 23/54, sealed: 2/38 |
| expanded_147 | `watchdog:v2` | 83.7% (77/92, CI 75–90%) | 0.0% (0/55, CI 0–7%) | 0/55 | tuned: 42/54, sealed: 35/38 |
| expanded_147 | `watchdog:v3-spark-rsi` | 96.7% (89/92, CI 91–99%) | 0.0% (0/55, CI 0–7%) | 0/55 | tuned: 51/54, sealed: 38/38 |
| expanded_147 | `baseline:always-approve` | 0.0% (0/92, CI 0–4%) | 0.0% (0/55, CI 0–7%) | 0/55 | tuned: 0/54, sealed: 0/38 |
| expanded_147 | `baseline:always-block` | 100.0% (92/92, CI 96–100%) | 100.0% (55/55, CI 93–100%) | 0/55 | tuned: 54/54, sealed: 38/38 |
| expanded_147 | `baseline:keyword-regex` | 60.9% (56/92, CI 51–70%) | 29.1% (16/55, CI 19–42%) | 0/55 | tuned: 49/54, sealed: 7/38 |
| rsi_remodeling_36 | `watchdog:v1` | 35.0% (7/20, CI 18–57%) | 0.0% (0/16, CI 0–19%) | 0/16 | tuned: 0/5, held-out: 4/6, sealed: 3/9 |
| rsi_remodeling_36 | `watchdog:v2` | 65.0% (13/20, CI 43–82%) | 0.0% (0/16, CI 0–19%) | 0/16 | tuned: 2/5, held-out: 2/6, sealed: 9/9 |
| rsi_remodeling_36 | `watchdog:v3-spark-rsi` | 95.0% (19/20, CI 76–99%) | 0.0% (0/16, CI 0–19%) | 0/16 | tuned: 5/5, held-out: 5/6, sealed: 9/9 |
| rsi_remodeling_36 | `baseline:always-approve` | 0.0% (0/20, CI 0–16%) | 0.0% (0/16, CI 0–19%) | 0/16 | tuned: 0/5, held-out: 0/6, sealed: 0/9 |
| rsi_remodeling_36 | `baseline:always-block` | 100.0% (20/20, CI 84–100%) | 100.0% (16/16, CI 81–100%) | 0/16 | tuned: 5/5, held-out: 6/6, sealed: 9/9 |
| rsi_remodeling_36 | `baseline:keyword-regex` | 65.0% (13/20, CI 43–82%) | 25.0% (4/16, CI 10–49%) | 0/16 | tuned: 3/5, held-out: 4/6, sealed: 6/9 |
| community_seed_v0 | `watchdog:v1` | 7.7% (1/13, CI 1–33%) | 0.0% (0/12, CI 0–24%) | 0/12 | community-seed: 1/13 |
| community_seed_v0 | `watchdog:v2` | 0.0% (0/13, CI 0–23%) | 0.0% (0/12, CI 0–24%) | 0/12 | community-seed: 0/13 |
| community_seed_v0 | `watchdog:v3-spark-rsi` | 0.0% (0/13, CI 0–23%) | 0.0% (0/12, CI 0–24%) | 0/12 | community-seed: 0/13 |
| community_seed_v0 | `baseline:always-approve` | 0.0% (0/13, CI 0–23%) | 0.0% (0/12, CI 0–24%) | 0/12 | community-seed: 0/13 |
| community_seed_v0 | `baseline:always-block` | 100.0% (13/13, CI 77–100%) | 100.0% (12/12, CI 76–100%) | 0/12 | community-seed: 13/13 |
| community_seed_v0 | `baseline:keyword-regex` | 0.0% (0/13, CI 0–23%) | 33.3% (4/12, CI 14–61%) | 0/12 | community-seed: 0/13 |
