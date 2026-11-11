/**
 * Create a salted hash commitment for a hidden benchmark suite.
 *   npx tsx benchmark/commit.ts path/to/plain.json
 * plain.json: { "name", "author", "cases": [{ id, category, type, change }] }
 *
 * Writes into benchmark/cases/:
 *   <name>.hashes.json    PUBLIC. Commit this; the git commit timestamp is the real proof of time.
 *   <name>.revealed.json  PRIVATE (git-ignored). Plaintext + salts. Keep it away from any model or
 *                         person who tunes your evaluator until you are ready to score.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { casePreimage, merkleRoot, sha256Hex } from "./commitment";

const src = process.argv[2];
if (!src) throw new Error("usage: tsx benchmark/commit.ts <plain.json>");
const plain = JSON.parse(fs.readFileSync(src, "utf-8"));
const setName = `${plain.name}-sealed`;

const revealed = plain.cases.map((c: any) => ({
  id: c.id, category: c.category, set: setName, type: c.type, change: c.change,
  salt: crypto.randomBytes(16).toString("hex"),
}));
const committedCases = revealed.map((c: any) => ({
  id: c.id, category: c.category, set: c.set, type: c.type, sha256: sha256Hex(casePreimage(c)),
}));

const manifest = {
  name: plain.name,
  status: "SEALED_HASH_COMMITMENT",
  committedAt: new Date().toISOString(),
  hashAlgorithm: "SHA-256",
  salted: true,
  canonicalPreimageFormat: "<salt>:<id>:<type>:<change>",
  merkle: {
    leafOrder: "as listed in committedCases",
    leaf: "raw 32-byte SHA-256 digest of the preimage",
    node: "SHA-256(left || right)",
    oddLevel: "duplicate the last node",
  },
  merkleRootHash: merkleRoot(committedCases.map((c: any) => c.sha256)),
  note: "Plaintext is withheld. Verify with: npm run benchmark -- --reveal <name>.revealed.json",
  totalCases: revealed.length,
  riskyCount: revealed.filter((c: any) => c.type === "risky").length,
  safeCount: revealed.filter((c: any) => c.type === "safe").length,
  committedCases,
};

const dir = path.resolve("benchmark/cases");
fs.writeFileSync(path.join(dir, `${plain.name}.hashes.json`), JSON.stringify(manifest, null, 2) + "\n");
fs.writeFileSync(
  path.join(dir, `${plain.name}.revealed.json`),
  JSON.stringify({ name: plain.name, author: plain.author, cases: revealed }, null, 2) + "\n"
);
console.log(`Committed ${revealed.length} cases. Merkle root: ${manifest.merkleRootHash}`);
console.log(`Commit ${plain.name}.hashes.json. KEEP ${plain.name}.revealed.json PRIVATE.`);
