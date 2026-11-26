// Вкладка «Сборки»: список, карточки, модалки создания/обложки/краш-отчёта/модов,
// командная палитра и поиск обложек.
const EMB = (window.EMB = window.EMB || {});
const { t } = EMB;

EMB.views = EMB.views || {};
EMB.modals = EMB.modals || {};

EMB.views.instances = function viewInstances() {
  return `
    <div class="row" style="justify-content:space-between;margin-bottom:6px">
      <div><h1 class="page-title">${t('Сборки')}</h1>
      <p class="page-sub" style="margin-bottom:0">${t('Отдельная папка на каждую сборку: свои моды, миры и настройки.')}</p></div>
      <div class="row">
        <button class="btn" data-act="import-zip">${EMB.icon('upload')} ${t('Импорт .zip')}</button>
        <button class="btn primary" data-act="new-inst">${EMB.icon('plus')} ${t('Новая сборка')}</button>
      </div>
    </div>
    <div class="spacer"></div>
    <div class="search-bar">${EMB.icon('search')}<input class="input" id="inst-q" placeholder="${t('Поиск по названию, версии или загрузчику…')}" value="${EMB.esc(EMB.state.instQuery)}" autocomplete="off"></div>
    <div class="spacer"></div>
    <div class="grid" id="inst-grid">${EMB.modals.instCards()}</div>`;
};

EMB.modals.instCards = function instCards() {
  const q = EMB.state.instQuery.trim().toLowerCase();
  const list = EMB.state.instances.filter(i => !q || `${i.name} ${i.version} ${EMB.loaderName(i)}`.toLowerCase().includes(q));
  if (q && !list.length) return `<div class="empty" style="grid-column:1/-1">${t('Ничего не найдено')}</div>`;
  const add = q ? '' : `<div class="add-card" data-act="new-inst"><div><b>+ ${t('Новая сборка')}</b>${t('Vanilla, Fabric, Quilt, Forge, NeoForge или Minecraft на Rust')}</div></div>`;
  return list.map(EMB.modals.instCard).join('') + add;
};

EMB.modals.instCard = function instCard(i) {
  const running = EMB.state.runningId === i.id;
  const cover = i.coverUrl
    ? `<img class="cover" src="${EMB.esc(i.coverUrl)}" alt="" loading="lazy">`
    : `<div class="cover cover-empty">${EMB.esc((i.name || '?')[0].toUpperCase())}</div>`;
  const id = EMB.esc(i.id);
  return `
    <div class="inst ${i.id === EMB.state.selected ? 'selected' : ''}">
      ${cover}
      ${i.id === EMB.state.selected ? `<span class="selected-badge">${t('ВЫБРАНА')}</span>` : ''}
      ${running ? `<span class="running-badge">${t('ИГРАЕТ')}</span>` : ''}
      <div class="inst-info"><h4>${EMB.esc(i.name)}</h4><div class="by">${EMB.esc(EMB.fmtPlay(i.playMs))}</div></div>
      <div class="tags">
        <span class="tag">Minecraft ${EMB.esc(i.version)}</span>
        <span class="tag ${EMB.hasLoader(i) ? 'fab' : ''}">${EMB.esc(EMB.loaderName(i))}</span>
        ${EMB.isRust(i) ? `<span class="tag fab">${EMB.esc((EMB.RUST_PLATFORMS.find(p => p.id === EMB.platformOf(i)) || {}).label || 'Rust')} · Rust</span>` : ''}
      </div>
      <div class="actions">
        ${i.id === EMB.state.selected ? '' : `<button class="btn small primary" data-act="select-inst" data-id="${id}">${t('Выбрать')}</button>`}
        <button class="btn small" data-act="mods-manager" data-id="${id}">${EMB.icon('puzzle')} ${t('Моды')}</button>
        <button class="btn small" data-act="pick-cover" data-id="${id}" title="${t('Обложка')}">${EMB.icon('image')}</button>
        <button class="btn small" data-act="open-inst" data-id="${id}">${EMB.icon('folder')} ${t('Папка')}</button>
        <button class="btn small" data-act="last-crash" data-id="${id}" title="${t('Последний краш-отчёт')}">${EMB.icon('alert')}</button>
        <button class="btn small" data-act="dup-inst" data-id="${id}" title="${t('Дубликат')}">${EMB.icon('copy')}</button>
        <button class="btn small" data-act="export-inst" data-id="${id}" title="${t('Экспорт в zip')}">${EMB.icon('archive')}</button>
        <button class="btn small" data-act="backup-inst" data-id="${id}" title="${t('Резервная копия миров')}">${EMB.icon('download')}</button>
        <button class="btn small danger" data-act="del-inst" data-id="${id}">${EMB.icon('trash')}</button>
      </div>
    </div>`;
};

