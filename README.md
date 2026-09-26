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

**Optional Facebook login.** Settings has an **Open Facebook login** button. It opens Facebook's own login page inside the app; the app never sees or stores your password. After you log in, Facebook's session cookies are kept on your computer in the app's persistent Electron session (the `Partitions/gkmd-facebook` folder inside the app's user-data folder) and are sent to Facebook with later Facebook page requests, so reels collections can load beyond the first public batch. Anyone with access to your user account on that computer can use that session. The login is not required for Reddit, RedGIFs, Erome, or public Facebook media. To end the session, log out in the Facebook login window or delete that `gkmd-facebook` folder while the app is closed. Downloading with a logged-in session is subject to Facebook's terms for your account.

## Disclaimer

GK Media Downloader is provided as is, without warranty of any kind, under the [GNU General Public License v3.0 or later](LICENSE). Use it at your own risk; you are responsible for how you use it. It downloads media that other people posted to Reddit, RedGIFs, Erome, and Facebook, and you are responsible for respecting Reddit's terms, the other sites' terms, and the rights of the people who posted that media. Sites can change or block access at any time, so downloads may be incomplete. If you sign in to Facebook in the app, that session is kept on your computer.

## License

GPL-3.0-or-later. Bundled third-party components retain their own license notices, including the GPL-enabled FFmpeg build used for video muxing.
