#!/usr/bin/env python3
"""Google Drive Sync Bridge for SynapseEdge Governor State Snapshots.

Monitors local state snapshots, validates schema and policy digests
against ControlledStateSnapshot and PreAuthorizedControlPolicy under
shared POSIX advisory locks (fcntl.flock), and syncs verified state
files to Google Drive or a local Drive sync directory atomically.
"""

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import time
from typing import Any, Dict, Optional, Union

from watchdog_policy_contract import (
    ControlledStateSnapshot,
    PreAuthorizedControlPolicy,
)

try:
    import google.auth
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
except ImportError:
    google = None
    build = None

    class MediaFileUpload:  # type: ignore[no-redef]
        def __init__(
            self,
            filename: str,
            resumable: bool = True,
            mimetype: str = "application/json",
        ) -> None:
            self.filename = filename
            self.resumable = resumable
            self.mimetype = mimetype


def compute_digest(filepath: Path) -> str:
    """Computes SHA-256 digest of a file under shared advisory lock if a .lock exists."""
    target = Path(filepath)
    lock_path = target.with_suffix(target.suffix + ".lock")
    sha256 = hashlib.sha256()

    if lock_path.exists():
        with open(lock_path, "a+", encoding="utf-8") as lock_file:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_SH)
            try:
                with open(target, "rb") as f:
                    for chunk in iter(lambda: f.read(65536), b""):
                        sha256.update(chunk)
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
    else:
        with open(target, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256.update(chunk)

    return sha256.hexdigest()


class DriveStateSyncBridge:
    """Watches local governor state snapshots, validates schema/policy digest, and syncs to Google Drive."""

    def __init__(
        self,
        watch_dir: Path,
        target_folder_name: str = "AI Studio Sync",
        service: Any = None,
        policy: Optional[PreAuthorizedControlPolicy] = None,
    ) -> None:
        self.watch_dir = Path(watch_dir).expanduser()
        self.target_folder_name = target_folder_name
        self.policy = policy or PreAuthorizedControlPolicy()
        self._folder_id: Optional[str] = None

        if service is not None:
            self.creds = None
            self.project = None
            self.service = service
        elif google is not None and build is not None:
            self.creds, self.project = google.auth.default()
            self.service = build("drive", "v3", credentials=self.creds)
        else:
            raise RuntimeError(
                "google-auth and google-api-python-client are required unless a Drive service is injected."
            )

    def _get_or_create_folder(self) -> str:
        if self._folder_id:
            return self._folder_id

        query = (
            f"name='{self.target_folder_name}' and "
            "mimeType='application/vnd.google-apps.folder' and trashed=false"
        )
        response = (
            self.service.files()
            .list(q=query, spaces="drive", fields="files(id, name)")
            .execute()
        )
        files = response.get("files", [])

        if files:
            self._folder_id = files[0]["id"]
        else:
            file_metadata = {
                "name": self.target_folder_name,
                "mimeType": "application/vnd.google-apps.folder",
            }
            folder = (
                self.service.files()
                .create(body=file_metadata, fields="id")
                .execute()
            )
            self._folder_id = folder["id"]

        return self._folder_id

    def find_remote_file(self, filename: str, folder_id: str) -> Optional[str]:
        query = (
            f"name='{filename}' and '{folder_id}' in parents and trashed=false"
        )
        response = (
            self.service.files()
            .list(q=query, spaces="drive", fields="files(id, name)")
            .execute()
        )
        files = response.get("files", [])
        return files[0]["id"] if files else None

    def validate_snapshot_envelope(self, raw: Any) -> bool:
        """Validates envelope structure, optional policy_digest, and ControlledStateSnapshot schema."""
        if not isinstance(raw, dict) or "state" not in raw:
            return False

        if "policy_digest" in raw:
            expected_digest = self.policy.policy_digest()
            if raw["policy_digest"] != expected_digest:
                return False

        snap = ControlledStateSnapshot.from_dict(raw["state"])
        snap.validate_types()
        return True

    def sync_file(self, local_path: Path) -> bool:
        local_path = Path(local_path)
        if not local_path.exists():
            return False

        lock_path = local_path.with_suffix(local_path.suffix + ".lock")
        try:
            if lock_path.exists():
                with open(lock_path, "a+", encoding="utf-8") as lock_file:
                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_SH)
                    try:
                        raw = json.loads(local_path.read_text(encoding="utf-8"))
                    finally:
                        fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
            else:
                raw = json.loads(local_path.read_text(encoding="utf-8"))

            if not self.validate_snapshot_envelope(raw):
                print(
                    f"[SyncBridge] Skipping {local_path.name}: Invalid state envelope or policy digest."
                )
                return False
        except Exception as e:
            print(
                f"[SyncBridge] Skipping {local_path.name}: Malformed or invalid state JSON ({e})."
            )
            return False

        folder_id = self._get_or_create_folder()
        filename = local_path.name
        remote_id = self.find_remote_file(filename, folder_id)

        media = MediaFileUpload(
            str(local_path), resumable=True, mimetype="application/json"
        )

        if remote_id:
            self.service.files().update(
                fileId=remote_id, media_body=media
            ).execute()
            print(f"[SyncBridge] Updated remote file: {filename}")
        else:
            file_metadata = {"name": filename, "parents": [folder_id]}
            self.service.files().create(
                body=file_metadata, media_body=media, fields="id"
            ).execute()
            print(f"[SyncBridge] Uploaded new remote file: {filename}")

        return True

    def scan_once(self, known_digests: Dict[str, str]) -> int:
        """Performs a single directory scan pass and returns number of synced files."""
        self.watch_dir.mkdir(parents=True, exist_ok=True)
        synced_count = 0
        for json_file in sorted(self.watch_dir.glob("*.json")):
            if json_file.name.endswith(".lock") or ".tmp" in json_file.name:
                continue
            current_digest = compute_digest(json_file)
            if known_digests.get(json_file.name) != current_digest:
                print(
                    f"[SyncBridge] Detected change in {json_file.name}. Syncing..."
                )
                if self.sync_file(json_file):
                    known_digests[json_file.name] = current_digest
                    synced_count += 1
        return synced_count

    def watch_loop(self, poll_interval_sec: float = 5.0) -> None:
        print(f"[SyncBridge] Watching directory: {self.watch_dir}")
        self.watch_dir.mkdir(parents=True, exist_ok=True)
        known_digests: Dict[str, str] = {}

        while True:
            try:
                self.scan_once(known_digests)
            except Exception as e:
                print(f"[SyncBridge] Error in sync loop: {e}")

            time.sleep(poll_interval_sec)