EMB.modals.loaderBlockHTML = function loaderBlockHTML(m) {
  if (m.loader === 'vanilla') return `<div class="hint">${t('Vanilla — без модов.')}</div>`;
  const lv = EMB.state.loaderCache[`${m.loader}|${m.version}`];
  if (!lv || lv.loading) return `<div class="hint">${t('Загружаю список версий загрузчика…')}</div>`;
  if (lv.error) return `<div class="note warn">${EMB.esc(lv.error)}</div>`;
  return `<select class="input" id="ni-lv">
      <option value="">${t('Авто (рекомендуемая)')}</option>
      ${lv.list.slice(0, 60).map(v => `<option value="${EMB.esc(v)}" ${v === m.loaderVersion ? 'selected' : ''}>${EMB.esc(v)}</option>`).join('')}
    </select>`;
};

EMB.modals.coverBoxHTML = function coverBoxHTML(cover, letter = '?') {
  if (cover && cover.url) return `<div class="cover-preview"><img src="${EMB.esc(cover.url)}" alt=""></div>`;
  if (cover && cover.file) return `<div class="cover-preview"><div class="cover-file">${EMB.icon('image')}<span>${EMB.esc(cover.name || t('Файл выбран'))}</span></div></div>`;
  return `<div class="cover-preview"><div class="cover-file muted">${EMB.icon('image')}<span>${t('Без обложки: в списке будет буква «{letter}»', { letter: EMB.esc(letter) })}</span></div></div>`;
};

EMB.modals.coverSearchHTML = function coverSearchHTML() {
  const cs = EMB.state.coverSearch;
  return `
    <div class="field" style="margin-top:14px"><label>${t('Поиск картинки')}</label>
      <div class="search-bar">${EMB.icon('search')}<input class="input" id="cs-q" placeholder="${t('Например: Create, выживание, RPG…')}" value="${EMB.esc(cs.q)}" autocomplete="off"></div>
      <div class="hint">${t('Иконки модпаков и модов с Modrinth. Выберите подходящую — она станет обложкой.')}</div>
    </div>
    <div id="cs-results">${EMB.modals.coverResultsHTML()}</div>`;
};

EMB.modals.coverResultsHTML = function coverResultsHTML() {
  const cs = EMB.state.coverSearch;
  if (!cs) return '';
  if (cs.loading) return `<div class="hint">${t('Ищу картинки…')}</div>`;
  if (cs.error) return `<div class="note warn">${EMB.esc(cs.error)}</div>`;
  if (!cs.items.length) return `<div class="hint">${cs.q.trim() ? t('Ничего не найдено. Попробуйте другое слово или выберите файл с диска.') : t('Введите название — покажу подходящие картинки.')}</div>`;
  const cur = EMB.state.modal && EMB.state.modal.type === 'new' ? EMB.state.modal.cover : null;
  return `<div class="cover-grid">${cs.items.map((it, i) => `
      <button class="cover-opt ${cur && cur.url === it.icon ? 'picked' : ''}" data-act="${cs.act}" data-idx="${i}" title="${EMB.esc(it.title)}">
        <img src="${EMB.esc(it.icon)}" alt="" loading="lazy">
        <span>${EMB.esc(it.title)}</span>
      </button>`).join('')}</div>`;
};

