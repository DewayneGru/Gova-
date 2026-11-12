#!/usr/bin/env python3
"""Antigravity Sync Daemon: Quota Circuit-Breaker, Qwen 2.5 Failover, and Atomic Patch Receiver.

Provides:
1. QuotaBackoffController: Parses upstream reset windows ('Resets in XhYmZs'),
   persists '.antigravity_quota_state.json', and serves GET /quota-state.
2. dispatch_with_failover: Routes bridge tasks to local Qwen 2.5
   (http://127.0.0.1:11434/v1/chat/completions, model 'qwen2.5-coder:7b')
   whenever upstream quota is locked.
3. validate_and_apply_patch & POST /apply-patch: Strips Markdown ```diff fences,
   validates paths against PROTECTED_PATHS and traversal, executes
   'git apply --check --recount' dry-run verification, and applies cleanly.
"""

from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import re
import subprocess
import tempfile
import time
from typing import Any, Callable, Dict, Optional
from urllib.parse import urlparse
import urllib.request
import urllib.error

REPO_ROOT = Path(__file__).resolve().parents[1]
QUOTA_STATE_FILE = REPO_ROOT / ".antigravity_quota_state.json"
LOCAL_QWEN_ENDPOINT = "http://127.0.0.1:11434/v1/chat/completions"
LOCAL_QWEN_MODEL = "qwen2.5-coder:7b"

PROTECTED_PATHS = {".git", ".env", "src/server/security.ts"}

RESET_DURATION_RE = re.compile(
    r"Resets\s+in\s+(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?",
    re.IGNORECASE,
)


def extract_unified_diff(raw_text: str) -> str:
    """Extract ```diff ... ``` blocks if wrapped in Markdown, otherwise treat raw_text as diff."""
    blocks = re.findall(r"```(?:diff|patch)?\n(.*?)```", raw_text, flags=re.DOTALL)
    diff_body = "\n".join(blocks).strip() if blocks else raw_text.strip()
    if not diff_body.endswith("\n"):
        diff_body += "\n"
    return diff_body


def validate_and_apply_patch(raw_response: str, repo_dir: Path) -> Dict[str, Any]:
    """Validate unified diff headers, protected boundaries, and apply via git apply --check."""
    diff_text = extract_unified_diff(raw_response)
    if "--- " not in diff_text or "+++ " not in diff_text:
        return {"ok": False, "error": "No valid unified diff headers found in payload."}

    # Guard against path traversal and protected boundary edits
    for line in diff_text.splitlines():
        if line.startswith(("+++ b/", "--- a/")):
            rel_path = line[6:].strip()
            normalized = Path(rel_path)
            if (
                normalized.is_absolute()
                or ".." in normalized.parts
                or rel_path in PROTECTED_PATHS
                or (normalized.parts and normalized.parts[0] in PROTECTED_PATHS)
            ):
                return {"ok": False, "error": f"Blocked protected or invalid path: {rel_path}"}

    with tempfile.NamedTemporaryFile("w", suffix=".diff", delete=False, encoding="utf-8") as tmp:
        tmp.write(diff_text)
        patch_path = Path(tmp.name)

    try:
        # 1. Dry-run verification
        check = subprocess.run(
            ["git", "apply", "--check", "--recount", str(patch_path)],
            cwd=repo_dir,
            capture_output=True,
            text=True,
        )
        if check.returncode != 0:
            return {"ok": False, "error": f"Patch check failed: {check.stderr.strip()}"}

        # 2. Apply to working tree
        apply_res = subprocess.run(
            ["git", "apply", "--recount", str(patch_path)],
            cwd=repo_dir,
            capture_output=True,
            text=True,
        )
        if apply_res.returncode != 0:
            return {"ok": False, "error": f"git apply failed: {apply_res.stderr.strip()}"}

        stat = subprocess.run(
            ["git", "diff", "--stat"],
            cwd=repo_dir,
            capture_output=True,
            text=True,
        )
        return {"ok": True, "stat": stat.stdout.strip()}
    finally:
        patch_path.unlink(missing_ok=True)


