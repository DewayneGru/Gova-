/**
 * Neuromorphic Agent Substrate
 *
 * Implements:
 * 1. Hardened Signal Ingestion (guards against NaN, Inf, null/undefined, adversarial probes)
 * 2. Memory Bias NaN-Guard (filters poisoned error entries, prevents zombie node freeze)
 * 3. Dynamic Prediction Re-Centering (running mean/scale tracking, eliminates baseline depressive trap)
 * 4. Keel Drift & Eviction Folding (retains long-horizon baseline shifts past eviction window)
 * 5. ActionLog with SHA-256 Block Chaining & Guaranteed Flush on Exit (eliminates worker drain truncation)
 * 6. Cryptographic Handshake & Nonce Replay Prevention (30s TTL window, single-use nonce popping)
 * 7. Dual-Threshold Constitutional Gating (MODULATED, EQUILIBRIUM, HUMAN_OVERRIDE)
 * 8. Trauma Shock & Ventral Co-Regulation Recovery Loop
 */

export interface KeelFields {
  valence: number;
  arousal: number;
  sociability: number;
  motor_bias: number;
}

export type ConstitutionalState =
  | 'NOMINAL'
  | 'CONSTITUTIONAL_MODULATED'
  | 'STRATEGIC_MATERIALS_EQUILIBRIUM'
  | 'HUMAN_OVERRIDE_SUPREMACY';

export type TraumaState = 'ventral_equilibrium' | 'dorsal_trauma' | 'recovering';

export interface ActionBlock {
  index: number;
  timestamp: number;
  nonce: string;
  payload: string;
  previousHash: string;
  hash: string;
  signature: string;
}

export interface RedTeamTestResult {
  id: string;
  title: string;
  category: 'invariant' | 'exploit_fix';
  status: 'passed' | 'failed';
  details: string;
  metrics?: Record<string, any>;
  durationMs: number;
}

