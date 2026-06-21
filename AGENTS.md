# Reddit Media Downloader

## Project Overview
Desktop app (Electron + React + TypeScript) that downloads media (photos & videos) from Reddit user profiles and subreddits. Product name: **Reddit Media Downloader**.

## Architecture
- **Frontend**: React + TypeScript + Tailwind CSS + Lucide icons (in `electron_app/src/`)
- **Backend**: Electron main process (in `electron_app/electron/`)
  - `main.cjs` — Electron window + IPC handlers
  - `downloader.cjs` — Download engine (Node.js built-ins only)
  - `preload.js` — IPC bridge (contextBridge)
- **Build**: Vite + electron-builder → NSIS installer `.exe` (~105MB with bundled ffmpeg)
- **Installer**: NSIS with GPLv3-or-later license text plus the application responsible-use notice, installs to Program Files, creates desktop/start menu shortcuts

## Key Files
- `electron_app/package.json` — App config, version, electron-builder + NSIS settings
- `electron_app/src/App.tsx` — Main React UI component
- `electron_app/src/App.css` — Custom styles (scrollbars, title bar)
- `electron_app/electron/main.cjs` — Electron main process
- `electron_app/electron/downloader.cjs` — Download engine
- `electron_app/electron/preload.js` — IPC preload bridge
- `electron_app/assets/license.txt` — Installer license screen: application notice followed by the GPLv3 text

## Build & Run
```bash
cd electron_app
npm install
npm run electron:dev    # Dev mode (Vite + Electron)
npm run dist            # Build NSIS installer .exe
```

## Version
- Version is set in `electron_app/package.json` → `"version"` field
- Version is displayed in the footer bar (bottom-left)
- The app does not include update checks, update prompts, or automatic installer downloads.

## GitHub
- Repo: `https://github.com/gkaragioul/Reddit_Media_Downloader`
- Release installers can be published manually, but the app does not check GitHub for updates.

## App Branding
- Package name: `gkmd`
- App ID: `com.gkmd.app`
- Product name: `Reddit Media Downloader`
- Display title in app: "Reddit Media Downloader"
- Desktop shortcut name: "Reddit Media Downloader"

## Features
- Download photos and videos from Reddit users/subreddits
- Media type filter: Videos only, Photos only, or Both
- SHA256 duplicate detection
- Reddit DASH video + audio muxing via bundled ffmpeg
- Crosspost video support
- Gallery extraction (including video galleries)
- Pause/Resume/Cancel support
- About dialog with license info
- NSIS installer with GPLv3-or-later license text and responsible-use notice, Program Files install, desktop shortcut

## Legacy Files (not part of main app)
- `windows_reddit_downloader.py` — Old Python/tkinter version
- `*.swift` files — macOS SwiftUI version
- `MASTER_AI_OSX.txt` — Old macOS context file
