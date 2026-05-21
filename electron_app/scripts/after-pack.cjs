const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
    if (context.electronPlatformName !== 'win32') {
        return;
    }

    const appInfo = context.packager.appInfo;
    const exePath = path.join(context.appOutDir, `${appInfo.productFilename}.exe`);
    const iconPath = path.join(context.packager.projectDir, 'assets', 'icon.ico');
    const rceditPath = path.join(
        context.packager.projectDir,
        'node_modules',
        'electron-winstaller',
        'vendor',
        'rcedit.exe',
    );

    execFileSync(rceditPath, [
        exePath,
        '--set-icon',
        iconPath,
        '--set-version-string',
        'FileDescription',
        appInfo.productName,
        '--set-version-string',
        'ProductName',
        appInfo.productName,
        '--set-version-string',
        'CompanyName',
        appInfo.companyName || appInfo.productName,
        '--set-version-string',
        'LegalCopyright',
        appInfo.copyright,
        '--set-file-version',
        appInfo.shortVersion || appInfo.buildVersion,
        '--set-product-version',
        appInfo.shortVersionWindows || appInfo.version,
    ]);
};
