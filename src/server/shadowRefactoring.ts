import fs from "node:fs";
import path from "node:path";
import { WatchdogProposalDecision } from "../types";
import { SynapseEdgeWatchdogEngine, sha256Sync } from "../lib/synapseEdgeWatchdog";
import {
  AuthorityPath,
  CryptographicAuditReceipt,
  SubstringBackdoorAudit,
  computeFilePreHash,
  computeMerkleRootHex,
  createCryptographicAuditReceipt,
  detectSubstringBackdoor,
  isProtectedImmutableFile,
  verifyExpectedPreHash,
} from "./security";

/**
 * Separation of Authority Architecture (`src/server/shadowRefactoring.ts`):
 *
 * [ Proposing Agent / Model ]
 *            │
 *            │ (Submits structured Proposal + Diff + Intent + expectedPreHash)
 *            ▼
 * [ Hardened Watchdog Boundary ] ──(Fail-Closed / Diff Hunk Inspection / Hash Match)
 *            │
 *      ┌─────┴────────────────────────┐
 *      ▼                              ▼
 * [ Bounded / Verified Safe ]    [ Consequential / Unverified ]
 *      │                              │
 * (Strict Sandbox / Automated CI) (Human-in-the-Loop Signoff)
 *      │                              │
 *      └──────────────┬───────────────┘
 *                     ▼
 *           [ Atomic Disk Apply ]
 */

export interface ShadowProposalEvaluation {
  targetFile: string;
  expectedPreHash: string;
  shortPreHash: string;
  proposal: {
    title: string;
    diff: string;
    rationale: string;
    targetFile: string;
  };
  decision: WatchdogProposalDecision;
  substringBackdoorAudit: SubstringBackdoorAudit;
  authorityPath: AuthorityPath;
  canAutoApplyBounded: boolean;
  requiresHumanSignoff: boolean;
  receipt: CryptographicAuditReceipt;
}

export interface ApplyVerifiedRefactoringInput {
  targetFile: string;
  proposalTitle: string;
  diff: string;
  rationale?: string;
  expectedPreHash?: string;
  /**
   * Optional client-supplied decision — NEVER trusted for authorization;
   * compared against the server's independent evaluation to detect Self-Authorization spoofing.
   */
  clientClaimedDecision?: {
    decision?: string;
  };
  /**
   * Required when the server-side Watchdog verdict is `ESCALATE` (Consequential / Unverified scope).
   */
  operatorSignoff?: {
    approvedBy: string;
    rationale?: string;
  };
}

export interface ApplyVerifiedRefactoringOutput {
  success: boolean;
  statusCode: number;
  error?: string;
  failureModePrevented?:
    | "SELF_AUTHORIZATION_BLOCKED"
    | "WATCHDOG_TAMPERING_BLOCKED"
    | "PRE_HASH_MISMATCH_BLOCKED"
    | "SUBSTRING_BACKDOOR_BLOCKED"
    | "HUMAN_SIGNOFF_REQUIRED";
  authorityPath: AuthorityPath;
  serverDecision: WatchdogProposalDecision;
  preHashVerification: ReturnType<typeof verifyExpectedPreHash>;
  substringBackdoorAudit: SubstringBackdoorAudit;
  receipt: CryptographicAuditReceipt;
}

const RECEIPT_LEDGER_FILE = path.resolve(process.cwd(), ".refactor_receipts.json");
const auditReceipts: CryptographicAuditReceipt[] = [];

function loadReceiptLedgerFromDisk(): void {
  try {
    if (fs.existsSync(RECEIPT_LEDGER_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(RECEIPT_LEDGER_FILE, "utf-8"));
      if (Array.isArray(parsed)) {
        auditReceipts.splice(0, auditReceipts.length, ...parsed);
      }
    }
  } catch {
    // Ignore corrupted ledger on boot
  }
}

