(function () {
// Обработчики интерфейса: клики, переключатели, ввод, клавиатура, drag-регион
// и события из main-процесса.
const EMB = (window.EMB = window.EMB || {});
const { t } = EMB;

EMB.events = EMB.events || {};

// Linux/X11 (KDE Plasma): двигаем frameless-окно сами, без CSS drag-региона.
// Слушатели висят на document, поэтому переживают перерисовку #app.
EMB.events.setupManualWindowDrag = function setupManualWindowDrag() {
  let dragging = false;
  const stop = () => {
    if (!dragging) return;
    dragging = false;
    window.ember.win.dragEnd().catch(() => {});
  };
  document.addEventListener('mousedown', e => {
    if (e.button !== 0 || dragging) return;
    const bar = e.target.closest && e.target.closest('.titlebar');
    if (!bar || e.target.closest('button, a, input, select, textarea, label')) return;
    dragging = true;
    window.ember.win.dragStart()
      .then(ok => {
        // Быстрый клик: mouseup уже пришёл, пока шёл IPC — сразу снимаем захват
        if (!ok || !dragging) {
          dragging = false;
          window.ember.win.dragEnd().catch(() => {});
        }
      })
      .catch(() => { dragging = false; });
  });
  window.addEventListener('mouseup', stop);
  window.addEventListener('blur', stop);
  document.addEventListener('dblclick', e => {
    const bar = e.target.closest && e.target.closest('.titlebar');
    if (bar && !e.target.closest('button, a, input, select, textarea')) window.ember.win.max().catch(() => {});
  });
};

EMB.events.setupEvents = function setupEvents() {
  // Broken images (недоступные скины/обложки) не показываем как «галочку» — приглушаем
  document.addEventListener('error', e => {
    if (e.target && e.target.tagName === 'IMG') e.target.classList.add('img-broken');
  }, true);
  window.ember.on('progress', p => {
    EMB.state.progress = p;
    EMB.renderBusy();
  });
  window.ember.on('log', t2 => {
    EMB.state.logs += t2;
    if (EMB.state.logs.length > 60000) EMB.state.logs = EMB.state.logs.slice(-40000);
    const c = EMB.$('#console');
    if (c) {
      c.textContent += t2;
      c.scrollTop = c.scrollHeight;
    }
  });
  window.ember.on('game:state', s => {
    EMB.state.running = !!s.running;
    EMB.state.runningId = s.running ? s.instanceId : null;
    if (!s.running) {
      EMB.state.preparing = false;
      if (s.error) EMB.toast(s.error, 'err');
      else if (typeof s.code === 'number') EMB.toast(EMB.t('Minecraft закрыт (код {code})', { code: s.code }) + (s.playMs ? EMB.t(', сессия ') + EMB.fmtPlay(s.playMs) : ''));
      EMB.actions.reloadInstances();
    }
    if (EMB.state.view === 'home') EMB.renderView();
    EMB.renderBusy();
  });
  window.ember.on('mod:status', m => {
    EMB.state.mod = m;
    if (EMB.state.view === 'home') EMB.renderView();
  });
  // Автопроверка при запуске и прогресс загрузки обновления
  window.ember.on('update:available', info => {
    EMB.updateFlow.applyState(info);
    if (info && info.available) EMB.toast(EMB.t('Доступна версия {v}', { v: info.latest }), 'ok');
  });
  window.ember.on('update:progress', p => {
    EMB.state.update.progress = p;
    if (EMB.state.view === 'settings') EMB.renderView();
  });
};

EMB.onClick = async function onClick(e) {
  const link = e.target.closest('a');
  if (link) e.preventDefault();

  const navEl = e.target.closest('[data-nav]');
  if (navEl) return EMB.setView(navEl.dataset.nav);
  const goEl = e.target.closest('[data-nav-go]');
  if (goEl) return EMB.setView(goEl.dataset.navGo);
  const accDotEl = e.target.closest('[data-act="acc-dot"]');
  if (accDotEl) {
    await window.ember.accounts.select(accDotEl.dataset.id);
    await EMB.actions.loadAccounts();
    EMB.renderSidebarFoot();
    if (EMB.state.view === 'home') EMB.renderView();
    return;
  }

  const srcEl = e.target.closest('[data-src]');
  if (srcEl) {
    EMB.state.search.source = srcEl.dataset.src;
    EMB.state.search.kind = EMB.KINDS[EMB.state.search.source][0][0];
    EMB.renderView();
    return EMB.search.run(true);
  }
  const kindEl = e.target.closest('[data-kind]');
  if (kindEl) {
    EMB.state.search.kind = kindEl.dataset.kind;
    EMB.renderView();
    return EMB.search.run(true);
  }
  const platEl = e.target.closest('[data-platform]');
  if (platEl && EMB.state.modal && EMB.state.modal.type === 'new') {
    EMB.modals.syncModal();
    const next = platEl.dataset.platform;
    if (next === 'java') {
      EMB.state.modal.platform = 'java';
      EMB.state.modal.loader = 'fabric';
      EMB.state.modal.loaderVersion = '';
      EMB.state.modal.version = EMB.state.modal.version || EMB.releaseId();
      EMB.renderModal();
      return EMB.modals.ensureLoaderList('fabric', EMB.state.modal.version);
    }
    const p = EMB.RUST_PLATFORMS.find(x => x.id === next) || EMB.RUST_PLATFORMS[0];
    const info = (EMB.state.rustInfo || []).find(x => x.id === p.id) || {};
    EMB.state.modal.platform = p.id;
    EMB.state.modal.loader = p.id;
    EMB.state.modal.loaderVersion = '';
    EMB.state.modal.version = info.game || p.game;
    EMB.state.modal.gameVersion = EMB.state.modal.version;
    EMB.renderModal();
    return EMB.modals.ensureRustList(p.id);
  }
  const loaderEl = e.target.closest('[data-loader]');
  if (loaderEl && EMB.state.modal && EMB.state.modal.type === 'new') {
    EMB.modals.syncModal();
    EMB.state.modal.loader = loaderEl.dataset.loader;
    EMB.state.modal.loaderVersion = '';
    EMB.renderModal();
    return EMB.modals.ensureLoaderList(EMB.state.modal.loader, EMB.state.modal.version);
  }
  const palEl = e.target.closest('[data-pal]');
  if (palEl && EMB.state.palette) {
    const items = EMB.modals.paletteItems().filter(it => !EMB.state.palette.q || it.label.toLowerCase().includes(EMB.state.palette.q.toLowerCase()));
    const it = items[+palEl.dataset.pal];
    EMB.actions.togglePalette(false);
    if (it) it.run();
    return;
  }

  const actEl = e.target.closest('[data-act]');
  if (!actEl) return;
  const act = actEl.dataset.act;

  // Клик по подложке закрывает модалку (но не по содержимому)
  if (act === 'close-modal' || act === 'close-palette') {
    if (actEl.classList.contains('modal-bg') && e.target !== actEl) return;
    if (act === 'close-palette') return EMB.actions.togglePalette(false);
    EMB.state.modal = null;
    return EMB.renderModal();
  }

  try {
    switch (act) {
      case 'win-min': return window.ember.win.min();
      case 'win-max': return window.ember.win.max();
      case 'win-close': return window.ember.win.close();
      case 'palette': return EMB.actions.togglePalette(!EMB.state.palette);

      case 'play': return EMB.actions.launch();
      case 'stop': return window.ember.game.stop();
      case 'toggle-log': EMB.state.showLog = !EMB.state.showLog; return EMB.renderView();

      case 'select-inst':
        await window.ember.instances.select(actEl.dataset.id);
        EMB.state.selected = actEl.dataset.id;
        EMB.toast(t('Сборка выбрана'), 'ok');
        return EMB.renderView();
      case 'open-inst': return window.ember.instances.open(actEl.dataset.id);
      case 'mods-manager': return EMB.actions.openModsManager(actEl.dataset.id);
      case 'mods-open-folder': {
        const inst = EMB.state.instances.find(i => i.id === actEl.dataset.id);
        return window.ember.instances.folder(actEl.dataset.id, EMB.isRust(inst) ? 'horizon-mods' : 'mods');
      }
      case 'mod-del': {
        const file = actEl.dataset.file;
        if (!confirm(EMB.t('Удалить мод {file}?', { file }))) return;
        await window.ember.mods.remove(EMB.state.modal.instId, file);
        return EMB.actions.openModsManager(EMB.state.modal.instId);
      }
      case 'dup-inst': {
        const r = await window.ember.instances.duplicate(actEl.dataset.id);
        EMB.toast(EMB.t('Создан дубликат «{name}»', { name: r.name }), 'ok');
        return EMB.actions.reloadInstances();
      }
      case 'export-inst': {
        const r = await window.ember.instances.exportZip(actEl.dataset.id);
        if (!r.cancelled) EMB.toast(t('Сборка экспортирована в zip'), 'ok');
        return;
      }
      case 'import-zip': return EMB.actions.importZip();
      case 'backup-inst': {
        EMB.toast(t('Создаю резервную копию миров…'));
        const p = await window.ember.instances.backup(actEl.dataset.id);
        EMB.toast(EMB.t('Копия сохранена: {p}', { p }), 'ok');
        return window.ember.showFile(p.replace(/[\\/][^\\/]+$/, ''));
      }
      case 'del-inst': {
        if (!confirm(t('Удалить сборку вместе с модами и мирами?'))) return;
        await window.ember.instances.remove(actEl.dataset.id);
        EMB.toast(t('Сборка удалена'), 'ok');
        return EMB.actions.reloadInstances();
      }
      case 'new-inst': return EMB.modals.openNewInstance('fabric');
      case 'new-inst-loader': return EMB.modals.openNewInstance(actEl.dataset.loader);
      case 'rust-new': return EMB.modals.openRustInstance(actEl.dataset.platform || 'horizon');
      case 'go-rust': return EMB.setView('rust');
      case 'rust-registry': {
        const inst = EMB.selectedInst();
        EMB.state.search.source = 'horizon';
        EMB.state.search.kind = 'mod';
        EMB.setView('mods');
        if (inst && !EMB.isRust(inst)) EMB.toast(t('Выбрана Java-сборка: показан только список модов, установить их можно в сборку Horizon'), 'err');
        return;
      }
      case 'rust-prepare': {
        const platform = actEl.dataset.platform;
        const tag = actEl.dataset.tag || '';
        actEl.disabled = true;
        EMB.state.progress = { stage: t('Minecraft Rust'), text: t('Проверяю движок…') };
        EMB.renderBusy();
        try {
          const r = await window.ember.rust.prepare(platform, tag);
          EMB.toast(EMB.t('{platform} {tag} готов', { platform: platform === 'horizon' ? 'Horizon' : 'Rustcraft', tag: r.tag }), 'ok');
          await EMB.rustView.loadPage(true);
        } catch (e) {
          EMB.toast(e.message, 'err');
        } finally {
          EMB.state.progress = null;
          EMB.renderBusy();
          actEl.disabled = false;
        }
        return;
      }
      case 'rust-open-file': return window.ember.showFile(actEl.dataset.path);
      case 'rust-site': return window.ember.openUrl(actEl.dataset.url);
      case 'create-inst': {
        EMB.modals.syncModal();
        const m = EMB.state.modal;
        const name = EMB.$('#ni-name').value.trim() || t('Новая сборка');
        const platform = m.platform || 'java';
        const created = await window.ember.instances.create({
          name,
          platform,
          version: platform === 'java' ? m.version : (m.gameVersion || m.version),
          loader: platform === 'java' ? m.loader : platform,
          loaderVersion: m.loaderVersion || '',
          cover: m.cover || null,
        });
        EMB.state.modal = null;
        EMB.renderModal();
        EMB.toast(EMB.t('Сборка «{name}» создана', { name: created.name }), 'ok');
        await EMB.actions.reloadInstances();
        return;
      }

      case 'pick-cover': return EMB.modals.openCoverModal(actEl.dataset.id);
      case 'last-crash': {
        const r = await window.ember.instances.lastCrash(actEl.dataset.id);
        if (!r.found) return EMB.toast(t('Краш-отчётов у этой сборки нет'), 'ok');
        EMB.state.modal = { type: 'crash', path: r.path, text: r.text };
        return EMB.renderModal();
      }
      case 'crash-open': return window.ember.showFile(actEl.dataset.path);

      // Выбор обложки в модалке создания сборки
      case 'ni-pick-result': {
        const it = EMB.state.coverSearch && EMB.state.coverSearch.items[+actEl.dataset.idx];
        if (!it || !EMB.state.modal) return;
        EMB.state.modal.cover = { url: it.icon, name: it.title };
        EMB.$('#ni-cover-box').innerHTML = EMB.modals.coverBoxHTML(EMB.state.modal.cover);
        return EMB.modals.paintCoverResults();
      }
      case 'ni-pick-file': {
        const p = await window.ember.pickImage();
        if (!p || !EMB.state.modal) return;
        EMB.state.modal.cover = { file: p, name: p.split(/[\\/]/).pop() };
        EMB.$('#ni-cover-box').innerHTML = EMB.modals.coverBoxHTML(EMB.state.modal.cover);
        return;
      }
      case 'ni-clear-cover': {
        if (!EMB.state.modal) return;
        EMB.state.modal.cover = null;
        EMB.$('#ni-cover-box').innerHTML = EMB.modals.coverBoxHTML(null);
        return EMB.modals.paintCoverResults();
      }

      // Выбор обложки для существующей сборки
      case 'cv-pick-result': {
        const it = EMB.state.coverSearch && EMB.state.coverSearch.items[+actEl.dataset.idx];
        if (!it || !EMB.state.modal) return;
        await window.ember.instances.setCover(EMB.state.modal.instId, { url: it.icon });
        EMB.toast(t('Обложка обновлена'), 'ok');
        await EMB.actions.reloadInstances();
        return EMB.renderModal();
      }
      case 'cv-pick-file': {
        if (!EMB.state.modal) return;
        const r = await window.ember.instances.pickCover(EMB.state.modal.instId);
        if (!r) return;
        EMB.toast(t('Обложка обновлена'), 'ok');
        await EMB.actions.reloadInstances();
        return EMB.renderModal();
      }
      case 'cv-clear': {
        if (!EMB.state.modal) return;
        await window.ember.instances.setCover(EMB.state.modal.instId, null);
        EMB.toast(t('Обложка убрана'));
        await EMB.actions.reloadInstances();
        return EMB.renderModal();
      }

      case 'open-shot': {
        const s = EMB.state.screens && EMB.state.screens[+actEl.dataset.idx];
        if (s) window.ember.showFile(s.path);
        return;
      }

      case 'pick-music': {
        const p = await window.ember.music.pickFolder();
        if (!p) return;
        EMB.state.musicFolder = await window.ember.music.folder();
        await EMB.actions.reloadSettings();
        EMB.toast(t('Папка с музыкой выбрана'), 'ok');
        return EMB.renderView();
      }
      case 'open-music': return window.ember.showFile(await window.ember.music.folder());

      case 'search': {
        EMB.state.search.query = EMB.$('#search-q') ? EMB.$('#search-q').value.trim() : EMB.state.search.query;
        return EMB.search.run(true);
      }
      case 'install': return EMB.search.installItem(+actEl.dataset.idx);
      case 'ov-key': EMB.state.keyCapture = actEl.dataset.field; return EMB.renderView();
      case 'install-link': {
        const url = EMB.$('#link-url').value.trim();
        if (!url) return EMB.toast(t('Вставьте ссылку на файл'), 'err');
        const inst = EMB.selectedInst();
        EMB.state.progress = { stage: t('Загрузка'), text: url };
        EMB.renderBusy();
        try {
          const res = await window.ember.install({ source: 'link', kind: 'link', id: url, title: url }, inst && inst.id);
          if (res.instance) EMB.toast(EMB.t('Создана сборка «{name}» и выбрана', { name: res.instance.name }), 'ok');
          else EMB.toast(EMB.t('Скачано: {files}', { files: (res.installed || []).join(', ') }), 'ok');
          await EMB.actions.reloadInstances();
        } catch (err) {
          EMB.toast(err.message, 'err');
        } finally {
          EMB.state.progress = null;
          EMB.renderBusy();
        }
        return;
      }
      case 'change-data': {
        const r = await window.ember.dataDir.change();
        if (r && r.cancelled) return;
        return;
      }
      case 'reset-data': {
        const r = await window.ember.dataDir.reset();
        if (r && r.cancelled) return;
        return;
      }
      case 'open-web': {
        const it = EMB.state.search.items[+actEl.dataset.idx];
        if (it && it.url) window.ember.openUrl(it.url);
        return;
      }
      case 'go-settings': return EMB.setView('settings');
      case 'open-cf-keys': return window.ember.openUrl('https://console.curseforge.com/');
      case 'go-account': return EMB.setView('account');
      case 'open-ely-reg': return window.ember.openUrl('https://ely.by/register');
      case 'open-tg': return window.ember.openUrl('https://t.me/EmberLauncher');
      case 'open-ds': return window.ember.openUrl('https://discord.gg/Wpr5kBxUM');

      case 'ely-login': {
        const login = EMB.$('#ely-login').value.trim();
        const pass = EMB.$('#ely-pass').value;
        if (!login || !pass) return EMB.toast(t('Введите логин и пароль Ely.by'), 'err');
        actEl.disabled = true;
        try {
          const acc = await window.ember.accounts.add('elyby', { login, password: pass });
          EMB.toast(EMB.t('Вход выполнен: {username}', { username: acc.username }), 'ok');
          await EMB.actions.loadAccounts();
        } finally { actEl.disabled = false; }
        EMB.renderSidebarFoot();
        return EMB.renderView();
      }
      case 'offline-login': {
        const name = EMB.$('#off-name').value.trim();
        try {
          const acc = await window.ember.accounts.add('offline', { name });
          EMB.toast(EMB.t('Оффлайн-ник: {username}', { username: acc.username }), 'ok');
          await EMB.actions.loadAccounts();
        } catch (err) { return EMB.toast(err.message, 'err'); }
        EMB.renderSidebarFoot();
        return EMB.renderView();
      }
      case 'logout': {
        if (EMB.state.account) await window.ember.accounts.logout(EMB.state.account.id).catch(() => {});
        await EMB.actions.loadAccounts();
        EMB.toast(t('Вы вышли из аккаунта'));
        EMB.renderSidebarFoot();
        return EMB.renderView();
      }

      case 'account-select': {
        await window.ember.accounts.select(actEl.dataset.id);
        await EMB.actions.loadAccounts();
        EMB.renderSidebarFoot();
        return EMB.renderView();
      }
      case 'account-remove': {
        if (!confirm(t('Удалить этот аккаунт из лаунчера?'))) return;
        await window.ember.accounts.remove(actEl.dataset.id);
        await EMB.actions.loadAccounts();
        EMB.toast(t('Аккаунт удалён'));
        EMB.renderSidebarFoot();
        return EMB.renderView();
      }
      case 'account-logout': {
        await window.ember.accounts.logout(actEl.dataset.id).catch(() => {});
        await EMB.actions.loadAccounts();
        return EMB.renderView();
      }
      case 'account-skins': {
        await window.ember.accounts.select(actEl.dataset.id);
        await EMB.actions.loadAccounts();
        EMB.renderSidebarFoot();
        return EMB.setView('skins');
      }

      case 'ms-login': {
        if (EMB.state.ms) return;
        actEl.disabled = true;
        try {
          EMB.state.ms = await window.ember.auth.msStart();
          EMB.renderView();
          const acc = await window.ember.auth.msWait();
          EMB.state.ms = null;
          EMB.toast(EMB.t('Вход выполнен: {username}', { username: acc.username }), 'ok');
          await EMB.actions.loadAccounts();
        } catch (err) {
          EMB.state.ms = null;
          EMB.toast(err.message || t('Не удалось войти через Microsoft'), 'err');
        } finally {
          actEl.disabled = false;
          EMB.renderSidebarFoot();
          return EMB.renderView();
        }
      }
      case 'ms-open-link': {
        if (!EMB.state.ms) return;
        return window.ember.openUrl(EMB.state.ms.verificationUriComplete || EMB.state.ms.verificationUri);
      }
      case 'ms-copy': {
        if (!EMB.state.ms) return;
        await window.ember.copyText(EMB.state.ms.userCode);
        return EMB.toast(t('Код скопирован'), 'ok');
      }
      case 'ms-cancel': {
        await window.ember.auth.msCancel();
        EMB.state.ms = null;
        EMB.toast(t('Вход отменён'));
        return EMB.renderView();
      }

      case 'skin-source': {
        EMB.state.skins.source = actEl.dataset.src;
        return EMB.renderView();
      }
      case 'skin-search': {
        const q = EMB.$('#skin-query').value.trim();
        if (!q) return EMB.toast(t('Введите ник игрока'), 'err');
        EMB.state.skins.query = q;
        EMB.state.skins.loading = true;
        EMB.state.skins.error = '';
        EMB.state.skins.items = [];
        EMB.renderView();
        try {
          const items = await window.ember.skins.search(EMB.state.skins.source, q);
          EMB.state.skins.items = items;
        } catch (err) {
          EMB.state.skins.error = err.message;
        } finally {
          EMB.state.skins.loading = false;
          EMB.renderView();
        }
        return;
      }
      case 'skin-model': {
        EMB.state.skins.model = actEl.dataset.model;
        return EMB.renderView();
      }
      case 'skin-apply-file': {
        if (!EMB.state.account) return EMB.toast(t('Выберите аккаунт во вкладке «Аккаунт»'), 'err');
        const file = await window.ember.skins.pickImage();
        if (!file) return;
        EMB.state.skins.applying = true;
        EMB.renderView();
        try {
          const r = await window.ember.skins.apply(EMB.state.account.id, { file, model: EMB.state.skins.model });
          EMB.toast(r.message || t('Скин установлен'), 'ok');
          await EMB.actions.refreshCurrentSkin();
        } catch (err) {
          EMB.toast(err.message, 'err');
        } finally {
          EMB.state.skins.applying = false;
          EMB.renderView();
        }
        return;
      }
      case 'skin-apply-url': {
        if (!EMB.state.account) return EMB.toast(t('Выберите аккаунт во вкладке «Аккаунт»'), 'err');
        const input = EMB.$('#skin-url-input');
        const url = (input && input.value ? input.value : '').trim();
        EMB.state.skins.urlInput = url;
        if (!url) return EMB.toast(t('Введите ссылку на скин'), 'err');
        if (!/^https?:\/\//i.test(url)) return EMB.toast(t('Ссылка должна начинаться с http:// или https://'), 'err');
        EMB.state.skins.applying = true;
        EMB.renderView();
        try {
          const r = await window.ember.skins.apply(EMB.state.account.id, { url, model: EMB.state.skins.model });
          EMB.toast(r.message || t('Скин установлен'), 'ok');
          EMB.state.skins.urlInput = '';
          await EMB.actions.refreshCurrentSkin();
        } catch (err) {
          EMB.toast(err.message, 'err');
        } finally {
          EMB.state.skins.applying = false;
          EMB.renderView();
        }
        return;
      }
      case 'skin-refresh-current': {
        await EMB.actions.refreshCurrentSkin();
        return;
      }
      case 'skin-pick': {
        if (!EMB.state.account) return EMB.toast(t('Сначала выберите аккаунт во вкладке «Аккаунт»'), 'err');
        const url = actEl.dataset.url;
        EMB.state.skins.applying = true;
        EMB.renderView();
        try {
          if (EMB.state.account.type === 'microsoft') {
            const r = await window.ember.skins.apply(EMB.state.account.id, { url, model: EMB.state.skins.model });
            EMB.toast(r.message || t('Скин установлен'), 'ok');
            await EMB.actions.refreshCurrentSkin();
          } else if (EMB.state.account.type === 'elyby') {
            await window.ember.openUrl(`https://ely.by/skin/${encodeURIComponent(EMB.state.account.username)}`);
            EMB.toast(t('Открыл страницу скина на ely.by — поставьте скин там'), 'ok');
          } else {
            await window.ember.openUrl(url);
            EMB.toast(t('Открыл скин в браузере'), 'ok');
          }
        } catch (err) {
          EMB.toast(err.message, 'err');
        } finally {
          EMB.state.skins.applying = false;
          EMB.renderView();
        }
        return;
      }
      case 'skin-open-ely': {
        if (!EMB.state.account) return EMB.toast(t('Выберите аккаунт'), 'err');
        return window.ember.openUrl(`https://ely.by/skin/${encodeURIComponent(EMB.state.account.username)}`);
      }

      case 'save-settings': return EMB.actions.saveSettings();
      case 'update-check': return EMB.updateFlow.check();
      case 'update-download': return EMB.updateFlow.download();
      case 'update-install': return EMB.updateFlow.install();
      case 'update-open': {
        const f = EMB.state.update.downloadedPath;
        return f ? window.ember.showFile(f) : EMB.toast(t('Сначала скачайте обновление'), 'err');
      }
      case 'update-release': return EMB.state.update.url && window.ember.openUrl(EMB.state.update.url);
      case 'perf-apply': return EMB.actions.applyPerf();
      case 'perf-install': return EMB.actions.installPerfPack();
      case 'pick-java': {
        const p = await window.ember.pickJava();
        if (p) { EMB.$('#javapath').value = p; }
        return;
      }
      case 'open-data': return window.ember.showFile(EMB.state.info.base);
      default: return;
    }
  } catch (err) {
    EMB.toast(err.message || String(err), 'err');
  }
};

document.addEventListener('click', EMB.onClick);

// Изменения переключателей и выбора
document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset && el.dataset.actChange === 'mod-toggle') {
    try {
      await window.ember.mods.toggle(EMB.state.modal.instId, el.dataset.file, el.checked);
      return EMB.actions.openModsManager(EMB.state.modal.instId);
    } catch (err) { EMB.toast(err.message, 'err'); return EMB.actions.openModsManager(EMB.state.modal.instId); }
  }
  if (el.id === 'lang') {
    EMB.i18n.setLang(el.value);
    window.ember.settings.save({ language: el.value }).catch(() => {});
    return;
  }
  if (el.id === 'home-inst' || el.id === 'target-inst') {
    const id = el.value;
    EMB.state.selected = id;
    window.ember.instances.select(id);
    if (EMB.state.view === 'home') EMB.renderView();
    if (EMB.state.view === 'mods') { EMB.renderView(); EMB.search.run(true); }
  }
  if (el.id === 'only-inst') {
    EMB.state.search.onlySameVersion = el.checked;
    EMB.search.run(true);
  }
  if (el.id === 'ni-snap' && EMB.state.modal) {
    EMB.modals.syncModal();
    EMB.state.modal.snap = el.checked;
    EMB.renderModal();
  }
  if (el.id === 'ni-version' && EMB.state.modal) {
    EMB.modals.syncModal();
    EMB.state.modal.loaderVersion = '';
    EMB.modals.refreshLoaderBlock();
    EMB.modals.ensureLoaderList(EMB.state.modal.loader, EMB.state.modal.version);
  }
});

