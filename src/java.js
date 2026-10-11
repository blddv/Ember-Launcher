const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const AdmZip = require('adm-zip');
const { dirs } = require('./paths');
const { downloadFile } = require('./http');
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

// Скачивает и распаковывает Adoptium JRE в runtime/java-<major>, возвращает путь к bin.
// Скачивание не висит вечно: есть таймауты, повторы и живой прогресс в МБ.
async function installRuntime(major, report = () => {}, opts = {}) {
  const { os, arch } = platformTriple();
  const ext = os === 'windows' ? 'zip' : 'tar.gz';
  const url = `${ADOPTIUM_BASE}/${major}/ga/${os}/${arch}/jre/hotspot/normal/eclipse`;
  await fsp.mkdir(dirs.tmp, { recursive: true });
  const archive = path.join(dirs.tmp, `jre-${major}.${ext}`);
  const mb = n => (n / 1048576).toFixed(1).replace('.', ',');
  let lastAt = 0;
  try {
    report({ stage: 'Java', text: `Скачиваю Java ${major} (Adoptium)…` });
    await downloadFile(url, archive, {
      attempts: opts.attempts || 2,
      overallMs: opts.overallMs || 240000,
      onProgress: (received, total) => {
        const now = Date.now();
        if (now - lastAt < 500) return; // не спамим в прогресс
        lastAt = now;
        report({
          stage: 'Java',
          text: total
            ? `Скачиваю Java ${major}: ${mb(received)} / ${mb(total)} МБ`
            : `Скачиваю Java ${major}: ${mb(received)} МБ`,
        });
      },
    });
  } catch (e) {
    await fsp.rm(archive, { force: true });
    throw e;
  }

  const extractDir = path.join(dirs.tmp, `jre-${major}-extract`);
  await fsp.rm(extractDir, { recursive: true, force: true });
  await fsp.mkdir(extractDir, { recursive: true });

  if (ext === 'zip') new AdmZip(archive).extractAllTo(extractDir, true);
  else execFileSync('tar', ['-xzf', archive, '-C', extractDir]);

  const top = (await fsp.readdir(extractDir, { withFileTypes: true })).find(d => d.isDirectory());
  if (!top) throw new Error('Архив Java пустой');
  const home = path.join(dirs.runtime, `java-${major}`);
  await fsp.mkdir(dirs.runtime, { recursive: true });
  await fsp.rm(home, { recursive: true, force: true });
  await fsp.rename(path.join(extractDir, top.name), home);
  await fsp.rm(archive, { force: true });
  await fsp.rm(extractDir, { recursive: true, force: true });

  if (!fs.existsSync(javaExeIn(home))) throw new Error('Java установлена, но java не найдена');
  return javaExeIn(home);
}

// Возвращает путь к java-исполняемому файлу нужной major-версии.
// Порядок: ручной путь из настроек -> уже скачанная среда -> скачивание Adoptium JRE.
// Ручной путь используется, только если его версия не ниже требуемой: Minecraft с новой Java
// не запустится на старой (UnsupportedClassVersionError), поэтому тогда берём нужную среду.
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
    // Нужную Java скачать не удалось (часто заметно на 1.20.x: им нужна Java 17,
    // а сети иногда не отдают именно её). Для новых версий Minecraft (1.17+)
    // подойдёт и более новая Java: сначала берём кеш, потом пробуем скачать её.
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
    throw new Error(`Не удалось скачать Java ${major} (Adoptium): ${e.message}. `
      + 'Проверьте интернет или укажите путь к Java в Настройках');
  }
}

module.exports = { ensureJava };
