/**
 * GKMediaDownloader engine.
 * Node.js built-in modules only.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, execFileSync } = require('child_process');
const { URL } = require('url');
const os = require('os');

// ── Constants ──────────────────────────────────────────────────

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GKMD/4.0';
const VALID_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.webm']);
const VIDEO_EXT = new Set(['.mp4', '.webm']);
const MAX_PAGES = 12;
const DOWNLOAD_TIMEOUT = 45_000;
const API_TIMEOUT = 30_000;
const MAX_REDIRECTS = 5;

// ── Helpers ────────────────────────────────────────────────────

function normalizeInput(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) throw new Error('Please enter a username, subreddit, or Reddit URL.');

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const parsed = new URL(trimmed);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && ['user', 'u'].includes(parts[0].toLowerCase()))
      return { kind: 'user', value: parts[1] };
    if (parts.length >= 2 && parts[0].toLowerCase() === 'r')
      return { kind: 'subreddit', value: parts[1] };
    throw new Error('Unsupported Reddit URL format.');
  }

  if (trimmed.toLowerCase().startsWith('u/')) return { kind: 'user', value: trimmed.slice(2) };
  if (trimmed.toLowerCase().startsWith('r/')) return { kind: 'subreddit', value: trimmed.slice(2) };
  return { kind: 'user', value: trimmed };
}

function sanitizeFilename(name) {
  let s = (name || '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[-._]+|[-._]+$/g, '');
  return (s.slice(0, 80) || 'file');
}

function buildListingUrl(kind, value, after) {
  const base = kind === 'user'
    ? `https://www.reddit.com/user/${value}/submitted/.json`
    : `https://www.reddit.com/r/${value}/new/.json`;
  return base + '?limit=100&raw_json=1' + (after ? `&after=${after}` : '');
}

function detectExt(url, defaultExt = '.bin') {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase().split('?')[0];
    return VALID_EXT.has(ext) ? ext : defaultExt;
  } catch {
    return defaultExt;
  }
}

function audioCandidatesFromVideo(videoUrl) {
  try {
    const parsed = new URL(videoUrl);
    const p = parsed.pathname;
    const base = p.substring(0, p.lastIndexOf('/'));
    const origin = `${parsed.protocol}//${parsed.host}${base}`;
    const qs = parsed.search || ''; // preserve auth tokens from video URL
    // Reddit uses multiple audio URL patterns (CMAF is current, DASH is legacy)
    return [
      `${origin}/CMAF_AUDIO_128.mp4${qs}`,
      `${origin}/CMAF_AUDIO_64.mp4${qs}`,
      `${origin}/DASH_AUDIO_128.mp4${qs}`,
      `${origin}/DASH_audio.mp4${qs}`,
      `${origin}/DASH_AUDIO_64.mp4${qs}`,
      `${origin}/audio${qs}`,
    ];
  } catch {
    return [];
  }
}


function getMediaEntries(postData) {
  const entries = [];
  const seen = new Set();

  function add(url, kind, audioUrls, hlsUrl) {
    if (!url || seen.has(url)) return;
    seen.add(url);
    entries.push({ url, kind, audioUrls: audioUrls || [], hlsUrl: hlsUrl || null });
  }

  // Use crosspost parent data if available (crossposted videos store media there)
  const effectivePost = (postData.crosspost_parent_list && postData.crosspost_parent_list.length > 0)
    ? postData.crosspost_parent_list[0]
    : postData;

  // 1. Reddit-hosted video (check first — highest priority for v.redd.it links)
  const redditVideoObj =
    effectivePost.secure_media?.reddit_video ||
    effectivePost.media?.reddit_video ||
    postData.secure_media?.reddit_video ||
    postData.media?.reddit_video;
  if (redditVideoObj?.fallback_url) {
    add(redditVideoObj.fallback_url, 'reddit_video',
      audioCandidatesFromVideo(redditVideoObj.fallback_url),
      redditVideoObj.hls_url || null);
  }

  // 2. Reddit video preview (some posts only have this)
  const previewVideoObj =
    effectivePost.preview?.reddit_video_preview ||
    postData.preview?.reddit_video_preview;
  if (previewVideoObj?.fallback_url) {
    add(previewVideoObj.fallback_url, 'reddit_video',
      audioCandidatesFromVideo(previewVideoObj.fallback_url),
      previewVideoObj.hls_url || null);
  }

  // 3. Direct URL (skip v.redd.it links since they're handled above as reddit_video)
  const directUrl = postData.url_overridden_by_dest || postData.url;
  if (typeof directUrl === 'string') {
    // Skip v.redd.it — already handled by reddit_video extraction above
    if (!directUrl.includes('v.redd.it')) {
      const ext = detectExt(directUrl, '');
      if (ext) add(directUrl, VIDEO_EXT.has(ext) ? 'video' : 'photo');
    }
  }

  // 4. Gallery
  const gallery = postData.gallery_data || effectivePost.gallery_data;
  const meta = postData.media_metadata || effectivePost.media_metadata;
  if (gallery && meta) {
    for (const item of (gallery.items || [])) {
      const media = meta[item.media_id] || {};
      const source = media.s || {};
      // mp4 for video galleries, u or gif for images
      const candidate = source.mp4 || source.u || source.gif;
      if (candidate) {
        const cleaned = candidate.replace(/&amp;/g, '&');
        const ext = detectExt(cleaned, '.jpg');
        add(cleaned, VIDEO_EXT.has(ext) ? 'video' : 'photo');
      }
    }
  }

  // 5. Embedded media (e.g., gfycat, redgifs) — extract from oembed or type-specific media
  const embedMedia = effectivePost.secure_media || effectivePost.media || postData.secure_media || postData.media;
  if (embedMedia && !embedMedia.reddit_video) {
    // Some embeds have a direct video URL in type field
    const oembed = embedMedia.oembed;
    if (oembed && oembed.thumbnail_url) {
      // For gfycat/redgifs, the thumbnail often has a pattern we can use
      const thumbUrl = oembed.thumbnail_url;
      if (thumbUrl.includes('redgifs.com') || thumbUrl.includes('gfycat.com')) {
        // Try to extract a video URL from the thumbnail pattern
        const videoUrl = thumbUrl.replace(/-size_restricted\.gif$/, '.mp4')
                                  .replace(/\.jpg$/, '.mp4')
                                  .replace(/-mobile\.(jpg|gif)$/, '.mp4');
        if (videoUrl.endsWith('.mp4')) {
          add(videoUrl, 'video');
        }
      }
    }
  }

  return entries;
}

function formatDate(utc) {
  const d = new Date((utc || Date.now() / 1000) * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function timestamp() {
  const d = new Date();
  return d.toLocaleTimeString('en-US', { hour12: false });
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// ── HTTP utilities (built-in only) ─────────────────────────────

function httpGet(urlStr, timeout, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > MAX_REDIRECTS) return reject(new Error('Too many redirects'));
    const parsed = new URL(urlStr);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(urlStr, {
      headers: { 'User-Agent': USER_AGENT },
      timeout,
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307) {
        const location = res.headers.location;
        res.resume();
        if (!location) return reject(new Error('Redirect with no location'));
        const next = location.startsWith('http') ? location : new URL(location, urlStr).href;
        return httpGet(next, timeout, hops + 1).then(resolve, reject);
      }
      resolve(res);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

async function httpGetJson(urlStr) {
  const res = await httpGet(urlStr, API_TIMEOUT);
  if (res.statusCode !== 200) {
    res.resume();
    throw new Error(`Reddit API returned ${res.statusCode}`);
  }
  return new Promise((resolve, reject) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error('Failed to parse Reddit response')); }
    });
    res.on('error', reject);
  });
}

// ── SHA256 ──────────────────────────────────────────────────────

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// ── FFmpeg ──────────────────────────────────────────────────────

let _ffmpegPath = undefined; // null = not found, string = path, undefined = not checked

function findFfmpeg() {
  if (_ffmpegPath !== undefined) return _ffmpegPath;

  // 1. Try bundled ffmpeg-static (handles asar unpacking)
  try {
    let bundled = require('ffmpeg-static');
    if (bundled) {
      // In production Electron, the asar-unpacked path is needed
      bundled = bundled.replace('app.asar', 'app.asar.unpacked');
      if (fs.existsSync(bundled)) {
        _ffmpegPath = bundled;
        return _ffmpegPath;
      }
    }
  } catch {}

  // 2. Fall back to system-installed ffmpeg
  try {
    const result = execFileSync('where', ['ffmpeg'], { encoding: 'utf-8', timeout: 5000 });
    _ffmpegPath = result.trim().split(/\r?\n/)[0] || null;
  } catch {
    _ffmpegPath = null;
  }
  return _ffmpegPath;
}

function runFfmpeg(args) {
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile(ffmpeg, args, { timeout: 120_000 }, (err, _stdout, stderr) => {
      if (err && stderr) {
        // Extract last meaningful line from ffmpeg stderr for diagnostics
        const lines = stderr.trim().split(/\r?\n/).filter(l => l.trim());
        const last = lines[lines.length - 1] || '';
        err._ffmpegDetail = last;
      }
      resolve(!err);
    });
  });
}

// ── Downloader class ────────────────────────────────────────────

class RedditDownloader {
  constructor(win) {
    this._win = win;
    this._cancelled = false;
    this._paused = false;
    this._pauseResolve = null;
    this._currentRes = null;
    this._sleepTimer = null;
    this._running = false;
    this._outputFolder = null;
    this._downloadedHashes = new Set();
    this._existingNames = new Set();
  }

  isRunning() { return this._running; }
  getOutputFolder() { return this._outputFolder; }

  togglePause() {
    this._paused = !this._paused;
    if (!this._paused && this._pauseResolve) {
      this._pauseResolve();
      this._pauseResolve = null;
    }
    if (!this._paused && this._currentRes) {
      this._currentRes.resume();
    }
    if (this._paused && this._currentRes) {
      this._currentRes.pause();
    }
    this._log(this._paused ? 'Paused' : 'Resumed');
  }

  stop() {
    this._cancelled = true;
    if (this._pauseResolve) {
      this._pauseResolve();
      this._pauseResolve = null;
    }
    if (this._currentRes) {
      try { this._currentRes.destroy(); } catch {}
      this._currentRes = null;
    }
    if (this._sleepTimer) {
      clearTimeout(this._sleepTimer);
      this._sleepTimer = null;
    }
  }

  // ── IPC helpers ───────────────────────────────────────────

  _log(msg) {
    try {
      this._win.webContents.send('download-log', `[${timestamp()}] ${msg}`);
    } catch {}
  }

  _sendProgress(downloaded, skipped, total, progress) {
    try {
      this._win.webContents.send('download-progress', { downloaded, skipped, total, progress });
    } catch {}
  }

  _sendComplete(stats) {
    try {
      this._win.webContents.send('download-complete', stats);
    } catch {}
  }

  // ── Utilities ─────────────────────────────────────────────

  _sleep(ms) {
    return new Promise((resolve) => {
      if (this._cancelled) return resolve();
      this._sleepTimer = setTimeout(() => { this._sleepTimer = null; resolve(); }, ms);
    });
  }

  async _waitIfPaused() {
    if (!this._paused || this._cancelled) return;
    await new Promise((resolve) => { this._pauseResolve = resolve; });
  }

  // ── Streaming download ────────────────────────────────────

  async _streamDownload(url, destPath) {
    if (this._cancelled) return false;
    await this._waitIfPaused();
    if (this._cancelled) return false;

    return new Promise(async (resolve) => {
      let res;
      try {
        res = await httpGet(url, DOWNLOAD_TIMEOUT);
      } catch (err) {
        this._log(`Download failed: ${err.message}`);
        return resolve(false);
      }

      if (res.statusCode !== 200) {
        res.resume();
        this._log(`HTTP ${res.statusCode} for ${path.basename(destPath)}`);
        return resolve(false);
      }

      this._currentRes = res;
      const ws = fs.createWriteStream(destPath);
      let finished = false;

      const cleanup = (success) => {
        if (finished) return;
        finished = true;
        this._currentRes = null;
        try { res.destroy(); } catch {}
        try { ws.destroy(); } catch {}
        if (!success) {
          try { fs.unlinkSync(destPath); } catch {}
        }
        resolve(success);
      };

      if (this._paused) res.pause();

      res.on('data', (chunk) => {
        if (this._cancelled) {
          cleanup(false);
          return;
        }
        ws.write(chunk);
      });

      res.on('end', () => {
        ws.end(() => cleanup(true));
      });

      res.on('error', () => cleanup(false));
      ws.on('error', () => cleanup(false));
    });
  }

  // ── FFmpeg mux ────────────────────────────────────────────

  async _tryMuxAudio(videoPath, audioUrls) {
    const ffmpeg = findFfmpeg();
    if (!ffmpeg || !audioUrls || audioUrls.length === 0) return videoPath;

    const ext = path.extname(videoPath);
    const audioTmp = videoPath.replace(ext, '.audio.mp4');
    const mergedTmp = videoPath.replace(ext, '.merged.mp4');

    try {
      // Try each audio URL candidate until one succeeds
      let audioDownloaded = false;
      for (const audioUrl of audioUrls) {
        if (this._cancelled) return videoPath;
        const ok = await this._streamDownload(audioUrl, audioTmp);
        if (ok && fs.existsSync(audioTmp) && fs.statSync(audioTmp).size > 0) {
          audioDownloaded = true;
          break;
        }
      }
      if (!audioDownloaded) return videoPath;

      const success = await runFfmpeg([
        '-y', '-i', videoPath, '-i', audioTmp, '-c', 'copy', mergedTmp,
      ]);

      if (success && fs.existsSync(mergedTmp) && fs.statSync(mergedTmp).size > 0) {
        try { fs.unlinkSync(videoPath); } catch {}
        fs.renameSync(mergedTmp, videoPath);
        this._log(`Muxed audio: ${path.basename(videoPath)}`);
      }
    } catch (err) {
      this._log(`FFmpeg mux failed: ${err.message}`);
    } finally {
      try { fs.unlinkSync(audioTmp); } catch {}
      try { fs.unlinkSync(mergedTmp); } catch {}
    }

    return videoPath;
  }

  // ── Pre-scan existing files ───────────────────────────────

  _preScan(dir) {
    try {
      for (const sub of ['Photos', 'Videos']) {
        const d = path.join(dir, sub);
        if (!fs.existsSync(d)) continue;
        for (const f of fs.readdirSync(d)) {
          this._existingNames.add(f);
        }
      }
    } catch {}
  }

  // ── Main download flow ────────────────────────────────────

  async start(input, settings = {}) {
    if (this._running) throw new Error('Already running');
    this._running = true;
    this._cancelled = false;
    this._paused = false;
    this._downloadedHashes = new Set();
    this._existingNames = new Set();

    const skipDuplicates = settings.skipDuplicates !== false;
    const requestDelay = Math.max(100, (settings.requestDelay || 0.5) * 1000);
    const mediaFilter = settings.mediaFilter || 'both'; // 'both', 'photos', 'videos'

    let downloaded = 0;
    let skipped = 0;

    try {
      // Phase 1: Parse input & create folders
      const { kind, value } = normalizeInput(input);
      this._log(`Fetching posts for ${kind}/${value}`);

      const targetRoot = path.join(os.homedir(), 'Downloads', value);
      const photosDir = path.join(targetRoot, 'Photos');
      const videosDir = path.join(targetRoot, 'Videos');
      fs.mkdirSync(photosDir, { recursive: true });
      fs.mkdirSync(videosDir, { recursive: true });
      this._outputFolder = targetRoot;
      this._preScan(targetRoot);

      const ffmpeg = findFfmpeg();
      this._log(ffmpeg ? `FFmpeg found: ${path.basename(ffmpeg)}` : 'FFmpeg not found — videos will lack audio');
      if (mediaFilter !== 'both') this._log(`Media filter: ${mediaFilter} only`);

      // Phase 2: Fetch posts with pagination
      const allMedia = [];
      let after = null;

      for (let page = 0; page < MAX_PAGES; page++) {
        if (this._cancelled) break;
        await this._waitIfPaused();
        if (this._cancelled) break;

        const url = buildListingUrl(kind, value, after);
        this._log(`Fetching page ${page + 1}...`);

        let payload;
        try {
          payload = await httpGetJson(url);
        } catch (err) {
          this._log(`API error: ${err.message}`);
          break;
        }

        const children = ((payload.data || {}).children) || [];
        if (children.length === 0) {
          this._log('No more posts found');
          break;
        }

        for (const child of children) {
          const post = child.data || {};
          const postId = post.id || 'post';
          const title = sanitizeFilename(post.title || 'untitled');
          const dateStr = formatDate(post.created_utc);
          const entries = getMediaEntries(post);
          for (let idx = 0; idx < entries.length; idx++) {
            allMedia.push({ dateStr, postId, title, mediaIdx: idx + 1, entry: entries[idx] });
          }
        }

        after = (payload.data || {}).after;
        if (!after) {
          this._log('Reached end of posts');
          break;
        }

        if (page < MAX_PAGES - 1) await this._sleep(requestDelay);
      }

      if (this._cancelled) {
        this._log('Cancelled during fetch');
        this._sendComplete({ downloaded, skipped, total: allMedia.length, cancelled: true });
        return;
      }

      const total = allMedia.length;
      this._log(`Found ${total} media entries`);
      this._sendProgress(0, 0, total, 0);

      // Phase 3: Download all media
      for (let i = 0; i < total; i++) {
        if (this._cancelled) break;
        await this._waitIfPaused();
        if (this._cancelled) break;

        const { dateStr, postId, title, mediaIdx, entry } = allMedia[i];
        // For reddit_video entries, force .mp4 extension (fallback URLs have query params)
        const isVideo = entry.kind === 'reddit_video' || entry.kind === 'video';
        const ext = (entry.kind === 'reddit_video') ? '.mp4' : detectExt(entry.url);
        const isVideoFile = isVideo || VIDEO_EXT.has(ext);

        // Apply media filter
        if (mediaFilter === 'photos' && isVideoFile) {
          skipped++;
          const progress = Math.round(((i + 1) / total) * 100);
          this._sendProgress(downloaded, skipped, total, progress);
          continue;
        }
        if (mediaFilter === 'videos' && !isVideoFile) {
          skipped++;
          const progress = Math.round(((i + 1) / total) * 100);
          this._sendProgress(downloaded, skipped, total, progress);
          continue;
        }

        const filename = `${dateStr}_${postId}_${title}_${String(mediaIdx).padStart(3, '0')}${ext}`;
        const outDir = isVideoFile ? videosDir : photosDir;
        const outPath = path.join(outDir, filename);

        const progress = Math.round(((i + 1) / total) * 100);

        // Skip if filename already exists
        if (this._existingNames.has(filename)) {
          skipped++;
          this._sendProgress(downloaded, skipped, total, progress);
          continue;
        }

        // Download
        let ok = false;

        // For reddit videos: try HLS download first (gets video+audio in one shot)
        if (entry.kind === 'reddit_video' && entry.hlsUrl && findFfmpeg()) {
          ok = await runFfmpeg([
            '-y',
            '-user_agent', USER_AGENT,
            '-i', entry.hlsUrl,
            '-c', 'copy', outPath,
          ]);
          if (ok && fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
            this._log(`HLS download: ${filename}`);
          } else {
            ok = false;
            try { fs.unlinkSync(outPath); } catch {}
          }
        }

        // Fallback: direct download from fallback/direct URL
        if (!ok && !this._cancelled) {
          ok = await this._streamDownload(entry.url, outPath);
          if (this._cancelled) break;

          if (ok && entry.kind === 'reddit_video') {
            // Try to mux audio separately (legacy path)
            await this._tryMuxAudio(outPath, entry.audioUrls);
          }
        }

        if (this._cancelled) break;

        if (!ok) {
          skipped++;
          this._log(`Skipped: ${filename}`);
          this._sendProgress(downloaded, skipped, total, progress);
          continue;
        }

        // Duplicate hash check
        if (skipDuplicates) {
          try {
            const hash = await sha256File(outPath);
            if (this._downloadedHashes.has(hash)) {
              try { fs.unlinkSync(outPath); } catch {}
              skipped++;
              this._log(`Skipped duplicate: ${filename}`);
              this._sendProgress(downloaded, skipped, total, progress);
              continue;
            }
            this._downloadedHashes.add(hash);
          } catch {}
        }

        downloaded++;
        this._existingNames.add(filename);
        this._log(`Saved: ${filename}`);
        this._sendProgress(downloaded, skipped, total, progress);
      }

      // Phase 4: Finalize
      const summary = {
        source: `${kind}/${value}`,
        downloaded,
        skipped,
        total,
        finished_at: new Date().toISOString(),
      };

      try {
        fs.writeFileSync(path.join(targetRoot, 'index.json'), JSON.stringify(summary, null, 2), 'utf-8');
      } catch {}

      this._log(this._cancelled
        ? `Cancelled — ${downloaded} downloaded, ${skipped} skipped`
        : `Done — ${downloaded} downloaded, ${skipped} skipped`);
      this._sendComplete({ downloaded, skipped, total, cancelled: this._cancelled });

    } catch (err) {
      this._log(`Error: ${err.message}`);
      this._sendComplete({ downloaded, skipped, total: 0, error: err.message });
    } finally {
      this._running = false;
    }
  }
}

module.exports = RedditDownloader;
