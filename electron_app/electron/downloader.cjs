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

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) GKMediaDownloader/4.3.4 Chrome/120.0 Safari/537.36';
const DEFAULT_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};
const API_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
};
const RSS_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'application/atom+xml,application/rss+xml,application/xml,text/xml,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
};
const FACEBOOK_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-User': '?1',
  'Sec-Fetch-Dest': 'document',
  // Anonymous public-page requests to Facebook can return HTTP 400 without basic browser cookies.
  'Cookie': 'wd=1365x768; locale=en_US; datr=anonymous;',
};
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);
const VIDEO_EXT = new Set(['.gif', '.mp4', '.webm', '.mov', '.m4v']);
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.wav', '.flac']);
const VALID_EXT = new Set([...IMAGE_EXT, ...VIDEO_EXT, ...AUDIO_EXT]);
const MAX_PAGES = 12;
const MAX_REDGIFS_PAGES = 1000;
const MAX_FACEBOOK_COLLECTION_ITEMS = 80;
const DOWNLOAD_TIMEOUT = 45_000;
const API_TIMEOUT = 30_000;
const MAX_REDIRECTS = 5;

// ── Helpers ────────────────────────────────────────────────────

function normalizeInput(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) throw new Error('Please enter a Reddit, RedGIFs, or Erome account/post URL.');

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const parts = parsed.pathname.split('/').filter(Boolean);

    if (host.endsWith('reddit.com')) {
      if (parts.length >= 4 && parts[0].toLowerCase() === 'r' && parts[2].toLowerCase() === 'comments') {
        return { source: 'reddit', kind: 'post', value: parts[3], displayName: `reddit_post_${parts[3]}`, url: trimmed };
      }
      if (parts.length >= 2 && ['user', 'u'].includes(parts[0].toLowerCase()))
        return { source: 'reddit', kind: 'user', value: parts[1], displayName: parts[1], url: trimmed };
      if (parts.length >= 2 && parts[0].toLowerCase() === 'r')
        return { source: 'reddit', kind: 'subreddit', value: parts[1], displayName: `r_${parts[1]}`, url: trimmed };
    }

    if (host.endsWith('redgifs.com')) {
      if (parts.length >= 2 && ['users', 'user'].includes(parts[0].toLowerCase()))
        return { source: 'redgifs', kind: 'user', value: parts[1], displayName: `redgifs_${parts[1]}`, url: trimmed };
      if (parts.length >= 2 && parts[0].toLowerCase() === 'niches')
        return { source: 'redgifs', kind: 'niche', value: parts[1], displayName: `redgifs_niche_${parts[1]}`, url: trimmed };
      if (parts.length >= 2 && ['watch', 'ifr'].includes(parts[0].toLowerCase()))
        return { source: 'redgifs', kind: 'post', value: parts[1].toLowerCase(), displayName: `redgifs_${parts[1].toLowerCase()}`, url: trimmed };
    }

    if (host.endsWith('erome.com')) {
      if (parts.length >= 2 && parts[0].toLowerCase() === 'a')
        return { source: 'erome', kind: 'album', value: parts[1], displayName: `erome_${parts[1]}`, url: trimmed };
      if (parts.length >= 1)
        return { source: 'erome', kind: 'user', value: parts[0], displayName: `erome_${parts[0]}`, url: trimmed };
    }

    if (host.endsWith('facebook.com') || host.endsWith('fb.watch')) {
      if (host.endsWith('facebook.com') && parts.length >= 2 && parts[1].toLowerCase() === 'reels') {
        const value = sanitizeFilename(`${parts[0]}_reels`);
        return { source: 'facebook', kind: 'collection', value, displayName: `facebook_${value}`, url: trimmed };
      }
      const id = parsed.searchParams.get('fbid') || parsed.searchParams.get('v') || parts.filter(Boolean).pop() || 'facebook-media';
      return { source: 'facebook', kind: 'post', value: sanitizeFilename(id), displayName: `facebook_${sanitizeFilename(id)}`, url: trimmed };
    }

    throw new Error('Unsupported URL format. Use Reddit, RedGIFs, Erome, or Facebook media URLs.');
  }

  if (trimmed.toLowerCase().startsWith('u/')) return { source: 'reddit', kind: 'user', value: trimmed.slice(2), displayName: trimmed.slice(2), url: null };
  if (trimmed.toLowerCase().startsWith('r/')) return { source: 'reddit', kind: 'subreddit', value: trimmed.slice(2), displayName: `r_${trimmed.slice(2)}`, url: null };
  return { source: 'reddit', kind: 'user', value: trimmed, displayName: trimmed, url: null };
}

