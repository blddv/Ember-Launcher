const fs = require('fs');
const path = require('path');
const { dirs } = require('./paths');
const secure = require('./secure');

const FILE = path.join(dirs.base, 'launcher.json');

const DEFAULTS = {
  // Игра
  ram: 4096,
  javaPath: '',
  jvmArgs: '',
  gcPreset: 'g1',           // g1 | zgc | parallel | serial | none
  width: 1280,
  height: 720,
  fullscreen: false,
  closeOnLaunch: false,     // свернуть лаунчер после старта игры
  showLogOnLaunch: false,   // сразу открыть лог на главной
  hideOnClose: true,        // при закрытии окна сворачивать в трей, а не убивать игру
  rustPlayerName: '',       // ник в Minecraft на Rust (Horizon --name, Rustcraft)
  // Интерфейс
  animations: true,
  // Ключи и токены
  curseforgeKey: '',
  githubToken: '',          // необязательно: поднимает лимит GitHub API
  // Аккаунты (мультиаккаунтинг): массив, выбранный — selectedAccount
  accounts: [],
  selectedAccount: null,
  clientToken: '',
  // Сборки
  selectedInstance: null,
  instances: [],            // { id, name, version, loader, loaderVersion, createdAt, playMs, lastPlayed }
  // Производительность: пресет применяется при каждом запуске сборки
  perf: {
    preset: 'standard',     // standard | optimized | potato
    installMods: true,      // ставить пакет модов-оптимизаторов
  },
  // Orange Visuals: мод работает внутри игры. Здесь задаются начальные значения
  // и папка музыки; дальше визуалы меняются в игре в меню мода (R SHIFT по умолчанию).
  orangeVisuals: {
    enabled: true,
    menuKey: 344,           // GLFW-код клавиши меню: 344 — R SHIFT
    zoomKey: 67,            // GLFW-код клавиши зума: 67 — C
    customFov: false,
    fov: 90,
    hudPing: false,
    hudPotions: false,
    watermark: false,
    musicFolder: '',        // пусто — папка <данные>/music
    hudFps: true,
    hudCoords: true,
    hudDirection: true,
    hudClock: false,
    hudMemory: false,
    hudCps: false,
    hudNowPlaying: true,
    hudToasts: true,
    hudScale: 1.0,
    hudCorner: 0,
    crosshairDot: false,
    menuOnShift: true,
    zoom: true,
    zoomFactor: 0.25,
    warm: false,
    warmStrength: 0.3,
    vignette: false,
    vignetteStrength: 0.5,
    music: true,
    musicAutoplay: true,
    musicShuffle: false,
    musicRepeat: 'all',     // off | all | one
    musicVolume: 0.6,
  },
};

let data = null;

function clone(v) { return JSON.parse(JSON.stringify(v)); }

// Аккаунт без секретов (то, что можно показывать интерфейсу)
function publicAccount(acc) {
  return secure.publicAccount(acc);
}

function load() {
  if (data) return data;
  fs.mkdirSync(dirs.base, { recursive: true });
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { /* первый запуск */ }
  data = {
    ...clone(DEFAULTS),
    ...raw,
    orangeVisuals: { ...DEFAULTS.orangeVisuals, ...(raw.orangeVisuals || {}) },
    perf: { ...DEFAULTS.perf, ...(raw.perf || {}) },
  };
  // Старые поля плеера лаунчера (music.folder) переносим в Orange Visuals
  if (raw.music && raw.music.folder && !data.orangeVisuals.musicFolder) {
    data.orangeVisuals.musicFolder = raw.music.folder;
  }
  delete data.music;

  // Миграция одиночного аккаунта (старый формат) в массив accounts
  let accounts = [];
  if (raw.accountsSecure) accounts = secure.decrypt(raw.accountsSecure) || [];
  else if (Array.isArray(raw.accounts)) accounts = raw.accounts;
  else if (raw.account) accounts = [migrateAccount(raw.account)];
  else if (raw.accountSecure) accounts = [migrateAccount(secure.decrypt(raw.accountSecure))];
  accounts = (accounts || []).filter(Boolean).map(a => ({ ...a, id: a.id || accountId(a) }));
  data.accounts = accounts;
  data.selectedAccount = raw.selectedAccount
    || (accounts.length ? accounts[0].id : null);

  delete data.account;        // единственный аккаунт больше не хранится отдельно
  delete data.accountSecure;
  return data;
}

