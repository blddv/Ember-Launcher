// Моды для Minecraft на Rust.
//
// Основной источник — официальный реестр Horizon (https://playhorizon.dev/mods, index.json
// в репозитории horizon-rust/horizon-mods). Там лежат проверенные моды .hmod, нативные .hnmod,
// сборки .hpack, ресурспаки и шейдерпаки. Каждый файл сверяется по размеру и SHA-256,
// а файлы, снятые с публикации (revoked), не ставятся вовсе.
//
// Второй источник — GitHub: .hmod из последнего релиза репозитория, которого ещё нет в реестре.
//
// Раскладка в папке сборки — как у официального лаунчера Horizon:
//   horizon-mods/<id>.hmod     мод включён строкой mod.<id>:true в horizon-mods.txt
//   resourcepacks/<файл>.zip   ресурспак
//   shaderpacks/<файл>.hshader шейдерпак
//   horizon-packs/<id>/        сборка .hpack и её моды
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const AdmZip = require('adm-zip');
const { dirs } = require('./paths');
const { fetchJson, fetchBuffer, downloadFile } = require('./http');
const store = require('./store');
const instances = require('./instances');
const rust = require('./rust');

const INDEX_URL = 'https://horizon-rust.github.io/horizon-mods/index.json';
const SITE = 'https://playhorizon.dev/mods/';
const GH = 'https://api.github.com';
const PAGE = 24;
const INDEX_TTL = 10 * 60 * 1000;

const MODS_DIR = 'horizon-mods';
const STATE_FILE = 'horizon-mods.txt';
const RECORD_FILE = 'horizon-mods.json';
const DOWNLOADS = 'mod-browser/downloads';
const EXT_RE = /\.(hmod|hnmod)$/i;

let indexCache = null;

/* ================= Реестр ================= */

async function index(fresh = false) {
  if (!fresh && indexCache && Date.now() - indexCache.t < INDEX_TTL) return indexCache.data;
  let data;
  try {
    data = await fetchJson(INDEX_URL);
  } catch (e) {
    throw new Error(`Не удалось получить реестр Horizon: ${e.message}`);
  }
  if (!data || !Array.isArray(data.projects)) throw new Error('Реестр Horizon вернул неожиданный ответ');
  // Схема новее — читать нельзя: поля могли измениться
  if (Number(data.schema) > 1) throw new Error('Реестр Horizon новее этой версии лаунчера. Обновите EMBER');
  indexCache = { t: Date.now(), data };
  return data;
}

function kindsOf(kind) {
  if (kind === 'mod') return ['mod', 'native-mod'];
  if (kind === 'resourcepack' || kind === 'shader' || kind === 'modpack') return [kind];
  return ['mod', 'native-mod'];
}

const CAP_LABEL = {
  'game-read': 'видеть игрока',
  hud: 'рисовать HUD',
  render: 'рисовать на экране',
  chat: 'писать в чат',
  command: 'запускать команды',
  storage: 'хранить файлы',
  ui: 'свои экраны',
  input: 'слушать клавиши',
  recipes: 'показывать рецепты',
};

function capsText(caps) {
  if (!Array.isArray(caps) || !caps.length) return '';
  return 'Может: ' + caps.map(c => CAP_LABEL[c] || c).join(', ');
}

// .hmod — это zip с horizon-mod.toml. По манифесту проверяем, что файл тот, за который себя выдаёт,
// и берём настоящий id, имя и версию (важно для ссылок и GitHub, где имя файла произвольное).
function readModManifest(file) {
  try {
    const zip = new AdmZip(file);
    const entry = zip.getEntry('horizon-mod.toml');
    if (!entry) return null;
    const text = zip.readAsText('horizon-mod.toml');
    const get = key => {
      const m = new RegExp(`^\\s*${key}\\s*=\\s*\"([^\"]*)\"`, 'm').exec(text);
      return m ? m[1] : '';
    };
    const caps = /capabilities\s*=\s*\[([^\]]*)\]/.exec(text);
    return {
      id: get('id'),
      name: get('name'),
      version: get('version'),
      api: get('api'),
      side: get('side'),
      capabilities: caps ? [...caps[1].matchAll(/"([^"]+)"/g)].map(m => m[1]) : [],
    };
  } catch (_) {
    return null;
  }
}