// Блок выбора версии Rust-движка (заменяет выбор загрузчика)
EMB.modals.rustBlockHTML = function rustBlockHTML(m) {
  const p = EMB.RUST_PLATFORMS.find(x => x.id === (m.platform || 'horizon')) || EMB.RUST_PLATFORMS[0];
  const info = (EMB.state.rustInfo || []).find(x => x.id === p.id) || {};
  const cache = EMB.state.rustCache[p.id];
  const head = `<div class="hint" style="margin-bottom:8px">Minecraft ${EMB.esc(info.game || p.game)} · движок ${EMB.esc(p.label)}. ${info.mods ? t('У него свой реестр модов .hmod.') : t('Модов нет: только игра и ресурспаки.')}</div>`;
  if (!cache || cache.loading) return `${head}<div class="hint">${t('Загружаю версии {label}…', { label: EMB.esc(p.label) })}</div>`;
  if (cache.error) return `${head}<div class="note warn">${EMB.esc(cache.error)}</div>`;
  return `${head}
    <select class="input" id="ni-rust-tag">
      <option value="">${t('Авто (последняя версия)')}</option>
      ${cache.list.slice(0, 40).map(r => `<option value="${EMB.esc(r.tag)}" ${r.tag === m.loaderVersion ? 'selected' : ''}>${EMB.esc(r.tag)}${r.prerelease ? ' (' + t('тест') + ')' : ''}</option>`).join('')}
    </select>
    <div class="hint">${t('Движок скачается с GitHub. Horizon один раз готовит данные из вашей копии Minecraft {game}; JDK 25 лаунчер скачает сам.', { game: EMB.esc(p.game) })}</div>`;
};

