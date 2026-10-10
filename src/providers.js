const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const AdmZip = require('adm-zip');
const { dirs } = require('./paths');
const { fetchJson, fetchBuffer, downloadFile, pool } = require('./http');
const store = require('./store');
const instances = require('./instances');
const managed = require('./managed');
const installed = require('./installed');
const { label, MR_LOADER, CF_LOADER, LABEL } = require('./loaders');

const MR = 'https://api.modrinth.com/v2';
const CF = 'https://api.curseforge.com/v1';
const HANGAR = 'https://hangar.papermc.io/api/v1';
const FABRIC_API_ID = 'P7dR8mSH';
const PAGE = 24;

const CF_CLASS = { mod: 6, modpack: 4471, resourcepack: 12 };
const PACK_LOADERS = ['fabric', 'quilt', 'forge', 'neoforge'];

function safeJoin(base, rel) {
  const root = path.resolve(base);
  const p = path.resolve(root, rel);
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error('Небезопасный путь в архиве: ' + rel);
  return p;
}

// Для модов нужен загрузчик. Ванильная сборка модов не запускает, поэтому не ищем и не ставим.
function requireLoader(inst, kind) {
  if (kind !== 'mod') return null;
  if (!inst) throw new Error('Выберите сборку с загрузчиком (Fabric, Quilt, Forge или NeoForge)');
  if (!MR_LOADER[inst.loader]) throw new Error(`В сборке «${inst.name}» нет загрузчика модов. Создайте сборку с Fabric, Quilt, Forge или NeoForge`);
  return inst.loader;
}

/* ================= MODRINTH ================= */

async function mrSearch({ query = '', kind = 'mod', gameVersion, loader, offset = 0 }) {
  const facets = [[`project_type:${kind}`]];
  if (gameVersion) facets.push([`versions:${gameVersion}`]);
  if (loader && kind === 'mod' && MR_LOADER[loader]) facets.push([`categories:${MR_LOADER[loader]}`]);
  const url = `${MR}/search?query=${encodeURIComponent(query)}&limit=${PAGE}&offset=${offset}&index=relevance&facets=${encodeURIComponent(JSON.stringify(facets))}`;
  const r = await fetchJson(url);
  return {
    items: r.hits.map(h => ({
      source: 'modrinth', kind: h.project_type, id: h.project_id, slug: h.slug,
      title: h.title, description: h.description, icon: h.icon_url,
      downloads: h.downloads, author: h.author, url: `https://modrinth.com/${h.project_type}/${h.slug}`,
    })),
    hasMore: offset + PAGE < r.total_hits,
    total: r.total_hits,
  };
}

async function mrPickVersion(projectId, gameVersion, loader) {
  const p = new URLSearchParams();
  if (loader) p.set('loaders', JSON.stringify([loader]));
  if (gameVersion) p.set('game_versions', JSON.stringify([gameVersion]));
  const list = await fetchJson(`${MR}/project/${projectId}/version?${p}`);
  return list[0] || null;
}

async function mrDeps(version, gameVersion, loader, seen, out) {
  for (const d of version.dependencies || []) {
    if (d.dependency_type !== 'required' || !d.project_id || seen.has(d.project_id)) continue;
    seen.add(d.project_id);
    const dv = d.version_id
      ? await fetchJson(`${MR}/version/${d.version_id}`)
      : await mrPickVersion(d.project_id, gameVersion, loader);
    if (!dv) continue;
    const f = dv.files.find(x => x.primary) || dv.files[0];
    out.push({ filename: f.filename, url: f.url, sha1: f.hashes && f.hashes.sha1, label: dv.name });
    await mrDeps(dv, gameVersion, loader, seen, out);
  }
}

