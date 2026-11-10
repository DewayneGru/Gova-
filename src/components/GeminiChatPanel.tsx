import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, HardwareTelemetry } from '../types';
import { MessageSquare, Send, Bot, User, Sparkles, Zap, Cpu, Brain, Loader2, Volume2, VolumeX } from 'lucide-react';
import { AudioListenButton } from './AudioListenButton';
import { useAudioVoice } from '../context/AudioContext';

interface GeminiChatPanelProps {
  telemetry: HardwareTelemetry;
}

export const GeminiChatPanel: React.FC<GeminiChatPanelProps> = ({ telemetry }) => {
  const { autoAudioReadout, setAutoAudioReadout, preferredVoice, speakModelOutput, isAudioPlaying, stopAudio } = useAudioVoice();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      role: 'assistant',
      content:
        'Greetings. I am your Neuromorphic Systems Copilot powered by Gemini 3.8 Flash wrapped with both the Gemini Spark Wrapper (Lateral Hypothesis Ignition, Multi-Agent SPARK_DIALOGUE_STEP Orchestration & Emergent Code Catalysis) and the Gemini 3.1 Pro Reasoning & Coding Skills Wrapper. Every response combines 3.8 Flash speed, Gemini Spark creative catalysis, and 3.1 Pro formal mathematical & coding verification. How can I assist your biological SNN and signal processing pipeline today?',
      timestamp: Date.now(),
      modelUsed: 'gemini-3.8-flash (3.1 Pro + Gemini Spark Wrapper)',
      roleUsed: 'neuromorphic_architect',
    },
  ]);

  const [inputMessage, setInputMessage] = useState('');
  const [modelTier, setModelTier] = useState<'fast' | 'general' | 'complex'>('general');
  const [selectedRole, setSelectedRole] = useState<'neuromorphic_architect' | 'plasticity_researcher' | 'edge_firmware_engineer' | 'gova_broadcaster'>('neuromorphic_architect');
  const [attachTelemetry, setAttachTelemetry] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputMessage;
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
      modelTier,
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputMessage('');
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          modelTier,
          role: selectedRole,
          edgeTelemetry: attachTelemetry
            ? {
                powerMw: telemetry.powerMw,
                latencyMs: telemetry.aerLatencyMs,
                synapticOpsPerSec: telemetry.synapticOpsPerSec,
                weightDeltaSum: telemetry.cumulativeSTDPDelta,
                activeSpikeCount: telemetry.totalSpikesEmitted,
              }
            : undefined,
        }),
      });

      if (!response.ok) {
        let errorText = `HTTP ${response.status}`;
        try {
          const errData = await response.json();
          errorText = errData.error || errorText;
        } catch (_) {}

        // Format clean human-readable error if upstream is busy
        if (errorText.includes('503') || errorText.includes('high demand') || errorText.includes('UNAVAILABLE')) {
          errorText = 'The model is currently experiencing high upstream demand. Spikes in demand are usually temporary. Please click retry.';
        }
        throw new Error(errorText);
      }

      const data = await response.json();
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.text,
        timestamp: Date.now(),
        modelTier,
        modelUsed: data.modelUsed,
        roleUsed: data.roleUsed,
        govaCadenceAudit: data.govaCadenceAudit,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Automatic Audio Readout of model outputs if enabled
      if (autoAudioReadout && data.text) {
        const voice =
          data.roleUsed === 'gova_broadcaster'
            ? 'Charon'
            : data.roleUsed === 'plasticity_researcher'
            ? 'Zephyr'
            : data.roleUsed === 'edge_firmware_engineer'
            ? 'Puck'
            : preferredVoice || 'Kore';
        speakModelOutput(data.text, voice);
      }
    } catch (err: any) {
      // Avoid firing console.error to keep the test environment clean
      console.warn('Chat request notice:', err?.message || err);
      let displayError = err?.message || 'Error communicating with neuromorphic model';
      if (typeof displayError === 'string' && displayError.startsWith('{')) {
        try {
          const parsed = JSON.parse(displayError);
          if (parsed?.error?.message) {
            displayError = parsed.error.message;
          }
        } catch (_) {}
      }
      setErrorMsg(displayError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const promptSuggestions = [
    'Help the model: I recommend calibrating association gain and counteracting STDP drift',
    'Analyze our live 8.2 pJ/SOP edge power consumption and suggest optimizations',
    'How does biological STDP balance LTP and LTD to prevent catastrophic runaway?',
    'Synthesize an asynchronous AER crossbar specification for low-latency temporal pattern classification',
    'Estimate battery lifetime for a 500mAh LiPo on our current mW telemetry draw',
  ];

  return (
    <div id="gemini-chatbot-panel" className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-[560px] shadow">
      {/* Header with Model Tier & Role Selector */}
      <div className="pb-3 border-b border-slate-800 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <MessageSquare className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              Gemini 3.8 Flash Neuromorphic Copilot
            </h3>
            <span className="text-[10px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded font-semibold">
              3.1 Pro Reasoning & Coding Wrapper
            </span>
            <span className="text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5 text-amber-400" />
              Gemini Spark Wrapper
            </span>
          </div>

          {/* Model Tier Selector */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setModelTier('fast')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                modelTier === 'fast'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="gemini-3.8-flash (Low Thinking) with Gemini Spark + 3.1 Pro Wrapper"
            >
              <Zap className="w-3 h-3" />
              3.8 Flash (Fast)
            </button>
            <button
              onClick={() => setModelTier('general')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                modelTier === 'general'
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="gemini-3.8-flash (Medium Thinking) with Gemini Spark + 3.1 Pro Reasoning & Coding Wrapper"
            >
              <Sparkles className="w-3 h-3" />
              3.8 + Spark (General)
            </button>
            <button
              onClick={() => setModelTier('complex')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                modelTier === 'complex'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="gemini-3.8-flash (High Thinking) + Gemini Spark Ignition + 3.1 Pro Deep Reasoning & Coding Wrapper"
            >
              <Cpu className="w-3 h-3" />
              3.8 + 3.1 Pro + Spark (Deep)
            </button>
          </div>
        </div>

        {/* Active 3.1 Pro + Gemini Spark Wrapper Skills Strip */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/80 border border-indigo-500/25 rounded-lg px-2.5 py-1.5 text-[10px] font-mono">
          <span className="text-indigo-300 font-bold flex items-center gap-1">
            <Brain className="w-3 h-3 text-indigo-400" />
            3.1 Pro + Spark Skills:
          </span>
          <span className="bg-slate-900 border border-amber-500/30 px-1.5 py-0.5 rounded text-amber-300">
            ⚡ Spark Lateral Hypothesis Ignition
          </span>
          <span className="bg-slate-900 border border-amber-500/30 px-1.5 py-0.5 rounded text-amber-200">
            ⚡ Spark Multi-Agent Orchestrator
          </span>
          <span className="bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-sky-300">
            Causal & Differential Reasoning
          </span>
          <span className="bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-emerald-300">
            Emergent Code & Diff Catalysis
          </span>
          <span className="bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-purple-300">
            Ghost Protocol Self-Audit
          </span>
        </div>

        {/* Role & Telemetry Context Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[11px]">System Role:</span>
            <select
              value={selectedRole}
              onChange={(e: any) => setSelectedRole(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="neuromorphic_architect">Elena Vance (Neuromorphic Silicon Architect)</option>
              <option value="plasticity_researcher">Marcus Zhang (Synaptic Plasticity Researcher)</option>
              <option value="edge_firmware_engineer">Alex Rivera (Edge Neuromorphic Systems Engineer)</option>
              <option value="gova_broadcaster">🎙️ Gova (Authoritative Broadcaster & Thought Partner)</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            {/* Auto Audio Readout Switch */}
            <button
              onClick={() => {
                if (isAudioPlaying) stopAudio();
                setAutoAudioReadout((prev: boolean) => !prev);
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                autoAudioReadout
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
              }`}
              title={autoAudioReadout ? 'Auto Audio Readout Active: Assistant responses are spoken aloud automatically' : 'Auto Audio Readout Off'}
            >
              {autoAudioReadout ? (
                <Volume2 className="w-3 h-3 text-emerald-400" />
              ) : (
                <VolumeX className="w-3 h-3 text-slate-400" />
              )}
              <span>Auto Audio: {autoAudioReadout ? 'ON' : 'OFF'}</span>
            </button>

            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 text-[11px]">
              <input
                type="checkbox"
                checked={attachTelemetry}
                onChange={(e) => setAttachTelemetry(e.target.checked)}
                className="rounded border-slate-700 text-sky-600 focus:ring-sky-500"
              />
              <span>Inject Live Device Telemetry ({telemetry.powerMw}mW)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Scrollable Conversation Thread */}
      <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1 text-xs">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center shrink-0 text-sky-300 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-slate-200 ${
                msg.role === 'user'
                  ? 'bg-sky-600 text-white rounded-br-xs'
                  : 'bg-slate-800/90 border border-slate-700/70 rounded-bl-xs leading-relaxed whitespace-pre-wrap'
              }`}
            >
              <div>{msg.content}</div>

              {msg.role === 'assistant' && (
                <div className="mt-2 pt-1.5 border-t border-slate-700/60 flex flex-col gap-1.5">
                  {/* Gova Cadence Compliance Audit Badge */}
                  {msg.govaCadenceAudit && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono bg-slate-900/80 px-2 py-1 rounded border border-slate-700/80">
                      <span className="text-amber-400 font-bold">🎙️ Gova Audit:</span>
                      <span className={`px-1.5 py-0.2 rounded ${!msg.govaCadenceAudit.hasReflexiveAffirmation ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                        {!msg.govaCadenceAudit.hasReflexiveAffirmation ? '✓ Zero Affirmations' : '✗ Affirmation Detected'}
                      </span>
                      <span className={`px-1.5 py-0.2 rounded ${msg.govaCadenceAudit.leadThesisDelivered ? 'bg-sky-500/20 text-sky-300' : 'bg-amber-500/20 text-amber-300'}`}>
                        {msg.govaCadenceAudit.leadThesisDelivered ? '✓ Lead Thesis S1' : '⚠️ Lead Delayed'}
                      </span>
                      <span className="text-slate-400">
                        Synthesis: <strong className="text-emerald-400">{msg.govaCadenceAudit.synthesisScore}%</strong>
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[9px] font-mono text-slate-400 flex items-center gap-1.5">
                      {msg.modelUsed && <span>Model: {msg.modelUsed}</span>}
                      {msg.roleUsed && (
                        <>
                          <span>•</span>
                          <span>Role: {msg.roleUsed.replace('_', ' ')}</span>
                        </>
                      )}
                    </div>

                    <AudioListenButton
                      text={msg.content}
                      voice={
                        msg.roleUsed === 'gova_broadcaster'
                          ? 'Charon'
                          : msg.roleUsed === 'plasticity_researcher'
                          ? 'Zephyr'
                          : msg.roleUsed === 'edge_firmware_engineer'
                          ? 'Puck'
                          : 'Kore'
                      }
                      label="Listen"
                    />
                  </div>
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-slate-300 mt-0.5">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
            <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
            <span>
              Consulting Gemini 3.8 Flash wrapped with Gemini Spark + 3.1 Pro Reasoning & Coding Skills (
              {modelTier === 'complex' ? 'High Thinking' : modelTier === 'fast' ? 'Low Thinking' : 'Medium Thinking'}
              )...
            </span>
          </div>
        )}

        {errorMsg && (
          <div className="p-2.5 rounded bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex flex-wrap items-center justify-between gap-2">
            <span>{errorMsg}</span>
            <div className="flex items-center gap-2">
              {modelTier !== 'fast' && (
                <button
                  onClick={() => {
                    setModelTier('fast');
                    setErrorMsg(null);
                    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
                    if (lastUser) {
                      handleSendMessage(lastUser.content);
                    }
                  }}
                  className="px-2 py-1 bg-emerald-800/80 hover:bg-emerald-700 text-white rounded text-[11px] font-medium shrink-0 transition-colors"
                >
                  Switch to Fast
                </button>
              )}
              <button
                onClick={() => {
                  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
                  if (lastUser) {
                    setErrorMsg(null);
                    handleSendMessage(lastUser.content);
                  }
                }}
                className="px-2.5 py-1 bg-rose-800/80 hover:bg-rose-700 text-white rounded text-[11px] font-medium shrink-0 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompt Chips */}
      <div className="py-2 border-t border-slate-800 overflow-x-auto flex gap-1.5 no-scrollbar">
        {promptSuggestions.map((suggestion, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(suggestion)}
            className="shrink-0 px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/80 rounded-full text-[10px] transition-colors"
          >
            {suggestion}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <div className="pt-2 border-t border-slate-800 flex gap-2">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Ask ${selectedRole.replace('_', ' ')} about SNN circuits, STDP, or edge power...`}
          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          disabled={isLoading}
        />
        <button
          onClick={() => handleSendMessage()}
          disabled={isLoading || !inputMessage.trim()}
          className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 shadow"
        >
          <Send className="w-3.5 h-3.5" />
          Send
        </button>
      </div>
    </div>
  );
};