EMB.modals.modalNewInstance = function modalNewInstance() {
  const m = EMB.state.modal;
  const plat = m.platform || 'java';
  const rust = plat !== 'java';
  const versions = EMB.state.versions.filter(v => (m.snap ? true : v.type === 'release'));
  const opts = versions.map(v => `<option value="${EMB.esc(v.id)}" ${v.id === m.version ? 'selected' : ''}>${EMB.esc(v.id)}${v.type !== 'release' ? ' (' + t('снапшот') + ')' : ''}</option>`).join('');
  const letter = (m.name || t('Новая сборка'))[0].toUpperCase();
  const rustP = EMB.RUST_PLATFORMS.find(x => x.id === plat);
  const rustInfo = (EMB.state.rustInfo || []).find(x => x.id === plat) || {};

  return `
  <div class="modal-bg" data-act="close-modal">
    <div class="modal wide ni-modal">
      <h2>${t('Новая сборка')}</h2>
      <div class="ni-layout">
        <div class="ni-form">
          <div class="field"><label>${t('Название')}</label><input class="input" id="ni-name" placeholder="${t('Например: Выживание')}" value="${EMB.esc(m.name)}" maxlength="64" autocomplete="off"></div>
          <div class="field"><label>${t('Платформа')}</label>
            <div class="seg wrap">
              <button class="${!rust ? 'active' : ''}" data-platform="java">Java Edition</button>
              ${EMB.RUST_PLATFORMS.map(p => `<button class="${plat === p.id ? 'active' : ''}" data-platform="${p.id}">${p.label} (Rust)</button>`).join('')}
            </div>
            <div class="hint">${t('Minecraft на Rust — отдельный движок: своя папка, свои моды (.hmod) и своя страница «Minecraft Rust». Java-моды и загрузчики к нему не подходят.')}</div>
          </div>
          ${rust ? `
          <div class="grid-2 tight">
            <div class="field"><label>${t('Версия движка {label}', { label: EMB.esc(rustP ? rustP.label : '') })}</label><div id="ni-rust-wrap">${EMB.modals.rustBlockHTML(m)}</div></div>
            <div class="field"><label>Minecraft</label><input class="input" value="${EMB.esc((rustInfo.game || (rustP && rustP.game) || '26.3'))}" disabled></div>
          </div>
          <div class="note" style="margin-top:4px">${t('Аккаунт Java не нужен: Horizon входит в игру сам{rustcraft}. Данные игры берутся из вашей копии Minecraft.', { rustcraft: rustP && rustP.id === 'rustcraft' ? t(', Rustcraft запускается с ником из лаунчера') : '' })}</div>
          ` : `
          <div class="grid-2 tight">
            <div class="field"><label>${t('Версия Minecraft')}</label>
              <select class="input" id="ni-version">${opts}</select>
              <label class="check"><input type="checkbox" id="ni-snap" ${m.snap ? 'checked' : ''}> ${t('показать снапшоты')}</label>
            </div>
            <div class="field"><label>${t('Версия загрузчика')}</label><div id="ni-lv-wrap">${EMB.modals.loaderBlockHTML(m)}</div></div>
          </div>
          <div class="field"><label>${t('Загрузчик модов')}</label>
            <div class="seg wrap">
              ${EMB.LOADERS.map(l => `<button class="${m.loader === l.id ? 'active' : ''}" data-loader="${l.id}">${l.label}</button>`).join('')}
            </div>
            <div class="hint">${t('Моды Fabric, Quilt, Forge и NeoForge ставятся только в сборку с подходящим загрузчиком. Forge и NeoForge устанавливаются автоматически при первом запуске.')}</div>
          </div>`}
        </div>
        <div class="ni-cover">
          <div class="field"><label>${t('Обложка')}</label>
            <div id="ni-cover-box">${EMB.modals.coverBoxHTML(m.cover, letter)}</div>
            <div class="row" style="margin-top:8px">
              <button class="btn small" data-act="ni-pick-file">${EMB.icon('folder')} ${t('Файл…')}</button>
              <button class="btn small" data-act="ni-clear-cover">${t('Без обложки')}</button>
            </div>
          </div>
          ${EMB.modals.coverSearchHTML()}
        </div>
      </div>
      <div class="actions">
        <button class="btn" data-act="close-modal">${t('Отмена')}</button>
        <button class="btn primary" data-act="create-inst">${t('Создать')}</button>
      </div>
    </div>
  </div>`;
};

EMB.modals.modalCover = function modalCover() {
  const m = EMB.state.modal;
  const inst = EMB.state.instances.find(i => i.id === m.instId);
  const name = inst && inst.name ? inst.name : '?';
  const big = inst && inst.coverUrl
    ? `<img class="cover-big" src="${EMB.esc(inst.coverUrl)}" alt="">`
    : `<div class="cover-big cover-empty">${EMB.esc(name[0].toUpperCase())}</div>`;
  return `
  <div class="modal-bg" data-act="close-modal">
    <div class="modal wide ni-modal">
      <h2>${t('Обложка: {name}', { name: EMB.esc(name) })}</h2>
      <div class="ni-layout">
        <div class="ni-cover-solo">${big}</div>
        <div class="ni-cover">
          ${EMB.modals.coverSearchHTML()}
          <div class="row" style="margin-top:10px">
            <button class="btn" data-act="cv-pick-file">${EMB.icon('folder')} ${t('Файл с диска…')}</button>
            <button class="btn" data-act="cv-clear">${t('Убрать обложку')}</button>
          </div>
        </div>
      </div>
      <div class="actions"><button class="btn primary" data-act="close-modal">${t('Готово')}</button></div>
    </div>
  </div>`;
};

EMB.modals.modalCrash = function modalCrash() {
  const m = EMB.state.modal;
  return `
  <div class="modal-bg" data-act="close-modal">
    <div class="modal wide">
      <h2>${t('Последний краш-отчёт')}</h2>
      <div class="hint mono" style="margin-bottom:8px;word-break:break-all">${EMB.esc(m.path)}</div>
      <pre class="crash-text">${EMB.esc(m.text)}</pre>
      <div class="actions">
        <button class="btn" data-act="crash-open" data-path="${EMB.esc(m.path)}">${EMB.icon('ext')} ${t('Открыть файл')}</button>
        <button class="btn primary" data-act="close-modal">${t('Закрыть')}</button>
      </div>
    </div>
  </div>`;
};

