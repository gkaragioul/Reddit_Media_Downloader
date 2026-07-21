const test = require('node:test');
const assert = require('node:assert/strict');

const { _internals } = require('./downloader.cjs');

test('RSS fallback parses direct media URLs into Reddit-like posts', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>https://www.reddit.com/r/pics/comments/abc123/sample/</id>
        <title>Sample &amp; title</title>
        <published>2026-06-22T00:00:00+00:00</published>
        <content type="html">
          &lt;a href=&quot;https://i.redd.it/example.jpg&quot;&gt;image&lt;/a&gt;
        </content>
        <media:thumbnail url="https://preview.redd.it/example-preview.jpg" />
      </entry>
    </feed>`;

    const payload = _internals.parseRedditRssFeed(xml);
    assert.equal(payload.data._source, 'rss');
    assert.equal(payload.data.children.length, 1);
    assert.equal(payload.data.children[0].data.id, 'abc123');
    assert.equal(payload.data.children[0].data.title, 'Sample & title');

    const entries = _internals.getMediaEntries(payload.data.children[0].data);
    assert.deepEqual(entries.map((entry) => [entry.url, entry.kind]), [
        ['https://i.redd.it/example.jpg', 'photo'],
        ['https://preview.redd.it/example-preview.jpg', 'photo'],
    ]);
});

test('403 message explains Reddit blocked the public listing', () => {
    assert.match(_internals.redditStatusMessage(403), /blocked the public listing request/);
});

test('RSS animated GIF entries are video-compatible for the videos-only filter', () => {
    const entries = _internals.getMediaEntries({
        _rss_media_urls: ['https://i.redd.it/animated-example.gif'],
    });

    assert.deepEqual(entries.map((entry) => [entry.url, entry.kind]), [
        ['https://i.redd.it/animated-example.gif', 'video'],
    ]);
});

test('normalizes Reddit post, RedGIFs user, and Erome account URLs', () => {
    assert.deepEqual(_internals.normalizeInput('https://www.reddit.com/r/pics/comments/abc123/title/'), {
        source: 'reddit', kind: 'post', value: 'abc123', displayName: 'reddit_post_abc123', url: 'https://www.reddit.com/r/pics/comments/abc123/title/'
    });
    assert.deepEqual(_internals.normalizeInput('https://www.redgifs.com/users/ExampleUser'), {
        source: 'redgifs', kind: 'user', value: 'ExampleUser', displayName: 'redgifs_ExampleUser', url: 'https://www.redgifs.com/users/ExampleUser'
    });
    assert.deepEqual(_internals.normalizeInput('https://www.redgifs.com/niches/double-blowjob'), {
        source: 'redgifs', kind: 'niche', value: 'double-blowjob', displayName: 'redgifs_niche_double-blowjob', url: 'https://www.redgifs.com/niches/double-blowjob'
    });
    assert.deepEqual(_internals.normalizeInput('https://www.erome.com/a/exampleuser'), {
        source: 'erome', kind: 'album', value: 'exampleuser', displayName: 'erome_exampleuser', url: 'https://www.erome.com/a/exampleuser'
    });
    assert.deepEqual(_internals.normalizeInput('https://www.erome.com/exampleuser'), {
        source: 'erome', kind: 'user', value: 'exampleuser', displayName: 'erome_exampleuser', url: 'https://www.erome.com/exampleuser'
    });
    assert.deepEqual(_internals.normalizeInput('https://www.facebook.com/photo?fbid=1083587167330441&set=a.214939680861865'), {
        source: 'facebook', kind: 'post', value: '1083587167330441', displayName: 'facebook_1083587167330441', url: 'https://www.facebook.com/photo?fbid=1083587167330441&set=a.214939680861865'
    });
    assert.deepEqual(_internals.normalizeInput('https://www.facebook.com/glowfashion.athens/reels/'), {
        source: 'facebook', kind: 'collection', value: 'glowfashion.athens_reels', displayName: 'facebook_glowfashion.athens_reels', url: 'https://www.facebook.com/glowfashion.athens/reels/'
    });
});

test('RedGIFs API user payload is converted to downloadable videos', () => {
    const payload = {
        gifs: [
            { id: 'firstslug', createDate: 1760000000, urls: { hd: 'https://media.redgifs.com/first.mp4' } },
            { id: 'secondslug', createDate: 1760000100, urls: { sd: 'https://media.redgifs.com/second.mp4' } },
        ],
        page: 1,
        pages: 1,
    };

    const media = _internals.mediaFromRedgifsPayload(payload, 'ExampleUser');
    assert.deepEqual(media.map((item) => [item.postId, item.title, item.entry.url, item.entry.kind]), [
        ['firstslug', 'redgifs-ExampleUser', 'https://media.redgifs.com/first.mp4', 'video'],
        ['secondslug', 'redgifs-ExampleUser', 'https://media.redgifs.com/second.mp4', 'video'],
    ]);
});

test('Erome album HTML parser extracts images and videos with stable filenames', () => {
    const html = `
      <html><head><title>My Album - EroMe</title></head><body>
        <img data-src="https://s1.erome.com/abc/image-one.jpg">
        <source src="https://v1.erome.com/abc/video-one.mp4" type="video/mp4">
        <a href="/a/otheralbum">Other album</a>
      </body></html>`;

    const media = _internals.mediaFromEromeAlbumHtml(html, 'album123', 'https://www.erome.com/a/album123');
    assert.deepEqual(media.map((item) => [item.postId, item.title, item.entry.url, item.entry.kind]), [
        ['album123', 'My-Album', 'https://s1.erome.com/abc/image-one.jpg', 'photo'],
        ['album123', 'My-Album', 'https://v1.erome.com/abc/video-one.mp4', 'video'],
    ]);
});

test('Reddit OAuth listing URLs use oauth.reddit.com without public .json listing endpoints', () => {
    assert.equal(
        _internals.buildRedditOAuthListingUrl('user', 'ExampleUser', null),
        'https://oauth.reddit.com/user/ExampleUser/submitted?limit=100&raw_json=1'
    );
    assert.equal(
        _internals.buildRedditOAuthListingUrl('post', 'abc123', null),
        'https://oauth.reddit.com/comments/abc123?raw_json=1'
    );
});

test('download layout is flat: all media goes into one folder without type subfolders', () => {
    assert.deepEqual(_internals.outputSubfolders(), []);
    assert.equal(_internals.outputFolderForEntry({ kind: 'photo', url: 'https://x.test/a.jpg' }), '.');
    assert.equal(_internals.outputFolderForEntry({ kind: 'video', url: 'https://x.test/a.mp4' }), '.');
    assert.equal(_internals.outputFolderForEntry({ kind: 'audio', url: 'https://x.test/a.mp3' }), '.');
});

test('RedGIFs niche API URL targets the niche endpoint with newest order', () => {
    assert.equal(
        _internals.buildRedgifsListingUrl({ kind: 'niche', value: 'double-blowjob' }, 3),
        'https://api.redgifs.com/v2/niches/double-blowjob/gifs?order=new&count=80&page=3'
    );
});

test('Facebook HTML parser extracts public image and video media', () => {
    const html = `
      <html><head>
        <meta property="og:image" content="https://scontent.xx.fbcdn.net/v/t39.30808-6/photo.jpg?_nc_cat=1&amp;ccb=1-7">
        <meta property="og:video" content="https://video.xx.fbcdn.net/v/t42.1790-2/video.mp4?_nc_cat=1&amp;ccb=1-7">
      </head></html>`;
    const media = _internals.mediaFromFacebookHtml(html, '1083587167330441', 'https://www.facebook.com/photo?fbid=1083587167330441');
    assert.deepEqual(media.map((item) => [item.postId, item.title, item.entry.url, item.entry.kind]), [
        ['1083587167330441', 'facebook-media', 'https://scontent.xx.fbcdn.net/v/t39.30808-6/photo.jpg?_nc_cat=1&ccb=1-7', 'photo'],
        ['1083587167330441', 'facebook-media', 'https://video.xx.fbcdn.net/v/t42.1790-2/video.mp4?_nc_cat=1&ccb=1-7', 'video'],
    ]);
});

test('Facebook reel collection parser keeps multiple playable reel videos', () => {
    const html = `
      <script>{"browser_native_hd_url":"https:\\/\\/video.xx.fbcdn.net\\/first.mp4?token=1","browser_native_sd_url":"https:\\/\\/video.xx.fbcdn.net\\/first-sd.mp4?token=1"}</script>
      <script>{"browser_native_hd_url":"https:\\/\\/video.xx.fbcdn.net\\/second.mp4?token=2"}</script>`;
    const single = _internals.mediaFromFacebookHtml(html, '27300808292885948', 'https://www.facebook.com/reel/27300808292885948');
    assert.deepEqual(single.map((item) => item.entry.url), ['https://video.xx.fbcdn.net/first.mp4?token=1']);

    const collection = _internals.mediaFromFacebookHtml(html, 'glowfashion.athens_reels', 'https://www.facebook.com/glowfashion.athens/reels/', { collection: true });
    assert.deepEqual(collection.map((item) => item.entry.url), [
        'https://video.xx.fbcdn.net/first.mp4?token=1',
        'https://video.xx.fbcdn.net/second.mp4?token=2',
    ]);
});
