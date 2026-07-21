<div align="center">

# GK Media Downloader

**Portable Linux media downloader for Reddit, RedGIFs, Erome, and Facebook media URLs.**

Download images, GIFs, videos, and Reddit videos with audio into one flat media folder per source.

</div>

## Features

- **Reddit support**: users, subreddits, and individual post URLs.
- **Reddit OAuth option**: add client ID/secret in Settings to use `oauth.reddit.com` when public Reddit listings return HTTP 403.
- **RedGIFs support**: full profile pagination, niche pages, and single RedGIFs post URLs.
- **Erome support**: account pages and album URLs.
- **Facebook support**: best-effort public photo/video URL extraction.
- **Flat output**: all downloaded media goes into one folder; no `Photos/`, `Videos/`, or `Audio/` subfolders.
- **Video audio**: bundled FFmpeg handles Reddit HLS/audio muxing when available.
- **Controls**: pause, resume, cancel, open output folder, and save logs.
- **Portable Linux packaging**: AppImage, tar.gz, and unpacked app folder; no installer required.

## Usage

1. Launch **GK Media Downloader**.
2. Paste a supported input:
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
3. If Reddit returns HTTP 403, create a Reddit app at `https://www.reddit.com/prefs/apps` and enter the client ID/secret in Settings.
4. Click **Start**.

## Output

Downloaded files are saved flat under `~/Downloads/<source>/`:

```text
~/Downloads/redgifs_exampleuser/
  20260722_firstslug_redgifs-exampleuser_001.mp4
  20260722_secondslug_redgifs-exampleuser_001.mp4
  index.json
```

## Building

```bash
cd electron_app
npm install
npm test
npm run lint
npm run build
npm run electron:build -- --linux
```

Linux artifacts are written to `electron_app/dist-electron/`:

- `GK-Media-Downloader-Linux-x64.tar.gz`
- `GK-Media-Downloader-Linux-x86_64.AppImage`
- `linux-unpacked/`

## Responsible use

GK Media Downloader is intended for lawful personal archiving and organization of media that you have the right or permission to download. You are responsible for complying with Reddit, RedGIFs, Erome, Facebook, copyright, privacy, and local rules. This project is not affiliated with, endorsed by, or sponsored by Reddit, RedGIFs, Erome, or any media host.

## License

GPL-3.0-or-later. Bundled third-party components retain their own license notices, including the GPL-enabled FFmpeg build used for video muxing.
