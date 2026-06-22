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