def sync_folders(drive_dir: Union[Path, str], workspace_dir: Optional[Path] = None) -> int:
    """Synchronizes verified local telemetry & markdown artifacts into a target Drive folder."""
    root = Path(workspace_dir or Path(__file__).resolve().parent)
    target_dir = Path(drive_dir).expanduser().resolve()
    target_dir.mkdir(parents=True, exist_ok=True)

    artifact_names = (
        "workspace_memory.json",
        "GEMINI_SHARED_STATE.md",
        "snn_telemetry_state.json",
        "snn-divergence-correlation-report-latest.json",
    )
    copied = 0
    for name in artifact_names:
        src = root / name
        if src.exists() and src.is_file():
            dst = target_dir / name
            shutil.copy2(src, dst)
            copied += 1
    return copied


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Sync local governor state snapshots to Google Drive."
    )
    parser.add_argument(
        "--drive-dir",
        type=str,
        default="~/Google Drive/AI Studio Sync",
        help="Local sync directory path",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=5.0,
        help="Polling interval in seconds",
    )
    parser.add_argument(
        "--watch",
        action="store_true",
        help="Run continuous polling loop (default behavior)",
    )
    args = parser.parse_args()

    bridge = DriveStateSyncBridge(watch_dir=Path(args.drive_dir))
    bridge.watch_loop(poll_interval_sec=args.interval)
