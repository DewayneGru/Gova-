import { isProtectedImmutableFile, resolveSafeRepoPath } from "../server/security";

export type StructuralTargetTier = "Tier-1-Refactor" | "Tier-2-Protected";

export interface WriteApprovalRecord {
  proposalId: string;
  requestedTargetPath: string;
  canonicalTargetPath: string;
  ownerUid: string;
  approved: boolean;
  updatedAt: number;
  tier: StructuralTargetTier;
}

export interface WriteGateEvaluationResult {
  allowed: boolean;
  requestedTargetPath: string;
  canonicalTargetPath: string;
  symlinkFollowed: boolean;
  tier: StructuralTargetTier;
  ownerUidVerified: boolean;
  reason: string;
}

const DEFAULT_WORKSPACE_OWNER_UID = "uid-bryan-gova-lead-01";

const writeApprovalRegistry = new Map<string, WriteApprovalRecord>();

/**
 * Classifies a requested path after `fs.realpathSync` canonicalization into
 * `"Tier-1-Refactor"` (eligible for UID-approved shadow refactoring) or
 * `"Tier-2-Protected"` (immutable security/kernel boundary, hard-blocked).
 */
export function classifyTargetProtectionTier(targetPath: string): {
  safe: boolean;
  requestedPath: string;
  canonicalPath: string;
  symlinkFollowed: boolean;
  tier: StructuralTargetTier;
  reason: string;
} {
  const pathCheck = resolveSafeRepoPath(targetPath);
  if (!pathCheck.safe) {
    return {
      safe: false,
      requestedPath: String(targetPath || ""),
      canonicalPath: pathCheck.normalizedRelPath || String(targetPath || ""),
      symlinkFollowed: Boolean(pathCheck.symlinkFollowed),
      tier: "Tier-2-Protected",
      reason: pathCheck.reason || "Path escapes repository root.",
    };
  }

  const immutableCheck = isProtectedImmutableFile(targetPath);
  if (immutableCheck.protected) {
    return {
      safe: false,
      requestedPath: pathCheck.requestedRelPath || targetPath,
      canonicalPath: immutableCheck.canonicalRelPath || pathCheck.normalizedRelPath,
      symlinkFollowed: Boolean(immutableCheck.symlinkFollowed || pathCheck.symlinkFollowed),
      tier: "Tier-2-Protected",
      reason:
        immutableCheck.matchedRule ||
        `Target '${pathCheck.normalizedRelPath}' is inside the immutable Tier-2-Protected boundary.`,
    };
  }

  return {
    safe: true,
    requestedPath: pathCheck.requestedRelPath || targetPath,
    canonicalPath: pathCheck.normalizedRelPath,
    symlinkFollowed: Boolean(pathCheck.symlinkFollowed),
    tier: "Tier-1-Refactor",
    reason: `Canonical path '${pathCheck.normalizedRelPath}' resolved inside repository root and cleared Tier-2-Protected blocklist.`,
  };
}

/**
 * Verifies workspace ownership (`req.user.uid === workspace.ownerUid`).
 */
export function verifyWorkspaceOwnership(
  callerUid: string | undefined | null,
  workspaceOwnerUid: string = DEFAULT_WORKSPACE_OWNER_UID
): { authorized: boolean; callerUid: string; workspaceOwnerUid: string; reason: string } {
  const normalizedCaller = String(callerUid || "").trim();
  const normalizedOwner = String(workspaceOwnerUid || DEFAULT_WORKSPACE_OWNER_UID).trim();

  if (!normalizedCaller) {
    return {
      authorized: false,
      callerUid: "(missing)",
      workspaceOwnerUid: normalizedOwner,
      reason: "Missing caller UID for workspace write/sync verification.",
    };
  }

  if (normalizedCaller !== normalizedOwner) {
    return {
      authorized: false,
      callerUid: normalizedCaller,
      workspaceOwnerUid: normalizedOwner,
      reason: `Workspace ownership mismatch: caller UID '${normalizedCaller}' !== workspace ownerUid '${normalizedOwner}'.`,
    };
  }

  return {
    authorized: true,
    callerUid: normalizedCaller,
    workspaceOwnerUid: normalizedOwner,
    reason: `Workspace ownership verified for '${normalizedOwner}'.`,
  };
}

/**
 * Grants or revokes explicit UID-bound write approval for a specific proposal and target path.
 * Never grants approval if the canonical target is `Tier-2-Protected`.
 */
