// Audio Player with Web Audio API AudioContext, Zero-Truncation Chunking, and Streaming Queue
export interface SpeechQueueItem {
  id: string;
  index: number;
  total: number;
  text: string;
  status: 'queued' | 'loading' | 'playing' | 'completed' | 'error';
  audioUrl?: string | null;
}

export interface SpeechQueueState {
  isPlaying: boolean;
  isLoading: boolean;
  isPaused: boolean;
  queue: SpeechQueueItem[];
  currentIndex: number;
  totalChunks: number;
  currentText: string;
  progressPercent: number;
  voice: 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir';
  isClientVoice?: boolean;
}

// Global Web Audio AudioContext singleton
let globalAudioCtx: AudioContext | null = null;
let currentSourceNode: AudioBufferSourceNode | null = null;
let currentAudioElement: HTMLAudioElement | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;

// Queue State
let activeQueue: SpeechQueueItem[] = [];
let activeQueueIndex = 0;
let isQueueRunning = false;
let isQueuePaused = false;
let sessionUsesClientVoice = false;
let currentVoice: 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir' = 'Kore';
let prefetchCache = new Map<number, string>(); // chunkIndex -> audioUrl
let activeAbortController: AbortController | null = null;

// Voice list cache
let cachedVoices: SpeechSynthesisVoice[] = [];
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  cachedVoices = window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices();
  };
}

// Subscribers
type QueueStateListener = (state: SpeechQueueState) => void;
const listeners = new Set<QueueStateListener>();

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        globalAudioCtx = new AudioContextClass();
      }
    }
  } catch (e) {
    console.warn('AudioContext initialization notice:', e);
  }
  return globalAudioCtx;
}

export function subscribeToAudioQueue(listener: QueueStateListener): () => void {
  listeners.add(listener);
  listener(getCurrentQueueState());
  return () => {
    listeners.delete(listener);
  };
}

export function getCurrentQueueState(): SpeechQueueState {
  const currentItem = activeQueue[activeQueueIndex];
  const total = activeQueue.length;
  const percent = total > 0 ? Math.round(((activeQueueIndex) / total) * 100) : 0;

  return {
    isPlaying: isQueueRunning && !isQueuePaused,
    isLoading: isQueueRunning && currentItem?.status === 'loading',
    isPaused: isQueuePaused,
    queue: [...activeQueue],
    currentIndex: activeQueueIndex,
    totalChunks: total,
    currentText: currentItem?.text || '',
    progressPercent: isQueueRunning ? Math.min(100, Math.max(0, percent)) : 0,
    voice: currentVoice,
    isClientVoice: sessionUsesClientVoice,
  };
}

function notifyListeners() {
  const state = getCurrentQueueState();
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (err) {
      console.warn('Queue listener notice:', err);
    }
  });
}

