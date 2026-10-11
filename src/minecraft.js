const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const { dirs } = require('./paths');
const { fetchJson, downloadFile, pool } = require('./http');
const { ensureJava } = require('./java');
const { ensureLoaderProfile } = require('./loaders');

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const LAUNCHER_NAME = 'EMBER Launcher';
const LAUNCHER_VERSION = require('../package.json').version;

let manifestCache = null;
async function getManifest() {
  if (!manifestCache || Date.now() - manifestCache.t > 10 * 60 * 1000) {
    try {
      manifestCache = { t: Date.now(), data: await fetchJson(MANIFEST_URL) };
    } catch (e) {
      throw new Error(`Не удалось загрузить список версий Minecraft: ${e.message}`);
    }
  }
  return manifestCache.data;
}

async function listVersions() {
  const m = await getManifest();
  return m.versions.map(v => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }));
}

function osName() {
  return process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
}
function osArch() {
  return process.arch === 'x64' ? 'x86_64' : process.arch === 'arm64' ? 'arm64' : 'x86';
}

// Правила Mojang: последнее совпавшее правило решает результат; без правил — разрешено.
function ruleAllowed(rules, features = {}) {
  if (!rules || !rules.length) return true;
  let allowed = false;
  for (const r of rules) {
    let match = true;
    if (r.os) {
      if (r.os.name && r.os.name !== osName()) match = false;
      if (r.os.arch && r.os.arch !== osArch()) match = false;
    }
    if (r.features) {
      for (const [k, v] of Object.entries(r.features)) {
        if (!!features[k] !== v) match = false;
      }
    }
    if (match) allowed = r.action === 'allow';
  }
  return allowed;
}

// group:artifact:version[:classifier][@ext] -> относительный путь
function parseName(name) {
  let ext = 'jar';
  let n = name;
  if (n.includes('@')) [n, ext] = n.split('@');
  const [group, artifact, version, classifier] = n.split(':');
  const file = `${artifact}-${version}${classifier ? '-' + classifier : ''}.${ext}`;
  return {
    rel: `${group.replace(/\./g, '/')}/${artifact}/${version}/${file}`,
    key: `${group}:${artifact}${classifier ? ':' + classifier : ''}`,
  };
}

// Нативы бывают для нескольких архитектур (natives-windows и natives-windows-arm64).
// Их dll-файлы имеют одинаковые имена, поэтому брать нужно только свою архитектуру.
function nativeArchMatches(name) {
  const classifier = (name.split(':')[3] || '');
  const m = classifier.match(/^natives-(windows|linux|macos|osx)(?:-(x86_64|x86|arm64|aarch64))?$/);
  if (!m) return true;
  const want = m[2] === 'aarch64' ? 'arm64' : (m[2] || 'x86_64');
  const host = process.arch === 'x64' ? 'x86_64' : process.arch === 'arm64' ? 'arm64' : 'x86';
  return want === host;
}

function resolveLibraries(list, features = {}) {
  const out = [];
  for (const lib of list || []) {
    if (!ruleAllowed(lib.rules, features)) continue;
    const parsed = parseName(lib.name);

    if (lib.natives) {
      const key = lib.natives[osName()];
      if (!key) continue;
      const cls = key.replace('${arch}', process.arch === 'x64' ? '64' : '32');
      const art = lib.downloads && lib.downloads.classifiers && lib.downloads.classifiers[cls];
      if (!art) continue;
      out.push({ key: parsed.key + ':' + cls, rel: art.path, url: art.url, sha1: art.sha1, native: true, classpath: false });
      continue;
    }

    const art = lib.downloads && lib.downloads.artifact;
    if (art) {
      const isNative = /:natives-/.test(lib.name);
      if (isNative && !nativeArchMatches(lib.name)) continue;
      out.push({ key: parsed.key, rel: art.path, url: art.url, sha1: art.sha1, native: isNative, classpath: !isNative });
    } else if (lib.name) {
      // формат Fabric/Quilt/Forge: только name + maven-url
      const base = (lib.url || 'https://libraries.minecraft.net/').replace(/\/?$/, '/');
      out.push({ key: parsed.key, rel: parsed.rel, url: base + parsed.rel, sha1: lib.sha1, native: false, classpath: true });
    }
  }
  return out;
}

async function installLibraries(libs, report) {
  let done = 0;
  await pool(libs, 8, async l => {
    const dest = path.join(dirs.libraries, l.rel);
    // Библиотеки, которые создал установщик Forge/NeoForge, могут не иметь ссылки: берём локальный файл
    if (!l.url) {
      if (!fs.existsSync(dest)) throw new Error(`Нет файла библиотеки ${l.rel}`);
    } else {
      await downloadFile(l.url, dest, { sha1: l.sha1 });
    }
    done++;
    if (done % 10 === 0 || done === libs.length) report({ stage: 'Библиотеки', done, total: libs.length });
  });
}

