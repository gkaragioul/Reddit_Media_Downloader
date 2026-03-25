# GKMediaDownloader

A Windows desktop application that downloads public images and videos from Reddit user profiles and subreddits. Built with Electron, React, TypeScript, and Tailwind CSS with bundled ffmpeg.

![Windows](https://img.shields.io/badge/Windows-10+-0078D6.svg)
![Electron](https://img.shields.io/badge/Electron-40+-47848F.svg)
![License](https://img.shields.io/badge/License-Proprietary-red.svg)

## Features

- **Multiple Input Formats**: Enter a username, `u/username`, `r/subreddit`, or full Reddit URL
- **Photo & Video Downloads**: Automatically extracts and downloads images, videos, and GIFs
- **Media Type Filter**: Choose to download videos only, photos only, or both
- **Smart Organization**: Files organized into separate `Photos/` and `Videos/` folders
- **Duplicate Detection**: Skip already-downloaded files using SHA256 content hashing
- **Pause/Resume/Cancel**: Full control over downloads
- **RedGIFs Support**: Downloads full HD videos with audio from RedGIFs embeds via their API
- **Reddit Video HLS**: Downloads Reddit-hosted videos with audio via HLS streams
- **Crosspost Support**: Downloads media from crossposted content
- **Auto-Updates**: Check for updates from GitHub releases
- **About Dialog**: Version info and license details

## Install & Run

```bash
cd electron_app
npm install
npm run electron:dev
```

## Build Portable EXE

```bash
cd electron_app
npm run dist
# Output in dist-electron/
```

## Usage

1. Launch GKMD
2. Enter a Reddit username, profile URL, or subreddit:
   - `username`
   - `u/username`
   - `r/subreddit`
   - `https://www.reddit.com/user/username/`
3. Choose media filter in Settings (Both / Photos / Videos)
4. Click **Start**
5. Files are saved to: `~/Downloads/<username or subreddit>/`

## Output Structure

```
~/Downloads/
  username/
    Photos/
      20260120_abc123_post-title_001.jpg
    Videos/
      20260118_ghi789_video-post_001.mp4
    index.json
```

## Changelog

**4.2.1**
- Add RedGIFs API integration — downloads full HD videos with audio from RedGIFs embeds
- Download Reddit-hosted videos via HLS streams for reliable video+audio
- Fix 403 errors on audio downloads caused by Reddit's path-specific auth tokens
- Remove duplicate/bogus media entries from embedded video posts
- Fix file extension detection for RedGIFs downloads (was `.bin`, now `.mp4`)

**4.1.3** — New app logo (in-app, desktop shortcut, and installer)

**4.1.2** — Fix audio 403 errors by preserving query string auth tokens

**4.1.1** — Fix audio download: add CMAF audio URL candidates

**4.1.0** — Fix audioCandidatesFromVideo typo, add Logs export button

## Author

**George Karagioules**

## License

This software is proprietary. All rights reserved.

---

*This app is not affiliated with Reddit, Inc.*