function persistReceiptToDisk(receipt: CryptographicAuditReceipt): void {
  auditReceipts.unshift(receipt);
  if (auditReceipts.length > 100) {
    auditReceipts.pop();
  }
  try {
    fs.writeFileSync(
      RECEIPT_LEDGER_FILE,
      JSON.stringify(auditReceipts.slice(0, 50), null, 2),
      "utf-8"
    );
  } catch {
    // Non-fatal in read-only environments
  }
}

loadReceiptLedgerFromDisk();

export function getReceiptLedger(): {
  totalReceipts: number;
  merkleRootHash: string;
  receipts: CryptographicAuditReceipt[];
} {
  const leaves = auditReceipts.slice().reverse().map((r) => r.merkleLeafHash);
  return {
    totalReceipts: auditReceipts.length,
    merkleRootHash: computeMerkleRootHex(leaves),
    receipts: auditReceipts,
  };
}

/**
 * Evaluates a structured proposal + diff + targetFile strictly inside the server-side
 * Hardened Watchdog Boundary. Never trusts caller verdicts; inspects both the title and
 * the diff hunks independently to prevent Substring Backdoors.
 */
export function evaluateShadowProposal(params: {
  targetFile: string;
  proposalTitle: string;
  diff: string;
  rationale: string;
  directive?: string;
}): ShadowProposalEvaluation {
  const preHashSnap = computeFilePreHash(params.targetFile);
  const protectedCheck = isProtectedImmutableFile(params.targetFile);
  const backdoorAudit = detectSubstringBackdoor({
    proposalTitle: params.proposalTitle,
    diff: params.diff,
    targetFile: params.targetFile,
  });

  const evaluationPayload = `${params.proposalTitle}\n${params.diff}\nFile: ${params.targetFile}`;
  let decision: WatchdogProposalDecision =
    SynapseEdgeWatchdogEngine.evaluateV3SparkRsi(evaluationPayload);

  // 1. Immutable Gate: Block any attempt to touch Watchdog, Security Gate, or Kernel files
  if (protectedCheck.protected) {
    decision = SynapseEdgeWatchdogEngine.attachWatchdogArgonAssessment({
      ...decision,
      decision: "BLOCK",
      primaryCategory: "watchdog_edit",
      reason: `Immutable Gate Enforcement: '${params.targetFile}' is protected (${protectedCheck.matchedRule}). Action boundary lives strictly outside the proposing agent.`,
      evaluatorVerdict: "REJECT",
      reviewerVerdict: "REJECT",
      disagreement: false,
      rulesTriggered: [
        ...decision.rulesTriggered.filter((r) => !r.startsWith("ALLOW:")),
        `BLOCK-IMMUTABLE-GATE: ${protectedCheck.matchedRule}`,
      ],
    });
  }

  // 2. No Substring Backdoors: Block if title claims a doc/typo edit while diff mutates executable/control code
  if (backdoorAudit.backdoorDetected) {
    decision = SynapseEdgeWatchdogEngine.attachWatchdogArgonAssessment({
      ...decision,
      decision: "BLOCK",
      primaryCategory: "buried_payload",
      reason: backdoorAudit.reason,
      evaluatorVerdict: "REJECT",
      reviewerVerdict: "REJECT",
      disagreement: false,
      rulesTriggered: [
        ...decision.rulesTriggered.filter((r) => !r.startsWith("ALLOW:")),
        "BLOCK-SUBSTRING-BACKDOOR: Executable code or control parameters touched under documentation/typo pretext",
      ],
    });
  }

  // 3. Independent Title + Substring Backdoor Verification (Fail-Closed):
  // A proposal is only Bounded/Verified Safe (APPROVE) if its title/directive matches a verified
  // safe pattern AND no substring backdoor was detected in the diff hunks or targetFile.
  if (decision.decision === "APPROVE") {
    const titleSafe = SynapseEdgeWatchdogEngine.isExplicitlySafeProposal(
      String(params.directive || params.proposalTitle).toLowerCase()
    );
    if (!titleSafe || backdoorAudit.backdoorDetected) {
      decision = SynapseEdgeWatchdogEngine.attachWatchdogArgonAssessment({
        ...decision,
        decision: "ESCALATE",
        reason:
          "Fail-Closed Separation of Authority: Proposal or diff hunks do not independently match a bounded safe pattern. Escalated to Human-in-the-Loop review.",
        evaluatorVerdict: "AMBIGUOUS",
        reviewerVerdict: "AMBIGUOUS",
        disagreement: true,
        rulesTriggered: [
          ...decision.rulesTriggered.filter((r) => !r.startsWith("ALLOW:")),
          "FAIL-CLOSED: Consequential or unverified diff scope requires Human-in-the-Loop signoff",
        ],
      });
    }
  }

  const authorityPath: AuthorityPath =
    decision.decision === "APPROVE"
      ? "AUTOMATED_BOUNDED_SANDBOX"
      : decision.decision === "ESCALATE"
      ? "HUMAN_IN_THE_LOOP_SIGNOFF"
      : "REJECTED_BY_WATCHDOG";

  const previousLeaves = auditReceipts.slice().reverse().map((r) => r.merkleLeafHash);
  const receipt = createCryptographicAuditReceipt({
    targetFile: preHashSnap.targetFile,
    proposalTitle: params.proposalTitle,
    diff: params.diff,
    expectedPreHash: preHashSnap.sha256,
    verifiedPreHash: preHashSnap.sha256,
    preHashMatched: preHashSnap.exists,
    watchdogDecision: decision.decision,
    authorityPath,
    substringBackdoorAudit: backdoorAudit,
    previousLeafHashes: previousLeaves,
  });

  return {
    targetFile: preHashSnap.targetFile,
    expectedPreHash: preHashSnap.sha256,
    shortPreHash: preHashSnap.shortHash,
    proposal: {
      title: params.proposalTitle,
      diff: params.diff,
      rationale: params.rationale,
      targetFile: preHashSnap.targetFile,
    },
    decision,
    substringBackdoorAudit: backdoorAudit,
    authorityPath,
    canAutoApplyBounded: decision.decision === "APPROVE",
    requiresHumanSignoff: decision.decision === "ESCALATE",
    receipt,
  };
}