function versionOf(p) {
  return (p.versions && p.versions[0]) || null;
}

function toItem(p) {
  const v = versionOf(p) || {};
  const file = v.file || {};
  const caps = capsText(v.capabilities);
  return {
    source: 'horizon',
    kind: p.kind === 'native-mod' ? 'mod' : p.kind,
    registryKind: p.kind,
    id: p.id,
    slug: p.id,
    title: p.name,
    description: p.summary || '',
    icon: p.icon || '',
    downloads: typeof p.downloads === 'number' ? p.downloads : null,
    author: (p.authors && p.authors[0]) || '',
    url: SITE + p.id,
    version: v.version || '',
    game: v.game || '',
    signed: !!p.key,
    meta: [p.signed === false ? '' : '', caps].filter(Boolean).join(' · '),
    fileSize: file.size || 0,
  };
}

async function search({ query = '', kind = 'mod', offset = 0 } = {}) {
  const idx = await index();
  const kinds = kindsOf(kind);
  const q = String(query || '').trim().toLowerCase();
  const all = idx.projects
    .filter(p => kinds.includes(p.kind))
    .filter(p => !q || [p.name, p.summary, p.description, p.id, (p.authors || []).join(' ')]
      .join(' ').toLowerCase().includes(q))
    .sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
  const items = all.slice(offset, offset + PAGE).map(toItem);
  return { items, hasMore: offset + PAGE < all.length, total: all.length };
}

async function projectById(id) {
  const idx = await index();
  return idx.projects.find(p => p.id === id) || null;
}

function revokedReason(idx, id, sha256) {
  const hit = (idx.revoked || []).find(r => r.id === id && (!r.sha256 || r.sha256 === sha256));
  return hit ? (hit.reason || 'файл снят с публикации') : '';
}

/* ================= Учёт установленного ================= */

function recordFile(gameDir) {
  return path.join(gameDir, RECORD_FILE);
}

