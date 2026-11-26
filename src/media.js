// Обложки сборок, скриншоты и резервные копии миров.
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const AdmZip = require('adm-zip');
const { dirs } = require('./paths');
const instances = require('./instances');
const http = require('./http');
const i18n = require('./i18n');

// Обложка: файл с диска или картинка по https-ссылке (например, иконка с Modrinth)
async function applyCover(id, cover) {
  if (cover.file) return instances.setCover(id, cover.file);
  if (cover.url) {
    const url = String(cover.url);
    if (!/^https:\/\//i.test(url)) throw new Error(i18n.t('Обложка должна быть ссылкой https'));
    const buf = await http.fetchBuffer(url);
    fs.mkdirSync(dirs.tmp, { recursive: true });
    const tmp = path.join(dirs.tmp, `cover-${Date.now()}.img`);
    fs.writeFileSync(tmp, buf);
    try {
      return instances.setCover(id, tmp);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
  throw new Error(i18n.t('Не указана обложка'));
}

function screenshotsOf() {
  const out = [];
  for (const inst of instances.list()) {
    const dir = path.join(inst.gameDir, 'screenshots');
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!/\.(png|jpe?g)$/i.test(f)) continue;
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      out.push({ instance: inst.name, path: p, url: pathToFileURL(p).href, name: f, mtime: st.mtimeMs });
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, 400);
}

function backupSaves(inst) {
  const saves = path.join(inst.gameDir, 'saves');
  if (!fs.existsSync(saves) || !fs.readdirSync(saves).length) throw new Error(i18n.t('В этой сборке пока нет миров'));
  const dir = path.join(dirs.base, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(dir, `${inst.id}-${stamp}.zip`);
  const zip = new AdmZip();
  zip.addLocalFolder(saves, 'saves');
  zip.writeZip(dest);
  return dest;
}

module.exports = { applyCover, screenshotsOf, backupSaves };
