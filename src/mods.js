const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const instances = require('./instances');
const providers = require('./providers');
const managed = require('./managed');

const MOD_JAR = 'orange-visuals.jar';          // имя в папке mods сборки
const DISABLED = '.disabled';
const CONFIG_FILE = 'orangevisuals.json';

// Сборки мода: ключ «загрузчик:версия» -> файл в ресурсах лаунчера.
// Для каждой версии и загрузчика собирается отдельный jar.
const BUILDS = {
  'fabric:1.21.1': 'orange-visuals-fabric-1.21.1.jar',
};
const SUPPORTED_VERSIONS = [...new Set(Object.keys(BUILDS).map(k => k.split(':')[1]))];
const FABRIC_API_RE = /^fabric-api.*\.jar$/i;

function bundledJar(name) {
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'mods', name),
    path.join(__dirname, '..', 'mods', 'build', name),
    path.join(__dirname, '..', 'mods', name),
  ].filter(Boolean);
  return candidates.find(p => fs.existsSync(p)) || null;
}

function sha1(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

function supportState(inst) {
  const key = `${inst.loader}:${inst.version}`;
  if (!BUILDS[key]) {
    if (inst.loader !== 'fabric') return { ok: false, reason: `для ${inst.loader} мод ещё не собран` };
    return { ok: false, reason: `мод для Minecraft ${inst.version} ещё не собран` };
  }
  return { ok: true, build: BUILDS[key] };
}

// Значения по умолчанию для config/orangevisuals.json, если файла ещё нет.
function initialConfig(cfg) {
  return {
    hudFps: cfg.hudFps, hudCoords: cfg.hudCoords, hudDirection: cfg.hudDirection, hudClock: cfg.hudClock,
    hudMemory: cfg.hudMemory, hudCps: cfg.hudCps, hudNowPlaying: cfg.hudNowPlaying, hudToasts: cfg.hudToasts,
    hudScale: cfg.hudScale, hudCorner: cfg.hudCorner, crosshairDot: cfg.crosshairDot, menuOnShift: cfg.menuOnShift,
    zoom: cfg.zoom, zoomFactor: cfg.zoomFactor, warm: cfg.warm, warmStrength: cfg.warmStrength,
    vignette: cfg.vignette, vignetteStrength: cfg.vignetteStrength,
    music: cfg.music, musicAutoplay: cfg.musicAutoplay, musicShuffle: cfg.musicShuffle, musicRepeat: cfg.musicRepeat,
    musicVolume: cfg.musicVolume,
    menuKey: cfg.menuKey, zoomKey: cfg.zoomKey,
    customFov: cfg.customFov, fov: cfg.fov,
    hudPing: cfg.hudPing, hudPotions: cfg.hudPotions, watermark: cfg.watermark,
  };
}

// Синхронизирует Orange Visuals с настройками сборки.
// Включено -> копирует мод и пишет конфиг. Выключено -> удаляет мод из сборки.
// Настройки в игре (меню) сохраняются: лаунчер перезаписывает конфиг только если его нет,
// а клавиши и папку музыки обновляет всегда.
async function syncOrangeVisuals(inst, report = () => {}) {
  const cfg = store.get('orangeVisuals');
  const gameDir = instances.getGameDir(inst);
  const modsDir = path.join(gameDir, 'mods');
  const jar = path.join(modsDir, MOD_JAR);
  const cfgFile = path.join(gameDir, 'config', CONFIG_FILE);

  if (!cfg.enabled) {
    await fsp.rm(jar, { force: true });
    return { active: false, reason: 'выключен в настройках' };
  }
  const state = supportState(inst);
  if (!state.ok) {
    await fsp.rm(jar, { force: true });
    return { active: false, reason: state.reason };
  }

  const src = bundledJar(state.build);
  if (!src) return { active: false, reason: `файл ${state.build} не найден в сборке лаунчера` };
  await fsp.mkdir(modsDir, { recursive: true });
  if (!fs.existsSync(jar) || sha1(jar) !== sha1(src)) {
    report({ stage: 'Мод', text: 'Устанавливаю Orange Visuals…' });
    await fsp.copyFile(src, jar);
  }
  managed.addFiles(inst, [MOD_JAR]);

  await fsp.mkdir(path.dirname(cfgFile), { recursive: true });
  let current = null;
  try { current = JSON.parse(await fsp.readFile(cfgFile, 'utf8')); } catch (_) { /* файла нет */ }
  // Клавиши задаются в лаунчере и применяются при каждом запуске; папку музыки тоже обновляем всегда
  const keys = { menuKey: cfg.menuKey, zoomKey: cfg.zoomKey, musicFolder: cfg.musicFolder || '' };
  const next = current ? { ...current, ...keys } : { ...initialConfig(cfg), ...keys };
  await fsp.writeFile(cfgFile, JSON.stringify(next, null, 2));

  // Fabric API — обязательная зависимость мода на Fabric
  if (inst.loader === 'fabric') {
    const hasApi = fs.readdirSync(modsDir).some(f => FABRIC_API_RE.test(f));
    if (!hasApi) {
      report({ stage: 'Мод', text: 'Ставлю Fabric API (зависимость)…' });
      await providers.installModrinthFiles(inst, providers.FABRIC_API_ID, 'mod', { managed: true });
    }
  }
  return { active: true };
}

function isHidden(inst, name) {
  const base = name.replace(/\.disabled$/i, '');
  if (base === MOD_JAR) return true;
  if (FABRIC_API_RE.test(base)) return true;
  return managed.isManaged(inst, name);
}

// Список модов сборки. Скрыты: Fabric API, Orange Visuals и всё, что поставил сам лаунчер.
function listMods(inst) {
  const dir = path.join(instances.getGameDir(inst), 'mods');
  if (!fs.existsSync(dir)) return { list: [], hidden: 0 };
  let hidden = 0;
  const list = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && /\.jar(\.disabled)?$/i.test(e.name))
    .filter(e => {
      if (isHidden(inst, e.name)) { hidden++; return false; }
      return true;
    })
    .map(e => {
      const enabled = !e.name.endsWith(DISABLED);
      const file = enabled ? e.name : e.name.slice(0, -DISABLED.length);
      const st = fs.statSync(path.join(dir, e.name));
      return {
        file: e.name,
        name: file.replace(/\.jar$/i, '').replace(/[-_]/g, ' '),
        enabled,
        size: st.size,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return { list, hidden };
}

function modPath(inst, file) {
  if (!/^[^\\/]+\.jar(\.disabled)?$/i.test(file)) throw new Error('Некорректное имя файла мода');
  return path.join(instances.getGameDir(inst), 'mods', file);
}

function setModEnabled(inst, file, enabled) {
  const from = modPath(inst, file);
  const base = file.endsWith(DISABLED) ? file.slice(0, -DISABLED.length) : file;
  const to = modPath(inst, enabled ? base : base + DISABLED);
  if (from !== to) fs.renameSync(from, to);
  return true;
}

function deleteMod(inst, file) {
  fs.rmSync(modPath(inst, file), { force: true });
  return true;
}

module.exports = {
  syncOrangeVisuals, supportState, SUPPORTED_VERSIONS, MOD_JAR, BUILDS,
  listMods, setModEnabled, deleteMod,
};
