(function () {
// Действия приложения: перезагрузка данных, запуск игры, импорт, моды-менеджер,
// сохранение настроек и пресеты производительности.
const EMB = (window.EMB = window.EMB || {});
const { t } = EMB;

EMB.actions = EMB.actions || {};

EMB.actions.reloadInstances = async function reloadInstances() {
  const r = await window.ember.instances.list();
  EMB.state.instances = r.list;
  EMB.state.selected = r.selected;
  EMB.state.runningId = r.runningId;
  if (['home', 'instances', 'mods'].includes(EMB.state.view)) EMB.renderView();
};

EMB.actions.launch = async function launch() {
  const inst = EMB.selectedInst();
  if (!inst) return EMB.toast(t('Создайте сборку во вкладке «Сборки»'), 'err');
  // Rust-движки не используют аккаунт Ely.by: Horizon входит сам, Rustcraft берёт оффлайн-ник
  if (!EMB.isRust(inst) && !EMB.state.account) return EMB.toast(t('Войдите в аккаунт во вкладке «Аккаунт»'), 'err');
  EMB.state.preparing = true;
  EMB.renderView();
  try {
    await window.ember.game.launch(inst.id);
  } catch (e) {
    EMB.toast(e.message, 'err');
  } finally {
    EMB.state.preparing = false;
    EMB.state.progress = null;
    if (EMB.state.view === 'home') EMB.renderView();
  }
};

EMB.actions.importZip = function importZip() {
  return window.ember.instances.importZip().then(async res => {
    if (!res || res.cancelled) return;
    const inst = res.instance || res;
    if (!inst) return;
    EMB.toast(EMB.t('Сборка «{name}» импортирована', { name: inst.name }), 'ok');
    await EMB.actions.reloadInstances();
  }).catch(e => EMB.toast(e.message, 'err'));
};

EMB.actions.openModsManager = async function openModsManager(id) {
  EMB.state.modal = { type: 'mods', instId: id, list: null, hidden: 0 };
  EMB.renderModal();
  try {
    const r = await window.ember.mods.list(id);
    EMB.state.modal.list = r.list;
    EMB.state.modal.hidden = r.hidden;
  } catch (e) {
    EMB.state.modal.list = [];
    EMB.toast(e.message, 'err');
  }
  if (EMB.state.modal && EMB.state.modal.type === 'mods') EMB.renderModal();
};

EMB.actions.saveSettings = async function saveSettings() {
  const [w, h] = EMB.$('#res').value.split('x').map(Number);
  const patch = {
    ram: +EMB.$('#ram').value,
    gcPreset: EMB.$('#gc').value,
    jvmArgs: EMB.$('#jvm').value.trim(),
    javaPath: EMB.$('#javapath').value.trim(),
    width: w,
    height: h,
    fullscreen: EMB.$('#fullscreen').checked,
    closeOnLaunch: EMB.$('#closeOnLaunch').checked,
    showLogOnLaunch: EMB.$('#showLogOnLaunch').checked,
    animations: EMB.$('#animations').checked,
    curseforgeKey: EMB.$('#cfkey').value.trim(),
    githubToken: EMB.$('#ghtoken').value.trim(),
    rustPlayerName: (EMB.$('#rustname').value.trim() || '').slice(0, 16),
    language: EMB.$('#lang').value,
    perf: {
      preset: EMB.currentPreset(),
      installMods: EMB.$('#perf-mods').checked,
    },
    orangeVisuals: {
      enabled: EMB.$('#ov-enabled').checked,
      hudFps: EMB.$('#ov-fps').checked,
      hudCoords: EMB.$('#ov-coords').checked,
      hudNowPlaying: EMB.$('#ov-np').checked,
      zoom: EMB.$('#ov-zoom').checked,
      zoomFactor: +EMB.$('#ov-zoom-factor').value / 100,
      menuKey: +EMB.$('#ov-menukey').dataset.code,
      zoomKey: +EMB.$('#ov-zoomkey').dataset.code,
      music: EMB.$('#ov-music').checked,
    },
  };
  try {
    EMB.state.settings = await window.ember.settings.save(patch);
    EMB.i18n.setLang(EMB.$('#lang').value);
    EMB.updateFlow.applyAnimations();
    EMB.updateFlow.applyLite();
    EMB.toast(t('Настройки сохранены'), 'ok');
    EMB.renderView();
  } catch (e) {
    EMB.toast(e.message, 'err');
  }
};

EMB.actions.applyPerf = async function applyPerf() {
  const inst = EMB.selectedInst();
  if (!inst) return EMB.toast(t('Выберите сборку во вкладке «Сборки»'), 'err');
  if (EMB.isRust(inst)) return EMB.toast(t('Пресеты производительности — для Java Edition: у Rust-движков свои настройки графики в игре'), 'err');
  const preset = EMB.currentPreset();
  if (preset === 'standard') return EMB.toast(EMB.t('Пресет «Обычный» ничего не меняет'), 'ok');
  try {
    await window.ember.perf.applyNow(inst.id, preset);
    EMB.toast(EMB.t('Пресет «{label}» применён к «{name}»', { label: EMB.PERF_LABEL[preset], name: inst.name }), 'ok');
  } catch (e) {
    EMB.toast(e.message, 'err');
  }
};

EMB.actions.installPerfPack = async function installPerfPack() {
  const inst = EMB.selectedInst();
  if (!inst) return EMB.toast(t('Выберите сборку во вкладке «Сборки»'), 'err');
  if (EMB.isRust(inst)) return EMB.toast(t('Пакет оптимизации — это Java-моды. У Horizon и Rustcraft собственный движок, оптимизировать нечего'), 'err');
  if (inst.loader === 'vanilla') return EMB.toast(t('В Vanilla моды не ставятся. Создайте сборку с Fabric, Quilt, Forge или NeoForge'), 'err');
  EMB.state.progress = { stage: t('Оптимизация'), text: t('Начинаю…') };
  EMB.renderBusy();
  try {
    const r = await window.ember.perf.installPack(inst.id);
    const errText = r.errors && r.errors.length ? EMB.t(', ошибок: {n}', { n: r.errors.length }) : '';
    const noVer = r.unavailable && r.unavailable.length ? EMB.t(', нет для этой версии: {n}', { n: r.unavailable.length }) : '';
    const shText = r.shaders ? EMB.t(', шейдеры: {n}', { n: r.shaders }) : '';
    EMB.toast(EMB.t('Установлено модов: {n}, уже были: {m}', { n: r.installed.length, m: r.skipped.length }) + shText + noVer + errText, errText ? 'err' : 'ok');
  } catch (e) {
    EMB.toast(e.message, 'err');
  } finally {
    EMB.state.progress = null;
    EMB.renderBusy();
  }
};

EMB.actions.togglePalette = function togglePalette(open) {
  EMB.state.palette = open ? { q: '', sel: 0 } : null;
  EMB.renderModal();
};

EMB.actions.reloadSettings = async function reloadSettings() {
  EMB.state.settings = await window.ember.settings.get();
};

// Загружает список аккаунтов и выбирает активный
EMB.actions.loadAccounts = async function loadAccounts({ waitForSkin = true } = {}) {
  const r = await window.ember.accounts.list();
  EMB.state.accounts = r.accounts || [];
  EMB.state.selectedAccountId = r.selected || null;
  EMB.state.account = EMB.state.accounts.find(a => a.id === EMB.state.selectedAccountId) || null;
  // Перезагружаем текущий скин для нового активного аккаунта
  const skin = EMB.actions.refreshCurrentSkin();
  if (waitForSkin) await skin;
};

// Загружает текущий скин активного аккаунта (для предпросмотра)
EMB.actions.refreshCurrentSkin = async function refreshCurrentSkin() {
  if (!EMB.state.account) {
    EMB.state.skins.current = null;
    return;
  }
  try {
    EMB.state.skins.current = await window.ember.skins.current(EMB.state.account.id);
  } catch (_) {
    EMB.state.skins.current = null;
  }
  if (EMB.state.view === 'skins') EMB.renderView();
};

})();