// Устанавливает мод/ресурспак (с обязательными зависимостями) в сборку.
// Загрузчик берётся из самой сборки, а не зашит в код.
// opts.managed: все файлы считаются поставленными лаунчером (Fabric API, Orange Visuals, пакет оптимизации).
// По умолчанию скрываются только зависимости: выбранный пользователем мод остаётся видимым.
async function installModrinthFiles(inst, projectId, kind, opts = {}) {
  const gv = inst.version;
  const loader = requireLoader(inst, kind);
  const v = await mrPickVersion(projectId, gv, loader ? MR_LOADER[loader] : null);
  if (!v) throw new Error(`Нет версии для Minecraft ${gv}${loader ? ' / ' + LABEL[loader] : ''}`);
  const f = v.files.find(x => x.primary) || v.files[0];
  const files = [{ filename: f.filename, url: f.url, sha1: f.hashes && f.hashes.sha1, label: v.name }];
  if (kind === 'mod') await mrDeps(v, gv, MR_LOADER[loader], new Set([projectId]), files);
  const folder = kind === 'resourcepack' ? 'resourcepacks' : 'mods';
  const dir = path.join(instances.getGameDir(inst), folder);
  await fsp.mkdir(dir, { recursive: true });
  await pool(files, 4, x => downloadFile(x.url, path.join(dir, x.filename), { sha1: x.sha1 }));
  if (kind === 'mod') {
    const hidden = opts.managed ? files : files.slice(1);
    if (hidden.length) managed.addFiles(inst, hidden.map(x => x.filename));
    // Запоминаем версию и файлы: по ним потом видно, установлен мод или устарел
    managed.addProjects(inst, [{
      id: projectId,
      versionId: v.id || '',
      title: v.name || '',
      files: files.map(x => x.filename),
    }]);
  }
  return files.map(x => x.label);
}

async function installMrpack(file, nameFallback) {
  const zip = new AdmZip(file);
  const index = JSON.parse(zip.readAsText('modrinth.index.json'));
  const deps = index.dependencies || {};
  const mc = deps.minecraft;
  let loader = 'vanilla';
  let loaderVersion = '';
  const map = [['fabric-loader', 'fabric'], ['quilt-loader', 'quilt'], ['forge', 'forge'], ['neoforge', 'neoforge']];
  for (const [key, name] of map) {
    if (deps[key]) { loader = name; loaderVersion = deps[key]; break; }
  }
  const inst = instances.create({ name: index.name || nameFallback, version: mc, loader, loaderVersion });
  const dir = instances.getGameDir(inst);
  const files = index.files.filter(f => !(f.env && f.env.client === 'unsupported'));
  await pool(files, 6, f => {
    const dest = safeJoin(dir, f.path);
    return downloadFile(f.downloads[0], dest, { sha1: f.hashes && f.hashes.sha1 });
  });
  extractOverrides(zip, dir, ['overrides/', 'client-overrides/']);
  return inst;
}

function extractOverrides(zip, dir, prefixes) {
  for (const prefix of prefixes) {
    for (const e of zip.getEntries()) {
      if (e.isDirectory || !e.entryName.startsWith(prefix)) continue;
      const rel = e.entryName.slice(prefix.length);
      const dest = safeJoin(dir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, e.getData());
    }
  }
}

async function installModrinthModpack(projectId) {
  const v = await mrPickVersion(projectId, null, null);
  if (!v) throw new Error('У сборки нет доступных версий');
  const f = v.files.find(x => x.primary) || v.files[0];
  const dest = path.join(dirs.tmp, `${v.id}.mrpack`);
  await downloadFile(f.url, dest);
  return installMrpack(dest, v.name);
}

/* ================= CURSEFORGE ================= */

function cfHeaders() {
  const key = store.get('curseforgeKey');
  if (!key) throw new Error('Для CurseForge нужен API-ключ: откройте Настройки и вставьте ключ с console.curseforge.com');
  return { 'x-api-key': key, Accept: 'application/json' };
}

function cfDownloadUrl(file) {
  if (file.downloadUrl) return file.downloadUrl;
  return `https://edge.forgecdn.net/files/${Math.floor(file.id / 1000)}/${file.id % 1000}/${encodeURIComponent(file.fileName)}`;
}

