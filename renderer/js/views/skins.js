// Вкладка «Скины»: каталоги, поиск по нику, текущий скин, применение.
const EMB = (window.EMB = window.EMB || {});
const { t } = EMB;

EMB.views = EMB.views || {};

EMB.views.skins = function viewSkins() {
  const s = EMB.state.skins;
  const a = EMB.state.account;

  const cur = s.current;
  const current = cur && cur.url
    ? `<div class="card" style="margin-bottom:16px">
        <div class="row" style="align-items:center;gap:14px">
          <img src="${EMB.esc(cur.url)}" alt="скин" class="skin-preview" id="skin-current-img">
          <div class="grow">
            <div style="font-weight:900">${t('Текущий скин')}</div>
            <div class="hint">${a ? EMB.esc(a.username) + ' · ' + EMB.accTypeLabel(a.type) : t('аккаунт не выбран')}</div>
            <div class="hint">${t('Модель: {model}', { model: cur.model === 'slim' ? 'Slim' : 'Classic' })}</div>
            <div class="hint mono" style="font-size:11px">${EMB.esc(cur.url)}</div>
          </div>
          <button class="btn sm" data-act="skin-refresh-current" title="${t('Обновить')}">${EMB.icon('refresh')}</button>
        </div>
      </div>`
    : `<div class="hint" style="margin-bottom:16px">${a ? t('Скин аккаунта отобразится здесь.') : t('Выберите аккаунт во вкладке «Аккаунт».')}</div>`;

  const modelRow = a && a.type === 'microsoft'
    ? `<div class="row" style="margin:12px 0">
        <label class="hint" style="margin:0">${t('Модель:')}</label>
        <button class="btn sm ${s.model === 'classic' ? 'primary' : ''}" data-act="skin-model" data-model="classic">Classic</button>
        <button class="btn sm ${s.model === 'slim' ? 'primary' : ''}" data-act="skin-model" data-model="slim">Slim</button>
      </div>`
    : '';

  const isMs = a && a.type === 'microsoft';
  const isEly = a && a.type === 'elyby';
  const applyRow = isMs
    ? `<div class="row" style="margin:12px 0">
        <button class="btn primary" data-act="skin-apply-file">${t('Загрузить файл скина')}</button>
        <button class="btn" data-act="skin-apply-url">${t('По ссылке')}</button>
      </div>
      <div class="row" style="margin-bottom:4px">
        <input class="input grow" id="skin-url-input" placeholder="${t('Ссылка на PNG-скин, например https://…/steve.png')}" value="${EMB.esc(s.urlInput)}" style="margin:0">
      </div>`
    : isEly
      ? `<div class="row" style="margin:12px 0">
        <button class="btn primary" data-act="skin-open-ely">${t('Открыть скин на ely.by')}</button>
      </div>
      <div class="hint" style="margin:0 0 8px">${t('Ely.by не имеет публичного API для смены скина — поставьте скин на сайте, игра подхватит его автоматически.')}</div>`
    : a && a.type === 'offline'
      ? `<div class="hint" style="margin:12px 0">${t('У оффлайн-аккаунта скина нет: войдите через Microsoft или Ely.by.')}</div>`
      : `<div class="hint" style="margin:12px 0">${t('Выберите аккаунт Microsoft или Ely.by во вкладке «Аккаунт».')}</div>`;

  // Каталог готовых скинов
  const catalogGrid = s.catalog.length
    ? `<div class="skin-grid">
        ${s.catalog.map(c => {
          const srcId = s.source === 'all' ? 'mojang' : s.source;
          const url = c.urls[srcId] || c.urls.mojang || c.urls.elyby;
          return `
          <div class="skin-card">
            <img src="${EMB.esc(url)}" alt="скин" class="skin-card-img">
            <div class="skin-meta">
              <div style="font-weight:700">${EMB.esc(c.name)}</div>
              <div class="hint">${EMB.esc(EMB.SKIN_SOURCE_LABEL[srcId] || srcId)}${c.desc ? ' · ' + EMB.esc(c.desc) : ''}</div>
            </div>
            <button class="btn sm primary" data-act="skin-pick" data-url="${EMB.esc(url)}" data-source="${EMB.esc(srcId)}">${t('Применить')}</button>
          </div>`;
        }).join('')}
      </div>`
    : `<div class="hint" style="padding:20px">${t('Каталог скинов не загрузился. Проверьте интернет и перезапустите лаунчер.')}</div>`;

  const results = s.items.length
    ? `<div class="skin-grid">
        ${s.items.map(it => `
          <div class="skin-card">
            <img src="${EMB.esc(it.url)}" alt="скин" class="skin-card-img">
            <div class="skin-meta">
              <div style="font-weight:700">${EMB.esc(it.name)}</div>
              <div class="hint">${EMB.esc(EMB.SKIN_SOURCE_LABEL[it.source] || it.source)}</div>
            </div>
            <button class="btn sm primary" data-act="skin-pick" data-url="${EMB.esc(it.url)}" data-source="${EMB.esc(it.source)}">${t('Применить')}</button>
          </div>`).join('')}
      </div>`
    : s.loading
      ? `<div class="hint" style="padding:20px">${t('Ищу скины…')}</div>`
      : '';

  const hint = !s.items.length && !s.loading
    ? `<div class="hint" style="padding:20px">${t('Выберите скин из каталога выше или введите ник игрока и нажмите «Поиск» — появятся скины этого игрока из каталогов. Нажмите «Применить», чтобы поставить скин себе (для Mojang — напрямую через API, для Ely.by — откроется страница).')}</div>`
    : '';

  return `
    <h1 class="page-title">${t('Скины')}</h1>
    <p class="page-sub">${t('Выберите скин из каталогов ely.by, Mojang и других по нику игрока. Скины можно ставить для аккаунтов Microsoft (официальный API) и Ely.by.')}</p>
    ${current}
    <div class="card" style="margin-bottom:16px">
      <div class="row">
        <input class="input grow" id="skin-query" placeholder="${t('Ник игрока, например Steve')}" value="${EMB.esc(s.query)}" style="margin:0">
        <button class="btn primary" data-act="skin-search">${EMB.icon('search')} ${t('Поиск')}</button>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn sm ${s.source === 'all' ? 'primary' : ''}" data-act="skin-source" data-src="all">${t('Все')}</button>
        ${s.sources.map(src => `<button class="btn sm ${s.source === src.id ? 'primary' : ''}" data-act="skin-source" data-src="${EMB.esc(src.id)}" style="border-color:${EMB.esc(src.color)};color:${EMB.esc(src.color)}">${EMB.esc(src.label)}</button>`).join('')}
      </div>
      ${applyRow}
      ${modelRow}
    </div>
    ${s.error ? `<div class="hint" style="color:var(--danger);margin-bottom:12px">${EMB.esc(s.error)}</div>` : ''}
    ${catalogGrid}
    ${results}
    ${hint}
    ${s.applying ? `<div class="hint" style="margin-top:12px">${t('Применяю скин…')}</div>` : ''}`;
};
