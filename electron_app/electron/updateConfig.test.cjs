const test = require('node:test');
const assert = require('node:assert/strict');

const { REPO_OWNER, REPO_NAME, GITHUB_API_URL } = require('./updateConfig.cjs');

test('update checks use this repository releases endpoint', () => {
    assert.equal(REPO_OWNER, 'karagioules');
    assert.equal(REPO_NAME, 'Reddit_Media_Downloader');
    assert.equal(
        GITHUB_API_URL,
        'https://api.github.com/repos/karagioules/Reddit_Media_Downloader/releases/latest',
    );
});
