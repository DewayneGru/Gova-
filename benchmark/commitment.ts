import crypto from "node:crypto";

export const sha256Hex = (input: string): string =>
  crypto.createHash("sha256").update(input, "utf8").digest("hex");

/** Preimage = "<salt>:<id>:<type>:<change>". The random per-case salt stops anyone confirming a guessed case. */
export const casePreimage = (c: { salt: string; id: string; type: string; change: string }): string =>
  `${c.salt}:${c.id}:${c.type}:${c.change}`;

/**
 * Merkle root over the case hashes, in the order listed in the manifest.
 * leaf = raw 32-byte SHA-256 digest of the preimage; parent = SHA-256(left || right);
 * if a level has an odd count, the last node is duplicated.
 */
export function merkleRoot(leafHexes: string[]): string {
  if (leafHexes.length === 0) throw new Error("no leaves");
  let level = leafHexes.map((h) => Buffer.from(h, "hex"));
  while (level.length > 1) {
    if (level.length % 2 === 1) level.push(level[level.length - 1]);
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(crypto.createHash("sha256").update(Buffer.concat([level[i], level[i + 1]])).digest());
    }
    level = next;
  }
  return level[0].toString("hex");
}
