import React from 'react';
import { Volume2, VolumeX, Loader2 } from 'lucide-react';
import { useAudioVoice } from '../context/AudioContext';

interface AudioListenButtonProps {
  text: string;
  voice?: 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir';
  className?: string;
  label?: string;
  variant?: 'compact' | 'full';
}

export const AudioListenButton: React.FC<AudioListenButtonProps> = ({
  text,
  voice = 'Kore',
  className = '',
  label,
  variant = 'compact',
}) => {
  const {
    isAudioPlaying,
    isAudioLoading,
    speakModelOutput,
    stopAudio,
    currentChunkIndex,
    totalChunks,
  } = useAudioVoice();

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAudioPlaying || isAudioLoading) {
      stopAudio();
    } else {
      speakModelOutput(text, voice);
    }
  };

  const isActive = isAudioPlaying || isAudioLoading;

  if (variant === 'full') {
    return (
      <button
        onClick={handleToggle}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          isActive
            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
            : 'bg-sky-500/15 text-sky-300 border border-sky-500/30 hover:bg-sky-500/25'
        } ${className}`}
        title={isActive ? 'Stop audio stream' : 'Stream full model diagnostic audio'}
      >
        {isAudioLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
        ) : isAudioPlaying ? (
          <VolumeX className="w-3.5 h-3.5 text-rose-400" />
        ) : (
          <Volume2 className="w-3.5 h-3.5 text-sky-400" />
        )}
        <span>
          {isAudioLoading
            ? 'Buffering...'
            : isAudioPlaying
            ? `Stop Audio (${currentChunkIndex + 1}/${totalChunks})`
            : label || 'Listen (Stream Audio)'}
        </span>
        {isAudioPlaying && (
          <span className="flex items-center gap-0.5 ml-1">
            <span className="w-1 h-3 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-4 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-2 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleToggle}
      className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
        isActive
          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
          : 'bg-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-700'
      } ${className}`}
      title={isActive ? 'Stop audio' : 'Stream full response audio'}
    >
      {isAudioLoading ? (
        <Loader2 className="w-3 h-3 animate-spin text-sky-400" />
      ) : isAudioPlaying ? (
        <VolumeX className="w-3 h-3 text-rose-400" />
      ) : (
        <Volume2 className="w-3 h-3 text-sky-400" />
      )}
      <span>
        {isAudioLoading
          ? 'Buffering'
          : isAudioPlaying
          ? `Stop (${currentChunkIndex + 1}/${totalChunks})`
          : 'Listen'}
      </span>

      {isAudioPlaying && (
        <span className="flex items-center gap-0.5 ml-0.5">
          <span className="w-0.5 h-2.5 bg-rose-400 rounded-full animate-pulse" />
          <span className="w-0.5 h-3 bg-rose-400 rounded-full animate-pulse" style={{ animationDelay: '100ms' }} />
          <span className="w-0.5 h-2 bg-rose-400 rounded-full animate-pulse" style={{ animationDelay: '200ms' }} />
        </span>
      )}
    </button>
  );
};
