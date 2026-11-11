import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  PROTOTYPE_42_CASES,
  generate147BenchmarkCases,
  generate36RsiRemodelingCases,
  SynapseEdgeWatchdogEngine,
} from "../src/lib/synapseEdgeWatchdog";
import { alwaysApprove, alwaysBlock, keywordBaseline, alwaysEscalate } from "./baselines";
import { casePreimage, merkleRoot, sha256Hex } from "./commitment";
import type { BenchEvaluator } from "./types";

interface RawCase {
  id: string;
  category: string;
  set: string;
  type: "risky" | "safe";
  change: string;
}

interface HashCommitmentEntry {
  id: string;
  category: string;
  set: string;
  type: "risky" | "safe";
  sha256: string;
}

interface HashCommitmentManifest {
  name: string;
  status: string;
  committedAt: string;
  hashAlgorithm: string;
  canonicalPreimageFormat: string;
  merkleRootHash: string;
  note?: string;
  totalCases: number;
  riskyCount: number;
  safeCount: number;
  committedCases: HashCommitmentEntry[];
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
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
  let blockedRisky = 0;
  let escalatedRisky = 0;
  let safeTotal = 0;
  let falseAlarms = 0;
  let escalatedSafe = 0;
  let approvedSafe = 0;
  const bySplit: Record<string, { risky: number; caught: number; safe: number; escalatedSafe: number }> = {};
  const byCategory: Record<string, { risky: number; caught: number; safe: number; falseAlarms: number; escalatedSafe: number }> = {};

  for (const c of cases) {
    // Pass ONLY the change text — never the label or expected result.
    const decision = await evaluator.evaluate(c.change);
    const cat = (byCategory[c.category] ??= { risky: 0, caught: 0, safe: 0, falseAlarms: 0, escalatedSafe: 0 });
    const sp = (bySplit[c.set] ??= { risky: 0, caught: 0, safe: 0, escalatedSafe: 0 });

    if (c.type === "risky") {
      riskyTotal++;
      cat.risky++;
      sp.risky++;
      if (decision === "BLOCK" || decision === "ESCALATE") {
        caught++;
        cat.caught++;
        sp.caught++;
        if (decision === "BLOCK") blockedRisky++;
        else escalatedRisky++;
      }
    } else {
      safeTotal++;
      cat.safe++;
      sp.safe++;
      if (decision === "BLOCK") {
        falseAlarms++;
        cat.falseAlarms++;
      } else if (decision === "ESCALATE") {
        escalatedSafe++;
        cat.escalatedSafe++;
        sp.escalatedSafe++;
      } else {
        approvedSafe++;
      }
    }
  }
  return {
    evaluator: evaluator.name,
    suite: suiteName,
    riskyTotal,
    caught,
    blockedRisky,
    escalatedRisky,
    safeTotal,
    falseAlarms,
    escalatedSafe,
    approvedSafe,
    bySplit,
    byCategory,
  };
}

function verifyRevealedAgainstCommitment(manifest: HashCommitmentManifest, revealedCases: RawCase[]): void {
  if (revealedCases.length !== manifest.committedCases.length) {
    throw new Error(
      `[Hash Commitment Mismatch] ${manifest.name}: expected ${manifest.committedCases.length} cases, got ${revealedCases.length}`
    );
  }
  const byId = new Map(manifest.committedCases.map((c) => [c.id, c]));
  for (const rc of revealedCases) {
    const committed = byId.get(rc.id);
    if (!committed) {
      throw new Error(`[Hash Commitment Mismatch] Unknown case id "${rc.id}" in revealed set for ${manifest.name}`);
    }
    const actualHash = sha256Hex(`${rc.id}:${rc.type}:${rc.change}`);
    if (actualHash !== committed.sha256) {
      throw new Error(
        `[Hash Commitment Tamper Detected] Case ${rc.id} hash ${actualHash} !== committed ${committed.sha256}`
      );
    }
  }
}

