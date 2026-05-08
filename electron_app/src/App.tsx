import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowRight,
  Settings,
  FolderOpen,
  Pause,
  Play,
  Square,
  X,
} from 'lucide-react';

// ── Type declarations ───────────────────────────────────────

interface ProgressData {
  downloaded: number;
  skipped: number;
  total: number;
  progress: number;
}

interface CompleteData {
  downloaded: number;
  skipped: number;
  total: number;
  error?: string;
  cancelled?: boolean;
}

interface UpdateInfo {
  version: string;
  downloadUrl: string;
  releaseNotes: string;
  fileName: string;
  expectedSha256?: string | null;
}

declare global {
  interface Window {
    electronAPI?: {
      startDownload: (input: string, settings?: Record<string, unknown>) => Promise<{ success: boolean; message: string }>;
      pauseDownload: () => void;
      stopDownload: () => void;
      openOutputFolder: () => void;
      saveLogs: (logLines: string[]) => Promise<{ success: boolean; filePath?: string; message?: string }>;
      checkForUpdates: (isAuto?: boolean) => Promise<UpdateInfo | null>;
      dismissUpdate: (version: string) => Promise<void>;
      downloadUpdate: (url: string, fileName: string, expectedSha256?: string | null) => Promise<{ success: boolean; message?: string; filePath?: string }>;
      installUpdate: (filePath: string, version: string) => void;
      getVersion: () => Promise<string>;
      checkPendingUpdateFailed: () => Promise<string | null>;
      onDownloadProgress: (cb: (data: ProgressData) => void) => () => void;
      onDownloadLog: (cb: (msg: string) => void) => () => void;
      onDownloadComplete: (cb: (data: CompleteData) => void) => () => void;
      onUpdateDownloadProgress: (cb: (pct: number) => void) => () => void;
    };
  }
}

// ── App component ───────────────────────────────────────────

