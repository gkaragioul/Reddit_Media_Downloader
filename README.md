<p align="center">
  <img src="electron_app/assets/icon.png" alt="GKMediaDownloader logo" width="112">
</p>

<h1 align="center">Reddit Media Downloader</h1>

<p align="center">
  <strong>Windows desktop app for downloading public Reddit photos and videos.</strong><br>
  Electron, React, TypeScript, Tailwind CSS, RedGIFs support, Reddit HLS video, and SHA256-verified updates.
</p>

<p align="center">
  <a href="https://github.com/karagioules/Reddit_Media_Downloader/releases/latest">Download</a> -
  <a href="#features">Features</a> -
  <a href="#auto-update-system">Auto-Updates</a> -
  <a href="#build-from-source">Build</a> -
  <a href="#license">License</a>
</p>

![Windows](https://img.shields.io/badge/Windows-10+-0078D6.svg)
![Electron](https://img.shields.io/badge/Electron-40+-47848F.svg)
![License](https://img.shields.io/badge/License-Freeware-red.svg)

## Features

- **Multiple input formats**: Enter a username, `u/username`, `r/subreddit`, or full Reddit URL
- **Photo and video downloads**: Extracts images, videos, GIFs, and crosspost media
- **RedGIFs support**: Downloads full HD videos with audio from RedGIFs embeds
- **Reddit video HLS**: Downloads Reddit-hosted videos with reliable video and audio muxing
- **Media type filter**: Choose videos only, photos only, or both
- **Smart organization**: Saves into separate `Photos/` and `Videos/` folders
- **Duplicate detection**: Skips already-downloaded files using SHA256 content hashing
- **Pause, resume, and cancel**: Keeps long downloads controllable
- **Automatic updates**: Checks GitHub Releases and verifies installer hashes when release notes include `SHA256: <hash>`
- **About dialog**: Shows version and licensing details

## Download

Grab the latest installer from [Releases](https://github.com/karagioules/Reddit_Media_Downloader/releases/latest).

## Build From Source

```bash
cd electron_app
npm install
npm run electron:dev
```

Create the Windows installer:

```bash
cd electron_app
npm run dist
# Output: electron_app/dist-electron/GKMediaDownloader-Setup.exe
```

## Usage

1. Launch GKMediaDownloader.
2. Enter a Reddit username, profile URL, or subreddit:
   - `username`
   - `u/username`
   - `r/subreddit`
   - `https://www.reddit.com/user/username/`
3. Choose the media filter in Settings.
4. Click **Start**.
5. Files are saved to `~/Downloads/<username or subreddit>/`.

## Auto-Update System

The app checks GitHub Releases on launch:

- Compares the latest release tag with the current app version
- Prompts with release notes before downloading
- Downloads the `.exe` installer from the release assets
- Verifies download integrity when release notes include `SHA256: <64-char hex>`
- Installs through the Windows installer and tracks failed update attempts

## Output Structure

```text
~/Downloads/
  username/
    Photos/
      20260120_abc123_post-title_001.jpg
    Videos/
      20260118_ghi789_video-post_001.mp4
    index.json
```

## Changelog

**4.2.2**
- Add root `LICENSE`, bundled third-party notices, and installer-shipped license files
- Point auto-updates at `karagioules/Reddit_Media_Downloader` GitHub Releases
- Refresh README header, release links, and contribution policy

**4.2.1**
- Add RedGIFs API integration for full HD videos with audio
- Download Reddit-hosted videos via HLS streams for reliable video and audio
- Fix 403 errors on audio downloads caused by Reddit path-specific auth tokens
- Remove duplicate and bogus media entries from embedded video posts
- Fix file extension detection for RedGIFs downloads

**4.1.3** - New app logo in-app, desktop shortcut, and installer

**4.1.2** - Fix audio 403 errors by preserving query string auth tokens

**4.1.1** - Fix audio download by adding CMAF audio URL candidates

**4.1.0** - Fix audioCandidatesFromVideo typo and add Logs export button

## License

GKMediaDownloader is proprietary freeware. It is free to use for personal and commercial use, but modification, redistribution, resale, and sublicensing require prior written permission from George Karagioules.

See [LICENSE](LICENSE) for the EULA and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled third-party notices. The app is not affiliated with Reddit, Inc. or RedGIFs.

For licensing inquiries, see the Contact section of https://github.com/gkaragioul.
