import React from 'react';
import { useAudioVoice } from '../context/AudioContext';
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Square,
  Radio,
  Sparkles,
  Loader2,
} from 'lucide-react';

export const AudioStreamingQueueBar: React.FC = () => {
  const {
    isAudioPlaying,
    isAudioLoading,
    isAudioPaused,
    currentChunkIndex,
    totalChunks,
    currentSpeakingText,
    progressPercent,
    preferredVoice,
    isClientVoice,
    pauseAudio,
    resumeAudio,
    stopAudio,
    skipNextChunk,
    skipPrevChunk,
  } = useAudioVoice();

  // Only render if audio is active or paused with chunks queued
  if (!isAudioPlaying && !isAudioLoading && !isAudioPaused && totalChunks === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-2xl bg-slate-900/95 backdrop-blur-md border border-sky-500/40 rounded-xl p-3.5 shadow-2xl shadow-sky-950/50 text-slate-200 transition-all animate-in fade-in slide-in-from-bottom-3 duration-200">
      <div className="flex flex-col gap-2">
        {/* Top line: Stream Status & Chunk Counter & Controls */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-300">
              {isAudioLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
              ) : isAudioPaused ? (
                <Pause className="w-3.5 h-3.5 text-amber-300" />
              ) : (
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-100 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-sky-400" />
                  Neuromorphic Telemetry Audio Stream
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  Voice: {preferredVoice} {isClientVoice ? '(Speech Synthesizer)' : '(Gemini Audio)'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                {isAudioLoading
                  ? isClientVoice ? 'Preparing speech...' : 'Synthesizing chunk...'
                  : isAudioPaused
                  ? `Paused at Sentence ${currentChunkIndex + 1} of ${totalChunks}`
                  : `Reading Sentence ${currentChunkIndex + 1} of ${totalChunks} (${progressPercent}% read)`}
              </p>
            </div>
          </div>

          {/* Queue Playback Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={skipPrevChunk}
              disabled={currentChunkIndex <= 0}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              title="Previous chunk"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            {isAudioPaused ? (
              <button
                onClick={resumeAudio}
                className="p-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1 text-xs transition-colors shadow-sm"
                title="Resume streaming"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Resume</span>
              </button>
            ) : (
              <button
                onClick={pauseAudio}
                className="p-1.5 px-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium flex items-center gap-1 text-xs transition-colors shadow-sm"
                title="Pause audio"
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </button>
            )}

            <button
              onClick={skipNextChunk}
              disabled={currentChunkIndex >= totalChunks - 1}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              title="Next chunk"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={stopAudio}
              className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition-colors ml-1"
              title="Stop audio queue"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          </div>
        </div>

        {/* Current Spoken Excerpt Box */}
        {currentSpeakingText && (
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 font-sans line-clamp-2 italic">
            "{currentSpeakingText}"
          </div>
        )}

        {/* Segmented Queue Progress Bar */}
        <div className="flex items-center gap-1 pt-0.5">
          {Array.from({ length: totalChunks }).map((_, idx) => {
            const isCompleted = idx < currentChunkIndex;
            const isCurrent = idx === currentChunkIndex;
            return (
              <div
                key={idx}
                className={`h-1.5 flex-1 rounded-full transition-all ${
                  isCompleted
                    ? 'bg-emerald-400'
                    : isCurrent
                    ? 'bg-sky-400 animate-pulse'
                    : 'bg-slate-800'
                }`}
                title={`Chunk ${idx + 1} of ${totalChunks}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
