const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const AdmZip = require('adm-zip');
const { dirs } = require('./paths');
const { downloadFile, fetchJson } = require('./http');
const store = require('./store');

// Зеркало Adoptium (для тестов можно подменить через EMBER_JAVA_MIRROR)
const ADOPTIUM_BASE = process.env.EMBER_JAVA_MIRROR || 'https://api.adoptium.net/v3/binary/latest';
// На какую более новую Java переходим, если нужную скачать не удалось
const FALLBACK_MAJOR = 21;

function platformTriple() {
  const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
  return { os, arch };
}

// Имя архива: на Windows zip, на Linux/macOS tar.gz
function archiveType() {
  return platformTriple().os === 'windows' ? 'zip' : 'tar.gz';
}

// Откуда качаем Java. Adoptium в РФ бывает недоступен (и именно 17-ю), поэтому
// есть запасные источники: BellSoft (Liberica, архивы часто на github.com — он из РФ
// качается) и Azul (Zulu). Каждый источник умеет отдавать «последнюю» Java нужной major.
// EMBER_JAVA_SOURCES='[{"name":"...","url":"...{major}..."}]' заменяет список целиком (для тестов).
function buildSources(major) {
  const custom = process.env.EMBER_JAVA_SOURCES;
  if (custom) {
    return JSON.parse(custom).map(s => ({
      name: s.name,
      url: s.url.replace(/\{major\}/g, String(major)),
      sha1: s.sha1 || undefined,
    }));
  }
  const { os, arch } = platformTriple();
  const pkg = archiveType();
  const libericaOs = os === 'mac' ? 'macos' : os;
  const azulOs = os === 'mac' ? 'macos' : os;
  return [
    {
      name: 'Adoptium',
      url: `${ADOPTIUM_BASE}/${major}/ga/${os}/${arch}/jre/hotspot/normal/eclipse`,
    },
    {
      name: 'BellSoft',
      resolve: async () => {
        const q = `version-feature=${major}&version-modifier=latest&bitness=64`
          + `&os=${libericaOs}&arch=${arch === 'aarch64' ? 'arm' : 'x86'}`
          + `&package-type=${pkg}&bundle-type=jre&output=json`;
        const list = await fetchJson(`https://api.bell-sw.com/v1/liberica/releases?${q}`, { attempts: 2, connectMs: 15000 });
        const pick = (list || []).find(x => x.featureVersion === major) || (list || [])[0];
        if (!pick || !pick.downloadUrl) throw new Error('нет подходящей сборки');
        return { url: pick.downloadUrl, sha1: pick.sha1 || undefined };
      },
    },
    {
      name: 'Azul',
      resolve: async () => {
        const q = `java_version=${major}&os=${azulOs}&arch=${arch === 'aarch64' ? 'aarch64' : 'x64'}`
          + `&archive_type=${pkg}&java_package_type=jre&javafx_bundled=false`
          + '&latest=true&release_status=ga&page_size=1';
        const list = await fetchJson(`https://api.azul.com/metadata/v1/zulu/packages/?${q}`, { attempts: 2, connectMs: 15000 });
        const pick = (list || [])[0];
        if (!pick || !pick.download_url) throw new Error('нет подходящей сборки');
        return { url: pick.download_url };
      },
    },
  ];
}

function javaExeIn(home) {
  return path.join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
}

