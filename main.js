const { app, BrowserWindow, ipcMain, shell, dialog, clipboard, Tray, Menu, nativeImage, screen } = require('electron');
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
const secure = require('./src/secure');
const skins = require('./src/skins');

// ===== Linux / KDE Plasma: бэкенд окна и способ его перетаскивания =====
// Electron 31 под нативным Wayland + KWin (Plasma 6) может потерять ввод:
// wl_pointer.motion приходит в процесс, но события не доставляются окну,
// а указатель поверхности остаётся невидимым (electron/electron#49905,
// #49907, #28768; bugs.kde.org/483494). Рабочий путь — X11/XWayland.
//
// Важно: ELECTRON_OZONE_PLATFORM_HINT обрабатывается Electron'ом в
// DetectOzonePlatform() ещё до запуска JS, поэтому из main.js его уже не
// переопределить. Если процесс всё-таки стартовал под Wayland, перезапускаем
// его с явным --ozone-platform=x11. В .desktop electron-builder этот флаг
// прописан сразу (build.linux.executableArgs), поэтому перезапуск там не нужен.
//
// mode: 'js' — окно двигаем сами, CSS drag-регион отключён;
//       'native' — оставляем -webkit-app-region: drag (на Wayland
//       win.setPosition() не работает, перетаскивание отдаём KWin).
function detectLinuxWindowBackend() {
  if (process.platform !== 'linux') return { mode: 'native', relaunch: null, ozone: 'native' };
  const cliArg = process.argv.find(a => a.startsWith('--ozone-platform='));
  const cli = cliArg ? cliArg.slice('--ozone-platform='.length) : '';
  const env = String(process.env.EMBER_OZONE_PLATFORM || '').toLowerCase();

  // Явный выбор пользователя: флаг командной строки или EMBER_OZONE_PLATFORM.
  // Флаг из командной строки Electron уже обработал сам; переменную окружения
  // приходится превращать в флаг перезапуском (до старта JS она не читается).
  const restarted = process.env.EMBER_BACKEND_RELAUNCH === '1';
  const choice = cli || env;
  if (choice === 'wayland' || choice === 'auto') {
    if (cli || restarted) return { mode: 'native', relaunch: null, ozone: choice };
    const args = choice === 'auto'
      ? ['--ozone-platform-hint=auto']
      : ['--ozone-platform=wayland', '--enable-features=WaylandWindowDecorations'];
    return { mode: 'native', relaunch: args, ozone: choice };
  }
  if (choice === 'x11') return { mode: 'js', relaunch: null, ozone: 'x11' };

  // Что реально выбрал Electron до старта JS (в т.ч. по глобальному
  // ELECTRON_OZONE_PLATFORM_HINT=auto). С Electron 38 Wayland стал умолчанием.
  const selected = app.commandLine.getSwitchValue('ozone-platform');
  const major = parseInt((process.versions.electron || '').split('.')[0], 10) || 0;
  const waylandByDefault = major >= 38 && process.env.XDG_SESSION_TYPE === 'wayland';
  if ((selected === 'wayland' || waylandByDefault) && !restarted) {
    return { mode: 'js', relaunch: ['--ozone-platform=x11'], ozone: selected || 'auto' };
  }
  app.commandLine.appendSwitch('ozone-platform', 'x11');
  return { mode: 'js', relaunch: null, ozone: 'x11' };
}
const LINUX_BACKEND = detectLinuxWindowBackend();
const WINDOW_DRAG = LINUX_BACKEND.mode;

let win = null;
let windowDrag = null; // активное перетаскивание окна (Linux/X11)
function stopWindowDrag() {
  if (!windowDrag) return;
  clearInterval(windowDrag.timer);
  windowDrag = null;
}
let running = null; // { instanceId, proc, startedAt }
let stopRequested = false; // игра остановлена кнопкой лаунчера, это не падение
let logBuffer = []; // последние строки лога текущей сессии
let forceQuit = false; // реальный выход по кнопке «Выход» из трея
let tray = null; // иконка в трее: лаунчер можно скрыть, не убивая игру
const TRAY_ICON = path.join(__dirname, 'assets', 'icon.png');

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
      // Когда окно скрыто (играёт Minecraft), рендерер притормаживается —
      // это снимает нагрузку с CPU/GPU и не «съедает» FPS игры.
      backgroundThrottling: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  // Закрытие окна, пока игра запущена: сворачиваем в трей, а не убиваем игру.
  win.on('close', e => {
    if (forceQuit) return;
    if (running && store.get('hideOnClose') !== false) {
      e.preventDefault();
      if (win && !win.isDestroyed()) win.hide();
      return;
    }
  });
  // Linux/KDE (2.2.3): сбрасываем активное перетаскивание окна при его закрытии
  win.on('closed', () => { stopWindowDrag(); win = null; });
}

