<h1 align="center">GKMediaDownloader</h1>

<p align="center">
  <strong>Windows desktop app for downloading public Reddit photos and videos.</strong><br>
  Built with Electron, React, TypeScript, and Tailwind CSS.
</p>

<p align="center">
  <a href="#features">Features</a> -
  <a href="#usage">Usage</a> -
  <a href="#build-from-source">Build</a> -
  <a href="#license">License</a>
</p>

![Windows](https://img.shields.io/badge/Windows-10+-0078D6.svg)
![Electron](https://img.shields.io/badge/Electron-40+-47848F.svg)
![License](https://img.shields.io/badge/License-Freeware-red.svg)

## Overview

GKMediaDownloader downloads public images and videos from Reddit user profiles and subreddits. It is designed for simple batch downloading, organized output folders, duplicate detection, and reliable handling of common Reddit-hosted and embedded media formats.

This app is not affiliated with Reddit, Inc. or RedGIFs.

## Features

- **Multiple input formats**: Enter a username, `u/username`, `r/subreddit`, or full Reddit URL
- **Photo and video downloads**: Extracts images, videos, GIFs, and crosspost media
- **RedGIFs support**: Downloads RedGIFs media embedded in Reddit posts
- **Reddit video support**: Handles Reddit-hosted video streams with audio muxing
- **Media type filter**: Choose videos only, photos only, or both
- **Smart organization**: Saves into separate `Photos/` and `Videos/` folders
- **Duplicate detection**: Skips already-downloaded files using SHA256 content hashing
- **Pause, resume, and cancel**: Keeps long downloads controllable
- **About dialog**: Shows product, version, and licensing details

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
```

## License

GKMediaDownloader is proprietary freeware. It is free to use for personal and commercial use, but modification, redistribution, resale, and sublicensing require prior written permission from George Karagioules.

See [LICENSE](LICENSE) for the EULA and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled third-party notices.

For licensing inquiries, see the Contact section of https://github.com/gkaragioul.
