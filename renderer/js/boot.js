// Запуск интерфейса: подготовка состояния и первичная отрисовка.
const EMB = (window.EMB = window.EMB || {});
const { t } = EMB;

async function boot() {
  EMB.state.info = await window.ember.info();
  // Язык интерфейса из main-процесса (сохраняется в настройках)
  if (EMB.state.info.language && EMB.i18n.list.includes(EMB.state.info.language)) {
    EMB.i18n.setLang(EMB.state.info.language, false);
  }
  // Под Linux/KDE отключаем -webkit-app-region: drag и двигаем окно из main-процесса
  if (EMB.state.info.windowDrag === 'js') {
    document.body.classList.add('js-drag');
    EMB.events.setupManualWindowDrag();
  }
  // Явный opt-in в нативный Wayland: на Electron 31 под KWin ввод может пропасть
  if (EMB.state.info.ozone === 'wayland' || EMB.state.info.ozone === 'auto') {
    EMB.toast(t('Запущено под Wayland: если мышь не работает, добавьте --ozone-platform=x11'), 'err');
  }
  EMB.state.settings = await window.ember.settings.get();
  await EMB.actions.loadAccounts();
  // Каталоги скинов
  try { EMB.state.skins.sources = await window.ember.skins.sources(); } catch (_) { EMB.state.skins.sources = []; }
  try { EMB.state.skins.catalog = await window.ember.skins.catalog(); } catch (_) { EMB.state.skins.catalog = []; }
  EMB.state.musicFolder = await window.ember.music.folder();
  EMB.updateFlow.applyAnimations();
  EMB.updateFlow.applyLite();
  EMB.state.logs = '';
  EMB.state.versions = await window.ember.versions().catch(err => {
    EMB.toast(EMB.t('Не удалось загрузить список версий Minecraft: {msg}', { msg: err.message }), 'err');
    return [];
  });
  const r = await window.ember.instances.list();
  EMB.state.instances = r.list;
  EMB.state.selected = r.selected;
  EMB.state.runningId = r.runningId;
  const st = await window.ember.game.status();
  EMB.state.running = st.running;
  // Платформы Rust нужны модалке новой сборки: грузим в фоне, интерфейс не ждёт
  window.ember.rust.info().then(list => {
    EMB.state.rustInfo = list;
    if (EMB.state.view === 'rust') EMB.renderView();
  }).catch(() => {});
  EMB.events.setupEvents();
  EMB.renderShell();
  EMB.i18n.shellReady = true;
  EMB.renderView();
}

boot().catch(err => {
  document.getElementById('app').innerHTML = `<div style="padding:40px;color:#FFB2B2">${t('Ошибка запуска: {msg}', { msg: EMB.esc(err.message) })}</div>`;
});