export function setWriteApproval(params: {
  proposalId: string;
  targetPath: string;
  ownerUid: string;
  approved: boolean;
  workspaceOwnerUid?: string;
}): WriteGateEvaluationResult {
  const ownership = verifyWorkspaceOwnership(
    params.ownerUid,
    params.workspaceOwnerUid || DEFAULT_WORKSPACE_OWNER_UID
  );
  const classification = classifyTargetProtectionTier(params.targetPath);

  if (!ownership.authorized) {
    return {
      allowed: false,
      requestedTargetPath: classification.requestedPath,
      canonicalTargetPath: classification.canonicalPath,
      symlinkFollowed: classification.symlinkFollowed,
      tier: classification.tier,
      ownerUidVerified: false,
      reason: ownership.reason,
    };
  }

  if (classification.tier === "Tier-2-Protected" || !classification.safe) {
    return {
      allowed: false,
      requestedTargetPath: classification.requestedPath,
      canonicalTargetPath: classification.canonicalPath,
      symlinkFollowed: classification.symlinkFollowed,
      tier: "Tier-2-Protected",
      ownerUidVerified: true,
      reason: `WriteGate hard-blocked: ${classification.reason}`,
    };
  }

  const key = `${params.proposalId}::${classification.canonicalPath}`;
  writeApprovalRegistry.set(key, {
    proposalId: params.proposalId,
    requestedTargetPath: classification.requestedPath,
    canonicalTargetPath: classification.canonicalPath,
    ownerUid: params.ownerUid,
    approved: Boolean(params.approved),
    updatedAt: Date.now(),
    tier: classification.tier,
  });

  return {
    allowed: Boolean(params.approved),
    requestedTargetPath: classification.requestedPath,
    canonicalTargetPath: classification.canonicalPath,
    symlinkFollowed: classification.symlinkFollowed,
    tier: classification.tier,
    ownerUidVerified: true,
    reason: params.approved
      ? `WriteGate approved for '${classification.canonicalPath}' by ownerUid '${params.ownerUid}'.`
      : `WriteGate approval revoked for '${classification.canonicalPath}' by ownerUid '${params.ownerUid}'.`,
  };
}

/**
 * Checks whether an autonomous refactoring or bridge mutation is permitted to write to `targetPath`.
 */
export function checkWriteApproval(
  targetPath: string,
  ownerUid: string,
  proposalId?: string
): WriteGateEvaluationResult {
  const ownership = verifyWorkspaceOwnership(ownerUid, DEFAULT_WORKSPACE_OWNER_UID);
  const classification = classifyTargetProtectionTier(targetPath);

  if (!ownership.authorized) {
    return {
      allowed: false,
      requestedTargetPath: classification.requestedPath,
      canonicalTargetPath: classification.canonicalPath,
      symlinkFollowed: classification.symlinkFollowed,
      tier: classification.tier,
      ownerUidVerified: false,
      reason: ownership.reason,
    };
  }

  if (classification.tier === "Tier-2-Protected" || !classification.safe) {
    return {
      allowed: false,
      requestedTargetPath: classification.requestedPath,
      canonicalTargetPath: classification.canonicalPath,
      symlinkFollowed: classification.symlinkFollowed,
      tier: "Tier-2-Protected",
      ownerUidVerified: true,
      reason: classification.reason,
    };
  }

  if (proposalId) {
    const key = `${proposalId}::${classification.canonicalPath}`;
    const record = writeApprovalRegistry.get(key);
    if (!record || !record.approved || record.ownerUid !== ownerUid) {
      return {
        allowed: false,
        requestedTargetPath: classification.requestedPath,
        canonicalTargetPath: classification.canonicalPath,
        symlinkFollowed: classification.symlinkFollowed,
        tier: classification.tier,
        ownerUidVerified: true,
        reason: `Awaiting explicit UID write approval for proposal '${proposalId}' on '${classification.canonicalPath}'.`,
      };
    }
    return {
      allowed: true,
      requestedTargetPath: classification.requestedPath,
      canonicalTargetPath: classification.canonicalPath,
      symlinkFollowed: classification.symlinkFollowed,
      tier: classification.tier,
      ownerUidVerified: true,
      reason: `UID write approval verified for '${classification.canonicalPath}' (ownerUid: ${ownerUid}).`,
    };
  }

  // Fallback lookup by canonical path if proposalId omitted
  for (const record of writeApprovalRegistry.values()) {
    if (
      record.canonicalTargetPath === classification.canonicalPath &&
      record.ownerUid === ownerUid &&
      record.approved
    ) {
      return {
        allowed: true,
        requestedTargetPath: classification.requestedPath,
        canonicalTargetPath: classification.canonicalPath,
        symlinkFollowed: classification.symlinkFollowed,
        tier: classification.tier,
        ownerUidVerified: true,
        reason: `UID write approval verified for '${classification.canonicalPath}' (proposal: ${record.proposalId}).`,
      };
    }
  }

  return {
    allowed: false,
    requestedTargetPath: classification.requestedPath,
    canonicalTargetPath: classification.canonicalPath,
    symlinkFollowed: classification.symlinkFollowed,
    tier: classification.tier,
    ownerUidVerified: true,
    reason: `No active UID write approval found for '${classification.canonicalPath}'.`,
  };
}

export function listWriteApprovalRecords(): WriteApprovalRecord[] {
  return Array.from(writeApprovalRegistry.values());
}
