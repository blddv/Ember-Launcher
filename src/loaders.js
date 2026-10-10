// Загрузчики модов: Fabric, Quilt, Forge, NeoForge.
// Fabric и Quilt отдают готовый профиль JSON. Forge и NeoForge ставятся своим установщиком
// (запуск installer.jar с --installClient), после чего лаунчер читает созданный профиль.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { dirs } = require('./paths');
const { fetchJson, fetchBuffer, downloadFile } = require('./http');
const { ensureJava } = require('./java');

const FABRIC_META = 'https://meta.fabricmc.net/v2';
const QUILT_META = 'https://meta.quiltmc.org/v3';
const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge';
const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge';
const FORGE_PROMOS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';

const LABEL = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };

function label(loader, loaderVersion) {
  const base = LABEL[loader] || loader;
  return loaderVersion && loader !== 'vanilla' ? `${base} ${loaderVersion}` : base;
}

// Тэг Modrinth и id CurseForge для загрузчика
const MR_LOADER = { fabric: 'fabric', quilt: 'quilt', forge: 'forge', neoforge: 'neoforge' };
const CF_LOADER = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };

async function fetchText(url) {
  return (await fetchBuffer(url)).toString('utf8');
}

// versions из maven-metadata.xml, новые — в конце
async function mavenVersions(url) {
  const xml = await fetchText(url);
  return [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map(m => m[1]);
}

// Префикс версии NeoForge для Minecraft: 1.21.1 -> 21.1., 26.1 -> 26.1., 1.20.1 -> 47.1.
function neoPrefix(mc) {
  if (mc === '1.20.1') return '47.1.';
  const m = mc.match(/^1\.(\d+)(?:\.(\d+))?$/);
  if (m) return `${m[1]}.${m[2] || 0}.`;
  const n = mc.match(/^(\d+)\.(\d+)/);
  return n ? `${n[1]}.${n[2]}.` : '';
}

function isStable(v) { return !/beta|alpha|rc|pre|snapshot/i.test(v); }

// Список версий загрузчика для Minecraft. Первый элемент — рекомендуемый.
async function listLoaderVersions(loader, mc) {
  if (loader === 'fabric') {
    const list = await fetchJson(`${FABRIC_META}/versions/loader/${mc}`);
    return list.map(x => x.loader.version);
  }
  if (loader === 'quilt') {
    const list = (await fetchJson(`${QUILT_META}/versions/loader/${mc}`)).map(x => x.loader.version);
    // Сначала стабильные (без «-beta»/«-alpha»), затем предварительные
    return [...list.filter(isStable), ...list.filter(v => !isStable(v))];
  }
  if (loader === 'neoforge') {
    const prefix = neoPrefix(mc);
    const all = (await mavenVersions(`${NEOFORGE_MAVEN}/maven-metadata.xml`))
      .filter(v => prefix && v.startsWith(prefix));
    const stable = all.filter(isStable).reverse();
    return [...stable, ...all.filter(v => !isStable(v)).reverse()];
  }
  if (loader === 'forge') {
    const all = (await mavenVersions(`${FORGE_MAVEN}/maven-metadata.xml`))
      .filter(v => v.startsWith(`${mc}-`))
      .map(v => v.slice(mc.length + 1))
      .reverse();
    let rec = null;
    try {
      const promos = (await fetchJson(FORGE_PROMOS)).promos;
      rec = promos[`${mc}-recommended`] || promos[`${mc}-latest`] || null;
    } catch (_) { /* промо недоступны — берём самую новую */ }
    if (rec && all.includes(rec)) return [rec, ...all.filter(v => v !== rec)];
    return all;
  }
  return [];
}

async function resolveLoaderVersion(loader, mc, wanted) {
  if (wanted) return wanted;
  const list = await listLoaderVersions(loader, mc);
  if (!list.length) throw new Error(`${LABEL[loader]} для Minecraft ${mc} не найден. Выберите другую версию или загрузчик`);
  return list[0];
}

function installerUrl(loader, mc, lv) {
  if (loader === 'neoforge') return `${NEOFORGE_MAVEN}/${lv}/neoforge-${lv}-installer.jar`;
  return `${FORGE_MAVEN}/${mc}-${lv}/forge-${mc}-${lv}-installer.jar`;
}

// Имя профиля, который создаёт установщик
function installedId(loader, mc, lv) {
  if (loader === 'neoforge') return `neoforge-${lv}`;
  return `${mc}-forge-${lv}`;
}

function readProfile(id) {
  const jp = path.join(dirs.versions, id, `${id}.json`);
  if (!fs.existsSync(jp)) return null;
  return JSON.parse(fs.readFileSync(jp, 'utf8'));
}

// Ищет профиль, созданный установщиком, если имя отличается от ожидаемого
function findInstalled(loader, mc, lv) {
  const direct = readProfile(installedId(loader, mc, lv));
  if (direct) return direct;
  if (!fs.existsSync(dirs.versions)) return null;
  for (const name of fs.readdirSync(dirs.versions)) {
    if (!name.includes(lv)) continue;
    const p = readProfile(name);
    if (p && p.inheritsFrom === mc && (loader === 'forge' ? /forge/i.test(name) : /neoforge/i.test(name))) return p;
  }
  return null;
}

// Запускает установщик Forge/NeoForge в папке данных. Прогресс — в report.
async function runInstaller(loader, mc, lv, javaMajor, report) {
  const jar = path.join(dirs.tools, 'installers', `${loader}-${mc}-${lv}-installer.jar`);
  await downloadFile(installerUrl(loader, mc, lv), jar);

  // Установщик требует launcher_profiles.json в целевой папке
  await fsp.mkdir(dirs.base, { recursive: true });
  const lp = path.join(dirs.base, 'launcher_profiles.json');
  if (!fs.existsSync(lp)) await fsp.writeFile(lp, JSON.stringify({ profiles: {} }));

  const javaBin = await ensureJava(javaMajor, report);
  report({ stage: 'Загрузчик', text: `Устанавливаю ${LABEL[loader]} ${lv} (установщик)…` });

  await new Promise((resolve, reject) => {
    const proc = spawn(javaBin, ['-jar', jar, '--installClient', dirs.base], { cwd: dirs.base, windowsHide: true });
    const tail = [];
    const onData = d => {
      for (const line of d.toString().split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        tail.push(t);
        if (tail.length > 40) tail.shift();
        if (/^(Downloading|Considering|Processor:|Task:|Applying|Extracting|Injecting)/.test(t)) {
          report({ stage: 'Загрузчик', text: t.slice(0, 120) });
        }
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', reject);
    proc.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`Установщик ${LABEL[loader]} завершился с кодом ${code}:\n${tail.slice(-12).join('\n')}`));
    });
  });
}