// 1. Convert complex Markdown & Engineering notation into natural, fluent spoken English
export function prepareSpeechText(raw: string): string {
  if (!raw) return '';

  let text = raw;

  // Transform Markdown tables into spoken narrative sentences
  const lines = text.split('\n');
  const processedLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (trimmed.includes('---')) continue;
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim().replace(/[*$#_`~]/g, ''));
      if (cells.length >= 3 && !cells[0].toLowerCase().includes('parameter') && !cells[0].toLowerCase().includes('metric')) {
        const paramName = cells[0];
        const currentVal = cells[1] || '';
        const recVal = cells[2] || '';
        const justification = cells[3] || '';
        processedLines.push(
          `For ${paramName}, the recommended value is ${recVal}, previously ${currentVal}. ${justification}`
        );
        continue;
      }
      continue;
    }
    processedLines.push(line);
  }
  text = processedLines.join('\n');

  // Remove code blocks (e.g. ```json ... ```)
  text = text.replace(/```[\s\S]*?```/g, '');

  // Expand biological, neuromorphic and mathematical symbols for natural pronunciation
  text = text
    .replace(/\\approx/gi, 'approximately')
    .replace(/\\pm/gi, 'plus or minus')
    .replace(/\\times/gi, 'times')
    .replace(/STDP\s*\$A_\+\$/gi, 'STDP potentiation A-plus')
    .replace(/STDP\s*\$A_-\$/gi, 'STDP depression A-minus')
    .replace(/\$A_-\/A_\+\$/gi, 'A-minus to A-plus')
    .replace(/A_-\/A_\+/gi, 'A-minus to A-plus')
    .replace(/\$A_\+\$/gi, 'A-plus')
    .replace(/\$A_-\$/gi, 'A-minus')
    .replace(/A_\+/gi, 'A-plus')
    .replace(/A_-(?!\w)/gi, 'A-minus')
    .replace(/\bA\+/gi, 'A-plus')
    .replace(/\bA\-(?!\w)/gi, 'A-minus')
    .replace(/A\-minus\/A\-plus/gi, 'A-minus to A-plus')
    .replace(/\$([A-Za-z0-9_+\-\/\\^]+)\$/g, '$1') // strip inline latex dollars
    .replace(/(\d+(?:\.\d+)?)\s*%/g, '$1 percent')
    .replace(/\+(\d+(?:\.\d+)?\s*percent)/gi, 'plus $1')
    .replace(/-(\d+(?:\.\d+)?\s*percent)/gi, 'minus $1')
    .replace(/(\d+)\s*pJ\/SOP/gi, '$1 picojoules per synaptic operation')
    .replace(/(\d+)\s*SOP\/s(?:ec)?/gi, '$1 synaptic operations per second')
    .replace(/(\d+)\s*mW/gi, '$1 milliwatts')
    .replace(/(\d+)\s*uW/gi, '$1 microwatts')
    .replace(/(\d+)\s*mV/gi, '$1 millivolts')
    .replace(/(\d+)\s*Hz/gi, '$1 Hertz')
    .replace(/(\d+)\s*kHz/gi, '$1 kilohertz')
    .replace(/(\d+)\s*px/gi, '$1 pixels')
    .replace(/\bLTP\b/g, 'Long-Term Potentiation')
    .replace(/\bLTD\b/g, 'Long-Term Depression')
    .replace(/\bapprox\b/gi, 'approximately')
    .replace(/\be\.g\.\b/gi, 'for example')
    .replace(/\bi\.e\.\b/gi, 'that is')
    .replace(/\bvs\.\b/gi, 'versus');

  // Clean markdown headings, links, styling, and bullet points
  text = text
    .replace(/^#+\s+/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/\(http[^)]+\)/g, '')
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[ \t]*[•\-\*+]\s+/gm, '') // only bullets at start of line
    .replace(/:\./g, '.')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return text;
}

// 2. Chunking Mechanism: Splits full diagnostic text into complete sentences without breaking decimal numbers
export function prepareSpeechChunks(rawText: string, maxChunkLen = 320): string[] {
  const clean = prepareSpeechText(rawText);
  if (!clean) return [];

  // Protect decimal numbers like 0.032, 1.6, 2.2 from being split by sentence boundaries
  const protectedText = clean.replace(/(\d+)\.(\d+)/g, '$1__DEC__$2');

  // Split on sentence boundaries preserving complete thought units
  const rawSentences = protectedText.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [protectedText];
  const sentences = rawSentences
    .map((s) => s.replace(/__DEC__/g, '.').trim())
    .filter((s) => s.length > 0);

  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if (!sentence) continue;

    if (sentence.length > maxChunkLen) {
      // Long sentence: break at natural comma / colon / semicolon pauses
      const subParts = sentence.split(/([,;:]\s+)/);
      for (const part of subParts) {
        const pTrimmed = part.trim();
        if (!pTrimmed) continue;
        if ((currentChunk + ' ' + pTrimmed).length <= maxChunkLen) {
          currentChunk = currentChunk ? currentChunk + ' ' + pTrimmed : pTrimmed;
        } else {
          if (currentChunk) chunks.push(currentChunk);
          currentChunk = pTrimmed;
        }
      }
    } else {
      if ((currentChunk + ' ' + sentence).length <= maxChunkLen) {
        currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
      } else {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = sentence;
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [clean];
}

// 3. AudioContext Streaming Playback Helper
async function playAudioBufferViaContext(audioUrl: string): Promise<void> {
  const audioCtx = getAudioContext();

  // Resume context if suspended by browser autoplay policy
  if (audioCtx && audioCtx.state === 'suspended') {
    try {
      await audioCtx.resume();
    } catch (e) {
      console.warn('AudioContext resume notice:', e);
    }
  }

  if (audioCtx && audioCtx.state === 'running') {
    try {
      const resp = await fetch(audioUrl);
      const arrayBuf = await resp.arrayBuffer();
      const decodedBuf = await audioCtx.decodeAudioData(arrayBuf);

      return new Promise((resolve) => {
        if (!isQueueRunning) {
          resolve();
          return;
        }

        const source = audioCtx.createBufferSource();
        source.buffer = decodedBuf;
        source.connect(audioCtx.destination);
        currentSourceNode = source;

        source.onended = () => {
          currentSourceNode = null;
          resolve();
        };

        source.start(0);
      });
    } catch (decodeErr) {
      console.warn('Web Audio decode fallback to HTML5 Audio:', decodeErr);
    }
  }

  // HTML5 Audio fallback if AudioContext decode fails
  return new Promise((resolve) => {
    const audio = new Audio(audioUrl);
    currentAudioElement = audio;

    audio.onended = () => {
      currentAudioElement = null;
      resolve();
    };

    audio.onerror = () => {
      currentAudioElement = null;
      resolve();
    };

    audio.play().catch((err) => {
      console.warn('HTML5 Audio playback notice:', err);
      currentAudioElement = null;
      resolve();
    });
  });
}

// 4. Pre-fetch a chunk's audio in advance to eliminate gaps
async function prefetchChunkAudio(chunkText: string, chunkIdx: number, voice: string, signal?: AbortSignal) {
  if (prefetchCache.has(chunkIdx) || sessionUsesClientVoice) return;

  try {
    const res = await fetch('/api/text-to-speech-chunk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: chunkText,
        voice,
        chunkIndex: chunkIdx,
        totalChunks: activeQueue.length,
      }),
      signal,
    });

    if (res.ok) {
      const data = await res.json();
      if (data.fallbackToClient) {
        sessionUsesClientVoice = true;
      } else if (data.audioUrl) {
        prefetchCache.set(chunkIdx, data.audioUrl);
      }
    }
  } catch (e: any) {
    if (e?.name !== 'AbortError') {
      console.warn(`Chunk ${chunkIdx} prefetch notice:`, e?.message || e);
    }
  }
}