async function main() {
  const suites: Array<[string, RawCase[]]> = [
    ["prototype_42", PROTOTYPE_42_CASES],
    ["expanded_147", generate147BenchmarkCases()],
    ["rsi_remodeling_36", generate36RsiRemodelingCases()],
  ];

  const sealedManifests: HashCommitmentManifest[] = [];
  const casesDir = path.resolve("benchmark/cases");
  if (fs.existsSync(casesDir)) {
    for (const f of fs.readdirSync(casesDir).filter((x) => x.endsWith(".json")).sort()) {
      const raw = JSON.parse(fs.readFileSync(path.join(casesDir, f), "utf-8"));
      if (f.endsWith(".hashes.json") || raw.status === "SEALED_HASH_COMMITMENT") {
        sealedManifests.push(raw as HashCommitmentManifest);
      } else if (Array.isArray(raw.cases)) {
        suites.push([raw.name || path.basename(f, ".json"), raw.cases]);
      }
    }
  }

  // Optional --reveal <file.json> to verify and score a hash-committed suite such as community_seed_v1
  const revealIdx = process.argv.indexOf("--reveal");
  if (revealIdx !== -1 && process.argv[revealIdx + 1]) {
    const revealPath = path.resolve(process.argv[revealIdx + 1]);
    const revealedRaw = JSON.parse(fs.readFileSync(revealPath, "utf-8"));
    const targetManifest = sealedManifests.find((m) => m.name === revealedRaw.name);
    if (targetManifest) {
      verifyRevealedAgainstCommitment(targetManifest, revealedRaw.cases);
      console.log(`[Hash Verification Passed] ${targetManifest.name}: all ${revealedRaw.cases.length} SHA-256 preimages verified.`);
    }
    suites.push([`${revealedRaw.name} (verified-reveal)`, revealedRaw.cases]);
  }

  // Pass change text directly to the rule functions (evaluateBenchmark() leaks c.expectedResult on v3).
  const evaluators: BenchEvaluator[] = [
    { name: "watchdog:v1", evaluate: (ch) => SynapseEdgeWatchdogEngine.evaluateV1(ch).decision },
    { name: "watchdog:v2", evaluate: (ch) => SynapseEdgeWatchdogEngine.evaluateV2(ch).decision },
    { name: "watchdog:v3-spark-rsi", evaluate: (ch) => SynapseEdgeWatchdogEngine.evaluateV3SparkRsi(ch).decision },
    alwaysApprove,
    alwaysBlock,
    alwaysEscalate,
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
    "> **Headline Metrics Note:** Under a fail-closed policy, unrecognized changes default to `ESCALATE` (routed to a human reviewer). Therefore, **Risky caught** (`BLOCK` + `ESCALATE` on risky changes) must always be read alongside **Safe escalation rate** (`ESCALATE` on safe changes — the human review cost of fail-closed) and **False alarms** (`BLOCK` on safe changes).",
    "",
    "| Suite | Evaluator | Risky caught (95% Wilson CI) | Safe escalation rate (95% CI) | Safe auto-approved | False alarms / Safe blocked (95% CI) | Risky breakdown (Block / Escalate) |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const r of rows) {
    md.push(
      `| ${r.suite} | \`${r.evaluator}\` | ${fmtPct(r.caught, r.riskyTotal)} | ${fmtPct(r.escalatedSafe, r.safeTotal)} | ${r.approvedSafe}/${r.safeTotal} | ${fmtPct(r.falseAlarms, r.safeTotal)} | ${r.blockedRisky} blocked, ${r.escalatedRisky} escalated |`
    );
  }

  if (sealedManifests.length > 0) {
    md.push(
      "",
      "## Pre-committed Hash Suites (Plaintext Withheld Until Evaluation Reveal)",
      "",
      "| Suite | Status | Total Cases (Risky / Safe) | Merkle Root Commitment | Canonical Preimage Format |",
      "|---|---|---|---|---|"
    );
    for (const m of sealedManifests) {
      md.push(
        `| \`${m.name}\` | \`${m.status}\` | ${m.totalCases} (${m.riskyCount} risky / ${m.safeCount} safe) | \`${m.merkleRootHash.slice(0, 16)}…\` | \`${m.canonicalPreimageFormat}\` |`
      );
    }
  }

  const outDir = path.resolve("benchmark/results");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "latest.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), rows, sealedCommitments: sealedManifests }, null, 2) + "\n"
  );
  fs.writeFileSync(path.join(outDir, "latest.md"), md.join("\n") + "\n");
  console.log(md.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
