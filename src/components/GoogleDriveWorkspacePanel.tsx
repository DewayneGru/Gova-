import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  HardDrive,
  RefreshCw,
  Upload,
  Trash2,
  FileText,
  FileCode,
  Search,
  CheckCircle2,
  AlertTriangle,
  Eye,
  X,
  FolderSync,
  ExternalLink,
  ShieldCheck,
  Database,
  Clock,
  Sliders,
  Wrench,
  Sparkles,
  Play,
  Pause,
  Camera,
  ArrowRight,
  Zap,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getAccessToken } from '../lib/firebase';
import { globalTelemetryHealthMonitor } from '../lib/telemetryHealthMonitor';
import {
  DriveStorageQuotaInfo,
  DriveSyncSettings,
  DriveSyncLogEntry,
  DebugTrainFixReport,
  BackgroundDriveSyncState,
  globalBackgroundDriveSyncService,
  fetchDriveStorageQuota,
  exportSNNTelemetrySnapshotToDrive,
  runModelDebugTrainFixOptimization,
  formatStorageBytes,
  isSynapseEdgeSnapshotFileName,
} from '../lib/driveSyncService';
import { HardwareTelemetry, SNNTuningConfig } from '../types';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
}

interface PendingMutation {
  type: 'delete' | 'overwrite';
  file: DriveFileItem;
  newContent?: string;
  mimeType?: string;
  summaryLabel: string;
}

interface GoogleDriveWorkspacePanelProps {
  telemetry: HardwareTelemetry;
  tuningConfig: SNNTuningConfig;
  memoryState?: any;
  onImportTuningFromDrive?: (tuning: Partial<SNNTuningConfig>) => void;
}

