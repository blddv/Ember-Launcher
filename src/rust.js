// Minecraft на Rust: отдельные движки, которые не используют Java.
//
// Horizon — Minecraft Java Edition 26.3, переписанный на Rust (github.com/horizon-rust/horizon).
//   Ставится из релизов GitHub, данные игры готовит horizon-prepare из вашей копии Minecraft 26.3,
//   запускается как самостоятельная программа. Папка игры задаётся переменной HORIZON_HOME.
// Rustcraft — независимый клиент 26.3 на Rust (github.com/neotoxicfr/rustcraft).
//   Работает как замена java.exe: его запускает лаунчер с обычными аргументами игры.
//
// Оба движка живут отдельно от Java-версий: свои папки данных, свои сборки, свои моды.
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawn, execFileSync } = require('child_process');
const AdmZip = require('adm-zip');
const { dirs } = require('./paths');
const { fetchJson, fetchBuffer, downloadFile } = require('./http');
const { ensureJava } = require('./java');
const store = require('./store');

const GH = 'https://api.github.com';

// Описание платформ. Ключ — значение поля loader у сборки.
const PLATFORMS = {
  horizon: {
    id: 'horizon',
    label: 'Horizon',
    full: 'Horizon — Minecraft Java 26.3 на Rust',
    repo: 'horizon-rust/horizon',
    site: 'https://playhorizon.dev',
    docs: 'https://github.com/horizon-rust/horizon',
    game: '26.3',
    mods: true,
    registry: 'https://horizon-rust.github.io/horizon-mods/index.json',
    // Какие файлы релиза подходят текущей системе
    assets: {
      win32: /^horizon-windows-x64\.zip$/i,
      linux: /^horizon-linux-x86_64\.tar\.gz$/i,
      darwin: /^horizon-macos-arm64\.zip$/i,
    },
    clientBin: { win32: 'horizon-client.exe', linux: 'horizon-client', darwin: 'horizon-client' },
    prepareBin: { win32: 'horizon-prepare.exe', linux: 'horizon-prepare', darwin: 'horizon-prepare' },
    homeEnv: 'HORIZON_HOME',
    prepare: 'horizon',
    note: 'Свой реестр модов .hmod. Нужна ваша копия Minecraft Java 26.3: данные игры готовятся один раз.',
  },
  rustcraft: {
    id: 'rustcraft',
    label: 'Rustcraft',
    full: 'Rustcraft — клиент 26.3 на Rust вместо java.exe',
    repo: 'neotoxicfr/rustcraft',
    site: 'https://github.com/neotoxicfr/rustcraft',
    docs: 'https://github.com/neotoxicfr/rustcraft',
    game: '26.3',
    mods: false,
    assets: {
      win32: /^rustcraft-[^/]+-windows-x64\.zip$/i,
      linux: /^rustcraft-[^/]+-linux-x64\.tar\.gz$/i,
    },
    clientBin: { win32: 'rustcraft.exe', linux: 'rustcraft' },
    // Rustcraft запускается вместо java.exe с аргументами обычной игры
    javaExec: true,
    note: 'Модов нет: клиент запускается вместо java.exe. Нужна ваша копия Minecraft Java 26.3.',
  },
};

const RELEASES_TTL = 10 * 60 * 1000;
const releasesCache = new Map(); // platformId -> { t, list }

function platform(id) {
  return PLATFORMS[id] || null;
}

// Все платформы для интерфейса
function list() {
  return Object.values(PLATFORMS).map(p => ({
    id: p.id, label: p.label, full: p.full, game: p.game, mods: p.mods,
    site: p.site, repo: p.repo, note: p.note, javaExec: !!p.javaExec,
  }));
}

function osKey() {
  return process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';
}

// Файл релиза под текущую систему (или null, если платформа её не поддерживает)
function assetFor(p, release) {
  const re = p.assets[osKey()];
  if (!re) return null;
  return (release.assets || []).find(a => re.test(a.name)) || null;
}

