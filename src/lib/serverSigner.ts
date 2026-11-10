import { createHmac } from "node:crypto";
import type { LogSigner } from "./substrate";

/**
 * Server-only. Real HMAC-SHA256 signer for ActionLog-style ledgers.
 * The key MUST come from the environment (e.g. ACTIONLOG_HMAC_KEY), never from source.
 * Do not import this file from browser code.
 */
export function createHmacSigner(key: string | undefined = process.env.ACTIONLOG_HMAC_KEY): LogSigner {
  if (!key || key.length < 32) {
    throw new Error("ACTIONLOG_HMAC_KEY must be set to a random value of at least 32 characters");
  }
  return (blockHash) => createHmac("sha256", key).update(blockHash).digest("hex");
}
