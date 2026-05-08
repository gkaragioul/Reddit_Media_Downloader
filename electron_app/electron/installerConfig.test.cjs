const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const packageJson = require(path.join('..', 'package.json'));

test('windows installer artifact uses repository product name', () => {
    assert.equal(packageJson.build.nsis.artifactName, 'Reddit-Media-Downloader-Setup.${ext}');
});
