import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, HardwareTelemetry } from '../types';
import {
  MessageSquare,
  Send,
  Bot,
  User,
  Sparkles,
  Zap,
  Cpu,
  Brain,
  Loader2,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp,
  Layers,
  Activity,
  CheckCircle2,
  Sliders,
  Terminal,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  ClipboardPaste,
  ThumbsUp,
  ThumbsDown,
  Mic,
  Square,
  CornerDownLeft,
} from 'lucide-react';
import { AudioListenButton } from './AudioListenButton';
import { useAudioVoice } from '../context/AudioContext';

interface GeminiChatPanelProps {
  telemetry: HardwareTelemetry;
}

interface StreamChunkItem {
  chunkIndex: number;
  delta: string;
  timestamp: number;
}

interface ActiveStreamBufferState {
  isStreaming: boolean;
  gateStatus: 'IDLE' | 'HOLDING' | 'RELEASED' | 'FINALIZED';
  gateStageLabel: string;
  bufferedChars: number;
  strippedChars: number;
  committedText: string;
  activeBufferSegment: string;
  fullBufferedText: string;
  chunks: StreamChunkItem[];
  ttftMs: number | null;
  tokensPerSec: number;
  tokenEstimate: number;
  elapsedMs: number;
}

type ResponseFormatMode = 's1_thesis' | 'code_diff' | 'telemetry_audit' | 'concise_matrix';

interface DirectiveCategory {
  category: string;
  items: Array<{
    label: string;
    prompt: string;
    recommendedMode?: ResponseFormatMode;
  }>;
}

const DIRECTIVE_CATEGORIES: DirectiveCategory[] = [
  {
    category: 'Homeostatic & STDP Plasticity',
    items: [
      {
        label: 'Calibrate association gain & counteract STDP drift',
        prompt:
          'Help the model: I recommend calibrating association gain and counteracting STDP drift while keeping LTD/LTP within 1.28–1.41.',
        recommendedMode: 's1_thesis',
      },
      {
        label: 'Analyze LTP/LTD balance against runaway excitation',
        prompt:
          'How does biological STDP balance LTP and LTD to prevent catastrophic runaway excitation under high-entropy burst inputs?',
        recommendedMode: 's1_thesis',
      },
      {
        label: 'Synthesize BCM sliding threshold dampening patch',
        prompt:
          'Propose a homeostatic BCM sliding threshold adjustment to bound branching ratio sigma near 1.000 during burst avalanches.',
        recommendedMode: 'code_diff',
      },
    ],
  },
  {
    category: 'Edge Power & AER Bus Diagnostics',
    items: [
      {
        label: 'Audit live 8.2 pJ/SOP edge power & thermal budget',
        prompt:
          'Analyze our live 8.2 pJ/SOP edge power consumption and suggest sub-5mW crossbar quantization optimizations.',
        recommendedMode: 'telemetry_audit',
      },
      {
        label: 'Asynchronous AER crossbar timing specification',
        prompt:
          'Synthesize an asynchronous AER crossbar specification for sub-millisecond wave-pipelined temporal pattern classification.',
        recommendedMode: 'concise_matrix',
      },
      {
        label: 'Estimate 500mAh LiPo battery runtime from live draw',
        prompt:
          'Estimate battery lifetime for a 500mAh LiPo on our current mW telemetry draw and recommend duty-cycle gating.',
        recommendedMode: 'telemetry_audit',
      },
    ],
  },
  {
    category: 'Kuramoto Phase & Criticality',
    items: [
      {
        label: 'Evaluate Kuramoto phase coherence r=0.480 stability',
        prompt:
          'Evaluate how proportional phase-coherence gain K_eff(r) maintains Kuramoto order parameter r near 0.480 without phase locking.',
        recommendedMode: 's1_thesis',
      },
      {
        label: 'Verify Dynamic Range Index (DRI <= 0.250) envelope',
        prompt:
          'Audit our current Dynamic Range Index (DRI) and finite-time Lyapunov exponent (FTLE) for orbital contraction.',
        recommendedMode: 'telemetry_audit',
      },
    ],
  },
];

const RESPONSE_FORMAT_OPTIONS: Array<{
  id: ResponseFormatMode;
  label: string;
  shortDesc: string;
}> = [
  {
    id: 's1_thesis',
    label: 'Lead Thesis S1 (Zero Affirmations)',
    shortDesc: 'Immediate Sentence-1 thesis with biophysical grounding',
  },
  {
    id: 'code_diff',
    label: 'Code & Unified Diff Synthesis',
    shortDesc: 'S1 thesis + concrete TypeScript/Python patch & bounds',
  },
  {
    id: 'telemetry_audit',
    label: 'Homeostatic Telemetry Audit',
    shortDesc: 'Quantitative audit of Power, AER Latency, LTD/LTP & DRI',
  },
  {
    id: 'concise_matrix',
    label: '3-Point Technical Matrix',
    shortDesc: 'High-density parameter bounds with zero conversational filler',
  },
];