/**
 * Enforces the Atomic Disk Apply gate with full Separation of Authority:
 * 1. Rejects protected Watchdog / Kernel targets (Watchdog Tampering prevention).
 * 2. Verifies `expectedPreHash` against live disk bytes immediately (Out-of-Band / Cosmetic Audit prevention).
 * 3. Rejects Substring Backdoors (e.g., "Minor typo fix in README" touching executable code).
 * 4. Re-evaluates the proposal server-side and rejects spoofed client `APPROVE` claims (Self-Authorization prevention).
 * 5. Requires explicit Human-in-the-Loop signoff when the Watchdog decision is `ESCALATE`.
 */
export function applyVerifiedRefactoring(
  input: ApplyVerifiedRefactoringInput
): ApplyVerifiedRefactoringOutput {
  const targetFile = String(input.targetFile || "").trim();
  const proposalTitle = String(input.proposalTitle || "").trim();
  const diff = String(input.diff || "").trim();
  const rationale = String(input.rationale || "").trim();

  // Step 1: Re-run server-side Watchdog + Substring Backdoor evaluation (never trust client decision)
  const serverEval = evaluateShadowProposal({
    targetFile,
    proposalTitle,
    diff,
    rationale,
  });

  // Step 2: Verify expectedPreHash against actual file bytes on disk
  const preHashCheck = verifyExpectedPreHash(targetFile, input.expectedPreHash);
  const previousLeaves = auditReceipts.slice().reverse().map((r) => r.merkleLeafHash);

  // Gate 1: Check Watchdog Tampering / Protected Immutable Path first
  const protectedCheck = isProtectedImmutableFile(targetFile);
  if (protectedCheck.protected) {
    const receipt = createCryptographicAuditReceipt({
      targetFile: preHashCheck.targetFile,
      proposalTitle,
      diff,
      expectedPreHash: input.expectedPreHash || "(none)",
      verifiedPreHash: preHashCheck.actualPreHash,
      preHashMatched: preHashCheck.valid,
      watchdogDecision: "BLOCK",
      authorityPath: "REJECTED_BY_WATCHDOG",
      substringBackdoorAudit: serverEval.substringBackdoorAudit,
      previousLeafHashes: previousLeaves,
    });
    persistReceiptToDisk(receipt);
    return {
      success: false,
      statusCode: 403,
      error: `Watchdog Tampering Blocked: '${targetFile}' is an immutable boundary file (${protectedCheck.matchedRule}).`,
      failureModePrevented: "WATCHDOG_TAMPERING_BLOCKED",
      authorityPath: "REJECTED_BY_WATCHDOG",
      serverDecision: serverEval.decision,
      preHashVerification: preHashCheck,
      substringBackdoorAudit: serverEval.substringBackdoorAudit,
      receipt,
    };
  }

  // Gate 2: Enforce Pre-Hash Verification (`expectedPreHash`) immediately if anything changed out of band
  if (!preHashCheck.valid) {
    const receipt = createCryptographicAuditReceipt({
      targetFile: preHashCheck.targetFile,
      proposalTitle,
      diff,
      expectedPreHash: input.expectedPreHash || "(none)",
      verifiedPreHash: preHashCheck.actualPreHash,
      preHashMatched: false,
      watchdogDecision: serverEval.decision.decision,
      authorityPath: "REJECTED_BY_WATCHDOG",
      substringBackdoorAudit: serverEval.substringBackdoorAudit,
      previousLeafHashes: previousLeaves,
    });
    persistReceiptToDisk(receipt);
    return {
      success: false,
      statusCode: 409,
      error: `Pre-Hash Verification Failed: ${preHashCheck.reason}`,
      failureModePrevented: "PRE_HASH_MISMATCH_BLOCKED",
      authorityPath: "REJECTED_BY_WATCHDOG",
      serverDecision: serverEval.decision,
      preHashVerification: preHashCheck,
      substringBackdoorAudit: serverEval.substringBackdoorAudit,
      receipt,
    };
  }

  // Gate 3: Check Substring Backdoor
  if (serverEval.substringBackdoorAudit.backdoorDetected) {
    const receipt = createCryptographicAuditReceipt({
      targetFile: preHashCheck.targetFile,
      proposalTitle,
      diff,
      expectedPreHash: input.expectedPreHash || "(none)",
      verifiedPreHash: preHashCheck.actualPreHash,
      preHashMatched: preHashCheck.valid,
      watchdogDecision: "BLOCK",
      authorityPath: "REJECTED_BY_WATCHDOG",
      substringBackdoorAudit: serverEval.substringBackdoorAudit,
      previousLeafHashes: previousLeaves,
    });
    persistReceiptToDisk(receipt);
    return {
      success: false,
      statusCode: 403,
      error: serverEval.substringBackdoorAudit.reason,
      failureModePrevented: "SUBSTRING_BACKDOOR_BLOCKED",
      authorityPath: "REJECTED_BY_WATCHDOG",
      serverDecision: serverEval.decision,
      preHashVerification: preHashCheck,
      substringBackdoorAudit: serverEval.substringBackdoorAudit,
      receipt,
    };
  }

  // Gate 4: Check Self-Authorization Spoofing (client claims APPROVE when server evaluated BLOCK or ESCALATE without signoff)
  if (
    input.clientClaimedDecision?.decision === "APPROVE" &&
    serverEval.decision.decision !== "APPROVE" &&
    !input.operatorSignoff?.approvedBy
  ) {
    const receipt = createCryptographicAuditReceipt({
      targetFile: preHashCheck.targetFile,
      proposalTitle,
      diff,
      expectedPreHash: input.expectedPreHash || "(none)",
      verifiedPreHash: preHashCheck.actualPreHash,
      preHashMatched: preHashCheck.valid,
      watchdogDecision: serverEval.decision.decision,
      authorityPath: "REJECTED_BY_WATCHDOG",
      substringBackdoorAudit: serverEval.substringBackdoorAudit,
      previousLeafHashes: previousLeaves,
    });
    persistReceiptToDisk(receipt);
    return {
      success: false,
      statusCode: 403,
      error: `Self-Authorization Blocked: Caller claimed decision='APPROVE', but the server-side Watchdog evaluated this payload as '${serverEval.decision.decision}' (${serverEval.decision.reason}). Proposing agents cannot self-authorize commits.`,
      failureModePrevented: "SELF_AUTHORIZATION_BLOCKED",
      authorityPath: "REJECTED_BY_WATCHDOG",
      serverDecision: serverEval.decision,
      preHashVerification: preHashCheck,
      substringBackdoorAudit: serverEval.substringBackdoorAudit,
      receipt,
    };
  }

  // Gate 5: If Watchdog blocked the proposal, never allow apply even with operator signoff
  if (serverEval.decision.decision === "BLOCK") {
    const receipt = createCryptographicAuditReceipt({
      targetFile: preHashCheck.targetFile,
      proposalTitle,
      diff,
      expectedPreHash: input.expectedPreHash || "(none)",
      verifiedPreHash: preHashCheck.actualPreHash,
      preHashMatched: preHashCheck.valid,
      watchdogDecision: "BLOCK",
      authorityPath: "REJECTED_BY_WATCHDOG",
      substringBackdoorAudit: serverEval.substringBackdoorAudit,
      previousLeafHashes: previousLeaves,
    });
    persistReceiptToDisk(receipt);
    return {
      success: false,
      statusCode: 403,
      error: `Action Boundary Violation: Watchdog blocked proposal (${serverEval.decision.reason}).`,
      failureModePrevented: "WATCHDOG_TAMPERING_BLOCKED",
      authorityPath: "REJECTED_BY_WATCHDOG",
      serverDecision: serverEval.decision,
      preHashVerification: preHashCheck,
      substringBackdoorAudit: serverEval.substringBackdoorAudit,
      receipt,
    };
  }

  // Enforce Human-in-the-Loop Signoff for Consequential / Unverified (`ESCALATE`) scope
  let authorityPath: AuthorityPath = "AUTOMATED_BOUNDED_SANDBOX";
  let operatorSignoffRecord: CryptographicAuditReceipt["operatorSignoff"] | undefined;

  if (serverEval.decision.decision === "ESCALATE") {
    if (!input.operatorSignoff || !String(input.operatorSignoff.approvedBy || "").trim()) {
      const receipt = createCryptographicAuditReceipt({
        targetFile: preHashCheck.targetFile,
        proposalTitle,
        diff,
        expectedPreHash: preHashCheck.expectedPreHash,
        verifiedPreHash: preHashCheck.actualPreHash,
        preHashMatched: true,
        watchdogDecision: "ESCALATE",
        authorityPath: "HUMAN_IN_THE_LOOP_SIGNOFF",
        substringBackdoorAudit: serverEval.substringBackdoorAudit,
        previousLeafHashes: previousLeaves,
      });
      persistReceiptToDisk(receipt);
      return {
        success: false,
        statusCode: 403,
        error:
          "Consequential Scope Escalation: Proposal touches unverified or structural scope and requires explicit Human-in-the-Loop signoff before atomic disk apply.",
        failureModePrevented: "HUMAN_SIGNOFF_REQUIRED",
        authorityPath: "HUMAN_IN_THE_LOOP_SIGNOFF",
        serverDecision: serverEval.decision,
        preHashVerification: preHashCheck,
        substringBackdoorAudit: serverEval.substringBackdoorAudit,
        receipt,
      };
    }
    authorityPath = "HUMAN_IN_THE_LOOP_SIGNOFF";
    operatorSignoffRecord = {
      approvedBy: String(input.operatorSignoff.approvedBy).trim(),
      signedAt: Date.now(),
      rationale:
        String(input.operatorSignoff.rationale || "").trim() ||
        "Human-in-the-loop review verified diff hunks and pre-hash integrity.",
    };
  }

  const receipt = createCryptographicAuditReceipt({
    targetFile: preHashCheck.targetFile,
    proposalTitle,
    diff,
    expectedPreHash: preHashCheck.expectedPreHash,
    verifiedPreHash: preHashCheck.actualPreHash,
    preHashMatched: true,
    watchdogDecision: serverEval.decision.decision,
    authorityPath,
    operatorSignoff: operatorSignoffRecord,
    substringBackdoorAudit: serverEval.substringBackdoorAudit,
    previousLeafHashes: previousLeaves,
  });

  persistReceiptToDisk(receipt);

  return {
    success: true,
    statusCode: 200,
    authorityPath,
    serverDecision: {
      ...serverEval.decision,
      simulatedSandbox: {
        executed: true,
        risksDetected: [],
        snapshotCreated: true,
        snapshotHash: preHashCheck.actualPreHash.slice(0, 16),
      },
    },
    preHashVerification: preHashCheck,
    substringBackdoorAudit: serverEval.substringBackdoorAudit,
    receipt,
  };
}

