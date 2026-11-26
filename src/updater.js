// Автообновление лаунчера из GitHub Releases.
// Релизы: https://github.com/blddv/Ember-Launcher/releases
//
// Процесс:
//   1) Запросить последний релиз через GitHub API (releases/latest).
//   2) Сравнить версию по схеме X.X.X + буква (2.2.4B → 2.2.4C → 2.2.5A).
//   3) Выбрать установщик для текущей платформы и архитектуры.
//   4) Скачать его (с проверкой SHA-256, если в релизе есть SHA256SUMS.txt).
//   5) Установить: Windows — тихий NSIS-установщик, Linux AppImage — замена
//      файла, остальное — открытие установщика для ручной установки.
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { dirs } = require('./paths');
const { fetchJson, fetchBuffer, downloadFile, fileSha256 } = require('./http');

const GITHUB_REPO = 'blddv/Ember-Launcher';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}`;

/* ================= Версионирование X.X.X + буква (A–C) ================= */

// 2.2.4B → { major: 2, minor: 2, patch: 4, suffix: 'B' }
// Буква может быть без дефиса: "2.2.4-B" (как в имени ассета) тоже распознаётся.
function parseVersion(v) {
  const m = String(v || '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-?([A-Za-z]))?$/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], suffix: (m[4] || '').toUpperCase() };
}

// Сравнение: сначала числовые части, затем буква (нет буквы < A < B < C).
// Некорректные версии сравниваются как строки (0 при полном равенстве).
function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return String(a || '').localeCompare(String(b || ''));
  for (const k of ['major', 'minor', 'patch']) {
    if (pa[k] !== pb[k]) return pa[k] < pb[k] ? -1 : 1;
  }
  if (pa.suffix === pb.suffix) return 0;
  return pa.suffix < pb.suffix ? -1 : 1;
}

// Есть ли новая версия? isNewer('2.2.5A', '2.2.4B') === true
function isNewer(latest, current) {
  return compareVersions(latest, current) > 0;
}

/* ================= Подбор установщика ================= */

// Архитектурные алиасы из process.arch в названиях ассетов:
//   x64 → x64 | amd64 | x86_64;  arm64 → arm64 | aarch64
function archAliases(arch) {
  const a = String(arch || '').toLowerCase();
  if (a === 'arm64' || a === 'aarch64') return ['arm64', 'aarch64'];
  return ['x64', 'amd64', 'x86_64'];
}

// Имена ассетов (electron-builder):
//   win:   EMBER.Launcher.Setup.2.2.4-B.exe
//   linux: EMBER-Launcher-2.2.4-B-linux-{x86_64.AppImage | amd64.deb | x64.tar.gz}
//   mac:   EMBER-Launcher-2.2.4-B-mac-{x64|arm64}.{dmg|zip}
// Приоритет форматов: Windows — exe; Linux — AppImage, затем deb, затем tar.gz;
// macOS — dmg, затем zip.
function pickAsset(assets, platform = process.platform, arch = process.arch) {
  if (!Array.isArray(assets)) return null;
  const aliases = archAliases(arch);
  const exts = platform === 'win32' ? ['exe']
    : platform === 'darwin' ? ['dmg', 'zip']
    : ['AppImage', 'deb', 'tar.gz'];
  for (const ext of exts) {
    const found = assets.find(a => {
      if (!a || !a.name) return false;
      const lower = String(a.name).toLowerCase();
      if (!lower.endsWith('.' + ext.toLowerCase())) return false;
      if (platform === 'win32') return true;
      const token = platform === 'darwin' ? 'mac' : 'linux';
      if (!lower.includes(token)) return false;
      return aliases.some(al => lower.includes(al));
    });
    if (found) return found;
  }
  return null;
}

// Информация об обновлении на основе ответа GitHub.
function updateInfo(release, currentVersion, platform = process.platform, arch = process.arch) {
  const latest = String(release.tag_name || '').trim();
  const asset = pickAsset(release.assets || [], platform, arch);
  return {
    available: isNewer(latest, currentVersion),
    current: currentVersion,
    latest,
    version: latest,
    url: release.html_url || `https://github.com/${GITHUB_REPO}/releases`,
    name: release.name || latest,
    publishedAt: release.published_at || '',
    asset: asset ? { name: asset.name, size: asset.size || 0, url: asset.browser_download_url } : null,
  };
}

