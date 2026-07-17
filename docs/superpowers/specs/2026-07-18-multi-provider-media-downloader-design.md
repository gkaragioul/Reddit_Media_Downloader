# Multi-Provider Media Downloader Design

## Objective

Enhance the installed Reddit Media Downloader so a user can paste a Reddit, Redgifs, Erome, or direct supported-media URL and download every public image, animated GIF, or video on that page, with audio merged where providers separate audio and video.

The existing Reddit `u/username` and `r/subreddit` workflows remain supported.

## Input Routing

The downloader classifies trimmed input into one of these modes:

- Reddit user listing.
- Reddit subreddit listing.
- Reddit post, gallery, comment permalink, or direct Reddit media URL.
- Redgifs watch, iframe, or direct media URL.
- Erome public album, media page, or direct media URL.
- Supported direct HTTPS media URL.

Unsupported schemes, domains, private pages, deleted pages, and malformed URLs produce a clear error before creating output files.

## Provider Behaviour

### Reddit

- Listings continue to use the existing JSON API with RSS fallback.
- A post/permalink request fetches only that post and downloads every media entry attached to it.
- Galleries preserve their declared item order.
- Crosspost media uses the effective source post while retaining a useful filename.
- Reddit-hosted DASH/HLS video uses the existing FFmpeg mux path to preserve audio.
- Direct `i.redd.it` and `v.redd.it` links download the requested media.

### Redgifs

- Watch and iframe links reuse the temporary-token API integration.
- The highest-quality available MP4 is selected.
- Direct approved Redgifs media URLs download without page parsing.
- Provider metadata determines the file extension and stable item identifier.

### Erome

- Public album pages are fetched without authentication.
- Original image sources and video sources are extracted in page order.
- Duplicate preview, poster, and thumbnail URLs are removed.
- Every unique album item is downloaded automatically.
- Videos retain embedded audio; FFmpeg is available for compatible stream handling if required.

## Media and File Handling

- Supported media: JPEG, PNG, WebP, GIF, MP4, and WebM, plus provider streams resolved to those formats.
- Media-type filters continue to work: videos, photos, or both.
- Animated GIFs count as video-compatible while remaining `.gif` files.
- SHA-256 duplicate detection, collision-safe names, pause/resume/cancel, progress, and logs remain intact.
- Incomplete files are removed; existing completed files are never overwritten.
- Outputs continue to use the current Downloads-folder hierarchy.

## User Interface

- The primary input placeholder becomes: `Paste a Reddit, Redgifs or Erome link - or u/username / r/subreddit`.
- Start remains the single primary command.
- The activity log identifies the detected provider and number of media entries.
- Completion statistics retain downloaded/skipped counts.
- Existing settings, About, logs, and folder controls remain unchanged.

## Testing

Automated tests cover:

- Input classification and rejection.
- Reddit single-post and gallery extraction.
- Redgifs watch/direct extraction.
- Erome mixed image/video album extraction and deduplication.
- Media filtering, filenames, and audio-mux selection.
- Existing Reddit listing and RSS fallback regression behaviour.
- Installer version, shortcut, and resource configuration.

Manual acceptance testing uses public pages from all three providers and verifies downloaded image/video formats and audio streams.

## Windows Replacement

- Increment the application version.
- Build a new NSIS installer with the existing product name, app ID, and icon.
- Close only the running Reddit Media Downloader process when replacement requires it.
- Upgrade the installed application in place rather than creating a second product.
- Refresh the existing Desktop shortcut used inside the File frame.
- Preserve the taskbar pin when its target remains valid; otherwise update its shortcut target and icon to the replacement executable.
- Verify both shortcuts launch the new version and the footer reports the updated version.
- Do not alter unrelated applications, File frame contents, taskbar pins, or desktop layout.

## Non-Goals

- Downloading private, authenticated, paid, DRM-protected, or deleted media.
- General-purpose support for arbitrary websites.
- Browser-history, cookie, or credential access.
- Background monitoring or automatic downloads.