async function installVersion(id, report = () => {}) {
  const vdir = path.join(dirs.versions, id);
  const jsonPath = path.join(vdir, `${id}.json`);
  let json;
  if (fs.existsSync(jsonPath)) {
    json = JSON.parse(await fsp.readFile(jsonPath, 'utf8'));
  } else {
    const manifest = await getManifest();
    const entry = manifest.versions.find(v => v.id === id);
    if (!entry) throw new Error(`Версия ${id} не найдена в манифесте Mojang`);
    try {
      json = await fetchJson(entry.url);
    } catch (e) {
      throw new Error(`Не удалось загрузить описание версии ${id}: ${e.message}`);
    }
    await fsp.mkdir(vdir, { recursive: true });
    await fsp.writeFile(jsonPath, JSON.stringify(json));
  }

  report({ stage: 'Клиент', text: `Minecraft ${id}` });
  await downloadFile(json.downloads.client.url, path.join(vdir, `${id}.jar`), { sha1: json.downloads.client.sha1 });

  const ai = json.assetIndex;
  const aiPath = path.join(dirs.assets, 'indexes', `${ai.id}.json`);
  await downloadFile(ai.url, aiPath, { sha1: ai.sha1 });
  const assetIndex = JSON.parse(await fsp.readFile(aiPath, 'utf8'));
  const objects = Object.entries(assetIndex.objects);
  let done = 0;
  await pool(objects, 16, async ([, { hash }]) => {
    const sub = hash.slice(0, 2);
    await downloadFile(`https://resources.download.minecraft.net/${sub}/${hash}`,
      path.join(dirs.assets, 'objects', sub, hash), { sha1: hash });
    done++;
    if (done % 100 === 0 || done === objects.length) report({ stage: 'Ресурсы', done, total: objects.length });
  });

  // Библиотеки ставит launch() вместе с библиотеками загрузчика
  return json;
}

function normalizeArgs(json) {
  if (json.arguments) return { game: [...(json.arguments.game || [])], jvm: [...(json.arguments.jvm || [])] };
  const game = (json.minecraftArguments || '').split(' ').filter(Boolean);
  return { game, jvm: ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}'] };
}

// Профиль загрузчика поверх ванильной версии: библиотеки и аргументы объединяются,
// главный класс берётся из загрузчика. Библиотеки загрузчика идут первыми (они важнее).
function mergeProfile(vanilla, profile) {
  if (!profile) return vanilla;
  const v = normalizeArgs(vanilla);
  const p = normalizeArgs(profile);
  return {
    ...vanilla,
    id: profile.id,
    mainClass: profile.mainClass,
    libraries: [...(profile.libraries || []), ...(vanilla.libraries || [])],
    arguments: { game: [...v.game, ...p.game], jvm: [...v.jvm, ...p.jvm] },
  };
}

function buildArgs(json, ctx, features) {
  const sub = s => s.replace(/\$\{([^}]+)\}/g, (m, k) => (ctx[k] !== undefined ? ctx[k] : m));
  const collect = list => {
    const out = [];
    for (const a of list || []) {
      if (typeof a === 'string') out.push(sub(a));
      else if (ruleAllowed(a.rules, features)) {
        (Array.isArray(a.value) ? a.value : [a.value]).forEach(x => out.push(sub(x)));
      }
    }
    return out;
  };
  const args = normalizeArgs(json);
  return { jvm: collect(args.jvm), game: collect(args.game) };
}

