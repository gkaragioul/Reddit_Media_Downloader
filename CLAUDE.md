# GKMD - GeorgeK Media Downloader

## Project Overview
Desktop app (Electron + React + TypeScript) that downloads media (photos & videos) from Reddit user profiles and subreddits. Previously called "Reddit Downloader", now rebranded to **GKMD** (GeorgeK Media Downloader).

## Architecture
- **Frontend**: React + TypeScript + Tailwind CSS + Lucide icons (in `electron_app/src/`)
- **Backend**: Electron main process (in `electron_app/electron/`)
  - `main.cjs` — Electron window + IPC handlers + update system
  - `downloader.cjs` — Download engine (Node.js built-ins only)
  - `preload.js` — IPC bridge (contextBridge)
- **Build**: Vite + electron-builder → NSIS installer `.exe` (~105MB with bundled ffmpeg)
- **Installer**: NSIS with EULA, installs to Program Files, creates desktop/start menu shortcuts

## Key Files
- `electron_app/package.json` — App config, version, electron-builder + NSIS settings
- `electron_app/src/App.tsx` — Main React UI component
- `electron_app/src/App.css` — Custom styles (scrollbars, title bar)
- `electron_app/electron/main.cjs` — Electron main process + update system
- `electron_app/electron/downloader.cjs` — Download engine
- `electron_app/electron/preload.js` — IPC preload bridge
- `electron_app/assets/license.txt` — Freeware EULA shown during installation

## Build & Run
```bash
cd electron_app
npm install
npm run electron:dev    # Dev mode (Vite + Electron)
npm run dist            # Build NSIS installer .exe
```

## Version & Updates
- Version is set in `electron_app/package.json` → `"version"` field
- Update system checks GitHub releases at `georgekgr12/GKMD-releases`
- Update flow (matches MyLocalBackup pattern):
  1. Check `api.github.com/repos/georgekgr12/GKMD-releases/releases/latest`
  2. Compare tag version with current app version
  3. Prompt user with release notes
  4. Download installer to temp (with SHA256 verification if hash in release notes)
  5. Create PowerShell helper script that: waits → runs installer silently (`/S`) → relaunches app
  6. Quit current app, let helper script handle the rest
- Failed update detection: writes pending marker before install, checks on next launch
- Dismissed version tracking: user can skip a version, won't be prompted again (auto-check)
- Version displayed in footer bar (bottom-left)

## GitHub
- Source repo: Private development repo
- Releases repo: `https://github.com/georgekgr12/GKMD-releases` (public, for auto-updates)
- Releases should contain the NSIS `.exe` installer with SHA256 hash in release notes body
- SHA256 format in release notes: `SHA256: <64-char hex>`

## App Branding
- Package name: `gkmd`
- App ID: `com.gkmd.app`
- Product name: `GKMD`
- Display title in app: "GeorgeK Media Downloader"
- Desktop shortcut name: "GKMD"

## Features
- Download photos and videos from Reddit users/subreddits
- Media type filter: Videos only, Photos only, or Both
- SHA256 duplicate detection
- Reddit DASH video + audio muxing via bundled ffmpeg
- Crosspost video support
- Gallery extraction (including video galleries)
- Pause/Resume/Cancel support
- Auto-update from GitHub releases (with SHA256 integrity check)
- About dialog with license info
- NSIS installer with EULA, Program Files install, desktop shortcut

## Legacy Files (not part of main app)
- `windows_reddit_downloader.py` — Old Python/tkinter version
- `*.swift` files — macOS SwiftUI version
- `MASTER_AI_OSX.txt` — Old macOS context file
