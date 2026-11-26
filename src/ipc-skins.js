// IPC: скины — каталоги, поиск, текущий скин, применение.
const { ipcMain, dialog } = require('electron');
const store = require('./store');
const skins = require('./skins');
const i18n = require('./i18n');
const { ctx } = require('./app-context');

function registerSkinsIpc() {
  ipcMain.handle('skins:sources', () => skins.listSources());
  ipcMain.handle('skins:catalog', () => skins.catalog());
  ipcMain.handle('skins:search', async (_e, { source, query }) => {
    const nick = typeof query === 'string' ? query : '';
    return skins.search(source, nick);
  });
  ipcMain.handle('skins:current', async (_e, { accountId }) => {
    const acc = store.accountById(accountId);
    if (!acc) throw new Error(i18n.t('Аккаунт не найден'));
    return skins.currentSkin(acc);
  });
  ipcMain.handle('skins:apply', async (_e, { accountId, file, url, model }) => {
    const acc = store.accountById(accountId);
    if (!acc) throw new Error(i18n.t('Аккаунт не найден'));
    const result = await skins.apply(acc, { file, url, model });
    return { ok: true, source: acc.type, method: result.method || '', message: result.message || '' };
  });
  ipcMain.handle('skins:pickImage', async () => {
    const r = await dialog.showOpenDialog(ctx.win, {
      title: i18n.t('Скины'),
      properties: ['openFile'],
      filters: [{ name: i18n.t('Скины (png)'), extensions: ['png'] }],
    });
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
  });
}

module.exports = { registerSkinsIpc };