document.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'ram') EMB.$('#ram-val').textContent = (e.target.value / 1024).toFixed(1) + ' ' + t('ГБ');
  if (id === 'ov-zoom-factor') EMB.$('#ov-zoom-val').textContent = e.target.value + '%';
  if (id === 'search-q') { EMB.state.search.query = e.target.value; EMB.events.debounceSearch(); }
  if (id === 'inst-q') {
    EMB.state.instQuery = e.target.value;
    const grid = EMB.$('#inst-grid');
    if (grid) grid.innerHTML = EMB.modals.instCards();
  }
  if (id === 'ni-name' && EMB.state.modal && EMB.state.modal.type === 'new') EMB.state.modal.name = e.target.value;
  if (id === 'cs-q' && EMB.state.coverSearch) {
    EMB.state.coverSearch.q = e.target.value;
    clearTimeout(EMB.events.coverTimer);
    EMB.events.coverTimer = setTimeout(EMB.modals.runCoverSearch, 350);
  }
  if (id === 'pal-q' && EMB.state.palette) { EMB.state.palette.q = e.target.value; EMB.state.palette.sel = 0; EMB.renderModal(); }
});

EMB.events.searchTimer = null;
EMB.events.coverTimer = null;
EMB.events.debounceSearch = function debounceSearch() {
  clearTimeout(EMB.events.searchTimer);
  EMB.events.searchTimer = setTimeout(() => {
    if (EMB.state.view === 'mods') EMB.search.run(true);
  }, 380);
};

