

https://github.com/user-attachments/assets/34691703-eeae-4040-ab24-1379d7f6f248

<div align="center">

<h1>Reddit Media Downloader</h1>

<hr>

<p>
  <strong>Free Windows desktop app for downloading public Reddit photos and videos.</strong><br>
  <em>Batch profile and subreddit downloads with duplicate detection, Reddit video audio muxing, and organized photo/video folders.</em>
</p>

<p>
  <a href="https://github.com/georgekgr12/Reddit_Media_Downloader/releases/latest">Download</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#requirements">Requirements</a> &bull;
  <a href="#building">Building</a> &bull;
  <a href="#license">License</a>
</p>

<hr>

</div>

## Features

- **Multiple input formats**: Enter a username, `u/username`, `r/subreddit`, or a full Reddit URL.
- **Photo and video downloads**: Extract images, videos, GIFs, galleries, video galleries, and crosspost media.
- **RedGIFs support**: Download RedGIFs media embedded in Reddit posts.
- **Reddit video support**: Mux Reddit DASH video and audio streams through bundled FFmpeg.
- **Media type filter**: Choose videos only, photos only, or both.
- **Smart organization**: Save into separate `Photos/` and `Videos/` folders.
- **Duplicate detection**: Skip already-downloaded files using SHA256 content hashing.
- **Pause, resume, and cancel**: Keep long downloads controllable.
- **Auto updates**: Check this repository's Releases tab, verify SHA256 when provided, and install the accepted update.

## Usage

1. Launch Reddit Media Downloader.
2. Enter a Reddit username, profile URL, or subreddit: `username`, `u/username`, `r/subreddit`, or `https://www.reddit.com/user/username/`.
3. Choose the media filter in Settings.
4. Click **Start**.
5. Files are saved to `~/Downloads/<username or subreddit>/`.

## Output

```text
~/Downloads/
  username/
    Photos/
      20260120_abc123_post-title_001.jpg
    Videos/
      20260118_ghi789_video-post_001.mp4
    index.json
```

## Requirements

- Windows 10 or 11.
- Internet access for Reddit, RedGIFs, supported media hosts, and GitHub update checks.
- Enough free disk space for downloaded media and temporary video muxing files.

## Building

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

The NSIS installer is written to `electron_app/dist-electron/`. Publish the installer on this repository's Releases tab and include `SHA256: <64-char hex>` in the release notes when you want the in-app updater to verify the download.

## License

Reddit Media Downloader is free software released under the GNU General Public License v3.0 or later. You may use, study, share, and modify it under the terms of the GPL.

Binary releases include a bundled GPL-enabled FFmpeg build through `ffmpeg-static`; the corresponding application source is available in this repository.

See [LICENSE](LICENSE) for the full GPL text and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled third-party notices.

For licensing inquiries, email **georgekaragioules@gmail.com**.