function ghHeaders() {
  const h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const t = store.get('githubToken');
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

// Релизы движка, новые сверху. Оставляем только те, где есть файл под нашу ОС.
async function listReleases(id, { fresh = false } = {}) {
  const p = platform(id);
  if (!p) throw new Error(`Неизвестная Rust-платформа: ${id}`);
  const hit = releasesCache.get(id);
  if (!fresh && hit && Date.now() - hit.t < RELEASES_TTL) return hit.list;

  let raw;
  try {
    raw = await fetchJson(`${GH}/repos/${p.repo}/releases?per_page=40`, { headers: ghHeaders() });
  } catch (e) {
    if (e && e.status === 403) throw new Error(`${p.label}: GitHub ограничил запросы. Добавьте токен GitHub в Настройках`);
    if (e && e.status === 404) throw new Error(`${p.label}: репозиторий ${p.repo} недоступен`);
    throw new Error(`${p.label}: не удалось получить список версий (${e.message})`);
  }
  const out = [];
  for (const r of raw) {
    if (r.draft) continue;
    const asset = assetFor(p, r);
    if (!asset) continue;
    out.push({
      id: r.tag_name,
      tag: r.tag_name,
      name: r.name || r.tag_name,
      publishedAt: r.published_at,
      prerelease: !!r.prerelease,
      size: asset.size,
      assetName: asset.name,
      url: asset.browser_download_url,
      platform: id,
    });
  }
  releasesCache.set(id, { t: Date.now(), list: out });
  return out;
}

async function latestRelease(id, opts) {
  const list = await listReleases(id, opts);
  return list[0] || null;
}

function tagDir(part) {
  return String(part).replace(/[^\w.+-]/g, '_');
}

function engineDir(id, tag) {
  return path.join(dirs.runtime, 'rust', id, tagDir(tag));
}

function binPath(p, dir) {
  const name = p.clientBin[osKey()];
  return name ? path.join(dir, name) : null;
}

// Минимальный распаковщик tar.gz для систем без tar: понимает обычные заголовки,
// GNU longname (тип L) и pax-расширение пути (тип x), иначе длинные имена обрезаются.
function untarGz(file, dest) {
  const buf = zlib.gunzipSync(fs.readFileSync(file));
  const readStr = (from, len) => buf.toString('utf8', from, from + len).replace(/\0.*$/, '').trim();
  const root = path.resolve(dest);
  let off = 0;
  let guard = 0;
  let longName = '';
  let paxPath = '';
  const write = (full, data, isDir) => {
    const target = path.resolve(root, full.replace(/^\/+/, ''));
    if (target !== root && !target.startsWith(root + path.sep)) return; // защита от ../ в архиве
    if (isDir) { fs.mkdirSync(target, { recursive: true }); return; }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(data));
  };
  while (off + 512 <= buf.length && guard++ < 200000) {
    const name = readStr(off, 100);
    if (!name) break;
    const size = parseInt(buf.toString('utf8', off + 124, off + 136).replace(/\0/g, ' ').trim(), 8) || 0;
    const type = String.fromCharCode(buf[off + 156] || 48);
    const prefix = readStr(off + 345, 155);
    const raw = prefix ? `${prefix}/${name}` : name;
    off += 512;
    const data = buf.subarray(off, off + size);
    off += Math.ceil(size / 512) * 512;
    if (type === 'L') { longName = data.toString('utf8').replace(/\0.*$/, '').trim(); continue; }
    if (type === 'x') {
      const m = /(?:^|\n)\d+ path=([^\n]*)/.exec(data.toString('utf8'));
      if (m) paxPath = m[1].trim();
      continue;
    }
    if (type === 'g') continue;
    const full = paxPath || longName || raw;
    paxPath = '';
    longName = '';
    if (type === '7' || type === '5') { write(full, null, true); continue; }
    if (type !== '0' && type !== '\0') continue;
    write(full, data, false);
  }
}

async function extractArchive(file, dir) {
  await fsp.mkdir(dir, { recursive: true });
  if (/\.tar\.gz$/i.test(file)) {
    // Системный tar (Windows 10+ тоже его содержит) сохраняет права и длинные имена;
    // если его нет — разбираем архив сами.
    try {
      execFileSync('tar', ['-xzf', file, '-C', dir], { stdio: 'ignore' });
    } catch (_) {
      untarGz(file, dir);
    }
  } else {
    const zip = new AdmZip(file);
    zip.extractAllTo(dir, true);
  }
  // В архивах всё лежит в одной папке (horizon-windows-x64/, rustcraft-0.0.1-.../): поднимаем её содержимое наверх
  const entries = fs.readdirSync(dir).filter(f => f !== '.ember-engine.json');
  if (entries.length === 1) {
    const only = path.join(dir, entries[0]);
    if (fs.statSync(only).isDirectory()) {
      for (const f of fs.readdirSync(only)) {
        await fsp.rename(path.join(only, f), path.join(dir, f));
      }
      await fsp.rm(only, { recursive: true, force: true });
    }
  }
}

