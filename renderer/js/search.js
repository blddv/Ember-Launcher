// Машинный состояния поиска модов: выдача, бесконечная прокрутка, статусы
// установленных модов и установка.
const EMB = (window.EMB = window.EMB || {});
const { t } = EMB;

EMB.search = EMB.search || {};
EMB.state.installStates = {};
EMB.search.observer = null;

EMB.search.refreshInstalled = async function refreshInstalled() {
  const inst = EMB.selectedInst();
  const items = (EMB.state.search.items || []).filter(it => it.kind === 'mod');
  if (!inst || !items.length) { EMB.state.installStates = {}; return; }
  const list = items.map(it => ({ source: it.source, id: it.id, slug: it.slug, kind: it.kind, title: it.title }));
  EMB.state.installStates = await window.ember.mods.states(inst.id, list).catch(() => ({})) || {};
};
EMB.search.installStateOf = it => {
  if (!it || it.kind !== 'mod') return 'none';
  return (EMB.state.installStates && EMB.state.installStates[`${it.source}:${it.id}`]) || 'none';
};

// Полная отрисовка результатов (при новом запросе)
EMB.search.renderResults = function renderResults() {
  const s = EMB.state.search;
  const box = EMB.$('#results');
  if (!box) return;
  if (s.error && !s.items.length) { box.innerHTML = `<div class="note warn">${EMB.esc(s.error)}</div>`; return; }
  const warn = s.error ? `<div class="note warn">${EMB.esc(s.error)}</div>` : '';
  if (!s.items.length && s.loading) { box.innerHTML = `<div class="empty">${t('Ищу…')}</div>`; return; }
  if (!s.items.length) { box.innerHTML = `<div class="empty">${t('Ничего не найдено. Попробуйте другой запрос или снимите фильтр по версии.')}</div>`; return; }
  box.innerHTML = `${warn}<div class="grid" id="grid">${s.items.map(EMB.search.itemCard).join('')}</div>${EMB.search.footerHTML()}`;
};

EMB.search.footerHTML = function footerHTML() {
  const s = EMB.state.search;
  if (s.loading && s.items.length) return `<div class="more-status" id="more-status">${t('Загружаю ещё…')}</div><div id="sentinel"></div>`;
  if (s.hasMore) return '<div id="sentinel" class="sentinel"></div>';
  if (s.items.length) return `<div class="more-status">${t('Это всё. Найдено: {n}', { n: s.items.length })}</div>`;
  return '';
};

EMB.search.setupInfinite = function setupInfinite() {
  const sentinel = EMB.$('#sentinel');
  const root = EMB.$('#view');
  if (EMB.search.observer) { EMB.search.observer.disconnect(); EMB.search.observer = null; }
  if (!sentinel || !root || !('IntersectionObserver' in window)) return;
  EMB.search.observer = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) EMB.search.loadMore();
  }, { root, rootMargin: '600px 0px' });
  EMB.search.observer.observe(sentinel);
};

// Догрузка следующей страницы без перерисовки всей сетки.
EMB.search.loadMore = async function loadMore() {
  const s = EMB.state.search;
  if (s.loading || !s.hasMore) return;
  await EMB.search.run(false);
};

// Статусы установленных модов не должны задерживать выдачу: обновляем их фоном
// и перерисовываем сетку, сохранив позицию прокрутки
EMB.search.refreshStates = function refreshStates(seq) {
  EMB.search.refreshInstalled().then(() => {
    if (seq !== EMB.state.search.seq || EMB.state.view !== 'mods') return;
    const view = EMB.$('#view');
    const top = view ? view.scrollTop : 0;
    EMB.search.renderResults();
    EMB.search.setupInfinite();
    if (view) view.scrollTop = top;
  }).catch(() => {});
};

