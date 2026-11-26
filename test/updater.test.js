// Тесты автообновления: версия X.X.X + буква, подбор установщика, контрольные суммы.
const test = require('node:test');
const assert = require('node:assert');
const {
  parseVersion, compareVersions, isNewer,
  pickAsset, updateInfo, verifyChecksum, planInstall,
} = require('../src/updater');

const ASSETS = [
  { name: 'EMBER.Launcher.Setup.2.2.4-B.exe', size: 100, browser_download_url: 'https://x/win.exe' },
  { name: 'EMBER-Launcher-2.2.4-B-linux-amd64.deb', size: 100, browser_download_url: 'https://x/linux.deb' },
  { name: 'EMBER-Launcher-2.2.4-B-linux-x64.tar.gz', size: 100, browser_download_url: 'https://x/linux.tar.gz' },
  { name: 'EMBER-Launcher-2.2.4-B-linux-x86_64.AppImage', size: 100, browser_download_url: 'https://x/linux.AppImage' },
  { name: 'EMBER-Launcher-2.2.4-B-mac-arm64.dmg', size: 100, browser_download_url: 'https://x/mac-arm64.dmg' },
  { name: 'EMBER-Launcher-2.2.4-B-mac-x64.dmg', size: 100, browser_download_url: 'https://x/mac-x64.dmg' },
  { name: 'EMBER-Launcher-2.2.4-B-mac-arm64.zip', size: 100, browser_download_url: 'https://x/mac-arm64.zip' },
  { name: 'SHA256SUMS.txt', size: 10, browser_download_url: 'https://x/sha.txt' },
];

test('parseVersion: распознаёт X.X.X с буквой и без, с дефисом', () => {
  assert.deepStrictEqual(parseVersion('2.2.4B'), { major: 2, minor: 2, patch: 4, suffix: 'B' });
  assert.deepStrictEqual(parseVersion('2.2.4'), { major: 2, minor: 2, patch: 4, suffix: '' });
  assert.deepStrictEqual(parseVersion('2.2.4-B'), { major: 2, minor: 2, patch: 4, suffix: 'B' });
  assert.deepStrictEqual(parseVersion('2.2.4a'), { major: 2, minor: 2, patch: 4, suffix: 'A' });
  assert.strictEqual(parseVersion('abc'), null);
  assert.strictEqual(parseVersion('2.2'), null);
});

test('compareVersions: буквы A–C и переход на следующую версию', () => {
  assert.strictEqual(compareVersions('2.2.4A', '2.2.4B'), -1);
  assert.strictEqual(compareVersions('2.2.4B', '2.2.4C'), -1);
  assert.strictEqual(compareVersions('2.2.4C', '2.2.5A'), -1);
  assert.strictEqual(compareVersions('2.2.5A', '2.2.5B'), -1);
  assert.strictEqual(compareVersions('2.2.5B', '2.2.4C'), 1);
  assert.strictEqual(compareVersions('2.2.4B', '2.2.4B'), 0);
  assert.strictEqual(compareVersions('2.2.4-B', '2.2.4B'), 0);
  assert.strictEqual(compareVersions('2.2.4', '2.2.4A'), -1);
  assert.strictEqual(compareVersions('2.3.0A', '2.2.9C'), 1);
  assert.strictEqual(compareVersions('2.2.10A', '2.2.9B'), 1);
});

test('isNewer: есть ли новая версия', () => {
  assert.strictEqual(isNewer('2.2.5A', '2.2.4B'), true);
  assert.strictEqual(isNewer('2.2.4C', '2.2.4B'), true);
  assert.strictEqual(isNewer('2.2.4B', '2.2.4B'), false);
  assert.strictEqual(isNewer('2.2.4A', '2.2.4B'), false);
});

test('pickAsset: Windows — exe', () => {
  const a = pickAsset(ASSETS, 'win32', 'x64');
  assert.strictEqual(a.name, 'EMBER.Launcher.Setup.2.2.4-B.exe');
});

