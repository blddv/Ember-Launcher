const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const AdmZip = require('adm-zip');
const { dirs } = require('./paths');
const { fetchBuffer } = require('./http');
const store = require('./store');

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
  const m = text.match(/version "(\d+)(?:\.(\d+))?/);
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

  const { os, arch } = platformTriple();
  const ext = os === 'windows' ? 'zip' : 'tar.gz';
  report({ stage: 'Java', text: `Скачиваю Java ${major} (Adoptium)…` });
  const url = `https://api.adoptium.net/v3/binary/latest/${major}/ga/${os}/${arch}/jre/hotspot/normal/eclipse`;
  let buf;
  try {
    buf = await fetchBuffer(url);
  } catch (e) {
    // Сеть недоступна. Для новых версий Minecraft (1.17+) подойдёт и более новая Java —
    // используем уже скачанную среду, чтобы запуск не срывался (часто заметно на 1.20.x,
    // которым нужна Java 17, пока для других сборок кеш уже заполнен).
    if (major >= 16) {
      const fb = findRuntime(major);
      if (fb) {
        report({ stage: 'Java', text: `Java ${major} не скачалась, запускаю на Java ${fb.major}` });
        return fb.bin;
      }
    }
    throw new Error(`Не удалось скачать Java ${major} (Adoptium): ${e.message}. `
      + 'Проверьте интернет или укажите путь к Java в Настройках');
  }

  await fsp.mkdir(dirs.tmp, { recursive: true });
  const archive = path.join(dirs.tmp, `jre-${major}.${ext}`);
  await fsp.writeFile(archive, buf);
  const extractDir = path.join(dirs.tmp, `jre-${major}-extract`);
  await fsp.rm(extractDir, { recursive: true, force: true });
  await fsp.mkdir(extractDir, { recursive: true });

  if (ext === 'zip') new AdmZip(buf).extractAllTo(extractDir, true);
  else execFileSync('tar', ['-xzf', archive, '-C', extractDir]);

  const top = (await fsp.readdir(extractDir, { withFileTypes: true })).find(d => d.isDirectory());
  if (!top) throw new Error('Архив Java пустой');
  await fsp.mkdir(dirs.runtime, { recursive: true });
  await fsp.rm(home, { recursive: true, force: true });
  await fsp.rename(path.join(extractDir, top.name), home);
  await fsp.rm(archive, { force: true });
  await fsp.rm(extractDir, { recursive: true, force: true });

  if (!fs.existsSync(javaExeIn(home))) throw new Error('Java установлена, но java не найдена');
  return javaExeIn(home);
}

module.exports = { ensureJava };
