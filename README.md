# Reddit Downloader

A cross-platform application that downloads public images and videos from Reddit user profiles and subreddits. Available as a native macOS app (SwiftUI), a Windows desktop app (Python/tkinter), and a Windows Electron app (React + TypeScript).

![macOS](https://img.shields.io/badge/macOS-13.0+-blue.svg)
![Windows](https://img.shields.io/badge/Windows-10+-0078D6.svg)
![Swift](https://img.shields.io/badge/Swift-5.9+-orange.svg)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB.svg)
![Electron](https://img.shields.io/badge/Electron-40+-47848F.svg)
![License](https://img.shields.io/badge/License-Proprietary-red.svg)

## Features

- **Multiple Input Formats**: Enter a username, `u/username`, `r/subreddit`, or full Reddit URL
- **Photo & Video Downloads**: Automatically extracts and downloads images, videos, and GIFs
- **Smart Organization**: Files are organized into separate `Photos/` and `Videos/` folders
- **Duplicate Detection**: Skip already-downloaded files using content hashing (SHA256)
- **Pause/Resume/Cancel**: Full control over downloads with state persistence
- **Batch Mode**: Process downloads in batches with configurable pause intervals
- **RedGifs Support**: Downloads videos from RedGifs links embedded in posts
- **ffmpeg Integration**: Optional video+audio muxing for Reddit-hosted videos

## Platforms

### macOS (SwiftUI)

Native macOS application built with SwiftUI and async/await concurrency.

**Requirements:**
- macOS 13.0 or later
- Xcode 15.0+ (for building from source)
- [ffmpeg](https://ffmpeg.org/) (optional, for video muxing and GIF conversion)

**Install & Run:**
```bash
git clone https://github.com/georgekgr12/RedditDownloader.git
cd RedditDownloader
open RedditMediaDownloader.xcodeproj
# Build and run with Cmd+R
```

**Install ffmpeg (optional):**
```bash
brew install ffmpeg
```

**Additional macOS features:**
- Rate limiting with three speed modes (Polite/Normal/Fast)
- Configurable concurrent downloads (2-4 simultaneous)
- Network monitoring with automatic pause/resume
- GIF to MP4 conversion

---

### Windows Native (Python/tkinter)

Standalone Windows desktop application with a dark-themed UI.

**Requirements:**
- Python 3.10+
- [ffmpeg](https://ffmpeg.org/) on PATH (optional, for video muxing)

**Install & Run:**
```bash
git clone https://github.com/georgekgr12/RedditDownloader.git
cd RedditDownloader
pip install requests pillow
python windows_reddit_downloader.py
```

**Build portable EXE:**
```bash
pip install pyinstaller
build_portable_windows.bat
```

**Additional features:**
- Configurable request delay
- Activity log with timestamps
- Settings dialog for batch size, pause intervals, and duplicate detection

---

### Windows Electron (React + TypeScript)

Modern Windows desktop application built with Electron, React, TypeScript, Vite, and Tailwind CSS. Bundles ffmpeg automatically.

**Requirements:**
- Node.js 18+

**Install & Run:**
```bash
git clone https://github.com/georgekgr12/RedditDownloader.git
cd RedditDownloader/electron_app
npm install
npm run electron:dev
```

**Build portable EXE:**
```bash
npm run dist
# Output in dist-electron/
```

**Additional features:**
- Modern React UI with Tailwind CSS styling
- Bundled ffmpeg (no separate install needed)
- Electron-based with full desktop integration

## Usage

1. Launch the app on your platform
2. Enter a Reddit username, profile URL, or subreddit:
   - `username`
   - `u/username`
   - `r/subreddit`
   - `https://www.reddit.com/user/username/`
   - `https://www.reddit.com/r/subreddit/`
3. Click **Download** / **Start Download**
4. Files are saved to: `~/Downloads/<username or subreddit>/`

## Output Structure

```
~/Downloads/
  username/
    Photos/
      20260120_abc123_post-title_001.jpg
      20260119_def456_another-post_001.png
    Videos/
      20260118_ghi789_video-post_001.mp4
    index.json
```

### File Naming Convention

```
YYYYMMDD_postId_titleSlug_index.extension
```

- `YYYYMMDD`: Post creation date
- `postId`: Reddit post ID for reference
- `titleSlug`: Sanitized post title (max 50-80 chars)
- `index`: Media index for posts with multiple files
- `extension`: Original file extension

## Version

**3.1** - Simplified download folder structure — saves directly to `Downloads/<name>/`

**3.0** - Cross-platform release (macOS, Windows Native, Windows Electron)

## Author

**George Karagioules**
Contact: see https://github.com/gkaragioul

## License

This software is proprietary. All rights reserved.

---

*This app is not affiliated with Reddit, Inc.*
