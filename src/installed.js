// Что уже стоит в сборке. Источник правды — файлы в папке mods.
// Запись о проекте (managed.projects) учитывается, только пока на диске есть её основной файл:
// удалил мод в менеджере или руками — он снова доступен для установки, без «уже скачано».
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const AdmZip = require('adm-zip');
const instances = require('./instances');
const managed = require('./managed');

function modsDir(inst) {
  return path.join(instances.getGameDir(inst), 'mods');
}

// Читаем из zip только нужные записи: центральный каталог и точечно каждый файл.
// AdmZip читает весь jar целиком, а мод может весить десятки мегабайт — из-за этого главный процесс зависал.
const JAR_META = ['fabric.mod.json', 'quilt.mod.json', 'META-INF/neoforge.mods.toml', 'META-INF/mods.toml'];
function readJarEntries(file, names) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 65557);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('не zip');
    const count = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOff = tail.readUInt32LE(eocd + 16);
    if (cdSize === 0xFFFFFFFF || cdOff === 0xFFFFFFFF) throw new Error('zip64');
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOff);
    const wanted = new Map();
    let p = 0;
    for (let n = 0; n < count && p + 46 <= cd.length; n++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) break;
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
      if (names.includes(name)) {
        wanted.set(name, { method: cd.readUInt16LE(p + 10), csize: cd.readUInt32LE(p + 20), lho: cd.readUInt32LE(p + 42) });
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    const out = {};
    for (const [name, e] of wanted) {
      const lh = Buffer.alloc(30);
      fs.readSync(fd, lh, 0, 30, e.lho);
      if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('битый заголовок');
      const dataOff = e.lho + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      const raw = Buffer.alloc(e.csize);
      fs.readSync(fd, raw, 0, e.csize, dataOff);
      if (e.method === 0) out[name] = raw.toString('utf8');
      else if (e.method === 8) out[name] = zlib.inflateRawSync(raw).toString('utf8');
    }
    return out;
  } finally {
    fs.closeSync(fd);
  }
}

// Из jar достаём modId (для поиска по id) и версию (для проверки устаревания)
function modInfoFromJar(file) {
  const info = { ids: [], version: '' };
  let entries = null;
  try {
    entries = readJarEntries(file, JAR_META);
  } catch (_) {
    entries = null; // запасной путь: полный разбор через AdmZip
  }
  try {
    const zip = entries ? null : new AdmZip(file);
    const read = name => {
      if (entries) return entries[name] != null ? entries[name] : null;
      const e = zip.getEntry(name);
      return e ? e.getData().toString('utf8') : null;
    };
    const fab = read('fabric.mod.json');
    if (fab) {
      const j = JSON.parse(fab);
      if (j.id) info.ids.push(j.id);
      if (j.version) info.version = String(j.version);
    }
    const quilt = read('quilt.mod.json');
    if (quilt) {
      const j = JSON.parse(quilt);
      if (j.quilt_loader && j.quilt_loader.id) info.ids.push(j.quilt_loader.id);
      if (j.quilt_loader && j.quilt_loader.version && !info.version) info.version = String(j.quilt_loader.version);
    }
    for (const toml of ['META-INF/neoforge.mods.toml', 'META-INF/mods.toml']) {
      const t = read(toml);
      if (!t) continue;
      const m = t.match(/modId\s*=\s*"([^"]+)"/);
      if (m) info.ids.push(m[1]);
      const v = t.match(/^\s*version\s*=\s*"([^"]+)"/m);
      if (v && !info.version) info.version = v[1];
    }
  } catch (_) {
    // битый jar — опираемся на имя файла
  }
  return info;
}

function modIdsFromJar(file) {
  return modInfoFromJar(file).ids;
}

// Разбор jar кэшируем по пути, размеру и времени изменения: поиск вызывает это при каждой странице выдачи
const jarCache = new Map();

// Все jar в папке mods (включённые и выключенные)
function scanJars(inst) {
  const dir = modsDir(inst);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const seen = new Set();
  for (const f of fs.readdirSync(dir)) {
    if (!/\.jar(\.disabled)?$/i.test(f)) continue;
    const full = path.join(dir, f);
    seen.add(full);
    const st = fs.statSync(full);
    const sig = `${st.size}:${st.mtimeMs}`;
    let hit = jarCache.get(full);
    if (!hit || hit.sig !== sig) {
      const name = f.replace(/\.disabled$/i, '');
      const info = modInfoFromJar(full);
      hit = {
        sig,
        info: {
          file: f,
          name,
          ids: info.ids,
          version: info.version,
          prefix: name.replace(/\.jar$/i, '').replace(/[-_+]?\d.*$/, '').toLowerCase(),
        },
      };
      jarCache.set(full, hit);
    }
    out.push(hit.info);
  }
  // Удаляем из кэша файлы этой папки, которых уже нет
  for (const k of [...jarCache.keys()]) if (k.startsWith(dir + path.sep) && !seen.has(k)) jarCache.delete(k);
  return out;
}

// Записи о проектах, у которых есть основной файл на диске. Остальные удаляются из учёта.
function validRecords(inst, jars = scanJars(inst)) {
  const present = new Set(jars.map(j => j.name));
  const all = managed.read(inst).projects;
  const keep = all.filter(p => p.files.length && present.has(p.files[0]));
  if (keep.length !== all.length) managed.setProjects(inst, keep);
  return keep;
}

// Ключи установленного (в нижнем регистре): префиксы имён файлов, modId и id проектов с файлами
function keysFor(inst) {
  const jars = scanJars(inst);
  const keys = new Set();
  for (const j of jars) {
    keys.add(j.prefix);
    for (const id of j.ids) keys.add(String(id).toLowerCase());
  }
  for (const r of validRecords(inst, jars)) keys.add(r.id.toLowerCase());
  keys.delete('');
  return [...keys];
}

// Состояние одного элемента поиска: { state: 'none' | 'current', record? }
function stateOf(inst, item, jars = scanJars(inst), recs = validRecords(inst, jars)) {
  if (!item || item.kind !== 'mod') return { state: 'none' };
  if (item.source === 'modrinth') {
    const rec = recs.find(r => r.id === item.id);
    if (rec) return { state: 'current', record: rec };
  }
  const cand = [item.id, item.slug].filter(Boolean).map(x => String(x).toLowerCase());
  const hit = jars.some(j => cand.includes(j.prefix) || j.ids.some(id => cand.includes(String(id).toLowerCase())));
  return hit ? { state: 'current' } : { state: 'none' };
}

function isInstalled(inst, item) {
  return stateOf(inst, item).state === 'current';
}

// Удаляет jar-файлы (включённые и выключенные) и их записи в учёте
function removeJars(inst, names) {
  const dir = modsDir(inst);
  for (const n of names) {
    if (!n || path.basename(n) !== n) continue;
    for (const f of [n, n + '.disabled']) {
      const p = path.join(dir, f);
      if (fs.existsSync(p)) fs.rmSync(p, { force: true });
    }
  }
  managed.removeFiles(inst, names);
}

module.exports = { keysFor, scanJars, validRecords, stateOf, isInstalled, removeJars, modIdsFromJar };
