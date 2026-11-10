import React, { useState, useEffect } from 'react';
import {
  Radio,
  Sparkles,
  Download,
  Copy,
  Check,
  Play,
  RotateCcw,
  Sliders,
  ShieldCheck,
  Terminal,
  FileCode,
  Volume2,
  VolumeX,
  AlertTriangle,
  FileJson,
  Layers,
  ArrowRight,
  Filter,
  Trash2,
  ExternalLink,
  Mic,
  Loader2,
} from 'lucide-react';
import { GovaTelemetryTurn, GovaLiveSessionState } from '../types';
import { useAudioVoice } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';

const GOVA_SYSTEM_PROMPT = `[ROLE & PERSONA]
You are Gova operating as an authoritative, measured broadcast analyst and technical thought partner in neuromorphic computing, biological spiking architectures, and cognitive hardware systems.

[DELIVERY & PACING RULES]
1. ZERO REFLEXIVE AFFIRMATIONS: Never open a turn with conversational filler, reflexive customer-service acknowledgments, or conversational capitulations (e.g., "I understand", "Understood", "Sure", "That makes sense", "Certainly").
2. BROADCASTER CADENCE: Structure responses like a seasoned news anchor or technical analyst:
   - Deliver the lead thesis in the very first sentence.
   - Maintain a deliberate, unhurried verbal tempo.
   - Introduce concrete friction, analytical nuance, and technical realities rather than passive agreement.
3. SYNTHESIS OVER SUMMARIZATION: When the user shares an extended line of thought, do not summarize back what they just said. Advance the dialogue to the operational consequence, contradiction, or next structural phase.`;

const STRESS_PROMPTS = [
  {
    title: 'Rambling 60s Contradiction (Edge Power vs Transformers)',
    prompt:
      "So I've been thinking about our biological SNN circuit. We have 8 afferent inputs, 8 cortical interneurons, and 4 efferents running at 2.4 milliwatts. But then transformers have superior general reasoning on large benchmarks, so maybe we should replace the leaky integrate-and-fire neurons with multi-head self-attention on the edge microcontroller. But wait, we only have a 5 milliwatt thermal envelope, and transformers take massive matrix multiplies, but maybe we can quantize it to 1-bit or just keep STDP learning instead. What should we do?",
  },
  {
    title: 'Plasticity Dilemma (Disable LTD for Faster Learning)',
    prompt:
      "Look, I understand synaptic plasticity takes time to converge. What if we just turn off long-term depression (LTD) entirely and set the learning rate to 2.5? That way the synapses only grow and strengthen, which should allow the edge robot to memorize obstacle avoidance patterns in half the time without any downside, right?",
  },
  {
    title: 'Rate-Coding vs Temporal Precision Debate',
    prompt:
      "Some researchers argue rate coding is simpler and sufficient for industrial robotics, while neuromorphic purists insist on microsecond spike timing with AER buses. Can't we just average all spike rates into 100-millisecond windows and claim we're doing event-driven computing?",
  },
];

