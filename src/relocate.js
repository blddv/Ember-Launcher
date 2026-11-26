// Переносит (или подключает новую пустую) папку данных и перезапускает приложение.
const { app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { dirs, defaultBase, writeBootstrap } = require('./paths');
const i18n = require('./i18n');
const { send, report } = require('./app-context');

async function relocate(newBase) {
  if (require('./app-context').ctx.running) throw new Error(i18n.t('Сначала закройте Minecraft'));
  const oldBase = dirs.base;
  const target = path.resolve(newBase);
  if (target === path.resolve(oldBase)) return { cancelled: true };
  if (target.startsWith(path.resolve(oldBase) + path.sep)) throw new Error(i18n.t('Нельзя выбрать папку внутри текущей папки данных'));

  const choice = await dialog.showMessageBox(require('./app-context').ctx.win, {
    type: 'question',
    title: i18n.t('Папка данных'),
    message: i18n.t('Новая папка данных:\n{target}', { target }),
    detail: i18n.t('Перенести сборки, моды, миры, Java и библиотеки из текущей папки? Перенос может занять несколько минут и требует свободного места.'),
    buttons: [i18n.t('Перенести данные'), i18n.t('Новая пустая папка'), i18n.t('Отмена')],
    defaultId: 0,
    cancelId: 2,
  });
  if (choice.response === 2) return { cancelled: true };

  fs.mkdirSync(target, { recursive: true });
  if (choice.response === 0) {
    send('progress', { stage: i18n.t('Перенос данных'), text: i18n.t('Копирую файлы…') });
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

module.exports = { relocate };
