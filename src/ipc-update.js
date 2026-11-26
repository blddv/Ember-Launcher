// IPC: автообновление лаунчера — проверка, загрузка, установка.
const { app, ipcMain } = require('electron');
const store = require('./store');
const updater = require('./updater');
const http = require('./http');
const i18n = require('./i18n');
const { send } = require('./app-context');

function registerUpdateIpc() {
  ipcMain.handle('update:check', async () => {
    const token = store.get('githubToken') || '';
    try {
      return await updater.checkForUpdate(app.getVersion(), { token });
    } catch (e) {
      return { ok: false, error: http.humanizeError(e) };
    }
  });

  ipcMain.handle('update:download', async (_e, asset) => {
    const info = await updater.checkForUpdate(app.getVersion(), { token: store.get('githubToken') || '' });
    const r = await updater.downloadUpdate(asset, {
      checksums: info.checksums || '',
      onProgress: (received, total) => send('update:progress', { received, total }),
    });
    return { ok: true, ...r };
  });

  ipcMain.handle('update:install', (_e, { file, assetName }) => {
    const r = updater.installUpdate({
      platform: process.platform,
      appImagePath: process.env.APPIMAGE || '',
      assetName: assetName || '',
    }, { file });
    // После автоматической установки перезапускаем лаунчер, чтобы запустить новую версию
    if (r.ok && (r.method === 'nsis' || r.method === 'appimage')) {
      setTimeout(() => {
        try { app.relaunch(); } catch (_) { /* не получилось — пользователь перезапустит сам */ }
        app.exit(0);
      }, 1200);
    }
    return r;
  });
}

module.exports = { registerUpdateIpc };