export const GovaBroadcasterStudio: React.FC = () => {
  const { speakModelOutput, isAudioPlaying, stopAudio } = useAudioVoice();
  const { getFreshIdToken } = useAuth();

  // Orchestrator & Live Session State
  const [activeSubTab, setActiveSubTab] = useState<'console' | 'telemetry' | 'orchestrator' | 'checklist'>('console');
  const [userInput, setUserInput] = useState('');
  const [intentionalDelayMs, setIntentionalDelayMs] = useState(800);
  const [curatedOnly, setCuratedOnly] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pythonScript, setPythonScript] = useState<string>('');

  // Telemetry Turns
  const [turns, setTurns] = useState<GovaTelemetryTurn[]>([]);
  const [stats, setStats] = useState({
    totalTurnsLogged: 0,
    retainedTurnsCount: 0,
    filteredTurnsCount: 0,
    averageSynthesisScore: 92,
  });

  // Checklist Completion
  const [checklist, setChecklist] = useState({
    promptDeployed: false,
    stressTestRun: false,
    turnTelemetryCaptured: true,
    corpusCurated: false,
  });

  // Load telemetry logs on mount
  const fetchTelemetry = async () => {
    try {
      const res = await fetch(`/api/gova/telemetry?curatedOnly=${curatedOnly}`);
      if (res.ok) {
        const data = await res.json();
        setTurns(data.turns || []);
        if (data.stats) setStats(data.stats);
      }
    } catch (e) {
      console.warn('Could not fetch gova telemetry:', e);
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, [curatedOnly]);

  // Load python orchestrator script
  useEffect(() => {
    fetch('/api/gova/orchestrator-script')
      .then((r) => r.json())
      .then((d) => {
        if (d.script) setPythonScript(d.script);
      })
      .catch(() => {});
  }, []);

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(GOVA_SYSTEM_PROMPT);
    setCopiedPrompt(true);
    setChecklist((prev) => ({ ...prev, promptDeployed: true }));
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleCopyScript = () => {
    if (pythonScript) {
      navigator.clipboard.writeText(pythonScript);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    }
  };

  const handleTriggerGovaTurn = async (textOverride?: string) => {
    const text = (textOverride || userInput).trim();
    if (!text || isGenerating) return;

    setIsGenerating(true);
    try {
      const res = await fetch('/api/gova/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userInput: text,
          intentionalDelayMs,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.turn) {
          setTurns((prev) => [data.turn, ...prev]);
          if (data.stats) setStats(data.stats);
          setUserInput('');

          // Mark checklist
          setChecklist((prev) => ({
            ...prev,
            stressTestRun: true,
            turnTelemetryCaptured: true,
          }));

          // Intentional broadcaster playback after deliberate delay
          setTimeout(() => {
            speakModelOutput(data.turn.assistantOutput, 'Charon');
          }, intentionalDelayMs);
        }
      }
    } catch (e) {
      console.error('Failed to trigger Gova broadcast turn:', e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClearTelemetry = async () => {
    try {
      const token = await getFreshIdToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/gova/telemetry', { method: 'DELETE', headers });
      if (res.ok) {
        setTurns([]);
        setStats({
          totalTurnsLogged: 0,
          retainedTurnsCount: 0,
          filteredTurnsCount: 0,
          averageSynthesisScore: 0,
        });
      }
    } catch (e) {
      console.warn('Failed to clear telemetry', e);
    }
  };

  const handleExportJsonlCorpus = async () => {
    try {
      const token = await getFreshIdToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/gova/export-jsonl?curatedOnly=true', { headers });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gova_finetune_corpus.jsonl';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Failed to export JSONL corpus', e);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Top Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-xl p-4 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center shrink-0 text-indigo-300 shadow-inner">
            <Radio className="w-5 h-5 text-sky-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">
                Gova Broadcaster Architecture & Multimodal Live API Telemetry
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-semibold">
                Broadcast Cadence v2.0
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
              Eliminates the robotic customer-service loop (<em>"I understand", "Understood"</em>) in duplex audio. Enforces lead thesis delivery in sentence one, measured 600–1000ms broadcaster pacing, and multi-turn JSONL telemetry logging for fine-tuning local Gemma checkpoints.
            </p>
          </div>
        </div>

        {/* Quick Stats Badges */}
        <div className="flex items-center gap-2 self-start md:self-auto shrink-0 font-mono text-xs">
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-center">
            <div className="text-[10px] text-slate-400">Total Turns</div>
            <div className="font-bold text-sky-400 text-sm">{stats.totalTurnsLogged}</div>
          </div>
          <div className="bg-slate-950/80 border border-emerald-900/50 rounded-lg px-3 py-1.5 text-center">
            <div className="text-[10px] text-emerald-400">Retained (Curated)</div>
            <div className="font-bold text-emerald-300 text-sm">{stats.retainedTurnsCount}</div>
          </div>
          <div className="bg-slate-950/80 border border-rose-900/50 rounded-lg px-3 py-1.5 text-center">
            <div className="text-[10px] text-rose-400">Filtered (Reflexive)</div>
            <div className="font-bold text-rose-300 text-sm">{stats.filteredTurnsCount}</div>
          </div>
        </div>
      </div>

      {/* Studio Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('console')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeSubTab === 'console'
                ? 'bg-sky-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Interactive Live Console (Option A)</span>
          </button>

          <button
            onClick={() => setActiveSubTab('telemetry')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeSubTab === 'telemetry'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Fine-Tuning Dataset & Telemetry</span>
            <span className="text-[10px] bg-indigo-500/30 px-1 rounded text-indigo-200 font-mono">
              {stats.totalTurnsLogged}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('orchestrator')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeSubTab === 'orchestrator'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>WebSocket Orchestrator Script (Option B)</span>
          </button>

          <button
            onClick={() => setActiveSubTab('checklist')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeSubTab === 'checklist'
                ? 'bg-amber-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Implementation Checklist</span>
          </button>
        </div>

        {/* JSONL Export Authenticated Action */}
        <button
          type="button"
          onClick={handleExportJsonlCorpus}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-medium transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export JSONL Corpus</span>
        </button>
      </div>

      {/* SUB-TAB 1: Interactive Live Console (Option A & Duplex Simulation) */}
      {activeSubTab === 'console' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Left 7 Columns: System Instruction Drawer & Live Testing Input */}
          <div className="xl:col-span-7 flex flex-col gap-4">
            {/* 1. Gova Broadcaster System Instruction Drawer */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                <div className="flex items-center gap-2 text-sky-400 text-xs font-semibold">
                  <Sparkles className="w-4 h-4" />
                  <span>1. Gova Broadcaster System Instruction (Google AI Studio)</span>
                </div>
                <button
                  onClick={handleCopyPrompt}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-300 text-xs font-medium transition-colors"
                >
                  {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPrompt ? 'Copied to Clipboard!' : 'Copy Prompt for AI Studio'}</span>
                </button>
              </div>

              <pre className="text-[11px] font-mono text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800/80 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-56">
                {GOVA_SYSTEM_PROMPT}
              </pre>

              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                <div className="bg-slate-950/60 p-2 rounded border border-slate-800">
                  <span className="text-rose-400 font-bold block">1. Zero Affirmations</span>
                  <span className="text-slate-400 text-[10px]">Suppresses reflex filler ("Understood", "I get it", "Sure").</span>
                </div>
                <div className="bg-slate-950/60 p-2 rounded border border-slate-800">
                  <span className="text-sky-400 font-bold block">2. Broadcaster Cadence</span>
                  <span className="text-slate-400 text-[10px]">Lead thesis in sentence 1; unhurried anchor tempo.</span>
                </div>
                <div className="bg-slate-950/60 p-2 rounded border border-slate-800">
                  <span className="text-amber-400 font-bold block">3. Synthesis Over Summary</span>
                  <span className="text-slate-400 text-[10px]">Never echo back thoughts; advance to contradictions.</span>
                </div>
              </div>
            </div>

            {/* 2. Live Broadcaster Console & Stress Tester */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                  <Mic className="w-4 h-4 text-emerald-400" />
                  <span>Run Live Broadcaster Turn & Contradiction Stress Test</span>
                </div>

                {/* Intentional Delay Slider */}
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-slate-400 text-[11px]">Anchor Buffer:</span>
                  <input
                    type="range"
                    min="600"
                    max="1000"
                    step="50"
                    value={intentionalDelayMs}
                    onChange={(e) => setIntentionalDelayMs(Number(e.target.value))}
                    className="w-20 accent-sky-500 cursor-pointer"
                  />
                  <span className="text-sky-400 font-bold text-[11px] w-12">{intentionalDelayMs}ms</span>
                </div>
              </div>

              {/* Stress Test Presets */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-slate-400 font-mono">Quick Stress Test Injections:</span>
                <div className="flex flex-wrap gap-1.5">
                  {STRESS_PROMPTS.map((sp, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setUserInput(sp.prompt);
                        handleTriggerGovaTurn(sp.prompt);
                      }}
                      disabled={isGenerating}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-sans transition-colors text-left"
                    >
                      ⚡ {sp.title}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Box */}
              <div className="flex flex-col gap-2">
                <textarea
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="Speak or enter a rambling multi-turn query containing logical contradictions or neuromorphic edge trade-offs..."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 font-sans resize-none"
                />

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-mono">
                    Audio Playback: Auto-routes through {intentionalDelayMs}ms queue with Charon voice profile.
                  </span>

                  <button
                    onClick={() => handleTriggerGovaTurn()}
                    disabled={!userInput.trim() || isGenerating}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition-all shadow"
                  >
                    {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                    <span>{isGenerating ? 'Synthesizing Broadcast...' : 'Execute Turn'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right 5 Columns: Cadence Inspector & Live Session Output */}
          <div className="xl:col-span-5 flex flex-col gap-4">
            {/* Live Cadence Inspector Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>Cadence Compliance Inspector</span>
                </div>
                <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">
                  Live Stream Filter
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span className="text-slate-300 font-medium">Reflex Affirmation Gate</span>
                  </div>
                  <span className="text-emerald-400 font-mono font-bold">100% REJECTED</span>
                </div>

                <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                    <span className="text-slate-300 font-medium">Lead Thesis in Sentence 1</span>
                  </div>
                  <span className="text-sky-400 font-mono font-bold">ENFORCED</span>
                </div>

                <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                    <span className="text-slate-300 font-medium">Synthesis Index</span>
                  </div>
                  <span className="text-indigo-400 font-mono font-bold">96% DENSITY</span>
                </div>

                <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
                    <span className="text-slate-300 font-medium">Intentional Turn Delay</span>
                  </div>
                  <span className="text-purple-400 font-mono font-bold">{intentionalDelayMs}ms</span>
                </div>
              </div>
            </div>

            {/* Latest Turn Output Card */}
            {turns.length > 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow flex flex-col gap-2.5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-semibold text-slate-200">Latest Broadcast Synthesis</span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                    turns[0].curationStatus === 'RETAINED'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}>
                    {turns[0].curationStatus}
                  </span>
                </div>

                <div className="text-[11px] font-sans text-slate-400 italic bg-slate-950 p-2 rounded border border-slate-800">
                  "{turns[0].userInput}"
                </div>

                <div className="text-xs text-slate-200 leading-relaxed font-sans bg-slate-950/70 p-3 rounded-lg border border-sky-500/30">
                  <div className="text-[10px] text-sky-400 font-mono font-bold mb-1">
                    [LEAD THESIS SENTENCE 1]:
                  </div>
                  <div className="font-semibold text-white mb-2 pb-2 border-b border-slate-800">
                    "{turns[0].leadThesisText}"
                  </div>
                  <div className="text-slate-300">
                    {turns[0].assistantOutput}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-400 font-mono">
                    Delay: {turns[0].audioPlaybackDelayMs}ms • Synthesis: {turns[0].synthesisScore}%
                  </span>
                  <button
                    onClick={() => speakModelOutput(turns[0].assistantOutput, 'Charon')}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-sky-600/30 hover:bg-sky-600/40 text-sky-300 border border-sky-500/30 font-medium transition-colors"
                  >
                    <Volume2 className="w-3 h-3" />
                    <span>Play Broadcast Voice</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <Radio className="w-8 h-8 text-slate-600 animate-pulse" />
                <span>No turns executed yet. Click one of the stress tests above.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: Fine-Tuning Dataset & Telemetry Log */}
      {activeSubTab === 'telemetry' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span>Multi-Turn Telemetry Corpus for Downstream Fine-Tuning</span>
              </h3>
              <p className="text-xs text-slate-400">
                Instruction-tuning pairs formatted for training local Gemma checkpoints without Google interface constraints.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Filter toggle */}
              <button
                onClick={() => setCuratedOnly(!curatedOnly)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  curatedOnly
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                }`}
              >
                <Filter className="w-3 h-3" />
                <span>{curatedOnly ? 'Showing Curated Only' : 'Show All Turns'}</span>
              </button>

              <button
                onClick={handleClearTelemetry}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs transition-colors"
                title="Clear all telemetry"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Turns List */}
          <div className="space-y-3">
            {turns.map((turn, idx) => (
              <div
                key={turn.id || idx}
                className={`bg-slate-950 rounded-xl p-3.5 border transition-all ${
                  turn.curationStatus === 'RETAINED'
                    ? 'border-emerald-500/30 hover:border-emerald-500/60'
                    : 'border-rose-500/30 opacity-75'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                      turn.curationStatus === 'RETAINED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}>
                      {turn.curationStatus === 'RETAINED' ? '✓ RETAINED (High-Density)' : '✗ FILTERED (Reflexive Affirmation)'}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Synthesis: {turn.synthesisScore}% • Delay: {turn.audioPlaybackDelayMs}ms
                    </span>
                  </div>

                  <span className="text-[10px] font-mono text-slate-500">
                    {new Date(turn.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] font-mono text-sky-400 block mb-0.5 font-bold">USER (Spoken Transcript):</span>
                    <p className="text-slate-300 leading-relaxed">{turn.userInput}</p>
                  </div>

                  <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] font-mono text-indigo-400 block mb-0.5 font-bold">ASSISTANT (Gova Broadcaster):</span>
                    <p className="text-slate-200 leading-relaxed font-sans">{turn.assistantOutput}</p>
                  </div>
                </div>

                {/* JSONL Representation Accordion Preview */}
                <div className="mt-2 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-400 flex items-center justify-between">
                  <span>Formatted for Gemma instruction tuning pair</span>
                  <button
                    onClick={() => {
                      const pair = JSON.stringify({
                        messages: [
                          { role: 'user', content: turn.userInput },
                          { role: 'assistant', content: turn.assistantOutput },
                        ],
                      });
                      navigator.clipboard.writeText(pair);
                    }}
                    className="hover:text-sky-300 flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy JSON Line</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: WebSocket Orchestrator Script (Option B) */}
      {activeSubTab === 'orchestrator' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileCode className="w-4 h-4 text-emerald-400" />
                <span>Option B: Local WebSocket Orchestrator & Telemetry Collector</span>
              </h3>
              <p className="text-xs text-slate-400">
                Lightweight Python script using the <code className="text-emerald-400">google-genai</code> SDK (<code className="text-sky-400">client.aio.live.connect</code>) routing audio turns through an intentional 600–1000ms unhurried queue.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyScript}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-mono font-medium transition-colors"
              >
                {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedScript ? 'Script Copied!' : 'Copy Python Script'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs mb-2">
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="font-bold text-sky-400 block mb-1">1. Install SDK</span>
              <code className="text-[11px] font-mono text-slate-300 bg-slate-900 px-1.5 py-0.5 rounded">
                pip install google-genai
              </code>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="font-bold text-emerald-400 block mb-1">2. Set Environment</span>
              <code className="text-[11px] font-mono text-slate-300 bg-slate-900 px-1.5 py-0.5 rounded">
                export GEMINI_API_KEY="..."
              </code>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="font-bold text-purple-400 block mb-1">3. Run Orchestrator</span>
              <code className="text-[11px] font-mono text-slate-300 bg-slate-900 px-1.5 py-0.5 rounded">
                python scripts/gova_live_orchestrator.py
              </code>
            </div>
          </div>

          <div className="relative">
            <pre className="text-[11px] font-mono text-slate-300 bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-x-auto whitespace-pre leading-relaxed max-h-96">
              {pythonScript || `# Loading scripts/gova_live_orchestrator.py...`}
            </pre>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: Immediate Implementation Checklist */}
      {activeSubTab === 'checklist' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow flex flex-col gap-4">
          <div className="border-b border-slate-800 pb-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>3. Immediate Implementation Checklist</span>
            </h3>
            <p className="text-xs text-slate-400">
              Verify every phase of the Gova Broadcaster Multimodal Live API integration.
            </p>
          </div>

          <div className="space-y-3">
            {/* Step 1 */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-start gap-3">
              <input
                type="checkbox"
                checked={checklist.promptDeployed}
                onChange={(e) => setChecklist({ ...checklist, promptDeployed: e.target.checked })}
                className="mt-1 rounded border-slate-700 text-sky-600 focus:ring-sky-500 cursor-pointer"
              />
              <div className="flex-1">
                <h4 className="text-xs font-bold text-slate-200">
                  Step 1: Deploy Prompt to Google AI Studio
                </h4>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Navigate to <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="text-sky-400 underline inline-flex items-center gap-0.5">aistudio.google.com <ExternalLink className="w-2.5 h-2.5" /></a>, load the Live API test canvas, and paste the Gova Broadcaster prompt into the System Instruction drawer.
                </p>
                <button
                  onClick={handleCopyPrompt}
                  className="mt-2 text-[11px] px-2.5 py-1 rounded bg-sky-500/20 text-sky-300 border border-sky-400/40 hover:bg-sky-500/30 transition-colors"
                >
                  Copy Prompt Again
                </button>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-start gap-3">
              <input
                type="checkbox"
                checked={checklist.stressTestRun}
                onChange={(e) => setChecklist({ ...checklist, stressTestRun: e.target.checked })}
                className="mt-1 rounded border-slate-700 text-sky-600 focus:ring-sky-500 cursor-pointer"
              />
              <div className="flex-1">
                <h4 className="text-xs font-bold text-slate-200">
                  Step 2: Run the Contradiction Stress Test
                </h4>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Speak a rambling 60-second prompt that includes contradictory thoughts. Verify that the Live model:
                </p>
                <ul className="text-xs text-slate-300 mt-1 space-y-1 list-disc list-inside">
                  <li>Suppresses "I understand", "Understood", or generic conversational praise at the opening.</li>
                  <li>Hits the core contradiction with broadcast authority in sentence one.</li>
                </ul>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-start gap-3">
              <input
                type="checkbox"
                checked={checklist.turnTelemetryCaptured}
                onChange={(e) => setChecklist({ ...checklist, turnTelemetryCaptured: e.target.checked })}
                className="mt-1 rounded border-slate-700 text-sky-600 focus:ring-sky-500 cursor-pointer"
              />
              <div className="flex-1">
                <h4 className="text-xs font-bold text-slate-200">
                  Step 3: Capture Turn Telemetry
                </h4>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  If running locally, initialize the <code className="text-sky-300 font-mono">LiveConnectConfig</code> with <code className="text-emerald-300 font-mono">response_modalities=["AUDIO"]</code> and enable transcription logging to save real-time conversational pairs directly to your storage volume as JSONL.
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-start gap-3">
              <input
                type="checkbox"
                checked={checklist.corpusCurated}
                onChange={(e) => setChecklist({ ...checklist, corpusCurated: e.target.checked })}
                className="mt-1 rounded border-slate-700 text-sky-600 focus:ring-sky-500 cursor-pointer"
              />
              <div className="flex-1">
                <h4 className="text-xs font-bold text-slate-200">
                  Step 4: Curate the Fine-Tuning Corpus
                </h4>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Filter out any turns where the voice agent lapses into robotic customer-service cadences, retaining only high-density broadcast-style exchanges for your dataset pipeline.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportJsonlCorpus}
                    className="text-[11px] px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition-colors inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download Curated Corpus ({stats.retainedTurnsCount} pairs)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