async function cfSearch({ query = '', kind = 'mod', gameVersion, loader, offset = 0 }) {
  const p = new URLSearchParams({
    gameId: '432', classId: String(CF_CLASS[kind]), searchFilter: query,
    pageSize: String(PAGE), index: String(offset), sortField: '2', sortOrder: 'desc',
  });
  if (gameVersion) p.set('gameVersion', gameVersion);
  if (loader && kind === 'mod' && CF_LOADER[loader]) p.set('modLoaderType', String(CF_LOADER[loader]));
  const r = await fetchJson(`${CF}/mods/search?${p}`, { headers: cfHeaders() });
  const pg = r.pagination || {};
  return {
    items: r.data.map(m => ({
      source: 'curseforge', kind, id: m.id, slug: m.slug, title: m.name, description: m.summary,
      icon: m.logo && m.logo.thumbnailUrl, downloads: m.downloadCount,
      author: m.authors && m.authors[0] && m.authors[0].name, url: m.links && m.links.websiteUrl,
    })),
    hasMore: (pg.index || 0) + (pg.resultCount || r.data.length) < (pg.totalCount || 0),
    total: pg.totalCount,
  };
}

async function cfFiles(modId, gameVersion, loaderType) {
  const p = new URLSearchParams();
  if (gameVersion) p.set('gameVersion', gameVersion);
  if (loaderType) p.set('modLoaderType', String(loaderType));
  const r = await fetchJson(`${CF}/mods/${modId}/files?${p}`, { headers: cfHeaders() });
  return r.data.sort((a, b) => (b.fileDate || '').localeCompare(a.fileDate || ''));
}

async function installCurseForgeFiles(inst, modId, kind) {
  const loader = requireLoader(inst, kind);
  const loaderType = loader ? CF_LOADER[loader] : null;
  const files = await cfFiles(modId, inst.version, loaderType);
  const f = files[0];
  if (!f) throw new Error(`Нет файла для Minecraft ${inst.version}${loader ? ' / ' + LABEL[loader] : ''}`);
  const seen = new Set([modId]);
  const out = [{ label: f.displayName || f.fileName, url: cfDownloadUrl(f), fileName: f.fileName, sha1: sha1Of(f) }];
  if (kind === 'mod') {
    const queue = (f.dependencies || []).filter(d => d.relationType === 3);
    for (const d of queue) {
      if (seen.has(d.modId)) continue;
      seen.add(d.modId);
      const df = (await cfFiles(d.modId, inst.version, loaderType))[0];
      if (df) out.push({ label: df.displayName || df.fileName, url: cfDownloadUrl(df), fileName: df.fileName, sha1: sha1Of(df) });
    }
  }
  const folder = kind === 'resourcepack' ? 'resourcepacks' : 'mods';
  const dir = path.join(instances.getGameDir(inst), folder);
  await fsp.mkdir(dir, { recursive: true });
  await pool(out, 4, x => downloadFile(x.url, path.join(dir, x.fileName), { sha1: x.sha1 }));
  return out.map(x => x.label);
}

function sha1Of(file) {
  const h = (file.hashes || []).find(x => x.algo === 1);
  return h ? h.value : undefined;
}

async function installCurseForgeModpack(modId) {
  const files = await cfFiles(modId, null, null);
  const f = files[0];
  if (!f) throw new Error('У сборки нет файлов');
  const dest = path.join(dirs.tmp, `cf-${f.id}.zip`);
  await downloadFile(cfDownloadUrl(f), dest);
  const zip = new AdmZip(dest);
  const manifest = JSON.parse(zip.readAsText('manifest.json'));
  const mc = manifest.minecraft.version;
  const ml = (manifest.minecraft.modLoaders || []).find(x => x.primary) || (manifest.minecraft.modLoaders || [])[0];
  let loader = 'vanilla';
  let loaderVersion = '';
  if (ml) {
    const idx = ml.id.indexOf('-');
    const name = idx > 0 ? ml.id.slice(0, idx) : ml.id;
    if (!PACK_LOADERS.includes(name)) throw new Error(`Загрузчик сборки «${name}» не поддерживается`);
    loader = name;
    loaderVersion = idx > 0 ? ml.id.slice(idx + 1) : '';
  }
  const inst = instances.create({ name: manifest.name, version: mc, loader, loaderVersion });
  const dir = instances.getGameDir(inst);
  const modsDir = path.join(dir, 'mods');

  const ids = manifest.files.filter(x => x.required !== false).map(x => x.fileID);
  const resolved = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await fetchJson(`${CF}/mods/files`, { method: 'POST', headers: cfHeaders(), json: { fileIds: ids.slice(i, i + 50) } });
    resolved.push(...r.data);
  }
  await pool(resolved, 6, f2 => downloadFile(cfDownloadUrl(f2), path.join(modsDir, f2.fileName), { sha1: sha1Of(f2) }));
  extractOverrides(zip, dir, [manifest.overrides ? manifest.overrides + '/' : 'overrides/']);
  return inst;
}

