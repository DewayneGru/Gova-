import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  startAudioQueue,
  stopModelAudio,
  pauseModelAudio,
  resumeModelAudio,
  skipToNextChunk,
  skipToPrevChunk,
  subscribeToAudioQueue,
  SpeechQueueItem,
  SpeechQueueState,
  getAudioContext,
  setStudioWarmthMaster,
  setSpeechPlaybackRate,
} from '../lib/audioPlayer';

export interface AudioVoiceContextType {
  autoAudioReadout: boolean;
  setAutoAudioReadout: (enabled: boolean | ((prev: boolean) => boolean)) => void;
  preferredVoice: 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir';
  setPreferredVoice: (voice: 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir') => void;
  warmthMasterEnabled: boolean;
  setWarmthMasterEnabled: (enabled: boolean) => void;
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  isAudioPlaying: boolean;
  isAudioLoading: boolean;
  isAudioPaused: boolean;
  queue: SpeechQueueItem[];
  currentChunkIndex: number;
  totalChunks: number;
  currentSpeakingText: string;
  progressPercent: number;
  isClientVoice?: boolean;
  speakModelOutput: (text: string, voice?: 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir') => void;
  stopAudio: () => void;
  pauseAudio: () => void;
  resumeAudio: () => void;
  skipNextChunk: () => void;
  skipPrevChunk: () => void;
}

const AudioVoiceContext = createContext<AudioVoiceContextType | undefined>(undefined);

export const AudioVoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [autoAudioReadout, setAutoAudioReadoutState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('snn_auto_audio_readout');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [preferredVoice, setPreferredVoiceState] = useState<'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir'>(() => {
    try {
      const saved = localStorage.getItem('snn_preferred_voice') as any;
      return saved && ['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir'].includes(saved) ? saved : 'Kore';
    } catch {
      return 'Kore';
    }
  });

  const [queueState, setQueueState] = useState<SpeechQueueState>({
    isPlaying: false,
    isLoading: false,
    isPaused: false,
    queue: [],
    currentIndex: 0,
    totalChunks: 0,
    currentText: '',
    progressPercent: 0,
    voice: 'Kore',
    warmthMasterEnabled: true,
    playbackRate: 1.0,
  });

  // Subscribe to AudioQueue streaming engine
  useEffect(() => {
    const unsubscribe = subscribeToAudioQueue((state) => {
      setQueueState(state);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const setAutoAudioReadout = (val: boolean | ((prev: boolean) => boolean)) => {
    setAutoAudioReadoutState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      try {
        localStorage.setItem('snn_auto_audio_readout', String(next));
      } catch {}
      return next;
    });
  };

  const setPreferredVoice = (voice: 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir') => {
    setPreferredVoiceState(voice);
    try {
      localStorage.setItem('snn_preferred_voice', voice);
    } catch {}
  };

  const speakModelOutput = (text: string, voiceOverride?: 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir') => {
    const voice = voiceOverride || preferredVoice;
    // Ensure Web Audio AudioContext is active on user event
    getAudioContext();
    startAudioQueue(text, voice);
  };

  const stopAudio = () => {
    stopModelAudio();
  };

  const pauseAudio = () => {
    pauseModelAudio();
  };

  const resumeAudio = () => {
    resumeModelAudio();
  };

  const skipNext = () => {
    skipToNextChunk();
  };

  const skipPrev = () => {
    skipToPrevChunk();
  };

  return (
    <AudioVoiceContext.Provider
      value={{
        autoAudioReadout,
        setAutoAudioReadout,
        preferredVoice,
        setPreferredVoice,
        warmthMasterEnabled: queueState.warmthMasterEnabled ?? true,
        setWarmthMasterEnabled: setStudioWarmthMaster,
        playbackRate: queueState.playbackRate ?? 1.0,
        setPlaybackRate: setSpeechPlaybackRate,
        isAudioPlaying: queueState.isPlaying,
        isAudioLoading: queueState.isLoading,
        isAudioPaused: queueState.isPaused,
        queue: queueState.queue,
        currentChunkIndex: queueState.currentIndex,
        totalChunks: queueState.totalChunks,
        currentSpeakingText: queueState.currentText,
        progressPercent: queueState.progressPercent,
        isClientVoice: queueState.isClientVoice,
        speakModelOutput,
        stopAudio,
        pauseAudio,
        resumeAudio,
        skipNextChunk: skipNext,
        skipPrevChunk: skipPrev,
      }}
    >
      {children}
    </AudioVoiceContext.Provider>
  );
};

export const useAudioVoice = () => {
  const ctx = useContext(AudioVoiceContext);
  if (!ctx) {
    throw new Error('useAudioVoice must be used within AudioVoiceProvider');
  }
  return ctx;
};