EMB.modals.modalMods = function modalMods() {
  const m = EMB.state.modal;
  const inst = EMB.state.instances.find(i => i.id === m.instId);
  const list = m.list;
  const rows = !list ? `<div class="empty">${t('Загружаю список…')}</div>`
    : !list.length ? `<div class="empty">${t('Своих модов пока нет. Установите моды из «Моды и сборки».')}</div>`
    : list.map(x => `
      <div class="mod-row ${x.enabled ? '' : 'off'}">
        <div class="grow">
          <b>${EMB.esc(x.name)}</b>
          <div class="hint">${EMB.esc(x.file)} · ${EMB.fmtMB(x.size)}</div>
        </div>
        <label class="toggle"><input type="checkbox" data-act-change="mod-toggle" data-file="${EMB.esc(x.file)}" ${x.enabled ? 'checked' : ''}><span class="track"></span></label>
        <button class="btn small danger" data-act="mod-del" data-file="${EMB.esc(x.file)}" title="${t('Удалить')}">${EMB.icon('trash')}</button>
      </div>`).join('');
  const hidden = m.hidden
    ? `<div class="hint hidden-note">${t('Скрыто: {hidden}. Это Fabric API, Orange Visuals и моды, которые лаунчер поставил сам (зависимости и пакет оптимизации).', { hidden: EMB.esc(m.hidden) })}</div>` : '';
  return `
  <div class="modal-bg" data-act="close-modal">
    <div class="modal wide">
      <h2>${t('Моды: {name}', { name: EMB.esc(inst ? inst.name : '') })}</h2>
      <div class="hint" style="margin-bottom:12px">${inst ? EMB.esc(EMB.loaderName(inst)) + ' · Minecraft ' + EMB.esc(inst.version) : ''}. ${inst && EMB.isRust(inst) ? t('Моды .hmod из реестра Horizon: включение и выключение пишется в horizon-mods.txt.') : t('Выключенный мод переименовывается в .disabled и не загружается.')}</div>
      <div class="mod-list">${rows}</div>
      ${hidden}
      <div class="actions">
        <button class="btn" data-act="mods-open-folder" data-id="${EMB.esc(m.instId)}">${EMB.icon('folder')} ${t('Открыть папку модов')}</button>
        <button class="btn primary" data-act="close-modal">${t('Готово')}</button>
      </div>
    </div>
  </div>`;
};

EMB.modals.modalPalette = function modalPalette() {
  const p = EMB.state.palette;
  const items = EMB.modals.paletteItems().filter(it => !p.q || it.label.toLowerCase().includes(p.q.toLowerCase()));
  p.sel = Math.min(p.sel, Math.max(0, items.length - 1));
  return `
  <div class="modal-bg palette-bg" data-act="close-palette">
    <div class="palette">
      <input class="input palette-input" id="pal-q" placeholder="${t('Команда или раздел…')}" value="${EMB.esc(p.q)}" autocomplete="off">
      <div class="palette-list">
        ${items.map((it, i) => `<div class="pal-item ${i === p.sel ? 'sel' : ''}" data-pal="${i}"><span>${EMB.esc(it.label)}</span><small>${EMB.esc(it.hint || '')}</small></div>`).join('') || `<div class="empty" style="padding:24px">${t('Ничего не найдено')}</div>`}
      </div>
    </div>
  </div>`;
};

