#!/usr/bin/env python3
"""Telemetry Signer for Gova / Antigravity Sync Daemon.

Generates signed telemetry envelopes matching src/server/telemetryGate.ts:
- Raw-byte Merkle leaf: SHA-256(b"leaf:" + raw_body_bytes)
- Constant-time HMAC-SHA256 over f"{source_id}.{timestamp_ms}.{merkle_leaf}"
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import hmac
import json
import time
from typing import Any, Dict, Tuple


@dataclass
class SignedTelemetryEnvelope:
    raw_body: bytes
    source_id: str
    timestamp_ms: int
    merkle_leaf: str
    signature: str

    def to_headers(self) -> Dict[str, str]:
        return {
            "X-Gova-Source-Id": self.source_id,
            "X-Gova-Timestamp-Ms": str(self.timestamp_ms),
            "X-Gova-Merkle-Leaf": self.merkle_leaf,
            "X-Gova-Signature": self.signature,
            "Content-Type": "application/json; charset=utf-8",
        }


class TelemetrySigner:
    """Signs outbound telemetry payloads for verified ingestion."""

    def __init__(self, secret: str, source_id: str = "antigravity-sync-daemon") -> None:
        if not secret:
            raise ValueError("HMAC secret must be non-empty")
        self.secret = secret.encode("utf-8")
        self.source_id = source_id

    @staticmethod
    def compute_merkle_leaf(raw_body: bytes) -> str:
        hasher = hashlib.sha256()
        hasher.update(b"leaf:")
        hasher.update(raw_body)
        return hasher.hexdigest()

    def sign_payload(
        self,
        payload: Dict[str, Any],
        timestamp_ms: int | None = None,
    ) -> SignedTelemetryEnvelope:
        ts = int(timestamp_ms if timestamp_ms is not None else round(time.time() * 1000))
        raw_body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        merkle_leaf = self.compute_merkle_leaf(raw_body)
        msg = f"{self.source_id}.{ts}.{merkle_leaf}".encode("utf-8")
        signature = hmac.new(self.secret, msg, hashlib.sha256).hexdigest()
        return SignedTelemetryEnvelope(
            raw_body=raw_body,
            source_id=self.source_id,
            timestamp_ms=ts,
            merkle_leaf=merkle_leaf,
            signature=signature,
        )

    def verify_envelope(
        self,
        raw_body: bytes,
        source_id: str,
        timestamp_ms: int,
        merkle_leaf: str,
        signature: str,
        max_skew_ms: int = 30_000,
        now_ms: int | None = None,
    ) -> Tuple[bool, str]:
        current_ms = int(now_ms if now_ms is not None else round(time.time() * 1000))
        if abs(current_ms - int(timestamp_ms)) > max_skew_ms:
            return False, "Clock skew replay guard triggered"
        expected_leaf = self.compute_merkle_leaf(raw_body)
        if not hmac.compare_digest(expected_leaf, merkle_leaf):
            return False, "Merkle leaf commitment mismatch"
        msg = f"{source_id}.{timestamp_ms}.{expected_leaf}".encode("utf-8")
        expected_sig = hmac.new(self.secret, msg, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected_sig, signature):
            return False, "HMAC-SHA256 signature mismatch"
        return True, "OK"