function sanitizeFilename(name) {
  let s = (name || '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[-._]+|[-._]+$/g, '');
  return (s.slice(0, 80) || 'file');
}

function buildListingUrl(kind, value, after) {
  if (kind === 'post') return `https://www.reddit.com/comments/${encodeURIComponent(value)}.json?raw_json=1`;
  const base = kind === 'user'
    ? `https://www.reddit.com/user/${value}/submitted/.json`
    : `https://www.reddit.com/r/${value}/new/.json`;
  return base + '?limit=100&raw_json=1' + (after ? `&after=${after}` : '');
}

function buildRedditOAuthListingUrl(kind, value, after) {
  if (kind === 'post') return `https://oauth.reddit.com/comments/${encodeURIComponent(value)}?raw_json=1`;
  const base = kind === 'user'
    ? `https://oauth.reddit.com/user/${encodeURIComponent(value)}/submitted`
    : `https://oauth.reddit.com/r/${encodeURIComponent(value)}/new`;
  return base + '?limit=100&raw_json=1' + (after ? `&after=${encodeURIComponent(after)}` : '');
}

function buildRssUrl(kind, value) {
  return kind === 'user'
    ? `https://www.reddit.com/user/${encodeURIComponent(value)}/submitted/.rss?limit=100`
    : `https://www.reddit.com/r/${encodeURIComponent(value)}/new/.rss?limit=100`;
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

  // Check if post is a RedGIFs/gfycat embed
  const postUrl = postData.url_overridden_by_dest || postData.url || '';
  const isRedgifsEmbed = typeof postUrl === 'string' &&
    (postUrl.includes('redgifs.com/watch/') || postUrl.includes('redgifs.com/ifr/'));
  const redgifsSlug = isRedgifsEmbed ? extractRedgifsSlug(postUrl) : null;

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

  // 2. Reddit video preview — skip for RedGIFs embeds (preview has no real audio)
  if (!redgifsSlug) {
    const previewVideoObj =
      effectivePost.preview?.reddit_video_preview ||
      postData.preview?.reddit_video_preview;
    if (previewVideoObj?.fallback_url) {
      add(previewVideoObj.fallback_url, 'reddit_video',
        audioCandidatesFromVideo(previewVideoObj.fallback_url),
        previewVideoObj.hls_url || null);
    }
  }

  // 3. Direct URL (skip v.redd.it and redgifs.com — handled separately)
  if (typeof postUrl === 'string') {
    if (!postUrl.includes('v.redd.it') && !postUrl.includes('redgifs.com')) {
      const ext = detectExt(postUrl, '');
      if (ext) add(postUrl, VIDEO_EXT.has(ext) ? 'video' : 'photo');
    }
  }

  // RSS fallback entries only expose direct media links parsed from the feed.
  if (Array.isArray(postData._rss_media_urls)) {
    for (const url of postData._rss_media_urls) {
      const ext = detectExt(url, '');
      if (ext || url.includes('redgifs.com')) add(url, VIDEO_EXT.has(ext) ? 'video' : 'photo');
    }
  }

  // 4. Gallery
  const gallery = postData.gallery_data || effectivePost.gallery_data;
  const meta = postData.media_metadata || effectivePost.media_metadata;
  if (gallery && meta) {
    for (const item of (gallery.items || [])) {
      const media = meta[item.media_id] || {};
      const source = media.s || {};
      const candidate = source.mp4 || source.u || source.gif;
      if (candidate) {
        const cleaned = candidate.replace(/&amp;/g, '&');
        const ext = detectExt(cleaned, '.jpg');
        add(cleaned, VIDEO_EXT.has(ext) ? 'video' : 'photo');
      }
    }
  }

  // 5. RedGIFs — use API to get actual video URL (resolved at download time)
  if (redgifsSlug && entries.length === 0) {
    add(postUrl, 'redgifs');
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

function decodeEntities(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripTags(value) {
  return decodeEntities(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTag(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match ? decodeEntities(match[1]).trim() : '';
}

function extractAtomLinks(block) {
  const links = [];
  const re = /<link\b[^>]*\bhref=(["'])(.*?)\1[^>]*>/gi;
  let match;
  while ((match = re.exec(block))) links.push(decodeEntities(match[2]));
  return links;
}

function extractUrlsFromHtml(value) {
  const html = decodeEntities(value);
  const urls = [];
  const re = /\b(?:href|src)=(["'])(https?:\/\/.*?)\1/gi;
  let match;
  while ((match = re.exec(html))) urls.push(decodeEntities(match[2]));
  return urls;
}

function extractUrlAttributes(value) {
  const text = decodeEntities(value);
  const urls = [];
  const re = /\burl=(["'])(https?:\/\/.*?)\1/gi;
  let match;
  while ((match = re.exec(text))) urls.push(decodeEntities(match[2]));
  return urls;
}

function isLikelyMediaUrl(value) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    if (host.includes('redgifs.com') && (pathname.includes('/watch/') || pathname.includes('/ifr/'))) return true;
    if (host === 'i.redd.it' || host === 'preview.redd.it' || host === 'external-preview.redd.it') return true;
    if (host.includes('erome.com')) return VALID_EXT.has(path.extname(pathname));
    return VALID_EXT.has(path.extname(pathname));
  } catch {
    return false;
  }
}

function mediaKindForUrl(url) {
  const ext = detectExt(url, '');
  if (AUDIO_EXT.has(ext)) return 'audio';
  if (VIDEO_EXT.has(ext)) return 'video';
  return 'photo';
}

function outputSubfolders() {
  return [];
}

function outputFolderForEntry(_entry) {
  return '.';
}

function rssIdToPostId(id, fallbackIndex) {
  const match = String(id || '').match(/comments\/([a-z0-9]+)/i);
  return match ? match[1] : `rss-${fallbackIndex + 1}`;
}

function parseRedditRssFeed(xml) {
  const entries = [];
  const entryRe = /<entry\b[\s\S]*?<\/entry>/gi;
  let match;
  let index = 0;

  while ((match = entryRe.exec(xml))) {
    const block = match[0];
    const title = stripTags(extractTag(block, 'title')) || 'untitled';
    const id = extractTag(block, 'id');
    const published = extractTag(block, 'published') || extractTag(block, 'updated');
    const content = extractTag(block, 'content') || extractTag(block, 'summary');
    const mediaUrls = [...extractUrlsFromHtml(content), ...extractAtomLinks(block), ...extractUrlAttributes(block)]
      .filter(isLikelyMediaUrl)
      .filter((url, idx, arr) => arr.indexOf(url) === idx);

    entries.push({
      kind: 't3',
      data: {
        id: rssIdToPostId(id, index),
        title,
        created_utc: published ? Math.floor(new Date(published).getTime() / 1000) : Math.floor(Date.now() / 1000),
        url: mediaUrls[0] || '',
        url_overridden_by_dest: mediaUrls[0] || '',
        _rss_media_urls: mediaUrls,
      },
    });
    index++;
  }

  return {
    data: {
      children: entries,
      after: null,
      _source: 'rss',
    },
  };
}

class RedditApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'RedditApiError';
    this.statusCode = statusCode;
  }
}

function redditStatusMessage(statusCode) {
  if (statusCode === 403) {
    return 'Reddit blocked the public listing request (HTTP 403). Reddit may now require authorized API access for this listing.';
  }
  if (statusCode === 404) return 'Reddit listing not found (HTTP 404).';
  if (statusCode === 429) return 'Reddit rate limited the request (HTTP 429). Try again later.';
  return `Reddit API returned HTTP ${statusCode}.`;
}

// ── RedGIFs helpers ───────────────────────────────────────────

let _redgifsToken = null;
let _redgifsTokenExpiry = 0;

async function getRedgifsToken() {
  if (_redgifsToken && Date.now() < _redgifsTokenExpiry) return _redgifsToken;
  try {
    const res = await httpGet('https://api.redgifs.com/v2/auth/temporary', API_TIMEOUT);
    if (res.statusCode !== 200) { res.resume(); return null; }
    const json = await new Promise((resolve, reject) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(); } });
      res.on('error', reject);
    });
    _redgifsToken = json.token || null;
    // Token lasts ~24h, refresh after 12h
    _redgifsTokenExpiry = Date.now() + 12 * 60 * 60 * 1000;
    return _redgifsToken;
  } catch {
    return null;
  }
}

function extractRedgifsSlug(url) {
  // https://www.redgifs.com/watch/exemplaryshowythunderbird → exemplaryshowythunderbird
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && parts[0] === 'watch') return parts[1].toLowerCase();
    if (parts.length >= 2 && parts[0] === 'ifr') return parts[1].toLowerCase();
  } catch {}
  return null;
}

async function getRedgifsVideoUrl(slug) {
  const token = await getRedgifsToken();
  if (!token) return null;
  try {
    const url = `https://api.redgifs.com/v2/gifs/${slug}`;
    const res = await new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Authorization': `Bearer ${token}`,
        },
        timeout: API_TIMEOUT,
      }, resolve);
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
    if (res.statusCode !== 200) { res.resume(); return null; }
    const json = await new Promise((resolve, reject) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(); } });
      res.on('error', reject);
    });
    return json.gif?.urls?.hd || json.gif?.urls?.sd || null;
  } catch {
    return null;
  }
}