function readRecord(gameDir) {
  try {
    const data = JSON.parse(fs.readFileSync(recordFile(gameDir), 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch (_) {
    return {};
  }
}

function writeRecord(gameDir, data) {
  fs.mkdirSync(gameDir, { recursive: true });
  fs.writeFileSync(recordFile(gameDir), JSON.stringify(data, null, 2), 'utf8');
}

function setRecord(gameDir, id, entry) {
  const data = readRecord(gameDir);
  data[id] = { ...(data[id] || {}), ...entry, installedAt: Date.now() };
  writeRecord(gameDir, data);
}

function dropRecord(gameDir, id) {
  const data = readRecord(gameDir);
  if (!(id in data)) return;
  delete data[id];
  writeRecord(gameDir, data);
}

/* ================= horizon-mods.txt ================= */

function stateFile(gameDir) {
  return path.join(gameDir, STATE_FILE);
}

function readStateLines(gameDir) {
  try {
    return fs.readFileSync(stateFile(gameDir), 'utf8').split(/\r?\n/);
  } catch (_) {
    return [];
  }
}

// Включённые моды: строка mod.<id>:true. Нет строки — мод выключен (так игра и считает).
function readEnabled(gameDir) {
  const map = new Map();
  for (const line of readStateLines(gameDir)) {
    const m = /^mod\.([a-z0-9_]+)\s*:\s*(true|false)\s*$/i.exec(line.trim());
    if (m) map.set(m[1], m[2].toLowerCase() === 'true');
  }
  return map;
}

// Убирает пустые строки в конце: файл не должен пухнуть от переключений
function compact(lines) {
  const out = lines.filter(l => l.trim() !== '');
  return out;
}

function setEnabled(gameDir, id, on) {
  const lines = compact(readStateLines(gameDir));
  const re = new RegExp(`^mod\\.${id}\\s*:`, 'i');
  const idx = lines.findIndex(l => re.test(l.trim()));
  const line = `mod.${id}:${on ? 'true' : 'false'}`;
  if (idx >= 0) lines[idx] = line;
  else lines.push(line);
  fs.mkdirSync(gameDir, { recursive: true });
  fs.writeFileSync(stateFile(gameDir), lines.join('\n') + '\n', 'utf8');
}

// Убирает и переключатель мода, и его горячие клавиши
function forget(gameDir, id) {
  const lines = compact(readStateLines(gameDir)).filter(l => {
    const t = l.trim();
    if (!t) return false;
    return !new RegExp(`^(mod\\.${id}\\s*:|key\\.${id}\\.)`, 'i').test(t);
  });
  if (!lines.length) {
    fs.rmSync(stateFile(gameDir), { force: true });
    return;
  }
  fs.writeFileSync(stateFile(gameDir), lines.join('\n') + '\n', 'utf8');
}

/* ================= Установка ================= */

function safeName(name) {
  const base = path.basename(String(name || ''));
  if (!base || base === '.' || base === '..' || /[\\/]/.test(name)) throw new Error('Некорректное имя файла');
  return base;
}

function requireHorizon(inst) {
  if (!inst) throw new Error('Выберите сборку Minecraft на Rust');
  const platform = instances.platformOf(inst);
  if (platform === 'rustcraft') {
    throw new Error('Rustcraft не поддерживает моды. Создайте сборку Horizon — у него свой реестр модов');
  }
  if (platform !== 'horizon') {
    throw new Error(`«${inst.name}» — сборка Java Edition. Моды .hmod работают только в Horizon`);
  }
  return inst;
}

// Скачивает файл записи реестра в папку загрузок сборки и сверяет размер и SHA-256
async function fetchEntryFile(inst, idx, p, v) {
  const gameDir = instances.getGameDir(inst);
  const file = v.file || {};
  if (!file.url) throw new Error(`«${p.name}»: в реестре нет ссылки на файл`);
  const revoked = revokedReason(idx, p.id, file.sha256);
  if (revoked) throw new Error(`«${p.name}» снят с публикации: ${revoked}`);
  if (!file.sha256) throw new Error(`«${p.name}»: реестр не отдал контрольную сумму, установка отменена`);

  const name = safeName(file.name || `${p.id}${path.extname(file.url) || '.hmod'}`);
  const tmp = path.join(gameDir, DOWNLOADS, name);
  await downloadFile(file.url, tmp, { sha256: file.sha256, overallMs: 30 * 60 * 1000 });
  const size = fs.statSync(tmp).size;
  if (file.size && size !== file.size) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`«${p.name}»: размер файла не совпал с реестром`);
  }
  // Манифест внутри мода должен совпадать с записью реестра (то же делают проверки Horizon)
  const manifest = readModManifest(tmp);
  if (manifest && manifest.id && manifest.id !== p.id) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`«${p.name}»: внутри файла мод «${manifest.id}», а не «${p.id}» — установка отменена`);
  }
  return { tmp, name, file, manifest };
}

function placeMod(inst, p, ext, tmp, v, name) {
  const gameDir = instances.getGameDir(inst);
  const modsDir = path.join(gameDir, MODS_DIR);
  fs.mkdirSync(modsDir, { recursive: true });
  const destName = `${p.id}${ext}`;
  fs.copyFileSync(tmp, path.join(modsDir, destName));
  setEnabled(gameDir, p.id, true);
  setRecord(gameDir, p.id, {
    title: p.name, version: v.version || '', file: destName, kind: p.kind,
    sha256: (v.file && v.file.sha256) || '', source: 'horizon',
  });
  return destName;
}

