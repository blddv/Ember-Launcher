// IPC: общие настройки приложения, папка данных, окно, диалоги, файлы.
const { app, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { dirs, defaultBase, readBootstrap } = require('./paths');
const store = require('./store');
const mods = require('./mods');
const instances = require('./instances');
const rust = require('./rust');
const updater = require('./updater');
const providers = require('./providers');
const i18n = require('./i18n');
const { ctx } = require('./app-context');
const { relocate } = require('./relocate');

function registerAppIpc() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    base: dirs.base,
    isCustom: !!readBootstrap().dataDir,
    platform: process.platform,
    windowDrag: require('./linux-backend').WINDOW_DRAG,
    ozone: require('./linux-backend').LINUX_BACKEND.ozone,
    bundledMod: mods.SUPPORTED_VERSIONS,
    loaders: instances.LOADERS,
    javaLoaders: instances.JAVA_LOADERS,
    rustPlatforms: rust.list(),
    releaseRepo: updater.GITHUB_REPO,
    language: i18n.lang(),
    languages: i18n.langs(),
  }));

  ipcMain.handle('dataDir:change', async () => {
    const r = await dialog.showOpenDialog(ctx.win, {
      title: i18n.t('Выберите папку для данных EMBER'),
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: dirs.base,
    });
    if (r.canceled || !r.filePaths[0]) return { cancelled: true };
    return relocate(path.join(r.filePaths[0], '.ember'));
  });
  ipcMain.handle('dataDir:reset', () => relocate(defaultBase()));

  // Токены аккаунтов интерфейсу не отдаются: в окно уходит только ник, UUID и тип
  ipcMain.handle('settings:get', () => {
    const s = store.get();
    // Старое поле account заменяется массивом accounts; для удобства оставляем и activeAccount
    s.account = store.activeAccount() ? require('./secure').publicAccount(store.activeAccount()) : null;
    return s;
  });
  ipcMain.handle('settings:save', (_e, patch) => {
    const r = store.patch(patch);
    if (patch && patch.language) i18n.setLang(patch.language);
    return r;
  });

  ipcMain.handle('clipboard:copy', (_e, text) => {
    clipboard.writeText(String(text || ''));
    return true;
  });

  ipcMain.handle('files:open', (_e, p) => shell.openPath(p));
  ipcMain.handle('shell:url', (_e, url) => shell.openExternal(url));

  ipcMain.handle('dialog:image', async () => {
    const r = await dialog.showOpenDialog(ctx.win, {
      title: i18n.t('Картинка для обложки'),
      properties: ['openFile'],
      filters: [{ name: i18n.t('Изображения'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    });
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
  });
  ipcMain.handle('dialog:java', async () => {
    const r = await dialog.showOpenDialog(ctx.win, {
      title: i18n.t('Выберите java.exe'),
      properties: ['openFile'],
      filters: [{ name: 'Java', extensions: ['exe'] }, { name: i18n.t('Все файлы'), extensions: ['*'] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });
}

module.exports = { registerAppIpc };