// Подпапки natives, на которые ссылаются JVM-аргументы (например ${natives_directory}/lwjgl в 26.2+).
function nativeSubdirs(jvmArgs) {
  const out = new Set();
  for (const a of jvmArgs || []) {
    const m = /\$\{natives_directory\}[\\/]([^\s"]+)/.exec(a);
    if (m) out.add(m[1].replace(/\\/g, '/'));
  }
  return [...out];
}

// Извлекает нативы в корень natives и во все подпапки, которые просит JVM.
async function extractNatives(libs, nativesDir, subdirs = []) {
  await fsp.rm(nativesDir, { recursive: true, force: true });
  const targets = [nativesDir, ...subdirs.map(d => path.join(nativesDir, d))];
  for (const t of targets) await fsp.mkdir(t, { recursive: true });
  for (const l of libs.filter(x => x.native)) {
    const file = path.join(dirs.libraries, l.rel);
    if (!fs.existsSync(file)) continue;
    const zip = new AdmZip(file);
    for (const e of zip.getEntries()) {
      if (e.isDirectory || e.entryName.startsWith('META-INF')) continue;
      if (!/\.(dll|so|dylib|jnilib)$/i.test(e.entryName)) continue;
      for (const t of targets) zip.extractEntryTo(e, t, false, true);
    }
  }
}

// Сборка аргументов сбора GC. Java 21+ поддерживает поколенческий ZGC.
// ZGC есть только в Java 17+. На Java 8 (старые версии Minecraft) флаг -XX:+UseZGC
// делает запуск невозможным, поэтому там используется G1.
function gcArgs(preset, javaMajor) {
  switch (preset) {
    case 'zgc':
      if (javaMajor < 17) return gcArgs('g1', javaMajor);
      return javaMajor >= 21 ? ['-XX:+UseZGC', '-XX:+ZGenerational'] : ['-XX:+UseZGC'];
    case 'parallel': return ['-XX:+UseParallelGC'];
    case 'serial': return ['-XX:+UseSerialGC'];
    case 'none': return [];
    case 'g1':
    default:
      return ['-XX:+UseG1GC', '-XX:MaxGCPauseMillis=50', '-XX:G1HeapRegionSize=32M'];
  }
}

// Подготовка и запуск.
// opts: { instance, account, report, onLog, onExit, extraJvm, jvmArgs, ram, gc, width, height, fullscreen }
async function launch(opts) {
  const {
    instance, account, report = () => {}, onLog = () => {}, onExit = () => {},
    extraJvm = [], jvmArgs = '', ram = 4096, gc = 'g1', width = 1280, height = 720, fullscreen = false,
  } = opts;
  const mc = instance.version;

  report({ stage: 'Minecraft', text: `Подготовка ${mc}…` });
  const vanilla = await installVersion(mc, report);
  const javaMajor = (vanilla.javaVersion && vanilla.javaVersion.majorVersion) || 8;

  const { profile, loaderVersion } = await ensureLoaderProfile(instance, { report, javaMajor });
  const merged = mergeProfile(vanilla, profile);
  const libsAll = resolveLibraries(merged.libraries);
  await installLibraries(libsAll, report);

  const gameDir = instance.gameDir;
  await fsp.mkdir(gameDir, { recursive: true });
  const nativesDir = path.join(dirs.versions, mc, 'natives');
  const subdirs = nativeSubdirs([...normalizeArgs(vanilla).jvm, ...normalizeArgs(merged).jvm]);
  await extractNatives(libsAll, nativesDir, subdirs);

  const sep = process.platform === 'win32' ? ';' : ':';
  const seen = new Set();
  const cpLibs = [];
  for (const l of libsAll) {
    if (!l.classpath || seen.has(l.key)) continue;
    seen.add(l.key);
    cpLibs.push(path.join(dirs.libraries, l.rel));
  }
  // Forge 1.13+ и NeoForge сами подставляют клиент (свой патченный jar из библиотек),
  // ванильный jar в classpath для них даёт конфликт модулей (modlauncher / bootstraplauncher).
  // Ванили, Fabric, Quilt и старый Forge (launchwrapper, до 1.13) ванильный jar нужен.
  const modularLauncher = /modlauncher|bootstraplauncher/i.test(merged.mainClass || '');
  if (!(['forge', 'neoforge'].includes(instance.loader) && modularLauncher)) {
    cpLibs.push(path.join(dirs.versions, mc, `${mc}.jar`));
  }
  const classpath = cpLibs.join(sep);

  const javaBin = await ensureJava(javaMajor, report);

  const ctx = {
    auth_player_name: account.username,
    version_name: merged.id,
    game_directory: gameDir,
    assets_root: dirs.assets,
    assets_index_name: vanilla.assetIndex.id,
    auth_uuid: account.uuid,
    auth_access_token: account.accessToken || '0',
    auth_session: account.accessToken || '0',
    clientid: '',
    auth_xuid: '',
    user_type: account.type === 'elyby' ? 'mojang' : 'legacy',
    version_type: vanilla.type || 'release',
    natives_directory: nativesDir,
    launcher_name: LAUNCHER_NAME,
    launcher_version: LAUNCHER_VERSION,
    classpath,
    library_directory: dirs.libraries,
    classpath_separator: sep,
    user_properties: '{}',
    resolution_width: String(width),
    resolution_height: String(height),
    game_assets: path.join(dirs.assets, 'virtual', 'legacy'),
  };

  const features = { is_demo_user: false, has_custom_resolution: true };
  const built = buildArgs(merged, ctx, features);
  // Старый формат аргументов (minecraftArguments) не знает о правилах разрешения — добавляем сами
  if (!merged.arguments && !built.game.includes('--width')) built.game.push('--width', String(width), '--height', String(height));
  if (fullscreen) built.game.push('--fullscreen');

  const userJvm = jvmArgs.split(/\s+/).filter(Boolean);
  const args = [
    `-Xmx${ram}M`,
    '-Xms512M',
    ...gcArgs(gc, javaMajor),
    ...userJvm,
    ...extraJvm,
    ...built.jvm,
    merged.mainClass,
    ...built.game,
  ];

  report({ stage: 'Запуск', text: 'Запускаю Minecraft…' });
  onLog(`> ${javaBin}\n`);
  if (loaderVersion) onLog(`> загрузчик: ${loaderVersion}\n`);
  const proc = spawn(javaBin, args, { cwd: gameDir, windowsHide: true });
  proc.stdout.on('data', d => onLog(d.toString()));
  proc.stderr.on('data', d => onLog(d.toString()));
  proc.on('error', e => onLog(`Ошибка запуска: ${e.message}\n`));
  proc.on('exit', code => onExit(code));
  proc.loaderVersion = loaderVersion;
  return proc;
}

module.exports = {
  listVersions, launch, getManifest, installVersion, resolveLibraries, nativeArchMatches, nativeSubdirs, mergeProfile, gcArgs,
};