/* ================= HANGAR (плагины Paper) ================= */

async function hangarSearch({ query = '', offset = 0 }) {
  const r = await fetchJson(`${HANGAR}/projects?q=${encodeURIComponent(query)}&limit=${PAGE}&offset=${offset}`);
  const pg = r.pagination || {};
  return {
    items: r.result.map(p => ({
      source: 'hangar', kind: 'plugin', id: p.namespace.slug, slug: p.namespace.slug,
      title: p.name, description: p.description, icon: p.avatarUrl,
      downloads: p.stats && p.stats.downloads, author: p.namespace.owner,
      url: `https://hangar.papermc.io/${p.namespace.owner}/${p.namespace.slug}`,
    })),
    hasMore: pg.totalCount !== undefined ? offset + PAGE < pg.totalCount : r.result.length === PAGE,
    total: pg.totalCount,
  };
}

async function installHangarPlugin(slug) {
  const buf = await fetchBuffer(`${HANGAR}/projects/${slug}/latest?channel=Release&platform=PAPER`);
  const name = buf.toString('utf8').trim().replace(/^"|"$/g, '');
  const dir = path.join(dirs.base, 'server-plugins');
  await fsp.mkdir(dir, { recursive: true });
  const dest = path.join(dir, `${slug}-${name}.jar`);
  await downloadFile(`${HANGAR}/projects/${slug}/versions/${name}/PAPER/download`, dest);
  return dest;
}

/* ================= SMITHED (датапаки и ресурспаки) ================= */

const SMITHED = 'https://api.smithed.dev/v2';

function pickSmithedVersion(pack, gameVersion, kind) {
  const list = (pack.versions || []).filter(v =>
    v.downloads && v.downloads[kind] && (!gameVersion || (v.supports || []).includes(gameVersion)));
  return list[0] || null;
}

function safeName(name) {
  return String(name).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'file';
}

// У API Smithed нет пагинации (параметр offset игнорируется), поэтому показываем одну страницу.
async function smithedSearch({ query = '', kind = 'datapack', gameVersion }) {
  const list = await fetchJson(`${SMITHED}/packs?search=${encodeURIComponent(query)}&limit=${PAGE}`);
  const details = await pool(list, 6, p => fetchJson(`${SMITHED}/packs/${p.id}`).catch(() => null));
  const items = [];
  details.forEach((d, i) => {
    if (!d || !d.display) return;
    if (!pickSmithedVersion(d, gameVersion, kind)) return;
    items.push({
      source: 'smithed', kind, id: list[i].id, slug: list[i].id,
      title: d.display.name, description: d.display.description || '',
      icon: d.display.icon, downloads: null, author: '',
      url: d.display.webPage || (d.display.urls && d.display.urls.homepage) || `https://smithed.dev/packs/${list[i].id}`,
    });
  });
  return { items, hasMore: false, total: items.length };
}

async function installSmithed(inst, item) {
  const pack = await fetchJson(`${SMITHED}/packs/${item.id}`);
  const v = pickSmithedVersion(pack, inst.version, item.kind) || pickSmithedVersion(pack, null, item.kind);
  if (!v) throw new Error('Нет подходящей версии пака');
  const url = v.downloads[item.kind];
  const folder = item.kind === 'datapack' ? 'datapacks' : 'resourcepacks';
  const dir = path.join(instances.getGameDir(inst), folder);
  await fsp.mkdir(dir, { recursive: true });
  const fileName = safeName(`${pack.display.name} ${v.name || ''}`.trim()) + '.zip';
  await downloadFile(url, path.join(dir, fileName));
  const note = item.kind === 'datapack'
    ? 'Датапак сохранён в datapacks сборки. Чтобы он работал, скопируйте файл в папку datapacks нужного мира.'
    : '';
  return { installed: [fileName], note };
}

/* ================= GITHUB (релизы с .jar) ================= */

const GH = 'https://api.github.com';

