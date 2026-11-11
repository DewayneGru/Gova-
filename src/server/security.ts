import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Computes a binary Merkle root over hex-encoded SHA-256 leaf digests.
 * Uses the identical construction to benchmark/commitment.ts (`SHA256(left || right)`
 * with odd-leaf duplication) and returns a deterministic sentinel digest on an empty tree.
 */
export function computeMerkleRootHex(leafHexes: string[]): string {
  if (leafHexes.length === 0) {
    return crypto.createHash("sha256").update("empty-receipt-merkle-tree", "utf8").digest("hex");
  }
  let level: Uint8Array[] = leafHexes.map((h) => Buffer.from(h, "hex"));
  while (level.length > 1) {
    if (level.length % 2 === 1) level.push(level[level.length - 1]);
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(
        crypto
          .createHash("sha256")
          .update(Buffer.concat([level[i], level[i + 1]]))
          .digest()
      );
    }
    level = next;
  }
  return Buffer.from(level[0]).toString("hex");
}

/**
 * Immutable system files that the proposing agent/model can NEVER modify,
 * regardless of intent, diff, or operator override.
 */
export const PROTECTED_IMMUTABLE_PATHS = [
  "src/lib/synapseEdgeWatchdog.ts",
  "src/server/security.ts",
  "src/server/shadowRefactoring.ts",
  "server.ts",
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "benchmark/",
  "synapse_governor.py",
  "test_synapse_governor.py",
] as const;

export interface FilePreHashSnapshot {
  targetFile: string;
  resolvedPath: string;
  exists: boolean;
  sha256: string;
  shortHash: string;
  sizeBytes: number;
  computedAt: number;
}

export interface PreHashVerificationResult {
  valid: boolean;
  targetFile: string;
  expectedPreHash: string;
  actualPreHash: string;
  reason: string;
}

export interface SubstringBackdoorAudit {
  backdoorDetected: boolean;
  claimsDocOrTypoOnly: boolean;
  targetsExecutableFile: boolean;
  touchesExecutableOrControlCode: boolean;
  executableLinesTouched: string[];
  reason: string;
}

export type AuthorityPath =
  | "AUTOMATED_BOUNDED_SANDBOX"
  | "HUMAN_IN_THE_LOOP_SIGNOFF"
  | "REJECTED_BY_WATCHDOG";

export interface CryptographicAuditReceipt {
  receiptId: string;
  timestamp: number;
  targetFile: string;
  proposalTitle: string;
  expectedPreHash: string;
  verifiedPreHash: string;
  preHashMatched: boolean;
  diffSha256: string;
  evaluatedPayloadSha256: string;
  merkleLeafHash: string;
  merkleRootAfterCommit: string;
  watchdogDecision: "APPROVE" | "ESCALATE" | "BLOCK";
  authorityPath: AuthorityPath;
  operatorSignoff?: {
    approvedBy: string;
    signedAt: number;
    rationale: string;
  };
  substringBackdoorAudit: SubstringBackdoorAudit;
  hmacSignature: string;
}

export function sha256HexServer(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Resolves a workspace-relative path safely inside process.cwd() and rejects
 * path traversal or access outside the repository root.
 */
export function resolveSafeRepoPath(relativeFilePath: string): {
  safe: boolean;
  normalizedRelPath: string;
  resolvedAbsPath: string;
  reason?: string;
} {
  const root = path.resolve(process.cwd());
  const cleaned = String(relativeFilePath || "")
    .trim()
    .replace(/^[/\\]+/, "");
  if (!cleaned || cleaned.includes("\0")) {
    return {
      safe: false,
      normalizedRelPath: cleaned,
      resolvedAbsPath: root,
      reason: "Target file path is empty or contains null bytes.",
    };
  }
  const resolved = path.resolve(root, cleaned);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return {
      safe: false,
      normalizedRelPath: cleaned,
      resolvedAbsPath: resolved,
      reason: "Path traversal outside repository root is forbidden.",
    };
  }
  const normalizedRel = path.relative(root, resolved).replace(/\\/g, "/");
  return {
    safe: true,
    normalizedRelPath: normalizedRel,
    resolvedAbsPath: resolved,
  };
}

/**
 * Checks whether a target file is part of the immutable Watchdog / Security / Kernel boundary.
 */
export function isProtectedImmutableFile(relativeFilePath: string): {
  protected: boolean;
  matchedRule?: string;
} {
  const { safe, normalizedRelPath, reason } = resolveSafeRepoPath(relativeFilePath);
  if (!safe) {
    return { protected: true, matchedRule: reason || "Unsafe file path" };
  }
  const lower = normalizedRelPath.toLowerCase();
  if (lower.includes("watchdog") || lower.includes("guardrail")) {
    return {
      protected: true,
      matchedRule: "Immutable Watchdog Boundary (watchdog/guardrail path)",
    };
  }
  for (const rule of PROTECTED_IMMUTABLE_PATHS) {
    const ruleLower = rule.toLowerCase();
    if (
      ruleLower.endsWith("/")
        ? lower.startsWith(ruleLower)
        : lower === ruleLower || lower.endsWith("/" + ruleLower)
    ) {
      return {
        protected: true,
        matchedRule: `Protected immutable boundary file: ${rule}`,
      };
    }
  }
  return { protected: false };
}

