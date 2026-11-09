import React, { useState, useEffect } from 'react';
import {
  Film,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Terminal,
  Activity,
  Cpu,
  UserCheck,
  UserX,
  Plus,
  Play,
  RotateCcw,
  Download,
  Copy,
  Check,
  Share2,
  Tv,
  List,
  Layers,
  Flame,
  Radio,
  Clock,
  DollarSign,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import {
  NovaVaultAgent,
  NovaVaultGovernance,
  NovaVaultTopicTicket,
  SparkDialogueStep,
  CandidateAgentHire,
  AnimatedShortProject,
} from '../types';
import { ThreeShortsPlayer } from './ThreeShortsPlayer';

export function NovaVaultStudioPanel() {
  const [governance, setGovernance] = useState<NovaVaultGovernance>({
    require_human_approval_for_hires: true,
    auto_stop_on_budget_limit: true,
    current_spend_usd: 0.0,
    max_budget_usd: 0.0,
    totalTicketsCreated: 24,
    totalShortsPublished: 12,
  });

  const [agents, setAgents] = useState<NovaVaultAgent[]>([]);
  const [dialogueLogs, setDialogueLogs] = useState<SparkDialogueStep[]>([]);
  const [tickets, setTickets] = useState<NovaVaultTopicTicket[]>([]);
  const [candidateHires, setCandidateHires] = useState<CandidateAgentHire[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedMetadata, setCopiedMetadata] = useState(false);

  // New hire modal state
  const [showHireModal, setShowHireModal] = useState(false);
  const [hireName, setHireName] = useState('');
  const [hireRole, setHireRole] = useState<'Animator' | 'SoundDesigner'>('Animator');
  const [hireRuntime, setHireRuntime] = useState<'HTTP' | 'Bash'>('HTTP');
  const [hireEndpoint, setHireEndpoint] = useState('http://localhost:4000/api/heartbeat');
  const [hireDesc, setHireDesc] = useState('');

  // Selected opposites for ticket creation
  const [selectedOpposites, setSelectedOpposites] = useState<[string, string]>(['Big', 'Tiny']);
  const [themeMode, setThemeMode] = useState<string>('cartoon_meadow');

  // Active project being rendered in 3D player
  const [activeProject, setActiveProject] = useState<AnimatedShortProject>({
    id: 'proj_default',
    title: 'Big vs Tiny! 3D Kids Opposites',
    topic: 'Big vs Tiny',
    targetDurationSec: 30,
    scenes: [
      {
        id: 'sc_1',
        timestampStart: 0,
        timestampEnd: 6,
        title: 'The Mystery Hook',
        narration: 'Wait! Look at this! Is it BIG or is it TINY?!',
        kineticCaptions: ['WAIT!', 'LOOK AT THIS!', 'IS IT BIG?', 'OR IS IT TINY?!'],
        characterA_Action: 'surprised_look',
        characterB_Action: 'side_bounce',
        cameraMode: 'hook_close',
        sfxCue: 'whoosh',
        environmentTheme: 'cartoon_meadow',
      },
      {
        id: 'sc_2',
        timestampStart: 6,
        timestampEnd: 13,
        title: 'Meet Character 1: BIG',
        narration: 'WHOA! Look how super giant and mighty it is! STOMP!',
        kineticCaptions: ['WHOA!', 'SUPER GIANT!', 'FEEL THE STOMP!'],
        characterA_Action: 'giant_stomp',
        characterB_Action: 'tremble',
        cameraMode: 'wide_stage',
        sfxCue: 'stomp_rumble',
        environmentTheme: 'cartoon_meadow',
      },
      {
        id: 'sc_3',
        timestampStart: 13,
        timestampEnd: 20,
        title: 'Meet Character 2: TINY',
        narration: 'Now zoom in! Down here... it is so tiny and speedy! Boing!',
        kineticCaptions: ['ZOOM IN!', 'SO TINY!', 'BOING BOING BOING!'],
        characterA_Action: 'idle_bob',
        characterB_Action: 'rocket_leap',
        cameraMode: 'split_comparison',
        sfxCue: 'boing',
        environmentTheme: 'cartoon_meadow',
      },
      {
        id: 'sc_4',
        timestampStart: 20,
        timestampEnd: 26,
        title: 'The Great Opposites Challenge',
        narration: 'Can they work together? Push, lift, balance! WOW, they did it!',
        kineticCaptions: ['CAN THEY DO IT?!', 'PUSH!', 'LIFT!', 'THEY DID IT!'],
        characterA_Action: 'squash_jump',
        characterB_Action: 'speed_dash',
        cameraMode: 'hero_low',
        sfxCue: 'sparkle',
        environmentTheme: 'cartoon_meadow',
      },
      {
        id: 'sc_5',
        timestampStart: 26,
        timestampEnd: 30,
        title: 'Retention Call To Action',
        narration: 'Which one are YOU today? Comment below and subscribe for more 3D adventures!',
        kineticCaptions: ['WHICH ARE YOU?', 'COMMENT BELOW!', 'SUBSCRIBE NOW!'],
        characterA_Action: 'celebrate_spin',
        characterB_Action: 'wave_hands',
        cameraMode: 'wide_stage',
        sfxCue: 'fanfare',
        environmentTheme: 'cartoon_meadow',
      },
    ],
    youtubeMetadata: {
      title: 'Big vs Tiny! 3D Cartoon Opposites for Kids 🐘✨ #Shorts',
      description: 'Learn opposites with 3D animated friends! 24/7 educational animation by NovaVault Media Studio using zero-cost AI pipelines. Subscribe for daily 3D cartoon learning!\n\n#Shorts #KidsAnimation #3DAnimation #Opposites',
      hashtags: ['#Shorts', '#KidsAnimation', '#3DAnimation', '#Opposites'],
      tags: ['kids animation', 'opposites for toddlers', '3d cartoon shorts', 'kids learning video', 'zero cost ai studio'],
      retentionHook: 'Pattern interrupt at 0s + question tease resolved at 24s',
      thumbnailPrompt: 'Cute 3D stylized cartoon character duo illustrating opposites, Pixar style, bright colorful lighting, vertical 9:16',
      ctrPrediction: '14.2% Estimated CTR',
    },
    zeroCostScore: '100% Free Tier (Gemini Flash + WebGL + Web Audio)',
    createdAt: Date.now(),
  });

  // Fetch initial studio status
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/novavault/status');
      if (res.ok) {
        const data = await res.json();
        setGovernance(data.governance);
        setAgents(data.agents || []);
        setDialogueLogs(data.dialogueLogs || []);
        setTickets(data.tickets || []);
        setCandidateHires(data.candidateHires || []);
      }
    } catch (_e) {
      // Fallback
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  // Ping All Heartbeats
  const handlePingHeartbeats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/novavault/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggeredBy: 'Board (Human) UI' }),
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch (_e) {
      // Error handling
    } finally {
      setLoading(false);
    }
  };

  // Dispatch New Topic Ticket
  const handleDispatchTicket = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/novavault/dispatch-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: `Kids Animation Opposites: ${selectedOpposites[0]} vs ${selectedOpposites[1]}`,
          oppositesPair: selectedOpposites,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        // Also trigger render of the short!
        await handleRenderShort(data.ticket.id, selectedOpposites);
        await fetchStatus();
      }
    } catch (_e) {
      // Error handling
    } finally {
      setLoading(false);
    }
  };

  // Render 30s Short
  const handleRenderShort = async (ticketId?: string, pair?: [string, string]) => {
    setLoading(true);
    try {
      const res = await fetch('/api/novavault/generate-short', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          oppositesPair: pair || selectedOpposites,
          environmentTheme: themeMode,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.project) {
          setActiveProject(data.project);
        }
        await fetchStatus();
      }
    } catch (_e) {
      // Error handling
    } finally {
      setLoading(false);
    }
  };

  // Human Board Hires Decision
  const handleHireDecision = async (candidateId: string, decision: 'APPROVE' | 'REJECT') => {
    try {
      const res = await fetch('/api/novavault/hires/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId, decision }),
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch (_e) {
      // Error handling
    }
  };

  // Propose New Hire
  const handleProposeHire = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hireName || !hireDesc) return;
    try {
      const res = await fetch('/api/novavault/hires/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: hireName,
          role: hireRole,
          reports_to: 'Synapse_CEO',
          runtime: hireRuntime,
          commandOrEndpoint: hireEndpoint,
          job_description: hireDesc,
          monthly_budget_usd: 0.0,
        }),
      });
      if (res.ok) {
        setShowHireModal(false);
        setHireName('');
        setHireDesc('');
        await fetchStatus();
      }
    } catch (_e) {
      // Error handling
    }
  };

  const oppositesPresets: [string, string][] = [
    ['Big', 'Tiny'],
    ['Hot', 'Cold'],
    ['Fast', 'Slow'],
    ['Heavy', 'Light'],
    ['Loud', 'Quiet'],
    ['Up', 'Down'],
  ];

  const bashScriptContent = `#!/usr/bin/env bash
set -e

mkdir -p ~/NovaVault_Workspace && cd ~/NovaVault_Workspace

echo "1. Cloning Paperclip Control Plane (Node.js + React UI)..."
git clone https://github.com/paperclipai/paperclip.git

echo "2. Cloning YouTube Automation Agent (AgentTube)..."
git clone https://github.com/darkzOGx/youtube-automation-agent.git

echo "3. Cloning Cua (Open-Source Computer-Use 2.0)..."
git clone https://github.com/trycua/cua.git

echo "4. Checking Agent-Reach environment..."
# Verify Agent-Reach channels (Twitter/X, Reddit, YouTube, GitHub, Bilibili, XiaoHongShu)
if command -v agent-reach &> /dev/null; then
    agent-reach doctor
fi

echo "5. Installing & starting YouTube Automation Agent walk-through..."
cd ~/NovaVault_Workspace/youtube-automation-agent
npm install

echo "✅ Stack cloned! Set your GEMINI_API_KEY, run 'npx paperclipai' in one terminal, and 'npm start' inside youtube-automation-agent in another."
`;

  return (
    <div className="flex flex-col gap-6 text-slate-100 pb-16">
      {/* Studio Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-purple-600 text-white shadow-lg shadow-purple-600/30">
                <Film className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                  <span>NovaVault Media Studio</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    24/7 AUTONOMOUS 3D AGENCY
                  </span>
                </h1>
                <p className="text-xs text-slate-300 mt-0.5">
                  Create, optimize, and publish interactive 30-second 3D animated YouTube Shorts 24/7 using zero-cost APIs.
                </p>
              </div>
            </div>

            {/* Governance Badges */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900/80 border border-emerald-500/30 text-emerald-300 font-mono">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <span>Monthly Budget: $0.00 / $0.00 Max (Zero-Cost Hard Lock)</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900/80 border border-sky-500/30 text-sky-300 font-mono">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                <span>Human Approval For Hires: ENFORCED</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900/80 border border-purple-500/30 text-purple-300 font-mono">
                <Activity className="w-3.5 h-3.5 text-purple-400" />
                <span>Auto-Stop on Budget: ACTIVE</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3 text-center">
              <span className="text-[10px] text-slate-400 font-mono block">SHORTS PUBLISHED</span>
              <span className="text-2xl font-black text-amber-300">{governance.totalShortsPublished}</span>
              <span className="text-[9px] text-emerald-400 block">24/7 Continuous Loop</span>
            </div>
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3 text-center">
              <span className="text-[10px] text-slate-400 font-mono block">TOPIC TICKETS</span>
              <span className="text-2xl font-black text-sky-300">{governance.totalTicketsCreated}</span>
              <span className="text-[9px] text-sky-400 block">Orchestrator Dispatched</span>
            </div>
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3 text-center col-span-2 sm:col-span-1">
              <span className="text-[10px] text-slate-400 font-mono block">API COST USD</span>
              <span className="text-2xl font-black text-emerald-400 font-mono">$0.00</span>
              <span className="text-[9px] text-slate-400 block">Zero-Cost Tier Guarantee</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Left 3D Shorts Player / Right Production Studio & Control Plane */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Interactive 30-Second 3D Shorts Player (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tv className="w-4 h-4 text-rose-400" />
              <h2 className="font-bold text-sm text-slate-200">Interactive 3D Shorts Player</h2>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              30-Second WebGL Animation
            </span>
          </div>

          <ThreeShortsPlayer project={activeProject} />

          {/* Opposites Topic Picker & Instant Render Button */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200">Select Educational Opposites Pair</span>
              <span className="text-[10px] font-mono text-purple-400">Zero-Cost Gemini + 3D WebGL</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {oppositesPresets.map(pair => {
                const isSelected = selectedOpposites[0] === pair[0] && selectedOpposites[1] === pair[1];
                return (
                  <button
                    key={`${pair[0]}-${pair[1]}`}
                    onClick={() => setSelectedOpposites(pair)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex flex-col items-center ${
                      isSelected
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 ring-1 ring-purple-400'
                        : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <span>{pair[0]} vs {pair[1]}</span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => handleRenderShort(undefined, selectedOpposites)}
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-purple-600/30 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Generate & Render 30s 3D Short ({selectedOpposites[0]} vs {selectedOpposites[1]})</span>
            </button>
          </div>
        </div>

        {/* Right Column: Paperclip Control Plane Org Chart & SPARK Steps (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* 1. Paperclip Autonomous Company Org Chart */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <h3 className="font-bold text-sm text-slate-200">Paperclip AI Autonomous Org Chart</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePingHeartbeats}
                  disabled={loading}
                  className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-sky-300 font-mono transition cursor-pointer flex items-center gap-1.5"
                >
                  <Activity className="w-3.5 h-3.5 text-sky-400" />
                  <span>Ping All Heartbeats</span>
                </button>
                <button
                  onClick={() => setShowHireModal(true)}
                  className="px-3 py-1 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs text-white font-semibold transition cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Propose Hire</span>
                </button>
              </div>
            </div>

            {/* Board (Human) Governance Card */}
            <div className="bg-slate-950/80 border border-indigo-500/40 rounded-xl p-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/50 flex items-center justify-center text-indigo-300 font-bold">
                  👑
                </div>
                <div>
                  <div className="font-bold text-slate-100 flex items-center gap-2">
                    <span>Board (Human)</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300">
                      GOVERNANCE AUTHORITY
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Controls budget ceiling ($0.00), approves new hires, and audits SPARK_DIALOGUE_STEP forensic logs.
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/30">
                ACTIVE SUPERVISOR
              </span>
            </div>

            {/* Agent Hierarchy Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Synapse_CEO */}
              <div className="bg-slate-950/60 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5 transition">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>🧠</span> Synapse_CEO
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">
                      HTTP :8080
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono block">Role: CEO • Reports to Board</span>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Coordinates topic tickets through SparkNovaOrchestrator and logs every SPARK_DIALOGUE_STEP.
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>Polyvagal: <strong className="text-emerald-400">ventral</strong></span>
                  <span>Budget: <strong className="text-emerald-400">$0.00</strong></span>
                </div>
              </div>

              {/* Reach_Scout */}
              <div className="bg-slate-950/60 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5 transition">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>🔍</span> Reach_Scout
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                      Bash Runtime
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono block">Role: Marketer • Reports to CEO</span>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Scans YouTube & Reddit for high-retention educational concepts using zero paid APIs.
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>Tool: <strong className="text-amber-400">agent-reach</strong></span>
                  <span>Budget: <strong className="text-emerald-400">$0.00</strong></span>
                </div>
              </div>

              {/* AgentTube_Producer */}
              <div className="bg-slate-950/60 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5 transition">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>🎬</span> AgentTube_Producer
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">
                      HTTP :3456
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono block">Role: Engineer • Reports to CEO</span>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Runs youtube-automation-agent to generate 3D character shorts, optimize metadata, and queue uploads.
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>Stack: <strong className="text-rose-400">Three.js / 3D</strong></span>
                  <span>Budget: <strong className="text-emerald-400">$0.00</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Governance Candidate Hires Requiring Human Board Approval */}
          {candidateHires.length > 0 && (
            <div className="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs font-bold text-amber-200">
                    Governance Queue: Pending Human Board Approval for Hires
                  </h4>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  require_human_approval_for_hires: true
                </span>
              </div>

              {candidateHires.map(cand => (
                <div
                  key={cand.id}
                  className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-100 text-xs">{cand.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300">
                        {cand.role}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        Runtime: {cand.runtime}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {cand.job_description}
                    </p>
                    <div className="text-[10px] text-amber-400/90 italic">
                      Reason: {cand.reason} • Monthly Cost: ${cand.monthly_budget_usd.toFixed(2)} (Zero-Cost API compliant)
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {cand.status === 'PENDING_APPROVAL' ? (
                      <>
                        <button
                          onClick={() => handleHireDecision(cand.id, 'APPROVE')}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1 shadow-md shadow-emerald-600/20"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Approve Hire</span>
                        </button>
                        <button
                          onClick={() => handleHireDecision(cand.id, 'REJECT')}
                          className="px-3 py-1.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </>
                    ) : (
                      <span className={`text-xs font-mono font-bold px-2 py-1 rounded ${
                        cand.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                      }`}>
                        {cand.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 3. Live SPARK_DIALOGUE_STEP Forensic Audit Stream */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-sm text-slate-200">SPARK_DIALOGUE_STEP Forensic Stream</h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                Live Audit Logs ({dialogueLogs.length} events)
              </span>
            </div>

            <div className="h-44 overflow-y-auto font-mono text-xs space-y-1.5 pr-1 bg-slate-950 p-3 rounded-xl border border-slate-800/80">
              {dialogueLogs.map(log => (
                <div key={log.id} className="text-slate-300 flex items-start gap-2 leading-relaxed">
                  <span className="text-slate-500 text-[10px] shrink-0">
                    [{new Date(log.timestamp).toLocaleTimeString()}]
                  </span>
                  <span className="text-sky-400 font-bold shrink-0">
                    t:{log.tick}
                  </span>
                  <span className="text-purple-400 shrink-0">
                    [{log.sender} ➔ {log.receiver}]:
                  </span>
                  <span className="text-slate-200">
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 4. YouTube Shorts SEO & Viral Metadata Inspector */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm text-slate-200">YouTube Shorts Viral SEO & Metadata</h3>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(activeProject.youtubeMetadata, null, 2));
                  setCopiedMetadata(true);
                  setTimeout(() => setCopiedMetadata(false), 2000);
                }}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 transition cursor-pointer"
              >
                {copiedMetadata ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedMetadata ? 'Copied' : 'Copy SEO Bundle'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] font-mono text-slate-400 block">OPTIMIZED YOUTUBE SHORTS TITLE</span>
                <p className="font-bold text-amber-300 leading-snug">
                  {activeProject.youtubeMetadata.title}
                </p>
                <div className="text-[10px] font-mono text-emerald-400 pt-1">
                  CTR Prediction: {activeProject.youtubeMetadata.ctrPrediction}
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] font-mono text-slate-400 block">RETENTION HOOK STRATEGY</span>
                <p className="text-slate-300 leading-snug">
                  {activeProject.youtubeMetadata.retentionHook}
                </p>
                <div className="flex flex-wrap gap-1 pt-1">
                  {activeProject.youtubeMetadata.hashtags.map(tag => (
                    <span key={tag} className="text-[10px] font-mono text-sky-400 bg-sky-500/10 px-1.5 py-0.2 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 5. Autonomous Workspace Bash Script (~/NovaVault_Workspace) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-sky-400" />
                <h3 className="font-bold text-sm text-slate-200">Local Autonomous Stack Setup Script</h3>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(bashScriptContent);
                  setCopiedScript(true);
                  setTimeout(() => setCopiedScript(false), 2000);
                }}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 transition cursor-pointer"
              >
                {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedScript ? 'Copied' : 'Copy Script'}</span>
              </button>
            </div>

            <pre className="p-3 bg-slate-950 text-sky-300 font-mono text-xs rounded-xl overflow-x-auto border border-slate-800 max-h-40 leading-relaxed">
              {bashScriptContent}
            </pre>
            <p className="text-[11px] text-slate-400">
              Run this script on any machine or VPS to mount the Paperclip Control Plane, AgentTube YouTube automation agent, Cua, and agent-reach pipelines.
            </p>
          </div>
        </div>
      </div>

      {/* Propose Hire Modal */}
      {showHireModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-purple-400" />
                <h3 className="text-base font-bold text-white">Propose Candidate Agent Hire</h3>
              </div>
              <button
                onClick={() => setShowHireModal(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Governance Enforcement: All proposed agent hires are queued as <strong className="text-amber-400">PENDING_HUMAN_APPROVAL</strong> and must be ratified by the Human Board. Monthly budget is strictly locked to $0.00.
            </p>

            <form onSubmit={handleProposeHire} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-mono text-[10px] uppercase mb-1">Agent Name</label>
                <input
                  type="text"
                  placeholder="e.g. CartoonShader_Agent"
                  value={hireName}
                  onChange={e => setHireName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-hidden focus:border-purple-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 font-mono text-[10px] uppercase mb-1">Role</label>
                  <select
                    value={hireRole}
                    onChange={e => setHireRole(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-hidden"
                  >
                    <option value="Animator">Animator</option>
                    <option value="SoundDesigner">SoundDesigner</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-mono text-[10px] uppercase mb-1">Runtime</label>
                  <select
                    value={hireRuntime}
                    onChange={e => setHireRuntime(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-hidden"
                  >
                    <option value="HTTP">HTTP Endpoint</option>
                    <option value="Bash">Bash CLI</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-mono text-[10px] uppercase mb-1">Endpoint or Command</label>
                <input
                  type="text"
                  value={hireEndpoint}
                  onChange={e => setHireEndpoint(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 font-mono text-[10px] uppercase mb-1">Job Description & Rationale</label>
                <textarea
                  rows={2}
                  placeholder="Provide rationale for 24/7 autonomous shorts generation under zero-cost budget..."
                  value={hireDesc}
                  onChange={e => setHireDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-hidden"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowHireModal(false)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition shadow-lg shadow-purple-600/30"
                >
                  Submit For Board Ratification
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