// 5. Speak single chunk using Web Speech Synthesis with natural voice matching
function speakChunkViaWebSpeech(text: string, voiceName: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }

    try {
      // Resume if paused
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      currentUtterance = utterance;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      const voices = cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices();
      const isMale = voiceName === 'Puck' || voiceName === 'Charon' || voiceName === 'Fenrir';

      const chosen =
        voices.find(
          (v) =>
            v.lang.startsWith('en') &&
            (isMale
              ? v.name.toLowerCase().includes('male') ||
                v.name.toLowerCase().includes('david') ||
                v.name.toLowerCase().includes('guy') ||
                v.name.toLowerCase().includes('alex') ||
                v.name.toLowerCase().includes('george')
              : v.name.toLowerCase().includes('female') ||
                v.name.toLowerCase().includes('samantha') ||
                v.name.toLowerCase().includes('zira') ||
                v.name.toLowerCase().includes('victoria') ||
                v.name.toLowerCase().includes('jenny') ||
                v.name.toLowerCase().includes('natural'))
        ) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        null;

      if (chosen) utterance.voice = chosen;

      let hasResolved = false;
      const done = () => {
        if (!hasResolved) {
          hasResolved = true;
          currentUtterance = null;
          resolve();
        }
      };

      utterance.onend = done;
      utterance.onerror = (e) => {
        console.warn('Speech chunk notice:', e);
        done();
      };

      // Safety timeout in case browser drops onend
      const maxDuration = Math.max(3500, text.length * 85);
      setTimeout(done, maxDuration);

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Speech synthesis error:', err);
      resolve();
    }
  });
}

// 6. Main Streaming Queue Execution Loop
async function processSpeechQueue() {
  if (!isQueueRunning || activeQueueIndex >= activeQueue.length) {
    stopModelAudio();
    return;
  }

  const item = activeQueue[activeQueueIndex];
  item.status = 'loading';
  notifyListeners();

  // If not in client voice mode, pre-fetch next chunks
  if (!sessionUsesClientVoice && activeAbortController) {
    const nextIdx1 = activeQueueIndex + 1;
    const nextIdx2 = activeQueueIndex + 2;
    if (nextIdx1 < activeQueue.length) {
      prefetchChunkAudio(activeQueue[nextIdx1].text, nextIdx1, currentVoice, activeAbortController.signal);
    }
    if (nextIdx2 < activeQueue.length) {
      prefetchChunkAudio(activeQueue[nextIdx2].text, nextIdx2, currentVoice, activeAbortController.signal);
    }
  }

  // Get or fetch audio for current chunk if server TTS is active
  let audioUrl = prefetchCache.get(activeQueueIndex) || null;

  if (!audioUrl && !sessionUsesClientVoice) {
    try {
      const res = await fetch('/api/text-to-speech-chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: item.text,
          voice: currentVoice,
          chunkIndex: activeQueueIndex,
          totalChunks: activeQueue.length,
        }),
        signal: activeAbortController?.signal,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.fallbackToClient) {
          sessionUsesClientVoice = true;
        } else if (data.audioUrl) {
          audioUrl = data.audioUrl as string;
          item.audioUrl = audioUrl;
          prefetchCache.set(activeQueueIndex, audioUrl);
        }
      } else {
        sessionUsesClientVoice = true;
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      sessionUsesClientVoice = true;
      console.warn('Chunk audio fetch notice:', err?.message || err);
    }
  } else {
    item.audioUrl = audioUrl;
  }

  if (!isQueueRunning) return;

  // Handle Pause
  while (isQueuePaused && isQueueRunning) {
    await new Promise((r) => setTimeout(r, 150));
  }
  if (!isQueueRunning) return;

  item.status = 'playing';
  notifyListeners();

  if (audioUrl && !sessionUsesClientVoice) {
    await playAudioBufferViaContext(audioUrl);
  } else {
    // Seamless natural browser speech synthesis
    await speakChunkViaWebSpeech(item.text, currentVoice);
  }

  if (!isQueueRunning) return;

  item.status = 'completed';
  activeQueueIndex++;

  if (activeQueueIndex < activeQueue.length) {
    processSpeechQueue();
  } else {
    // All chunks finished cleanly
    stopModelAudio();
  }
}

