const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const packageJson = require(path.join('..', 'package.json'));

test('package version matches the release train', () => {
    assert.equal(packageJson.version, '4.3.3');
});

test('windows installer artifact uses repository product name', () => {
    assert.equal(packageJson.license, 'GPL-3.0-or-later');
    assert.equal(packageJson.build.productName, 'GK Media Downloader');
    assert.equal(packageJson.build.nsis.shortcutName, 'GK Media Downloader');
    assert.equal(packageJson.build.nsis.artifactName, 'GK-Media-Downloader-Setup.${ext}');
});

test('linux build is portable and installer-free', () => {
    assert.deepEqual(packageJson.build.linux.target, ['dir', 'tar.gz', 'AppImage']);
    assert.equal(packageJson.build.linux.artifactName, 'GK-Media-Downloader-Linux-${arch}.${ext}');
});

test('app has no updater configuration or dependencies', () => {
    assert.equal(packageJson.build.publish, undefined);
    assert.equal(packageJson.dependencies?.['electron-updater'], undefined);
    assert.equal(packageJson.devDependencies?.['electron-updater'], undefined);
});

test('windows package includes app icon resources', () => {
    assert.equal(packageJson.build.toolsets.winCodeSign, '1.1.0');
    assert.equal(packageJson.build.afterPack, 'scripts/after-pack.cjs');
    assert.equal(packageJson.build.win.icon, 'assets/icon.ico');
    assert.equal(packageJson.build.win.signAndEditExecutable, false);
    assert.ok(packageJson.build.extraResources.some((file) => file.from === 'assets/icon.ico' && file.to === 'icon.ico'));
});
