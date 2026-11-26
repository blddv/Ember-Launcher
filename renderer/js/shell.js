// Каркас интерфейса: обложка, боковая панель, переключение и отрисовка вкладок.
const EMB = (window.EMB = window.EMB || {});
const { t } = EMB;

EMB.renderShell = function renderShell() {
  const navHTML = EMB.NAV.map(g => `
    <div class="nav-label">${t(g.group)}</div>
    ${g.items.map(it => `
      <button class="nav-item ${EMB.state.view === it.id ? 'active' : ''}" data-nav="${it.id}">
        ${EMB.icon(it.icon)} <span>${t(it.label)}</span>
      </button>`).join('')}
  `).join('');

  EMB.$('#app').innerHTML = `
    <div class="titlebar">
      <span class="title">EMBER LAUNCHER · ${EMB.state.info ? 'v' + EMB.esc(EMB.state.info.version) : ''}</span>
      <div class="win-controls">
        <button data-act="palette" title="${t('Командная палитра (Ctrl+K)')}">${EMB.icon('cmd')}</button>
        <button data-act="win-min" title="${t('Свернуть')}">${EMB.icon('min')}</button>
        <button data-act="win-max" title="${t('Развернуть')}">${EMB.icon('max')}</button>
        <button data-act="win-close" class="close" title="${t('Закрыть')}">${EMB.icon('close')}</button>
      </div>
    </div>
    <aside class="sidebar">
      <div class="brand">
        <img src="../assets/icon.png" alt="">
        <div><div class="name">EMBER</div><div class="sub">LAUNCHER 2.0</div></div>
      </div>
      <div class="credit">Created by: BlaDDEv | SaBL team</div>
      <nav>${navHTML}</nav>
      <div class="sidebar-foot" id="sidebar-foot"></div>
    </aside>
    <main class="main">
      <div class="view" id="view"></div>
      <div id="busy"></div>
    </main>`;
  EMB.renderSidebarFoot();
};

EMB.renderSidebarFoot = function renderSidebarFoot() {
  const foot = EMB.$('#sidebar-foot');
  if (!foot) return;
  const a = EMB.state.account;
  const list = EMB.state.accounts || [];
  const initial = a ? EMB.esc(a.username[0].toUpperCase()) : '?';
  foot.innerHTML = `
    <div class="social-row">
      <button class="social-btn" data-act="open-tg" title="Telegram: t.me/EmberLauncher" aria-label="Telegram">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
      </button>
      <button class="social-btn" data-act="open-ds" title="Discord: discord.gg/Wpr5kBxUM" aria-label="Discord">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>
      </button>
    </div>
    <div class="acc-chip ${list.length > 1 ? 'switchable' : ''}" data-act="go-account" title="${t('Открыть вкладку «Аккаунт»')}">
      <div class="avatar">${initial}</div>
      <div class="who">
        <b>${a ? EMB.esc(a.username) : t('Не выбран')}</b>
        <span>${a ? EMB.accTypeLabel(a.type) : t('Войдите во вкладке «Аккаунт»')}${list.length > 1 ? EMB.t(' · {n} аккаунтов', { n: list.length }) : ''}</span>
      </div>
      ${list.length > 1 ? `<span class="acc-dots">${list.map((x, i) => `<i class="${x.id === EMB.state.selectedAccountId ? 'on' : ''}" data-act="acc-dot" data-id="${EMB.esc(x.id)}" title="${EMB.esc(x.username)}"></i>`).join('')}</span>` : ''}
    </div>
    <div class="ver-foot">Minecraft · Fabric · Quilt · Forge · NeoForge · Rust</div>`;
};

EMB.setView = function setView(v) {
  EMB.state.view = v;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.nav === v));
  // Сразу показываем «Ищу…», а не пустую выдачу, пока поиск не стартовал
  if (v === 'mods' && !EMB.state.search.items.length) EMB.state.search.loading = true;
  EMB.renderView();
  if (v === 'mods') EMB.search.run(true);
  if (v === 'screens') EMB.loadScreens();
  if (v === 'rust') EMB.rustView.loadPage();
};

EMB.renderView = function renderView() {
  const el = EMB.$('#view');
  if (!el) return;
  if (EMB.search.observer) { EMB.search.observer.disconnect(); EMB.search.observer = null; }
  const views = EMB.views;
  el.innerHTML = views[EMB.state.view]();
  el.scrollTop = 0;
  EMB.renderBusy();
  if (EMB.state.view === 'mods') { EMB.search.renderResults(); EMB.search.setupInfinite(); }
  if (EMB.state.view === 'home') {
    const log = EMB.$('#console');
    if (log) { log.textContent = EMB.state.logs.slice(-20000); log.scrollTop = log.scrollHeight; }
  }
};

EMB.renderBusy = function renderBusy() {
  const busy = EMB.$('#busy');
  if (busy) {
    busy.innerHTML = EMB.state.progress && EMB.state.view !== 'home'
      ? `<div class="busy-pill">${EMB.progressHTML(EMB.state.progress)}</div>`
      : '';
  }
  const hp = EMB.$('#home-progress');
  if (hp) hp.innerHTML = EMB.progressHTML(EMB.state.progress);
};
