const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('legacy portable build uses only checkout-owned inputs', { skip: process.platform !== 'win32' }, () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gkmd-portable-'));
  try {
    const root = path.resolve(__dirname, '..', '..');
    // A .cmd test double needs CALL to resume the parent batch file; real py.exe does not.
    const build = fs.readFileSync(path.join(root, 'build_portable_windows.bat'), 'utf8');
    fs.writeFileSync(path.join(scratch, 'build_portable_windows.bat'), build.replace(/^py /gm, 'call py '));
    fs.writeFileSync(path.join(scratch, 'windows_reddit_downloader.py'), '# test fixture\n');
    fs.mkdirSync(path.join(scratch, 'dist'));
    fs.writeFileSync(path.join(scratch, 'dist', 'RedditDownloaderWin.exe'), 'test executable');
    fs.writeFileSync(path.join(scratch, 'py.cmd'), '@echo off\r\n>>"%~dp0calls.txt" echo %*\r\nexit /b 0\r\n');

    const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'build_portable_windows.bat'], {
      cwd: scratch,
      env: { ...process.env, PATH: `${scratch};${process.env.PATH}`, USERPROFILE: scratch },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const calls = fs.readFileSync(path.join(scratch, 'calls.txt'), 'utf8');
    assert.match(calls, /-m PyInstaller/);
    assert.doesNotMatch(calls, /--add-data|[A-Z]:[\\/]Users[\\/]/i);
    assert.equal(fs.readFileSync(path.join(scratch, 'Desktop', 'RedditDownloaderWin_Portable.exe'), 'utf8'), 'test executable');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
