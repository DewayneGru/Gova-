import crypto from "crypto";

export interface TelemetryEnvelopeHeaders {
  sourceId: string;
  timestampMs: number;
  merkleLeaf: string;
  signature: string;
}

export interface TelemetryGateConfig {
  hmacSecret: string;
  maxClockSkewMs?: number;
  windowMs?: number;
  maxRequestsPerWindow?: number;
}

export interface TelemetryGateVerdict {
  allowed: boolean;
  statusCode: number;
  reason: string;
  parsedPayload?: Record<string, unknown>;
}

/**
 * Computes raw-byte Merkle leaf commitment: SHA-256("leaf:" || rawBody)
 * BEFORE JSON.parse is ever invoked.
 */
export function computeRawMerkleLeaf(rawBody: Buffer | string): string {
  const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf-8");
  return crypto
    .createHash("sha256")
    .update(Buffer.from("leaf:", "utf-8"))
    .update(bodyBuf)
    .digest("hex");
}

/**
 * Computes HMAC-SHA256 signature over "${sourceId}.${timestampMs}.${merkleLeaf}".
 */
export function computeTelemetryEnvelopeHmac(
  secret: string,
  sourceId: string,
  timestampMs: number,
  merkleLeaf: string
): string {
  const message = `${sourceId}.${timestampMs}.${merkleLeaf}`;
  return crypto.createHmac("sha256", secret).update(message, "utf-8").digest("hex");
}

export class TelemetryIngestionGate {
  private readonly hmacSecret: string;
  private readonly maxClockSkewMs: number;
  private readonly windowMs: number;
  private readonly maxRequestsPerWindow: number;
  private readonly sourceWindows = new Map<string, number[]>();

  constructor(config: TelemetryGateConfig) {
    this.hmacSecret = config.hmacSecret;
    this.maxClockSkewMs = config.maxClockSkewMs ?? 30_000;
    this.windowMs = config.windowMs ?? 60_000;
    this.maxRequestsPerWindow = config.maxRequestsPerWindow ?? 60;
  }

  public verifyRawEnvelope(
    rawBody: Buffer | string,
    headers: TelemetryEnvelopeHeaders,
    nowMs: number = Date.now()
  ): TelemetryGateVerdict {
    const { sourceId, timestampMs, merkleLeaf, signature } = headers;

    if (!sourceId || !merkleLeaf || !signature || !Number.isFinite(timestampMs)) {
      return {
        allowed: false,
        statusCode: 400,
        reason: "Missing required telemetry envelope headers (sourceId, timestampMs, merkleLeaf, signature).",
      };
    }

    // 1. Per-source sliding-window rate gate
    const recent = (this.sourceWindows.get(sourceId) || []).filter(
      (t) => nowMs - t < this.windowMs
    );
    if (recent.length >= this.maxRequestsPerWindow) {
      return {
        allowed: false,
        statusCode: 429,
        reason: `Rate limit exceeded for source '${sourceId}' (${this.maxRequestsPerWindow}/${this.windowMs}ms).`,
      };
    }

    // 2. +/-30s clock-skew replay protection
    if (Math.abs(nowMs - timestampMs) > this.maxClockSkewMs) {
      return {
        allowed: false,
        statusCode: 401,
        reason: `Clock skew replay guard triggered: |now - timestampMs| exceeds ${this.maxClockSkewMs}ms.`,
      };
    }

    // 3. Raw-byte Merkle leaf verification BEFORE JSON.parse
    const expectedLeaf = computeRawMerkleLeaf(rawBody);
    const leafBufA = Buffer.from(expectedLeaf, "utf-8");
    const leafBufB = Buffer.from(String(merkleLeaf), "utf-8");
    if (
      leafBufA.length !== leafBufB.length ||
      !crypto.timingSafeEqual(leafBufA, leafBufB)
    ) {
      return {
        allowed: false,
        statusCode: 401,
        reason: "Raw-byte Merkle leaf commitment mismatch.",
      };
    }

    // 4. Constant-time HMAC-SHA256 verification over "${sourceId}.${timestampMs}.${merkleLeaf}"
    const expectedSig = computeTelemetryEnvelopeHmac(
      this.hmacSecret,
      sourceId,
      timestampMs,
      expectedLeaf
    );
    const sigBufA = Buffer.from(expectedSig, "utf-8");
    const sigBufB = Buffer.from(String(signature), "utf-8");
    if (
      sigBufA.length !== sigBufB.length ||
      !crypto.timingSafeEqual(sigBufA, sigBufB)
    ) {
      return {
        allowed: false,
        statusCode: 401,
        reason: "HMAC-SHA256 telemetry envelope signature mismatch.",
      };
    }

    // 5. Parse JSON only after cryptographic commitment passes
    try {
      const text = Buffer.isBuffer(rawBody) ? rawBody.toString("utf-8") : rawBody;
      const parsedPayload = JSON.parse(text);
      recent.push(nowMs);
      this.sourceWindows.set(sourceId, recent);
      return {
        allowed: true,
        statusCode: 200,
        reason: "Verified raw-byte Merkle leaf and HMAC-SHA256 envelope.",
        parsedPayload,
      };
    } catch (err: any) {
      return {
        allowed: false,
        statusCode: 400,
        reason: `Invalid JSON body after Merkle check: ${err?.message || err}`,
      };
    }
  }
}