// Major-версия Java по выводу "java -version" (java 8 пишет "1.8.0_x", java 9+ — "17.0.2").
function javaMajorOf(bin) {
  const r = spawnSync(bin, ['-version'], { encoding: 'utf8', windowsHide: true });
  const text = `${r.stdout || ''}${r.stderr || ''}`;
  const m = text.match(/version \"(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return Number(m[1]) === 1 ? Number(m[2]) : Number(m[1]);
}

// Уже скачанные среды из папки runtime версией не ниже требуемой.
// Новая Minecraft запускается и на более новой Java, поэтому если нужную скачать
// не удалось, лучше запустить игру на уже имеющейся среде, чем сорвать запуск.
function findRuntime(minMajor) {
  let names = [];
  try { names = fs.readdirSync(dirs.runtime); } catch (_) { return null; }
  const candidates = [];
  for (const name of names) {
    const m = /^java-(\d+)$/.exec(name);
    if (!m) continue;
    const major = Number(m[1]);
    if (major < minMajor) continue;
    const bin = javaExeIn(path.join(dirs.runtime, name));
    if (!fs.existsSync(bin)) continue;
    candidates.push({ bin, major });
  }
  candidates.sort((a, b) => a.major - b.major);
  return candidates[0] || null;
}

// Скачивает и распаковывает JRE в runtime/java-<major>, возвращает путь к bin.
// Источники перебираются по очереди; скачивание не висит вечно (таймауты, повторы,
// живой прогресс в МБ).
async function installRuntime(major, report = () => {}, opts = {}) {
  const ext = archiveType();
  const sources = buildSources(major);
  await fsp.mkdir(dirs.tmp, { recursive: true });
  const archive = path.join(dirs.tmp, `jre-${major}.${ext}`);
  const mb = n => (n / 1048576).toFixed(1).replace('.', ',');
  const errors = [];

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    try {
      report({ stage: 'Java', text: `Скачиваю Java ${major} (${src.name})…` });
      const entry = src.resolve ? await src.resolve() : src;
      let lastAt = 0;
      await downloadFile(entry.url, archive, {
        sha1: entry.sha1,
        attempts: opts.attempts || 1,
        overallMs: opts.overallMs || 180000,
        connectMs: 15000,
        onProgress: (received, total) => {
          const now = Date.now();
          if (now - lastAt < 500) return; // не спамим в прогресс
          lastAt = now;
          report({
            stage: 'Java',
            text: total
              ? `Скачиваю Java ${major} (${src.name}): ${mb(received)} / ${mb(total)} МБ`
              : `Скачиваю Java ${major} (${src.name}): ${mb(received)} МБ`,
          });
        },
      });

      const extractDir = path.join(dirs.tmp, `jre-${major}-extract`);
      await fsp.rm(extractDir, { recursive: true, force: true });
      await fsp.mkdir(extractDir, { recursive: true });

      if (ext === 'zip') new AdmZip(archive).extractAllTo(extractDir, true);
      else execFileSync('tar', ['-xzf', archive, '-C', extractDir]);

      const top = (await fsp.readdir(extractDir, { withFileTypes: true })).find(d => d.isDirectory());
      if (!top) throw new Error('архив Java пустой');
      const home = path.join(dirs.runtime, `java-${major}`);
      await fsp.mkdir(dirs.runtime, { recursive: true });
      await fsp.rm(home, { recursive: true, force: true });
      await fsp.rename(path.join(extractDir, top.name), home);
      await fsp.rm(archive, { force: true });
      await fsp.rm(extractDir, { recursive: true, force: true });

      if (!fs.existsSync(javaExeIn(home))) throw new Error('Java установлена, но java не найдена');
      return javaExeIn(home);
    } catch (e) {
      await fsp.rm(archive, { force: true });
      errors.push(`${src.name}: ${e.message}`);
      if (i < sources.length - 1) {
        report({ stage: 'Java', text: `Источник ${src.name} не подошёл, пробую следующий…` });
      }
    }
  }
  throw new Error(errors.join('; '));
}

// Возвращает путь к java-исполняемому файлу нужной major-версии.
// Порядок: ручной путь из настроек -> уже скачанная среда -> скачивание (Adoptium,
// затем запасные источники). Ручной путь используется, только если его версия не ниже
// требуемой: Minecraft с новой Java не запустится на старой (UnsupportedClassVersionError).
async function ensureJava(major, report = () => {}) {
  const custom = store.get('javaPath');
  if (custom && fs.existsSync(custom)) {
    const bin = fs.statSync(custom).isDirectory() ? javaExeIn(custom) : custom;
    const have = javaMajorOf(bin);
    if (have === null || have >= major) return bin;
    report({ stage: 'Java', text: `Указанная Java ${have} ниже нужной (${major}), использую Java ${major}` });
  }

  const home = path.join(dirs.runtime, `java-${major}`);
  if (fs.existsSync(javaExeIn(home))) return javaExeIn(home);

  try {
    return await installRuntime(major, report);
  } catch (e) {
    // Нужную Java скачать не удалось со всех источников. Для новых версий Minecraft
    // (1.17+) подойдёт и более новая Java: сначала берём кеш, потом пробуем скачать её.
    if (major >= 16) {
      const fb = findRuntime(major);
      if (fb) {
        report({ stage: 'Java', text: `Java ${major} не скачалась, запускаю на Java ${fb.major}` });
        return fb.bin;
      }
      if (major < FALLBACK_MAJOR) {
        report({ stage: 'Java', text: `Java ${major} не скачалась, пробую Java ${FALLBACK_MAJOR}…` });
        try {
          const bin = await installRuntime(FALLBACK_MAJOR, report);
          report({ stage: 'Java', text: `Запускаю на Java ${FALLBACK_MAJOR}` });
          return bin;
        } catch (_) { /* ниже выкинем исходную ошибку с пояснением */ }
      }
    }
    throw new Error(`Не удалось скачать Java ${major} ни с одного источника: ${e.message}. `
      + 'Проверьте интернет или укажите путь к Java в Настройках');
  }
}

module.exports = { ensureJava };
