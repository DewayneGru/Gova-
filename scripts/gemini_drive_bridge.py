#!/usr/bin/env python3
"""
gemini_drive_bridge.py - Google Drive Shared Folder Sync for Gemini <-> AI Studio

This script monitors a local Google Drive folder (e.g. ~/Google Drive/Google AI Studio)
or synchronizes via the Google Drive API to push/pull 'context_bridge.json' and 'system_state.md'.

Usage:
    # 1. Sync local workspace with a local Google Drive sync folder:
    python3 scripts/gemini_drive_bridge.py --drive-dir "~/Google Drive/AI Studio Sync"

    # 2. Continuous watch mode (syncs both directions every 5 seconds):
    python3 scripts/gemini_drive_bridge.py --drive-dir "~/Google Drive/AI Studio Sync" --watch
"""

import os
import sys
import json
import time
import shutil
import argparse
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
LOCAL_MEMORY = ROOT_DIR / "workspace_memory.json"
LOCAL_STATE = ROOT_DIR / "system_state.md"

def sync_folders(drive_dir_path: Path):
    """Bidirectional sync between local workspace and Google Drive folder."""
    if not drive_dir_path.exists():
        drive_dir_path.mkdir(parents=True, exist_ok=True)
        print(f"[Drive Bridge] Created Drive sync directory at: {drive_dir_path}")

    drive_memory = drive_dir_path / "workspace_memory.json"
    drive_state = drive_dir_path / "system_state.md"

    # Sync Memory File (Newer timestamp wins)
    if LOCAL_MEMORY.exists() and drive_memory.exists():
        local_mtime = LOCAL_MEMORY.stat().st_mtime
        drive_mtime = drive_memory.stat().st_mtime
        if drive_mtime > local_mtime + 1.0:
            shutil.copy2(drive_memory, LOCAL_MEMORY)
            print(f"[Drive Bridge] Pulled updated workspace memory from Google Drive ({time.strftime('%H:%M:%S')})")
        elif local_mtime > drive_mtime + 1.0:
            shutil.copy2(LOCAL_MEMORY, drive_memory)
            print(f"[Drive Bridge] Pushed local workspace memory to Google Drive ({time.strftime('%H:%M:%S')})")
    elif LOCAL_MEMORY.exists() and not drive_memory.exists():
        shutil.copy2(LOCAL_MEMORY, drive_memory)
        print(f"[Drive Bridge] Initialized Google Drive with local workspace memory ({time.strftime('%H:%M:%S')})")
    elif not LOCAL_MEMORY.exists() and drive_memory.exists():
        shutil.copy2(drive_memory, LOCAL_MEMORY)
        print(f"[Drive Bridge] Restored local workspace memory from Google Drive ({time.strftime('%H:%M:%S')})")

    # Sync Human-Readable Markdown State
    if LOCAL_STATE.exists():
        shutil.copy2(LOCAL_STATE, drive_state)

def main():
    parser = argparse.ArgumentParser(description="Google Drive Sync for Gemini <-> AI Studio Bridge")
    parser.add_argument("--drive-dir", "-d", type=str, default=str(Path.home() / "Google Drive" / "AI Studio Sync"),
                        help="Path to local Google Drive folder")
    parser.add_argument("--watch", "-w", action="store_true", help="Continuously sync every 5 seconds")
    args = parser.parse_args()

    drive_dir = Path(os.path.expanduser(args.drive_dir)).resolve()
    print("=" * 70)
    print(" Google Drive <-> AI Studio Sync Bridge")
    print(f" Local Applet: {ROOT_DIR}")
    print(f" Target Drive Directory: {drive_dir}")
    print("=" * 70)

    sync_folders(drive_dir)

    if args.watch:
        print("[Drive Bridge] Watching for bidirectional updates (Ctrl+C to quit)...")
        try:
            while True:
                time.sleep(5)
                sync_folders(drive_dir)
        except KeyboardInterrupt:
            print("\nDrive sync stopped.")

if __name__ == "__main__":
    main()