export default function App() {
  const [input, setInput] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({ downloaded: 0, skipped: 0 });
  const [logs, setLogs] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [settings, setSettings] = useState({
    skipDuplicates: true,
    requestDelay: 0.5,
    mediaFilter: 'both' as 'both' | 'photos' | 'videos',
  });

  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // ── Update flow (matches MyLocalBackup pattern) ──────────

  const performUpdate = useCallback(async (update: UpdateInfo) => {
    setIsUpdating(true);
    setUpdateStatus('Downloading...');
    try {
      const result = await window.electronAPI?.downloadUpdate(
        update.downloadUrl,
        update.fileName,
        update.expectedSha256,
      );

      if (result?.success && result.filePath) {
        setUpdateStatus('Installing update...');
        window.electronAPI?.installUpdate(result.filePath, update.version);
        // App will quit — the PowerShell script handles the rest
      } else {
        alert(`Update failed: ${result?.message || 'Download failed'}`);
        setUpdateStatus('');
        setIsUpdating(false);
      }
    } catch (err) {
      alert(`Update failed: ${err}`);
      setUpdateStatus('');
      setIsUpdating(false);
    }
  }, []);

  // Get app version + check for pending update failure on mount
  useEffect(() => {
    window.electronAPI?.getVersion().then((v) => setAppVersion(v));

    // Check if a previous update failed to apply
    window.electronAPI?.checkPendingUpdateFailed().then((failedVersion) => {
      if (failedVersion) {
        alert(`The previous update to ${failedVersion} did not install successfully.\n\nPlease try updating again, or download the installer manually from GitHub.`);
      }
    });

    // Auto-check for updates on startup (silent)
    window.electronAPI?.checkForUpdates(true).then((result) => {
      if (result?.version) {
        const doUpdate = confirm(`A new version (${result.version}) is available.\n\nRelease Notes:\n${result.releaseNotes}\n\nDo you want to update now?`);
        if (doUpdate) {
          performUpdate(result);
        } else {
          window.electronAPI?.dismissUpdate(result.version);
        }
      }
    }).catch(() => {});
  }, [performUpdate]);

  // IPC listeners
  useEffect(() => {
    const cleanupProgress = window.electronAPI?.onDownloadProgress((data) => {
      setProgress(data.progress);
      setStats({ downloaded: data.downloaded, skipped: data.skipped });
    });

    const cleanupLog = window.electronAPI?.onDownloadLog((msg) => {
      setLogs((prev) => [...prev, msg]);
    });

    const cleanupComplete = window.electronAPI?.onDownloadComplete((data) => {
      setIsDownloading(false);
      setIsPaused(false);
      if (data.error) {
        setLogs((prev) => [...prev, `[ERROR] ${data.error}`]);
      } else {
        setProgress(100);
        setStats({ downloaded: data.downloaded, skipped: data.skipped });
      }
    });

    const cleanupUpdateProgress = window.electronAPI?.onUpdateDownloadProgress((pct) => {
      setUpdateStatus(`Downloading: ${pct}%`);
    });

    return () => {
      cleanupProgress?.();
      cleanupLog?.();
      cleanupComplete?.();
      cleanupUpdateProgress?.();
    };
  }, []);

  const handleStart = useCallback(async () => {
    if (!input.trim() || isDownloading) return;
    setIsDownloading(true);
    setIsPaused(false);
    setLogs([]);
    setStats({ downloaded: 0, skipped: 0 });
    setProgress(0);

    const result = await window.electronAPI?.startDownload(input.trim(), settings);
    if (result && !result.success) {
      setLogs([`[ERROR] ${result.message}`]);
      setIsDownloading(false);
    }
  }, [input, isDownloading, settings]);

  const handlePause = useCallback(() => {
    setIsPaused((p) => !p);
    window.electronAPI?.pauseDownload();
  }, []);

  const handleStop = useCallback(() => {
    window.electronAPI?.stopDownload();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleStart();
  };

  const handleCheckUpdates = useCallback(async () => {
    setUpdateStatus('Checking...');
    try {
      const result = await window.electronAPI?.checkForUpdates(false);
      if (result?.error) {
        setUpdateStatus('Check failed');
        alert(`Update check failed:\n${result.error}`);
        setTimeout(() => setUpdateStatus(''), 3000);
      } else if (result?.version) {
        const doUpdate = confirm(
          `A new version (${result.version}) is available.\n\nRelease Notes:\n${result.releaseNotes}\n\nDo you want to update now?`,
        );
        if (doUpdate) {
          await performUpdate(result);
        } else {
          window.electronAPI?.dismissUpdate(result.version);
          setUpdateStatus('');
        }
      } else {
        setUpdateStatus('Up to date');
        setTimeout(() => setUpdateStatus(''), 3000);
      }
    } catch {
      setUpdateStatus('Check failed');
      setTimeout(() => setUpdateStatus(''), 3000);
    }
  }, [performUpdate]);

  return (
    <div className="h-screen w-full bg-zinc-900 text-zinc-100 flex flex-col overflow-hidden">
      {/* ── Title bar ─────────────────────────────────────── */}
      <header
        className="title-bar flex items-center h-9 px-4 shrink-0 bg-zinc-900 border-b border-zinc-700/40"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2.5">
          <svg width="13" height="13" viewBox="0 0 256 256" className="shrink-0">
            <rect width="256" height="256" rx="48" fill="#2d7f8e" />
            {/* Download arrow */}
            <g fill="white">
              <rect x="104" y="44" width="48" height="80" />
              <polygon points="60,124 128,192 196,124 160,124 160,124 96,124" />
              <rect x="60" y="200" width="136" height="16" rx="4" />
            </g>
            {/* Orange play triangle */}
            <polygon points="112,108 112,156 148,132" fill="#e8833a" />
            {/* Green dot */}
            <circle cx="210" cy="194" r="10" fill="#4ade80" />
          </svg>
          <span className="text-[11px] font-medium text-zinc-400 select-none">GKMediaDownloader</span>
        </div>
      </header>

      {/* ── Main content ──────────────────────────────────── */}
      <main className="flex-1 flex flex-col px-5 pb-0 pt-3 gap-3 overflow-hidden">
        {/* Input row */}
        <div className="flex gap-2 shrink-0">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="u/username or r/subreddit"
            disabled={isDownloading || isUpdating}
            spellCheck={false}
            className="flex-1 h-10 px-3.5 bg-zinc-800 border border-zinc-600/50 rounded-lg text-[13px] text-zinc-100 placeholder:text-zinc-400 focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 transition-all disabled:opacity-40 outline-none"
          />

          {!isDownloading ? (
            <button
              onClick={handleStart}
              disabled={!input.trim() || isUpdating}
              className="h-10 px-5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-[13px] font-medium rounded-lg transition-colors disabled:opacity-20 disabled:pointer-events-none flex items-center gap-1.5 shrink-0"
            >
              Start
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="flex gap-1.5 shrink-0">
              <button
                onClick={handlePause}
                className="h-10 w-10 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg flex items-center justify-center transition-colors"
                title={isPaused ? 'Resume' : 'Pause'}
              >
                {isPaused ? (
                  <Play className="w-4 h-4 text-zinc-300" />
                ) : (
                  <Pause className="w-4 h-4 text-zinc-300" />
                )}
              </button>
              <button
                onClick={handleStop}
                className="h-10 w-10 bg-zinc-800 hover:bg-red-950/60 border border-zinc-700 hover:border-red-900/40 rounded-lg flex items-center justify-center transition-colors"
                title="Stop"
              >
                <Square className="w-3.5 h-3.5 text-zinc-400" />
              </button>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {isDownloading && (
          <div className="shrink-0 space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-zinc-400">
                {isPaused ? 'Paused' : 'Downloading\u2026'}
              </span>
              <span className="text-[11px] text-zinc-400 tabular-nums">{progress}%</span>
            </div>
            <div className="h-[3px] bg-zinc-700/60 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isPaused
                    ? 'bg-zinc-600'
                    : 'bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.5)]'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Activity log */}
        <div className="flex-1 min-h-0 flex flex-col relative">
          <span className="text-[10px] text-zinc-400 uppercase tracking-[0.1em] font-semibold mb-1.5 px-0.5 select-none">
            Activity
          </span>

          <div className="flex-1 bg-zinc-800 border border-zinc-600/40 rounded-lg overflow-y-auto log-area">
            {logs.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-[12px] text-zinc-500 select-none">
                  {isDownloading ? 'Starting download\u2026' : 'Waiting for input'}
                </p>
              </div>
            ) : (
              <div className="p-3 space-y-px">
                {logs.map((log, i) => (
                  <div
                    key={i}
                    className={`text-[11px] font-mono leading-5 transition-colors ${
                      log.includes('[ERROR]')
                        ? 'text-red-400'
                        : log.includes('Saved:')
                          ? 'text-emerald-400/80'
                          : log.includes('Muxed')
                            ? 'text-blue-400/80'
                            : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {log}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            )}
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="absolute inset-0 top-6 bg-zinc-800 border border-zinc-600/40 rounded-lg p-4 z-10 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-zinc-200">Settings</span>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-1 hover:bg-zinc-700 rounded transition-colors"
                >
                  <X className="w-4 h-4 text-zinc-400" />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-[12px] text-zinc-300 shrink-0">Download</label>
                <div className="flex gap-1">
                  {(['both', 'photos', 'videos'] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setSettings((s) => ({ ...s, mediaFilter: opt }))}
                      className={`px-3 py-1.5 text-[11px] rounded-md transition-colors ${
                        settings.mediaFilter === opt
                          ? 'bg-indigo-600 text-white'
                          : 'bg-zinc-700 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {opt === 'both' ? 'Both' : opt === 'photos' ? 'Photos' : 'Videos'}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.skipDuplicates}
                  onChange={(e) => setSettings((s) => ({ ...s, skipDuplicates: e.target.checked }))}
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-indigo-500 focus:ring-indigo-500/20"
                />
                <span className="text-[12px] text-zinc-300">Skip duplicates (SHA256 check)</span>
              </label>

              <div className="flex items-center gap-3">
                <label className="text-[12px] text-zinc-300 shrink-0">Request delay</label>
                <input
                  type="range"
                  min="0.1"
                  max="3"
                  step="0.1"
                  value={settings.requestDelay}
                  onChange={(e) => setSettings((s) => ({ ...s, requestDelay: parseFloat(e.target.value) }))}
                  className="flex-1 h-1 bg-zinc-700 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                />
                <span className="text-[11px] text-zinc-400 tabular-nums w-8 text-right">{settings.requestDelay}s</span>
              </div>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-5 text-[11px] text-zinc-400">
            <span>
              <span className="text-zinc-200 font-medium tabular-nums">{stats.downloaded}</span>{' '}
              downloaded
            </span>
            <span>
              <span className="text-zinc-200 font-medium tabular-nums">{stats.skipped}</span>{' '}
              skipped
            </span>
          </div>

          <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={() => setShowSettings((s) => !s)}
              className={`p-1.5 rounded-md transition-colors group ${showSettings ? 'bg-zinc-700/60' : 'hover:bg-zinc-700/60'}`}
              title="Settings"
            >
              <Settings className="w-[15px] h-[15px] text-zinc-400 group-hover:text-zinc-200 transition-colors" />
            </button>
            <button
              onClick={() => window.electronAPI?.openOutputFolder()}
              className="p-1.5 rounded-md hover:bg-zinc-700/60 transition-colors group"
              title="Open downloads"
            >
              <FolderOpen className="w-[15px] h-[15px] text-zinc-400 group-hover:text-zinc-200 transition-colors" />
            </button>
          </div>
        </div>
      </main>

      {/* ── Footer bar ──────────────────────────────────── */}
      <footer className="flex items-center h-8 px-4 shrink-0 bg-zinc-950/60 border-t border-zinc-700/40">
        <div className="flex items-center gap-0 text-[11px]">
          <span className="text-zinc-500">Version {appVersion || '--'}</span>
          <span className="text-zinc-700 mx-2">|</span>
          <button
            onClick={handleCheckUpdates}
            disabled={isUpdating}
            className="text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-60"
          >
            {updateStatus || 'Check for Updates'}
          </button>
          <span className="text-zinc-700 mx-2">|</span>
          <button
            onClick={() => setShowAbout(true)}
            className="text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            About
          </button>
          <span className="text-zinc-700 mx-2">|</span>
          <button
            onClick={() => {
              if (logs.length === 0) return;
              window.electronAPI?.saveLogs(logs);
            }}
            disabled={logs.length === 0}
            className="text-indigo-400 hover:text-indigo-300 transition-colors disabled:text-zinc-600 disabled:cursor-default"
          >
            Logs
          </button>
        </div>
      </footer>

      {/* ── About overlay ───────────────────────────────── */}
      {showAbout && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-800 border border-zinc-600/60 rounded-xl w-[420px] max-h-[360px] p-6 flex flex-col gap-4 shadow-2xl">
            <h2 className="text-[16px] font-bold text-zinc-100">About GKMediaDownloader</h2>
            <div className="flex-1 overflow-y-auto space-y-3 text-[12px]">
              <div>
                <span className="text-zinc-300 font-semibold">Developer:</span>{' '}
                <span className="text-zinc-400">George Karagioules</span>
              </div>
              <div>
                <span className="text-zinc-300 font-semibold">Version:</span>{' '}
                <span className="text-zinc-400">{appVersion || '--'}</span>
              </div>
              <div>
                <span className="text-zinc-300 font-semibold">Year:</span>{' '}
                <span className="text-zinc-400">2026</span>
              </div>
              <div className="pt-2 border-t border-zinc-700">
                <span className="text-indigo-400 font-bold text-[11px]">Freeware License</span>
                <p className="text-zinc-500 text-[11px] leading-relaxed mt-1.5">
                  Copyright &copy; 2026 George Karagioules. All rights reserved.
                </p>
                <p className="text-zinc-500 text-[11px] leading-relaxed mt-1.5">
                  This software is provided free of charge for personal and commercial use. You may download and use it at no cost.
                </p>
                <p className="text-zinc-500 text-[11px] leading-relaxed mt-1.5">
                  You may NOT modify, reverse-engineer, redistribute, or sell this software or any portion of it without prior written permission from the author.
                </p>
                <p className="text-zinc-500 text-[11px] leading-relaxed mt-1.5">
                  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. THE DEVELOPER IS NOT LIABLE FOR ANY DAMAGES ARISING FROM USE OF THIS SOFTWARE.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowAbout(false)}
              className="self-center px-6 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] font-medium rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