async function install(inst, item) {
  requireHorizon(inst);
  const idx = await index(true).catch(() => index());
  const p = idx.projects.find(x => x.id === item.id);
  if (!p) throw new Error(`«${item.title || item.id}» больше нет в реестре Horizon`);
  const v = versionOf(p);
  if (!v) throw new Error(`У «${p.name}» нет версий в реестре`);
  const gameDir = instances.getGameDir(inst);
  const { tmp, name, manifest } = await fetchEntryFile(inst, idx, p, v);

  if (p.kind === 'mod' || p.kind === 'native-mod') {
    const ext = path.extname(name).toLowerCase() || (p.kind === 'native-mod' ? '.hnmod' : '.hmod');
    if (manifest && manifest.version) v.version = manifest.version;
    placeMod(inst, p, ext, tmp, v, name);
    return { installed: [`${p.id}${ext}`], note: `${p.name} ${v.version} установлен и включён. Перезапустите игру, чтобы мод подхватился.` };
  }

  if (p.kind === 'resourcepack') {
    const dir = path.join(gameDir, 'resourcepacks');
    await fsp.mkdir(dir, { recursive: true });
    await fsp.rename(tmp, path.join(dir, name));
    setRecord(gameDir, p.id, { title: p.name, version: v.version || '', file: name, kind: p.kind, sha256: v.file.sha256 });
    return { installed: [name], note: 'Ресурспак положен в сборку. Включите его в игре: Options → Resource Packs.' };
  }

  if (p.kind === 'shader') {
    const dir = path.join(gameDir, 'shaderpacks');
    await fsp.mkdir(dir, { recursive: true });
    await fsp.rename(tmp, path.join(dir, name));
    setRecord(gameDir, p.id, { title: p.name, version: v.version || '', file: name, kind: p.kind, sha256: v.file.sha256 });
    return { installed: [name], note: 'Шейдерпак положен в shaderpacks сборки: выбирается в игре.' };
  }

  throw new Error(`«${p.name}»: такой тип (${p.kind}) эта версия лаунчера не ставит`);
}

/* ================= Сборки .hpack ================= */

// Манифест пака — TOML. Читаем только нужные поля, чтобы не тащить парсер целиком.
function parsePackManifest(text) {
  const out = { mods: [] };
  const blocks = String(text || '').split(/\[\[mods\]\]/).slice(1);
  for (const b of blocks) {
    const get = key => {
      const m = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, 'm').exec(b);
      return m ? m[1] : '';
    };
    const on = /^\s*on\s*=\s*(true|false)/m.exec(b);
    const id = get('id');
    if (!id) continue;
    out.mods.push({ id, version: get('version'), sha256: get('sha256'), on: on ? on[1] === 'true' : true });
  }
  return out;
}

function extractOverrides(zip, dir) {
  const root = path.resolve(dir);
  for (const e of zip.getEntries()) {
    if (e.isDirectory || !e.entryName.startsWith('overrides/')) continue;
    const rel = e.entryName.slice('overrides/'.length);
    const dest = path.resolve(root, rel);
    if (dest !== root && !dest.startsWith(root + path.sep)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, e.getData());
  }
}

