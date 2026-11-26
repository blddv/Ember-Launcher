// Окно разбора падения Minecraft: данные, окно и IPC-обработчики.
const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const instances = require('./instances');
const crash = require('./crash');
const i18n = require('./i18n');

let crashWin = null;
let crashInfo = null;

// Вызывается, когда игра закрылась не по кнопке лаунчера: либо код ошибки, либо найден отчёт о падении
function handleUnexpectedExit({ instanceId, code, startedAt, playMs, logLines }) {
  return (async () => {
    let inst;
    try { inst = instances.find(instanceId); } catch (_) { return; }
    const gameDir = instances.getGameDir(inst);
    const found = crash.findSessionCrash(gameDir, startedAt);
    // Обычное закрытие окна игры: код 0 и отчёта нет, окно не нужно
    if (code === 0 && !found.report && !found.hsErr) return;
    crashInfo = crash.buildInfo({ instance: inst, code, startedAt, playMs, logLines, gameDir, found });
    crashInfo.language = i18n.lang();
    openCrashWindow();
  })().catch(e => console.error('Разбор падения:', e));
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
    title: crashInfo && crashInfo.engine ? i18n.t('{engine} закрылся с ошибкой', { engine: crashInfo.engine }) : i18n.t('Minecraft закрылся с ошибкой'),
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'crash-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  crashWin.setMenuBarVisibility(false);
  crashWin.loadFile(path.join(__dirname, '..', 'renderer', 'crash.html'));
  crashWin.once('ready-to-show', () => crashWin.show());
  crashWin.on('closed', () => { crashWin = null; });
}

function registerCrashIpc() {
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
}

module.exports = { handleUnexpectedExit, openCrashWindow, registerCrashIpc };