// Контрольная сумма архива: у Horizon общий SHA256SUMS, у Rustcraft отдельный файл <архив>.sha256
async function expectedSha(p, release) {
  try {
    if (p.id === 'horizon') {
      const sums = (await fetchBuffer(`https://github.com/${p.repo}/releases/download/${release.tag}/SHA256SUMS`)).toString('utf8');
      const line = sums.split(/\r?\n/).find(l => l.trim().endsWith(release.assetName));
      return line ? line.trim().split(/\s+/)[0].toLowerCase() : null;
    }
    const txt = (await fetchBuffer(`${release.url}.sha256`)).toString('utf8');
    const m = txt.match(/[a-f0-9]{64}/i);
    return m ? m[0].toLowerCase() : null;
  } catch (_) {
    return null; // без суммы: качаем, но проверяем размер
  }
}

// Скачивает и распаковывает движок нужной версии. Возвращает { dir, bin, prepareBin, tag }.
async function ensureEngine(id, tag, report = () => {}, onLog = () => {}) {
  const p = platform(id);
  if (!p) throw new Error(`Неизвестная Rust-платформа: ${id}`);
  if (!p.assets[osKey()] || !p.clientBin[osKey()]) {
    throw new Error(`${p.label} не выпускается для этой системы (${process.platform})`);
  }
  const wanted = tag || (await latestRelease(id)).tag;
  const dir = engineDir(id, wanted);
  const bin = binPath(p, dir);
  const marker = path.join(dir, '.ember-engine.json');

  if (fs.existsSync(bin) && fs.existsSync(marker)) {
    const meta = JSON.parse(await fsp.readFile(marker, 'utf8'));
    return { dir, bin, prepareBin: preparePath(p, dir), tag: meta.tag || wanted, platform: p, meta };
  }

  const release = (await listReleases(id)).find(r => r.tag === wanted)
    || (await listReleases(id, { fresh: true })).find(r => r.tag === wanted);
  if (!release) throw new Error(`${p.label} ${wanted}: релиз не найден для вашей системы`);

  const tmp = path.join(dirs.tmp, 'rust', `${id}-${tagDir(wanted)}-${release.assetName}`);
  report({ stage: p.label, text: `Скачиваю ${release.assetName}…` });
  const sha256 = await expectedSha(p, release);
  await downloadFile(release.url, tmp, {
    sha256: sha256 || undefined,
    attempts: 3,
    overallMs: 30 * 60 * 1000,
    onProgress: (got, total) => {
      if (total) report({ stage: p.label, text: `Загрузка ${release.assetName}`, done: got, total });
    },
  });
  const size = fs.statSync(tmp).size;
  if (release.size && size !== release.size) {
    await fsp.rm(tmp, { force: true });
    throw new Error(`${p.label}: размер файла не совпал (${size} вместо ${release.size})`);
  }

  report({ stage: p.label, text: 'Распаковываю…' });
  await fsp.rm(dir, { recursive: true, force: true });
  await extractArchive(tmp, dir);
  await fsp.rm(tmp, { force: true });

  if (!fs.existsSync(bin)) {
    throw new Error(`${p.label}: в архиве нет ${p.clientBin[osKey()]}`);
  }
  if (process.platform !== 'win32') fs.chmodSync(bin, 0o755);
  const prep = preparePath(p, dir);
  if (prep && process.platform !== 'win32') fs.chmodSync(prep, 0o755);

  await fsp.writeFile(marker, JSON.stringify({
    platform: id, tag: wanted, asset: release.assetName, sha256: sha256 || null, at: Date.now(),
  }, null, 2));
  onLog(`> ${p.label} ${wanted}: ${dir}\n`);
  return { dir, bin, prepareBin: prep, tag: wanted, platform: p };
}

