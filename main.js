const { app, BrowserWindow, ipcMain, shell, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { pathToFileURL } = require('url');
const AdmZip = require('adm-zip');
const { dirs, defaultBase, readBootstrap, writeBootstrap } = require('./src/paths');
const store = require('./src/store');
const minecraft = require('./src/minecraft');
const auth = require('./src/auth');
const providers = require('./src/providers');
const instances = require('./src/instances');
const mods = require('./src/mods');
const installed = require('./src/installed');
const loaders = require('./src/loaders');
const rust = require('./src/rust');
const horizon = require('./src/horizon');
const perf = require('./src/perf');
const http = require('./src/http');
const crash = require('./src/crash');

let win = null;
let running = null; // { instanceId, proc, startedAt }
let stopRequested = false; // игра остановлена кнопкой лаунчера, это не падение
let logBuffer = []; // последние строки лога текущей сессии

function pushLog(text) {
  logBuffer.push(...String(text).split(/\r?\n/));
  if (logBuffer.length > 800) logBuffer = logBuffer.slice(-400);
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
const report = p => send('progress', p);

// Обложка: файл с диска или картинка по https-ссылке (например, иконка с Modrinth)
async function applyCover(id, cover) {
  if (cover.file) return instances.setCover(id, cover.file);
  if (cover.url) {
    const url = String(cover.url);
    if (!/^https:\/\//i.test(url)) throw new Error('Обложка должна быть ссылкой https');
    const buf = await http.fetchBuffer(url);
    fs.mkdirSync(dirs.tmp, { recursive: true });
    const tmp = path.join(dirs.tmp, `cover-${Date.now()}.img`);
    fs.writeFileSync(tmp, buf);
    try {
      return instances.setCover(id, tmp);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
  throw new Error('Не указана обложка');
}

// ===== Окно разбора падения =====
let crashWin = null;
let crashInfo = null;

// Вызывается, когда игра закрылась не по кнопке лаунчера: либо код ошибки, либо найден отчёт о падении
async function handleUnexpectedExit({ instanceId, code, startedAt, playMs, logLines }) {
  let inst;
  try { inst = instances.find(instanceId); } catch (_) { return; }
  const gameDir = instances.getGameDir(inst);
  const found = crash.findSessionCrash(gameDir, startedAt);
  // Обычное закрытие окна игры: код 0 и отчёта нет, окно не нужно
  if (code === 0 && !found.report && !found.hsErr) return;
  crashInfo = crash.buildInfo({ instance: inst, code, startedAt, playMs, logLines, gameDir, found });
  openCrashWindow();
}

function openCrashWindow() {
  if (crashWin && !crashWin.isDestroyed()) {
    crashWin.webContents.reload(); // окно само запросит новые данные
    crashWin.show();
    crashWin.focus();
    return;
  }
  crashWin = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: '#050B1A',
    title: crashInfo && crashInfo.engine ? `${crashInfo.engine} закрылся с ошибкой` : 'Minecraft закрылся с ошибкой',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'crash-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  crashWin.setMenuBarVisibility(false);
  crashWin.loadFile(path.join(__dirname, 'renderer', 'crash.html'));
  crashWin.once('ready-to-show', () => crashWin.show());
  crashWin.on('closed', () => { crashWin = null; });
}

ipcMain.handle('crash:get', () => crashInfo);
ipcMain.handle('crash:copy', () => {
  if (!crashInfo) return false;
  clipboard.writeText(crashInfo.reportText || crashInfo.logText || crashInfo.summary);
  return true;
});
ipcMain.handle('crash:openFolder', () => {
  if (!crashInfo) return '';
  const dir = path.join(crashInfo.gameDir, 'crash-reports');
  return shell.openPath(fs.existsSync(dir) ? dir : crashInfo.gameDir);
});
ipcMain.handle('crash:openLog', () => {
  if (!crashInfo) return '';
  return crashInfo.logPath ? shell.openPath(crashInfo.logPath) : '';
});
ipcMain.handle('crash:close', () => crashWin && crashWin.close());

function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 780,
    minWidth: 1000,
    minHeight: 640,
    frame: false,
    backgroundColor: '#050B1A',
    title: 'EMBER Launcher',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
}

async function launchFlow(instanceId) {
  if (running) throw new Error('Minecraft уже запущен');
  stopRequested = false;
  logBuffer = [];
  let inst = instances.find(instanceId);
  const platform = instances.platformOf(inst);
  const rustInstance = platform !== 'java';
  let account = store.get('account');
  // Java Edition без аккаунта не запустится. Minecraft на Rust обходится без Ely.by:
  // Horizon входит сам, Rustcraft получает оффлайн-профиль.
  if (!rustInstance && !account) throw new Error('Сначала выберите аккаунт во вкладке «Аккаунт»');
  running = { instanceId, proc: null, startedAt: 0 };
  send('game:state', { running: true, instanceId, platform });

  // Игра закрылась: считаем время, сообщаем интерфейсу и при падении открываем разбор
  const finish = code => {
    const startedAt = running && running.startedAt ? running.startedAt : 0;
    const ms = startedAt ? Date.now() - startedAt : 0;
    if (ms > 0) instances.addPlaytime(instanceId, ms);
    const wasStopped = stopRequested;
    stopRequested = false;
    running = null;
    send('game:state', { running: false, instanceId, code, playMs: ms, platform });
    if (!wasStopped) {
      handleUnexpectedExit({ instanceId, code, startedAt, playMs: ms, logLines: logBuffer.slice() })
        .catch(e => console.error('Разбор падения:', e));
    }
  };

  try {
    if (rustInstance) {
      const s = store.get();
      send('mod:status', {
        active: false,
        reason: platform === 'horizon' ? 'моды ставятся из реестра Horizon' : 'Rustcraft без модов',
      });
      report({ stage: platform === 'horizon' ? 'Horizon' : 'Rustcraft', text: `Подготовка Minecraft ${inst.version}…` });
      let proc;
      if (platform === 'rustcraft') {
        // Rustcraft работает как замена java.exe: те же аргументы игры, другой исполняемый файл
        const acc = account || auth.offlineAccount((store.get('rustPlayerName') || 'Player'));
        const bin = await rust.javaExecBin(inst, report, t => { pushLog(t); send('log', t); });
        proc = await minecraft.launch({
          instance: inst,
          account: acc,
          report,
          bin,
          ram: s.ram || 4096,
          width: s.width || 1280,
          height: s.height || 720,
          fullscreen: !!s.fullscreen,
          onLog: t => { pushLog(t); send('log', t); },
          onExit: finish,
        });
      } else {
        proc = await rust.launch({
          instance: inst,
          report,
          onLog: t => { pushLog(t); send('log', t); },
          onExit: finish,
        });
      }
      running.proc = proc;
      running.startedAt = Date.now();
      if (proc.rustEngine && proc.rustEngine.tag && proc.rustEngine.tag !== inst.loaderVersion) {
        instances.update(instanceId, { loaderVersion: proc.rustEngine.tag });
      }
      if (s.closeOnLaunch && win) setTimeout(() => win && win.minimize(), 1500);
      return { ok: true, showLog: !!s.showLogOnLaunch };
    }

    account = await auth.ensureAccount(account);
    const s = store.get();

    const modState = await mods.syncOrangeVisuals(inst, report).catch(e => ({ active: false, reason: e.message }));
    send('mod:status', { active: !!modState.active, reason: modState.reason || '' });

    // Пресет производительности: options.txt, моды-оптимизаторы, JVM и память
    const tuning = await perf.prepareLaunch(inst, s.perf.preset, s.ram || 4096, s.perf.installMods, report);

    const extraJvm = [];
    if (account.type === 'elyby') {
      const jar = await auth.ensureAuthlibInjector();
      extraJvm.push(`-javaagent:${jar}=ely.by`);
    }

    const proc = await minecraft.launch({
      instance: inst,
      account,
      report,
      extraJvm,
      jvmArgs: [s.jvmArgs || '', ...tuning.jvm].join(' ').trim(),
      ram: tuning.ram,
      gc: tuning.gc || s.gcPreset || 'g1',
      width: s.width || 1280,
      height: s.height || 720,
      fullscreen: !!s.fullscreen,
      onLog: t => { pushLog(t); send('log', t); },
      onExit: finish,
    });
    running.proc = proc;
    running.startedAt = Date.now();
    if (proc.loaderVersion && proc.loaderVersion !== inst.loaderVersion) {
      instances.update(instanceId, { loaderVersion: proc.loaderVersion });
    }

    // Сворачиваем, а не закрываем: закрытие окна завершает приложение вместе с игрой
    if (s.closeOnLaunch && win) setTimeout(() => win && win.minimize(), 1500);
    return { ok: true, showLog: !!s.showLogOnLaunch };
  } catch (e) {
    running = null;
    // Любая ошибка (в т.ч. сырая сокетная AggregateError) показывается понятным текстом
    const message = http.humanizeError(e);
    send('game:state', { running: false, instanceId, error: message });
    throw new Error(message);
  }
}

// Переносит (или подключает новую пустую) папку данных и перезапускает приложение.
async function relocate(newBase) {
  if (running) throw new Error('Сначала закройте Minecraft');
  const oldBase = dirs.base;
  const target = path.resolve(newBase);
  if (target === path.resolve(oldBase)) return { cancelled: true };
  if (target.startsWith(path.resolve(oldBase) + path.sep)) throw new Error('Нельзя выбрать папку внутри текущей папки данных');

  const choice = await dialog.showMessageBox(win, {
    type: 'question',
    title: 'Папка данных',
    message: `Новая папка данных:\n${target}`,
    detail: 'Перенести сборки, моды, миры, Java и библиотеки из текущей папки? Перенос может занять несколько минут и требует свободного места.',
    buttons: ['Перенести данные', 'Новая пустая папка', 'Отмена'],
    defaultId: 0,
    cancelId: 2,
  });
  if (choice.response === 2) return { cancelled: true };

  fs.mkdirSync(target, { recursive: true });
  if (choice.response === 0) {
    send('progress', { stage: 'Перенос данных', text: 'Копирую файлы…' });
    await fsp.cp(oldBase, target, { recursive: true, force: true });
    try {
      await fsp.rm(oldBase, { recursive: true, force: true });
    } catch (_) { /* старую папку можно удалить вручную */ }
    send('progress', null);
  }

  const isDefault = target === path.resolve(defaultBase());
  writeBootstrap(isDefault ? {} : { dataDir: target });
  app.relaunch();
  app.exit(0);
  return { ok: true };
}

function screenshotsOf() {
  const out = [];
  for (const inst of instances.list()) {
    const dir = path.join(inst.gameDir, 'screenshots');
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!/\.(png|jpe?g)$/i.test(f)) continue;
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      out.push({ instance: inst.name, path: p, url: pathToFileURL(p).href, name: f, mtime: st.mtimeMs });
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, 400);
}

function backupSaves(inst) {
  const saves = path.join(inst.gameDir, 'saves');
  if (!fs.existsSync(saves) || !fs.readdirSync(saves).length) throw new Error('В этой сборке пока нет миров');
  const dir = path.join(dirs.base, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(dir, `${inst.id}-${stamp}.zip`);
  const zip = new AdmZip();
  zip.addLocalFolder(saves, 'saves');
  zip.writeZip(dest);
  return dest;
}

function bootstrap() {
  store.load();
  fs.mkdirSync(dirs.instances, { recursive: true });

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    base: dirs.base,
    isCustom: !!readBootstrap().dataDir,
    platform: process.platform,
    bundledMod: mods.SUPPORTED_VERSIONS,
    loaders: instances.LOADERS,
    javaLoaders: instances.JAVA_LOADERS,
    rustPlatforms: rust.list(),
  }));

  ipcMain.handle('dataDir:change', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Выберите папку для данных EMBER',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: dirs.base,
    });
    if (r.canceled || !r.filePaths[0]) return { cancelled: true };
    return relocate(path.join(r.filePaths[0], '.ember'));
  });
  ipcMain.handle('dataDir:reset', () => relocate(defaultBase()));

  ipcMain.handle('win:min', () => win && win.minimize());
  ipcMain.handle('win:max', () => {
    if (!win) return;
    win.isMaximized() ? win.unmaximize() : win.maximize();
  });
  ipcMain.handle('win:close', () => win && win.close());

  ipcMain.handle('settings:get', () => store.get());
  ipcMain.handle('settings:save', (_e, patch) => store.patch(patch));

  ipcMain.handle('versions:list', () => minecraft.listVersions());
  ipcMain.handle('loader:versions', (_e, { loader, mc }) => loaders.listLoaderVersions(loader, mc));

  // Minecraft на Rust: версии движка, состояние и разовая подготовка данных игры
  ipcMain.handle('rust:platforms', () => rust.list());
  ipcMain.handle('rust:releases', (_e, { platform, fresh }) => rust.listReleases(platform, { fresh: !!fresh }));
  ipcMain.handle('rust:info', () => rust.info());
  ipcMain.handle('rust:prepare', async (_e, { platform, tag }) => {
    const p = rust.platform(platform);
    if (!p) throw new Error('Неизвестная Rust-платформа');
    report({ stage: p.label, text: 'Проверяю движок…' });
    const engine = await rust.ensureEngine(p.id, tag || '', report, t => { pushLog(t); send('log', t); });
    if (p.prepare) await rust.ensurePrepared(p, engine, report, t => { pushLog(t); send('log', t); });
    report({ stage: 'Готово', text: `${p.label} готов к запуску` });
    return { ok: true, tag: engine.tag, dir: engine.dir };
  });

  ipcMain.handle('instances:list', () => ({
    list: instances.list(),
    selected: store.get('selectedInstance'),
    runningId: running ? running.instanceId : null,
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
    const r = await dialog.showOpenDialog(win, {
      title: 'Обложка сборки',
      properties: ['openFile'],
      filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
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
    report({ stage: 'Оптимизация', text: 'Ставлю пакет модов…' });
    const r = await perf.installPack(inst, report);
    report({ stage: 'Готово', text: 'Пакет оптимизации обработан' });
    return r;
  });
  ipcMain.handle('perf:applyNow', async (_e, { id, preset }) => {
    const inst = instances.find(id);
    const p = perf.PRESETS[preset] ? preset : store.get('perf').preset;
    return perf.applyOptions(instances.getGameDir(inst), p);
  });
  ipcMain.handle('instances:delete', (_e, id) => {
    if (running && running.instanceId === id) throw new Error('Нельзя удалить запущенную сборку');
    instances.remove(id);
    return true;
  });
  ipcMain.handle('instances:select', (_e, id) => store.set('selectedInstance', id));
  ipcMain.handle('instances:open', (_e, id) => shell.openPath(instances.getGameDir(instances.find(id))));
  ipcMain.handle('instances:duplicate', (_e, id) => instances.duplicate(id));
  ipcMain.handle('instances:exportZip', async (_e, id) => {
    const inst = instances.find(id);
    const r = await dialog.showSaveDialog(win, {
      title: 'Экспорт сборки',
      defaultPath: `${inst.name}.zip`,
      filters: [{ name: 'Сборка EMBER (zip)', extensions: ['zip'] }],
    });
    if (r.canceled || !r.filePath) return { cancelled: true };
    instances.exportZip(id, r.filePath);
    return { path: r.filePath };
  });
  ipcMain.handle('instances:importZip', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Импорт сборки',
      properties: ['openFile'],
      filters: [{ name: 'Сборка EMBER (zip)', extensions: ['zip'] }],
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

  ipcMain.handle('mods:list', (_e, id) => {
    const inst = instances.find(id);
    return instances.isRust(inst) ? horizon.listMods(inst) : mods.listMods(inst);
  });
  ipcMain.handle('mods:toggle', (_e, { id, file, enabled }) => {
    const inst = instances.find(id);
    return instances.isRust(inst)
      ? horizon.setModEnabled(inst, file, enabled)
      : mods.setModEnabled(inst, file, enabled);
  });
  ipcMain.handle('mods:installed', (_e, id) => {
    const inst = instances.find(id);
    // У сборок на Rust список ключей ведёт реестр Horizon, разбор jar не нужен
    return instances.isRust(inst) ? [] : installed.keysFor(inst);
  });
  // Состояние результатов поиска в сборке: { 'modrinth:ID': 'current' | 'outdated' | 'none' }
  ipcMain.handle('mods:states', (_e, { id, items }) => {
    let inst = null;
    try { inst = instances.find(id); } catch (_) { inst = null; }
    return providers.installStates(inst, items);
  });
  ipcMain.handle('mods:delete', (_e, { id, file }) => {
    const inst = instances.find(id);
    return instances.isRust(inst) ? horizon.deleteMod(inst, file) : mods.deleteMod(inst, file);
  });

  ipcMain.handle('screenshots:list', () => screenshotsOf());

  // Папка музыки нужна только моду Orange Visuals: треки играют внутри игры
  ipcMain.handle('music:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Папка с музыкой для Minecraft', properties: ['openDirectory'] });
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

  ipcMain.handle('game:launch', (_e, instanceId) => launchFlow(instanceId));
  ipcMain.handle('game:stop', () => {
    stopRequested = true;
    if (running && running.proc) running.proc.kill();
    return true;
  });
  ipcMain.handle('game:status', () => ({ running: !!running, instanceId: running && running.instanceId }));

  ipcMain.handle('auth:ely', async (_e, { login, password }) => {
    const acc = await auth.elyAuthenticate(login, password);
    store.set('account', acc);
    return acc;
  });
  ipcMain.handle('auth:offline', (_e, name) => {
    const acc = auth.offlineAccount(name);
    store.set('account', acc);
    return acc;
  });
  ipcMain.handle('auth:logout', async () => {
    await auth.elyLogout(store.get('account'));
    store.set('account', null);
    return true;
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
    if (!noInstance && !inst) throw new Error('Выберите сборку, в которую ставить мод');
    report({ stage: 'Загрузка', text: `Устанавливаю ${item.title || item.id}…` });
    const res = await providers.install(item, inst, { update: !!update });
    if (res.instance) store.set('selectedInstance', res.instance.id);
    report({ stage: 'Готово', text: 'Установка завершена' });
    return res;
  });

  ipcMain.handle('files:open', (_e, p) => shell.openPath(p));
  ipcMain.handle('dialog:image', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Картинка для обложки',
      properties: ['openFile'],
      filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    });
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
  });
  ipcMain.handle('dialog:java', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Выберите java.exe',
      properties: ['openFile'],
      filters: [{ name: 'Java', extensions: ['exe'] }, { name: 'Все файлы', extensions: ['*'] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('shell:url', (_e, url) => shell.openExternal(url));
}

app.whenReady().then(() => {
  bootstrap();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (running && running.proc) running.proc.kill();
  app.quit();
});
