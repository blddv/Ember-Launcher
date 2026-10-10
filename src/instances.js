const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const AdmZip = require('adm-zip');
const { dirs } = require('./paths');
const store = require('./store');

const { pathToFileURL } = require('url');

const LOADERS = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'];
const COVERS = path.join(dirs.base, 'covers');
const EXPORT_MARK = 'ember-instance.json';
// Что не копируем при дублировании и экспорте (тяжёлое или временное)
const SKIP_DIRS = new Set(['logs', 'crash-reports', 'debug', '.cache']);

function getGameDir(inst) {
  return path.join(dirs.instances, inst.id);
}

function coverFile(id) {
  return path.join(COVERS, `${id}.png`);
}

function withDir(i) {
  const cover = coverFile(i.id);
  let coverUrl = '';
  if (fs.existsSync(cover)) coverUrl = `${pathToFileURL(cover).href}?v=${fs.statSync(cover).mtimeMs | 0}`;
  return { ...i, gameDir: getGameDir(i), coverUrl };
}

// Обложка сборки: файл копируется в данные лаунчера (папка covers)
function setCover(id, sourceFile) {
  find(id);
  fs.mkdirSync(COVERS, { recursive: true });
  fs.copyFileSync(sourceFile, coverFile(id));
  return withDir(find(id));
}

function clearCover(id) {
  fs.rmSync(coverFile(id), { force: true });
  return withDir(find(id));
}

// Последний файл краш-отчёта из папки сборки (или null)
function lastCrash(id) {
  const dir = path.join(getGameDir(find(id)), 'crash-reports');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => /\.txt$/i.test(f))
    .map(f => ({ f: path.join(dir, f), t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files[0] ? files[0].f : null;
}

function list() {
  return store.get('instances').map(withDir);
}

function find(id) {
  const inst = store.get('instances').find(i => i.id === id);
  if (!inst) throw new Error('Сборка не найдена');
  return withDir(inst);
}

function slugOf(name) {
  return (name || 'instance').toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '').slice(0, 32) || 'instance';
}

function create({ name, version, loader = 'vanilla', loaderVersion = '' }) {
  if (!LOADERS.includes(loader)) throw new Error(`Неизвестный загрузчик: ${loader}`);
  const id = `${slugOf(name)}-${Date.now().toString(36)}`;
  const inst = {
    id,
    name: name || 'Новая сборка',
    version,
    loader,
    loaderVersion: loaderVersion || '',
    createdAt: Date.now(),
    playMs: 0,
    lastPlayed: 0,
  };
  const dir = getGameDir(inst);
  fs.mkdirSync(path.join(dir, 'mods'), { recursive: true });
  store.set('instances', [...store.get('instances'), inst]);
  if (!store.get('selectedInstance')) store.set('selectedInstance', id);
  return withDir(inst);
}

// Обновляет поля записи сборки (например, версию загрузчика, которую выбрал лаунчер).
function update(id, patch) {
  const all = store.get('instances');
  const idx = all.findIndex(i => i.id === id);
  if (idx < 0) throw new Error('Сборка не найдена');
  all[idx] = { ...all[idx], ...patch };
  store.set('instances', all);
  return withDir(all[idx]);
}

function addPlaytime(id, ms) {
  const inst = store.get('instances').find(i => i.id === id);
  if (!inst) return;
  update(id, { playMs: (inst.playMs || 0) + Math.max(0, ms), lastPlayed: Date.now() });
}

function remove(id) {
  const rest = store.get('instances').filter(i => i.id !== id);
  store.set('instances', rest);
  if (store.get('selectedInstance') === id) store.set('selectedInstance', rest[0] ? rest[0].id : null);
  fs.rmSync(path.join(dirs.instances, id), { recursive: true, force: true });
  fs.rmSync(coverFile(id), { force: true });
}

// Копирует сборку: настройки, моды, конфиги и миры (без логов и краш-репортов).
async function duplicate(id, newName) {
  const src = find(id);
  const copy = create({ name: newName || `${src.name} (копия)`, version: src.version, loader: src.loader, loaderVersion: src.loaderVersion });
  await fsp.cp(src.gameDir, copy.gameDir, {
    recursive: true,
    force: true,
    filter: p => !SKIP_DIRS.has(path.basename(p)),
  });
  return copy;
}

// Экспорт сборки в zip (формат EMBER: в корне файл ember-instance.json с метаданными).
function exportZip(id, targetFile) {
  const inst = find(id);
  const zip = new AdmZip();
  zip.addFile(EXPORT_MARK, Buffer.from(JSON.stringify({
    format: 1,
    name: inst.name,
    version: inst.version,
    loader: inst.loader,
    loaderVersion: inst.loaderVersion,
  }, null, 2), 'utf8'));
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(full, r);
      else zip.addLocalFile(full, rel ? `${rel}` : '');
    }
  };
  walk(inst.gameDir, '');
  zip.writeZip(targetFile);
  return targetFile;
}

// Импорт zip, созданного экспортом EMBER. Сборка появляется в списке.
function importZip(file) {
  const zip = new AdmZip(file);
  const entry = zip.getEntry(EXPORT_MARK);
  if (!entry) throw new Error('Это не экспорт EMBER: нет файла ember-instance.json');
  const meta = JSON.parse(entry.getData().toString('utf8'));
  const inst = create({
    name: meta.name || 'Импорт',
    version: meta.version,
    loader: LOADERS.includes(meta.loader) ? meta.loader : 'vanilla',
    loaderVersion: meta.loaderVersion || '',
  });
  zip.extractAllTo(inst.gameDir, true);
  fs.rmSync(path.join(inst.gameDir, EXPORT_MARK), { force: true });
  return inst;
}

module.exports = {
  LOADERS, list, find, create, update, remove, duplicate, exportZip, importZip, addPlaytime, getGameDir,
  setCover, clearCover, lastCrash,
};
