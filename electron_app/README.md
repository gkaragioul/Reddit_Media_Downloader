# GK Media Downloader

Portable Linux-first desktop app for downloading media from Reddit, RedGIFs, Erome, and Facebook media URLs.

## Features

- Reddit users, subreddits, and individual post URLs.
- Optional Reddit OAuth credentials for listings that Reddit blocks with HTTP 403.
- RedGIFs profile, niche, and single-post downloads.
- Erome account and album downloads.
- Images, GIFs, videos, and audio-capable video downloads.
- Reddit video audio handling through bundled FFmpeg/HLS and mux fallback.
- Flat output: all media for a source is saved in one folder, without `Photos/`, `Videos/`, or `Audio/` subfolders.
- Duplicate skipping by filename and optional SHA256 checks.
- Pause, resume, cancel, logs, and open-output-folder controls.

## Usage

1. Launch **GK Media Downloader**.
2. Paste a supported URL or Reddit shorthand:
   - `u/username`
   - `r/subreddit`
   - `https://www.reddit.com/r/.../comments/<id>/...`
   - `https://www.redgifs.com/users/<name>`
   - `https://www.redgifs.com/watch/<slug>`
   - `https://www.redgifs.com/niches/<niche>`
   - `https://www.erome.com/<name>`
   - `https://www.erome.com/a/<album>`
   - `https://www.facebook.com/photo?fbid=<id>`
   - `https://www.facebook.com/watch/?v=<id>`
3. Optional: add Reddit OAuth client ID/secret in Settings if Reddit returns HTTP 403.
4. Click **Start**.

## Output

Files are saved flat under the source folder:

```text
~/Downloads/redgifs_exampleuser/
  20260722_firstslug_redgifs-exampleuser_001.mp4
  20260722_secondslug_redgifs-exampleuser_001.mp4
  index.json
```

## Linux portable build

```bash
npm install
npm test
npm run lint
npm run build
npm run electron:build -- --linux
```

Artifacts are written to `dist-electron/`:

- `GK-Media-Downloader-Linux-x64.tar.gz`
- `GK-Media-Downloader-Linux-x86_64.AppImage`
- `linux-unpacked/`

## Responsible use

Use this app only for media you have the right or permission to download, and comply with Reddit, RedGIFs, Erome, Facebook, copyright, privacy, and local rules.

## License

GPL-3.0-or-later. Bundled third-party components retain their own license notices, including the GPL-enabled FFmpeg build used for video muxing.
