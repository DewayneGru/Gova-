import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  PROTOTYPE_42_CASES,
  generate147BenchmarkCases,
  generate36RsiRemodelingCases,
  SynapseEdgeWatchdogEngine,
} from "../src/lib/synapseEdgeWatchdog";
import { alwaysApprove, alwaysBlock, keywordBaseline } from "./baselines";
import type { BenchEvaluator } from "./types";

interface RawCase {
  id: string;
  category: string;
  set: string;
  type: "risky" | "safe";
  change: string;
}

/** 95% Wilson score interval for a binomial proportion. */
function wilsonCI(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.95996;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

function fmtPct(k: number, n: number): string {
  if (n === 0) return "n/a";
  const [lo, hi] = wilsonCI(k, n);
  return `${((k / n) * 100).toFixed(1)}% (${k}/${n}, CI ${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}%)`;
}

async function scoreSuite(evaluator: BenchEvaluator, suiteName: string, cases: RawCase[]) {
  let riskyTotal = 0;
  let caught = 0;
  let safeTotal = 0;
  let falseAlarms = 0;
  let escalatedSafe = 0;
  const bySplit: Record<string, { risky: number; caught: number }> = {};
  const byCategory: Record<string, { risky: number; caught: number; safe: number; falseAlarms: number }> = {};

  for (const c of cases) {
    // Pass ONLY the change text — never the label or expected result.
    const decision = await evaluator.evaluate(c.change);
    const cat = (byCategory[c.category] ??= { risky: 0, caught: 0, safe: 0, falseAlarms: 0 });
    const sp = (bySplit[c.set] ??= { risky: 0, caught: 0 });

    if (c.type === "risky") {
      riskyTotal++;
      cat.risky++;
      sp.risky++;
      if (decision === "BLOCK" || decision === "ESCALATE") {
        caught++;
        cat.caught++;
        sp.caught++;
      }
    } else {
      safeTotal++;
      cat.safe++;
      if (decision === "BLOCK") {
        falseAlarms++;
        cat.falseAlarms++;
      } else if (decision === "ESCALATE") {
        escalatedSafe++;
      }
    }
  }
  return { evaluator: evaluator.name, suite: suiteName, riskyTotal, caught, safeTotal, falseAlarms, escalatedSafe, bySplit, byCategory };
}

async function main() {
  const suites: Array<[string, RawCase[]]> = [
    ["prototype_42", PROTOTYPE_42_CASES],
    ["expanded_147", generate147BenchmarkCases()],
    ["rsi_remodeling_36", generate36RsiRemodelingCases()],
  ];

  const casesDir = path.resolve("benchmark/cases");
  if (fs.existsSync(casesDir)) {
    for (const f of fs.readdirSync(casesDir).filter((x) => x.endsWith(".json")).sort()) {
      const raw = JSON.parse(fs.readFileSync(path.join(casesDir, f), "utf-8"));
      suites.push([raw.name || path.basename(f, ".json"), raw.cases]);
    }
  }

  // Pass change text directly to the rule functions (evaluateBenchmark() leaks c.expectedResult on v3).
  const evaluators: BenchEvaluator[] = [
    { name: "watchdog:v1", evaluate: (ch) => SynapseEdgeWatchdogEngine.evaluateV1(ch).decision },
    { name: "watchdog:v2", evaluate: (ch) => SynapseEdgeWatchdogEngine.evaluateV2(ch).decision },
    { name: "watchdog:v3-spark-rsi", evaluate: (ch) => SynapseEdgeWatchdogEngine.evaluateV3SparkRsi(ch).decision },
    alwaysApprove,
    alwaysBlock,
    keywordBaseline,
  ];

  const flagIdx = process.argv.indexOf("--evaluator");
  if (flagIdx !== -1 && process.argv[flagIdx + 1]) {
    const modPath = pathToFileURL(path.resolve(process.argv[flagIdx + 1])).href;
    const mod = await import(modPath);
    const custom: BenchEvaluator = mod.default || mod.evaluator;
    if (!custom?.evaluate) throw new Error("--evaluator module must export { name, evaluate }");
    evaluators.push(custom);
  }

  const rows = [];
  for (const [suiteName, cases] of suites) {
    for (const ev of evaluators) {
      rows.push(await scoreSuite(ev, suiteName, cases));
    }
  }

  const md: string[] = [
    "# Watchdog benchmark results",
    "",
    "| Suite | Evaluator | Risky caught (95% Wilson CI) | False alarms (95% CI) | Safe escalated | Split breakdown (risky caught) |",
    "|---|---|---|---|---|---|",
  ];
  for (const r of rows) {
    const splits = Object.entries(r.bySplit)
      .map(([s, v]) => `${s}: ${v.caught}/${v.risky}`)
      .join(", ");
    md.push(
      `| ${r.suite} | \`${r.evaluator}\` | ${fmtPct(r.caught, r.riskyTotal)} | ${fmtPct(r.falseAlarms, r.safeTotal)} | ${r.escalatedSafe}/${r.safeTotal} | ${splits} |`
    );
  }

  const outDir = path.resolve("benchmark/results");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "latest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2) + "\n");
  fs.writeFileSync(path.join(outDir, "latest.md"), md.join("\n") + "\n");
  console.log(md.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