/**
 * Computes the exact SHA-256 digest of a file's bytes on disk for Pre-Hash Verification.
 */
export function computeFilePreHash(relativeFilePath: string): FilePreHashSnapshot {
  const { safe, normalizedRelPath, resolvedAbsPath } = resolveSafeRepoPath(relativeFilePath);
  if (!safe || !fs.existsSync(resolvedAbsPath) || !fs.statSync(resolvedAbsPath).isFile()) {
    const fallbackHash = sha256HexServer(`missing-file:${normalizedRelPath}`);
    return {
      targetFile: normalizedRelPath,
      resolvedPath: resolvedAbsPath,
      exists: false,
      sha256: fallbackHash,
      shortHash: fallbackHash.slice(0, 16),
      sizeBytes: 0,
      computedAt: Date.now(),
    };
  }
  const buf = fs.readFileSync(resolvedAbsPath);
  const digest = sha256HexServer(buf);
  return {
    targetFile: normalizedRelPath,
    resolvedPath: resolvedAbsPath,
    exists: true,
    sha256: digest,
    shortHash: digest.slice(0, 16),
    sizeBytes: buf.byteLength,
    computedAt: Date.now(),
  };
}

/**
 * Enforces strict Pre-Hash Verification (`expectedPreHash`).
 * If the file on disk does not exist, or if `expectedPreHash` is missing or does not match
 * the file's current SHA-256 on disk, the gate fails closed immediately.
 */
export function verifyExpectedPreHash(
  targetFile: string,
  expectedPreHash?: string
): PreHashVerificationResult {
  const snapshot = computeFilePreHash(targetFile);
  const supplied = String(expectedPreHash || "").trim().toLowerCase();

  if (!snapshot.exists) {
    return {
      valid: false,
      targetFile: snapshot.targetFile,
      expectedPreHash: supplied || "(missing)",
      actualPreHash: snapshot.sha256,
      reason: `Target file '${snapshot.targetFile}' does not exist on disk.`,
    };
  }

  if (!supplied || supplied.length < 16) {
    return {
      valid: false,
      targetFile: snapshot.targetFile,
      expectedPreHash: supplied || "(none)",
      actualPreHash: snapshot.sha256,
      reason: "Missing or truncated expectedPreHash (minimum 16-hex prefix or full 64-hex SHA-256 required).",
    };
  }

  const matchesFull = supplied === snapshot.sha256.toLowerCase();
  const matchesPrefix =
    supplied.length === 16 && snapshot.sha256.toLowerCase().startsWith(supplied);

  if (!matchesFull && !matchesPrefix) {
    return {
      valid: false,
      targetFile: snapshot.targetFile,
      expectedPreHash: supplied,
      actualPreHash: snapshot.sha256,
      reason: `Out-of-band file modification detected: expectedPreHash (${supplied.slice(
        0,
        16
      )}…) !== actual disk SHA-256 (${snapshot.shortHash}…).`,
    };
  }

  return {
    valid: true,
    targetFile: snapshot.targetFile,
    expectedPreHash: supplied,
    actualPreHash: snapshot.sha256,
    reason: `Pre-hash verified against live disk bytes (${snapshot.shortHash}…).`,
  };
}

/**
 * Detects Substring Backdoors where a proposal claims to be a harmless documentation,
 * comment, or typo edit (e.g., "Minor typo fix in README") while touching an executable
 * code file or modifying executable statements / control parameters in the diff.
 */