// 7. Public API: Start Queue for full diagnostic string without truncation
export function startAudioQueue(
  fullText: string,
  voice: 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir' = 'Kore'
) {
  stopModelAudio();

  const chunks = prepareSpeechChunks(fullText, 320);
  if (!chunks || chunks.length === 0) {
    notifyListeners();
    return;
  }

  currentVoice = voice;
  activeQueue = chunks.map((chunk, idx) => ({
    id: `chunk-${Date.now()}-${idx}`,
    index: idx,
    total: chunks.length,
    text: chunk,
    status: 'queued',
  }));

  activeQueueIndex = 0;
  isQueueRunning = true;
  isQueuePaused = false;
  prefetchCache.clear();
  activeAbortController = new AbortController();

  notifyListeners();
  processSpeechQueue();
}

// 8. Public API: Stop playback and flush queue
export function stopModelAudio(onStateChange?: (state: 'idle') => void) {
  isQueueRunning = false;
  isQueuePaused = false;

  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }

  if (currentSourceNode) {
    try {
      currentSourceNode.stop();
    } catch {}
    currentSourceNode = null;
  }

  if (currentAudioElement) {
    currentAudioElement.pause();
    currentAudioElement.currentTime = 0;
    currentAudioElement = null;
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
    currentUtterance = null;
  }

  activeQueue = [];
  activeQueueIndex = 0;
  prefetchCache.clear();

  notifyListeners();
  onStateChange?.('idle');
}

// 9. Pause Queue
export function pauseModelAudio() {
  if (!isQueueRunning || isQueuePaused) return;
  isQueuePaused = true;

  const audioCtx = getAudioContext();
  if (audioCtx && audioCtx.state === 'running') {
    audioCtx.suspend().catch(() => {});
  }
  if (currentAudioElement) {
    currentAudioElement.pause();
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
    window.speechSynthesis.pause();
  }

  notifyListeners();
}

// 10. Resume Queue
export function resumeModelAudio() {
  if (!isQueueRunning || !isQueuePaused) return;
  isQueuePaused = false;

  const audioCtx = getAudioContext();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  if (currentAudioElement) {
    currentAudioElement.play().catch(() => {});
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
  }

  notifyListeners();
}

// 11. Skip to next chunk in queue
export function skipToNextChunk() {
  if (!isQueueRunning || activeQueueIndex >= activeQueue.length - 1) return;

  if (currentSourceNode) {
    try { currentSourceNode.stop(); } catch {}
  }
  if (currentAudioElement) {
    currentAudioElement.pause();
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  activeQueueIndex++;
  processSpeechQueue();
}

// 12. Skip to previous chunk in queue
export function skipToPrevChunk() {
  if (!isQueueRunning || activeQueueIndex <= 0) return;

  if (currentSourceNode) {
    try { currentSourceNode.stop(); } catch {}
  }
  if (currentAudioElement) {
    currentAudioElement.pause();
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  activeQueueIndex--;
  processSpeechQueue();
}

// Backward compatibility alias for single-call invocation
export async function playModelAudio(
  text: string,
  voice: 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir' = 'Kore',
  onStateChange?: (state: 'loading' | 'playing' | 'idle') => void
): Promise<void> {
  const unsub = subscribeToAudioQueue((state) => {
    if (state.isLoading) onStateChange?.('loading');
    else if (state.isPlaying) onStateChange?.('playing');
    else onStateChange?.('idle');
  });

  startAudioQueue(text, voice);
}