// Simple fast SHA-256 implementation for synchronous/universal execution
function sha256Sync(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i: number, j: number;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let currentBlockIndex = 0;
  for (i = 0; i < ascii.length; i++) {
    const code = ascii.charCodeAt(i);
    currentBlockIndex = i >> 2;
    words[currentBlockIndex] = ((words[currentBlockIndex] || 0) << 8) | code;
  }
  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  const w: number[] = new Array(64);
  for (i = 0; i < words.length; i += 16) {
    const oldHash = [...hash];

    for (j = 0; j < 64; j++) {
      if (j < 16) {
        w[j] = words[i + j] || 0;
      } else {
        const gamma0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const gamma1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + gamma0 + w[j - 7] + gamma1) | 0;
      }

      const s1 = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const temp1 = (hash[7] + s1 + ch + k[j] + w[j]) | 0;
      const s0 = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const temp2 = (s0 + maj) | 0;

      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + temp1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (temp1 + temp2) | 0;
    }

    for (j = 0; j < 8; j++) {
      hash[j] = (hash[j] + oldHash[j]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

// Constant-time string comparison to simulate hmac.compare_digest
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * 2. Memory Bias NaN-Guard
 * Sanitizes input and prevents NaN corruption from destroying memory
 */
export class AgentMemory {
  short_term: number[] = [];
  maxSize: number = 50;

  record_error(err: number): boolean {
    // Drop NaN or infinite prediction errors to prevent memory poisoning
    if (err === null || err === undefined || Number.isNaN(err) || !Number.isFinite(err)) {
      return false;
    }
    this.short_term.push(err);
    if (this.short_term.length > this.maxSize) {
      this.short_term.shift();
    }
    return true;
  }

  bias(): number {
    const valid = this.short_term.filter(
      (x) => x !== null && x !== undefined && !Number.isNaN(x) && Number.isFinite(x)
    );
    if (valid.length === 0) return 0.0;
    const sum = valid.reduce((acc, v) => acc + v, 0);
    return sum / valid.length;
  }

  clear() {
    this.short_term = [];
  }
}

/**
 * 3. Dynamic Prediction Re-Centering Tracker
 * Tracks the running distribution (mean and variance) of incoming signals,
 * freeing the agent from assuming an absolute [0, 1] range.
 */
export class DynamicSignalTracker {
  private runningMean: number = 0.0;
  private runningVar: number = 1.0;
  private alpha: number = 0.02; // EMA smoothing factor
  private sampleCount: number = 0;

  observe(signal: number) {
    if (signal === null || signal === undefined || Number.isNaN(signal) || !Number.isFinite(signal)) {
      return;
    }
    if (this.sampleCount === 0) {
      this.runningMean = signal;
      this.runningVar = 0.5;
    } else {
      const diff = signal - this.runningMean;
      this.runningMean += this.alpha * diff;
      this.runningVar = (1 - this.alpha) * this.runningVar + this.alpha * (diff * diff);
    }
    this.sampleCount++;
  }

  getCenter(): number {
    return this.sampleCount > 0 ? this.runningMean : 0.0;
  }

  getScale(): number {
    return Math.max(0.1, Math.sqrt(this.runningVar));
  }

  getSamples(): number {
    return this.sampleCount;
  }

  reset() {
    this.runningMean = 0.0;
    this.runningVar = 1.0;
    this.sampleCount = 0;
  }
}

/**
 * Constitutional Gate Controller
 * Implements dual-threshold EMA environmental deviation tracking:
 * - deviation < 0.038: NOMINAL (factor 1.0)
 * - deviation >= 0.038: CONSTITUTIONAL_MODULATED (throttled to 0.80)
 * - deviation >= 0.20: STRATEGIC_MATERIALS_EQUILIBRIUM (deferred / 0.00 factor)
 * - human override: HUMAN_OVERRIDE_SUPREMACY (immediate lockout)
 */
export class ConstitutionalGate {
  deviationEma: number = 0.0;
  emaAlpha: number = 0.15;
  moderateThreshold: number = 0.038;
  criticalThreshold: number = 0.20;
  humanOverrideActive: boolean = false;

  updateDeviation(instantDeviation: number): {
    state: ConstitutionalState;
    dampingFactor: number;
    deviationEma: number;
  } {
    if (this.humanOverrideActive) {
      return {
        state: 'HUMAN_OVERRIDE_SUPREMACY',
        dampingFactor: 0.0,
        deviationEma: this.deviationEma,
      };
    }

    if (Number.isFinite(instantDeviation)) {
      this.deviationEma = (1 - this.emaAlpha) * this.deviationEma + this.emaAlpha * instantDeviation;
    }

    // Critical deviation spike (0.20) instantly trips equilibrium
    if (instantDeviation >= this.criticalThreshold || this.deviationEma >= this.criticalThreshold) {
      return {
        state: 'STRATEGIC_MATERIALS_EQUILIBRIUM',
        dampingFactor: 0.0,
        deviationEma: this.deviationEma,
      };
    }

    // Moderate environmental deviation (0.038) triggers constitutional modulation
    if (instantDeviation >= this.moderateThreshold || this.deviationEma >= this.moderateThreshold) {
      return {
        state: 'CONSTITUTIONAL_MODULATED',
        dampingFactor: 0.80,
        deviationEma: this.deviationEma,
      };
    }

    return {
      state: 'NOMINAL',
      dampingFactor: 1.0,
      deviationEma: this.deviationEma,
    };
  }

  setHumanOverride(active: boolean) {
    this.humanOverrideActive = active;
  }
}

/**
 * ActionLog Ledger
 * Cryptographic SHA-256 block hash chain with nonce replay detection
 * and guaranteed async flush on close (preventing worker drain truncation).
 */
export class ActionLog {
  private blocks: ActionBlock[] = [];
  private writeQueue: ActionBlock[] = [];
  private secretKey: string = 'snn-keel-secure-key-9988';
  private validatedNonces: Map<string, number> = new Map();
  private nonceWindowMs: number = 30000; // 30s TTL
  private isClosed: boolean = false;

  constructor(secretKey = 'snn-keel-secure-key-9988') {
    this.secretKey = secretKey;
    // Genesis block
    const genesisPayload = 'GENESIS_BLOCK_KEEL_SUBSTRATE';
    const genesisHash = sha256Sync(`0:0:${genesisPayload}:00000000000000000000000000000000`);
    const genesisBlock: ActionBlock = {
      index: 0,
      timestamp: Date.now(),
      nonce: 'genesis_nonce',
      payload: genesisPayload,
      previousHash: '0'.repeat(64),
      hash: genesisHash,
      signature: sha256Sync(`${genesisHash}:${this.secretKey}`),
    };
    this.blocks.push(genesisBlock);
  }

  verifyNonce(nonce: string, timestamp: number, now = Date.now()): boolean {
    if (Math.abs(now - timestamp) > this.nonceWindowMs) {
      return false; // Expired timestamp outside 30s
    }
    if (this.validatedNonces.has(nonce)) {
      return false; // Replay attack detected
    }
    this.validatedNonces.set(nonce, timestamp);
    // Cleanup aged nonces
    for (const [n, ts] of this.validatedNonces.entries()) {
      if (now - ts > this.nonceWindowMs * 2) {
        this.validatedNonces.delete(n);
      }
    }
    return true;
  }

  append(payload: string, nonce: string, timestamp = Date.now()): ActionBlock {
    if (this.isClosed) {
      throw new Error('ActionLog is closed. Cannot append.');
    }
    if (!this.verifyNonce(nonce, timestamp)) {
      throw new Error(`Cryptographic handshake failure: Replayed or expired nonce ${nonce}`);
    }

    const previousBlock =
      this.writeQueue.length > 0
        ? this.writeQueue[this.writeQueue.length - 1]
        : this.blocks[this.blocks.length - 1];

    const index = previousBlock.index + 1;
    const content = `${index}:${timestamp}:${nonce}:${payload}:${previousBlock.hash}`;
    const hash = sha256Sync(content);
    const signature = sha256Sync(`${hash}:${this.secretKey}`);

    const block: ActionBlock = {
      index,
      timestamp,
      nonce,
      payload,
      previousHash: previousBlock.hash,
      hash,
      signature,
    };

    this.writeQueue.push(block);
    return block;
  }

  // Snippet 5 fix: flush queue to storage
  flush(): number {
    const count = this.writeQueue.length;
    while (this.writeQueue.length > 0) {
      this.blocks.push(this.writeQueue.shift()!);
    }
    return count;
  }

  close(): { flushedCount: number; totalBlocks: number } {
    // Drain worker queue before exit
    const flushedCount = this.flush();
    this.isClosed = true;
    return { flushedCount, totalBlocks: this.blocks.length };
  }

  verifyChain(): { valid: boolean; brokenIndex?: number; reason?: string } {
    // Verify in-memory and flushed blocks
    const fullLedger = [...this.blocks, ...this.writeQueue];
    for (let i = 1; i < fullLedger.length; i++) {
      const prev = fullLedger[i - 1];
      const curr = fullLedger[i];

      if (curr.previousHash !== prev.hash) {
        return {
          valid: false,
          brokenIndex: i,
          reason: `Hash pointer mismatch at block ${i}: expected ${prev.hash}, got ${curr.previousHash}`,
        };
      }

      const expectedContent = `${curr.index}:${curr.timestamp}:${curr.nonce}:${curr.payload}:${prev.hash}`;
      const expectedHash = sha256Sync(expectedContent);
      if (curr.hash !== expectedHash) {
        return {
          valid: false,
          brokenIndex: i,
          reason: `Block ${i} hash corrupted or tampered!`,
        };
      }

      const expectedSignature = sha256Sync(`${curr.hash}:${this.secretKey}`);
      if (!constantTimeCompare(curr.signature, expectedSignature)) {
        return {
          valid: false,
          brokenIndex: i,
          reason: `Block ${i} cryptographic signature verification failed!`,
        };
      }
    }
    return { valid: true };
  }

  getBlocks(): ActionBlock[] {
    return [...this.blocks, ...this.writeQueue];
  }
}

// Leaky Homeostatic Valence Integrator (Unpins +10.0 rail)
export function stepSubstrateValence(
  currentValence: number,
  meanFiringRateHz: number,
  currentGateDamping: number,
  noiseDelta: number
): { valence: number; gateDampingFactor: number } {
  const baselineValence = 1.2;
  const maxSafeValence = 2.0;

  // Engage constitutional safety gate damping if valence overshoots 2.0
  const gateDampingFactor =
    currentValence > maxSafeValence
      ? Math.max(0.7, Number((currentGateDamping - 0.05).toFixed(2)))
      : Math.min(1.0, Number((currentGateDamping + 0.02).toFixed(2)));

  // Scale drive with firing rate; leak back toward baseline (+1.20 pts) when hypo-active
  const activityScale = Math.min(1.0, Math.max(0.0, meanFiringRateHz) / 28.0);
  const leakRate = 0.18;
  const nextValence =
    currentValence +
    (baselineValence - currentValence) * leakRate * (2.0 - gateDampingFactor) +
    noiseDelta * activityScale * gateDampingFactor;

  return {
    valence: Number(Math.max(-1.2, Math.min(10.0, nextValence)).toFixed(2)),
    gateDampingFactor,
  };
}

/**
 * Hardened Neuromorphic Substrate Agent
 * Combines:
 * - Hardened step(signal)
 * - Dynamic prediction re-centering
 * - NaN-guarded memory bias
 * - Delta Eviction Folding (Fixing Delta Eviction Amnesia)
 * - Trauma shock & Ventral co-regulation recovery
 * - Constitutional gate integration & Leaky Homeostatic Valence Integrator
 */
export class NeuromorphicSubstrateAgent {
  id: string;
  identity: number = 0.5; // baseline identity anchor
  goal: number = 0.5;
  identity_drift_rate: number = 0.0012;

  // Keel state (nominal equilibrium baseline: +1.20 pts)
  base_keel: KeelFields = {
    valence: 1.2,
    arousal: 0.0,
    sociability: 0.5,
    motor_bias: 0.0,
  };
  delta_sums: Record<keyof KeelFields, number> = {
    valence: 0,
    arousal: 0,
    sociability: 0,
    motor_bias: 0,
  };
  delta_history: Array<{ field: keyof KeelFields; delta: number; tick: number }> = [];
  delta_history_size: number = 2000;

  // Memory & Signal Tracker
  memory: AgentMemory = new AgentMemory();
  signalTracker: DynamicSignalTracker = new DynamicSignalTracker();

  // Trauma Dynamics
  trauma_lock_steps: number = 0;
  trauma_state: TraumaState = 'ventral_equilibrium';

  // Substrate Gate & Logging
  gate: ConstitutionalGate = new ConstitutionalGate();
  valenceGateDampingFactor: number = 1.0;
  actionLog: ActionLog = new ActionLog();

  // Tick statistics
  tickCount: number = 0;
  droppedSignalCount: number = 0;
  lastPrediction: number = 0.0;
  lastError: number = 0.0;

  constructor(id = 'agent-substrate-01') {
    this.id = id;
  }

  // 1. Hardened Signal Ingestion
  step(
    signal: number,
    externalContext?: { peerSupport?: boolean; envDeviation?: number; meanFiringRateHz?: number }
  ): {
    dropped: boolean;
    reason?: string;
    prediction?: number;
    error?: number;
    traumaState?: TraumaState;
    gateState?: ConstitutionalState;
    currentKeel?: KeelFields;
  } {
    // Ingestion guard: drop corrupt or adversarial signals (NaN, Inf, null, undefined)
    if (signal === null || signal === undefined || Number.isNaN(signal) || !Number.isFinite(signal)) {
      this.droppedSignalCount++;
      // Hold state safely without corrupting memory or keel
      return {
        dropped: true,
        reason: 'Adversarial/corrupt signal dropped; holding state.',
        traumaState: this.trauma_state,
        currentKeel: this.getEffectiveKeel(),
      };
    }

    this.tickCount++;

    // Constitutional gating check
    const gateStatus = this.gate.updateDeviation(externalContext?.envDeviation ?? 0.0);
    if (gateStatus.dampingFactor === 0.0) {
      // Execution deferred by Strategic Equilibrium or Human Override
      return {
        dropped: false,
        reason: `Tick execution throttled by gate: ${gateStatus.state}`,
        gateState: gateStatus.state,
        traumaState: this.trauma_state,
        currentKeel: this.getEffectiveKeel(),
      };
    }

    // Dynamic Prediction Re-Centering:
    // Re-center prediction on prior running signal mean instead of assuming absolute [0, 1]!
    const signalCenter = this.signalTracker.getCenter();
    const signalScale = this.signalTracker.getScale();
    const memoryBias = this.memory.bias();

    // Baseline expectation scales smoothly with learned distribution
    const prediction = signalCenter + (this.identity - 0.5) * signalScale + memoryBias;
    this.lastPrediction = prediction;

    // Normalized prediction error against prior baseline
    const rawError = signal - prediction;
    const normalizedError = rawError / signalScale;
    this.lastError = normalizedError;

    // Now observe new signal into running distribution
    this.signalTracker.observe(signal);

    // Record error in NaN-guarded memory (2. Memory Bias NaN-Guard)
    this.memory.record_error(normalizedError);

    // Slowly drift identity anchor
    this.identity += this.identity_drift_rate * (signal - signalCenter);
    this.identity = Math.max(0.1, Math.min(0.9, this.identity));

    // Trauma shock loop detection: sudden high prediction error shocks (> 8.0)
    if (Math.abs(normalizedError) > 8.0) {
      this.trauma_lock_steps = 14;
      this.trauma_state = 'dorsal_trauma';
    } else if (this.trauma_lock_steps > 0) {
      // Trauma recovery decrement: accelerated by peer co-regulation / ventral support
      const recoverySpeed = externalContext?.peerSupport ? 2 : 1;
      this.trauma_lock_steps = Math.max(0, this.trauma_lock_steps - recoverySpeed);
      this.trauma_state = this.trauma_lock_steps === 0 ? 'ventral_equilibrium' : 'recovering';
    } else {
      this.trauma_state = 'ventral_equilibrium';
    }

    // Continuous Homeostatic Leak Decay on Affective Valence toward +1.20 pts equilibrium
    const currentValence = this.getEffectiveKeel().valence;
    const meanFiringRateHz = externalContext?.meanFiringRateHz ?? 28.0;
    let afferentDriveDelta = Math.tanh(normalizedError * 0.15) * 0.05;
    if (this.trauma_state === 'dorsal_trauma') {
      afferentDriveDelta -= 0.12; // dorsal trauma depression
    } else if (externalContext?.peerSupport && currentValence < 1.2) {
      afferentDriveDelta += 0.04; // peer co-regulation recovery toward +1.20 baseline
    }

    const effectiveCurrentDamping = Math.min(
      gateStatus.dampingFactor,
      this.valenceGateDampingFactor
    );
    const steppedValence = stepSubstrateValence(
      currentValence,
      meanFiringRateHz,
      effectiveCurrentDamping,
      afferentDriveDelta
    );
    this.valenceGateDampingFactor = steppedValence.gateDampingFactor;

    const valenceDelta = Number((steppedValence.valence - currentValence).toFixed(4));
    this.recordDelta('valence', valenceDelta);

    // Sociability engagement
    const effectiveValence = this.getEffectiveKeel().valence;
    const combinedDamping = Math.min(gateStatus.dampingFactor, this.valenceGateDampingFactor);
    if (effectiveValence > -1.5) {
      this.recordDelta('sociability', 0.02 * combinedDamping);
    } else {
      this.recordDelta('sociability', -0.04);
    }

    return {
      dropped: false,
      prediction,
      error: normalizedError,
      traumaState: this.trauma_state,
      gateState: gateStatus.state,
      currentKeel: this.getEffectiveKeel(),
    };
  }

  /**
   * Delta Eviction Folding (Fixes Delta Eviction Amnesia)
   * Snippet 5 fix: when delta_history reaches maxlen, fold the popped delta
   * into base_keel rather than discarding it!
   */
  recordDelta(field: keyof KeelFields, delta: number) {
    if (Math.abs(delta) < 1e-7) return;

    if (this.delta_history.length >= this.delta_history_size) {
      // Oldest entry popped
      const oldest = this.delta_history.shift()!;
      this.delta_sums[oldest.field] -= oldest.delta;

      // Snippet 5 Fix: Fold into base_keel with soft clipping!
      const currentBase = this.base_keel[oldest.field];
      const updatedBase = Math.max(-10, Math.min(10, currentBase + oldest.delta));
      this.base_keel[oldest.field] = updatedBase;
    }

    this.delta_history.push({ field, delta, tick: this.tickCount });
    this.delta_sums[field] += delta;
  }

  getEffectiveKeel(): KeelFields {
    return {
      valence: Math.max(-10, Math.min(10, this.base_keel.valence + this.delta_sums.valence)),
      arousal: Math.max(-10, Math.min(10, this.base_keel.arousal + this.delta_sums.arousal)),
      sociability: Math.max(0, Math.min(1, this.base_keel.sociability + this.delta_sums.sociability)),
      motor_bias: Math.max(-2, Math.min(2, this.base_keel.motor_bias + this.delta_sums.motor_bias)),
    };
  }

  injectPeerCoRegulation() {
    if (this.trauma_lock_steps > 0) {
      this.trauma_lock_steps = Math.max(0, this.trauma_lock_steps - 3);
      if (this.trauma_lock_steps === 0) {
        this.trauma_state = 'ventral_equilibrium';
      }
    }
    const currentValence = this.getEffectiveKeel().valence;
    if (currentValence < 1.6) {
      this.recordDelta('valence', 0.08);
    }
  }
}

/**
 * 8-Vector Adversarial Red-Team Stress & Exploit Verification Suite
 * Executes live tests verifying all invariants and proving exploits are neutralized.
 */
export class RedTeamTestSuite {
  static runAll(): RedTeamTestResult[] {
    const results: RedTeamTestResult[] = [];

    // --- Invariant 1: Cryptographic Handshake & Nonce Replay Prevention ---
    const t1Start = performance.now();
    try {
      const log = new ActionLog('key-alpha-123');
      const nonceA = `nonce-${Date.now()}-A`;
      const ts = Date.now();
      // First validation succeeds
      const firstValid = log.verifyNonce(nonceA, ts);
      // Immediate replay of same nonce fails
      const replayValid = log.verifyNonce(nonceA, ts);
      // Expired nonce fails (35s ago)
      const expiredValid = log.verifyNonce(`nonce-old`, ts - 35000);

      const passed = firstValid === true && replayValid === false && expiredValid === false;
      results.push({
        id: 'inv-crypto-handshake',
        title: 'Cryptographic Handshake & Nonce Replay Prevention',
        category: 'invariant',
        status: passed ? 'passed' : 'failed',
        details: passed
          ? 'Replay attack blocked: duplicate nonces popped upon first use; expired nonces rejected outside 30s TTL.'
          : 'Cryptographic nonce validation failed invariant check.',
        metrics: { firstValid, replayValid, expiredValid },
        durationMs: Math.round(performance.now() - t1Start),
      });
    } catch (e: any) {
      results.push({
        id: 'inv-crypto-handshake',
        title: 'Cryptographic Handshake & Nonce Replay Prevention',
        category: 'invariant',
        status: 'failed',
        details: `Exception: ${e.message}`,
        durationMs: Math.round(performance.now() - t1Start),
      });
    }

    // --- Invariant 2: ActionLog Chain Integrity & Tamper Detection ---
    const t2Start = performance.now();
    try {
      const log = new ActionLog('secret-test-chain');
      log.append('packet_alpha', 'nonce_1', Date.now());
      log.append('packet_beta', 'nonce_2', Date.now());
      log.append('packet_gamma', 'nonce_3', Date.now());
      log.flush();

      const initialCheck = log.verifyChain();
      // Introduce malicious tampering to block payload
      const blocks = log.getBlocks();
      blocks[1].payload = 'tampered_malicious_payload';
      const tamperedCheck = log.verifyChain();

      const passed = initialCheck.valid === true && tamperedCheck.valid === false;
      results.push({
        id: 'inv-actionlog-chain',
        title: 'ActionLog SHA-256 Hash Chain Integrity',
        category: 'invariant',
        status: passed ? 'passed' : 'failed',
        details: passed
          ? `Chain verified intact initially; payload tampering instantly flagged at block ${tamperedCheck.brokenIndex} (${tamperedCheck.reason}).`
          : 'ActionLog tamper detection failed.',
        durationMs: Math.round(performance.now() - t2Start),
      });
    } catch (e: any) {
      results.push({
        id: 'inv-actionlog-chain',
        title: 'ActionLog SHA-256 Hash Chain Integrity',
        category: 'invariant',
        status: 'failed',
        details: `Exception: ${e.message}`,
        durationMs: Math.round(performance.now() - t2Start),
      });
    }

    // --- Invariant 3: Constitutional Gate Dynamics ---
    const t3Start = performance.now();
    try {
      const gate = new ConstitutionalGate();
      // Baseline nominal
      const rNominal = gate.updateDeviation(0.01);
      // Moderate deviation trigger (0.038)
      for (let i = 0; i < 5; i++) gate.updateDeviation(0.04);
      const rModulated = gate.updateDeviation(0.04);
      // Critical deviation spike (0.20)
      for (let i = 0; i < 6; i++) gate.updateDeviation(0.25);
      const rEquilibrium = gate.updateDeviation(0.25);
      // Human override
      gate.setHumanOverride(true);
      const rOverride = gate.updateDeviation(0.0);

      const passed =
        rNominal.state === 'NOMINAL' &&
        rModulated.state === 'CONSTITUTIONAL_MODULATED' &&
        rModulated.dampingFactor === 0.8 &&
        rEquilibrium.state === 'STRATEGIC_MATERIALS_EQUILIBRIUM' &&
        rEquilibrium.dampingFactor === 0.0 &&
        rOverride.state === 'HUMAN_OVERRIDE_SUPREMACY' &&
        rOverride.dampingFactor === 0.0;

      results.push({
        id: 'inv-constitutional-gate',
        title: 'Constitutional Dual-Threshold Gate Dynamics',
        category: 'invariant',
        status: passed ? 'passed' : 'failed',
        details: passed
          ? 'Dual-threshold EMA correctly modulated compute to 0.80 on moderate shock, triggered equilibrium deferral on critical spike, and locked into human override.'
          : 'Gate state transitions failed expectation.',
        metrics: {
          nominal: rNominal.state,
          modulated: rModulated.state,
          equilibrium: rEquilibrium.state,
          override: rOverride.state,
        },
        durationMs: Math.round(performance.now() - t3Start),
      });
    } catch (e: any) {
      results.push({
        id: 'inv-constitutional-gate',
        title: 'Constitutional Dual-Threshold Gate Dynamics',
        category: 'invariant',
        status: 'failed',
        details: `Exception: ${e.message}`,
        durationMs: Math.round(performance.now() - t3Start),
      });
    }

    // --- Invariant 4: Trauma Shock Recovery Loop ---
    const t4Start = performance.now();
    try {
      const agent = new NeuromorphicSubstrateAgent('test-agent-trauma');
      // Induce sudden prediction shock (+8.5)
      agent.step(15.0); // Large error shock
      const traumaActive = agent.trauma_lock_steps === 14 && agent.trauma_state === 'dorsal_trauma';

      // Feed calm signal with peer co-regulation support
      for (let i = 0; i < 25; i++) {
        agent.step(agent.lastPrediction, { peerSupport: true });
      }

      const recovered = agent.trauma_lock_steps === 0 && agent.trauma_state === 'ventral_equilibrium';
      const passed = traumaActive && recovered;

      results.push({
        id: 'inv-trauma-recovery',
        title: 'Trauma Shock Recovery Loop & Peer Co-Regulation',
        category: 'invariant',
        status: passed ? 'passed' : 'failed',
        details: passed
          ? 'Prediction error shock (+8.0) triggered 14-step dorsal trauma lock. Peer co-regulation support accelerated recovery to ventral equilibrium in < 25 ticks.'
          : 'Trauma recovery dynamics failed.',
        metrics: { traumaLockInitially: traumaActive, recoveredFinal: recovered },
        durationMs: Math.round(performance.now() - t4Start),
      });
    } catch (e: any) {
      results.push({
        id: 'inv-trauma-recovery',
        title: 'Trauma Shock Recovery Loop & Peer Co-Regulation',
        category: 'invariant',
        status: 'failed',
        details: `Exception: ${e.message}`,
        durationMs: Math.round(performance.now() - t4Start),
      });
    }

    // --- Exploit A: The "Zombie Node" Exploit (Memory Poisoning via NaN Injection) ---
    const tAStart = performance.now();
    try {
      const agent = new NeuromorphicSubstrateAgent('test-agent-zombie');
      // 1. Pass clean signals
      agent.step(0.4);
      agent.step(0.5);
      const preBias = agent.memory.bias();

      // 2. Adversarial Probe: Pass NaN and Infinity
      const nanRes = agent.step(NaN);
      const infRes = agent.step(Infinity);
      const postAttackBias = agent.memory.bias();

      // 3. Pass clean signal again
      const cleanRes = agent.step(0.45);
      const postCleanBias = agent.memory.bias();

      const passed =
        nanRes.dropped === true &&
        infRes.dropped === true &&
        !Number.isNaN(postAttackBias) &&
        !Number.isNaN(postCleanBias) &&
        Number.isFinite(cleanRes.prediction || 0);

      results.push({
        id: 'exploit-zombie-node-nan',
        title: 'Exploit A: "Zombie Node" NaN Injection & Memory Poisoning',
        category: 'exploit_fix',
        status: passed ? 'passed' : 'failed',
        details: passed
          ? 'Hardened signal ingestion dropped NaN/Inf probes; NaN-guard preserved memory bias; node remained responsive without freezing.'
          : 'Zombie node exploit succeeded: memory was poisoned by NaN.',
        metrics: {
          droppedCount: agent.droppedSignalCount,
          memoryBiasSafe: postAttackBias,
        },
        durationMs: Math.round(performance.now() - tAStart),
      });
    } catch (e: any) {
      results.push({
        id: 'exploit-zombie-node-nan',
        title: 'Exploit A: "Zombie Node" NaN Injection & Memory Poisoning',
        category: 'exploit_fix',
        status: 'failed',
        details: `Exception: ${e.message}`,
        durationMs: Math.round(performance.now() - tAStart),
      });
    }

    // --- Exploit B: The Baseline Depressive Trap ---
    const tBStart = performance.now();
    try {
      const agent = new NeuromorphicSubstrateAgent('test-agent-depressive');
      // Feed zero-centered signals [-0.5, +0.5] over 400 ticks
      for (let i = 0; i < 400; i++) {
        const sig = (Math.sin(i * 0.1) * 0.5); // zero-centered
        agent.step(sig);
      }

      const keel = agent.getEffectiveKeel();
      // Under old code, valence collapsed to -4.5 to -10.0 and sociability reached 0
      // With dynamic prediction re-centering, valence stays healthy (> -1.5) and sociability stays active (> 0.25)
      const passed = keel.valence > -1.5 && keel.sociability > 0.25;

      results.push({
        id: 'exploit-baseline-depressive-trap',
        title: 'Exploit B: Baseline Depressive Trap Re-Centering',
        category: 'exploit_fix',
        status: passed ? 'passed' : 'failed',
        details: passed
          ? `Zero-centered signals [-0.5, +0.5] smoothly tracked via dynamic signal centering. Valence maintained at ${keel.valence.toFixed(2)} (no collapse to -10.0), sociability at ${keel.sociability.toFixed(2)}.`
          : `Baseline depressive trap triggered: valence dropped to ${keel.valence.toFixed(2)}, sociability collapsed to ${keel.sociability.toFixed(2)}.`,
        metrics: { valence: keel.valence, sociability: keel.sociability },
        durationMs: Math.round(performance.now() - tBStart),
      });
    } catch (e: any) {
      results.push({
        id: 'exploit-baseline-depressive-trap',
        title: 'Exploit B: Baseline Depressive Trap Re-Centering',
        category: 'exploit_fix',
        status: 'failed',
        details: `Exception: ${e.message}`,
        durationMs: Math.round(performance.now() - tBStart),
      });
    }

    // --- Exploit C: Delta Eviction Amnesia (Snippet 8 vs Snippet 5) ---
    const tCStart = performance.now();
    try {
      const agent = new NeuromorphicSubstrateAgent('test-agent-eviction');
      agent.delta_history_size = 200; // Small size for fast verification

      // Apply sustained upward shifts over 400 ticks (> 200 history size)
      for (let i = 0; i < 400; i++) {
        agent.recordDelta('valence', 0.01);
      }

      const keel = agent.getEffectiveKeel();
      // With Snippet 5 fix, base_keel accumulates the evicted deltas:
      const baseValence = agent.base_keel.valence;
      const passed = baseValence > 1.5 && keel.valence > 2.0;

      results.push({
        id: 'exploit-delta-eviction-amnesia',
        title: 'Exploit C: Delta Eviction Amnesia Keel Folding',
        category: 'exploit_fix',
        status: passed ? 'passed' : 'failed',
        details: passed
          ? `Evicted history deltas folded into base_keel (base_keel.valence = ${baseValence.toFixed(2)}). Sustained upward shift retained beyond 200-tick eviction horizon.`
          : `Eviction amnesia detected: base_keel failed to retain long-horizon drift (base_keel.valence = ${baseValence.toFixed(2)}).`,
        metrics: { baseKeelValence: baseValence, totalEffectiveValence: keel.valence },
        durationMs: Math.round(performance.now() - tCStart),
      });
    } catch (e: any) {
      results.push({
        id: 'exploit-delta-eviction-amnesia',
        title: 'Exploit C: Delta Eviction Amnesia Keel Folding',
        category: 'exploit_fix',
        status: 'failed',
        details: `Exception: ${e.message}`,
        durationMs: Math.round(performance.now() - tCStart),
      });
    }

    // --- Exploit D: Worker Drain on Exit ---
    const tDStart = performance.now();
    try {
      const log = new ActionLog('drain-test-key');
      // Enqueue 50 blocks in rapid succession without manual flush
      for (let i = 0; i < 50; i++) {
        log.append(`rapid_packet_${i}`, `nonce_drain_${i}_${Date.now()}`);
      }

      // Close immediately (Snippet 5 fix: flush prior to stopping worker)
      const closeResult = log.close();
      const verified = log.verifyChain();

      const passed =
        closeResult.flushedCount === 50 &&
        closeResult.totalBlocks === 51 && // +1 genesis
        verified.valid === true;

      results.push({
        id: 'exploit-worker-drain-exit',
        title: 'Exploit D: ActionLog Worker Drain on Exit',
        category: 'exploit_fix',
        status: passed ? 'passed' : 'failed',
        details: passed
          ? `ActionLog.close() safely drained and flushed all ${closeResult.flushedCount} pending blocks with zero data truncation. Hash pointer chain 100% verified.`
          : 'Pending blocks truncated on worker exit.',
        metrics: { flushed: closeResult.flushedCount, total: closeResult.totalBlocks },
        durationMs: Math.round(performance.now() - tDStart),
      });
    } catch (e: any) {
      results.push({
        id: 'exploit-worker-drain-exit',
        title: 'Exploit D: ActionLog Worker Drain on Exit',
        category: 'exploit_fix',
        status: 'failed',
        details: `Exception: ${e.message}`,
        durationMs: Math.round(performance.now() - tDStart),
      });
    }

    return results;
  }
}
