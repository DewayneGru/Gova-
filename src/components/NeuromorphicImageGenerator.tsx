import React, { useState } from 'react';
import { GeneratedNeuromorphicImage } from '../types';
import { ImageIcon, Sparkles, Download, Layers, Check, Loader2, Maximize2 } from 'lucide-react';

export const NeuromorphicImageGenerator: React.FC = () => {
  const [prompt, setPrompt] = useState(
    'Silicon Neuromorphic Die with Glowing Synaptic Memristor Crossbar Array, sub-threshold CMOS neural core, microscopic macro photography, 8k'
  );
  // Image size affordance: 1K, 2K, and 4K as requested
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [aspectRatio, setAspectRatio] = useState<string>('1:1');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [gallery, setGallery] = useState<GeneratedNeuromorphicImage[]>([
    {
      id: 'sample-1',
      prompt:
        'Silicon Neuromorphic Processor Die with Synaptic Memristor Arrays and AER Interconnects',
      imageUrl:
        'https://picsum.photos/seed/neuromorphic-die/1024/1024',
      size: '1K',
      aspectRatio: '1:1',
      timestamp: Date.now() - 120000,
    },
  ]);
  const [previewImage, setPreviewImage] = useState<GeneratedNeuromorphicImage | null>(null);

  const promptPresets = [
    {
      title: 'Silicon Synaptic Core',
      prompt:
        'Silicon Neuromorphic Die with Glowing Synaptic Memristor Crossbar Array, sub-threshold CMOS neural core, microscopic macro photography, 8k',
    },
    {
      title: 'Neuromorphic Event Processor',
      prompt:
        'Neuromorphic Spiking Processor Die with Event-Driven AER Bus Communication Channels, cyberpunk neon traces, microscopic 8k photorealistic',
    },
    {
      title: 'Biological Spiking Action Potential',
      prompt:
        'Biological Spiking Neuron with Dendritic STDP Plasticity Glow and Neurotransmitter Vesicles Firing in Brain Synapse, scientific 3D illustration',
    },
    {
      title: 'Edge Neuromorphic IoT Board',
      prompt:
        'Ultra-low-power Embedded Neuromorphic Edge AI Accelerator Board with Asynchronous Clockless Processor on Dark Minimalist Studio Background',
    },
  ];

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          imageSize, // Explicit 1K, 2K, or 4K affordance
          aspectRatio,
        }),
      });

      if (!response.ok) {
        let errorText = `HTTP ${response.status}`;
        try {
          const errData = await response.json();
          errorText = errData.error || errorText;
        } catch (_) {}

        if (errorText.includes('503') || errorText.includes('high demand') || errorText.includes('UNAVAILABLE')) {
          errorText = 'The visual generation model is experiencing temporary peak demand. Please retry shortly.';
        }
        throw new Error(errorText);
      }

      const data = await response.json();
      const newImage: GeneratedNeuromorphicImage = {
        id: `img-${Date.now()}`,
        prompt: prompt.trim(),
        imageUrl: data.imageUrl,
        size: imageSize,
        aspectRatio,
        timestamp: Date.now(),
      };

      setGallery((prev) => [newImage, ...prev]);
    } catch (err: any) {
      console.warn('Image Gen notice:', err?.message || err);
      let displayError = err?.message || 'Failed to generate image with gemini-3-pro-image-preview';
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
      setIsGenerating(false);
    }
  };

  const downloadImage = async (url: string, filename: string) => {
    try {
      if (url.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div id="image-generation-panel" className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 shadow">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-slate-100">
            High-Quality Neuromorphic Visualization Studio
          </h3>
          <span className="text-[10px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded">
            Model: gemini-3-pro-image-preview
          </span>
        </div>

        {/* Explicit Affordance for Image Size: 1K, 2K, and 4K */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 text-[11px] font-medium">Output Resolution:</span>
          <div className="flex bg-slate-950 rounded-lg p-0.5 border border-slate-800">
            {(['1K', '2K', '4K'] as const).map((size) => (
              <button
                key={size}
                onClick={() => setImageSize(size)}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                  imageSize === size
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {size}
              </button>
            ))}
          </div>

          <div className="flex bg-slate-950 rounded-lg p-0.5 border border-slate-800 ml-1">
            {['1:1', '16:9', '4:3'].map((ratio) => (
              <button
                key={ratio}
                onClick={() => setAspectRatio(ratio)}
                className={`px-2 py-1 rounded text-xs transition-all ${
                  aspectRatio === ratio
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Preset Chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
        {promptPresets.map((preset, idx) => (
          <button
            key={idx}
            onClick={() => setPrompt(preset.prompt)}
            className="shrink-0 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Sparkles className="w-3 h-3 text-purple-400" />
            <span>{preset.title}</span>
          </button>
        ))}
      </div>

      {/* Input Prompt Box */}
      <div className="flex flex-col sm:flex-row gap-2">
        <textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe neuromorphic silicon architecture, spiking synapse array, AER event bus die..."
          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
          disabled={isGenerating}
        />
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 shrink-0 shadow-md"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Rendering {imageSize}...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Generate ({imageSize})</span>
            </>
          )}
        </button>
      </div>

      {errorMsg && (
        <div className="p-2.5 rounded bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
          {errorMsg}
        </div>
      )}

      {/* Gallery Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
        {gallery.map((item) => (
          <div
            key={item.id}
            className="group relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950 aspect-square"
          >
            <img
              src={item.imageUrl}
              alt={item.prompt}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />

            {/* Badge */}
            <div className="absolute top-1.5 left-1.5 bg-slate-900/80 backdrop-blur-sm text-[10px] font-mono text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/30">
              {item.size}
            </div>

            {/* Hover Actions */}
            <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
              <p className="text-[10px] text-slate-200 line-clamp-3 leading-tight">{item.prompt}</p>

              <div className="flex justify-end gap-1.5">
                <button
                  onClick={() => setPreviewImage(item)}
                  className="p-1.5 bg-slate-800/90 hover:bg-slate-700 text-white rounded"
                  title="Expand"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => downloadImage(item.imageUrl, `neuromorphic-${item.size}.png`)}
                  className="p-1.5 bg-purple-600/90 hover:bg-purple-500 text-white rounded"
                  title="Download"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Fullscreen Lightbox Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col">
            <div className="p-3 border-b border-slate-800 flex justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-200">High-Res Render ({previewImage.size})</span>
                <span className="text-slate-400 font-mono">{previewImage.aspectRatio}</span>
              </div>
              <button
                onClick={() => setPreviewImage(null)}
                className="text-slate-400 hover:text-white px-2 py-1"
              >
                ✕ Close
              </button>
            </div>
            <div className="max-h-[70vh] overflow-hidden flex items-center justify-center bg-black">
              <img
                src={previewImage.imageUrl}
                alt={previewImage.prompt}
                referrerPolicy="no-referrer"
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>
            <div className="p-3 border-t border-slate-800 flex justify-between items-center gap-3">
              <p className="text-xs text-slate-300 font-mono line-clamp-2">{previewImage.prompt}</p>
              <button
                onClick={() => downloadImage(previewImage.imageUrl, `neuromorphic-${previewImage.size}.png`)}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Download {previewImage.size}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
