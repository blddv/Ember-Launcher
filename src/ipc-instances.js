// IPC: сборки (создание, обложки, экспорт/импорт, резервные копии), оптимизация,
// скриншоты, музыка и загрузка контента (поиск + установка).
const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const AdmZip = require('adm-zip');
const store = require('./store');
const instances = require('./instances');
const loaders = require('./loaders');
const minecraft = require('./minecraft');
const rust = require('./rust');
const perf = require('./perf');
const providers = require('./providers');
const { dirs } = require('./paths');
const i18n = require('./i18n');
const { ctx, report, pushLog, send } = require('./app-context');
const { applyCover, screenshotsOf, backupSaves } = require('./media');

// Проверяет, есть ли в zip запись с заданным именем (без распаковки в память).
function zipHasEntry(file, name) {
  try {
    const z = new AdmZip();
    z.readFromFile(file);
    return !!z.getEntry(name);
  } catch (_) {
    return false;
  }
}

function registerInstancesIpc() {
  ipcMain.handle('versions:list', () => minecraft.listVersions());
  ipcMain.handle('loader:versions', (_e, { loader, mc }) => loaders.listLoaderVersions(loader, mc));

  // Minecraft на Rust: версии движка, состояние и разовая подготовка данных игры
  ipcMain.handle('rust:platforms', () => rust.list());
  ipcMain.handle('rust:releases', (_e, { platform, fresh }) => rust.listReleases(platform, { fresh: !!fresh }));
  ipcMain.handle('rust:info', () => rust.info());
  ipcMain.handle('rust:prepare', async (_e, { platform, tag }) => {
    const p = rust.platform(platform);
    if (!p) throw new Error(i18n.t('Неизвестная Rust-платформа'));
    report({ stage: p.label, text: i18n.t('Проверяю движок…') });
    const engine = await rust.ensureEngine(p.id, tag || '', report, t => { pushLog(t); send('log', t); });
    if (p.prepare) await rust.ensurePrepared(p, engine, report, t => { pushLog(t); send('log', t); });
    report({ stage: i18n.t('Готово'), text: i18n.t('{label} готов к запуску', { label: p.label }) });
    return { ok: true, tag: engine.tag, dir: engine.dir };
  });

  ipcMain.handle('instances:list', () => ({
    list: instances.list(),
    selected: store.get('selectedInstance'),
    runningId: ctx.running ? ctx.running.instanceId : null,
  }));
  ipcMain.handle('instances:create', async (_e, data) => {
    const { cover, ...fields } = data || {};
    const inst = instances.create(fields);
    if (cover) {
      try {
        await applyCover(inst.id, cover);
        return instances.find(inst.id);
      } catch (_) { /* сборка создана, обложку можно поставить позже */ }
    }
    return inst;
  });
  ipcMain.handle('instances:setCover', async (_e, { id, cover }) => {
    if (!cover) return instances.clearCover(id);
    return applyCover(id, cover);
  });
  ipcMain.handle('instances:pickCover', async (_e, id) => {
    const r = await dialog.showOpenDialog(ctx.win, {
      title: i18n.t('Обложка сборки'),
      properties: ['openFile'],
      filters: [{ name: i18n.t('Изображения'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return applyCover(id, { file: r.filePaths[0] });
  });
  ipcMain.handle('instances:lastCrash', async (_e, id) => {
    const file = instances.lastCrash(id);
    if (!file) return { found: false };
    return { found: true, path: file, text: (await fsp.readFile(file, 'utf8')).slice(0, 20000) };
  });
  ipcMain.handle('covers:search', async (_e, query) => {
    const r = await providers.search('modrinth', { query: String(query || '').trim(), kind: 'modpack' });
    return r.items.filter(i => i.icon).map(i => ({ id: i.id, title: i.title, icon: i.icon, author: i.author }));
  });
  ipcMain.handle('perf:presets', () => perf.PRESETS);
  ipcMain.handle('perf:installPack', async (_e, id) => {
    const inst = instances.find(id);
    report({ stage: i18n.t('Оптимизация'), text: i18n.t('Ставлю пакет модов…') });
    const r = await perf.installPack(inst, report);
    report({ stage: i18n.t('Готово'), text: i18n.t('Пакет оптимизации обработан') });
    return r;
  });
  ipcMain.handle('perf:applyNow', async (_e, { id, preset }) => {
    const inst = instances.find(id);
    const p = perf.PRESETS[preset] ? preset : store.get('perf').preset;
    return perf.applyOptions(instances.getGameDir(inst), p);
  });
  ipcMain.handle('instances:delete', (_e, id) => {
    if (ctx.running && ctx.running.instanceId === id) throw new Error(i18n.t('Нельзя удалить запущенную сборку'));
    instances.remove(id);
    return true;
  });
  ipcMain.handle('instances:select', (_e, id) => store.set('selectedInstance', id));
  ipcMain.handle('instances:open', (_e, id) => shell.openPath(instances.getGameDir(instances.find(id))));
  ipcMain.handle('instances:duplicate', (_e, id) => instances.duplicate(id));
  ipcMain.handle('instances:exportZip', async (_e, id) => {
    const inst = instances.find(id);
    const r = await dialog.showSaveDialog(ctx.win, {
      title: i18n.t('Экспорт сборки'),
      defaultPath: `${inst.name}.zip`,
      filters: [{ name: i18n.t('Сборка EMBER (zip)'), extensions: ['zip'] }],
    });
    if (r.canceled || !r.filePath) return { cancelled: true };
    instances.exportZip(id, r.filePath);
    return { path: r.filePath };
  });
  ipcMain.handle('instances:importZip', async () => {
    const r = await dialog.showOpenDialog(ctx.win, {
      title: i18n.t('Импорт сборки'),
      properties: ['openFile'],
      filters: [{ name: i18n.t('Сборка EMBER (zip)'), extensions: ['zip'] }],
    });
    if (r.canceled || !r.filePaths[0]) return { cancelled: true };
    return instances.importZip(r.filePaths[0]);
  });
  ipcMain.handle('instances:backup', (_e, id) => backupSaves(instances.find(id)));
  ipcMain.handle('instances:folder', (_e, { id, sub }) => {
    const inst = instances.find(id);
    const target = sub ? path.join(inst.gameDir, sub) : inst.gameDir;
    fs.mkdirSync(target, { recursive: true });
    return shell.openPath(target);
  });

  ipcMain.handle('screenshots:list', () => screenshotsOf());

  // Папка музыки нужна только моду Orange Visuals: треки играют внутри игры
  ipcMain.handle('music:pickFolder', async () => {
    const r = await dialog.showOpenDialog(ctx.win, { title: i18n.t('Папка с музыкой для Minecraft'), properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    store.patch({ orangeVisuals: { musicFolder: r.filePaths[0] } });
    return r.filePaths[0];
  });
  ipcMain.handle('music:folder', () => {
    const f = store.get('orangeVisuals').musicFolder;
    const dir = f || path.join(dirs.base, 'music');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  });

  ipcMain.handle('search', (_e, { source, ...opts }) => providers.search(source, opts));

  ipcMain.handle('install', async (_e, { item, instanceId, update }) => {
    // Сборки, плагины и ссылки на .mrpack не требуют выбранной сборки
    const noInstance = item.kind === 'modpack' || item.kind === 'plugin' || (item.source === 'link' && String(item.id).toLowerCase().endsWith('.mrpack'));
    let inst = null;
    const id = instanceId || store.get('selectedInstance');
    if (id) {
      try { inst = instances.find(id); } catch (_) { inst = null; }
    }
    if (!noInstance && !inst) throw new Error(i18n.t('Выберите сборку, в которую ставить мод'));
    report({ stage: i18n.t('Загрузка'), text: i18n.t('Устанавливаю {title}…', { title: item.title || item.id }) });
    const res = await providers.install(item, inst, { update: !!update });
    if (res.instance) store.set('selectedInstance', res.instance.id);
    report({ stage: i18n.t('Готово'), text: i18n.t('Установка завершена') });
    return res;
  });

  // Импорт mrpack / CurseForge-сборки из локального zip
  ipcMain.handle('import:zip', async () => {
    const r = await dialog.showOpenDialog(ctx.win, {
      title: i18n.t('Импорт сборки'),
      properties: ['openFile'],
      filters: [{ name: i18n.t('Сборки (mrpack / zip)'), extensions: ['mrpack', 'zip'] }],
    });
    if (r.canceled || !r.filePaths[0]) return { cancelled: true };
    const file = r.filePaths[0];
    const lower = file.toLowerCase();
    if (lower.endsWith('.mrpack')) {
      const inst = await providers.installMrpack(file, path.basename(file));
      report({ stage: i18n.t('Импорт'), text: i18n.t('Сборка «{name}» импортирована', { name: inst.name }) });
      return { kind: 'mrpack', instance: inst };
    }
    // .zip: пробуем CurseForge (manifest.json), иначе Modrinth (modrinth.index.json), иначе EMBER
    if (zipHasEntry(file, 'manifest.json')) {
      const inst = await providers.installCurseForgeModpackFile(file);
      report({ stage: i18n.t('Импорт'), text: i18n.t('Сборка «{name}» импортирована', { name: inst.name }) });
      return { kind: 'curseforge', instance: inst };
    }
    if (zipHasEntry(file, 'modrinth.index.json')) {
      const inst = await providers.installMrpack(file, path.basename(file));
      report({ stage: i18n.t('Импорт'), text: i18n.t('Сборка «{name}» импортирована', { name: inst.name }) });
      return { kind: 'mrpack', instance: inst };
    }
    const inst = instances.importZip(file);
    report({ stage: i18n.t('Импорт'), text: i18n.t('Сборка «{name}» импортирована', { name: inst.name }) });
    return { kind: 'ember', instance: inst };
  });
}

module.exports = { registerInstancesIpc, zipHasEntry };