test('pickAsset: Linux — AppImage раньше deb, deb раньше tar.gz', () => {
  assert.strictEqual(pickAsset(ASSETS, 'linux', 'x64').name, 'EMBER-Launcher-2.2.4-B-linux-x86_64.AppImage');
  const onlyDeb = ASSETS.filter(a => !a.name.includes('AppImage'));
  assert.strictEqual(pickAsset(onlyDeb, 'linux', 'x64').name, 'EMBER-Launcher-2.2.4-B-linux-amd64.deb');
  const onlyTgz = ASSETS.filter(a => !a.name.includes('AppImage') && !a.name.includes('.deb'));
  assert.strictEqual(pickAsset(onlyTgz, 'linux', 'x64').name, 'EMBER-Launcher-2.2.4-B-linux-x64.tar.gz');
});

test('pickAsset: macOS — dmg раньше zip, своя архитектура', () => {
  assert.strictEqual(pickAsset(ASSETS, 'darwin', 'arm64').name, 'EMBER-Launcher-2.2.4-B-mac-arm64.dmg');
  assert.strictEqual(pickAsset(ASSETS, 'darwin', 'x64').name, 'EMBER-Launcher-2.2.4-B-mac-x64.dmg');
  const onlyZip = ASSETS.filter(a => !a.name.includes('.dmg'));
  assert.strictEqual(pickAsset(onlyZip, 'darwin', 'arm64').name, 'EMBER-Launcher-2.2.4-B-mac-arm64.zip');
});

test('pickAsset: нет подходящего ассета — null', () => {
  assert.strictEqual(pickAsset(ASSETS.filter(a => a.name.includes('.exe')), 'linux', 'x64'), null);
  assert.strictEqual(pickAsset(null, 'win32', 'x64'), null);
  assert.strictEqual(pickAsset([], 'win32', 'x64'), null);
});

test('updateInfo: формирование информации об обновлении', () => {
  const rel = {
    tag_name: '2.2.4C',
    html_url: 'https://github.com/blddv/Ember-Launcher/releases/tag/2.2.4C',
    assets: ASSETS,
  };
  const info = updateInfo(rel, '2.2.4B', 'win32', 'x64');
  assert.strictEqual(info.available, true);
  assert.strictEqual(info.latest, '2.2.4C');
  assert.strictEqual(info.current, '2.2.4B');
  assert.strictEqual(info.asset.name, 'EMBER.Launcher.Setup.2.2.4-B.exe');
  assert.strictEqual(info.url, 'https://github.com/blddv/Ember-Launcher/releases/tag/2.2.4C');
  const same = updateInfo({ tag_name: '2.2.4B', assets: ASSETS }, '2.2.4B', 'win32', 'x64');
  assert.strictEqual(same.available, false);
});

test('verifyChecksum: поиск хэша по имени файла', () => {
  const ha = 'a'.repeat(64);
  const hb = 'b'.repeat(64);
  const text = [
    `${ha} EMBER-Launcher-2.2.4-B-linux-amd64.deb`,
    `${hb} EMBER.Launcher.Setup.2.2.4-B.exe`,
    '',
  ].join('\n');
  assert.strictEqual(verifyChecksum(text, 'EMBER-Launcher-2.2.4-B-linux-amd64.deb'), ha);
  assert.strictEqual(verifyChecksum(text, 'EMBER.Launcher.Setup.2.2.4-B.exe'), hb);
  assert.strictEqual(verifyChecksum(text, 'нет такого файла'), null);
  assert.strictEqual(verifyChecksum('', 'anything'), null);
  assert.strictEqual(verifyChecksum('не hash', 'EMBER.Launcher.Setup.2.2.4-B.exe'), null);
  assert.strictEqual(verifyChecksum('короткий-хэш EMBER.Launcher.Setup.2.2.4-B.exe', 'EMBER.Launcher.Setup.2.2.4-B.exe'), null);
});

test('planInstall: план установки по платформе', () => {
  assert.strictEqual(planInstall({ platform: 'win32', fileName: 'x.exe' }).method, 'nsis');
  assert.strictEqual(planInstall({ platform: 'linux', appImagePath: '/opt/app.AppImage', fileName: 'x.AppImage' }).method, 'appimage');
  assert.strictEqual(planInstall({ platform: 'linux', appImagePath: '', fileName: 'x.AppImage' }).method, 'manual');
  assert.strictEqual(planInstall({ platform: 'linux', appImagePath: '/opt/app.AppImage', fileName: 'x.deb' }).method, 'manual');
  assert.strictEqual(planInstall({ platform: 'darwin', fileName: 'x.dmg' }).method, 'manual');
});
