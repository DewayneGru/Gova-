import React, { useState, useEffect, useRef } from 'react';
import {
  SNNPersonalityProfile,
  SNNTuningConfig,
  STDPConfig,
  Synapse,
} from '../types';
import {
  Download,
  Upload,
  Save,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  Sliders,
  Sparkles,
  Info,
  X,
  FileCode,
  Layers,
  Zap,
  Activity,
  Copy,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SNNPersonalityManagerProps {
  currentTuning: SNNTuningConfig;
  currentStdpConfig: STDPConfig;
  synapses: Synapse[];
  onApplyPersonality: (profile: SNNPersonalityProfile) => void;
  onExportPersonality: (
    name: string,
    description: string,
    category: SNNPersonalityProfile['category'],
    tags: string[]
  ) => SNNPersonalityProfile;
}

export const SNNPersonalityManager: React.FC<SNNPersonalityManagerProps> = ({
  currentTuning,
  currentStdpConfig,
  synapses,
  onApplyPersonality,
  onExportPersonality,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'export' | 'import' | 'library'>('export');

  // Export form fields
  const [profileName, setProfileName] = useState('Homeostatic SNN Profile');
  const [profileDesc, setProfileDesc] = useState('Balanced biological STDP weights with anti-divergence safety invariants');
  const [category, setCategory] = useState<SNNPersonalityProfile['category']>('homeostatic_sentinel');
  const [tagsInput, setTagsInput] = useState('stdp, anti-divergence, edge-ready');
  const [exportedJsonString, setExportedJsonString] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);

  // Import / upload state
  const [importMode, setImportMode] = useState<'file' | 'paste'>('file');
  const [pastedJson, setPastedJson] = useState('');
  const [importedProfile, setImportedProfile] = useState<SNNPersonalityProfile | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showJsonPreview, setShowJsonPreview] = useState(true);

  // Server library presets
  const [serverLibrary, setServerLibrary] = useState<SNNPersonalityProfile[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [appliedNotification, setAppliedNotification] = useState<string | null>(null);
  const { user, getFreshIdToken } = useAuth();

  // Fetch presets / saved profiles on open
  useEffect(() => {
    if (isOpen) {
      loadServerLibrary();
      generateExportProfile();
    }
  }, [isOpen, user]);

  const loadServerLibrary = async () => {
    setIsLoadingLibrary(true);
    try {
      const token = user ? await getFreshIdToken() : null;
      const endpoint = token ? '/api/user/personalities' : '/api/snn/personalities';
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(endpoint, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.personalities) {
          setServerLibrary(data.personalities);
        }
      }
    } catch (_err) {
      console.warn('Could not load personality library from server.');
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const generateExportProfile = () => {
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const profile = onExportPersonality(profileName, profileDesc, category, tags);
    const jsonStr = JSON.stringify(profile, null, 2);
    setExportedJsonString(jsonStr);
    return { profile, jsonStr };
  };

  // Re-sync preview on parameter changes
  useEffect(() => {
    if (isOpen && activeTab === 'export') {
      generateExportProfile();
    }
  }, [profileName, profileDesc, category, tagsInput, activeTab]);

  const handleDownloadFile = () => {
    const { profile, jsonStr } = generateExportProfile();
    const safeSlug = (profile.name || 'snn-personality')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const filename = `${safeSlug}-${Date.now()}.json`;

    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Also persist to server / user library for convenience and update state
    (async () => {
      try {
        const token = user ? await getFreshIdToken() : null;
        const endpoint = token ? '/api/user/personalities' : '/api/snn/personalities';
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        const r = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(profile),
        });
        if (r.ok) {
          const data = await r.json();
          if (data.savedProfile) {
            setServerLibrary((prev) => [data.savedProfile, ...prev]);
          }
        }
      } catch {
        // Ignore non-fatal sync error
      }
    })();
  };

  const handleCopyJson = () => {
    const { jsonStr } = generateExportProfile();
    navigator.clipboard.writeText(jsonStr);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const parseAndValidateJson = (content: string) => {
    setImportError(null);
    setImportedProfile(null);
    try {
      const parsed = JSON.parse(content.trim());
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Provided input is not a valid JSON object.');
      }
      const tuning = parsed.tuningConfig || parsed.parameters;
      if (!tuning || typeof tuning !== 'object') {
        throw new Error('Missing "tuningConfig" block in personality JSON.');
      }
      setImportedProfile(parsed);
      return parsed;
    } catch (err: any) {
      setImportError(err.message || 'Failed to parse JSON personality content.');
      return null;
    }
  };

  const handleFileChange = (file: File) => {
    setImportError(null);
    setImportedProfile(null);

    if (!file.name.endsWith('.json')) {
      setImportError('Please provide a valid .json personality file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      parseAndValidateJson(content);
    };
    reader.onerror = () => {
      setImportError('Failed to read file from disk.');
    };
    reader.readAsText(file);
  };

  const handleApplyImported = (profileToApply: SNNPersonalityProfile) => {
    onApplyPersonality(profileToApply);
    setAppliedNotification(`Loaded personality: "${profileToApply.name}"`);
    setTimeout(() => {
      setAppliedNotification(null);
      setIsOpen(false);
    }, 1800);
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="px-2.5 py-1.5 bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/80 hover:border-sky-500/50 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
        title="Export or reload SNN tuning configuration and synaptic weights as JSON personality files"
      >
        <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
        <span>SNN Personalities & States</span>
        <span className="text-[10px] font-mono bg-sky-500/20 text-sky-300 px-1.5 py-0.2 rounded border border-sky-500/30">
          JSON
        </span>
      </button>

      {/* Modal Dialog */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="bg-[#0b101e] border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-md shadow-sky-500/20">
                  <Sliders className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    SNN Tuning & Synaptic State Profiles
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                      v1.1 JSON
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Export synaptic weights, STDP plasticity rules, and restore specific model personalities
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Notification Banner */}
            {appliedNotification && (
              <div className="bg-emerald-950/60 border-b border-emerald-500/40 px-4 py-2.5 flex items-center gap-2 text-xs text-emerald-300 font-medium animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{appliedNotification}</span>
              </div>
            )}

            {/* Nav Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 pt-2 gap-2 text-xs">
              <button
                onClick={() => setActiveTab('export')}
                className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-all ${
                  activeTab === 'export'
                    ? 'border-sky-500 text-sky-400 bg-sky-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Current State</span>
              </button>

              <button
                onClick={() => setActiveTab('import')}
                className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-all ${
                  activeTab === 'import'
                    ? 'border-sky-500 text-sky-400 bg-sky-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import JSON Personality</span>
              </button>

              <button
                onClick={() => setActiveTab('library')}
                className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-all ${
                  activeTab === 'library'
                    ? 'border-sky-500 text-sky-400 bg-sky-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Presets Library ({serverLibrary.length})</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto flex-1 space-y-4 text-xs text-slate-300">
              {/* TAB 1: EXPORT */}
              {activeTab === 'export' && (
                <div className="space-y-4">
                  {/* Current Active Specs Summary */}
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
                    <div className="text-[11px] font-semibold text-slate-200 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-sky-400">
                        <Activity className="w-3.5 h-3.5" /> Live Synaptic Snapshot
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {synapses.length} Synapses Connected
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                      <div className="bg-slate-950/80 p-2 rounded border border-slate-800">
                        <span className="text-slate-500 block text-[9px]">LTP (A+)</span>
                        <span className="text-emerald-400 font-bold">{currentStdpConfig.aPlus.toFixed(3)}</span>
                      </div>
                      <div className="bg-slate-950/80 p-2 rounded border border-slate-800">
                        <span className="text-slate-500 block text-[9px]">LTD (A-)</span>
                        <span className="text-rose-400 font-bold">{currentStdpConfig.aMinus.toFixed(3)}</span>
                      </div>
                      <div className="bg-slate-950/80 p-2 rounded border border-slate-800">
                        <span className="text-slate-500 block text-[9px]">Learning Rate (η)</span>
                        <span className="text-sky-400 font-bold">{currentStdpConfig.learningRate.toFixed(2)}</span>
                      </div>
                      <div className="bg-slate-950/80 p-2 rounded border border-slate-800">
                        <span className="text-slate-500 block text-[9px]">Projection Gain</span>
                        <span className="text-amber-400 font-bold">{currentTuning.turnGain.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Profile Metadata Fields */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        Personality Profile Name
                      </label>
                      <input
                        type="text"
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        placeholder="e.g. Ultra-Stable Homeostatic Sentinel"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        Description & Tuning Rationale
                      </label>
                      <textarea
                        rows={2}
                        value={profileDesc}
                        onChange={(e) => setProfileDesc(e.target.value)}
                        placeholder="Explain the functional characteristics, plasticity boundaries, or target deployment environment..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500 resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-300 font-medium mb-1">
                          Category Archetype
                        </label>
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value as any)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                        >
                          <option value="homeostatic_sentinel">Homeostatic Sentinel (Anti-Divergence)</option>
                          <option value="cautious_explorer">Cautious Explorer (High LTD dominance)</option>
                          <option value="hyper_responsive">Hyper-Responsive (Elevated Associative Gain)</option>
                          <option value="ultra_sparse_edge">Ultra-Sparse Edge (Sub-milliwatt micropower)</option>
                          <option value="custom">Custom Configuration</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-300 font-medium mb-1">
                          Tags (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={tagsInput}
                          onChange={(e) => setTagsInput(e.target.value)}
                          placeholder="e.g. edge, low-power, stdp"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Live JSON Preview Box */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden">
                    <div className="px-3 py-2 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <FileCode className="w-3.5 h-3.5 text-sky-400" />
                        <span className="font-semibold text-slate-200">Export Payload Preview</span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {synapses.length} Synapses • ~{Math.round((exportedJsonString.length || 1024) / 1024)} KB
                        </span>
                      </div>
                      <button
                        onClick={() => setShowJsonPreview(!showJsonPreview)}
                        className="text-[10px] text-sky-400 hover:text-sky-300 font-mono"
                      >
                        {showJsonPreview ? 'Collapse Preview' : 'Expand Preview'}
                      </button>
                    </div>

                    {showJsonPreview && (
                      <div className="p-2.5 max-h-36 overflow-y-auto font-mono text-[10px] text-slate-400 leading-relaxed bg-[#070b14] select-all">
                        <pre>{exportedJsonString || '// Generating profile snapshot...'}</pre>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                    <button
                      onClick={handleCopyJson}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{isCopied ? 'JSON Copied!' : 'Copy JSON to Clipboard'}</span>
                    </button>

                    <button
                      onClick={handleDownloadFile}
                      className="px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg shadow-sky-600/20 transition-all cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Personality JSON</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: IMPORT */}
              {activeTab === 'import' && (
                <div className="space-y-4">
                  {/* Mode switcher: File vs Paste */}
                  <div className="flex items-center gap-2 pb-1 border-b border-slate-800/80 text-xs">
                    <span className="text-slate-400 font-medium">Import Source:</span>
                    <button
                      onClick={() => setImportMode('file')}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                        importMode === 'file'
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Upload File (.json)
                    </button>
                    <button
                      onClick={() => setImportMode('paste')}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                        importMode === 'paste'
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Paste Raw JSON
                    </button>
                  </div>

                  {importMode === 'file' ? (
                    /* File Upload Area */
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          handleFileChange(e.dataTransfer.files[0]);
                        }
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                        dragOver
                          ? 'border-sky-400 bg-sky-950/30'
                          : 'border-slate-700/80 hover:border-sky-500/50 bg-slate-950/50'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleFileChange(e.target.files[0]);
                          }
                        }}
                        className="hidden"
                      />

                      <div className="w-10 h-10 rounded-full bg-sky-500/10 border border-sky-500/20 mx-auto flex items-center justify-center text-sky-400 mb-2">
                        <FileCode className="w-5 h-5" />
                      </div>
                      <div className="text-xs font-semibold text-slate-200">
                        Drop your SNN personality JSON file here, or browse
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Supports exported .json files containing tuning parameters and synaptic matrix states
                      </div>
                    </div>
                  ) : (
                    /* Paste Raw JSON Text */
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>Paste raw SNN personality profile JSON content below:</span>
                        {pastedJson && (
                          <button
                            onClick={() => {
                              setPastedJson('');
                              setImportedProfile(null);
                              setImportError(null);
                            }}
                            className="text-slate-500 hover:text-rose-400"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <textarea
                        rows={6}
                        value={pastedJson}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPastedJson(val);
                          if (val.trim()) {
                            parseAndValidateJson(val);
                          } else {
                            setImportedProfile(null);
                            setImportError(null);
                          }
                        }}
                        placeholder='{\n  "name": "Custom Profile",\n  "tuningConfig": { "aPlus": 0.032, "aMinus": 0.052, ... },\n  "synapticState": { ... }\n}'
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-[11px] text-slate-200 focus:outline-none focus:border-sky-500 resize-none"
                      />
                    </div>
                  )}

                  {/* Error display */}
                  {importError && (
                    <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">Validation Error</div>
                        <div className="text-[11px] text-rose-200/90">{importError}</div>
                      </div>
                    </div>
                  )}

                  {/* Parsed Personality Preview */}
                  {importedProfile && (
                    <div className="bg-slate-900/90 border border-sky-500/30 rounded-xl p-3.5 space-y-3 animate-in fade-in">
                      <div className="flex items-start justify-between border-b border-slate-800 pb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-slate-100">{importedProfile.name}</h4>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                              {importedProfile.category}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{importedProfile.description}</p>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">
                          {importedProfile.synapticState?.totalSynapses || 0} Synapses
                        </span>
                      </div>

                      {/* Parameter Comparison Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                        <div className="bg-slate-950 p-2 rounded border border-slate-800">
                          <span className="text-slate-500 block text-[9px]">LTP (A+)</span>
                          <span className="text-emerald-400 font-bold">
                            {importedProfile.tuningConfig?.aPlus?.toFixed(3) ??
                              importedProfile.stdpConfig?.aPlus?.toFixed(3)}
                          </span>
                        </div>
                        <div className="bg-slate-950 p-2 rounded border border-slate-800">
                          <span className="text-slate-500 block text-[9px]">LTD (A-)</span>
                          <span className="text-rose-400 font-bold">
                            {importedProfile.tuningConfig?.aMinus?.toFixed(3) ??
                              importedProfile.stdpConfig?.aMinus?.toFixed(3)}
                          </span>
                        </div>
                        <div className="bg-slate-950 p-2 rounded border border-slate-800">
                          <span className="text-slate-500 block text-[9px]">Learning Rate</span>
                          <span className="text-sky-400 font-bold">
                            {importedProfile.tuningConfig?.learningRate?.toFixed(2) ??
                              importedProfile.stdpConfig?.learningRate?.toFixed(2)}
                          </span>
                        </div>
                        <div className="bg-slate-950 p-2 rounded border border-slate-800">
                          <span className="text-slate-500 block text-[9px]">Projection Gain</span>
                          <span className="text-amber-400 font-bold">
                            {importedProfile.tuningConfig?.turnGain?.toFixed(2) ?? '3.50'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div className="text-[11px] text-slate-400">
                          Mean Weight:{' '}
                          <span className="font-mono text-slate-200">
                            {importedProfile.synapticState?.meanWeight?.toFixed(3) || 'N/A'}
                          </span>
                        </div>

                        <button
                          onClick={() => handleApplyImported(importedProfile)}
                          className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Apply Personality to Simulation</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: LIBRARY PRESETS */}
              {activeTab === 'library' && (
                <div className="space-y-3">
                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Curated SNN model personality templates and saved states</span>
                    {isLoadingLibrary && <span className="font-mono text-sky-400">Loading...</span>}
                  </div>

                  <div className="space-y-2.5">
                    {serverLibrary.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-900/60 border border-slate-800 hover:border-sky-500/40 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors"
                      >
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-100 text-xs">{item.name}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                              {item.category}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed">{item.description}</p>
                          <div className="flex flex-wrap gap-2 text-[10px] font-mono text-slate-500 pt-0.5">
                            <span>A+: {item.tuningConfig?.aPlus}</span>
                            <span>•</span>
                            <span>A-: {item.tuningConfig?.aMinus}</span>
                            <span>•</span>
                            <span>η: {item.tuningConfig?.learningRate}</span>
                            <span>•</span>
                            <span>Gain: {item.tuningConfig?.turnGain}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => {
                              const blob = new Blob([JSON.stringify(item, null, 2)], {
                                type: 'application/json',
                              });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                            }}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                            title="Download JSON file"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleApplyImported(item)}
                            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Apply</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1 font-mono">
                <Info className="w-3 h-3 text-sky-400" />
                Format: SNN State Schema 1.1 with full weight matrix snapshot
              </span>
              <button
                onClick={() => setIsOpen(false)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