async function installPack(packId) {
  const idx = await index(true).catch(() => index());
  const p = idx.projects.find(x => x.id === packId);
  if (!p) throw new Error('Сборка не найдена в реестре Horizon');
  const v = versionOf(p);
  if (!v || !v.file) throw new Error(`У «${p.name}» нет файла сборки`);

  const game = v.game || (rust.platform('horizon') || {}).game || '26.3';
  const inst = instances.create({
    name: p.name,
    version: game,
    platform: 'horizon',
    loader: 'horizon',
    loaderVersion: '',
  });
  const gameDir = instances.getGameDir(inst);
  const packDir = path.join(gameDir, 'horizon-packs', p.id);
  await fsp.mkdir(packDir, { recursive: true });

  const revoked = revokedReason(idx, p.id, v.file.sha256);
  if (revoked) throw new Error(`Сборка снята с публикации: ${revoked}`);

  const packName = safeName(v.file.name || `${p.id}.hpack`);
  const packFile = path.join(packDir, packName);
  await downloadFile(v.file.url, packFile, { sha256: v.file.sha256 || undefined, overallMs: 60 * 60 * 1000 });

  const zip = new AdmZip(packFile);
  extractOverrides(zip, gameDir);
  const entry = zip.getEntry('horizon-modpack.toml');
  const manifest = entry ? parsePackManifest(zip.readAsText('horizon-modpack.toml')) : { mods: [] };
  // Реестр отдаёт список модов пака в requires: он надёжнее манифеста
  const wanted = (v.requires && v.requires.length)
    ? v.requires.map(r => ({ id: r.id, version: r.version, sha256: r.sha256, on: true }))
    : manifest.mods;

  const installed = [];
  const skipped = [];
  for (const m of wanted) {
    const mp = idx.projects.find(x => x.id === m.id);
    if (!mp) { skipped.push(`${m.id}: нет в реестре`); continue; }
    const mv = (mp.versions || []).find(x => !m.version || x.version === m.version) || versionOf(mp);
    if (!mv || !mv.file) { skipped.push(`${m.id}: нет файла`); continue; }
    if (m.sha256 && mv.file.sha256 && m.sha256 !== mv.file.sha256) {
      skipped.push(`${m.id}: версия в паке отличается от реестра`);
      continue;
    }
    try {
      const { tmp, name } = await fetchEntryFile(inst, idx, mp, mv);
      const ext = path.extname(name).toLowerCase() || '.hmod';
      placeMod(inst, mp, ext, tmp, mv, name);
      setEnabled(gameDir, mp.id, m.on !== false);
      installed.push(`${mp.id}${ext}`);
    } catch (e) {
      skipped.push(`${m.id}: ${e.message}`);
    }
  }

  fs.writeFileSync(path.join(packDir, 'pack.json'), JSON.stringify({
    id: p.id, name: p.name, version: v.version, game,
    file: packName, sha256: v.file.sha256 || '', mods: installed, skipped, at: Date.now(),
  }, null, 2), 'utf8');

  const note = skipped.length
    ? `Сборка установлена. Пропущены: ${skipped.join('; ')}`
    : `Сборка «${p.name}» установлена: ${installed.length} мод(ов)`;
  return { instance: inst, note };
}

/* ================= GitHub (.hmod вне реестра) ================= */

