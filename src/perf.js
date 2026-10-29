// Пресеты производительности для слабых ПК.
// Настройки Minecraft пишутся в options.txt сборки, JVM-флаги добавляются при запуске,
// а моды-оптимизаторы ставятся из Modrinth под загрузчик сборки.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const instances = require('./instances');
const providers = require('./providers');
const managed = require('./managed');
const installedFiles = require('./installed');

const PRESETS = {
  standard: {
    label: 'Обычный',
    desc: 'Лаунчер ничего не меняет: ваши настройки Minecraft и JVM остаются как есть.',
  },
  optimized: {
    label: 'Оптимизировано',
    desc: 'Дистанция прорисовки 10, умеренные частицы, FPS до 120, лёгкие моды-оптимизаторы.',
  },
  potato: {
    label: 'Очень оптимизировано',
    desc: 'Для слабых ПК: дистанция 4, быстрая графика без теней и облаков, 60 FPS, '
      + 'стабильный G1-сборщик мусора, моды-оптимизаторы.',
  },
};

// Что именно меняется в options.txt (ключи Minecraft)
const OPTIONS = {
  optimized: {
    renderDistance: 10,
    simulationDistance: 8,
    graphicsMode: 1,
    particles: 1,
    mipmapLevels: 2,
    entityShadows: true,
    biomeBlendRadius: 2,
    ao: true,
    bobView: true,
    renderClouds: '"fast"',
    entityDistanceScaling: 1.0,
    maxFps: 120,
    enableVsync: false,
  },
  potato: {
    renderDistance: 4,
    simulationDistance: 4,
    graphicsMode: 0,
    particles: 2,
    mipmapLevels: 0,
    entityShadows: false,
    biomeBlendRadius: 0,
    ao: false,
    bobView: false,
    renderClouds: '"false"',
    entityDistanceScaling: 0.5,
    maxFps: 60,
    enableVsync: false,
    narrator: 0,
    directionalAudio: false,
  },
};

// Пакет оптимизации под загрузчик. Состав проверен по Modrinth для 1.21.1 и 26.3.
// Sodium-подобные моды не смешиваются: на NeoForge берём Sodium, а не Embeddium и Radium (конфликтуют).
// Для Forge 1.21.1 Sodium-подобного мода на Modrinth нет, поэтому пакет короче.
// Моды, которых нет для текущей версии Minecraft, пропускаются без ошибки (см. installPack).
const PACK = {
  fabric: ['sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast', 'modernfix', 'dynamic-fps',
    'moreculling', 'ebe'],
  quilt: ['lithium', 'immediatelyfast', 'dynamic-fps', 'moreculling', 'ebe'],
  forge: ['entityculling', 'immediatelyfast', 'dynamic-fps'],
  neoforge: ['sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast', 'modernfix', 'dynamic-fps',
    'moreculling', 'enhanced-block-entities-neoforged'],
  vanilla: [],
};

// JVM-флаги для пресета. Объём памяти приходит из настроек лаунчера, пресет его не меняет.
// Раньше «Очень оптимизировано» добавляло -XX:TieredStopAtLevel=1 и -XX:+UseSerialGC, и это
// давало обратный эффект: игра без JIT-разгона (только C1) держит низкий FPS, а SerialGC
// на многогигабайтной куче Minecraft устраивает долгие паузы сборки мусора — то есть пресет
// лагал сильнее «Оптимизировано». Теперь для него берём обычный G1 и не трогаем JIT: выигрыш
// дают только настройки options.txt и моды-оптимизаторы, а не «облегчение» JVM.
function launchTuning(preset, ram) {
  if (preset === 'potato') {
    return { ram, gc: 'g1', jvm: [] };
  }
  if (preset === 'optimized') {
    return { ram, gc: null, jvm: [] };
  }
  return { ram, gc: null, jvm: [] };
}

// Записывает ключи в options.txt, остальные строки сохраняются
async function applyOptions(gameDir, preset) {
  const values = OPTIONS[preset];
  if (!values) return false;
  const file = path.join(gameDir, 'options.txt');
  let lines = [];
  if (fs.existsSync(file)) lines = (await fsp.readFile(file, 'utf8')).split(/\r?\n/).filter(Boolean);
  const seen = new Set();
  const out = lines.map(line => {
    const i = line.indexOf(':');
    if (i < 0) return line;
    const key = line.slice(0, i);
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      seen.add(key);
      return `${key}:${values[key]}`;
    }
    return line;
  });
  for (const [k, v] of Object.entries(values)) {
    if (!seen.has(k)) out.push(`${k}:${v}`);
  }
  await fsp.mkdir(gameDir, { recursive: true });
  await fsp.writeFile(file, out.join('\n') + '\n');
  return true;
}

// Моды, которые старый пакет ставил вместе и которые теперь конфликтуют (только NeoForge)
const OBSOLETE = { neoforge: ['radium', 'embeddium'] };

// Ставит пакет модов под загрузчик сборки. Ошибки по отдельным модам не останавливают остальные.
async function installPack(inst, report = () => {}) {
  const slugs = PACK[inst.loader] || [];
  if (!slugs.length) return { installed: [], skipped: [], unavailable: [], errors: [], note: 'Для Vanilla моды не ставятся' };
  // Убираем устаревшие моды пакета, но только те jar, которые поставил сам лаунчер (есть в его списке файлов)
  const old = OBSOLETE[inst.loader] || [];
  if (old.length) {
    const own = new Set(managed.read(inst).files);
    const stale = installedFiles.scanJars(inst)
      .filter(j => own.has(j.name) && old.includes(j.prefix))
      .map(j => j.name);
    if (stale.length) {
      installedFiles.removeJars(inst, stale);
      report({ stage: 'Оптимизация', text: `Удалил конфликтующие моды: ${stale.join(', ')}` });
    }
  }
  const done = new Set(managed.read(inst).packs);
  const installed = [];
  const skipped = [];
  const unavailable = [];
  const errors = [];
  for (const slug of slugs) {
    if (done.has(slug)) { skipped.push(slug); continue; }
    report({ stage: 'Оптимизация', text: `Ставлю ${slug}…` });
    try {
      await providers.installModrinthFiles(inst, slug, 'mod', { managed: true });
      managed.addPack(inst, [slug]);
      installed.push(slug);
    } catch (e) {
      // Нет версии под эту версию Minecraft — не ошибка, мод просто пропускается
      if (/^Нет версии/.test(e.message)) unavailable.push(slug);
      else errors.push(`${slug}: ${e.message}`);
    }
  }
  return { installed, skipped, unavailable, errors };
}

// Всё, что нужно при запуске: JVM, память, GC и настройки options.txt
async function prepareLaunch(inst, preset, ram, installMods, report = () => {}) {
  if (!PRESETS[preset] || preset === 'standard') return launchTuning('standard', ram);
  await applyOptions(instances.getGameDir(inst), preset);
  if (installMods) {
    try {
      const r = await installPack(inst, report);
      if (r.errors.length) report({ stage: 'Оптимизация', text: `Не все моды установлены: ${r.errors.length}` });
    } catch (e) {
      report({ stage: 'Оптимизация', text: `Пакет модов не установлен: ${e.message}` });
    }
  }
  return launchTuning(preset, ram);
}

module.exports = { PRESETS, PACK, OPTIONS, launchTuning, applyOptions, installPack, prepareLaunch };