function migrateAccount(acc) {
  if (!acc) return null;
  return { ...acc, id: accountId(acc) };
}

// Стабильный id аккаунта: по uuid, если нет — по типу+никнейму
function accountId(acc) {
  if (!acc) return '';
  if (acc.uuid) return `${acc.type || 'acc'}:${acc.uuid}`;
  if (acc.username) return `${acc.type || 'acc'}:${acc.username}`;
  return `${acc.type || 'acc'}:${Math.random().toString(36).slice(2)}`;
}

function save() {
  fs.mkdirSync(dirs.base, { recursive: true });
  // Секреты не пишутся открытым текстом: аккаунты шифруем целиком, токены остаются только в памяти
  const out = { ...data };
  delete out.account;
  delete out.accounts;
  delete out.accountSecure;
  if (Array.isArray(data.accounts) && data.accounts.length) {
    out.accountsSecure = secure.encrypt(data.accounts);
  }
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2), 'utf8');
  // Файл с шифробъектом — только для владельца (на POSIX)
  try { fs.chmodSync(tmp, 0o600); } catch (_) { /* Windows */ }
  fs.renameSync(tmp, FILE);
}

function get(key) { load(); return key ? data[key] : clone(data); }

function set(key, value) {
  load();
  data[key] = value;
  save();
  return data[key];
}

// Частичное обновление. Вложенные блоки (orangeVisuals, perf) сливаются, а не заменяются.
function patch(obj) {
  load();
  for (const [k, v] of Object.entries(obj || {})) {
    if (k === 'orangeVisuals' || k === 'perf') data[k] = { ...data[k], ...v };
    else data[k] = v;
  }
  save();
  return clone(data);
}

/* ================= Мультиаккаунтинг ================= */

function activeAccount() {
  load();
  const list = data.accounts || [];
  if (!list.length) return null;
  const sel = data.selectedAccount;
  return list.find(a => a.id === sel) || list[0];
}

function publicAccounts() {
  return (load().accounts || []).map(publicAccount);
}

// Добавляет или обновляет аккаунт (по id) и делает его активным
function addAccount(acc) {
  load();
  if (!acc || !acc.type) throw new Error('Некорректный аккаунт');
  const id = acc.id || accountId(acc);
  const clean = { ...acc, id };
  const idx = (data.accounts || []).findIndex(a => a.id === id);
  if (idx >= 0) data.accounts[idx] = { ...data.accounts[idx], ...clean };
  else data.accounts.push(clean);
  data.selectedAccount = id;
  save();
  return clean;
}

function updateAccount(acc) {
  load();
  if (!acc || !acc.id) return acc;
  const idx = (data.accounts || []).findIndex(a => a.id === acc.id);
  if (idx >= 0) data.accounts[idx] = { ...data.accounts[idx], ...acc };
  else data.accounts.push(acc);
  save();
  return acc;
}

function selectAccount(id) {
  load();
  if (!data.accounts.find(a => a.id === id)) return;
  data.selectedAccount = id;
  save();
}

function accountById(id) {
  load();
  return (data.accounts || []).find(a => a.id === id) || null;
}

function removeAccount(id) {
  load();
  data.accounts = (data.accounts || []).filter(a => a.id !== id);
  if (data.selectedAccount === id) {
    data.selectedAccount = data.accounts[0] ? data.accounts[0].id : null;
  }
  save();
}

module.exports = {
  get, set, patch, load, DEFAULTS,
  publicAccount, activeAccount, publicAccounts,
  addAccount, updateAccount, selectAccount, removeAccount, accountById, accountId,
};
