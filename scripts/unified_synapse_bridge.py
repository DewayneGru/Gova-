#!/usr/bin/env python3
"""
unified_synapse_bridge.py - Unified SynapseEdge Bio-SNN / Argon 2.0 Cybernetic Governor Orchestrator (V3 Master)

Integrates:
  1. synapse_governor.py (ArgonControlGovernorV2, ArgonClosedLoopBridgeV2, DopaminePlasticitySubstrate, step_kuramoto_and_int8_substrate_v3, StreamingAffirmationFilter, export_telemetry_for_bridge)
  2. scripts/local_context_bridge.py (workspace_memory.json, correlation reports, invariant audits, L2 manifold divergence, Pearson rho)
  3. scripts/gemini_drive_bridge.py (Bidirectional Google Drive state & markdown synchronization)
"""

import os
import sys
import time
import argparse
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from scripts.local_context_bridge import (
    load_workspace_memory,
    save_workspace_memory,
    discover_latest_correlation_report,
    run_automatic_invariant_audit,
    format_invariant_audit_banner,
    export_markdown_state,
)

from gemini_drive_bridge import sync_folders

from synapse_governor import (
    TelemetryState,
    LLMResponseTelemetry,
    ArgonControlGovernorV2,
    ArgonClosedLoopBridgeV2,
    DopaminePlasticitySubstrate,
    StreamingAffirmationFilter,
    strip_affirmation_fluff,
    compute_lexical_entropy_fallback,
    export_telemetry_for_bridge,
    load_telemetry_state,
    save_telemetry_state,
)


def run_unified_audit(report_path_override: Optional[str] = None) -> Tuple[Dict[str, Any], TelemetryState]:
    """Runs combined invariant audit and returns audit scorecard + current SNN telemetry."""
    memory = load_workspace_memory()
    report_path, report = discover_latest_correlation_report(report_path_override)
    audit = run_automatic_invariant_audit(memory, report)
    telem = load_telemetry_state()
    return audit, telem


def main():
    parser = argparse.ArgumentParser(
        description="Unified SynapseEdge Bio-SNN / Argon 2.0 Cybernetic Governor & Context Orchestrator (V3 Master)"
    )
    parser.add_argument("--audit", "-a", action="store_true", help="Run unified invariant and governor audit")
    parser.add_argument("--strict", action="store_true", help="Exit code 2 if any invariant or boundary is breached")
    parser.add_argument("--step", type=str, default=None, help="Step governor return path with simulated output text")
    parser.add_argument("--reward", type=float, default=None, help="Apply 3-factor dopamine reward pulse [-1.0..+1.0]")
    parser.add_argument("--drive-dir", "-d", type=str, default=None, help="Sync with Google Drive directory")
    parser.add_argument("--watch", "-w", action="store_true", help="Continuous monitoring and sync daemon")
    args = parser.parse_args()

    audit, telem = run_unified_audit()
    memory = load_workspace_memory()
    report_path, _ = discover_latest_correlation_report()

    if args.strict:
        if not audit["allInvariantsPassed"] or len(audit["boundaryViolations"]) > 0:
            print(format_invariant_audit_banner(audit, report_path), file=sys.stderr)
            print("[Unified Bridge STRICT ERROR] Invariant failure detected. Exiting with code 2.", file=sys.stderr)
            sys.exit(2)

    if args.audit or not (args.step or args.reward is not None or args.watch):
        print(format_invariant_audit_banner(audit, report_path))
        governor = ArgonControlGovernorV2()
        hooks = governor.compute_inference_hooks(telem)
        api_cfg = hooks["api_config"]
        print("\n" + "=" * 76)
        print(" ARGON 2.0 FORWARD GOVERNOR ACTIVE HYPERPARAMETERS (gemini-4-argon)")
        print("-" * 76)
        print(f" Temperature: {api_cfg['temperature']:.3f} | Top-P: {api_cfg['top_p']:.3f} | Max Tokens: {api_cfg['max_output_tokens']}")
        print(f" System Injection: {hooks['system_injection']}")
        print("=" * 76)

    if args.step:
        print(f"\n[Stepping Governor Return Path with output text]: '{args.step}'")
        bridge = ArgonClosedLoopBridgeV2(target_sigma=1.0, ltd_ltp_ratio=telem.ltd_ltp_ratio)
        sanitized_text = strip_affirmation_fluff(args.step)
        repair_action = "SURGICAL_STRIP" if sanitized_text != args.step.strip() else "NONE"
        entropy = compute_lexical_entropy_fallback(sanitized_text)
        print(f"[Sanitized Text (Gova Audited)]: '{sanitized_text}' (Entropy={entropy:.3f} nats)")

        llm_metrics = LLMResponseTelemetry(
            output_text=sanitized_text,
            tokens_generated=max(1, len(sanitized_text.split()) * 2),
            max_tokens_allowed=1024,
            generation_latency_ms=420.0,
            mean_token_entropy=entropy,
        )
        new_telem = bridge.step_return_path(telem, llm_metrics)
        save_telemetry_state(new_telem)
        export_telemetry_for_bridge(
            new_telem,
            history_turns=len(memory.get("conversationMemory", [])),
            repair_action=repair_action,
            measured_entropy=entropy,
        )
        print(
            f"[Turn N+1 SNN State]: σ={new_telem.sigma:.3f}, DRI={new_telem.dri:.3f}, "
            f"w_mean={new_telem.w_mean_int8:.3f}, r={new_telem.active_crowd:.3f}"
        )

    if args.reward is not None:
        dopamine = DopaminePlasticitySubstrate()
        updated_telem, shift = dopamine.apply_reward_pulse(args.reward, telem)
        save_telemetry_state(updated_telem)
        print(
            f"[3-Factor Dopamine Consolidation]: Reward={args.reward:+.2f} -> "
            f"mean_shift={shift:+.3f}, w_setpoint={updated_telem.w_setpoint_int8:.2f}, σ={updated_telem.sigma:.3f}"
        )

    if args.drive_dir:
        drive_path = Path(os.path.expanduser(args.drive_dir)).resolve()
        sync_folders(drive_path)

    if args.watch:
        print("[Unified Bridge] Watching workspace memory and sync daemon (Ctrl+C to quit)...")
        try:
            while True:
                time.sleep(5)
                if args.drive_dir:
                    drive_path = Path(os.path.expanduser(args.drive_dir)).resolve()
                    sync_folders(drive_path)
                export_markdown_state(load_workspace_memory())
        except KeyboardInterrupt:
            print("\nUnified bridge stopped.")


if __name__ == "__main__":
    main()