async function httpGetJsonWithHeaders(urlStr, headers = API_HEADERS) {
  const res = await httpGet(urlStr, API_TIMEOUT, 0, headers);
  if (res.statusCode !== 200) {
    res.resume();
    throw new RedditApiError(res.statusCode, `HTTP ${res.statusCode} for ${urlStr}`);
  }
  return new Promise((resolve, reject) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => { try { resolve(JSON.parse(data)); } catch (err) { reject(err); } });
    res.on('error', reject);
  });
}

function httpPostFormJson(urlStr, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const payload = Buffer.from(new URLSearchParams(body).toString());
    const req = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      timeout: API_TIMEOUT,
      headers: {
        ...DEFAULT_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': payload.length,
        ...headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const err = new Error(json.message || json.error || `HTTP ${res.statusCode}`);
            err.statusCode = res.statusCode;
            return reject(err);
          }
          resolve(json);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.write(payload);
    req.end();
  });
}

let _redditToken = null;
let _redditTokenKey = null;
let _redditTokenExpiry = 0;

async function getRedditAuthHeaders(settings = {}) {
  const clientId = String(settings.redditClientId || process.env.REDDIT_CLIENT_ID || '').trim();
  const clientSecret = String(settings.redditClientSecret || process.env.REDDIT_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) return null;

  const key = `${clientId}:${clientSecret}`;
  if (_redditToken && _redditTokenKey === key && Date.now() < _redditTokenExpiry) {
    return { ...API_HEADERS, Authorization: `Bearer ${_redditToken}` };
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const json = await httpPostFormJson('https://www.reddit.com/api/v1/access_token',
    { grant_type: 'client_credentials' },
    { Authorization: `Basic ${basic}` });
  if (!json.access_token) throw new Error('Reddit OAuth did not return an access token.');
  _redditToken = json.access_token;
  _redditTokenKey = key;
  _redditTokenExpiry = Date.now() + Math.max(60, Number(json.expires_in || 3600) - 60) * 1000;
  return { ...API_HEADERS, Authorization: `Bearer ${_redditToken}` };
}

function mediaFromRedgifsPayload(payload, username) {
  const gifs = Array.isArray(payload?.gifs) ? payload.gifs : [];
  return gifs.map((gif, index) => {
    const url = gif.urls?.hd || gif.urls?.sd || gif.urls?.poster || '';
    return {
      dateStr: formatDate(gif.createDate || gif.published || Date.now() / 1000),
      postId: sanitizeFilename(gif.id || gif.slug || `redgifs-${index + 1}`),
      title: sanitizeFilename(`redgifs-${username || 'media'}`),
      mediaIdx: 1,
      entry: { url, kind: mediaKindForUrl(url) === 'photo' ? 'video' : mediaKindForUrl(url), audioUrls: [], hlsUrl: null },
    };
  }).filter((item) => item.entry.url);
}

function buildRedgifsListingUrl(inputInfo, page) {
  const value = encodeURIComponent(inputInfo.value);
  if (inputInfo.kind === 'niche') {
    return `https://api.redgifs.com/v2/niches/${value}/gifs?order=new&count=80&page=${page}`;
  }
  return `https://api.redgifs.com/v2/users/${value}/search?order=new&count=80&page=${page}`;
}

function mediaFromEromeAlbumHtml(html, albumId, albumUrl) {
  const titleMatch = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = stripTags(titleMatch?.[1] || albumId || 'erome-album').replace(/\s+-\s+EroMe\s*$/i, '');
  const title = sanitizeFilename(rawTitle || albumId || 'erome-album');
  const urls = [];
  const attrRe = /\b(?:src|data-src|data-video-src|href)=(["'])(https?:\/\/[^"']+)\1/gi;
  let match;
  while ((match = attrRe.exec(html || ''))) {
    const url = decodeEntities(match[2]);
    if (isLikelyMediaUrl(url)) urls.push(url);
  }
  return urls.filter((url, idx, arr) => arr.indexOf(url) === idx).map((url, idx) => ({
    dateStr: formatDate(Date.now() / 1000),
    postId: sanitizeFilename(albumId || 'erome'),
    title,
    mediaIdx: idx + 1,
    entry: { url, kind: mediaKindForUrl(url), audioUrls: [], hlsUrl: null, referer: albumUrl },
  }));
}

function extractEromeAlbumLinks(html, baseUrl) {
  const links = [];
  const re = /\bhref=(["'])(.*?)\1/gi;
  let match;
  while ((match = re.exec(html || ''))) {
    const href = decodeEntities(match[2]);
    const full = href.startsWith('http') ? href : new URL(href, baseUrl).href;
    try {
      const parsed = new URL(full);
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parsed.hostname.endsWith('erome.com') && parts[0] === 'a' && parts[1]) links.push(full);
    } catch {}
  }
  return links.filter((url, idx, arr) => arr.indexOf(url) === idx);
}

function extractFacebookMediaUrls(html, options = {}) {
  const raw = String(html || '');
  const text = decodeEntities(raw.replace(/\\\//g, '/').replace(/\\u0025/g, '%').replace(/\\u0026/g, '&'));
  const urls = [];

  function addJsonEscapedUrlForKey(key) {
    const re = new RegExp(`"${key}"\\s*:\\s*"(https?:\\\\/\\\\/.*?)"`, 'gi');
    let m;
    while ((m = re.exec(raw))) urls.push(decodeEntities(m[1].replace(/\\\//g, '/').replace(/\\u0025/g, '%').replace(/\\u0026/g, '&')));
  }

  // Prefer Facebook's explicit playable video URL fields. The page often contains many
  // unrelated mp4 variants; these keys usually identify the actual reel/video.
  addJsonEscapedUrlForKey('browser_native_hd_url');
  if (urls.length === 0) addJsonEscapedUrlForKey('browser_native_sd_url');
  if (urls.length === 0) addJsonEscapedUrlForKey('playable_url_quality_hd');
  if (urls.length === 0) addJsonEscapedUrlForKey('playable_url');
  const preferredVideoCount = urls.length;
  const preferredVideoUrls = urls.slice();

  const metaRe = /<meta\b[^>]*(?:property|name)=(["'])(?:og:image|og:video|twitter:image|twitter:player:stream)\1[^>]*\bcontent=(["'])(https?:\/\/.*?)\2/gi;
  let match;
  while ((match = metaRe.exec(text))) urls.push(decodeEntities(match[3]));

  const contentFirstRe = /<meta\b[^>]*\bcontent=(["'])(https?:\/\/.*?)\1[^>]*(?:property|name)=(["'])(?:og:image|og:video|twitter:image|twitter:player:stream)\3/gi;
  while ((match = contentFirstRe.exec(text))) urls.push(decodeEntities(match[2]));

  const fbCdnRe = /https?:\/\/(?:[^\s"'<>\\]+\.)?(?:fbcdn|facebook)\.net\/[^\s"'<>\\]+/gi;
  while ((match = fbCdnRe.exec(text))) {
    const url = decodeEntities(match[0]);
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host.startsWith('static.') || url.includes('/rsrc.php/')) continue;
      if (url.includes('/t1.30497-') || url.includes('/t39.30808-1/') || url.includes('ctp=s40x40') || url.includes('stp=cp6_')) continue;
      if (/ctp=s(?:24|32|40|50|64|80|100)x(?:24|32|40|50|64|80|100)/.test(url)) continue;
    } catch {}
    urls.push(url);
  }

  const cleaned = (preferredVideoCount > 0 ? preferredVideoUrls : urls)
    .map((url) => url.replace(/\?.*$/, (qs) => qs.replace(/&amp;/g, '&')))
    .filter(isLikelyMediaUrl)
    .filter((url, idx, arr) => arr.indexOf(url) === idx);

  if (preferredVideoCount > 0 && !options.collection) {
    const videos = cleaned.filter((url) => mediaKindForUrl(url) === 'video');
    return videos.length ? [videos[0]] : [];
  }
  if (preferredVideoCount > 0 && options.collection) {
    return cleaned.filter((url) => mediaKindForUrl(url) === 'video');
  }
  return cleaned;
}

function extractFacebookVideoIds(html) {
  const raw = String(html || '');
  const text = decodeEntities(raw.replace(/\\\//g, '/').replace(/\\u0025/g, '%').replace(/\\u0026/g, '&'));
  const ids = [];
  const add = (id) => {
    if (/^\d{8,}$/.test(id) && !ids.includes(id)) ids.push(id);
  };
  const patterns = [
    /\\?"video_id\\?"\s*:\s*\\?"(\d{8,})\\?"/g,
    /\\?"videoID\\?"\s*:\s*\\?"(\d{8,})\\?"/g,
    /\\?"videoId\\?"\s*:\s*\\?"(\d{8,})\\?"/g,
    /\/watch\/\?v=(\d{8,})/g,
    /\/reel\/(\d{8,})/g,
    /\/videos\/(\d{8,})/g,
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(text))) add(match[1]);
  }
  return ids;
}

function mediaFromFacebookHtml(html, postId, pageUrl, options = {}) {
  return extractFacebookMediaUrls(html, options).map((url, idx) => ({
    dateStr: formatDate(Date.now() / 1000),
    postId: sanitizeFilename(postId || 'facebook'),
    title: 'facebook-media',
    mediaIdx: idx + 1,
    entry: { url, kind: mediaKindForUrl(url), audioUrls: [], hlsUrl: null, referer: pageUrl },
  }));
}

function electronBrowserWindow() {
  try {
    // Available only inside the packaged Electron main process, not during node:test.
    return require('electron').BrowserWindow;
  } catch {
    return null;
  }
}

async function renderFacebookCollectionHtml(pageUrl, log = () => {}) {
  const BrowserWindow = electronBrowserWindow();
  if (!BrowserWindow) return null;
  const win = new BrowserWindow({
    width: 1280,
    height: 1800,
    show: false,
    webPreferences: {
      images: false,
      autoplayPolicy: 'user-gesture-required',
      backgroundThrottling: false,
    },
  });
  try {
    log('Rendering Facebook reels page and auto-scrolling for more entries...');
    await win.loadURL(pageUrl, { extraHeaders: 'Accept-Language: en-US,en;q=0.9\n' });
    await win.webContents.executeJavaScript(`new Promise((resolve) => setTimeout(resolve, 2500))`);
    let lastHeight = 0;
    let stable = 0;
    for (let i = 0; i < 18; i++) {
      const result = await win.webContents.executeJavaScript(`(async () => {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((resolve) => setTimeout(resolve, 1800));
        return { height: document.body.scrollHeight, text: document.body.innerText.slice(0, 200) };
      })()`);
      const height = Number(result?.height || 0);
      log(`Facebook scroll ${i + 1}/18`);
      if (height && height === lastHeight) stable += 1;
      else stable = 0;
      lastHeight = height;
      if (stable >= 3) break;
    }
    return await win.webContents.executeJavaScript('document.documentElement.outerHTML');
  } catch (err) {
    log(`Facebook rendered scroll unavailable: ${err.message}`);
    return null;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

async function fetchFacebookMedia(inputInfo, log = () => {}) {
  if (!inputInfo.url) throw new Error('Facebook downloads require a Facebook media URL.');
  let pageUrl = inputInfo.url;
  try {
    const parsed = new URL(pageUrl);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts[0]?.toLowerCase() === 'reel' && parts[1]) {
      pageUrl = `https://www.facebook.com/watch/?v=${encodeURIComponent(parts[1])}`;
      log('Facebook reel URL detected; using watch URL fallback');
    }
  } catch {}
  log('Fetching Facebook media page...');
  const html = await httpGetText(pageUrl, {
    ...FACEBOOK_HEADERS,
    Referer: 'https://www.facebook.com/',
  });
  let media = mediaFromFacebookHtml(html, inputInfo.value, pageUrl, { collection: inputInfo.kind === 'collection' });
  let ids = extractFacebookVideoIds(html);

  if (inputInfo.kind === 'collection' && ids.length < MAX_FACEBOOK_COLLECTION_ITEMS) {
    const renderedHtml = await renderFacebookCollectionHtml(pageUrl, log);
    if (renderedHtml) {
      const renderedMedia = mediaFromFacebookHtml(renderedHtml, inputInfo.value, pageUrl, { collection: true });
      const renderedIds = extractFacebookVideoIds(renderedHtml);
      const urls = new Set(media.map((item) => item.entry.url));
      for (const item of renderedMedia) {
        if (!urls.has(item.entry.url)) {
          urls.add(item.entry.url);
          media.push(item);
        }
      }
      ids = [...ids, ...renderedIds].filter((id, idx, arr) => arr.indexOf(id) === idx);
    }
  }

  if (inputInfo.kind !== 'collection') return media;

  ids = ids.slice(0, MAX_FACEBOOK_COLLECTION_ITEMS);
  if (ids.length === 0) return media;

  log(`Found ${ids.length} Facebook reel IDs; fetching playable reel pages...`);
  const all = [];
  const seenUrls = new Set();
  const addItems = (items) => {
    for (const item of items) {
      const url = item?.entry?.url;
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);
      all.push(item);
    }
  };
  addItems(media);

  for (const id of ids) {
    try {
      const reelUrl = `https://www.facebook.com/watch/?v=${encodeURIComponent(id)}`;
      const reelHtml = await httpGetText(reelUrl, {
        ...FACEBOOK_HEADERS,
        Referer: pageUrl,
      });
      addItems(mediaFromFacebookHtml(reelHtml, id, reelUrl, { collection: false }));
      if (ids.length > 10) log(`Checked Facebook reel ${Math.min(ids.indexOf(id) + 1, ids.length)}/${ids.length}`);
      await new Promise((resolve) => setTimeout(resolve, 150));
    } catch (err) {
      log(`Skipped Facebook reel ${id}: ${err.message}`);
    }
  }
  return all;
}

async function fetchRedgifsMedia(inputInfo, log = () => {}) {
  const token = await getRedgifsToken();
  if (!token) throw new Error('Could not get RedGIFs temporary API token.');
  const headers = { ...API_HEADERS, Authorization: `Bearer ${token}` };

  if (inputInfo.kind === 'post') {
    const url = await getRedgifsVideoUrl(inputInfo.value);
    if (!url) return [];
    return mediaFromRedgifsPayload({ gifs: [{ id: inputInfo.value, urls: { hd: url }, createDate: Date.now() / 1000 }] }, inputInfo.value);
  }

  const all = [];
  for (let page = 1; page <= MAX_REDGIFS_PAGES; page++) {
    log(`Fetching RedGIFs ${inputInfo.kind} page ${page}...`);
    const url = buildRedgifsListingUrl(inputInfo, page);
    const payload = await httpGetJsonWithHeaders(url, headers);
    all.push(...mediaFromRedgifsPayload(payload, inputInfo.value));
    const totalPages = Number(payload.pages || payload.totalPages || page);
    if (page >= totalPages || !payload.gifs || payload.gifs.length === 0) break;
  }
  return all;
}

async function fetchEromeMedia(inputInfo, log = () => {}) {
  const startUrl = inputInfo.url || `https://www.erome.com/${encodeURIComponent(inputInfo.value)}`;
  if (inputInfo.kind === 'album') {
    const html = await httpGetText(startUrl, { ...DEFAULT_HEADERS, Referer: 'https://www.erome.com/' });
    return mediaFromEromeAlbumHtml(html, inputInfo.value, startUrl);
  }

  log('Fetching Erome account page...');
  const html = await httpGetText(startUrl, { ...DEFAULT_HEADERS, Referer: 'https://www.erome.com/' });
  const albumLinks = extractEromeAlbumLinks(html, startUrl);
  const all = [];
  for (const albumUrl of albumLinks) {
    if (all.length > 0) await new Promise((resolve) => setTimeout(resolve, 250));
    const albumId = new URL(albumUrl).pathname.split('/').filter(Boolean)[1] || inputInfo.value;
    log(`Fetching Erome album ${albumId}...`);
    try {
      const albumHtml = await httpGetText(albumUrl, { ...DEFAULT_HEADERS, Referer: startUrl });
      all.push(...mediaFromEromeAlbumHtml(albumHtml, albumId, albumUrl));
    } catch (err) {
      log(`Skipped Erome album ${albumId}: ${err.message}`);
    }
  }
  return all;
}

// ── HTTP utilities (built-in only) ─────────────────────────────

function httpGet(urlStr, timeout, hops = 0, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    if (hops > MAX_REDIRECTS) return reject(new Error('Too many redirects'));
    const parsed = new URL(urlStr);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(urlStr, {
      headers: { ...DEFAULT_HEADERS, ...extraHeaders },
      timeout,
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308) {
        const location = res.headers.location;
        res.resume();
        if (!location) return reject(new Error('Redirect with no location'));
        const next = location.startsWith('http') ? location : new URL(location, urlStr).href;
        return httpGet(next, timeout, hops + 1, extraHeaders).then(resolve, reject);
      }
      resolve(res);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

async function httpGetJson(urlStr) {
  const res = await httpGet(urlStr, API_TIMEOUT, 0, API_HEADERS);
  if (res.statusCode !== 200) {
    res.resume();
    throw new RedditApiError(res.statusCode, redditStatusMessage(res.statusCode));
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

async function httpGetText(urlStr, headers = {}) {
  const res = await httpGet(urlStr, API_TIMEOUT, 0, headers);
  if (res.statusCode !== 200) {
    res.resume();
    throw new RedditApiError(res.statusCode, `HTTP ${res.statusCode} for ${new URL(urlStr).hostname}`);
  }
  return new Promise((resolve, reject) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => resolve(data));
    res.on('error', reject);
  });
}

async function fetchListing(kind, value, after, redditAuthHeaders = null) {
  if (redditAuthHeaders) {
    return await httpGetJsonWithHeaders(buildRedditOAuthListingUrl(kind, value, after), redditAuthHeaders);
  }

  const url = buildListingUrl(kind, value, after);
  try {
    return await httpGetJson(url);
  } catch (err) {
    if (after || !(err instanceof RedditApiError) || ![403, 429].includes(err.statusCode)) throw err;

    const rssUrl = buildRssUrl(kind, value);
    try {
      const xml = await httpGetText(rssUrl, RSS_HEADERS);
      const payload = parseRedditRssFeed(xml);
      if (payload.data.children.length > 0) return payload;
    } catch {
      // Keep the original JSON/API error because it better explains the breakage.
    }

    throw err;
  }
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
    const finder = process.platform === 'win32' ? 'where' : 'which';
    const result = execFileSync(finder, ['ffmpeg'], { encoding: 'utf-8', timeout: 5000 });
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

  async _streamDownload(url, destPath, extraHeaders = {}) {
    if (this._cancelled) return false;
    await this._waitIfPaused();
    if (this._cancelled) return false;

    return new Promise(async (resolve) => {
      let res;
      try {
        res = await httpGet(url, DOWNLOAD_TIMEOUT, 0, extraHeaders);
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
      const stack = [dir];
      while (stack.length) {
        const current = stack.pop();
        for (const f of fs.readdirSync(current, { withFileTypes: true })) {
          const full = path.join(current, f.name);
          if (f.isDirectory()) stack.push(full);
          else this._existingNames.add(f.name);
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
      const inputInfo = normalizeInput(input);
      const { source, kind, value, displayName } = inputInfo;
      this._log(`Fetching media for ${source}/${kind}/${value}`);

      const targetRoot = path.join(os.homedir(), 'Downloads', sanitizeFilename(displayName || value));
      fs.mkdirSync(targetRoot, { recursive: true });
      this._outputFolder = targetRoot;
      this._preScan(targetRoot);

      const ffmpeg = findFfmpeg();
      this._log(ffmpeg ? `FFmpeg found: ${path.basename(ffmpeg)}` : 'FFmpeg not found — Reddit videos may lack muxed audio');
      if (mediaFilter !== 'both') this._log(`Media filter: ${mediaFilter} only`);

      // Phase 2: Fetch posts/media with pagination
      const allMedia = [];
      let redditAuthHeaders = null;
      if (source === 'reddit') {
        try {
          redditAuthHeaders = await getRedditAuthHeaders(settings);
          if (redditAuthHeaders) this._log('Using Reddit OAuth API credentials');
        } catch (err) {
          this._log(`Reddit OAuth failed: ${err.message}; falling back to public Reddit listing`);
        }
      }

      if (source === 'redgifs') {
        allMedia.push(...await fetchRedgifsMedia(inputInfo, (msg) => this._log(msg)));
      } else if (source === 'erome') {
        allMedia.push(...await fetchEromeMedia(inputInfo, (msg) => this._log(msg)));
      } else if (source === 'facebook') {
        allMedia.push(...await fetchFacebookMedia(inputInfo, (msg) => this._log(msg)));
      } else {
        let after = null;
        for (let page = 0; page < MAX_PAGES; page++) {
          if (this._cancelled) break;
          await this._waitIfPaused();
          if (this._cancelled) break;

          this._log(kind === 'post' ? 'Fetching Reddit post...' : `Fetching Reddit page ${page + 1}...`);

          let payload;
          try {
            payload = await fetchListing(kind, value, after, redditAuthHeaders);
            if (payload.data?._source === 'rss') {
              this._log('Reddit JSON was blocked; using limited RSS fallback for this listing');
            }
          } catch (err) {
            this._log(`API error: ${err.message}`);
            if (allMedia.length === 0) throw err;
            this._log('Stopping pagination after API error; downloading media found so far');
            break;
          }

          const listing = Array.isArray(payload) ? payload[0] : payload;
          const children = ((listing.data || {}).children) || [];
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

          if (kind === 'post') break;
          after = (listing.data || {}).after;
          if (!after) {
            this._log('Reached end of posts');
            break;
          }

          if (page < MAX_PAGES - 1) await this._sleep(requestDelay);
        }
      }

      if (this._cancelled) {
        this._log('Cancelled during fetch');
        this._sendComplete({ downloaded, skipped, total: allMedia.length, cancelled: true });
        return;
      }

      const total = allMedia.length;
      if (total === 0) {
        throw new Error('No downloadable media found. If the log shows HTTP 403, Reddit blocked public listing access for this request.');
      }

      this._log(`Found ${total} media entries`);
      this._sendProgress(0, 0, total, 0);

      // Phase 3: Download all media
      for (let i = 0; i < total; i++) {
        if (this._cancelled) break;
        await this._waitIfPaused();
        if (this._cancelled) break;

        const { dateStr, postId, title, mediaIdx, entry } = allMedia[i];
        // Force .mp4 for reddit_video and redgifs entries (their URLs lack file extensions)
        const isVideo = entry.kind === 'reddit_video' || entry.kind === 'video' || entry.kind === 'redgifs';
        const ext = (entry.kind === 'reddit_video' || entry.kind === 'redgifs') ? '.mp4' : detectExt(entry.url);
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
        const outDir = path.join(targetRoot, outputFolderForEntry(entry));
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

        if (entry.kind === 'redgifs') {
          // RedGIFs: resolve actual video URL via API, download with auth
          const slug = extractRedgifsSlug(entry.url);
          if (slug) {
            const videoUrl = await getRedgifsVideoUrl(slug);
            if (videoUrl && !this._cancelled) {
              const token = await getRedgifsToken();
              const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
              ok = await this._streamDownload(videoUrl, outPath, headers);
            }
          }
        } else if (entry.kind === 'reddit_video' && entry.hlsUrl && findFfmpeg()) {
          // Reddit videos: try HLS download first (gets video+audio in one shot)
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
        if (!ok && !this._cancelled && entry.kind !== 'redgifs') {
          const downloadHeaders = entry.referer ? { Referer: entry.referer } : {};
          ok = await this._streamDownload(entry.url, outPath, downloadHeaders);
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
module.exports._internals = {
  getMediaEntries,
  parseRedditRssFeed,
  redditStatusMessage,
  normalizeInput,
  mediaFromRedgifsPayload,
  mediaFromEromeAlbumHtml,
  extractEromeAlbumLinks,
  buildRedditOAuthListingUrl,
  outputSubfolders,
  outputFolderForEntry,
  buildRedgifsListingUrl,
  mediaFromFacebookHtml,
  extractFacebookVideoIds,
};
