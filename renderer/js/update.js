(function () {
// Автообновление лаунчера: проверка, загрузка, установка и состояние.
const EMB = (window.EMB = window.EMB || {});
const { t } = EMB;

EMB.updateFlow = EMB.updateFlow || {};

EMB.updateFlow.check = async function checkUpdate() {
  EMB.state.update.checking = true;
  EMB.state.update.error = '';
  EMB.renderView();
  try {
    const r = await window.ember.update.check();
    if (r.ok === false) {
      EMB.state.update.error = r.error || t('Не удалось проверить обновления');
    } else {
      EMB.state.update.current = r.current || EMB.state.update.current;
      EMB.state.update.latest = r.latest || '';
      EMB.state.update.url = r.url || '';
      EMB.state.update.available = !!r.available;
      EMB.state.update.asset = r.asset || null;
      EMB.state.update.downloaded = false;
      EMB.state.update.downloadedPath = '';
      if (!r.available && r.latest) EMB.state.update.error = '';
      if (r.available) EMB.toast(t('Доступна версия {v}', { v: r.latest }), 'ok');
    }
  } catch (e) {
    EMB.state.update.error = e.message || String(e);
  } finally {
    EMB.state.update.checking = false;
    EMB.renderView();
  }
};

EMB.updateFlow.download = async function downloadUpdate() {
  const asset = EMB.state.update.asset;
  if (!asset) return EMB.updateFlow.check();
  EMB.state.update.downloading = true;
  EMB.state.update.error = '';
  EMB.renderView();
  try {
    const r = await window.ember.update.download(asset);
    EMB.state.update.downloaded = true;
    EMB.state.update.downloadedPath = r.path;
    EMB.toast(t('Обновление скачано — установите его'), 'ok');
  } catch (e) {
    EMB.state.update.error = e.message || String(e);
    EMB.toast(EMB.state.update.error, 'err');
  } finally {
    EMB.state.update.downloading = false;
    EMB.renderView();
  }
};

EMB.updateFlow.install = async function installUpdate() {
  if (!EMB.state.update.downloadedPath) return EMB.toast(t('Сначала скачайте обновление'), 'err');
  EMB.state.update.installing = true;
  EMB.renderView();
  try {
    const r = await window.ember.update.install(EMB.state.update.downloadedPath, EMB.state.update.asset && EMB.state.update.asset.name);
    if (r.ok) EMB.toast(r.message, 'ok');
    else EMB.toast(r.message || t('Не удалось установить обновление'), 'err');
  } catch (e) {
    EMB.toast(e.message || String(e), 'err');
  } finally {
    EMB.state.update.installing = false;
    EMB.renderView();
  }
};

EMB.updateFlow.applyState = function applyUpdateState(info) {
  if (!info) return;
  EMB.state.update.current = info.current || EMB.state.update.current;
  EMB.state.update.latest = info.latest || '';
  EMB.state.update.url = info.url || '';
  EMB.state.update.available = !!info.available;
  EMB.state.update.asset = info.asset || null;
  EMB.state.update.error = '';
  // Если версия поменялась — старый скачанный файл больше не подходит
  if (EMB.state.update.latest && EMB.state.update.latest !== (EMB.state.update.savedLatest || '')) {
    EMB.state.update.downloaded = false;
    EMB.state.update.downloadedPath = '';
  }
  EMB.state.update.savedLatest = EMB.state.update.latest;
  if (EMB.state.view === 'settings') EMB.renderView();
};

EMB.updateFlow.applyLite = function applyLite() {
  document.body.classList.toggle('lite', (EMB.state.settings.perf || {}).preset === 'potato');
};

EMB.updateFlow.applyAnimations = function applyAnimations() {
  document.body.classList.toggle('no-anim', !EMB.state.settings.animations);
};

})();
