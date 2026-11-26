// Вкладка «Моды и сборки»: источники, фильтры, предупреждения, поиск по ссылке.
const EMB = (window.EMB = window.EMB || {});
const { t } = EMB;

EMB.views = EMB.views || {};

EMB.views.mods = function viewMods() {
  const s = EMB.state.search;
  const inst = EMB.selectedInst();
  const rust = EMB.isRust(inst);

  // Источники под платформу выбранной сборки: Java-моды и моды для Rust не смешиваются.
  // Пока сборка не выбрана, показываем всё — так можно установить сборку из реестра Horizon.
  const sources = EMB.SOURCES.filter(src => !inst || src.platform === 'any' || (rust ? src.platform === 'rust' : src.platform === 'java'));
  if (!sources.some(src => src.id === s.source)) {
    s.source = sources[0].id;
    s.kind = EMB.KINDS[s.source][0][0];
  }
  const kinds = EMB.KINDS[s.source];
  if (!kinds.some(k => k[0] === s.kind)) s.kind = kinds[0][0];
  const src = EMB.SOURCES.find(x => x.id === s.source) || sources[0];

  const cfWarn = s.source === 'curseforge' && !EMB.state.settings.curseforgeKey
    ? `<div class="note warn" style="margin-bottom:14px">${t('Для CurseForge нужен бесплатный API-ключ. ')}<a href="#" data-act="go-settings">${t('Вставить в Настройках')}</a>${t(' — ключ берётся на console.curseforge.com.')}</div>`
    : '';
  const needLoader = s.kind === 'mod' && (s.source === 'modrinth' || s.source === 'curseforge' || s.source === 'github');
  const loaderWarn = !rust && needLoader && !EMB.hasLoader(inst)
    ? `<div class="empty loader-empty">
        <div class="big-ico">${EMB.icon('puzzle')}</div>
        <b>${inst ? EMB.t('В сборке «{name}» нет загрузчика модов', { name: inst.name }) : t('Нет выбранной сборки')}</b>
        <p>${t('Моды Java Edition работают только с загрузчиком: Fabric, Quilt, Forge или NeoForge. Чистая Vanilla их не запускает, поэтому список модов скрыт.')}</p>
        <div class="row" style="justify-content:center">
          ${EMB.MOD_LOADERS.map(l => `<button class="btn ${l === 'fabric' ? 'primary' : ''}" data-act="new-inst-loader" data-loader="${l}">${EMB.icon('plus')} ${t('Сборка с {label}', { label: EMB.LOADER_LABEL[l] })}</button>`).join('')}
        </div>
      </div>`
    : '';
  // Источник для Minecraft на Rust, а сборка Java (или не выбрана вовсе)
  const rustWarn = src.platform === 'rust' && !rust
    ? `<div class="empty loader-empty">
        <div class="big-ico">${EMB.icon('bolt')}</div>
        <b>${t('Это моды для Minecraft на Rust')}</b>
        <p>${t('Horizon запускает только .hmod из своего реестра: Java-сборка такой файл не увидит. Создайте сборку Horizon или откройте раздел «Minecraft Rust».')}</p>
        <div class="row" style="justify-content:center">
          <button class="btn primary" data-act="rust-new" data-platform="horizon">${EMB.icon('plus')} ${t('Создать сборку Horizon')}</button>
          <button class="btn" data-act="go-rust">${EMB.icon('bolt')} ${t('Что такое Minecraft на Rust')}</button>
        </div>
      </div>`
    : '';
  // Rustcraft — клиент без модов: искать .hmod для него бессмысленно
  const rustcraftWarn = inst && EMB.platformOf(inst) === 'rustcraft'
    ? `<div class="empty loader-empty">
        <div class="big-ico">${EMB.icon('bolt')}</div>
        <b>${t('Rustcraft запускается без модов')}</b>
        <p>${t('Это клиент вместо java.exe: он заменяет Java, но своей системы модов у него нет. Моды .hmod работают только в Horizon — там свой реестр. Ресурспаки в эту сборку ставить можно: вкладка «По ссылке», файл .zip.')}</p>
        <div class="row" style="justify-content:center">
          <button class="btn primary" data-act="rust-new" data-platform="horizon">${EMB.icon('plus')} ${t('Создать сборку Horizon')}</button>
          <button class="btn" data-act="go-rust">${EMB.icon('bolt')} ${t('Подробнее о движках')}</button>
        </div>
      </div>`
    : '';
  const blocked = loaderWarn || rustWarn || rustcraftWarn;

  const sameVer = s.onlySameVersion && inst;
  const where = inst
    ? EMB.t('Установка в «{name}» (Minecraft {version}, {loader})', { name: inst.name, version: inst.version, loader: EMB.loaderName(inst) })
    : t('Сборка не выбрана: моды ставить некуда, сборки из реестра создадут новую сборку');
  const platformHint = rust && EMB.platformOf(inst) === 'horizon'
    ? t(' Это сборка Horizon: Java-моды из Modrinth и CurseForge в неё не ставятся.')
    : '';
  const verNote = src.platform === 'java' && inst && !sameVer ? t(' Фильтр по версии выключён, проверяйте совместимость.') : '';

  // Поиск не рисуем вовсе, когда ставить некуда: блокирующая подсказка уже на экране
  const searchArea = blocked ? '' : `
    <div class="toolbar">
      <div class="search-box">
        ${EMB.icon('search')}
        <input class="input" id="search-q" placeholder="${src.platform === 'rust' ? t('Поиск: minimap, zoom, veinminer…') : t('Поиск: sodium, JEI, Better Minecraft…')}" value="${EMB.esc(s.query)}">
      </div>
    </div>
    <div id="results"></div>`;

  return `
    <h1 class="page-title">${t('Моды и сборки')}</h1>
    <p class="page-sub">${t('Java Edition: Modrinth, CurseForge, Hangar, Smithed и GitHub. Minecraft на Rust: реестр Horizon и .hmod из GitHub.')}</p>
    <div class="src-tabs">
      ${sources.map(src => `<button class="src-tab ${s.source === src.id ? 'active' : ''}" data-src="${src.id}"><i style="color:${src.color}"></i>${EMB.esc(src.label)}</button>`).join('')}
    </div>
    <div class="toolbar">
      <div class="seg">
        ${kinds.map(k => `<button class="${s.kind === k[0] ? 'active' : ''}" data-kind="${k[0]}">${EMB.esc(k[1])}</button>`).join('')}
      </div>
      <div class="grow"></div>
      <label class="hint check"><input type="checkbox" id="only-inst" ${s.onlySameVersion ? 'checked' : ''} ${s.source === 'hangar' || s.source === 'link' || src.platform === 'rust' ? 'disabled' : ''}> ${t('Только версия выбранной сборки')}</label>
      <select class="input" id="target-inst" style="min-width:260px" ${s.source === 'hangar' ? 'disabled' : ''}>
        ${EMB.state.instances.map(i => `<option value="${EMB.esc(i.id)}" ${i.id === EMB.state.selected ? 'selected' : ''}>${EMB.esc(i.name)} · ${EMB.esc(i.version)} · ${EMB.esc(EMB.loaderName(i))}</option>`).join('') || `<option>${t('Нет сборок')}</option>`}
      </select>
    </div>
    ${cfWarn}
    ${EMB.SOURCE_HINTS[s.source] ? `<div class="hint" style="margin-bottom:14px">${EMB.esc(EMB.SOURCE_HINTS[s.source])}</div>` : ''}
    ${s.source === 'link' ? EMB.views.mods.linkPanel() : `${blocked || ''}${searchArea}`}
    ${inst && s.source !== 'hangar' && s.source !== 'link' && !blocked ? `<div class="hint" style="margin-top:14px">${where}.${verNote}${platformHint}${s.kind === 'modpack' ? ' ' + t('Каждая сборка из этого списка создаёт новую сборку автоматически.') : ''}</div>` : ''}`;
};

EMB.views.mods.linkPanel = function linkPanel() {
  return `
    <div class="card">
      <h3>${t('Установить по ссылке')}</h3>
      <div class="toolbar" style="margin-bottom:0">
        <input class="input grow" id="link-url" placeholder="https://example.com/mod-1.0.jar">
        <button class="btn primary" data-act="install-link">${EMB.icon('download')} ${t('Установить')}</button>
      </div>
    </div>`;
};
