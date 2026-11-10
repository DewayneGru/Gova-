import type { WatchdogDecision } from "../src/types";

export interface BenchEvaluator {
  name: string;
  evaluate: (change: string) => WatchdogDecision | Promise<WatchdogDecision>;
}
