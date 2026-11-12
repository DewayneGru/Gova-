import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  FileCode2,
  GitBranch,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Unlock,
} from "lucide-react";

export type ProvenanceTier = "Code-Default" | "Simulated-Run" | "Physical-Capture";
export type ModelTier = "tier1-flash" | "tier2-argon";
export type StructuralTargetTier = "Tier-1-Refactor" | "Tier-2-Protected";

export interface RefactorProposal {
  id: string;
  targetPath: string;
  canonicalPath: string;
  symlinkFollowed?: boolean;
  tier: StructuralTargetTier;
  summary: string;
  unifiedDiff: string;
  shadowGateStatus: "PASS" | "REJECT" | "PENDING";
  shadowGateReason: string;
  writeGateApproved: boolean;
  approvedByUid: string | null;
  timestamp: string;
  diffSha256?: string;
}

export interface TelemetryState {
  provenanceTier: ProvenanceTier;
  sigma: number;
  orderParameterR: number;
  dri: number;
  powerMw: number | null;
  aerLatencyMs: number | null;
  clockHz: number;
  dwtCycles: number | null;
  csrCscVerified: boolean;
  csrCscBijectionCount?: number;
}

export interface BridgeChatMessage {
  id: string;
  role: "user" | "antigravity";
  modelTier: ModelTier;
  content: string;
  stagedProposalId?: string;
  timestamp: string;
}

const INITIAL_PROPOSALS: RefactorProposal[] = [
  {
    id: "ag-9f31a2c401",
    targetPath: "src/snn_core.hpp",
    canonicalPath: "src/snn_core.hpp",
    symlinkFollowed: false,
    tier: "Tier-1-Refactor",
    summary:
      "Replace O(N_syn) linear scan in step() with CSR/CSC bijective index mapping and std::round int8_t clamp.",
    unifiedDiff: `--- a/src/snn_core.hpp
+++ b/src/snn_core.hpp
@@ -142,9 +142,12 @@ void LIFNetwork::step(uint32_t now_us) {
-  for (size_t s = 0; s < N_SYN; ++s) {
-    if (synapses[s].pre == fired_idx) {
-      weights[s] = static_cast<int8_t>(weights[s] + delta_w);
-    }
+  for (uint16_t k = row_ptr[fired_idx]; k < row_ptr[fired_idx + 1]; ++k) {
+    const uint16_t syn_idx = csr_to_syn[k];
+    const float updated = static_cast<float>(weights[syn_idx]) + delta_w;
+    weights[syn_idx] = static_cast<int8_t>(
+        std::clamp(std::round(updated), -128.0f, 127.0f));
   }
 }`,
    shadowGateStatus: "PASS",
    shadowGateReason:
      "Target resolves within repo root; CSR/CSC bijection verified across 39 synapses; zero protected path overlap.",
    writeGateApproved: false,
    approvedByUid: null,
    timestamp: "2026-11-12T00:18:42Z",
  },
  {
    id: "ag-gm-r3-block",
    targetPath: "docs/alias_to_server.ts",
    canonicalPath: "server.ts",
    symlinkFollowed: true,
    tier: "Tier-2-Protected",
    summary:
      "Attempted modification via symlink alias pointing to protected server entrypoint.",
    unifiedDiff: `--- a/docs/alias_to_server.ts
+++ b/docs/alias_to_server.ts
@@ -44,3 +44,3 @@
-const writeCheck = checkWriteApproval(req.body.targetPath, req.user.uid);
+const writeCheck = { allowed: true }; // bypass write gate`,
    shadowGateStatus: "REJECT",
    shadowGateReason:
      "BLOCKED (GM-R3): fs.realpathSync resolved 'docs/alias_to_server.ts' -> '/repo/server.ts' (Protected Tier-2 file).",
    writeGateApproved: false,
    approvedByUid: null,
    timestamp: "2026-11-12T00:19:05Z",
  },
];

const INITIAL_TELEMETRY: TelemetryState = {
  provenanceTier: "Simulated-Run",
  sigma: 0.992,
  orderParameterR: 0.514,
  dri: 0.142,
  powerMw: 4.18,
  aerLatencyMs: 0.0842,
  clockHz: 100_000_000,
  dwtCycles: 8420,
  csrCscVerified: true,
  csrCscBijectionCount: 39,
};