function ghHeaders() {
  const h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const t = store.get('githubToken');
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

async function githubSearch({ query = '', offset = 0 } = {}) {
  const page = Math.floor(offset / PAGE) + 1;
  const q = encodeURIComponent(`${String(query || '').trim()} horizon mod minecraft in:name,description,topics`.trim());
  const r = await fetchJson(`${GH}/search/repositories?q=${q}&sort=stars&order=desc&per_page=${PAGE}&page=${page}`, { headers: ghHeaders() });
  return {
    items: (r.items || []).map(p => ({
      source: 'horizon-github', kind: 'mod', id: p.full_name, slug: p.full_name,
      title: p.name, description: p.description || '', icon: p.owner && p.owner.avatar_url,
      downloads: p.stargazers_count, author: p.owner && p.owner.login, url: p.html_url,
      meta: 'Вне реестра: файл берётся из последнего релиза',
    })),
    hasMore: offset + PAGE < Math.min(r.total_count || 0, 1000),
    total: r.total_count || 0,
  };
}

async function installGithub(inst, item) {
  requireHorizon(inst);
  let rel;
  try {
    rel = await fetchJson(`${GH}/repos/${item.id}/releases/latest`, { headers: ghHeaders() });
  } catch (e) {
    throw new Error(`«${item.title}»: нет релиза на GitHub или исчерпан лимит запросов (${e.message})`);
  }
  const assets = (rel.assets || []).filter(a => EXT_RE.test(a.name));
  if (!assets.length) throw new Error(`В последнем релизе «${item.title}» нет файла .hmod`);
  const asset = assets[0];
  const gameDir = instances.getGameDir(inst);
  const tmp = path.join(gameDir, DOWNLOADS, safeName(asset.name));
  await downloadFile(asset.browser_download_url, tmp, { overallMs: 30 * 60 * 1000 });
  const manifest = readModManifest(tmp);
  const id = (manifest && manifest.id) || safeName(asset.name).replace(EXT_RE, '');
  const ext = path.extname(asset.name).toLowerCase();
  const modsDir = path.join(gameDir, MODS_DIR);
  fs.mkdirSync(modsDir, { recursive: true });
  const destName = `${id}${ext}`;
  fs.copyFileSync(tmp, path.join(modsDir, destName));
  setEnabled(gameDir, id, true);
  setRecord(gameDir, id, {
    title: (manifest && manifest.name) || item.title,
    version: (manifest && manifest.version) || rel.tag_name || '',
    file: destName, kind: 'mod', source: 'horizon-github',
  });
  return {
    installed: [destName],
    note: 'Файл взят с GitHub, а не из реестра Horizon: проверьте, что автору можно доверять.',
  };
}

/* ================= Состояние и список модов сборки ================= */

async function states(inst, items) {
  const out = {};
  if (!inst || !Array.isArray(items)) return out;
  const gameDir = instances.getGameDir(inst);
  const rec = readRecord(gameDir);
  let idx = null;
  try { idx = await index(); } catch (_) { /* без сети показываем «установлено» */ }
  for (const it of items) {
    if (!it || (it.source !== 'horizon' && it.source !== 'horizon-github')) continue;
    if (it.kind !== 'mod') continue;
    const key = `${it.source}:${it.id}`;
    const r = rec[it.id];
    const present = !!(r && r.file && fs.existsSync(path.join(gameDir, MODS_DIR, r.file)));
    if (!present) { out[key] = 'none'; continue; }
    let latest = '';
    if (idx) {
      const p = idx.projects.find(x => x.id === it.id);
      const v = p && versionOf(p);
      latest = (v && v.version) || '';
    }
    out[key] = latest && r.version && latest !== r.version ? 'outdated' : 'current';
  }
  return out;
}

function listMods(inst) {
  const gameDir = instances.getGameDir(inst);
  const dir = path.join(gameDir, MODS_DIR);
  if (!fs.existsSync(dir)) return { list: [], hidden: 0 };
  const rec = readRecord(gameDir);
  const enabled = readEnabled(gameDir);
  const list = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && EXT_RE.test(e.name))
    .map(e => {
      const id = e.name.replace(EXT_RE, '');
      const st = fs.statSync(path.join(dir, e.name));
      const r = rec[id] || {};
      return {
        file: e.name,
        name: r.title || id,
        id,
        version: r.version || '',
        enabled: enabled.get(id) !== false,
        size: st.size,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return { list, hidden: 0 };
}

function modFile(inst, file) {
  const name = safeName(file);
  if (!EXT_RE.test(name)) throw new Error('Это не файл мода Horizon');
  return path.join(instances.getGameDir(inst), MODS_DIR, name);
}

function setModEnabled(inst, file, on) {
  const full = modFile(inst, file);
  if (!fs.existsSync(full)) throw new Error('Файл мода не найден');
  setEnabled(instances.getGameDir(inst), path.basename(file).replace(EXT_RE, ''), on);
  return true;
}

function deleteMod(inst, file) {
  const full = modFile(inst, file);
  const id = path.basename(file).replace(EXT_RE, '');
  fs.rmSync(full, { force: true });
  forget(instances.getGameDir(inst), id);
  dropRecord(instances.getGameDir(inst), id);
  return true;
}

// Регистрирует уже положенный в horizon-mods файл: включает мод и запоминает его для списка
function registerExternal(inst, { id, file, title = '', version = '', source = 'link' }) {
  const gameDir = instances.getGameDir(inst);
  setEnabled(gameDir, id, true);
  setRecord(gameDir, id, { title: title || id, version, file, kind: 'mod', source });
  return true;
}

module.exports = {
  index, search, install, installPack, states, listMods, setModEnabled, deleteMod,
  githubSearch, installGithub, requireHorizon, parsePackManifest, registerExternal, readModManifest,
};
