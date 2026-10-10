const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFileSync } = require('child_process');
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

// Возвращает путь к java-исполняемому файлу нужной major-версии.
// Порядок: ручной путь из настроек -> уже скачанная среда -> скачивание Adoptium JRE.
async function ensureJava(major, report = () => {}) {
  const custom = store.get('javaPath');
  if (custom && fs.existsSync(custom)) {
    const st = fs.statSync(custom);
    return st.isDirectory() ? javaExeIn(custom) : custom;
  }

  const home = path.join(dirs.runtime, `java-${major}`);
  if (fs.existsSync(javaExeIn(home))) return javaExeIn(home);

  const { os, arch } = platformTriple();
  const ext = os === 'windows' ? 'zip' : 'tar.gz';
  report({ stage: 'Java', text: `Скачиваю Java ${major} (Adoptium)…` });
  const url = `https://api.adoptium.net/v3/binary/latest/${major}/ga/${os}/${arch}/jre/hotspot/normal/eclipse`;
  const buf = await fetchBuffer(url);

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