// Иконка в трее: позволяет открыть лаунчер обратно и корректно выйти (убив игру).
function createTray() {
  let img;
  try { img = nativeImage.createFromPath(TRAY_ICON); } catch (_) { img = null; }
  if (!img || img.isEmpty()) return;
  try {
    tray = new Tray(img);
  } catch (_) {
    // На системах без трея (например, некоторые окружения Linux) иконку не построить —
    // это не критично: закрытие окна скроет приложение, а игра останется жить.
    tray = null;
    return;
  }
  const buildMenu = () => {
    const items = [{ label: 'Открыть лаунчер', click: () => { if (win && !win.isDestroyed()) { win.show(); win.focus(); } } }];
    if (running) items.push({ label: 'Остановить игру и выйти', click: () => { quitForReal(); } });
    items.push({ type: 'separator' }, { label: 'Выйти', click: () => quitForReal() });
    tray.setContextMenu(Menu.buildFromTemplate(items));
  };
  tray.setToolTip('EMBER Launcher');
  tray.on('click', () => { if (win && !win.isDestroyed()) { win.show(); win.focus(); } });
  buildMenu();
  tray.buildMenu = buildMenu;
}

function refreshTray() { if (tray && tray.buildMenu) tray.buildMenu(); }

function quitForReal() {
  forceQuit = true;
  if (running && running.proc) {
    try { running.proc.kill(); } catch (_) { /* уже нет */ }
  }
  running = null;
  if (tray) { try { tray.destroy(); } catch (_) {} tray = null; }
  app.quit();
}

