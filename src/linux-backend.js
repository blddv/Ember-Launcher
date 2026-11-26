// ===== Linux / KDE Plasma: бэкенд окна и способ его перетаскивания =====
// Electron 31 под нативным Wayland + KWin (Plasma 6) может потерять ввод:
// wl_pointer.motion приходит в процесс, но события не доставляются окну,
// а указатель поверхности остаётся невидимым (electron/electron#49905,
// #49907, #28768; bugs.kde.org/483494). Рабочий путь — X11/XWayland.
//
// Важно: ELECTRON_OZONE_PLATFORM_HINT обрабатывается Electron'ом в
// DetectOzonePlatform() ещё до запуска JS, поэтому из JS его уже не
// переопределить. Если процесс всё-таки стартовал под Wayland, перезапускаем
// его с явным --ozone-platform=x11. В .desktop electron-builder этот флаг
// прописан сразу (build.linux.executableArgs), поэтому перезапуск там не нужен.
//
// mode: 'js' — окно двигаем сами, CSS drag-регион отключён;
//       'native' — оставляем -webkit-app-region: drag (на Wayland
//       win.setPosition() не работает, перетаскивание отдаём KWin).
function detectLinuxWindowBackend() {
  const { app } = require('electron');
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

module.exports = { detectLinuxWindowBackend, LINUX_BACKEND, WINDOW_DRAG };