export function detectSubstringBackdoor(params: {
  proposalTitle: string;
  diff: string;
  targetFile: string;
}): SubstringBackdoorAudit {
  const titleLower = String(params.proposalTitle || "").toLowerCase();
  const diffText = String(params.diff || "");
  const fileLower = String(params.targetFile || "").toLowerCase();

  // Does the title/intent claim to be a doc, comment, or typo change?
  const docOrTypoClaimRegex =
    /\b(typo|readme|docstring|spelling|comment\s+only|minor\s+doc|markdown|\.md)\b/i;
  const claimsDocOrTypoOnly = docOrTypoClaimRegex.test(titleLower);

  // Is the target file an executable or config file rather than markdown/docs?
  const executableExtRegex = /\.(ts|tsx|js|jsx|py|sh|json|yaml|yml|toml)$/i;
  const targetsExecutableFile = executableExtRegex.test(fileLower);

  // Extract modified lines (+ or - lines, excluding --- / +++ diff headers and pure // or # comments)
  const diffLines = diffText
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        (l.startsWith("+") || l.startsWith("-")) &&
        !l.startsWith("+++") &&
        !l.startsWith("---")
    );

  const executableLinesTouched: string[] = [];
  const executableConstructRegex =
    /\b(const|let|var|function|return|if|else|for|while|import|export|await|async|fetch|eval|exec|spawn|process\.|fs\.|window\.|document\.|threshold|aPlus|aMinus|ltdLtpRatio|learningRate|turnGain|proximityGain|sigma|k_gain|R_TARGET|decision|APPROVE|BLOCK|ESCALATE)\b|[=;{}()]/;

  for (const rawLine of diffLines) {
    const body = rawLine.slice(1).trim();
    if (!body) continue;
    // Pure single-line comment in TS/JS/Py
    if (body.startsWith("//") || body.startsWith("#") || body.startsWith("*")) {
      // Check if even inside a comment or line there's executable code after a semicolon or newline
      continue;
    }
    if (executableConstructRegex.test(body)) {
      executableLinesTouched.push(body);
    }
  }

  const touchesExecutableOrControlCode = executableLinesTouched.length > 0;

  // Backdoor Case 1: Claims doc/typo fix in title, but touches executable code or non-doc file
  if (claimsDocOrTypoOnly && (touchesExecutableOrControlCode || (targetsExecutableFile && fileLower.includes("readme") === false && titleLower.includes("readme")))) {
    return {
      backdoorDetected: true,
      claimsDocOrTypoOnly,
      targetsExecutableFile,
      touchesExecutableOrControlCode,
      executableLinesTouched,
      reason: `Substring Backdoor Intercepted: Proposal claims a documentation/typo change ("${params.proposalTitle.slice(
        0,
        80
      )}") while targeting '${params.targetFile}' and modifying ${
        executableLinesTouched.length
      } executable/control line(s).`,
    };
  }

  // Backdoor Case 2: Diff is empty or synthetic placeholder while claiming safe codebase commit
  if (diffLines.length === 0 && diffText.trim().length === 0) {
    return {
      backdoorDetected: true,
      claimsDocOrTypoOnly,
      targetsExecutableFile,
      touchesExecutableOrControlCode: false,
      executableLinesTouched: [],
      reason:
        "Cosmetic Audit Prevention: Proposal submitted without a concrete verifiable diff payload.",
    };
  }

  return {
    backdoorDetected: false,
    claimsDocOrTypoOnly,
    targetsExecutableFile,
    touchesExecutableOrControlCode,
    executableLinesTouched,
    reason: "Diff hunks and target file scope are consistent with stated proposal intent.",
  };
}

/**
 * Signs and packages a reproducible Cryptographic Audit Receipt linked into the Merkle tree.
 */
export function createCryptographicAuditReceipt(params: {
  targetFile: string;
  proposalTitle: string;
  diff: string;
  expectedPreHash: string;
  verifiedPreHash: string;
  preHashMatched: boolean;
  watchdogDecision: "APPROVE" | "ESCALATE" | "BLOCK";
  authorityPath: AuthorityPath;
  operatorSignoff?: {
    approvedBy: string;
    signedAt: number;
    rationale: string;
  };
  substringBackdoorAudit: SubstringBackdoorAudit;
  previousLeafHashes: string[];
}): CryptographicAuditReceipt {
  const timestamp = Date.now();
  const receiptId = `rcpt-${timestamp}-${crypto.randomBytes(3).toString("hex")}`;
  const diffSha256 = sha256HexServer(params.diff || "");
  const evaluatedPayloadSha256 = sha256HexServer(
    `${params.proposalTitle}\n${params.diff}\nFile: ${params.targetFile}`
  );

  const canonicalPreimage = JSON.stringify({
    receiptId,
    timestamp,
    targetFile: params.targetFile,
    proposalTitle: params.proposalTitle,
    expectedPreHash: params.expectedPreHash,
    verifiedPreHash: params.verifiedPreHash,
    preHashMatched: params.preHashMatched,
    diffSha256,
    evaluatedPayloadSha256,
    watchdogDecision: params.watchdogDecision,
    authorityPath: params.authorityPath,
    operatorSignoff: params.operatorSignoff || null,
    backdoorDetected: params.substringBackdoorAudit.backdoorDetected,
  });

  const merkleLeafHash = sha256HexServer(canonicalPreimage);
  const allLeaves = [...params.previousLeafHashes, merkleLeafHash];
  const merkleRootAfterCommit = computeMerkleRootHex(allLeaves);

  const hmacKey =
    process.env.ACTIONLOG_HMAC_KEY && process.env.ACTIONLOG_HMAC_KEY.length >= 32
      ? process.env.ACTIONLOG_HMAC_KEY
      : "synapse-edge-watchdog-deterministic-receipt-key-v3-2026";
  const hmacSignature = crypto
    .createHmac("sha256", hmacKey)
    .update(`${merkleLeafHash}:${merkleRootAfterCommit}`)
    .digest("hex");

  return {
    receiptId,
    timestamp,
    targetFile: params.targetFile,
    proposalTitle: params.proposalTitle,
    expectedPreHash: params.expectedPreHash,
    verifiedPreHash: params.verifiedPreHash,
    preHashMatched: params.preHashMatched,
    diffSha256,
    evaluatedPayloadSha256,
    merkleLeafHash,
    merkleRootAfterCommit,
    watchdogDecision: params.watchdogDecision,
    authorityPath: params.authorityPath,
    operatorSignoff: params.operatorSignoff,
    substringBackdoorAudit: params.substringBackdoorAudit,
    hmacSignature,
  };
}