document.addEventListener('keydown', e => {
  if (EMB.state.keyCapture) {
    e.preventDefault();
    const field = EMB.state.keyCapture;
    if (e.key === 'Escape') { EMB.state.keyCapture = null; return EMB.renderView(); }
    const code = EMB.glfwCodeOf(e);
    if (code == null) { EMB.state.keyCapture = null; EMB.toast(t('Эту клавишу нельзя назначить'), 'err'); return EMB.renderView(); }
    return EMB.settingsView.setOvKey(field, code);
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    return EMB.actions.togglePalette(!EMB.state.palette);
  }
  if (EMB.state.palette) {
    const items = EMB.modals.paletteItems().filter(it => !EMB.state.palette.q || it.label.toLowerCase().includes(EMB.state.palette.q.toLowerCase()));
    if (e.key === 'Escape') return EMB.actions.togglePalette(false);
    if (e.key === 'ArrowDown') { e.preventDefault(); EMB.state.palette.sel = Math.min(items.length - 1, EMB.state.palette.sel + 1); return EMB.renderModal(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); EMB.state.palette.sel = Math.max(0, EMB.state.palette.sel - 1); return EMB.renderModal(); }
    if (e.key === 'Enter') { const it = items[EMB.state.palette.sel]; EMB.actions.togglePalette(false); if (it) it.run(); return; }
    return;
  }
  if (e.key === 'Enter' && e.target.id === 'search-q') {
    EMB.state.search.query = e.target.value.trim();
    return EMB.search.run(true);
  }
  if (e.key === 'Enter' && e.target.id === 'ni-name' && EMB.state.modal && EMB.state.modal.type === 'new') {
    e.preventDefault();
    const btn = EMB.$('[data-act="create-inst"]');
    if (btn) btn.click();
    return;
  }
  if (e.key === 'Escape' && EMB.state.modal) {
    EMB.state.modal = null;
    return EMB.renderModal();
  }
});

})();