class QuotaBackoffController:
    """Tracks upstream quota lockouts and persists .antigravity_quota_state.json."""

    def __init__(self, state_path: Path = QUOTA_STATE_FILE) -> None:
        self.state_path = Path(state_path)
        self.paused_until_epoch: float = 0.0
        self.last_error_message: str = ""
        self.failover_active: bool = False
        self.load()

    @staticmethod
    def parse_reset_seconds(error_text: str) -> int:
        match = RESET_DURATION_RE.search(error_text or "")
        if not match:
            if "quota" in (error_text or "").lower() or "402" in (error_text or "") or "429" in (error_text or ""):
                return 3600
            return 0
        hours = int(match.group(1) or 0)
        minutes = int(match.group(2) or 0)
        seconds = int(match.group(3) or 0)
        total = hours * 3600 + minutes * 60 + seconds
        return max(60, total)

    def record_quota_error(self, error_text: str) -> Dict[str, Any]:
        duration_sec = self.parse_reset_seconds(error_text)
        if duration_sec > 0:
            self.paused_until_epoch = time.time() + duration_sec
            self.last_error_message = error_text.strip()
            self.failover_active = True
            self.save()
        return self.get_state()

    def is_paused(self) -> bool:
        if self.paused_until_epoch > time.time():
            return True
        if self.failover_active and self.paused_until_epoch <= time.time():
            self.failover_active = False
            self.save()
        return False

    def remaining_seconds(self) -> int:
        return max(0, int(round(self.paused_until_epoch - time.time())))

    def get_state(self) -> Dict[str, Any]:
        paused = self.is_paused()
        rem = self.remaining_seconds()
        hours = rem // 3600
        minutes = (rem % 3600) // 60
        seconds = rem % 60
        return {
            "paused": paused,
            "failoverActive": paused or self.failover_active,
            "pausedUntilEpoch": self.paused_until_epoch,
            "remainingSeconds": rem,
            "formattedCountdown": f"{hours}h {minutes}m {seconds}s" if paused else "0h 0m 0s",
            "localFailoverModel": LOCAL_QWEN_MODEL,
            "localFailoverEndpoint": LOCAL_QWEN_ENDPOINT,
            "lastError": self.last_error_message,
            "updatedAt": time.time(),
        }

    def save(self) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        payload = self.get_state()
        self.state_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def load(self) -> None:
        if not self.state_path.exists():
            return
        try:
            raw = json.loads(self.state_path.read_text(encoding="utf-8"))
            self.paused_until_epoch = float(raw.get("pausedUntilEpoch", 0.0))
            self.last_error_message = str(raw.get("lastError", ""))
            self.failover_active = bool(raw.get("failoverActive", False))
        except Exception:
            pass


def call_local_qwen(
    prompt: str,
    system_instruction: str = "When returning code changes, output a single valid unified git diff inside a ```diff fenced block with a/ and b/ repo-relative paths and no abbreviated // ... existing code ... placeholders.",
    endpoint: str = LOCAL_QWEN_ENDPOINT,
    model: str = LOCAL_QWEN_MODEL,
    timeout: float = 30.0,
) -> Dict[str, Any]:
    """Dispatches prompt to local Qwen 2.5 via OpenAI-compatible chat completions endpoint."""
    body = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        endpoint,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        content = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        return {
            "ok": True,
            "modelUsed": model,
            "failover": True,
            "content": content,
        }


def dispatch_with_failover(
    prompt: str,
    upstream_callable: Optional[Callable[[str], str]] = None,
    controller: Optional[QuotaBackoffController] = None,
) -> Dict[str, Any]:
    """Routes tasks to upstream model when quota is healthy, or fails over to local Qwen 2.5."""
    ctrl = controller or QuotaBackoffController()
    if not ctrl.is_paused() and upstream_callable is not None:
        try:
            text = upstream_callable(prompt)
            return {
                "ok": True,
                "modelUsed": "upstream-gemini",
                "failover": False,
                "content": text,
                "quotaState": ctrl.get_state(),
            }
        except Exception as exc:
            err_str = str(exc)
            ctrl.record_quota_error(err_str)

    try:
        qwen_res = call_local_qwen(prompt)
        qwen_res["quotaState"] = ctrl.get_state()
        return qwen_res
    except Exception as qwen_exc:
        return {
            "ok": False,
            "modelUsed": LOCAL_QWEN_MODEL,
            "failover": True,
            "error": f"Upstream quota paused and local Qwen failover unreachable: {qwen_exc}",
            "quotaState": ctrl.get_state(),
        }


GLOBAL_QUOTA_CONTROLLER = QuotaBackoffController()


class AntigravitySyncHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self._send_json(204, {})

    def do_GET(self) -> None:
        parsed_path = urlparse(self.path).path
        if parsed_path == "/quota-state":
            self._send_json(200, GLOBAL_QUOTA_CONTROLLER.get_state())
            return
        self._send_json(404, {"ok": False, "error": "Not found"})

    def do_POST(self) -> None:
        parsed_path = urlparse(self.path).path
        if parsed_path != "/apply-patch":
            self._send_json(404, {"ok": False, "error": "Not found"})
            return

        content_length = int(self.headers.get("Content-Length", 0))
        if content_length <= 0:
            self._send_json(400, {"ok": False, "error": "Empty request body"})
            return

        try:
            raw_body = self.rfile.read(content_length).decode("utf-8")
            payload = json.loads(raw_body)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            self._send_json(400, {"ok": False, "error": f"Invalid JSON payload: {exc}"})
            return

        raw_text = payload.get("content", "")
        result = validate_and_apply_patch(raw_text, REPO_ROOT)
        self._send_json(200 if result["ok"] else 422, result)


def run_server(host: str = "127.0.0.1", port: int = 8765) -> None:
    server = HTTPServer((host, port), AntigravitySyncHandler)
    print(f"[AntigravitySyncDaemon] Listening on http://{host}:{port} (GET /quota-state, POST /apply-patch)")
    server.serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Antigravity Local Sync Daemon")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8765, help="Bind port (default: 8765)")
    args = parser.parse_args()
    run_server(args.host, args.port)
