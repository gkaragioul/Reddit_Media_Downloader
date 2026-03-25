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
- **Reddit Video Muxing**: Automatic video+audio muxing with bundled ffmpeg
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

## Version

**4.1.6** — Fix audio: download Reddit videos with audio via HLS stream

## Author

**George Karagioules**

## License

This software is proprietary. All rights reserved.

---

*This app is not affiliated with Reddit, Inc.*