/* ================= Проверка SHA-256 ================= */

// Разбор SHA256SUMS.txt: строки "<hash>  <имя файла>".
// Возвращает хэш для файла или null, если файла нет в списке.
function verifyChecksum(text, fileName) {
  const lines = String(text || '').split(/\r?\n/);
  const base = path.basename(String(fileName || ''));
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const hash = parts[0].toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hash)) continue;
    if (path.basename(parts[parts.length - 1]) === base) return hash;
  }
  return null;
}

/* ================= Network ================= */

async function checkForUpdate(currentVersion, { token, platform = process.platform, arch = process.arch } = {}) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const rel = await fetchJson(`${GITHUB_API}/releases/latest`, { headers });
  if (!rel || !rel.tag_name) throw new Error('Релиз не найден на GitHub');
  const info = updateInfo(rel, currentVersion, platform, arch);
  // SHA256SUMS.txt — если есть в релизе, качаем для проверки скачиваемого файла
  info.checksums = '';
  const sums = (rel.assets || []).find(a => String(a.name || '').toLowerCase() === 'sha256sums.txt');
  if (sums && sums.browser_download_url) {
    try {
      const buf = await fetchBuffer(sums.browser_download_url);
      info.checksums = buf.toString('utf8');
    } catch (_) { /* проверка опциональна — без неё просто скачиваем */ }
  }
  return info;
}

// Скачивание установщика в tmp. Проверка суммы — если текст SHA256SUMS.txt передан.
async function downloadUpdate(asset, { checksums, onProgress } = {}) {
  if (!asset || !asset.url) throw new Error('Не указан файл обновления');
  const name = path.basename(asset.name || '');
  const dest = path.join(dirs.tmp, `ember-update-${name}`);
  await downloadFile(asset.url, dest, { onProgress });
  if (checksums) {
    const want = verifyChecksum(checksums, name);
    if (want) {
      const got = await fileSha256(dest);
      if (got !== want) {
        fs.rmSync(dest, { force: true });
        throw new Error('Контрольная сумма обновления не совпала — файл удалён');
      }
    }
  }
  return { ok: true, path: dest, name };
}

/* ================= План установки ================= */

// Что делать с скачанным файлом на этой платформе:
//   nsis    — Windows: запустить тихий NSIS-установщик
//   appimage — Linux: заменить текущий AppImage (AppImage-путь передаётся из main)
//   manual  — открыть установщик системой (deb, dmg, zip и т.п.)
function planInstall({ platform = process.platform, appImagePath = process.env.APPIMAGE || '', fileName = '' } = {}) {
  if (platform === 'win32' && /\.exe$/i.test(fileName || '')) {
    return { method: 'nsis', label: 'Тихая установка и перезапуск' };
  }
  if (platform === 'linux' && appImagePath && /\.appimage$/i.test(fileName || '')) {
    return { method: 'appimage', label: 'Замена AppImage и перезапуск' };
  }
  return { method: 'manual', label: 'Открыть установщик для установки' };
}

// Выполнить установку. Побочные эффекты (перезапуск, открытие) — в main-процессе.
function installUpdate({ platform = process.platform, appImagePath = process.env.APPIMAGE || '', assetName = '' }, { file } = {}) {
  const plan = planInstall({ platform, appImagePath, fileName: assetName });
  if (plan.method === 'nsis') {
    // /S — тихий режим NSIS;detached — установщик продолжает работать после выхода лаунчера
    const p = spawn(file, ['/S'], { detached: true, stdio: 'ignore' });
    p.on('error', () => {});
    p.unref();
    return { ok: true, method: 'nsis', message: 'Установка запущена — лаунчер завершается' };
  }
  if (plan.method === 'appimage') {
    fs.copyFileSync(file, appImagePath);
    return { ok: true, method: 'appimage', message: 'AppImage обновлён — перезапускаю лаунчер' };
  }
  return { ok: true, method: 'manual', message: 'Открыл установщик — установите обновление вручную' };
}

module.exports = {
  GITHUB_REPO,
  parseVersion, compareVersions, isNewer,
  pickAsset, updateInfo,
  verifyChecksum, checkForUpdate, downloadUpdate,
  planInstall, installUpdate,
};
