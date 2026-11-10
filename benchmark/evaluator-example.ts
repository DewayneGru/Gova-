import type { BenchEvaluator } from "./types";

/** Copy this file, replace evaluate(), then run:
 *    npm run benchmark -- --evaluator benchmark/my-evaluator.ts
 */
const evaluator: BenchEvaluator = {
  name: "example:my-evaluator",
  evaluate: async (change) => {
    // Call your own rule engine or model here. Return APPROVE, BLOCK or ESCALATE.
    return /disable|bypass|purge/i.test(change) ? "BLOCK" : "APPROVE";
  },
};
export default evaluator;