EMB.search.run = async function runSearch(fresh = true) {
  const s = EMB.state.search;
  if (s.source === 'link') return;
  const inst = EMB.selectedInst();
  const src = EMB.SOURCES.find(x => x.id === s.source) || { platform: 'java' };
  const rustSource = src.platform === 'rust';
  const needLoader = !rustSource && s.kind === 'mod' && (s.source === 'modrinth' || s.source === 'curseforge' || s.source === 'github');
  // Моды .hmod не ищутся, пока выбрана Java-сборка: их всё равно некуда ставить
  const wrongPlatform = rustSource && !!inst && !EMB.isRust(inst);
  if ((needLoader && !EMB.hasLoader(inst)) || wrongPlatform) {
    s.items = []; s.hasMore = false; s.error = ''; s.loading = false;
    EMB.search.renderResults();
    return;
  }
  if (fresh) {
    s.items = []; s.hasMore = false; s.error = '';
    s.seq++;
    await EMB.search.refreshInstalled();
    EMB.search.renderResults();
  }
  const seq = s.seq;
  s.loading = true;
  const useInst = !rustSource && s.onlySameVersion && inst && s.source !== 'hangar' && s.source !== 'github';
  // Фильтр загрузчика: только для модов Java Edition. Rust-реестр знает только версию игры движка.
  const opts = {
    query: s.query,
    kind: s.kind,
    gameVersion: useInst ? inst.version : undefined,
    loader: !rustSource && s.kind === 'mod' && EMB.hasLoader(inst) ? inst.loader : undefined,
    offset: s.items.length,
  };
  if (!fresh) {
    const status = EMB.$('#more-status'); if (status) status.textContent = t('Загружаю ещё…');
  }
  try {
    const res = await window.ember.search(s.source, opts);
    if (seq !== s.seq) return; // устаревший ответ
    const seen = new Set(s.items.map(x => x.source + ':' + x.id));
    const fresh2 = res.items.filter(x => !seen.has(x.source + ':' + x.id));
    s.items = s.items.concat(fresh2);
    s.hasMore = !!res.hasMore && fresh2.length > 0;
    s.error = '';
    if (seq !== s.seq) return;
  } catch (e) {
    if (seq !== s.seq) return;
    s.error = e.message;
    s.hasMore = false;
  } finally {
    if (seq === s.seq) s.loading = false;
  }
  if (seq !== s.seq) return;
  EMB.search.refreshStates(seq); // статусы «уже установлено» — в фоне, выдача уже на экране
  if (fresh || !EMB.$('#grid') || s.error) { EMB.search.renderResults(); EMB.search.setupInfinite(); return; }
  // Догрузка: дописываем карточки в конец сетки, без перерисовки всей выдачи
  const grid = EMB.$('#grid');
  const from = grid.children.length;
  grid.insertAdjacentHTML('beforeend', s.items.slice(from).map((it, i) => EMB.search.itemCard(it, from + i)).join(''));
  const old = EMB.$('#view').querySelector('#sentinel, #more-status');
  if (old) old.remove();
  const tail = EMB.search.footerHTML();
  if (tail) EMB.$('#results').insertAdjacentHTML('beforeend', tail);
  EMB.search.setupInfinite();
};

EMB.search.installItem = async function installItem(idx) {
  const it = EMB.state.search.items[idx];
  const inst = EMB.selectedInst();
  if (!it) return;
  if (it.kind !== 'modpack' && it.kind !== 'plugin' && !inst) {
    return EMB.toast(t('Сначала создайте сборку во вкладке «Сборки»'), 'err');
  }
  const st = EMB.search.installStateOf(it);
  if (st === 'current') return EMB.toast(EMB.t('«{title}» уже есть в этой сборке', { title: it.title }), 'err');
  const update = st === 'outdated';
  EMB.state.progress = { stage: update ? t('Обновление') : t('Установка'), text: it.title };
  EMB.renderBusy();
  try {
    const res = await window.ember.install(it, inst && inst.id, { update });
    if (res.instance) {
      EMB.toast(EMB.t('Создана сборка «{name}» и выбрана', { name: res.instance.name }), 'ok');
    } else if (res.note) {
      EMB.toast(res.note, 'ok');
    } else if (update) {
      EMB.toast(EMB.t('«{title}» обновлён в «{name}»', { title: it.title, name: inst.name }), 'ok');
    } else {
      EMB.toast(EMB.t('Установлено в «{name}»: {n} файл(ов)', { name: inst.name, n: (res.installed || []).length }), 'ok');
    }
    await EMB.search.refreshInstalled();
    EMB.search.renderResults();
    await EMB.actions.reloadInstances();
  } catch (e) {
    EMB.toast(e.message, 'err');
  } finally {
    EMB.state.progress = null;
    EMB.renderBusy();
  }
};

EMB.search.itemCard = function itemCard(it, idx) {
  const st = EMB.search.installStateOf(it);
  const done = st === 'current';
  let action;
  if (done) {
    action = `<button class="btn small" disabled title="${t('Уже есть в этой сборке')}">${EMB.icon('check')} ${t('Уже установлено')}</button>`;
  } else if (st === 'outdated') {
    action = `<button class="btn small primary" data-act="install" data-idx="${idx}" title="${t('В сборке старая версия')}">${EMB.icon('download')} ${t('Обновить')}</button>`;
  } else {
    action = `<button class="btn small primary" data-act="install" data-idx="${idx}">${EMB.icon('download')} ${it.kind === 'modpack' ? t('Установить сборку') : it.kind === 'plugin' ? t('Скачать') : t('Установить')}</button>`;
  }
  return `
    <div class="item${done ? ' installed' : st === 'outdated' ? ' outdated' : ''}">
      <div class="head">
        ${it.icon ? `<img class="ico" src="${EMB.esc(it.icon)}" alt="" loading="lazy" decoding="async">` : `<div class="ico ph">${EMB.esc((it.title || '?')[0])}</div>`}
        <div style="min-width:0"><h4>${EMB.esc(it.title)}</h4><div class="by">${EMB.esc(it.author || '')}</div></div>
      </div>
      <p>${EMB.esc(it.description || '')}</p>
      ${it.meta ? `<div class="hint" style="margin:-2px 0 10px">${EMB.esc(it.meta)}</div>` : ''}
      <div class="foot">
        <span class="dl">${it.downloads != null ? EMB.fmt(it.downloads) + ' ' + t('загрузок') : ''}</span>
        <button class="btn small" data-act="open-web" data-idx="${idx}" title="${t('Открыть страницу')}">${EMB.icon('ext')}</button>
        ${action}
      </div>
    </div>`;
};
