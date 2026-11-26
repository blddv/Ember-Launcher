// EMBER Launcher — точка входа main-процесса.
// Сам функционал разбит по модулям в src/: окна, запуск игры, IPC-обработчики,
// перенос данных, медиа-операции. Этот файл только стартует приложение и
// регистрирует модули.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const store = require('./src/store');
const { dirs } = require('./src/paths');
const updater = require('./src/updater');
const i18n = require('./src/i18n');
const { LINUX_BACKEND } = require('./src/linux-backend');
const { ctx, send } = require('./src/app-context');
const { createWindow, createTray, registerWindowIpc } = require('./src/window');
const { registerCrashIpc } = require('./src/crash-window');
const { registerLaunchIpc } = require('./src/launch');
const { registerAppIpc } = require('./src/ipc-app');
const { registerInstancesIpc } = require('./src/ipc-instances');
const { registerModsIpc } = require('./src/ipc-mods');
const { registerAccountsIpc } = require('./src/ipc-accounts');
const { registerSkinsIpc } = require('./src/ipc-skins');
const { registerUpdateIpc } = require('./src/ipc-update');

// Регистрация всех IPC-модулей. Зависимости между модулями идут только через
// контекст (src/app-context.js), поэтому порядок регистрации не важен.
function bootstrap() {
  store.load();
  fs.mkdirSync(dirs.instances, { recursive: true });

  registerWindowIpc();
  registerCrashIpc();
  registerLaunchIpc();
  registerAppIpc();
  registerInstancesIpc();
  registerModsIpc();
  registerAccountsIpc();
  registerSkinsIpc();
  registerUpdateIpc();
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
      console.error(i18n.t('Не удалось перезапустить лаунчер с нужным Ozone-бэкендом:'), e);
    }
  }
  bootstrap();
  createWindow();
  createTray();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

  // Автопроверка обновлений в фоне: результат отправляется в интерфейс,
  // если найдётся новая версия — пользователь скачает и установит из настроек.
  setTimeout(async () => {
    try {
      const info = await updater.checkForUpdate(app.getVersion(), { token: store.get('githubToken') || '' });
      send('update:available', info);
    } catch (_) { /* нет сети / лимит GitHub — в интерфейсе кнопка «Проверить» перепроверит */ }
  }, 4000);
});

app.on('window-all-closed', () => {
  // Игра запущена: по умолчанию держим приложение живым в фоне (окно скрыто, иконка в
  // трее), чтобы не убить Minecraft при закрытии лаунчера. Если пользователь специально
  // отключил «Скрывать при закрытии», выполняем старое поведение — останавливаем игру и выходим.
  if (ctx.running) {
    if (store.get('hideOnClose') === false) {
      try { ctx.running.proc && ctx.running.proc.kill(); } catch (_) { /* уже нет */ }
    }
    return;
  }
  app.quit();
});
