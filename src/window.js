// Окно лаунчера, трей и перетаскивание окна (Linux/X11).
const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain } = require('electron');
const path = require('path');
const store = require('./store');
const i18n = require('./i18n');
const { ctx } = require('./app-context');
const { WINDOW_DRAG, LINUX_BACKEND } = require('./linux-backend');

const TRAY_ICON = path.join(__dirname, '..', 'assets', 'icon.png');

let windowDrag = null; // активное перетаскивание окна (Linux/X11)
function stopWindowDrag() {
  if (!windowDrag) return;
  clearInterval(windowDrag.timer);
  windowDrag = null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 780,
    minWidth: 1000,
    minHeight: 640,
    frame: false,
    backgroundColor: '#050B1A',
    title: 'EMBER Launcher',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Когда окно скрыто (играёт Minecraft), рендерер притормаживается —
      // это снимает нагрузку с CPU/GPU и не «съедает» FPS игры.
      backgroundThrottling: true,
    },
  });
  ctx.win = win;
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  // Закрытие окна, пока игра запущена: сворачиваем в трей, а не убиваем игру.
  win.on('close', e => {
    if (ctx.forceQuit) return;
    if (ctx.running && store.get('hideOnClose') !== false) {
      e.preventDefault();
      if (ctx.win && !ctx.win.isDestroyed()) ctx.win.hide();
      return;
    }
  });
  // Linux/KDE (2.2.3): сбрасываем активное перетаскивание окна при его закрытии
  win.on('closed', () => { stopWindowDrag(); ctx.win = null; });
}

// Иконка в трее: позволяет открыть лаунчер обратно и корректно выйти (убив игру).
function createTray() {
  let img;
  try { img = nativeImage.createFromPath(TRAY_ICON); } catch (_) { img = null; }
  if (!img || img.isEmpty()) return;
  try {
    ctx.tray = new Tray(img);
  } catch (_) {
    // На системах без трея (например, некоторые окружения Linux) иконку не построить —
    // это не критично: закрытие окна скроет приложение, а игра останется жить.
    ctx.tray = null;
    return;
  }
  const buildMenu = () => {
    const items = [{ label: i18n.t('Открыть лаунчер'), click: () => { if (ctx.win && !ctx.win.isDestroyed()) { ctx.win.show(); ctx.win.focus(); } } }];
    if (ctx.running) items.push({ label: i18n.t('Остановить игру и выйти'), click: () => { quitForReal(); } });
    items.push({ type: 'separator' }, { label: i18n.t('Выйти'), click: () => quitForReal() });
    ctx.tray.setContextMenu(Menu.buildFromTemplate(items));
  };
  ctx.tray.setToolTip('EMBER Launcher');
  ctx.tray.on('click', () => { if (ctx.win && !ctx.win.isDestroyed()) { ctx.win.show(); ctx.win.focus(); } });
  buildMenu();
  ctx.tray.buildMenu = buildMenu;
}

function refreshTray() { if (ctx.tray && ctx.tray.buildMenu) ctx.tray.buildMenu(); }

function quitForReal() {
  ctx.forceQuit = true;
  if (ctx.running && ctx.running.proc) {
    try { ctx.running.proc.kill(); } catch (_) { /* уже нет */ }
  }
  ctx.running = null;
  if (ctx.tray) { try { ctx.tray.destroy(); } catch (_) {} ctx.tray = null; }
  app.quit();
}

// Перетаскивание без -webkit-app-region: drag (Linux/X11). Нативный регион
// забирает все mouse-события у страницы (electron/electron#1354), а KWin
// может не отпустить захват указателя: курсор скрыт, клики не доходят.
function registerWindowIpc() {
  ipcMain.handle('win:min', () => ctx.win && ctx.win.minimize());
  ipcMain.handle('win:max', () => {
    if (!ctx.win) return;
    ctx.win.isMaximized() ? ctx.win.unmaximize() : ctx.win.maximize();
  });
  ipcMain.handle('win:close', () => ctx.win && ctx.win.close());

  ipcMain.handle('win:dragStart', () => {
    // getCursorScreenPoint() на Wayland возвращает {0,0} (electron#53794),
    // поэтому если рестарт в X11 не удался — просто не двигаем окно.
    if (WINDOW_DRAG !== 'js' || LINUX_BACKEND.ozone !== 'x11' || windowDrag ||
        !ctx.win || ctx.win.isDestroyed() || ctx.win.isMaximized()) return false;
    const start = screen.getCursorScreenPoint();
    const bounds = ctx.win.getBounds();
    windowDrag = { start, bounds, startedAt: Date.now(), timer: null };
    windowDrag.timer = setInterval(() => {
      if (!windowDrag || !ctx.win || ctx.win.isDestroyed()) return stopWindowDrag();
      // Подстраховка: если mouseup потерялся (курсор ушёл за окно), не таскаем окно вечно
      if (Date.now() - windowDrag.startedAt > 15000) return stopWindowDrag();
      const p = screen.getCursorScreenPoint();
      if (p.x === windowDrag.start.x && p.y === windowDrag.start.y) return;
      ctx.win.setPosition(windowDrag.bounds.x + p.x - windowDrag.start.x,
                          windowDrag.bounds.y + p.y - windowDrag.start.y);
    }, 16);
    return true;
  });
  ipcMain.handle('win:dragEnd', () => { stopWindowDrag(); return true; });
}

module.exports = { createWindow, createTray, refreshTray, quitForReal, registerWindowIpc };