EMB.modals.paletteItems = function paletteItems() {
  const nav = EMB.NAV.flatMap(g => g.items).map(it => ({ label: EMB.t('Перейти: {label}', { label: it.label }), run: () => EMB.setView(it.id) }));
  return [
    { label: t('Играть (выбранная сборка)'), hint: t('Запуск'), run: () => EMB.actions.launch() },
    { label: EMB.state.running ? t('Остановить игру') : t('Остановить игру (сейчас не запущена)'), run: () => window.ember.game.stop() },
    { label: t('Новая сборка'), run: () => EMB.modals.openNewInstance() },
    { label: t('Новая сборка Horizon (Minecraft на Rust)'), hint: t('Rust'), run: () => EMB.modals.openRustInstance('horizon') },
    { label: t('Моды для Minecraft на Rust (реестр Horizon)'), hint: t('Rust'), run: () => EMB.setView('rust') },
    { label: t('Импорт сборки из .zip'), run: () => EMB.actions.importZip() },
    { label: t('Оптимизация: применить пресет к выбранной сборке'), run: () => EMB.actions.applyPerf() },
    { label: t('Поиск модов'), run: () => EMB.setView('mods') },
    ...nav,
  ];
};

// Перерисовка модалки сохраняет фокус и позицию курсора в поле, которое было активно.
EMB.renderModal = function renderModal() {
  const root = EMB.$('#modal-root');
  const ae = document.activeElement;
  const focusId = ae && ae.id && root.contains(ae) ? ae.id : null;
  const range = focusId && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null;

  if (EMB.state.palette) {
    root.innerHTML = EMB.modals.modalPalette();
    const q = EMB.$('#pal-q');
    if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    return;
  }
  if (!EMB.state.modal) { root.innerHTML = ''; return; }

  // Запоминаем значения всех полей модалки: перерисовка не должна терять набранный текст
  const kept = {};
  root.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
    if (el.type === 'checkbox' || el.type === 'radio') return;
    kept[el.id] = el.value;
  });

  const m = EMB.state.modal;
  if (m.type === 'new') root.innerHTML = EMB.modals.modalNewInstance();
  else if (m.type === 'mods') root.innerHTML = EMB.modals.modalMods();
  else if (m.type === 'cover') root.innerHTML = EMB.modals.modalCover();
  else if (m.type === 'crash') root.innerHTML = EMB.modals.modalCrash();

  for (const id of Object.keys(kept)) {
    const el = document.getElementById(id);
    if (el && el.value !== kept[id] && el.tagName !== 'SELECT') el.value = kept[id];
  }

  if (m.autofocus) {
    m.autofocus = false;
    const el = EMB.$('#ni-name') || EMB.$('#cs-q');
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  } else if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      if (range && el.setSelectionRange) el.setSelectionRange(range[0], range[1]);
    }
  }
};

// Читает значения полей модалки в состояние, прежде чем её перерисовать
EMB.modals.syncModal = function syncModal() {
  if (!EMB.state.modal || EMB.state.modal.type !== 'new') return;
  const n = EMB.$('#ni-name');
  const v = EMB.$('#ni-version');
  const lv = EMB.$('#ni-lv');
  const rt = EMB.$('#ni-rust-tag');
  if (n) EMB.state.modal.name = n.value;
  if (v) EMB.state.modal.version = v.value;
  if (lv) EMB.state.modal.loaderVersion = lv.value;
  // Rust-сборка: выбранная версия движка (пусто — последняя)
  if (rt) EMB.state.modal.loaderVersion = rt.value;
};

// Обновляет только блок «Версия загрузчика», без перерисовки всей модалки и без потери фокуса
EMB.modals.refreshLoaderBlock = function refreshLoaderBlock() {
  const m = EMB.state.modal;
  if (!m || m.type !== 'new') return;
  const w = EMB.$('#ni-lv-wrap');
  if (w) w.innerHTML = EMB.modals.loaderBlockHTML(m);
};

EMB.modals.ensureLoaderList = async function ensureLoaderList(loader, mc) {
  if (loader === 'vanilla' || !mc) return;
  const key = `${loader}|${mc}`;
  if (EMB.state.loaderCache[key]) return;
  EMB.state.loaderCache[key] = { loading: true };
  EMB.modals.refreshLoaderBlock();
  try {
    const list = await window.ember.loaderVersions(loader, mc);
    EMB.state.loaderCache[key] = { list };
  } catch (e) {
    EMB.state.loaderCache[key] = { error: EMB.t('Не удалось получить версии {label}: {msg}', { label: EMB.LOADER_LABEL[loader], msg: e.message }) };
  }
  EMB.modals.refreshLoaderBlock();
};

