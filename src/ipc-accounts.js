// IPC: аккаунты (мультиаккаунтинг) и вход через Microsoft по коду устройства.
const { ipcMain } = require('electron');
const store = require('./store');
const auth = require('./auth');
const secure = require('./secure');
const i18n = require('./i18n');

function registerAccountsIpc() {
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
      throw new Error(i18n.t('Недопустимый тип аккаунта'));
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
    if (msPending) throw new Error(i18n.t('Вход через Microsoft уже начат'));
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
    if (!msPending) throw new Error(i18n.t('Вход через Microsoft не начат'));
    return secure.publicAccount(await msPending.promise);
  });
  ipcMain.handle('auth:msCancel', () => {
    if (msPending) msPending.cancel();
    return true;
  });
}

module.exports = { registerAccountsIpc };
