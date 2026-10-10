const fs = require('fs');
const path = require('path');
const { dirs } = require('./paths');

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
  closeOnLaunch: false,     // закрыть лаунчер после старта игры
  showLogOnLaunch: false,   // сразу открыть лог на главной
  // Интерфейс
  animations: true,
  // Ключи и токены
  curseforgeKey: '',
  githubToken: '',          // необязательно: поднимает лимит GitHub API
  // Аккаунт
  account: null,            // { type: 'offline'|'elyby', username, uuid, accessToken? }
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
  return data;
}

function save() {
  fs.mkdirSync(dirs.base, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
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

module.exports = { get, set, patch, load, DEFAULTS };