EMB.modals.newCoverSearch = function newCoverSearch(act) {
  return { act, q: '', items: [], loading: false, error: '', seq: 0 };
};

EMB.modals.openNewInstance = function openNewInstance(loader = 'fabric') {
  EMB.state.modal = {
    type: 'new', platform: 'java', name: '', version: EMB.releaseId(), loader, loaderVersion: '',
    snap: false, cover: null, autofocus: true,
  };
  EMB.state.coverSearch = EMB.modals.newCoverSearch('ni-pick-result');
  EMB.renderModal();
  EMB.modals.ensureLoaderList(loader, EMB.state.modal.version);
};

// Сборка Minecraft на Rust: загрузчика нет, вместо него — версия движка
EMB.modals.openRustInstance = function openRustInstance(platformId = 'horizon') {
  const p = EMB.RUST_PLATFORMS.find(x => x.id === platformId) || EMB.RUST_PLATFORMS[0];
  const info = (EMB.state.rustInfo || []).find(x => x.id === p.id) || {};
  const game = info.game || p.game;
  EMB.state.modal = {
    type: 'new', platform: p.id, name: '', version: game, gameVersion: game,
    loader: p.id, loaderVersion: '', snap: false, cover: null, autofocus: true,
  };
  EMB.state.coverSearch = EMB.modals.newCoverSearch('ni-pick-result');
  EMB.renderModal();
  EMB.modals.ensureRustList(p.id);
};

EMB.modals.ensureRustList = async function ensureRustList(platformId) {
  const hit = EMB.state.rustCache[platformId];
  if (hit && !hit.error) return;
  EMB.state.rustCache[platformId] = { loading: true };
  try {
    const list = await window.ember.rust.releases(platformId);
    EMB.state.rustCache[platformId] = { list };
  } catch (e) {
    EMB.state.rustCache[platformId] = { error: EMB.t('Не удалось получить версии {platform}: {msg}', { platform: platformId, msg: e.message }) };
  }
  if (EMB.state.modal && EMB.state.modal.type === 'new' && EMB.state.modal.platform === platformId) {
    const w = EMB.$('#ni-rust-wrap');
    if (w) w.innerHTML = EMB.modals.rustBlockHTML(EMB.state.modal);
  }
};

EMB.modals.openCoverModal = function openCoverModal(id) {
  const inst = EMB.state.instances.find(i => i.id === id);
  if (!inst) return;
  EMB.state.modal = { type: 'cover', instId: id, autofocus: true };
  EMB.state.coverSearch = EMB.modals.newCoverSearch('cv-pick-result');
  EMB.state.coverSearch.q = inst.name;
  EMB.renderModal();
  EMB.modals.runCoverSearch();
};

EMB.modals.paintCoverResults = function paintCoverResults() {
  const el = EMB.$('#cs-results');
  if (el) el.innerHTML = EMB.modals.coverResultsHTML();
};

EMB.modals.runCoverSearch = async function runCoverSearch() {
  const cs = EMB.state.coverSearch;
  if (!cs) return;
  const q = cs.q.trim();
  const seq = ++cs.seq;
  if (!q) {
    cs.items = []; cs.loading = false; cs.error = '';
    return EMB.modals.paintCoverResults();
  }
  cs.loading = true; cs.error = '';
  EMB.modals.paintCoverResults();
  let items = [];
  let error = '';
  try {
    items = await window.ember.covers.search(q);
  } catch (e) {
    error = e.message;
  }
  if (seq !== cs.seq) return;
  cs.items = items;
  cs.error = error;
  cs.loading = false;
  EMB.modals.paintCoverResults();
};