export const GeminiChatPanel: React.FC<GeminiChatPanelProps> = ({ telemetry }) => {
  const {
    autoAudioReadout,
    setAutoAudioReadout,
    preferredVoice,
    speakModelOutput,
    isAudioPlaying,
    stopAudio,
  } = useAudioVoice();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      role: 'assistant',
      content:
        'Neuromorphic Systems Copilot online under Gemini 4 Argon (gemini-4-argon — Biologically-Restructured Primary & Bio-RSI Engine), paired with Watchdog Protocol Argon governance and Spark (3.1 Pro) + 3.8 Flash verification. Select a directive from the prompt dropdown or enter a circuit query below.',
      timestamp: Date.now(),
      modelUsed: 'gemini-4-argon (Bio-RSI Primary + Spark/3.1-Pro Verification)',
      roleUsed: 'neuromorphic_architect',
    },
  ]);

  const [inputMessage, setInputMessage] = useState('');
  const [modelTier, setModelTier] = useState<'fast' | 'general' | 'complex'>('general');
  const [selectedRole, setSelectedRole] = useState<
    'neuromorphic_architect' | 'plasticity_researcher' | 'edge_firmware_engineer' | 'gova_broadcaster'
  >('neuromorphic_architect');
  const [attachTelemetry, setAttachTelemetry] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Streaming Response Buffer State
  const [streamBuffer, setStreamBuffer] = useState<ActiveStreamBufferState>({
    isStreaming: false,
    gateStatus: 'IDLE',
    gateStageLabel: 'Idle',
    bufferedChars: 0,
    strippedChars: 0,
    committedText: '',
    activeBufferSegment: '',
    fullBufferedText: '',
    chunks: [],
    ttftMs: null,
    tokensPerSec: 0,
    tokenEstimate: 0,
    elapsedMs: 0,
  });
  const [bufferViewMode, setBufferViewMode] = useState<'split_stage' | 'chunk_inspector'>('split_stage');
  const [showCompletedBufferLog, setShowCompletedBufferLog] = useState(false);

  // Dropdown Composer State
  const [responseFormatMode, setResponseFormatMode] = useState<ResponseFormatMode>('s1_thesis');
  const [isDirectiveDropdownOpen, setIsDirectiveDropdownOpen] = useState(false);
  const [isFormatDropdownOpen, setIsFormatDropdownOpen] = useState(false);
  const [isTelemetryDropdownOpen, setIsTelemetryDropdownOpen] = useState(false);
  const [isComposerExpanded, setIsComposerExpanded] = useState(false);

  // Copy-Paste & Thumbs Up/Down Feedback State
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [pastedNotice, setPastedNotice] = useState<string | null>(null);
  const [messageFeedback, setMessageFeedback] = useState<Record<string, 'up' | 'down'>>({});

  // Push-to-Talk (PTT) Audio-to-Text State
  const [isPttRecording, setIsPttRecording] = useState(false);
  const [isTranscribingAudio, setIsTranscribingAudio] = useState(false);
  const [pttLiveTranscript, setPttLiveTranscript] = useState('');
  const [pttDurationMs, setPttDurationMs] = useState(0);
  const [pttAudioLevel, setPttAudioLevel] = useState(0);
  const [pttAutoSend, setPttAutoSend] = useState(false);
  const [pttStatusNote, setPttStatusNote] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // PTT Audio Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecognitionRef = useRef<any>(null);
  const liveTranscriptRef = useRef<string>('');
  const pttStartTimestampRef = useRef<number>(0);
  const pttTimerIntervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const levelRafRef = useRef<number | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamBuffer.committedText, streamBuffer.activeBufferSegment, isLoading]);

  // Cleanup PTT resources on unmount
  useEffect(() => {
    return () => {
      if (pttTimerIntervalRef.current) window.clearInterval(pttTimerIntervalRef.current);
      if (levelRafRef.current) window.cancelAnimationFrame(levelRafRef.current);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (_) {}
      }
    };
  }, []);

  // Close composer dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (composerRef.current && !composerRef.current.contains(event.target as Node)) {
        setIsDirectiveDropdownOpen(false);
        setIsFormatDropdownOpen(false);
        setIsTelemetryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopyText = async (id: string, text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(id);
      setTimeout(() => {
        setCopiedMessageId((prev) => (prev === id ? null : prev));
      }, 1800);
    } catch (_) {
      const fallbackArea = document.createElement('textarea');
      fallbackArea.value = text;
      document.body.appendChild(fallbackArea);
      fallbackArea.select();
      document.execCommand('copy');
      document.body.removeChild(fallbackArea);
      setCopiedMessageId(id);
      setTimeout(() => {
        setCopiedMessageId((prev) => (prev === id ? null : prev));
      }, 1800);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText) {
        setInputMessage((prev) => {
          const prefix = prev.trim().length > 0 ? `${prev.trimEnd()} ` : '';
          return `${prefix}${clipText}`;
        });
        setPastedNotice('Pasted from clipboard');
        setTimeout(() => setPastedNotice(null), 1800);
        textareaRef.current?.focus();
      } else {
        setPastedNotice('Clipboard is empty');
        setTimeout(() => setPastedNotice(null), 1800);
      }
    } catch (_) {
      setPastedNotice('Use Ctrl+V / Cmd+V in input box');
      textareaRef.current?.focus();
      setTimeout(() => setPastedNotice(null), 2200);
    }
  };

  const handlePasteMessageToInput = (text: string) => {
    if (!text) return;
    setInputMessage((prev) => {
      const prefix = prev.trim().length > 0 ? `${prev.trimEnd()}\n` : '';
      return `${prefix}${text}`;
    });
    setPastedNotice('Inserted into input bar');
    setTimeout(() => setPastedNotice(null), 1800);
    textareaRef.current?.focus();
  };

  const handleMessageFeedback = async (msg: ChatMessage, rating: 'up' | 'down') => {
    const current = messageFeedback[msg.id];
    const nextRating: 'up' | 'down' | null = current === rating ? null : rating;

    setMessageFeedback((prev) => {
      const copy = { ...prev };
      if (nextRating === null) {
        delete copy[msg.id];
      } else {
        copy[msg.id] = nextRating;
      }
      return copy;
    });

    try {
      await fetch('/api/chat/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: msg.id,
          rating: nextRating,
          roleUsed: msg.roleUsed,
          modelUsed: msg.modelUsed,
          snippet: msg.content.slice(0, 200),
        }),
      });
    } catch (_) {
      // Non-blocking feedback telemetry
    }
  };

  const startPushToTalk = async () => {
    if (isPttRecording || isTranscribingAudio) return;
    setErrorMsg(null);
    setPttStatusNote(null);
    setPttLiveTranscript('');
    liveTranscriptRef.current = '';
    audioChunksRef.current = [];
    setPttDurationMs(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // Audio level meter via Web Audio API AnalyserNode
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const updateMeter = () => {
            analyser.getByteTimeDomainData(dataArray);
            let sumSquares = 0;
            for (let i = 0; i < dataArray.length; i++) {
              const norm = (dataArray[i] - 128) / 128;
              sumSquares += norm * norm;
            }
            const rms = Math.sqrt(sumSquares / dataArray.length);
            setPttAudioLevel(Math.min(100, Math.round(rms * 320)));
            levelRafRef.current = window.requestAnimationFrame(updateMeter);
          };
          levelRafRef.current = window.requestAnimationFrame(updateMeter);
        }
      } catch (_) {}

      // Start optional browser SpeechRecognition for instant live interim preview
      const SpeechRec =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const recognition = new SpeechRec();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';
          recognition.onresult = (event: any) => {
            let combined = '';
            for (let i = 0; i < event.results.length; i++) {
              combined += event.results[i][0].transcript + ' ';
            }
            const cleaned = combined.trim();
            liveTranscriptRef.current = cleaned;
            setPttLiveTranscript(cleaned);
          };
          recognition.start();
          speechRecognitionRef.current = recognition;
        } catch (_) {}
      }

      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await finalizePushToTalkTranscription(audioBlob, mimeType);
      };

      recorder.start(150);
      mediaRecorderRef.current = recorder;
      pttStartTimestampRef.current = Date.now();
      setIsPttRecording(true);

      pttTimerIntervalRef.current = window.setInterval(() => {
        setPttDurationMs(Date.now() - pttStartTimestampRef.current);
      }, 100);
    } catch (err: any) {
      setPttStatusNote(
        `Microphone access unavailable (${err?.message || 'Permission denied'}). Check browser microphone permissions.`
      );
    }
  };

  const stopPushToTalk = () => {
    if (!isPttRecording) return;
    setIsPttRecording(false);
    setPttAudioLevel(0);

    if (pttTimerIntervalRef.current) {
      window.clearInterval(pttTimerIntervalRef.current);
      pttTimerIntervalRef.current = null;
    }
    if (levelRafRef.current) {
      window.cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (_) {}
      speechRecognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {}
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  const finalizePushToTalkTranscription = async (audioBlob: Blob, mimeType: string) => {
    const interimFallback = liveTranscriptRef.current.trim();
    if (audioBlob.size < 400 && !interimFallback) {
      setPttStatusNote('Push-to-Talk clip too short — hold button while speaking.');
      setTimeout(() => setPttStatusNote(null), 2500);
      return;
    }

    setIsTranscribingAudio(true);
    setPttStatusNote('Transcribing audio with gemini-3.5-transcribe...');

    try {
      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to encode audio blob'));
        reader.readAsDataURL(audioBlob);
      });

      const response = await fetch('/api/audio/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64Audio,
          mimeType,
        }),
      });

      let finalTranscript = '';
      if (response.ok) {
        const data = await response.json();
        finalTranscript = (data.transcript || '').trim();
      }

      if (!finalTranscript && interimFallback) {
        finalTranscript = interimFallback;
      }

      if (finalTranscript) {
        if (pttAutoSend) {
          setPttStatusNote(`Transcribed & sent: "${finalTranscript.slice(0, 48)}..."`);
          setPttLiveTranscript('');
          liveTranscriptRef.current = '';
          handleSendMessage(finalTranscript);
        } else {
          setInputMessage((prev) => {
            const prefix = prev.trim().length > 0 ? `${prev.trimEnd()} ` : '';
            return `${prefix}${finalTranscript}`;
          });
          setPttStatusNote('Transcript inserted into input bar (gemini-3.5-transcribe)');
          setPttLiveTranscript('');
          liveTranscriptRef.current = '';
          textareaRef.current?.focus();
        }
      } else {
        setPttStatusNote('No speech detected in audio capture.');
      }
    } catch (_) {
      if (interimFallback) {
        setInputMessage((prev) => {
          const prefix = prev.trim().length > 0 ? `${prev.trimEnd()} ` : '';
          return `${prefix}${interimFallback}`;
        });
        setPttStatusNote('Transcript inserted via browser speech engine');
        setPttLiveTranscript('');
        liveTranscriptRef.current = '';
      } else {
        setPttStatusNote('Audio transcription failed — please try speaking again.');
      }
    } finally {
      setIsTranscribingAudio(false);
      setTimeout(() => setPttStatusNote(null), 3500);
    }
  };

  const handlePttPointerDown = () => {
    if (isTranscribingAudio) return;
    if (!isPttRecording) {
      startPushToTalk();
    } else {
      stopPushToTalk();
    }
  };

  const handlePttPointerUp = () => {
    if (!isPttRecording) return;
    const heldMs = Date.now() - pttStartTimestampRef.current;
    // If user held the button for > 260ms, release immediately finishes Push-to-Talk.
    // If user tapped quickly (< 260ms), stay in toggle-record mode until tapped again.
    if (heldMs > 260) {
      stopPushToTalk();
    }
  };

  const injectTelemetrySnippet = (snippet: string) => {
    setInputMessage((prev) => {
      const prefix = prev.trim().length > 0 ? `${prev.trimEnd()} ` : '';
      return `${prefix}${snippet} `;
    });
    setIsTelemetryDropdownOpen(false);
  };

  const commitCurrentStreamImmediately = () => {
    if (!streamBuffer.isStreaming || !streamBuffer.fullBufferedText.trim()) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    const finalContent = streamBuffer.fullBufferedText.trim();
    const assistantMsg: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: finalContent,
      timestamp: Date.now(),
      modelTier,
      modelUsed: 'gemini-4-argon (Stream Buffer Manual Commit)',
      roleUsed: selectedRole,
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setStreamBuffer((prev) => ({
      ...prev,
      isStreaming: false,
      gateStatus: 'FINALIZED',
      gateStageLabel: 'Committed manually by operator',
      committedText: finalContent,
      activeBufferSegment: '',
    }));
    setIsLoading(false);
  };

  const handleSendMessage = async (textToSend?: string, overrideMode?: ResponseFormatMode) => {
    const text = textToSend ?? inputMessage;
    if (!text.trim() || isLoading) return;

    const activeFormat = overrideMode || responseFormatMode;
    setIsDirectiveDropdownOpen(false);
    setIsFormatDropdownOpen(false);
    setIsTelemetryDropdownOpen(false);

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

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStreamBuffer({
      isStreaming: true,
      gateStatus: 'HOLDING',
      gateStageLabel: 'Holding 48-char Affirmation & Lead Thesis S1 Gate...',
      bufferedChars: 0,
      strippedChars: 0,
      committedText: '',
      activeBufferSegment: '',
      fullBufferedText: '',
      chunks: [],
      ttftMs: null,
      tokensPerSec: 0,
      tokenEstimate: 0,
      elapsedMs: 0,
    });

    const requestBody = {
      messages: newHistory.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      modelTier,
      role: selectedRole,
      responseFormatMode: activeFormat,
      edgeTelemetry: attachTelemetry
        ? {
            powerMw: telemetry.powerMw,
            latencyMs: telemetry.aerLatencyMs,
            synapticOpsPerSec: telemetry.synapticOpsPerSec,
            weightDeltaSum: telemetry.cumulativeSTDPDelta,
            activeSpikeCount: telemetry.totalSpikesEmitted,
          }
        : undefined,
    };

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Stream HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let sseBuffer = '';
      let finalizedByDoneEvent = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });

        const eventBlocks = sseBuffer.split('\n\n');
        sseBuffer = eventBlocks.pop() || '';

        for (const block of eventBlocks) {
          const lines = block.split('\n');
          let eventType = 'message';
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataStr += line.slice(5).trim();
            }
          }
          if (!dataStr) continue;

          let payload: any;
          try {
            payload = JSON.parse(dataStr);
          } catch (_) {
            continue;
          }

          if (eventType === 'gate') {
            setStreamBuffer((prev) => ({
              ...prev,
              gateStatus: payload.status === 'RELEASED' ? 'RELEASED' : 'HOLDING',
              gateStageLabel:
                payload.status === 'RELEASED'
                  ? 'S1 Thesis Verified · Streaming Stabilized Clauses'
                  : `Buffering S1 Gate (${payload.bufferedChars || 0}/${payload.holdThreshold || 48} chars)`,
              bufferedChars: payload.bufferedChars ?? prev.bufferedChars,
              strippedChars: payload.strippedChars ?? prev.strippedChars,
            }));
          } else if (eventType === 'chunk') {
            setStreamBuffer((prev) => ({
              ...prev,
              gateStatus: 'RELEASED',
              gateStageLabel: 'S1 Thesis Verified · Streaming Stabilized Clauses',
              committedText: payload.committedText ?? prev.committedText,
              activeBufferSegment: payload.activeBufferSegment ?? '',
              fullBufferedText: payload.fullBufferedText ?? prev.fullBufferedText,
              ttftMs: payload.ttftMs ?? prev.ttftMs,
              tokensPerSec: payload.tokensPerSec ?? prev.tokensPerSec,
              tokenEstimate: payload.tokenEstimate ?? prev.tokenEstimate,
              elapsedMs: payload.elapsedMs ?? prev.elapsedMs,
              chunks: [
                ...prev.chunks.slice(-15),
                {
                  chunkIndex: payload.chunkIndex,
                  delta: payload.delta,
                  timestamp: Date.now(),
                },
              ],
            }));
          } else if (eventType === 'done') {
            finalizedByDoneEvent = true;
            const finalText = payload.text || '';
            const assistantMsg: ChatMessage = {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: finalText,
              timestamp: Date.now(),
              modelTier,
              modelUsed: payload.modelUsed,
              roleUsed: payload.roleUsed,
              govaCadenceAudit: payload.govaCadenceAudit,
            };

            setMessages((prev) => [...prev, assistantMsg]);
            setStreamBuffer((prev) => ({
              ...prev,
              isStreaming: false,
              gateStatus: 'FINALIZED',
              gateStageLabel: 'Stream Committed to Finalized Thread',
              committedText: finalText,
              activeBufferSegment: '',
              fullBufferedText: finalText,
              ttftMs: payload.metrics?.ttftMs ?? prev.ttftMs,
              tokensPerSec: payload.metrics?.tokensPerSec ?? prev.tokensPerSec,
              tokenEstimate: payload.metrics?.totalTokens ?? prev.tokenEstimate,
              elapsedMs: payload.metrics?.totalDurationMs ?? prev.elapsedMs,
            }));

            if (autoAudioReadout && finalText) {
              const voice =
                payload.roleUsed === 'gova_broadcaster'
                  ? 'Charon'
                  : payload.roleUsed === 'plasticity_researcher'
                  ? 'Zephyr'
                  : payload.roleUsed === 'edge_firmware_engineer'
                  ? 'Puck'
                  : preferredVoice || 'Kore';
              speakModelOutput(finalText, voice);
            }
          } else if (eventType === 'error') {
            throw new Error(payload.error || 'Streaming error');
          }
        }
      }

      if (!finalizedByDoneEvent) {
        // Fallback if stream closed without explicit done event
        setStreamBuffer((prev) => {
          if (prev.fullBufferedText.trim()) {
            const assistantMsg: ChatMessage = {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: prev.fullBufferedText.trim(),
              timestamp: Date.now(),
              modelTier,
              modelUsed: 'gemini-4-argon (Argon Bio-RSI + Spark/3.8 Eval Tier)',
              roleUsed: selectedRole,
            };
            setMessages((msgs) => [...msgs, assistantMsg]);
          }
          return {
            ...prev,
            isStreaming: false,
            gateStatus: 'FINALIZED',
            activeBufferSegment: '',
          };
        });
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return;
      }
      console.warn('Chat stream notice, falling back to /api/chat:', err?.message || err);
      try {
        const fallbackResp = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });
        if (!fallbackResp.ok) {
          throw new Error(`HTTP ${fallbackResp.status}`);
        }
        const data = await fallbackResp.json();
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
        setStreamBuffer((prev) => ({
          ...prev,
          isStreaming: false,
          gateStatus: 'FINALIZED',
          committedText: data.text,
          activeBufferSegment: '',
          fullBufferedText: data.text,
        }));
      } catch (innerErr: any) {
        let displayError = innerErr?.message || 'Error communicating with neuromorphic model';
        if (
          displayError.includes('503') ||
          displayError.includes('high demand') ||
          displayError.includes('UNAVAILABLE')
        ) {
          displayError =
            'The model is currently experiencing high upstream demand. Please click retry.';
        }
        setErrorMsg(displayError);
        setStreamBuffer((prev) => ({
          ...prev,
          isStreaming: false,
          gateStatus: 'IDLE',
        }));
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    } else if (e.key === '/' && inputMessage.trim() === '') {
      setIsDirectiveDropdownOpen(true);
    } else if (e.key === 'Escape') {
      setIsDirectiveDropdownOpen(false);
      setIsFormatDropdownOpen(false);
      setIsTelemetryDropdownOpen(false);
    }
  };

  const currentFormatObj =
    RESPONSE_FORMAT_OPTIONS.find((o) => o.id === responseFormatMode) || RESPONSE_FORMAT_OPTIONS[0];

  return (
    <div
      id="gemini-chatbot-panel"
      className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-[640px] shadow"
    >
      {/* Header with Model Tier & Role Selector */}
      <div className="pb-3 border-b border-slate-800 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <MessageSquare className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              Gemini 4 Argon Neuromorphic Copilot
            </h3>
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
              <span className="text-emerald-300">gemini-4-argon</span>
              <span aria-hidden="true">·</span>
              <span className="text-indigo-300">3.1 Pro + 3.8 Eval</span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-300 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                Spark Wrapper
              </span>
            </div>
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
              title="gemini-4-argon (Fast Reflex Pass) with Gemini Spark + 3.1 Pro Wrapper"
            >
              <Zap className="w-3 h-3" />
              Argon Fast
            </button>
            <button
              onClick={() => setModelTier('general')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                modelTier === 'general'
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="gemini-4-argon (Balanced Bio-Plasticity) with Gemini Spark + 3.1 Pro Reasoning & Coding Wrapper"
            >
              <Sparkles className="w-3 h-3" />
              Argon + Spark (General)
            </button>
            <button
              onClick={() => setModelTier('complex')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                modelTier === 'complex'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="gemini-4-argon (Deep Bio-RSI 3-Pass Plasticity) + Gemini Spark Ignition + 3.1 Pro Verification"
            >
              <Cpu className="w-3 h-3" />
              Argon Deep Bio-RSI
            </button>
          </div>
        </div>

        {/* Active 3.1 Pro + Gemini Spark Wrapper Skills Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-slate-400">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-indigo-300 font-semibold flex items-center gap-1">
              <Brain className="w-3 h-3 text-indigo-400" />
              Active Pipeline:
            </span>
            <span className="text-amber-300">Lateral Hypothesis Ignition</span>
            <span aria-hidden="true">·</span>
            <span className="text-sky-300">Causal & Differential Reasoning</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-300">48-Char Affirmation Buffer Gate</span>
          </div>

          {streamBuffer.chunks.length > 0 && !streamBuffer.isStreaming && (
            <button
              onClick={() => setShowCompletedBufferLog((prev) => !prev)}
              className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors"
            >
              <Layers className="w-3 h-3" />
              <span>
                {showCompletedBufferLog ? 'Hide Last Stream Buffer' : `Inspect Last Stream Buffer (${streamBuffer.chunks.length} chunks)`}
              </span>
            </button>
          )}
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
              title={
                autoAudioReadout
                  ? 'Auto Audio Readout Active: Assistant responses are spoken aloud automatically'
                  : 'Auto Audio Readout Off'
              }
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

      {/* Scrollable Finalized Conversation Thread + Real-Time Streaming Response Buffer */}
      <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1 text-xs">
        {messages.map((msg) => {
          const currentRating = messageFeedback[msg.id] || null;
          const isCopied = copiedMessageId === msg.id;

          return (
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
                {msg.role === 'assistant' && (
                  <div className="mb-1.5 pb-1 border-b border-slate-700/50 flex items-center justify-between gap-3 text-[10px] font-mono text-slate-400">
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Finalized Response
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyText(msg.id, msg.content)}
                        className="px-1.5 py-0.5 rounded bg-slate-900/80 hover:bg-slate-900 text-slate-300 border border-slate-700/80 flex items-center gap-1 transition-colors"
                        title="Copy response to clipboard"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-2.5 h-2.5 text-emerald-400" />
                            <span className="text-emerald-300">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-2.5 h-2.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePasteMessageToInput(msg.content)}
                        className="px-1.5 py-0.5 rounded bg-slate-900/80 hover:bg-slate-900 text-slate-300 border border-slate-700/80 flex items-center gap-1 transition-colors"
                        title="Paste response into composer input box"
                      >
                        <CornerDownLeft className="w-2.5 h-2.5 text-sky-400" />
                        <span>To Input</span>
                      </button>
                      <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                )}

                <div>{msg.content}</div>

                {msg.role === 'user' && (
                  <div className="mt-1.5 pt-1 border-t border-sky-500/40 flex items-center justify-end gap-1.5 text-[10px] font-mono text-sky-100">
                    <button
                      type="button"
                      onClick={() => handleCopyText(msg.id, msg.content)}
                      className="px-1.5 py-0.5 rounded bg-sky-700/70 hover:bg-sky-700 text-white flex items-center gap-1 transition-colors"
                      title="Copy prompt"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-2.5 h-2.5 text-emerald-300" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-2.5 h-2.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePasteMessageToInput(msg.content)}
                      className="px-1.5 py-0.5 rounded bg-sky-700/70 hover:bg-sky-700 text-white flex items-center gap-1 transition-colors"
                      title="Paste prompt back into input bar"
                    >
                      <ClipboardPaste className="w-2.5 h-2.5" />
                      <span>Reuse in Input</span>
                    </button>
                  </div>
                )}

                {msg.role === 'assistant' && (
                  <div className="mt-2 pt-1.5 border-t border-slate-700/60 flex flex-col gap-1.5">
                    {msg.govaCadenceAudit && (
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono bg-slate-900/80 px-2.5 py-1 rounded border border-slate-700/80 text-slate-300">
                        <span className="text-amber-400 font-semibold">🎙️ Gova Audit</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            !msg.govaCadenceAudit.hasReflexiveAffirmation
                              ? 'text-emerald-300'
                              : 'text-rose-300'
                          }
                        >
                          {!msg.govaCadenceAudit.hasReflexiveAffirmation
                            ? '✓ Zero Affirmations'
                            : '✗ Affirmation Detected'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            msg.govaCadenceAudit.leadThesisDelivered
                              ? 'text-sky-300'
                              : 'text-amber-300'
                          }
                        >
                          {msg.govaCadenceAudit.leadThesisDelivered
                            ? '✓ Lead Thesis S1'
                            : '⚠️ Lead Delayed'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-400">
                          Synthesis: <strong className="text-emerald-400">{msg.govaCadenceAudit.synthesisScore}%</strong>
                        </span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5">
                        {msg.modelUsed && <span>Model: {msg.modelUsed}</span>}
                        {msg.roleUsed && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Role: {msg.roleUsed.replace('_', ' ')}</span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Thumbs Up / Thumbs Down Feedback Controls */}
                        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700/80 rounded-lg px-1.5 py-0.5">
                          <button
                            type="button"
                            onClick={() => handleMessageFeedback(msg, 'up')}
                            aria-label="Thumbs up helpful response"
                            title="Thumbs Up — Mark response as helpful"
                            className={`p-1 rounded transition-colors flex items-center gap-1 text-[10px] font-mono ${
                              currentRating === 'up'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-800'
                            }`}
                          >
                            <ThumbsUp className="w-3 h-3" />
                            {currentRating === 'up' && <span>Helpful</span>}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleMessageFeedback(msg, 'down')}
                            aria-label="Thumbs down response needs improvement"
                            title="Thumbs Down — Flag response for tuning"
                            className={`p-1 rounded transition-colors flex items-center gap-1 text-[10px] font-mono ${
                              currentRating === 'down'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : 'text-slate-400 hover:text-rose-300 hover:bg-slate-800'
                            }`}
                          >
                            <ThumbsDown className="w-3 h-3" />
                            {currentRating === 'down' && <span>Flagged</span>}
                          </button>
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
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-slate-300 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {/* =====================================================================
            REAL-TIME STREAMING RESPONSE BUFFER
            Visually separates incoming stream chunks from finalized responses
           ===================================================================== */}
        {(streamBuffer.isStreaming || showCompletedBufferLog) && (
          <div
            id="streaming-response-buffer"
            className="rounded-xl border border-sky-500/40 bg-slate-950/95 p-3 space-y-2.5 shadow-lg"
          >
            {/* Buffer Header & Telemetry Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                {streamBuffer.isStreaming ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                ) : (
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span className="text-[11px] font-semibold text-sky-200">
                  Real-Time Streaming Response Buffer
                </span>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span className="text-[10px] font-mono text-amber-300">
                  {streamBuffer.gateStageLabel}
                </span>
              </div>

              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                <span>TTFT: {streamBuffer.ttftMs !== null ? `${streamBuffer.ttftMs}ms` : '...'}</span>
                <span aria-hidden="true">·</span>
                <span>Chunks: {streamBuffer.chunks.length}</span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-300">{streamBuffer.tokensPerSec} tok/s</span>

                <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded p-0.5 ml-1">
                  <button
                    type="button"
                    onClick={() => setBufferViewMode('split_stage')}
                    className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                      bufferViewMode === 'split_stage'
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Split Buffer
                  </button>
                  <button
                    type="button"
                    onClick={() => setBufferViewMode('chunk_inspector')}
                    className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                      bufferViewMode === 'chunk_inspector'
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Chunk Feed
                  </button>
                </div>

                {streamBuffer.isStreaming && streamBuffer.fullBufferedText.length > 0 && (
                  <button
                    type="button"
                    onClick={commitCurrentStreamImmediately}
                    className="px-2 py-0.5 rounded bg-emerald-600/80 hover:bg-emerald-500 text-white text-[9px] font-sans font-medium transition-colors"
                  >
                    Commit Now
                  </button>
                )}
              </div>
            </div>

            {bufferViewMode === 'split_stage' ? (
              <div className="grid grid-cols-1 gap-2">
                {/* Zone 1: Stabilized Clauses Ready for Finalization */}
                <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2.5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                    <span className="text-emerald-300 font-semibold">
                      1. Stabilized Clauses (Cleared S1 Affirmation Gate)
                    </span>
                    <span>
                      {streamBuffer.committedText.length} chars stabilized
                      {streamBuffer.strippedChars > 0
                        ? ` · ${streamBuffer.strippedChars} fluff chars stripped`
                        : ''}
                    </span>
                  </div>
                  <div className="text-xs text-slate-100 leading-relaxed whitespace-pre-wrap min-h-[28px]">
                    {streamBuffer.committedText || (
                      <span className="text-slate-500 italic">
                        Awaiting first complete sentence boundary from stream buffer...
                      </span>
                    )}
                  </div>
                </div>

                {/* Zone 2: Incoming Unfinalized Chunk Buffer */}
                <div className="rounded-lg bg-sky-950/30 border border-sky-500/30 p-2.5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-sky-300 mb-1">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Activity className="w-3 h-3 text-sky-400" />
                      2. Incoming Stream Chunk Buffer (Pre-Commit Staging)
                    </span>
                    <span>
                      {streamBuffer.activeBufferSegment.length} active chars · ~{streamBuffer.tokenEstimate} tokens
                    </span>
                  </div>
                  <div className="text-xs font-mono text-sky-100 leading-relaxed whitespace-pre-wrap min-h-[24px]">
                    {streamBuffer.activeBufferSegment ? (
                      <>
                        {streamBuffer.activeBufferSegment}
                        {streamBuffer.isStreaming && (
                          <span className="inline-block w-1.5 h-3.5 bg-sky-400 ml-1 align-middle animate-pulse" />
                        )}
                      </>
                    ) : streamBuffer.isStreaming ? (
                      <span className="text-sky-300/70">
                        Accumulating incoming token delta chunks...
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        All incoming chunks flushed and committed to finalized response above.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Chunk Inspector View */
              <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2.5 space-y-1.5 max-h-40 overflow-y-auto">
                <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between">
                  <span>Live Incoming Delta Chunks (Most Recent 16)</span>
                  <span>Elapsed: {streamBuffer.elapsedMs}ms</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {streamBuffer.chunks.map((c) => (
                    <div
                      key={c.chunkIndex}
                      className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-200"
                    >
                      <span className="text-sky-400 mr-1">#{c.chunkIndex}</span>
                      <span>{JSON.stringify(c.delta)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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

      {/* =====================================================================
          DROPDOWN-ENHANCED MULTI-LINE USER COMPOSER
          Replaces the flat input bar with structured directive & mode dropdowns
         ===================================================================== */}
      <div
        ref={composerRef}
        className="pt-2.5 border-t border-slate-800 space-y-2 relative"
      >
        {/* Dropdown Popover 1: Categorized Neuromorphic Directive Templates */}
        {isDirectiveDropdownOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-slate-950 border border-slate-700 rounded-xl p-3 shadow-2xl z-30 max-h-72 overflow-y-auto space-y-3">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-sky-400" />
                Neuromorphic Directive & Prompt Library
              </span>
              <button
                type="button"
                onClick={() => setIsDirectiveDropdownOpen(false)}
                className="text-[11px] text-slate-400 hover:text-slate-200"
              >
                Close (Esc)
              </button>
            </div>

            {DIRECTIVE_CATEGORIES.map((group) => (
              <div key={group.category} className="space-y-1.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-sky-400">
                  {group.category}
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {group.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setInputMessage(item.prompt);
                          if (item.recommendedMode) {
                            setResponseFormatMode(item.recommendedMode);
                          }
                          setIsDirectiveDropdownOpen(false);
                        }}
                        className="text-left flex-1 min-w-0"
                      >
                        <div className="text-xs font-medium text-slate-100 truncate">
                          {item.label}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {item.prompt}
                        </div>
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setInputMessage(item.prompt);
                            if (item.recommendedMode) {
                              setResponseFormatMode(item.recommendedMode);
                            }
                            setIsDirectiveDropdownOpen(false);
                          }}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-medium transition-colors"
                        >
                          Load in Bar
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleSendMessage(item.prompt, item.recommendedMode)
                          }
                          className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-medium transition-colors"
                        >
                          Stream Now
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Dropdown Popover 2: Output Structure / Response Mode */}
        {isFormatDropdownOpen && (
          <div className="absolute bottom-full left-0 mb-2 w-80 bg-slate-950 border border-slate-700 rounded-xl p-2.5 shadow-2xl z-30 space-y-1">
            <div className="text-[11px] font-semibold text-slate-200 px-2 py-1 border-b border-slate-800">
              Response Structure & Buffer Gate Mode
            </div>
            {RESPONSE_FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setResponseFormatMode(opt.id);
                  setIsFormatDropdownOpen(false);
                }}
                className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors flex flex-col gap-0.5 ${
                  responseFormatMode === opt.id
                    ? 'bg-sky-600/20 border border-sky-500/40 text-sky-200'
                    : 'hover:bg-slate-900 text-slate-300'
                }`}
              >
                <span className="text-xs font-medium">{opt.label}</span>
                <span className="text-[10px] text-slate-400">{opt.shortDesc}</span>
              </button>
            ))}
          </div>
        )}

        {/* Dropdown Popover 3: Live Telemetry Snippet Injector */}
        {isTelemetryDropdownOpen && (
          <div className="absolute bottom-full right-0 mb-2 w-72 bg-slate-950 border border-slate-700 rounded-xl p-2.5 shadow-2xl z-30 space-y-1">
            <div className="text-[11px] font-semibold text-slate-200 px-2 py-1 border-b border-slate-800">
              Insert Live Hardware Parameter into Prompt
            </div>
            <button
              type="button"
              onClick={() =>
                injectTelemetrySnippet(`[Power: ${telemetry.powerMw}mW @ 8.2 pJ/SOP]`)
              }
              className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-900 text-xs text-slate-200 font-mono"
            >
              + Power Envelope ({telemetry.powerMw} mW)
            </button>
            <button
              type="button"
              onClick={() =>
                injectTelemetrySnippet(`[AER Bus Latency: ${telemetry.aerLatencyMs}ms]`)
              }
              className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-900 text-xs text-slate-200 font-mono"
            >
              + AER Bus Latency ({telemetry.aerLatencyMs} ms)
            </button>
            <button
              type="button"
              onClick={() =>
                injectTelemetrySnippet(`[Firing Throughput: ${telemetry.synapticOpsPerSec} SOP/s]`)
              }
              className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-900 text-xs text-slate-200 font-mono"
            >
              + Synaptic Ops ({telemetry.synapticOpsPerSec} SOP/s)
            </button>
            <button
              type="button"
              onClick={() =>
                injectTelemetrySnippet(
                  `[LIVE SNN STATE: Pwr=${telemetry.powerMw}mW | Lat=${telemetry.aerLatencyMs}ms | SOP/s=${telemetry.synapticOpsPerSec} | STDP_Delta=${telemetry.cumulativeSTDPDelta}]`
                )
              }
              className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-900 text-xs text-emerald-300 font-mono"
            >
              + Full Telemetry Vector Block
            </button>
          </div>
        )}

        {/* Composer Control Bar with Dropdown Selectors */}
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Directive Library Dropdown Trigger */}
            <button
              type="button"
              onClick={() => {
                setIsDirectiveDropdownOpen((prev) => !prev);
                setIsFormatDropdownOpen(false);
                setIsTelemetryDropdownOpen(false);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Terminal className="w-3.5 h-3.5 text-sky-400" />
              <span>Directive & Prompt Dropdown</span>
              {isDirectiveDropdownOpen ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            {/* Output Format Mode Dropdown Trigger */}
            <button
              type="button"
              onClick={() => {
                setIsFormatDropdownOpen((prev) => !prev);
                setIsDirectiveDropdownOpen(false);
                setIsTelemetryDropdownOpen(false);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs flex items-center gap-1.5 transition-colors"
            >
              <Sliders className="w-3 h-3 text-indigo-400" />
              <span>Mode: {currentFormatObj.label}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Copy & Paste Quick Actions */}
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              className="px-2 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-sky-300 text-[11px] font-mono flex items-center gap-1 transition-colors"
              title="Paste text from clipboard into composer"
            >
              <ClipboardPaste className="w-3 h-3" />
              <span>Paste</span>
            </button>

            <button
              type="button"
              onClick={() => handleCopyText('composer-draft', inputMessage)}
              disabled={!inputMessage.trim()}
              className="px-2 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-40 border border-slate-800 text-slate-300 text-[11px] font-mono flex items-center gap-1 transition-colors"
              title="Copy current composer draft to clipboard"
            >
              {copiedMessageId === 'composer-draft' ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-300">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy Input</span>
                </>
              )}
            </button>

            {/* Inject Metric Dropdown Trigger */}
            <button
              type="button"
              onClick={() => {
                setIsTelemetryDropdownOpen((prev) => !prev);
                setIsDirectiveDropdownOpen(false);
                setIsFormatDropdownOpen(false);
              }}
              className="px-2 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-emerald-300 text-[11px] font-mono flex items-center gap-1 transition-colors"
            >
              <span>+ Inject Metric</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {/* Auto-Send PTT Toggle */}
            <label
              className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-[10px] font-mono flex items-center gap-1 cursor-pointer"
              title="When checked, releasing Push-to-Talk automatically sends the transcribed message"
            >
              <input
                type="checkbox"
                checked={pttAutoSend}
                onChange={(e) => setPttAutoSend(e.target.checked)}
                className="rounded border-slate-700 text-sky-500 focus:ring-sky-500"
              />
              <span>Auto-Send PTT</span>
            </label>

            {/* Expand / Collapse Multi-Line Workbench Toggle */}
            <button
              type="button"
              onClick={() => setIsComposerExpanded((prev) => !prev)}
              className="px-2 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 text-[11px] flex items-center gap-1 transition-colors"
              title={isComposerExpanded ? 'Compact Composer' : 'Expand Multi-Line Workbench'}
            >
              {isComposerExpanded ? (
                <>
                  <Minimize2 className="w-3 h-3" />
                  <span>Compact</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3 h-3" />
                  <span>Expand</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Push-to-Talk Audio-to-Text Transcript Status Bar */}
        {(isPttRecording || isTranscribingAudio || pttStatusNote || pastedNotice) && (
          <div
            className={`px-3 py-1.5 rounded-lg border text-[11px] font-mono flex flex-wrap items-center justify-between gap-2 transition-colors ${
              isPttRecording
                ? 'bg-rose-950/60 border-rose-500/50 text-rose-200'
                : isTranscribingAudio
                ? 'bg-sky-950/60 border-sky-500/40 text-sky-200'
                : 'bg-slate-950 border-slate-800 text-emerald-300'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {isPttRecording ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
                  <span className="font-semibold text-rose-300 shrink-0">
                    PTT REC {(pttDurationMs / 1000).toFixed(1)}s
                  </span>
                  <div className="w-20 h-2 bg-slate-900 rounded-full overflow-hidden border border-rose-500/30 shrink-0">
                    <div
                      className="h-full bg-emerald-400 transition-all duration-75"
                      style={{ width: `${Math.max(8, pttAudioLevel)}%` }}
                    />
                  </div>
                  <span className="truncate text-slate-200">
                    {pttLiveTranscript
                      ? `"${pttLiveTranscript}"`
                      : 'Listening... speak now (release or click Stop to transcribe)'}
                  </span>
                </>
              ) : isTranscribingAudio ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400 shrink-0" />
                  <span>{pttStatusNote || 'Transcribing speech to text (gemini-3.5-transcribe)...'}</span>
                </>
              ) : (
                <span>{pttStatusNote || pastedNotice}</span>
              )}
            </div>

            {isPttRecording && (
              <button
                type="button"
                onClick={stopPushToTalk}
                className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-sans font-semibold shrink-0"
              >
                Stop &amp; Transcribe
              </button>
            )}
          </div>
        )}

        {/* Multi-Line Expandable Composer Input Box with Push-to-Talk Button */}
        <div className="bg-slate-950 border border-slate-700 focus-within:border-sky-500 rounded-xl p-2 flex items-end gap-2 transition-colors">
          <textarea
            ref={textareaRef}
            rows={isComposerExpanded ? 4 : 2}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask ${selectedRole.replace('_', ' ')} (Hold 'Push to Talk' to speak, '/' for Directives, Enter to stream)...`}
            className="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none resize-none leading-relaxed px-1.5 py-0.5"
            disabled={isLoading}
          />

          <div className="flex items-center gap-1.5 shrink-0">
            {inputMessage.trim().length > 0 && !isLoading && (
              <button
                type="button"
                onClick={() => setInputMessage('')}
                className="px-2 py-2 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                Clear
              </button>
            )}

            {/* Push-to-Talk (Hold to Talk or Click to Toggle) Audio-to-Text Button */}
            <button
              type="button"
              onMouseDown={handlePttPointerDown}
              onMouseUp={handlePttPointerUp}
              onTouchStart={(e) => {
                e.preventDefault();
                handlePttPointerDown();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                handlePttPointerUp();
              }}
              disabled={isLoading || isTranscribingAudio}
              title="Push to Talk: Hold down while speaking (or click to start/stop) to transcribe audio into text via gemini-3.5-transcribe"
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 select-none shadow ${
                isPttRecording
                  ? 'bg-rose-600 hover:bg-rose-500 text-white ring-2 ring-rose-400/60 animate-pulse'
                  : isTranscribingAudio
                  ? 'bg-slate-800 text-sky-300 border border-sky-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              {isTranscribingAudio ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                  <span>Transcribing...</span>
                </>
              ) : isPttRecording ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Release / Stop</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Push to Talk</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={isLoading || !inputMessage.trim()}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 shadow"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isLoading ? 'Streaming...' : 'Stream'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
