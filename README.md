# Reddit Profile Downloader

A native macOS application built with SwiftUI that downloads public images and videos from Reddit user profiles and subreddits.

![macOS](https://img.shields.io/badge/macOS-13.0+-blue.svg)
![Swift](https://img.shields.io/badge/Swift-5.9+-orange.svg)
![License](https://img.shields.io/badge/License-Proprietary-red.svg)

## Features

- **Multiple Input Formats**: Enter a username, `u/username`, `r/subreddit`, or full Reddit URL
- **Photo & Video Downloads**: Automatically extracts and downloads images, videos, and GIFs
- **Smart Organization**: Files are organized into separate `Photos/` and `Videos/` folders
- **Duplicate Detection**: Skip already-downloaded files using content hashing (SHA256)
- **Rate Limiting**: Three speed modes (Polite/Normal/Fast) to avoid API throttling
- **Concurrent Downloads**: Configurable concurrent download limit (2-4 simultaneous downloads)
- **Batch Mode**: Process downloads in batches with configurable pause intervals
- **Pause/Resume/Cancel**: Full control over downloads with state persistence
- **Network Resilience**: Automatic retry on network failures with exponential backoff
- **RedGifs Support**: Downloads videos from RedGifs links embedded in posts
- **GIF to MP4 Conversion**: Automatically converts GIF files to MP4 for better compatibility

## Requirements

- macOS 13.0 or later
- Xcode 15.0+ (for building from source)
- [ffmpeg](https://ffmpeg.org/) (optional, required for video muxing and GIF conversion)

## Installation

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/georgekgr12/RedditProfileDownloader.git
   ```

2. Open `RedditMediaDownloader.xcodeproj` in Xcode

3. Build and run (Cmd+R)

### ffmpeg (Optional)

For full video support (combining video and audio streams), install ffmpeg:

```bash
brew install ffmpeg
```

The app searches for ffmpeg in these locations:
- `/opt/homebrew/bin/ffmpeg` (Apple Silicon)
- `/usr/local/bin/ffmpeg` (Intel)
- `/usr/bin/ffmpeg`

## Usage

1. Launch the app
2. Enter a Reddit username, profile URL, or subreddit:
   - `username`
   - `u/username`
   - `r/subreddit`
   - `https://www.reddit.com/user/username/`
   - `https://www.reddit.com/r/subreddit/`

3. Click **Download**
4. Files are saved to: `~/Downloads/RedditDownloads/<source>_<timestamp>/`

### Settings

Access settings via the gear icon:

- **Speed Mode**: Polite (2s delay), Normal (1s delay), Fast (0.5s delay)
- **Concurrent Downloads**: 2, 3, or 4 simultaneous downloads
- **Skip Duplicates**: Enable content-based duplicate detection
- **Batch Mode**: Download in batches with configurable pause intervals

## Output Structure

```
~/Downloads/RedditDownloads/
  u_username_20260125_143052/
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
- `titleSlug`: Sanitized post title (max 50 chars)
- `index`: Media index for posts with multiple files
- `extension`: Original file extension

## Technical Details

- Built with SwiftUI and async/await concurrency
- Uses Reddit's public JSON API (no authentication required)
- Implements exponential backoff for rate limiting
- SHA256 content hashing for duplicate detection
- Network monitoring with automatic pause/resume

## Version

**1.0** - Initial Release

## Author

**George Karagioules**
Contact: see https://github.com/gkaragioul

## License

This software is proprietary. All rights reserved.

See the in-app EULA for full license terms.

---

*This app is not affiliated with Reddit, Inc.*