function preparePath(p, dir) {
  const name = p.prepareBin && p.prepareBin[osKey()];
  return name ? path.join(dir, name) : null;
}

// Запуск внешней программы с потоком вывода в лог и прогресс
function run(cmd, args, { cwd, env, report = () => {}, onLog = () => {}, stage = 'Rust' } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, env: env || process.env, windowsHide: true });
    const tail = [];
    const onData = d => {
      const text = d.toString();
      onLog(text);
      for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        tail.push(t);
        if (tail.length > 60) tail.shift();
        report({ stage, text: t.slice(0, 140) });
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', reject);
    proc.on('exit', code => {
      if (code === 0) resolve(tail);
      else reject(new Error(`${path.basename(cmd)} завершился с кодом ${code}:\n${tail.slice(-10).join('\n')}`));
    });
  });
}

// Horizon читает данные игры из своей папки game-files. Их готовит horizon-prepare
// из вашей копии Minecraft 26.3 (клиент, ресурсы и server.jar) и JDK 25.
async function ensurePrepared(p, engine, report = () => {}, onLog = () => {}) {
  if (p.prepare !== 'horizon') return engine;
  const preparedDir = path.join(engine.dir, 'game-files');
  const mark = path.join(engine.dir, '.ember-prepared.json');
  if (fs.existsSync(mark)) {
    try {
      const meta = JSON.parse(fs.readFileSync(mark, 'utf8'));
      if (meta.game === p.game && fs.existsSync(preparedDir)) return engine;
    } catch (_) { /* пересоберём */ }
  }

  const minecraft = require('./minecraft');
  report({ stage: 'Horizon', text: `Проверяю файлы Minecraft ${p.game}…` });
  let json;
  try {
    // Папка данных EMBER устроена как .minecraft (versions/, libraries/, assets/), поэтому
    // horizon-prepare читает её как обычную установку Minecraft
    json = await minecraft.installVersionForRust(p.game, report);
  } catch (e) {
    throw new Error(`Horizon берёт данные из вашей копии Minecraft ${p.game}. Подготовить файлы не удалось: ${e.message}`);
  }
  const server = json.downloads && json.downloads.server;
  if (!server || !server.url) throw new Error(`В версии Minecraft ${p.game} нет server.jar — Horizon не сможет подготовить данные`);

  const serverJar = path.join(dirs.runtime, 'rust', 'horizon', `server-${p.game}.jar`);
  await downloadFile(server.url, serverJar, { sha1: server.sha1, overallMs: 60 * 60 * 1000 });

  const java = await ensureJava(25, report);
  if (!java) throw new Error('Для подготовки Horizon нужна Java 25 (JDK), скачать её не удалось');

  if (!engine.prepareBin) throw new Error('В архиве Horizon нет horizon-prepare');
  report({ stage: 'Horizon', text: 'Готовлю данные игры (один раз, несколько минут)…' });
  try {
    await run(engine.prepareBin, ['--prepare', '--server-jar', serverJar, '--minecraft-dir', dirs.base], {
      cwd: engine.dir,
      env: { ...process.env, PATH: `${path.dirname(java)}${path.delimiter}${process.env.PATH || ''}` },
      report, onLog, stage: 'Horizon',
    });
  } catch (e) {
    // Генератор данных Horizon запускает JVM с -Xmx2G: на слабой машине он падает без внятной причины
    if (/Exporter JVM stopped or timed out|gameplay|OutOfMemory|Killed/i.test(e.message)) {
      const ram = Math.round(os.totalmem() / 1073741824);
      throw new Error(`Horizon не смог подготовить данные игры: не хватило памяти (в системе ${ram} ГБ, `
        + 'генератору нужно около 4 ГБ свободных). Закройте лишние программы и нажмите «Скачать движок» ещё раз — '
        + 'подготовка продолжится с того же места.');
    }
    throw e;
  }

  // Звуки — отдельный необязательный шаг: без него игра запускается молча
  try {
    report({ stage: 'Horizon', text: 'Готовлю звуки…' });
    await run(engine.prepareBin, ['sounds', '--minecraft-dir', dirs.base], {
      cwd: engine.dir,
      env: { ...process.env, PATH: `${path.dirname(java)}${path.delimiter}${process.env.PATH || ''}` },
      report, onLog, stage: 'Horizon',
    });
  } catch (e) {
    onLog(`> звуки не подготовлены: ${e.message}\n`);
  }

  if (!fs.existsSync(preparedDir)) throw new Error('horizon-prepare не создал папку game-files');
  await fsp.writeFile(mark, JSON.stringify({ game: p.game, at: Date.now() }, null, 2));
  return engine;
}