function ghHeaders() {
  const h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const t = store.get('githubToken');
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

async function githubSearch({ query = '', offset = 0 }) {
  const page = Math.floor(offset / PAGE) + 1;
  const q = encodeURIComponent(`${query} minecraft mod in:name,description,topics`.trim());
  const r = await fetchJson(`${GH}/search/repositories?q=${q}&sort=stars&order=desc&per_page=${PAGE}&page=${page}`, { headers: ghHeaders() });
  return {
    items: r.items.map(p => ({
      source: 'github', kind: 'mod', id: p.full_name, slug: p.full_name,
      title: p.name, description: p.description || '', icon: p.owner && p.owner.avatar_url,
      downloads: p.stargazers_count, author: p.owner && p.owner.login, url: p.html_url,
    })),
    hasMore: offset + PAGE < Math.min(r.total_count || 0, 1000),
    total: r.total_count,
  };
}

async function installGithub(inst, item) {
  let rel;
  try {
    rel = await fetchJson(`${GH}/repos/${item.id}/releases/latest`, { headers: ghHeaders() });
  } catch (e) {
    throw new Error(`«${item.title}»: нет релиза на GitHub или исчерпан лимит запросов (${e.message})`);
  }
  const loader = requireLoader(inst, 'mod');
  const jars = (rel.assets || []).filter(a => a.name.endsWith('.jar') && !/sources|javadoc|-dev/i.test(a.name));
  const matching = jars.filter(a => new RegExp(loader === 'neoforge' ? 'neoforge' : loader === 'forge' ? 'forge' : loader === 'quilt' ? 'quilt' : 'fabric', 'i').test(a.name));
  const pool2 = matching.length ? matching : jars.filter(a => !/fabric|forge|quilt/i.test(a.name));
  if (!pool2.length) throw new Error(`В последнем релизе нет .jar для ${LABEL[loader]}`);
  const mc = inst.version;
  const best = pool2.find(a => a.name.includes(mc)) || pool2[0];
  const dest = path.join(instances.getGameDir(inst), 'mods', safeName(best.name));
  await downloadFile(best.browser_download_url, dest);
  const note = best.name.includes(mc) ? '' : `В названии файла нет версии ${mc}. Проверьте совместимость. Зависимости ставятся отдельно.`;
  return { installed: [best.name], note };
}

/* ================= ПО ССЫЛКЕ (любой сайт) ================= */

async function installLink(url, inst) {
  let u;
  try { u = new URL(url); } catch (_) { throw new Error('Некорректная ссылка'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Нужна ссылка http или https');
  const name = safeName(decodeURIComponent(path.basename(u.pathname)) || 'download');
  const ext = path.extname(name).toLowerCase();

  if (ext === '.mrpack') {
    const tmp = path.join(dirs.tmp, name);
    await downloadFile(url, tmp);
    return { instance: await installMrpack(tmp, name.replace(/\.mrpack$/i, '')) };
  }
  if (!inst) throw new Error('Выберите сборку, в которую ставить файл');
  let folder;
  if (ext === '.jar') folder = 'mods';
  else if (ext === '.zip') folder = 'resourcepacks';
  else throw new Error('Поддерживаются файлы .jar (моды), .zip (ресурспаки) и .mrpack (сборки)');
  if (folder === 'mods') requireLoader(inst, 'mod');
  const dir = path.join(instances.getGameDir(inst), folder);
  await fsp.mkdir(dir, { recursive: true });
  await downloadFile(url, path.join(dir, name));
  return { installed: [name] };
}

/* ================= Общий интерфейс ================= */

// Кэш поиска в памяти: переключение вкладок и возврат к запросу не бьют по API повторно.
const CACHE_TTL = 3 * 60 * 1000;
const CACHE_MAX = 80;
const cache = new Map();

async function search(source, opts = {}) {
  const key = JSON.stringify([source, opts]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_TTL) return hit.data;

  let data;
  if (source === 'modrinth') data = await mrSearch(opts);
  else if (source === 'curseforge') data = await cfSearch(opts);
  else if (source === 'hangar') data = await hangarSearch(opts);
  else if (source === 'smithed') data = await smithedSearch(opts);
  else if (source === 'github') data = await githubSearch(opts);
  else throw new Error('Неизвестный источник');

  cache.set(key, { t: Date.now(), data });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return data;
}

// Состояние модов для списка поиска по файлам в папке mods.
// 'current' — установлен и актуален; 'outdated' — установлен, но Modrinth отдаёт другую версию; 'none' — нет.
// Ключ результата: `${source}:${id}`.
// Результаты проверки версии Modrinth кэшируем: выдача листается, и без кэша запросы повторялись бы
const outdatedCache = new Map(); // ключ -> { t, outdated }
const OUTDATED_TTL = 10 * 60 * 1000;

async function installStates(inst, items) {
  const out = {};
  if (!inst || !Array.isArray(items)) return out;
  const jars = installed.scanJars(inst);
  const recs = installed.validRecords(inst, jars);
  const loader = MR_LOADER[inst.loader] || null;
  const checks = [];
  for (const it of items) {
    if (!it || it.kind !== 'mod') continue;
    const key = `${it.source}:${it.id}`;
    const st = installed.stateOf(inst, it, jars, recs);
    out[key] = st.state;
    if (st.state === 'current' && st.record && st.record.versionId && loader) {
      checks.push({ key, rec: st.record });
    }
  }
  // Проверка новой версии только у уже установленных модов Modrinth
  await pool(checks, 4, async c => {
    const ck = `${c.rec.id}|${c.rec.versionId}|${inst.version}|${loader}`;
    const hit = outdatedCache.get(ck);
    if (hit && Date.now() - hit.t < OUTDATED_TTL) {
      if (hit.outdated) out[c.key] = 'outdated';
      return;
    }
    try {
      const latest = await mrPickVersion(c.rec.id, inst.version, loader);
      const outdated = !!(latest && latest.id !== c.rec.versionId);
      outdatedCache.set(ck, { t: Date.now(), outdated });
      if (outdated) out[c.key] = 'outdated';
    } catch (_) {
      // нет связи с Modrinth: показываем как установленный
    }
  });
  return out;
}

// item: { source, kind, id }
// Не даём поставить мод, который уже есть в сборке (Fabric API, зависимости, уже скачанный мод).
// Если версия устарела, ставим только через обновление (opts.update).
async function guardDuplicate(instance, item, opts = {}) {
  if (!instance || item.kind !== 'mod') return;
  const states = await installStates(instance, [item]);
  const st = states[`${item.source}:${item.id}`];
  if (st === 'current') throw new Error(`«${item.title}» уже установлен в этой сборке`);
  if (st === 'outdated' && !opts.update) throw new Error(`Для «${item.title}» есть новая версия. Нажмите «Обновить»`);
}

// Обновление: сначала ставим актуальную версию, и только потом удаляем файлы старой,
// которых нет в новой записи. Так при сбое загрузки старый мод не теряется.
async function updateModrinth(instance, item) {
  const jars = installed.scanJars(instance);
  const old = installed.validRecords(instance, jars).find(r => r.id === item.id);
  const res = await installModrinthFiles(instance, item.id, item.kind);
  if (old) {
    const fresh = managed.read(instance).projects.find(r => r.id === item.id);
    const now = new Set(fresh ? fresh.files : []);
    installed.removeJars(instance, old.files.filter(f => !now.has(f)));
  }
  return { installed: res };
}

async function install(item, instance, opts = {}) {
  if (item.source === 'modrinth') {
    if (item.kind === 'modpack') return { instance: await installModrinthModpack(item.id) };
    await guardDuplicate(instance, item, opts);
    if (opts.update) return updateModrinth(instance, item);
    return { installed: await installModrinthFiles(instance, item.id, item.kind) };
  }
  if (item.source === 'curseforge') {
    if (item.kind === 'modpack') return { instance: await installCurseForgeModpack(item.id) };
    return { installed: await installCurseForgeFiles(instance, item.id, item.kind) };
  }
  if (item.source === 'hangar') {
    const file = await installHangarPlugin(item.id);
    return { installed: [path.basename(file)], note: `Плагин для Paper-сервера сохранён: ${file}` };
  }
  if (item.source === 'smithed') return installSmithed(instance, item);
  if (item.source === 'github') return installGithub(instance, item);
  if (item.source === 'link') return installLink(item.id, instance);
  throw new Error('Неизвестный источник');
}

module.exports = { search, install, installStates, installMrpack, installModrinthFiles, FABRIC_API_ID, safeJoin, label };
