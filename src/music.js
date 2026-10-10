const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { dirs } = require('./paths');

const EXTS = new Set(['.mp3', '.ogg', '.oga', '.wav', '.flac', '.m4a', '.aac', '.opus']);

function folderOf(settings) {
  const f = settings && settings.folder;
  return f && fs.existsSync(f) ? f : path.join(dirs.base, 'music');
}

// Список треков папки (без вложенных подпапок глубже двух уровней).
function listTracks(settings) {
  const dir = folderOf(settings);
  fs.mkdirSync(dir, { recursive: true });
  const out = [];
  const walk = (d, depth) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory() && depth < 2) walk(full, depth + 1);
      else if (e.isFile() && EXTS.has(path.extname(e.name).toLowerCase())) {
        out.push({ path: full, url: pathToFileURL(full).href, name: path.basename(e.name, path.extname(e.name)) });
      }
    }
  };
  walk(dir, 0);
  return { folder: dir, tracks: out.sort((a, b) => a.name.localeCompare(b.name, 'ru')) };
}

module.exports = { listTracks, folderOf, EXTS };