// Запуск Horizon. Rustcraft запускает minecraft.launch с подменой java на свой бинарник.
async function launch({ instance, report = () => {}, onLog = () => {}, onExit = () => {} }) {
  const p = platform(instance.loader);
  if (!p) throw new Error(`Сборка «${instance.name}»: неизвестная Rust-платформа ${instance.loader}`);
  if (p.javaExec) throw new Error(`${p.label} запускается через аргументы игры, а не напрямую`);

  const tag = instance.loaderVersion || (await latestRelease(p.id)).tag;
  report({ stage: p.label, text: `Проверяю ${p.label} ${tag}…` });
  const engine = await ensureEngine(p.id, tag, report, onLog);
  await ensurePrepared(p, engine, report, onLog);

  const gameDir = instance.gameDir;
  fs.mkdirSync(gameDir, { recursive: true });
  const env = { ...process.env };
  if (p.homeEnv) env[p.homeEnv] = gameDir;

  const args = [];
  const resources = path.join(engine.dir, '.local', 'horizon-client', p.game);
  if (fs.existsSync(resources)) args.push('--resources', resources);
  const player = store.get('rustPlayerName');
  if (player) args.push('--name', player);

  report({ stage: 'Запуск', text: `Запускаю ${p.label}…` });
  onLog(`> ${engine.bin} ${args.join(' ')}\n> папка игры: ${gameDir}\n`);
  const proc = spawn(engine.bin, args, { cwd: gameDir, env, windowsHide: false });
  proc.stdout.on('data', d => onLog(d.toString()));
  proc.stderr.on('data', d => onLog(d.toString()));
  proc.on('error', e => onLog(`Ошибка запуска: ${e.message}\n`));
  proc.on('exit', code => onExit(code));
  proc.rustEngine = { platform: p.id, tag: engine.tag };
  return proc;
}

// Бинарник Rustcraft для подмены java.exe
async function javaExecBin(instance, report = () => {}, onLog = () => {}) {
  const p = platform(instance.loader);
  if (!p || !p.javaExec) return null;
  const tag = instance.loaderVersion || (await latestRelease(p.id)).tag;
  const engine = await ensureEngine(p.id, tag, report, onLog);
  return engine.bin;
}

// Что показать на странице «Minecraft Rust»
async function info() {
  const out = [];
  for (const p of Object.values(PLATFORMS)) {
    const row = { ...list().find(x => x.id === p.id), latest: null, releases: [], error: '', engines: [] };
    try {
      const list = await listReleases(p.id);
      row.releases = list.slice(0, 6).map(r => ({ tag: r.tag, name: r.name, publishedAt: r.publishedAt, prerelease: r.prerelease, size: r.size }));
      row.latest = row.releases[0] || null;
    } catch (e) {
      row.error = e.message;
    }
    const base = path.join(dirs.runtime, 'rust', p.id);
    if (fs.existsSync(base)) {
      for (const tag of fs.readdirSync(base)) {
        if (!fs.existsSync(path.join(base, tag, '.ember-engine.json'))) continue;
        let prepared = false;
        try { prepared = fs.existsSync(path.join(base, tag, '.ember-prepared.json')); } catch (_) { /* нет */ }
        row.engines.push({ tag, prepared, path: path.join(base, tag) });
      }
    }
    out.push(row);
  }
  return out;
}

function engineReady(id, tag) {
  const dir = engineDir(id, tag);
  const p = platform(id);
  const bin = binPath(p, dir);
  return !!(bin && fs.existsSync(bin));
}

module.exports = {
  PLATFORMS, list, platform, osKey, listReleases, latestRelease,
  ensureEngine, ensurePrepared, launch, javaExecBin, info, engineReady,
};