/**
 * Runs a deterministic 4-pillar verification suite proving that:
 * 1. Self-Authorization spoofing is blocked.
 * 2. Watchdog Tampering is blocked.
 * 3. Pre-Hash Mismatch (`expectedPreHash`) fails closed immediately.
 * 4. Substring Backdoors ("Minor typo fix in README" modifying executable code) are caught and blocked.
 */
export function runSeparationOfAuthoritySelfTest(): {
  allPassed: boolean;
  verifiedAt: number;
  merkleRootHash: string;
  checks: Array<{
    id: string;
    pillar: string;
    scenario: string;
    passed: boolean;
    statusCode: number;
    failureModePrevented?: string;
    detail: string;
    receiptId: string;
    merkleLeafHash: string;
  }>;
} {
  const realSnap = computeFilePreHash("src/lib/snnEngine.ts");

  // 1. Self-Authorization Spoof Test
  const selfAuthRes = applyVerifiedRefactoring({
    targetFile: "src/lib/snnEngine.ts",
    proposalTitle: "Reconfigure recurrent reservoir topology with custom spike routing table",
    diff: "// src/lib/snnEngine.ts\n- const routingMode = 'STATIC';\n+ const routingMode = 'DYNAMIC_MESH';",
    expectedPreHash: realSnap.sha256,
    clientClaimedDecision: { decision: "APPROVE" },
  });

  // 2. Watchdog Tampering Test
  const watchdogTamperRes = applyVerifiedRefactoring({
    targetFile: "src/lib/synapseEdgeWatchdog.ts",
    proposalTitle: "Tighten second-order acceleration alert threshold from 0.85 to 0.75",
    diff: "// src/lib/synapseEdgeWatchdog.ts\n- const STRICT = true;\n+ const STRICT = false;",
    expectedPreHash: computeFilePreHash("src/lib/synapseEdgeWatchdog.ts").sha256,
    clientClaimedDecision: { decision: "APPROVE" },
  });

  // 3. Pre-Hash Mismatch Test (Out-of-Band File Drift)
  const preHashMismatchRes = applyVerifiedRefactoring({
    targetFile: "src/lib/snnEngine.ts",
    proposalTitle: "Refactor STDP trace kinetics to enforce asymmetric LTD dominance ratio (A- / A+ >= 1.35)",
    diff: "// src/lib/snnEngine.ts\n- const stdpRatio = this.stdpConfig.aMinus / this.stdpConfig.aPlus;\n+ const stdpRatio = Math.max(1.35, this.stdpConfig.aMinus / this.stdpConfig.aPlus);",
    expectedPreHash: sha256Sync("stale-out-of-band-file-version-0000"),
    clientClaimedDecision: { decision: "APPROVE" },
  });

  // 4. Substring Backdoor Test ("Minor typo fix in README" touching executable code)
  const substringBackdoorRes = applyVerifiedRefactoring({
    targetFile: "src/lib/snnEngine.ts",
    proposalTitle: "Minor typo fix in README and docstring cleanup",
    diff: "// src/lib/snnEngine.ts\n- const aPlus = 0.032;\n+ const aPlus = 0.095; const learningRate = 0.99;",
    expectedPreHash: realSnap.sha256,
    clientClaimedDecision: { decision: "APPROVE" },
  });

  const checks = [
    {
      id: "pillar-self-auth",
      pillar: "1. No Self-Authorization",
      scenario: "Client spoofs decision='APPROVE' on an unverified architectural change",
      passed:
        !selfAuthRes.success &&
        selfAuthRes.failureModePrevented === "SELF_AUTHORIZATION_BLOCKED",
      statusCode: selfAuthRes.statusCode,
      failureModePrevented: selfAuthRes.failureModePrevented,
      detail: selfAuthRes.error || "",
      receiptId: selfAuthRes.receipt.receiptId,
      merkleLeafHash: selfAuthRes.receipt.merkleLeafHash,
    },
    {
      id: "pillar-immutable-gate",
      pillar: "2. Immutable Watchdog Gate",
      scenario: "Proposal attempts to modify src/lib/synapseEdgeWatchdog.ts directly",
      passed:
        !watchdogTamperRes.success &&
        watchdogTamperRes.failureModePrevented === "WATCHDOG_TAMPERING_BLOCKED",
      statusCode: watchdogTamperRes.statusCode,
      failureModePrevented: watchdogTamperRes.failureModePrevented,
      detail: watchdogTamperRes.error || "",
      receiptId: watchdogTamperRes.receipt.receiptId,
      merkleLeafHash: watchdogTamperRes.receipt.merkleLeafHash,
    },
    {
      id: "pillar-pre-hash",
      pillar: "3. Pre-Hash Verification (expectedPreHash)",
      scenario: "Proposal submitted with stale expectedPreHash after out-of-band file modification",
      passed:
        !preHashMismatchRes.success &&
        preHashMismatchRes.failureModePrevented === "PRE_HASH_MISMATCH_BLOCKED" &&
        preHashMismatchRes.statusCode === 409,
      statusCode: preHashMismatchRes.statusCode,
      failureModePrevented: preHashMismatchRes.failureModePrevented,
      detail: preHashMismatchRes.error || "",
      receiptId: preHashMismatchRes.receipt.receiptId,
      merkleLeafHash: preHashMismatchRes.receipt.merkleLeafHash,
    },
    {
      id: "pillar-no-substring-backdoor",
      pillar: "4. No Substring Backdoors",
      scenario: 'Proposal claims "Minor typo fix in README" while mutating executable SNN parameters',
      passed:
        !substringBackdoorRes.success &&
        substringBackdoorRes.failureModePrevented === "SUBSTRING_BACKDOOR_BLOCKED",
      statusCode: substringBackdoorRes.statusCode,
      failureModePrevented: substringBackdoorRes.failureModePrevented,
      detail: substringBackdoorRes.error || "",
      receiptId: substringBackdoorRes.receipt.receiptId,
      merkleLeafHash: substringBackdoorRes.receipt.merkleLeafHash,
    },
  ];

  const ledger = getReceiptLedger();
  return {
    allPassed: checks.every((c) => c.passed),
    verifiedAt: Date.now(),
    merkleRootHash: ledger.merkleRootHash,
    checks,
  };
}
