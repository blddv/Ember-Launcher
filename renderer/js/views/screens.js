// Вкладка «Скриншоты».
const EMB = (window.EMB = window.EMB || {});
const { t } = EMB;

EMB.views = EMB.views || {};
EMB.views.screens = function viewScreens() {
  const list = EMB.state.screens;
  if (!list) return `<h1 class="page-title">${t('Скриншоты')}</h1><p class="page-sub">${t('Загружаю…')}</p>`;
  if (!list.length) {
    return `<h1 class="page-title">${t('Скриншоты')}</h1>
      <p class="page-sub">${t('Скриншоты из всех сборок. Снимок делается клавишей F2 в игре.')}</p>
      <div class="empty">${t('Скриншотов пока нет.')}</div>`;
  }
  return `<h1 class="page-title">${t('Скриншоты')}</h1>
    <p class="page-sub">${t('{n} шт. из всех сборок. Нажмите на снимок, чтобы открыть его.', { n: list.length })}</p>
    <div class="shots">
      ${list.map((s, i) => `
        <figure class="shot" data-act="open-shot" data-idx="${i}">
          <img src="${EMB.esc(s.url)}" alt="" loading="lazy" decoding="async">
          <figcaption><b>${EMB.esc(s.instance)}</b><span>${new Date(s.mtime).toLocaleDateString(EMB.localeTag(EMB.i18n.lang))}</span></figcaption>
        </figure>`).join('')}
    </div>`;
};

EMB.loadScreens = async function loadScreens() {
  EMB.state.screens = null;
  EMB.renderView();
  try { EMB.state.screens = await window.ember.screenshots(); } catch (e) { EMB.state.screens = []; EMB.toast(e.message, 'err'); }
  if (EMB.state.view === 'screens') EMB.renderView();
};