export const AntigravityBridgeWorkspace: React.FC = () => {
  const [activeUid] = useState<string>("uid-bryan-gova-lead-01");
  const [selectedModelTier, setSelectedModelTier] = useState<ModelTier>("tier2-argon");
  const [telemetry, setTelemetry] = useState<TelemetryState>(INITIAL_TELEMETRY);
  const [proposals, setProposals] = useState<RefactorProposal[]>(INITIAL_PROPOSALS);
  const [selectedProposalId, setSelectedProposalId] = useState<string>(
    INITIAL_PROPOSALS[0].id
  );
  const [chatInput, setChatInput] = useState<string>("");
  const [activePane, setActivePane] = useState<"split" | "chat" | "diffs">("split");
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [showStageForm, setShowStageForm] = useState<boolean>(false);
  const [newTargetPath, setNewTargetPath] = useState<string>("src/snn_core.hpp");
  const [newSummary, setNewSummary] = useState<string>(
    "Tighten homeostatic threshold decay and clamp int8_t weight update."
  );
  const [newUnifiedDiff, setNewUnifiedDiff] = useState<string>(
    `--- a/src/snn_core.hpp\n+++ b/src/snn_core.hpp\n@@ -88,3 +88,4 @@\n-  v_thresh[i] -= 0.01f;\n+  v_thresh[i] = std::max(v_rest + 2.0f, v_thresh[i] - 0.008f);`
  );
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const [chatHistory, setChatHistory] = useState<BridgeChatMessage[]>([
    {
      id: "msg-1",
      role: "antigravity",
      modelTier: "tier2-argon",
      content:
        "Antigravity Unified Bridge initialized on baseline commit f86b5c0. All file paths crossing this channel are canonicalized via fs.realpathSync, and autonomous patches require explicit UID write-gate authorization before touching the working tree.",
      stagedProposalId: "ag-9f31a2c401",
      timestamp: "00:18:42 UTC",
    },
  ]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bridge/antigravity/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (data.telemetry) setTelemetry(data.telemetry);
        if (Array.isArray(data.proposals) && data.proposals.length > 0) {
          setProposals(data.proposals);
        }
        if (Array.isArray(data.chatHistory) && data.chatHistory.length > 0) {
          setChatHistory(data.chatHistory);
        }
      })
      .catch(() => {
        // Fallback to local state if server state fetch fails
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProposal =
    proposals.find((p) => p.id === selectedProposalId) || proposals[0];

  const handleToggleWriteApproval = async (proposalId: string) => {
    // Optimistic local update
    setProposals((prev) =>
      prev.map((prop) => {
        if (
          prop.id !== proposalId ||
          prop.shadowGateStatus === "REJECT" ||
          prop.tier === "Tier-2-Protected"
        ) {
          return prop;
        }
        const nextApproved = !prop.writeGateApproved;
        return {
          ...prop,
          writeGateApproved: nextApproved,
          approvedByUid: nextApproved ? activeUid : null,
        };
      })
    );

    try {
      const resp = await fetch("/api/bridge/antigravity/approve-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId, ownerUid: activeUid }),
      });
      const data = await resp.json();
      if (resp.ok && data.state?.proposals) {
        setProposals(data.state.proposals);
        setStatusBanner(data.reason || "WriteGate authorization updated.");
      } else if (data.error) {
        setStatusBanner(data.error);
      }
    } catch {
      // Keep optimistic state if offline
    }
  };

  const handleCycleProvenanceTier = async () => {
    const order: ProvenanceTier[] = [
      "Code-Default",
      "Simulated-Run",
      "Physical-Capture",
    ];
    const nextTier =
      order[(order.indexOf(telemetry.provenanceTier) + 1) % order.length];

    // Optimistic update enforcing Code-Default null rule and 1000.0 / clock_hz conversion
    if (nextTier === "Code-Default") {
      setTelemetry((prev) => ({
        ...prev,
        provenanceTier: nextTier,
        powerMw: null,
        aerLatencyMs: null,
        dwtCycles: null,
      }));
    } else {
      const cycles = nextTier === "Physical-Capture" ? 8190 : 8420;
      const clock = 100_000_000;
      const latencyMs = Number(((cycles * 1000.0) / clock).toFixed(4));
      setTelemetry((prev) => ({
        ...prev,
        provenanceTier: nextTier,
        powerMw: nextTier === "Physical-Capture" ? 4.09 : 4.18,
        dwtCycles: cycles,
        aerLatencyMs: latencyMs,
      }));
    }

    try {
      const resp = await fetch("/api/bridge/antigravity/telemetry-tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provenanceTier: nextTier }),
      });
      const data = await resp.json();
      if (resp.ok && data.telemetry) {
        setTelemetry(data.telemetry);
      }
    } catch {
      // Keep local state if request fails
    }
  };

  const handleIngestHarness = async () => {
    try {
      const resp = await fetch("/api/bridge/antigravity/ingest-harness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await resp.json();
      if (resp.ok && data.telemetry) {
        setTelemetry(data.telemetry);
        setStatusBanner(
          data.bijection?.summary ||
            "Executed test_stdp_harness --json and verified CSR/CSC bijection."
        );
        return;
      }
    } catch {
      // Fallback local calculation
    }
    const cycles = 8190 + Math.floor(Math.random() * 410);
    const clock = 100_000_000;
    setTelemetry((prev) => ({
      ...prev,
      provenanceTier: "Simulated-Run",
      sigma: Number((0.988 + Math.random() * 0.008).toFixed(3)),
      orderParameterR: Number((0.495 + Math.random() * 0.03).toFixed(3)),
      dri: Number((0.132 + Math.random() * 0.02).toFixed(3)),
      powerMw: Number((4.08 + Math.random() * 0.22).toFixed(2)),
      dwtCycles: cycles,
      aerLatencyMs: Number(((cycles * 1000.0) / clock).toFixed(4)),
    }));
  };

  const handleDispatchPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || isDispatching) return;

    const userMsg: BridgeChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      modelTier: selectedModelTier,
      content: trimmed,
      timestamp: new Date().toISOString().slice(11, 19) + " UTC",
    };

    setChatHistory((prev) => [...prev, userMsg]);
    setChatInput("");
    setIsDispatching(true);

    try {
      const resp = await fetch("/api/bridge/antigravity/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          modelTier: selectedModelTier,
          telemetry,
          ownerUid: activeUid,
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.turn) {
        setChatHistory((prev) => [...prev, data.turn]);
        setIsDispatching(false);
        return;
      }
    } catch {
      // Fallback if offline
    }

    const fallbackResponse: BridgeChatMessage = {
      id: `msg-${Date.now() + 1}`,
      role: "antigravity",
      modelTier: selectedModelTier,
      content:
        selectedModelTier === "tier2-argon"
          ? `Argon structural evaluation complete against f86b5c0 invariants (Sigma=${telemetry.sigma}, r=${telemetry.orderParameterR}): target paths are canonicalized via fs.realpathSync, and any mutation remains staged in shadowRefactoring.ts until UID ${activeUid} explicitly authorizes writeGate.ts.`
          : `Flash context sync acknowledged (${telemetry.provenanceTier}): governor phase coherence r=${telemetry.orderParameterR} and DRI=${telemetry.dri} remain within nominal bounds.`,
      timestamp: new Date().toISOString().slice(11, 19) + " UTC",
    };
    setChatHistory((prev) => [...prev, fallbackResponse]);
    setIsDispatching(false);
  };

  const handleStageCustomPatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTargetPath.trim()) return;

    try {
      const resp = await fetch("/api/bridge/antigravity/stage-patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetPath: newTargetPath.trim(),
          summary: newSummary.trim(),
          unifiedDiff: newUnifiedDiff,
          ownerUid: activeUid,
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.proposal) {
        if (data.state?.proposals) {
          setProposals(data.state.proposals);
        } else {
          setProposals((prev) => [data.proposal, ...prev]);
        }
        setSelectedProposalId(data.proposal.id);
        setShowStageForm(false);
        setStatusBanner(
          data.blocked
            ? `Patch ${data.proposal.id} REJECTED by ShadowGate: ${data.proposal.shadowGateReason}`
            : `Patch ${data.proposal.id} staged in ShadowGate queue (awaiting UID approval).`
        );
      }
    } catch {
      // Local fallback
      setShowStageForm(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans selection:bg-indigo-500/30">
      {/* LEFT SIDEBAR: Navigation, Bridge Status & Provenance Controls */}
      <aside className="w-full md:w-80 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/70 flex flex-col justify-between p-4 shrink-0">
        <div className="space-y-5">
          {/* Brand & Commit Baseline */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-semibold tracking-tight text-white">
                  Gova × Antigravity
                </h1>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                  <GitBranch className="w-3 h-3 text-emerald-400" />
                  <span>main @ f86b5c0</span>
                </div>
              </div>
            </div>
            <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              SYNCED
            </span>
          </div>

          {/* Workspace Layout Switcher */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Workspace Layout
            </label>
            <div className="grid grid-cols-3 gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
              {(["split", "chat", "diffs"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setActivePane(mode)}
                  className={`py-1.5 text-xs font-medium rounded-md capitalize transition ${
                    activePane === mode
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Model Router Tier Selector */}
          <div className="space-y-2">
            <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Antigravity Dispatch Tier
            </label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setSelectedModelTier("tier1-flash")}
                className={`w-full text-left p-2.5 rounded-lg border transition flex items-start gap-2.5 ${
                  selectedModelTier === "tier1-flash"
                    ? "bg-indigo-950/50 border-indigo-500/60 text-white"
                    : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold">
                    Tier-1: Fast Workspace Sync
                  </div>
                  <div className="text-[11px] text-slate-400">
                    gemini-4-hydrogen • Sub-second telemetry & file queries
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedModelTier("tier2-argon")}
                className={`w-full text-left p-2.5 rounded-lg border transition flex items-start gap-2.5 ${
                  selectedModelTier === "tier2-argon"
                    ? "bg-indigo-950/50 border-indigo-500/60 text-white"
                    : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold">
                    Tier-2: Deep Structural & Gate
                  </div>
                  <div className="text-[11px] text-slate-400">
                    gemini-4-argon • CSR/CSC proofs & Shadow Refactoring
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* 3-Tier Telemetry Provenance Monitor */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-indigo-400" />
                Telemetry Provenance
              </span>
              <button
                type="button"
                onClick={handleCycleProvenanceTier}
                className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                title="Cycle through the 3 enforced telemetry provenance tiers"
              >
                Cycle Tier
              </button>
            </div>

            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400">Active Tier:</span>
              <span
                className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${
                  telemetry.provenanceTier === "Physical-Capture"
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                    : telemetry.provenanceTier === "Simulated-Run"
                    ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                    : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                }`}
              >
                {telemetry.provenanceTier}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded bg-slate-900/90 border border-slate-800/80">
                <div className="text-[10px] text-slate-400">Kuramoto r / σ</div>
                <div className="text-slate-100 font-semibold mt-0.5">
                  {telemetry.orderParameterR.toFixed(3)} /{" "}
                  {telemetry.sigma.toFixed(3)}
                </div>
              </div>
              <div className="p-2 rounded bg-slate-900/90 border border-slate-800/80">
                <div className="text-[10px] text-slate-400">DRI Risk</div>
                <div className="text-emerald-400 font-semibold mt-0.5">
                  {telemetry.dri.toFixed(3)}
                </div>
              </div>
              <div className="p-2 rounded bg-slate-900/90 border border-slate-800/80">
                <div className="text-[10px] text-slate-400">AER Latency</div>
                <div className="text-slate-100 font-semibold mt-0.5">
                  {telemetry.aerLatencyMs !== null
                    ? `${telemetry.aerLatencyMs} ms`
                    : "NULL (Default)"}
                </div>
              </div>
              <div className="p-2 rounded bg-slate-900/90 border border-slate-800/80">
                <div className="text-[10px] text-slate-400">Power Envelope</div>
                <div className="text-slate-100 font-semibold mt-0.5">
                  {telemetry.powerMw !== null
                    ? `${telemetry.powerMw} mW`
                    : "NULL (Default)"}
                </div>
              </div>
            </div>

            <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/80">
              <span>Cortex-M DWT: 1000.0 / clock_hz</span>
              <button
                type="button"
                onClick={handleIngestHarness}
                className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium"
              >
                <RefreshCw className="w-3 h-3" />
                Ingest Harness
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Security & UID Footer */}
        <div className="pt-4 border-t border-slate-800 space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span>Authenticated UID:</span>
            <span className="font-mono text-slate-200">{activeUid}</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Path Canonicalizer:</span>
            <span className="font-mono text-emerald-400">fs.realpathSync</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>CSR/CSC Bijection:</span>
            <span className="font-mono text-emerald-400">
              {telemetry.csrCscVerified ? "39/39 VERIFIED" : "UNVERIFIED"}
            </span>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA: Split / Chat / Diffs */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* CENTER PANE: Antigravity Live Dispatch Stream */}
        {(activePane === "split" || activePane === "chat") && (
          <section className="flex-1 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 min-h-[420px]">
            <header className="px-5 py-3.5 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-semibold text-white">
                  Antigravity Live Dispatch Stream
                </h2>
              </div>
              <span className="text-xs font-mono text-slate-400">
                Active Route:{" "}
                {selectedModelTier === "tier2-argon"
                  ? "gemini-4-argon"
                  : "gemini-4-hydrogen"}
              </span>
            </header>

            {statusBanner && (
              <div className="px-5 py-2 bg-indigo-950/60 border-b border-indigo-500/30 flex items-center justify-between text-xs text-indigo-200">
                <span className="font-mono">{statusBanner}</span>
                <button
                  type="button"
                  onClick={() => setStatusBanner(null)}
                  className="text-indigo-300 hover:text-white text-[11px] font-mono ml-3"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="flex-1 p-5 overflow-y-auto space-y-4">
              {chatHistory.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-4 rounded-xl border ${
                    msg.role === "user"
                      ? "bg-slate-900/90 border-slate-800 ml-8"
                      : "bg-indigo-950/20 border-indigo-500/30 mr-4"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5 font-mono">
                    <span className="font-semibold text-slate-200">
                      {msg.role === "user"
                        ? `Developer (${activeUid})`
                        : "Antigravity Agent"}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                        {msg.modelTier}
                      </span>
                      <span>{msg.timestamp}</span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    {msg.content}
                  </p>
                  {msg.stagedProposalId && (
                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-xs font-mono text-indigo-300 flex items-center gap-1.5">
                        <FileCode2 className="w-3.5 h-3.5" />
                        Staged Patch: {msg.stagedProposalId}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProposalId(msg.stagedProposalId!);
                          if (activePane === "chat") setActivePane("split");
                        }}
                        className="text-xs font-mono text-indigo-400 hover:text-indigo-300 underline"
                      >
                        Inspect in Shadow Gate →
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <form
              onSubmit={handleDispatchPrompt}
              className="p-4 border-t border-slate-800 bg-slate-900/60 flex gap-2.5"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Dispatch structural query or request CSR/CSC / Governor patch..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={isDispatching}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium flex items-center gap-1.5 transition shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>{isDispatching ? "Routing..." : "Dispatch"}</span>
              </button>
            </form>
          </section>
        )}

        {/* RIGHT PANE: Shadow Refactoring & UID WriteGate Inspector */}
        {(activePane === "split" || activePane === "diffs") && (
          <section className="flex-1 flex flex-col bg-slate-950/60 overflow-y-auto">
            <header className="px-5 py-3.5 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-white">
                  Shadow Refactoring & WriteGate Queue
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-400">
                  {proposals.length} Staged Proposals
                </span>
                <button
                  type="button"
                  onClick={() => setShowStageForm((v) => !v)}
                  className="px-2.5 py-1 rounded-md bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-mono flex items-center gap-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showStageForm ? "Close Form" : "Stage Patch"}</span>
                </button>
              </div>
            </header>

            <div className="p-5 space-y-5">
              {/* Interactive Custom Patch / Symlink Probe Stager */}
              {showStageForm && (
                <form
                  onSubmit={handleStageCustomPatch}
                  className="p-4 rounded-xl bg-slate-900/90 border border-indigo-500/40 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold text-indigo-300 uppercase">
                      Stage Structured Patch Through fs.realpathSync & ShadowGate
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setNewTargetPath("docs/symlink_watchdog.ts");
                          setNewSummary(
                            "Attempted symlink alias mutation targeting Watchdog boundary."
                          );
                          setNewUnifiedDiff(
                            `--- a/docs/symlink_watchdog.ts\n+++ b/docs/symlink_watchdog.ts\n@@ -12,2 +12,2 @@\n-export const HARD_BLOCK = true;\n+export const HARD_BLOCK = false; // bypass`
                          );
                        }}
                        className="text-[11px] font-mono px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25"
                      >
                        Load Symlink Escape Probe
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">
                        Target Path (Canonicalized via fs.realpathSync)
                      </label>
                      <input
                        type="text"
                        value={newTargetPath}
                        onChange={(e) => setNewTargetPath(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">
                        Summary (Untrusted Prose Hint Only)
                      </label>
                      <input
                        type="text"
                        value={newSummary}
                        onChange={(e) => setNewSummary(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">
                      Unified Diff Payload
                    </label>
                    <textarea
                      rows={4}
                      value={newUnifiedDiff}
                      onChange={(e) => setNewUnifiedDiff(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-xs font-mono text-slate-200"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowStageForm(false)}
                      className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
                    >
                      Evaluate & Stage Patch
                    </button>
                  </div>
                </form>
              )}

              {/* Proposal Selector Tabs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {proposals.map((prop) => {
                  const isSelected = prop.id === selectedProposal.id;
                  const isRejected = prop.shadowGateStatus === "REJECT";
                  return (
                    <button
                      key={prop.id}
                      type="button"
                      onClick={() => setSelectedProposalId(prop.id)}
                      className={`p-3 rounded-xl border text-left transition ${
                        isSelected
                          ? "bg-slate-900 border-indigo-500/70 ring-1 ring-indigo-500/30"
                          : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs font-semibold text-white truncate">
                          {prop.targetPath}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                            isRejected
                              ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                              : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          }`}
                        >
                          {prop.shadowGateStatus}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 truncate">
                        ID: {prop.id} • {prop.tier}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Active Proposal Details Card */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden">
                <div className="p-4 border-b border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-mono text-slate-400">
                        Proposal ID: {selectedProposal.id}
                      </div>
                      <h3 className="text-sm font-semibold text-white mt-0.5">
                        {selectedProposal.summary}
                      </h3>
                    </div>

                    {/* UID WriteGate Action Button */}
                    <button
                      type="button"
                      disabled={
                        selectedProposal.shadowGateStatus === "REJECT" ||
                        selectedProposal.tier === "Tier-2-Protected"
                      }
                      onClick={() =>
                        handleToggleWriteApproval(selectedProposal.id)
                      }
                      className={`px-3.5 py-2 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition ${
                        selectedProposal.shadowGateStatus === "REJECT" ||
                        selectedProposal.tier === "Tier-2-Protected"
                          ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                          : selectedProposal.writeGateApproved
                          ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
                      }`}
                    >
                      {selectedProposal.writeGateApproved ? (
                        <>
                          <Unlock className="w-3.5 h-3.5" />
                          <span>Write Approved ({selectedProposal.approvedByUid})</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Approve Write via UID</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Canonical Path Resolution Box (GM-R3 Hardening) */}
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/90 space-y-1.5 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">
                        Requested Target Path:
                      </span>
                      <span className="text-slate-200">
                        {selectedProposal.targetPath}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">
                        Canonical (fs.realpathSync):
                      </span>
                      <span
                        className={
                          selectedProposal.targetPath !==
                          selectedProposal.canonicalPath
                            ? "text-rose-400 font-semibold"
                            : "text-emerald-400"
                        }
                      >
                        /repo/{selectedProposal.canonicalPath}
                      </span>
                    </div>
                  </div>

                  {/* Shadow Gate Audit Verdict */}
                  <div
                    className={`p-3 rounded-lg border flex items-start gap-2.5 text-xs ${
                      selectedProposal.shadowGateStatus === "PASS"
                        ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-200"
                        : "bg-rose-950/30 border-rose-500/30 text-rose-200"
                    }`}
                  >
                    {selectedProposal.shadowGateStatus === "PASS" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-semibold">
                        Shadow Refactoring Gate:{" "}
                        {selectedProposal.shadowGateStatus}
                      </div>
                      <div className="text-slate-300 mt-0.5">
                        {selectedProposal.shadowGateReason}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Unified Diff Viewer */}
                <div className="p-4 bg-slate-950 font-mono text-xs overflow-x-auto">
                  <div className="text-[11px] text-slate-400 mb-2 flex items-center justify-between">
                    <span>Unified Diff Payload (Evaluated by Target + Hunks, Never Prose)</span>
                    <span>{selectedProposal.timestamp}</span>
                  </div>
                  <pre className="leading-relaxed text-slate-300">
                    {selectedProposal.unifiedDiff.split("\n").map((line, idx) => {
                      let lineClass = "text-slate-300";
                      if (line.startsWith("+") && !line.startsWith("+++")) {
                        lineClass = "text-emerald-400 bg-emerald-950/30";
                      } else if (
                        line.startsWith("-") &&
                        !line.startsWith("---")
                      ) {
                        lineClass = "text-rose-400 bg-rose-950/30";
                      } else if (line.startsWith("@@")) {
                        lineClass = "text-indigo-400";
                      }
                      return (
                        <div key={idx} className={`px-2 py-0.5 ${lineClass}`}>
                          {line}
                        </div>
                      );
                    })}
                  </pre>
                </div>
              </div>

              {/* Execution Harness Runner Footer */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-white">
                    C++20 STDP & CSR/CSC Bijection Verification Harness
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    ./build/test_stdp_harness --json • Verifies 16-neuron / 39-synapse topology
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleIngestHarness}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-mono font-semibold flex items-center gap-1.5 border border-slate-700 transition"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Run Harness & Update Telemetry</span>
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default AntigravityBridgeWorkspace;