async function launchFlow(instanceId) {
  if (running) throw new Error('Minecraft уже запущен');
  stopRequested = false;
  logBuffer = [];
  let inst = instances.find(instanceId);
  const platform = instances.platformOf(inst);
  const rustInstance = platform !== 'java';
  // Поддерживаем несколько аккаунтов: стартуем с выбранным в настройках/вкладке «Аккаунт»
  let account = store.activeAccount();
  // Java Edition без аккаунта не запустится. Minecraft на Rust обходится без Ely.by:
  // Horizon входит сам, Rustcraft получает оффлайн-профиль.
  if (!rustInstance && !account) throw new Error('Сначала выберите аккаунт во вкладке «Аккаунт»');
  running = { instanceId, proc: null, startedAt: 0 };
  refreshTray();
  send('game:state', { running: true, instanceId, platform });

  // Игра закрылась: считаем время, сообщаем интерфейсу и при падении открываем разбор
  const finish = code => {
    const startedAt = running && running.startedAt ? running.startedAt : 0;
    const ms = startedAt ? Date.now() - startedAt : 0;
    if (ms > 0) instances.addPlaytime(instanceId, ms);
    const wasStopped = stopRequested;
    stopRequested = false;
    running = null;
    refreshTray();
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
    windowDrag: WINDOW_DRAG,
    ozone: LINUX_BACKEND.ozone,
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

  // Перетаскивание без -webkit-app-region: drag (Linux/X11). Нативный регион
  // забирает все mouse-события у страницы (electron/electron#1354), а KWin
  // может не отпустить захват указателя: курсор скрыт, клики не доходят.
  ipcMain.handle('win:dragStart', () => {
    // getCursorScreenPoint() на Wayland возвращает {0,0} (electron#53794),
    // поэтому если рестарт в X11 не удался — просто не двигаем окно.
    if (WINDOW_DRAG !== 'js' || LINUX_BACKEND.ozone !== 'x11' || windowDrag ||
        !win || win.isDestroyed() || win.isMaximized()) return false;
    const start = screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    windowDrag = { start, bounds, startedAt: Date.now(), timer: null };
    windowDrag.timer = setInterval(() => {
      if (!windowDrag || !win || win.isDestroyed()) return stopWindowDrag();
      // Подстраховка: если mouseup потерялся (курсор ушёл за окно), не таскаем окно вечно
      if (Date.now() - windowDrag.startedAt > 15000) return stopWindowDrag();
      const p = screen.getCursorScreenPoint();
      if (p.x === windowDrag.start.x && p.y === windowDrag.start.y) return;
      win.setPosition(windowDrag.bounds.x + p.x - windowDrag.start.x,
                      windowDrag.bounds.y + p.y - windowDrag.start.y);
    }, 16);
    return true;
  });
  ipcMain.handle('win:dragEnd', () => { stopWindowDrag(); return true; });

  // Токены аккаунтов интерфейсу не отдаются: в окно уходит только ник, UUID и тип
  ipcMain.handle('settings:get', () => {
    const s = store.get();
    // Старое поле account заменяется массивом accounts; для удобства оставляем и activeAccount
    s.account = store.activeAccount() ? secure.publicAccount(store.activeAccount()) : null;
    return s;
  });
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
  ipcMain.handle('game:hide', () => win && win.hide());

  // ── Аккаунты (мультиаккаунтинг): список, добавление, выбор, удаление, выход ──
  ipcMain.handle('accounts:list', () => ({
    accounts: store.publicAccounts(),
    selected: store.get('selectedAccount'),
  }));
  ipcMain.handle('accounts:select', (_e, id) => {
    store.selectAccount(id);
    return true;
  });
  ipcMain.handle('accounts:add', async (_e, { type, payload, label }) => {
    let acc;
    if (type === 'elyby') {
      acc = await auth.elyAuthenticate(payload.login, payload.password);
      if (label) acc.label = String(label).trim();
    } else if (type === 'offline') {
      acc = auth.offlineAccount(payload && payload.name ? payload.name : 'Player');
      if (label) acc.label = String(label).trim();
    } else {
      throw new Error('Недопустимый тип аккаунта');
    }
    const created = store.addAccount(acc);
    store.selectAccount(created.id);
    return secure.publicAccount(created);
  });
  ipcMain.handle('accounts:remove', async (_e, id) => {
    const acc = store.removeAccount(id);
    if (acc && acc.type === 'elyby') {
      // Выходим, чтобы на Ely.by не оставалось «чистой» активной сессии
      await auth.elyLogout(acc).catch(() => {});
    }
    return true;
  });
  ipcMain.handle('accounts:logout', async (_e, id) => {
    const acc = store.accountById(id);
    if (acc && acc.type === 'elyby') {
      await auth.elyLogout(acc);
      const updated = store.updateAccount(id, { active: false });
      return secure.publicAccount(updated);
    }
    return true;
  });

  // Microsoft: сначала возвращаем код устройства, затем ждём завершения входа в auth:msWait.
  // Опрос идёт в фоне, так что окно с кодом можно показать сразу.
  let msPending = null;
  ipcMain.handle('auth:msStart', async () => {
    if (msPending) throw new Error('Вход через Microsoft уже начат');
    const dc = await auth.msDeviceCode();
    let cancel = false;
    const promise = auth.msLogin({ deviceCode: dc.device_code, interval: dc.interval }, () => cancel)
      .then(acc => {
        // Добавляем в список аккаунтов, а не перезаписываем единственный
        const created = store.addAccount(acc);
        store.selectAccount(created.id);
        return created;
      })
      .finally(() => { msPending = null; });
    // Защита от unhandled rejection, если окно закрыли, не дождавшись входа
    promise.catch(() => {});
    msPending = { promise, cancel: () => { cancel = true; } };
    return {
      userCode: dc.user_code,
      verificationUri: dc.verification_uri || 'https://microsoft.com/link',
      verificationUriComplete: dc.verification_uri_complete || '',
      message: dc.message || '',
      expiresIn: dc.expires_in || 900,
    };
  });
  ipcMain.handle('auth:msWait', async () => {
    if (!msPending) throw new Error('Вход через Microsoft не начат');
    return secure.publicAccount(await msPending.promise);
  });
  ipcMain.handle('auth:msCancel', () => {
    if (msPending) msPending.cancel();
    return true;
  });

  // ── Скины: каталоги, поиск, текущий скин, применение ──
  ipcMain.handle('skins:sources', () => skins.listSources());
  ipcMain.handle('skins:search', async (_e, { source, query }) => {
    const nick = typeof query === 'string' ? query : '';
    return skins.search(source, nick);
  });
  ipcMain.handle('skins:current', async (_e, { accountId }) => {
    const acc = store.accountById(accountId);
    if (!acc) throw new Error('Аккаунт не найден');
    return skins.currentSkinUrl(acc);
  });
  ipcMain.handle('skins:apply', async (_e, { accountId, file, url }) => {
    const acc = store.accountById(accountId);
    if (!acc) throw new Error('Аккаунт не найден');
    const result = await skins.apply(acc, { file, url });
    return { ok: true, source: acc.type, url: result.url, message: result.message || '' };
  });
  ipcMain.handle('skins:pickImage', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Скины',
      properties: ['openFile'],
      filters: [{ name: 'Скины (png)', extensions: ['png'] }],
    });
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
  });

  // Импорт mrpack / CurseForge-сборки из локального zip
  ipcMain.handle('import:zip', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Импорт сборки',
      properties: ['openFile'],
      filters: [{ name: 'Сборки (mrpack / zip)', extensions: ['mrpack', 'zip'] }],
    });
    if (r.canceled || !r.filePaths[0]) return { cancelled: true };
    const file = r.filePaths[0];
    const lower = file.toLowerCase();
    if (lower.endsWith('.mrpack')) {
      const inst = await providers.installMrpack(file, path.basename(file));
      report({ stage: 'Импорт', text: `Сборка «${inst.name}» импортирована` });
      return { kind: 'mrpack', instance: inst };
    }
    // .zip: пробуем CurseForge (manifest.json), иначе Modrinth (modrinth.index.json), иначе EMBER
    if (zipHasEntry(file, 'manifest.json')) {
      const inst = await providers.installCurseForgeModpackFile(file);
      report({ stage: 'Импорт', text: `Сборка «${inst.name}» импортирована` });
      return { kind: 'curseforge', instance: inst };
    }
    if (zipHasEntry(file, 'modrinth.index.json')) {
      const inst = await providers.installMrpack(file, path.basename(file));
      report({ stage: 'Импорт', text: `Сборка «${inst.name}» импортирована` });
      return { kind: 'mrpack', instance: inst };
    }
    const inst = instances.importZip(file);
    report({ stage: 'Импорт', text: `Сборка «${inst.name}» импортирована` });
    return { kind: 'ember', instance: inst };
  });

  function zipHasEntry(file, name) {
    try {
      const z = new AdmZip();
      z.readFromFile(file);
      return !!z.getEntry(name);
    } catch (_) {
      return false;
    }
  }

  ipcMain.handle('clipboard:copy', (_e, text) => {
    clipboard.writeText(String(text || ''));
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
  // Бэкенд Ozone выбирается Electron'ом до старта JS: если нужен другой,
  // перезапускаемся до создания окон. Флаг-страховка в окружении не даёт
  // уйти в бесконечный рестарт.
  if (LINUX_BACKEND.relaunch) {
    process.env.EMBER_BACKEND_RELAUNCH = '1';
    try {
      app.relaunch({ args: process.argv.slice(1).concat(LINUX_BACKEND.relaunch) });
      app.exit(0);
      return;
    } catch (e) {
      // Например, AppImage не смог перезапуститься: работаем дальше без рестарта,
      // drag-регион уже отключён, поэтому клики должны доходить и под Wayland.
      console.error('Не удалось перезапустить лаунчер с нужным Ozone-бэкендом:', e);
    }
  }
  bootstrap();
  createWindow();
  createTray();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  // Игра запущена: по умолчанию держим приложение живым в фоне (окно скрыто, иконка в
  // трее), чтобы не убить Minecraft при закрытии лаунчера. Если пользователь специально
  // отключил «Скрывать при закрытии», выполняем старое поведение — останавливаем игру и выходим.
  if (running) {
    if (store.get('hideOnClose') === false) {
      try { running.proc && running.proc.kill(); } catch (_) { /* уже нет */ }
    }
    return;
  }
  app.quit();
});