// Возвращает JSON профиля загрузчика (inheritsFrom = Minecraft) и актуальную версию загрузчика.
// Если профиля нет на диске — устанавливает. Для vanilla возвращает null.
async function ensureLoaderProfile(inst, { report = () => {}, javaMajor = 21 } = {}) {
  const loader = inst.loader;
  if (!loader || loader === 'vanilla') return { profile: null, loaderVersion: '' };
  const mc = inst.version;
  const lv = await resolveLoaderVersion(loader, mc, inst.loaderVersion);

  if (loader === 'fabric' || loader === 'quilt') {
    const id = `${loader}-loader-${lv}-${mc}`;
    const jp = path.join(dirs.versions, id, `${id}.json`);
    let profile;
    if (fs.existsSync(jp)) {
      profile = JSON.parse(await fsp.readFile(jp, 'utf8'));
    } else {
      report({ stage: label(loader, lv), text: `Загружаю профиль ${LABEL[loader]} ${lv}` });
      const base = loader === 'fabric' ? FABRIC_META : QUILT_META;
      profile = await fetchJson(`${base}/versions/loader/${mc}/${lv}/profile/json`);
      await fsp.mkdir(path.dirname(jp), { recursive: true });
      await fsp.writeFile(jp, JSON.stringify(profile));
    }
    return { profile, loaderVersion: lv };
  }

  // Forge / NeoForge
  let profile = findInstalled(loader, mc, lv);
  if (!profile) {
    await runInstaller(loader, mc, lv, javaMajor, report);
    profile = findInstalled(loader, mc, lv);
    if (!profile) throw new Error(`Установщик ${LABEL[loader]} не создал профиль для ${mc}`);
  }
  return { profile, loaderVersion: lv };
}

module.exports = { label, listLoaderVersions, resolveLoaderVersion, ensureLoaderProfile, MR_LOADER, CF_LOADER, LABEL };