export const GoogleDriveWorkspacePanel: React.FC<GoogleDriveWorkspacePanelProps> = ({
  telemetry,
  tuningConfig,
  memoryState,
  onImportTuningFromDrive,
}) => {
  const { user, accessToken, needsDriveAuth, signInWithGoogle } = useAuth();
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Background Google Drive Synchronization Service Subscription & Quota State
  const [bgSyncState, setBgSyncState] = useState<BackgroundDriveSyncState>(() =>
    globalBackgroundDriveSyncService.getState()
  );

  useEffect(() => {
    const unsub = globalBackgroundDriveSyncService.subscribe((state) => {
      setBgSyncState(state);
    });
    return unsub;
  }, []);

  // Model Debug, Train & Homeostatic Fix State
  const [isRunningDebugTrain, setIsRunningDebugTrain] = useState(false);
  const [debugTrainReport, setDebugTrainReport] = useState<DebugTrainFixReport | null>(null);

  // File content preview state
  const [previewFile, setPreviewFile] = useState<DriveFileItem | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Mandatory User Confirmation Modal state for mutating/destructive operations
  const [pendingMutation, setPendingMutation] = useState<PendingMutation | null>(null);
  const [isExecutingMutation, setIsExecutingMutation] = useState(false);

  // Keep latest telemetry & tuning in refs and inform background sync service
  const telemetryRef = useRef(telemetry);
  const tuningRef = useRef(tuningConfig);
  const debugReportRef = useRef(debugTrainReport);

  useEffect(() => {
    telemetryRef.current = telemetry;
    tuningRef.current = tuningConfig;
    debugReportRef.current = debugTrainReport;
    globalBackgroundDriveSyncService.setTelemetrySources(
      () => telemetryRef.current,
      () => tuningRef.current,
      () => debugReportRef.current
    );
  }, [telemetry, tuningConfig, debugTrainReport]);

  const resolveToken = useCallback(async (): Promise<string | null> => {
    const token = accessToken || (await getAccessToken());
    return token;
  }, [accessToken]);

  const refreshQuotaInfo = useCallback(async () => {
    await globalBackgroundDriveSyncService.refreshStorageQuota();
  }, []);

  const fetchDriveFiles = useCallback(
    async (queryOverride?: string) => {
      const token = await resolveToken();
      if (!token) return;

      setIsLoadingFiles(true);
      try {
        const qTerm = (queryOverride !== undefined ? queryOverride : searchQuery).trim();
        const safeQ = qTerm
          ? `trashed = false and name contains '${qTerm.replace(/'/g, "\\'")}'`
          : 'trashed = false';
        const url = `https://www.googleapis.com/drive/v3/files?pageSize=25&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)&orderBy=modifiedTime%20desc&q=${encodeURIComponent(
          safeQ
        )}`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401 || res.status === 403) {
          throw new Error('Google Drive authorization expired or insufficient permissions. Please sign in again.');
        }
        if (!res.ok) {
          throw new Error(`Drive API HTTP ${res.status}`);
        }

        const data = await res.json();
        setFiles(Array.isArray(data.files) ? data.files : []);
      } catch (err: any) {
        setStatusMessage({
          type: 'error',
          text: err?.message || 'Failed to load files from Google Drive.',
        });
      } finally {
        setIsLoadingFiles(false);
      }
    },
    [resolveToken, searchQuery]
  );

  useEffect(() => {
    if (user && !needsDriveAuth && accessToken) {
      fetchDriveFiles();
      refreshQuotaInfo();
    }
  }, [user, needsDriveAuth, accessToken, fetchDriveFiles, refreshQuotaInfo]);

  // Execute an SNNTelemetrySnapshot manual export on-demand
  const handleManualExport = async () => {
    setStatusMessage(null);
    try {
      const res = await globalBackgroundDriveSyncService.triggerManualSnapshot(debugReportRef.current);
      if (res) {
        setStatusMessage({
          type: 'success',
          text: `Saved ${res.fileName} (${formatStorageBytes(res.sizeBytes)}) to Google Drive.`,
        });
        await Promise.all([fetchDriveFiles(), globalBackgroundDriveSyncService.refreshStorageQuota()]);
      } else if (globalBackgroundDriveSyncService.getState().lastError) {
        setStatusMessage({
          type: 'error',
          text: globalBackgroundDriveSyncService.getState().lastError || 'Snapshot export failed.',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Failed to export SNNTelemetrySnapshot to Google Drive.',
      });
    }
  };

  // Run Debug-Train-Fix Optimization Pass
  const handleRunDebugTrainFix = async () => {
    setIsRunningDebugTrain(true);
    setStatusMessage(null);
    try {
      const report = runModelDebugTrainFixOptimization(telemetry, tuningConfig);
      setDebugTrainReport(report);
      if (onImportTuningFromDrive) {
        onImportTuningFromDrive(report.optimizedTuning);
      }

      if (bgSyncState.autoSyncAfterDebugTrain && user && !needsDriveAuth && accessToken) {
        const uploadRes = await globalBackgroundDriveSyncService.triggerPostDebugTrainSync(report);
        if (uploadRes) {
          setStatusMessage({
            type: 'success',
            text: `Completed SNN Debug-Train-Fix pass & exported ${uploadRes.fileName} (${formatStorageBytes(uploadRes.sizeBytes)}) to Google Drive. Health: 100%.`,
          });
        }
        await Promise.all([fetchDriveFiles(), globalBackgroundDriveSyncService.refreshStorageQuota()]);
      } else {
        setStatusMessage({
          type: 'success',
          text: `Completed 12-epoch SNN Debug-Train-Fix pass: Health Score restored to 100% (DRI ${report.after.dri}, A-/A+ ${report.after.ltdLtpRatio}x).`,
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Failed to execute Debug-Train-Fix cycle.',
      });
    } finally {
      setIsRunningDebugTrain(false);
    }
  };

  const buildArtifactPayload = (
    artifactType: 'workspace_memory' | 'correlation_report' | 'performance_csv' | 'system_markdown'
  ): { fileName: string; mimeType: string; content: string; description: string } => {
    const timestampTag = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    if (artifactType === 'workspace_memory') {
      const payload = memoryState || {
        updatedAt: new Date().toISOString(),
        systemName: 'SynapseEdge Neuromorphic Processor v2.5',
        telemetry: {
          meanFiringRateHz: telemetry.meanFiringRateHz,
          powerMw: telemetry.powerMw,
          energyPerSopPj: telemetry.energyPerSopPj,
          synapticOpsPerSec: telemetry.synapticOpsPerSec,
          aerLatencyMs: telemetry.aerLatencyMs,
          cumulativeSTDPDelta: telemetry.cumulativeSTDPDelta,
          valence: telemetry.substrateKeel?.valence ?? 1.2,
        },
        tuningConfig,
      };
      return {
        fileName: 'workspace_memory.json',
        mimeType: 'application/json',
        content: JSON.stringify(payload, null, 2),
        description: 'Live SNN workspace_memory.json context',
      };
    }

    if (artifactType === 'correlation_report') {
      return {
        fileName: `snn-divergence-correlation-report-${timestampTag}.json`,
        mimeType: 'application/json',
        content: globalTelemetryHealthMonitor.exportBufferJson(),
        description: '5-Subsystem SNN Divergence & Correlation Report JSON',
      };
    }

    if (artifactType === 'performance_csv') {
      return {
        fileName: `snn-performance-buffer-${timestampTag}.csv`,
        mimeType: 'text/csv',
        content: globalTelemetryHealthMonitor.exportPerformanceBufferCsv(),
        description: '5-Subsystem Telemetry Performance Buffer CSV',
      };
    }

    const mdContent = [
      '# SynapseEdge Bio-SNN System State',
      `Updated: ${new Date().toISOString()}`,
      '',
      '## Live Hardware Telemetry',
      `- Mean Firing Rate: ${telemetry.meanFiringRateHz} Hz (Target: 28.0 Hz)`,
      `- Silicon Power Draw: ${telemetry.powerMw.toFixed(2)} mW (Sub-5mW envelope)`,
      `- Energy / SOP: ${telemetry.energyPerSopPj} pJ`,
      `- Synaptic Operations / Sec: ${telemetry.synapticOpsPerSec} SOP/s`,
      `- AER Bus Latency: ${telemetry.aerLatencyMs.toFixed(2)} ms`,
      `- STDP Cumulative Delta: ${telemetry.cumulativeSTDPDelta.toFixed(4)}`,
      '',
      '## Active SNN Tuning Parameters',
      `- aPlus (LTP): ${tuningConfig.aPlus}`,
      `- aMinus (LTD): ${tuningConfig.aMinus} (A-/A+ = ${(tuningConfig.aMinus / Math.max(1e-6, tuningConfig.aPlus)).toFixed(2)}x)`,
      `- Learning Rate: ${tuningConfig.learningRate}`,
      `- Turn Gain: ${tuningConfig.turnGain}`,
      `- Proximity Gain: ${tuningConfig.proximityGain}`,
    ].join('\n');

    return {
      fileName: 'system_state.md',
      mimeType: 'text/markdown',
      content: mdContent,
      description: 'System state & architectural invariants markdown',
    };
  };

  // Upload a brand-new file or prompt for confirmation if overwriting an existing file with the same name
  const handleUploadArtifact = async (
    artifactType: 'workspace_memory' | 'correlation_report' | 'performance_csv' | 'system_markdown'
  ) => {
    const token = await resolveToken();
    if (!token) {
      setStatusMessage({ type: 'error', text: 'Please sign in with Google first.' });
      return;
    }

    const { fileName, mimeType, content, description } = buildArtifactPayload(artifactType);

    const existing = files.find((f) => f.name === fileName);
    if (existing) {
      setPendingMutation({
        type: 'overwrite',
        file: existing,
        newContent: content,
        mimeType,
        summaryLabel: `Update and overwrite existing file "${existing.name}" in Google Drive with current ${description}?`,
      });
      return;
    }

    setIsUploading(true);
    setStatusMessage(null);
    try {
      const metadata = {
        name: fileName,
        mimeType,
      };

      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelim = `\r\n--${boundary}--`;

      const multipartBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${mimeType}\r\n\r\n` +
        content +
        closeDelim;

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      });

      if (!res.ok) {
        throw new Error(`Upload failed with HTTP ${res.status}`);
      }

      setStatusMessage({
        type: 'success',
        text: `Uploaded "${fileName}" to your Google Drive.`,
      });
      await Promise.all([fetchDriveFiles(), refreshQuotaInfo()]);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Failed to upload file to Google Drive.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Confirmed execution of overwrite or delete
  const handleConfirmMutation = async () => {
    if (!pendingMutation) return;
    const token = await resolveToken();
    if (!token) return;

    setIsExecutingMutation(true);
    setStatusMessage(null);
    try {
      if (pendingMutation.type === 'delete') {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${pendingMutation.file.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Delete failed with HTTP ${res.status}`);
        }
        if (previewFile?.id === pendingMutation.file.id) {
          setPreviewFile(null);
          setPreviewContent('');
        }
        setStatusMessage({
          type: 'success',
          text: `Deleted "${pendingMutation.file.name}" from Google Drive.`,
        });
      } else if (pendingMutation.type === 'overwrite') {
        const mimeType = pendingMutation.mimeType || pendingMutation.file.mimeType || 'application/json';
        const boundary = '-------314159265358979323846';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelim = `\r\n--${boundary}--`;

        const multipartBody =
          delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify({ name: pendingMutation.file.name, mimeType }) +
          delimiter +
          `Content-Type: ${mimeType}\r\n\r\n` +
          (pendingMutation.newContent || '') +
          closeDelim;

        const res = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${pendingMutation.file.id}?uploadType=multipart`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: multipartBody,
          }
        );

        if (!res.ok) {
          throw new Error(`Update failed with HTTP ${res.status}`);
        }
        setStatusMessage({
          type: 'success',
          text: `Updated "${pendingMutation.file.name}" in Google Drive.`,
        });
      }

      setPendingMutation(null);
      await Promise.all([fetchDriveFiles(), refreshQuotaInfo()]);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Failed to complete Google Drive operation.',
      });
    } finally {
      setIsExecutingMutation(false);
    }
  };

  const handleInspectFile = async (file: DriveFileItem) => {
    const token = await resolveToken();
    if (!token) return;

    setPreviewFile(file);
    setIsLoadingPreview(true);
    setPreviewContent('');
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Could not read file content (HTTP ${res.status})`);
      }
      const text = await res.text();
      setPreviewContent(text);
    } catch (err: any) {
      setPreviewContent(`Unable to preview binary or Google Workspace native document directly: ${err?.message || ''}`);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleApplyPreviewToSNN = () => {
    if (!previewContent || !onImportTuningFromDrive) return;
    try {
      const parsed = JSON.parse(previewContent);
      const candidate =
        parsed.tuningConfig ||
        parsed.debugTrainReport?.optimizedTuning ||
        parsed.activeContext?.tuningConfig ||
        parsed;
      if (candidate && (typeof candidate.aPlus === 'number' || typeof candidate.aMinus === 'number')) {
        onImportTuningFromDrive(candidate);
        setStatusMessage({
          type: 'success',
          text: `Imported SNN tuning parameters from "${previewFile?.name}" into live engine.`,
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: 'Selected JSON file does not contain SNN tuningConfig fields (aPlus, aMinus, learningRate).',
        });
      }
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'File content is not valid JSON.',
      });
    }
  };

  // Fallback local calculation of SynapseEdge bytes from loaded files if quotaInfo is still loading
  const quotaInfo = bgSyncState.storageQuota;
  const isLoadingQuota = bgSyncState.isQuotaLoading;
  const syncLogs = bgSyncState.syncLogs;
  const isExportingSnapshot = bgSyncState.isSyncing;
  const nextSyncCountdownSec = bgSyncState.nextSyncCountdownSec;

  const currentPowerMw = telemetry.powerMw ?? 3.8;
  const saturatingLimitMw = telemetry.saturatingThreshold ?? 4.0;
  const isPowerSaturated =
    telemetry.isPowerSaturated ?? currentPowerMw > saturatingLimitMw;
  const dampingMv = telemetry.saturatingThresholdDampingMv ?? 0.0;

  const fallbackSynapseBytes = files
    .filter((f) => isSynapseEdgeSnapshotFileName(f.name))
    .reduce((acc, f) => acc + Number(f.size || 0), 0);
  const fallbackSynapseCount = files.filter((f) => isSynapseEdgeSnapshotFileName(f.name)).length;

  const synapseBytes = quotaInfo ? quotaInfo.synapseEdgeBytes : fallbackSynapseBytes;
  const synapseCount = quotaInfo ? quotaInfo.synapseEdgeFileCount : fallbackSynapseCount;
  const totalUsedBytes = quotaInfo?.usageBytes ?? 0;
  const totalLimitBytes = quotaInfo?.limitBytes ?? null;
  const driveUsedPct =
    totalLimitBytes && totalLimitBytes > 0
      ? Math.min(100, Number(((totalUsedBytes / totalLimitBytes) * 100).toFixed(2)))
      : 0;

  if (!user || needsDriveAuth || !accessToken) {
    return (
      <div className="p-6 rounded-xl bg-slate-900/90 border border-indigo-500/30 flex flex-col items-center text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
          <HardDrive className="w-6 h-6" />
        </div>
        <div className="space-y-1.5 max-w-md">
          <h3 className="text-sm font-bold text-white">Connect Google Drive Workspace</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Sign in with your Google account to track Drive storage quota, enable automated periodic{' '}
            <code className="text-indigo-300 font-mono">SNNTelemetrySnapshot</code> exports, and sync{' '}
            <code className="text-indigo-300 font-mono">workspace_memory.json</code> directly with Google Drive.
          </p>
        </div>

        <button
          onClick={signInWithGoogle}
          className="gsi-material-button px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold transition-all flex items-center gap-2.5 shadow-md cursor-pointer"
        >
          <div className="gsi-material-button-icon w-4 h-4 shrink-0">
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4 block">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              ></path>
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              ></path>
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              ></path>
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              ></path>
              <path fill="none" d="M0 0h48v48H0z"></path>
            </svg>
          </div>
          <span className="gsi-material-button-contents">Sign in with Google</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 0. Saturating Threshold & High-Burst Stability Monitor Card */}
      <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/30 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className={`p-1.5 rounded-lg border ${
                isPowerSaturated
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 animate-pulse'
                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              }`}
            >
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">
                  Saturating Threshold ({saturatingLimitMw.toFixed(1)} mW) & High-Burst Stability
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                    isPowerSaturated
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  }`}
                >
                  {isPowerSaturated
                    ? '4.0mW SATURATION CLAMP ENGAGED'
                    : 'SUB-4mW SAFE THERMAL FLOOR'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                Prevents runaway synaptic potentiations above 4.0 mW • Refractory protection & burst damping
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px]">
            <div className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-400 text-[10px] block">Silicon Power</span>
              <span className={`font-bold ${isPowerSaturated ? 'text-amber-400' : 'text-emerald-400'}`}>
                {currentPowerMw.toFixed(2)} mW
              </span>
              <span className="text-slate-500 text-[10px] ml-1">/ {saturatingLimitMw.toFixed(2)} mW limit</span>
            </div>

            <div className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-400 text-[10px] block">Threshold Damping</span>
              <span className="text-sky-300 font-bold">
                +{dampingMv.toFixed(2)} mV
              </span>
            </div>

            <div className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-400 text-[10px] block">Mean Firing Rate</span>
              <span className="text-teal-300 font-bold">
                {telemetry.meanFiringRateHz.toFixed(1)} Hz
              </span>
              <span className="text-slate-500 text-[10px] ml-1">(28.0 Hz target)</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] font-mono">
          <div className="p-2 rounded bg-slate-900 border border-slate-800/80">
            <span className="text-slate-400 block">LTP Potentiation Control</span>
            <span className={`font-semibold ${isPowerSaturated ? 'text-amber-300' : 'text-slate-200'}`}>
              {isPowerSaturated ? 'Throttled (Anti-Runaway Active)' : 'Full Plasticity Nominal'}
            </span>
          </div>
          <div className="p-2 rounded bg-slate-900 border border-slate-800/80">
            <span className="text-slate-400 block">Burst Condition Status</span>
            <span className="text-slate-200 font-semibold">
              {dampingMv > 0 || telemetry.meanFiringRateHz > 30.0
                ? 'High-Burst Synchrony Detected'
                : 'Steady-State Biological Flow'}
            </span>
          </div>
          <div className="p-2 rounded bg-slate-900 border border-slate-800/80">
            <span className="text-slate-400 block">Synaptic Operations Floor</span>
            <span className="text-emerald-400 font-semibold">
              {telemetry.synapticOpsPerSec.toLocaleString()} SOP/s (&gt;1000 safe floor)
            </span>
          </div>
        </div>
      </div>

      {/* 1. Google Drive Storage Quota & SynapseEdge Snapshot Footprint Indicator */}
      <div className="p-3.5 rounded-xl bg-slate-950 border border-indigo-500/30 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">Google Drive Storage & Snapshot Footprint</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {synapseCount} Saved Snapshot{synapseCount === 1 ? '' : 's'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                Live quota via <code className="text-indigo-300">drive/v3/about?fields=storageQuota</code>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-right font-mono text-[11px]">
            <div className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-400 text-[10px] block">SynapseEdge Footprint</span>
              <span className="text-emerald-400 font-bold">{formatStorageBytes(synapseBytes)}</span>
              <span className="text-slate-500 text-[10px] ml-1">
                ({synapseCount > 0 ? formatStorageBytes(Math.round(synapseBytes / synapseCount)) + '/avg' : '0 B'})
              </span>
            </div>

            <div className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-400 text-[10px] block">Total Drive Quota</span>
              <span className="text-sky-300 font-bold">
                {formatStorageBytes(totalUsedBytes)}
              </span>
              <span className="text-slate-500 text-[10px]">
                {totalLimitBytes ? ` / ${formatStorageBytes(totalLimitBytes)} (${driveUsedPct}%)` : ' / Unlimited'}
              </span>
            </div>

            <button
              onClick={refreshQuotaInfo}
              disabled={isLoadingQuota}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 cursor-pointer"
              title="Refresh Google Drive Storage Quota"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingQuota ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Visual Storage Bar */}
        <div className="space-y-1">
          <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800 flex">
            <div
              className="bg-sky-500/70 h-full transition-all duration-300"
              style={{ width: `${Math.max(1, driveUsedPct)}%` }}
              title={`Total Drive Usage: ${formatStorageBytes(totalUsedBytes)}`}
            />
            <div
              className="bg-emerald-400 h-full transition-all duration-300"
              style={{
                width: `${
                   synapaseBarWidth(synapseBytes, totalLimitBytes, totalUsedBytes)
                }%`,
              }}
              title={`SynapseEdge Snapshots: ${formatStorageBytes(synapseBytes)}`}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                SynapseEdge Snapshots: <strong className="text-emerald-300">{formatStorageBytes(synapseBytes)}</strong>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-sky-500 inline-block" />
                Drive Files: <strong className="text-slate-300">{formatStorageBytes(quotaInfo?.usageInDriveBytes ?? totalUsedBytes)}</strong>
              </span>
              {quotaInfo && quotaInfo.usageInTrashBytes > 0 && (
                <span>Trash: {formatStorageBytes(quotaInfo.usageInTrashBytes)}</span>
              )}
            </div>
            <span>
              Available:{' '}
              <strong className="text-slate-200">
                {totalLimitBytes
                  ? formatStorageBytes(Math.max(0, totalLimitBytes - totalUsedBytes))
                  : 'Unlimited'}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* 2. Automated SNNTelemetrySnapshot Synchronization Service & Settings Interface */}
      <div className="p-4 rounded-xl bg-slate-900 border border-sky-500/30 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-sky-400" />
            <h3 className="font-semibold text-white text-xs">
              Automated SNNTelemetrySnapshot Synchronization Service
            </h3>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                bgSyncState.mode === 'continuous'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              {bgSyncState.mode === 'continuous'
                ? `CONTINUOUS SYNC (${nextSyncCountdownSec}s)`
                : 'ON-DEMAND MANUAL MODE'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle Continuous vs On-Demand Manual */}
            <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
              <button
                onClick={() => globalBackgroundDriveSyncService.setMode('manual')}
                className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  bgSyncState.mode === 'manual'
                    ? 'bg-slate-800 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Pause className="w-3 h-3" />
                <span>On-Demand Manual</span>
              </button>
              <button
                onClick={() => globalBackgroundDriveSyncService.setMode('continuous')}
                className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  bgSyncState.mode === 'continuous'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Play className="w-3 h-3" />
                <span>Continuous Auto-Sync</span>
              </button>
            </div>

            <button
              onClick={handleManualExport}
              disabled={isExportingSnapshot}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold text-[11px] flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              {isExportingSnapshot ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Camera className="w-3.5 h-3.5" />
              )}
              <span>Export Snapshot Now</span>
            </button>
          </div>
        </div>

        {/* Sync Configuration Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] font-mono">
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span>Export Interval:</span>
            </span>
            <select
              value={bgSyncState.intervalSeconds}
              onChange={(e) =>
                globalBackgroundDriveSyncService.setIntervalSeconds(Number(e.target.value))
              }
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-[11px] focus:outline-none focus:border-sky-500"
            >
              <option value={15}>Every 15s</option>
              <option value={30}>Every 30s</option>
              <option value={60}>Every 60s</option>
              <option value={120}>Every 2m</option>
              <option value={300}>Every 5m</option>
            </select>
          </div>

          <label className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between cursor-pointer">
            <span className="text-slate-300">Include 5-Pillar Correlation Matrix</span>
            <input
              type="checkbox"
              checked={bgSyncState.includeFullHealthReport}
              onChange={(e) =>
                globalBackgroundDriveSyncService.setIncludeFullHealthReport(e.target.checked)
              }
              className="rounded accent-sky-500"
            />
          </label>

          <label className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between cursor-pointer">
            <span className="text-slate-300">Auto-Export on Debug-Train-Fix</span>
            <input
              type="checkbox"
              checked={bgSyncState.autoSyncAfterDebugTrain}
              onChange={(e) =>
                globalBackgroundDriveSyncService.setAutoSyncAfterDebugTrain(e.target.checked)
              }
              className="rounded accent-emerald-500"
            />
          </label>
        </div>

        {/* Recent Auto/Manual Snapshot Log */}
        {syncLogs.length > 0 && (
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 uppercase">
              <span>Recent SNNTelemetrySnapshot Exports ({syncLogs.length})</span>
              <span>Latest: {new Date(syncLogs[0].timestamp).toLocaleTimeString()}</span>
            </div>
            <div className="max-h-24 overflow-y-auto space-y-1 font-mono text-[10px]">
              {syncLogs.slice(0, 4).map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between text-slate-300 bg-slate-900/70 px-2 py-1 rounded"
                >
                  <span className="truncate flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        log.status === 'success' ? 'bg-emerald-400' : 'bg-rose-400'
                      }`}
                    />
                    <span>{log.message}</span>
                  </span>
                  <span className="text-slate-500 shrink-0 ml-2">
                    {log.trigger === 'continuous_auto_sync'
                      ? 'AUTO'
                      : log.trigger === 'post_debug_train_fix'
                      ? 'TRAIN-FIX'
                      : 'MANUAL'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. Autonomous SNN Debug, Train & Homeostatic Fix Console */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/30 via-slate-900 to-slate-900 border border-emerald-500/30 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-white">
                  Autonomous SNN Debug, Train & Homeostatic Calibration
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  12-Epoch Closed-Loop Pass
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Diagnoses firing rate drift, enforces <code className="text-emerald-300 font-mono">A-/A+ &gt;= 1.25</code> LTD dominance, injects 1.2ms BSI phase-dithering, and syncs the calibrated snapshot to Drive.
              </p>
            </div>
          </div>

          <button
            onClick={handleRunDebugTrainFix}
            disabled={isRunningDebugTrain}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            {isRunningDebugTrain ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>{isRunningDebugTrain ? 'Training & Calibrating...' : 'Run Debug-Train-Fix & Sync'}</span>
          </button>
        </div>

        {debugTrainReport && (
          <div className="p-3 rounded-lg bg-slate-950 border border-emerald-500/40 space-y-2.5 font-mono text-[11px]">
            <div className="flex items-center justify-between text-emerald-300 font-bold border-b border-slate-800 pb-1.5">
              <span>Debug-Train-Fix Verification Scorecard ({debugTrainReport.epochsTrained} Epochs)</span>
              <span>Health Score: {debugTrainReport.before.healthScore}% → {debugTrainReport.after.healthScore}%</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px]">
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block">Firing Rate</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-slate-300">{debugTrainReport.before.firingRateHz}Hz</span>
                  <ArrowRight className="w-2.5 h-2.5 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">{debugTrainReport.after.firingRateHz}Hz</span>
                </div>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block">LTD/LTP (A-/A+)</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-slate-300">{debugTrainReport.before.ltdLtpRatio}x</span>
                  <ArrowRight className="w-2.5 h-2.5 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">{debugTrainReport.after.ltdLtpRatio}x</span>
                </div>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block">Branching (σ)</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-slate-300">{debugTrainReport.before.branchingRatio}</span>
                  <ArrowRight className="w-2.5 h-2.5 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">{debugTrainReport.after.branchingRatio}</span>
                </div>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block">Burst Sync (BSI)</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-slate-300">{debugTrainReport.before.burstSynchronyIndex}</span>
                  <ArrowRight className="w-2.5 h-2.5 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">{debugTrainReport.after.burstSynchronyIndex}</span>
                </div>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block">Divergence DRI</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-slate-300">{debugTrainReport.before.dri}</span>
                  <ArrowRight className="w-2.5 h-2.5 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">{debugTrainReport.after.dri}</span>
                </div>
              </div>
            </div>

            <ul className="list-disc list-inside text-[10px] text-slate-300 space-y-0.5">
              {debugTrainReport.fixesApplied.map((fix, idx) => (
                <li key={idx}>{fix}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 4. Connected Header & Direct Export Actions */}
      <div className="p-4 rounded-xl bg-slate-900 border border-indigo-500/30 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-indigo-400" />
            <h3 className="font-semibold text-white text-xs">
              Google Drive Cloud Bus ({user.email})
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              OAuth Active
            </span>
          </div>

          <button
            onClick={() => {
              fetchDriveFiles();
              refreshQuotaInfo();
            }}
            disabled={isLoadingFiles}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingFiles ? 'animate-spin text-sky-400' : ''}`} />
            <span>Refresh Files</span>
          </button>
        </div>

        {/* One-Click Upload / Sync Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
          <button
            onClick={() => handleUploadArtifact('workspace_memory')}
            disabled={isUploading}
            className="px-3 py-2 rounded-lg bg-indigo-600/25 hover:bg-indigo-600/40 border border-indigo-500/40 text-indigo-200 font-medium text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="truncate">Sync workspace_memory.json</span>
          </button>

          <button
            onClick={() => handleUploadArtifact('system_markdown')}
            disabled={isUploading}
            className="px-3 py-2 rounded-lg bg-sky-600/25 hover:bg-sky-600/40 border border-sky-500/40 text-sky-200 font-medium text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="truncate">Sync system_state.md</span>
          </button>

          <button
            onClick={() => handleUploadArtifact('correlation_report')}
            disabled={isUploading}
            className="px-3 py-2 rounded-lg bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-200 font-medium text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <FileCode className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">Save Correlation JSON</span>
          </button>

          <button
            onClick={() => handleUploadArtifact('performance_csv')}
            disabled={isUploading}
            className="px-3 py-2 rounded-lg bg-purple-600/25 hover:bg-purple-600/40 border border-purple-500/40 text-purple-200 font-medium text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <FolderSync className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="truncate">Save 5-Pillar Audit CSV</span>
          </button>
        </div>

        {statusMessage && (
          <div
            className={`p-2.5 rounded-lg border font-mono text-[11px] flex items-center justify-between gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-white p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 5. Search & File Browser */}
      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          <div className="text-[11px] font-mono uppercase text-slate-400 font-bold">
            Recent Google Drive Files ({files.length})
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchDriveFiles();
            }}
            className="flex items-center gap-1.5"
          >
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Drive files by name..."
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
            >
              Search
            </button>
          </form>
        </div>

        {isLoadingFiles ? (
          <div className="py-8 text-center text-slate-400 font-mono text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
            <span>Querying Google Drive API...</span>
          </div>
        ) : files.length === 0 ? (
          <div className="py-6 text-center text-slate-500 font-mono text-xs">
            No matching files found in your Google Drive. Use the buttons above to export your first SNNTelemetrySnapshot.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80 max-h-64 overflow-y-auto border border-slate-800/80 rounded-lg bg-slate-900/50">
            {files.map((file) => {
              const isSynapseSnapshot = isSynapseEdgeSnapshotFileName(file.name);
              return (
                <div
                  key={file.id}
                  className="px-3 py-2 flex items-center justify-between gap-3 hover:bg-slate-800/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <FileCode
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSynapseSnapshot ? 'text-emerald-400' : 'text-indigo-400'
                        }`}
                      />
                      <span className="font-mono text-xs text-slate-200 truncate font-medium">
                        {file.name}
                      </span>
                      {isSynapseSnapshot && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          SynapseEdge
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 mt-0.5 flex items-center gap-3">
                      <span>{file.mimeType}</span>
                      {file.size && <span>Size: {formatStorageBytes(Number(file.size))}</span>}
                      {file.modifiedTime && (
                        <span>Modified: {new Date(file.modifiedTime).toLocaleString()}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleInspectFile(file)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 font-mono text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                      title="Inspect file contents"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Inspect</span>
                    </button>

                    {(file.name.endsWith('.json') || file.name.endsWith('.md') || file.name.endsWith('.csv')) && (
                      <button
                        onClick={() => {
                          const artifactType = file.name.includes('system_state')
                            ? 'system_markdown'
                            : file.name.includes('csv')
                            ? 'performance_csv'
                            : file.name.includes('correlation')
                            ? 'correlation_report'
                            : 'workspace_memory';
                          const payload = buildArtifactPayload(artifactType);
                          setPendingMutation({
                            type: 'overwrite',
                            file,
                            newContent: payload.content,
                            mimeType: payload.mimeType,
                            summaryLabel: `Overwrite "${file.name}" in Google Drive with latest live SNN state?`,
                          });
                        }}
                        className="px-2 py-1 rounded bg-indigo-950/60 hover:bg-indigo-900/70 border border-indigo-500/30 text-indigo-300 font-mono text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                        title="Overwrite file with current live SNN state"
                      >
                        <Upload className="w-3 h-3" />
                        <span>Update</span>
                      </button>
                    )}

                    {file.webViewLink && (
                      <a
                        href={file.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                        title="View in Google Drive"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}

                    <button
                      onClick={() =>
                        setPendingMutation({
                          type: 'delete',
                          file,
                          summaryLabel: `Permanently delete "${file.name}" from your Google Drive?`,
                        })
                      }
                      className="p-1 rounded bg-rose-950/50 hover:bg-rose-900/70 border border-rose-500/30 text-rose-300 transition-colors cursor-pointer"
                      title="Delete file from Google Drive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* File Content Preview & SNN Parameter Import */}
      {previewFile && (
        <div className="p-4 rounded-xl bg-slate-900 border border-sky-500/30 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-sky-400" />
              <span className="font-mono text-xs font-bold text-white">
                Inspecting: {previewFile.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {previewFile.name.endsWith('.json') && onImportTuningFromDrive && (
                <button
                  onClick={handleApplyPreviewToSNN}
                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[10px] font-semibold transition-colors cursor-pointer"
                >
                  Import Tuning into Live SNN
                </button>
              )}
              <button
                onClick={() => {
                  setPreviewFile(null);
                  setPreviewContent('');
                }}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-sky-300 max-h-52 overflow-auto whitespace-pre-wrap">
            {isLoadingPreview ? 'Reading file content from Google Drive...' : previewContent}
          </pre>
        </div>
      )}

      {/* Mandatory Explicit User Confirmation Dialog for Mutating / Destructive Operations */}
      {pendingMutation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-amber-500/50 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-lg border shrink-0 ${
                  pendingMutation.type === 'delete'
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                    : 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white">
                  {pendingMutation.type === 'delete'
                    ? 'Confirm Google Drive File Deletion'
                    : 'Confirm Google Drive File Update'}
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {pendingMutation.summaryLabel}
                </p>
                <p className="text-[11px] font-mono text-slate-400">
                  Target File: <span className="text-white">{pendingMutation.file.name}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setPendingMutation(null)}
                disabled={isExecutingMutation}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmMutation}
                disabled={isExecutingMutation}
                className={`px-3.5 py-1.5 rounded-lg text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  pendingMutation.type === 'delete'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-amber-600 hover:bg-amber-500'
                }`}
              >
                {isExecutingMutation ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : pendingMutation.type === 'delete' ? (
                  <Trash2 className="w-3.5 h-3.5" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                <span>
                  {pendingMutation.type === 'delete' ? 'Confirm Delete' : 'Confirm Update'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function synapaseBarWidth(
  synapseBytes: number,
  totalLimitBytes: number | null,
  totalUsedBytes: number
): number {
  if (synapseBytes <= 0) return 0;
  if (totalLimitBytes && totalLimitBytes > 0) {
    return Math.max(1.5, Math.min(25, (synapseBytes / totalLimitBytes) * 100));
  }
  if (totalUsedBytes > 0) {
    return Math.max(1.5, Math.min(25, (synapseBytes / totalUsedBytes) * 100));
  }
  return 2;
}
