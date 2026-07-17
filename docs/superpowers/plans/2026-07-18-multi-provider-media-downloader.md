# Multi-Provider Media Downloader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Reddit Media Downloader to accept direct Reddit, Redgifs, Erome, and supported media URLs, download every media item on a page with audio, then replace the installed Windows application and its shortcuts.

**Architecture:** Extend the existing Node downloader with a strict input router and provider-specific extraction functions. Reuse the current streaming downloader, SHA-256 duplicate detection, Redgifs API, and FFmpeg mux path; keep React changes limited to input guidance and provider-aware status.

**Tech Stack:** Electron, Node.js CommonJS, React 19, TypeScript, Node test runner, FFmpeg, electron-builder/NSIS, PowerShell.

## Global Constraints

- Preserve all current uncommitted version/GIF fixes and existing Reddit user/subreddit behaviour.
- Fetch only public HTTPS resources from Reddit, Redgifs, Erome, and their required media hosts.
- Never access browser cookies, credentials, private pages, paywalls, or DRM.
- Never overwrite completed files or leave incomplete files after failure.
- Close only Reddit Media Downloader when replacing the installed application.
- Do not alter unrelated desktop shortcuts, File frame entries, taskbar pins, applications, or layout.

---

### Task 1: Direct Input Router and Provider Extractors

**Files:**
- Modify: `electron_app/electron/downloader.cjs`
- Create: `electron_app/electron/directInput.test.cjs`

**Interfaces:**
- Produces `normalizeInput(input)` modes for listing, Reddit post/media, Redgifs page/media, Erome page/media, and direct media.
- Produces provider extraction helpers returning existing media-entry objects.

- [ ] Write failing tests for supported input forms, malformed/HTTP/unsupported URLs, Reddit post JSON, ordered galleries, Redgifs links, Erome mixed albums, preview deduplication, and direct media.
- [ ] Run the focused Node tests and verify failures are caused by missing direct-input functionality.
- [ ] Implement strict URL classification and provider extraction using bounded requests and existing request helpers.
- [ ] Export only the pure helpers needed by tests through `_internals`.
- [ ] Run focused and complete Node test suites and `git diff --check`.
- [ ] Commit with message `feat: extract direct provider media links`.

### Task 2: Direct Download Flow and Audio Handling

**Files:**
- Modify: `electron_app/electron/downloader.cjs`
- Modify: `electron_app/electron/directInput.test.cjs`
- Modify: `electron_app/electron/downloaderFallback.test.cjs`

**Interfaces:**
- Consumes Task 1 input modes and media entries.
- Produces one unified `start(input, settings)` path for listings and direct pages.

- [ ] Write failing tests for direct-page dispatch, media filters, filenames, collision preservation, partial cleanup, and Reddit audio mux selection.
- [ ] Implement direct-page fetch/extract without listing pagination while preserving pause/resume/cancel/progress/log events.
- [ ] Preserve GIF files while treating animated GIFs as video-compatible for filtering.
- [ ] Ensure Redgifs/Erome videos retain audio and Reddit DASH/HLS uses FFmpeg merging.
- [ ] Run all downloader tests and commit with message `feat: download direct provider pages`.

### Task 3: React Input Experience and Regression Verification

**Files:**
- Modify: `electron_app/src/App.tsx`
- Create: `electron_app/src/inputPresentation.ts`
- Create: `electron_app/electron/uiContract.test.cjs`

**Interfaces:**
- Produces provider-neutral input placeholder and provider-aware starting log/status without changing IPC signatures.

- [ ] Write contract tests for the new placeholder, unchanged IPC call shape, and preserved controls.
- [ ] Update input guidance to `Paste a Reddit, Redgifs or Erome link - or u/username / r/subreddit`.
- [ ] Keep the current compact UI, settings, About, logs, and output-folder controls intact.
- [ ] Run TypeScript build, ESLint, and all tests.
- [ ] Commit with message `feat: support provider links in downloader UI`.

### Task 4: Versioned Windows Build and Acceptance Tests

**Files:**
- Modify: `electron_app/package.json`
- Modify: `electron_app/package-lock.json`
- Modify: `electron_app/electron/installerConfig.test.cjs`
- Create: `docs/verification/2026-07-18-multi-provider-results.md`

**Interfaces:**
- Produces the next NSIS installer in `electron_app/dist-electron` with the existing app ID, product name, icon, and shortcut name.

- [ ] Increment the patch version and update the installer test expectation.
- [ ] Run all automated tests, lint, TypeScript/Vite build, and NSIS packaging.
- [ ] Test public Reddit image/gallery/video, Redgifs video, and Erome mixed media; verify audio with FFprobe and clean acceptance files.
- [ ] Record versions, URLs by provider category without sensitive data, results, artifact path, and hashes.
- [ ] Commit with message `build: package multi-provider downloader`.

### Task 5: Replace Installed App and Shortcuts

**Files:**
- Modify only if deployment verification exposes a tested defect.
- Update: `docs/verification/2026-07-18-multi-provider-results.md`

**Interfaces:**
- Replaces the existing installed Reddit Media Downloader in place.
- Preserves or repairs the Desktop/File-frame and taskbar shortcuts.

- [ ] Record the current executable path, Desktop shortcut, Start-menu shortcut, taskbar pin target/icon, and installed version.
- [ ] Close only the running Reddit Media Downloader process.
- [ ] Run the new NSIS installer and complete any unavoidable UAC confirmation.
- [ ] Verify there is one installed product, its executable reports the new version, and both shortcuts resolve to it with the correct icon.
- [ ] Launch from the Desktop/File-frame shortcut and taskbar pin, then test one direct link in the installed app.
- [ ] Update the verification report and commit with message `test: verify Windows app replacement`.

