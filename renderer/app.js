/* EMBER Launcher 2.0 — интерфейс. Работает через window.ember (preload.js). */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (n == null ? '' : Intl.NumberFormat('ru-RU', { notation: 'compact' }).format(n));
const fmtTime = s => { if (!isFinite(s) || s < 0) s = 0; const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
const fmtPlay = ms => {
  if (!ms) return 'ещё не запускали';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} мин`;
  return `${Math.floor(m / 60)} ч ${m % 60} мин`;
};
const fmtMB = b => `${(b / 1048576).toFixed(1)} МБ`;

const ICONS = {
  play: '<polygon points="6 4 20 12 6 20 6 4"/>',
  pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
  next: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>',
  prev: '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>',
  shuffle: '<path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  volume: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  layers: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  puzzle: '<path d="M19 11h-2V8a2 2 0 0 0-2-2h-3V4a2 2 0 1 0-4 0v2H5a2 2 0 0 0-2 2v3h2a2 2 0 1 1 0 4H3v3a2 2 0 0 0 2 2h3v-2a2 2 0 1 1 4 0v2h3a2 2 0 0 0 2-2v-3h2a2 2 0 1 0 0-4z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  ext: '<path d="M14 3h7v7"/><path d="M10 14L21 3"/><path d="M21 14v7H3V3h7"/>',
  download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 21V9"/><path d="M7 14l5-5 5 5"/><path d="M5 3h14"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  min: '<path d="M5 12h14"/>',
  max: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  terminal: '<path d="M4 17l6-6-6-6"/><path d="M12 19h8"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  cmd: '<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>',
  bolt: '<path d="M13 2L4 14h6l-1 8 10-13h-6l1-7z"/>',
};
const icon = (n, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;

const NAV = [
  { group: 'Игра', items: [
    { id: 'home', label: 'Главная', icon: 'home' },
    { id: 'instances', label: 'Сборки', icon: 'layers' },
    { id: 'rust', label: 'Minecraft Rust', icon: 'bolt' },
    { id: 'screens', label: 'Скриншоты', icon: 'image' },
  ] },
  { group: 'Контент', items: [
    { id: 'mods', label: 'Моды и сборки', icon: 'puzzle' },
  ] },
  { group: 'Система', items: [
    { id: 'account', label: 'Аккаунт', icon: 'user' },
    { id: 'settings', label: 'Настройки', icon: 'gear' },
  ] },
];

const LOADERS = [
  { id: 'vanilla', label: 'Vanilla' },
  { id: 'fabric', label: 'Fabric' },
  { id: 'quilt', label: 'Quilt' },
  { id: 'forge', label: 'Forge' },
  { id: 'neoforge', label: 'NeoForge' },
];
const LOADER_LABEL = Object.fromEntries(LOADERS.map(l => [l.id, l.label]));
const MOD_LOADERS = ['fabric', 'quilt', 'forge', 'neoforge'];

// Minecraft на Rust: отдельные движки, а не загрузчики Java-модов
const RUST_PLATFORMS = [
  { id: 'horizon', label: 'Horizon', color: '#F2A65A', game: '26.3' },
  { id: 'rustcraft', label: 'Rustcraft', color: '#7BD1A8', game: '26.3' },
];
const PLATFORM_LABEL = { java: 'Java Edition', horizon: 'Horizon', rustcraft: 'Rustcraft' };
const platformOf = i => {
  if (!i) return 'java';
  if (i.platform === 'horizon' || i.platform === 'rustcraft') return i.platform;
  return RUST_PLATFORMS.some(p => p.id === i.loader) ? i.loader : 'java';
};
const isRust = i => platformOf(i) !== 'java';
const RUST_SOURCE = src => src === 'horizon' || src === 'horizon-github';

const state = {
  view: 'home',
  info: null,
  settings: null,
  instances: [],
  selected: null,
  runningId: null,
  versions: [],
  account: null,
  running: false,
  preparing: false,
  mod: null,
  progress: null,
  logs: '',
  showLog: false,
  modal: null,
  palette: null,
  search: { source: 'modrinth', kind: 'mod', query: '', items: [], hasMore: false, loading: false, error: '', onlySameVersion: true, seq: 0, note: '' },
  instQuery: '',
  coverSearch: null,
  musicFolder: '',
  screens: null,
  loaderCache: {},
  rustInfo: null,
  rustError: '',
  rustCache: {},
};

// platform: java — источники Java Edition, rust — только для Minecraft на Rust.
// Списки не смешиваются: .jar не работает в Horizon, а .hmod — в Java.
const SOURCES = [
  { id: 'modrinth', label: 'Modrinth', color: '#1BD96A', platform: 'java' },
  { id: 'curseforge', label: 'CurseForge', color: '#F16436', platform: 'java' },
  { id: 'hangar', label: 'Hangar', color: '#4C8DFF', platform: 'java' },
  { id: 'smithed', label: 'Smithed', color: '#B98BFF', platform: 'java' },
  { id: 'github', label: 'GitHub', color: '#E6EDF3', platform: 'java' },
  { id: 'horizon', label: 'Horizon (Rust)', color: '#F2A65A', platform: 'rust' },
  { id: 'horizon-github', label: 'Rust: GitHub', color: '#E6EDF3', platform: 'rust' },
  { id: 'link', label: 'По ссылке', color: '#FF9A4D', platform: 'any' },
];
const KINDS = {
  modrinth: [['mod', 'Моды'], ['modpack', 'Сборки'], ['resourcepack', 'Ресурспаки']],
  curseforge: [['mod', 'Моды'], ['modpack', 'Сборки'], ['resourcepack', 'Ресурспаки']],
  hangar: [['plugin', 'Плагины Paper']],
  smithed: [['datapack', 'Датапаки'], ['resourcepack', 'Ресурспаки']],
  github: [['mod', 'Моды (релизы)']],
  horizon: [['mod', 'Моды'], ['modpack', 'Сборки'], ['resourcepack', 'Ресурспаки']],
  'horizon-github': [['mod', 'Моды (релизы)']],
  link: [['link', 'Файл по ссылке']],
};
const SOURCE_HINTS = {
  smithed: 'Smithed: датапаки и ресурспаки. Датапак кладётся в сборку, а в мир его нужно скопировать вручную. Здесь одна страница результатов (API не поддерживает пагинацию).',
  github: 'GitHub: берётся последний релиз репозитория и его .jar под ваш загрузчик. Зависимости ставьте отдельно.',
  hangar: 'Hangar: плагины для Paper-серверов. Файлы сохраняются в папку server-plugins, а не в клиент.',
  horizon: 'Horizon: официальный реестр модов для Minecraft на Rust (playhorizon.dev/mods). Проверенные .hmod и .hnmod, сборки .hpack и ресурспаки. Каждый файл сверяется по SHA-256, снятые с публикации не ставятся.',
  'horizon-github': 'GitHub: .hmod из последнего релиза репозитория, которого ещё нет в реестре Horizon. Такие файлы никто не проверял — ставьте на свой риск.',
  link: 'Прямая ссылка: .jar и .mrpack — для Java Edition, .hmod, .hnmod и .hpack — для Minecraft на Rust, .zip — ресурспак в любую сборку.',
};

/* ================= Утилиты ================= */

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'err' ? 7000 : 4000);
}

const selectedInst = () => state.instances.find(i => i.id === state.selected) || null;
const hasLoader = i => !!i && MOD_LOADERS.includes(i.loader);
const loaderName = i => {
  const p = platformOf(i);
  if (p !== 'java') {
    const label = (RUST_PLATFORMS.find(x => x.id === p) || {}).label || p;
    return `Rust · ${label}${i.loaderVersion ? ' ' + i.loaderVersion : ''}`;
  }
  return i.loader === 'vanilla' ? 'Vanilla' : `${LOADER_LABEL[i.loader] || i.loader}${i.loaderVersion ? ' ' + i.loaderVersion : ''}`;
};

function progressHTML(p) {
  if (!p) return '';
  const pct = p.total ? Math.min(100, Math.round((p.done / p.total) * 100)) : null;
  return `<div class="progress">
    <div class="meta"><span>${esc(p.stage)} — ${esc(p.text || '')}</span><b>${pct !== null ? pct + '%' : ''}</b></div>
    <div class="bar ${pct === null ? 'indet' : ''}"><i style="width:${pct || 0}%"></i></div>
  </div>`;
}

/* ================= Каркас ================= */

function renderShell() {
  const navHTML = NAV.map(g => `
    <div class="nav-label">${g.group}</div>
    ${g.items.map(it => `
      <button class="nav-item ${state.view === it.id ? 'active' : ''}" data-nav="${it.id}">
        ${icon(it.icon)} <span>${it.label}</span>
      </button>`).join('')}
  `).join('');

  $('#app').innerHTML = `
    <div class="titlebar">
      <span class="title">EMBER LAUNCHER · ${state.info ? 'v' + esc(state.info.version) : ''}</span>
      <div class="win-controls">
        <button data-act="palette" title="Командная палитра (Ctrl+K)">${icon('cmd')}</button>
        <button data-act="win-min" title="Свернуть">${icon('min')}</button>
        <button data-act="win-max" title="Развернуть">${icon('max')}</button>
        <button data-act="win-close" class="close" title="Закрыть">${icon('close')}</button>
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
  renderSidebarFoot();
}

function renderSidebarFoot() {
  const foot = $('#sidebar-foot');
  if (!foot) return;
  const a = state.account;
  const initial = a ? esc(a.username[0].toUpperCase()) : '?';
  foot.innerHTML = `
    <div class="social-row">
      <button class="social-btn" data-act="open-tg" title="Telegram: t.me/EmberLauncher" aria-label="Telegram">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
      </button>
      <button class="social-btn" data-act="open-ds" title="Discord: discord.gg/Wpr5kBxUM" aria-label="Discord">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>
      </button>
    </div>
    <div class="acc-chip">
      <div class="avatar">${initial}</div>
      <div class="who">
        <b>${a ? esc(a.username) : 'Не выбран'}</b>
        <span>${a ? accTypeLabel(a.type) : 'Войдите во вкладке «Аккаунт»'}</span>
      </div>
    </div>
    <div class="ver-foot">Minecraft · Fabric · Quilt · Forge · NeoForge · Rust</div>`;
}

function setView(v) {
  state.view = v;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.nav === v));
  // Сразу показываем «Ищу…», а не пустую выдачу, пока поиск не стартовал
  if (v === 'mods' && !state.search.items.length) state.search.loading = true;
  renderView();
  if (v === 'mods') runSearch(true);
  if (v === 'screens') loadScreens();
  if (v === 'rust') loadRustPage();
}

let observer = null;

function renderView() {
  const el = $('#view');
  if (!el) return;
  if (observer) { observer.disconnect(); observer = null; }
  const views = { home: viewHome, instances: viewInstances, rust: viewRust, mods: viewMods, account: viewAccount, settings: viewSettings, screens: viewScreens };
  el.innerHTML = views[state.view]();
  el.scrollTop = 0;
  renderBusy();
  if (state.view === 'mods') { renderResults(); setupInfinite(); }
  if (state.view === 'home') {
    const log = $('#console');
    if (log) { log.textContent = state.logs.slice(-20000); log.scrollTop = log.scrollHeight; }
  }
}

function renderBusy() {
  const busy = $('#busy');
  if (busy) {
    busy.innerHTML = state.progress && state.view !== 'home'
      ? `<div class="busy-pill">${progressHTML(state.progress)}</div>`
      : '';
  }
  const hp = $('#home-progress');
  if (hp) hp.innerHTML = progressHTML(state.progress);
}

/* ================= Главная ================= */

function viewHome() {
  const inst = selectedInst();
  const rust = isRust(inst);
  const ov = state.settings.orangeVisuals;
  const perf = state.settings.perf || { preset: 'standard' };
  let modChip;
  if (rust) {
    const label = (RUST_PLATFORMS.find(p => p.id === platformOf(inst)) || {}).label || 'Rust';
    modChip = `<span class="chip ok"><span class="dot"></span>${esc(label)} · Minecraft на Rust</span>`;
  } else if (!ov.enabled) modChip = '<span class="chip off"><span class="dot"></span>Orange Visuals выключен</span>';
  else if (state.mod && state.mod.active) modChip = '<span class="chip ok"><span class="dot"></span>Orange Visuals активен</span>';
  else if (state.mod && state.mod.reason) modChip = `<span class="chip off"><span class="dot"></span>Orange Visuals: ${esc(state.mod.reason)}</span>`;
  else modChip = '<span class="chip"><span class="dot"></span>Orange Visuals включится при запуске</span>';

  const accChip = rust
    ? '<span class="chip ok"><span class="dot"></span>Аккаунт Java не нужен</span>'
    : state.account
      ? `<span class="chip ok"><span class="dot"></span>${esc(state.account.username)} · ${accTypeLabel(state.account.type)}</span>`
      : '<span class="chip off"><span class="dot"></span>Аккаунт не выбран</span>';

  const perfChip = `<span class="chip ${perf.preset === 'standard' ? '' : 'ok'}"><span class="dot"></span>Пресет: ${esc(PERF_LABEL[perf.preset] || perf.preset)}</span>`;

  const playBtn = state.running
    ? '<button class="play stop" data-act="stop">ОСТАНОВИТЬ</button>'
    : `<button class="play" data-act="play" ${state.preparing ? 'disabled' : ''}>${state.preparing ? 'ПОДГОТОВКА…' : 'ИГРАТЬ'}</button>`;

  const totalMs = state.instances.reduce((s, i) => s + (i.playMs || 0), 0);
  const warn = inst && rust
    ? `<div class="note" style="margin-top:16px">${esc((RUST_PLATFORMS.find(p => p.id === platformOf(inst)) || {}).label || 'Rust')}: движок на Rust. Моды — из реестра Horizon (.hmod), Java-моды не подходят. Нужна ваша копия Minecraft ${esc(inst.version)}.</div>`
    : inst && !hasLoader(inst)
      ? `<div class="note warn" style="margin-top:16px">Сборка «${esc(inst.name)}» без загрузчика модов. Моды не запустятся — создайте сборку с Fabric, Quilt, Forge или NeoForge.</div>` : '';
  const cover = inst && inst.coverUrl ? `<img class="hero-cover" src="${esc(inst.coverUrl)}" alt="">` : '';

  return `
    <section class="hero ${cover ? 'has-cover' : ''}">
      ${cover}
      <div class="kicker">${state.running ? 'ИГРА ЗАПУЩЕНА' : 'ГОТОВ К ИГРЕ'}</div>
      <h1>${inst ? esc(inst.name) : 'Создайте первую сборку'}</h1>
      <p>${inst ? `Minecraft ${esc(inst.version)} · ${esc(loaderName(inst))}` : 'Во вкладке «Сборки» создайте версию Minecraft или установите сборку из «Моды и сборки».'}</p>
      <div class="chips">${accChip}${modChip}${perfChip}</div>
      ${warn}
      <div id="home-progress">${progressHTML(state.progress)}</div>
      <div class="play-row">
        ${playBtn}
        <select class="input" id="home-inst" style="min-width:260px;height:52px" ${state.running ? 'disabled' : ''}>
          ${state.instances.map(i => `<option value="${esc(i.id)}" ${i.id === state.selected ? 'selected' : ''}>${esc(i.name)} — ${esc(i.version)} · ${esc(loaderName(i))}</option>`).join('')} || '<option>Нет сборок</option>'}
        </select>
        <button class="btn log-toggle" data-act="toggle-log">${icon('terminal')} ${state.showLog ? 'Скрыть лог' : 'Показать лог'}</button>
      </div>
      ${state.showLog ? '<div class="console" id="console"></div>' : ''}
    </section>
    <div class="stat-grid">
      <div class="stat"><b>${state.instances.length}</b><span>сборок</span></div>
      <div class="stat"><b>${fmtPlay(totalMs)}</b><span>суммарно в игре</span></div>
      <div class="stat"><b>${(state.settings.ram / 1024).toFixed(1)} ГБ</b><span>памяти для Minecraft</span></div>
    </div>
    <div class="spacer"></div>
    <div class="grid-2">
      <div class="card">
        <h3>Быстрые действия</h3>
        <div class="row">
          <button class="btn" data-nav-go="instances">${icon('plus')} Новая сборка</button>
          <button class="btn" data-nav-go="mods">${icon('puzzle')} Найти мод</button>
          <button class="btn" data-nav-go="screens">${icon('image')} Скриншоты</button>
          <button class="btn" data-act="import-zip">${icon('upload')} Импорт сборки</button>
        </div>
      </div>
      <div class="card">
        <h3>Быстрый старт</h3>
        <div class="hint">1) «Аккаунт» — войдите через Microsoft или Ely.by, либо играйте оффлайн. 2) «Сборки» — создайте сборку с нужным загрузчиком и обложкой. 3) «Настройки» — выберите пресет «Очень оптимизировано» для слабого ПК. Minecraft на Rust — отдельная вкладка: там движки Horizon и Rustcraft и их моды. Ctrl+K открывает командную палитру. В игре клавиша меню (по умолчанию R Shift) открывает меню Orange Visuals.</div>
      </div>
    </div>`;
}


/* ================= Сборки ================= */

function viewInstances() {
  return `
    <div class="row" style="justify-content:space-between;margin-bottom:6px">
      <div><h1 class="page-title">Сборки</h1>
      <p class="page-sub" style="margin-bottom:0">Отдельная папка на каждую сборку: свои моды, миры и настройки.</p></div>
      <div class="row">
        <button class="btn" data-act="import-zip">${icon('upload')} Импорт .zip</button>
        <button class="btn primary" data-act="new-inst">${icon('plus')} Новая сборка</button>
      </div>
    </div>
    <div class="spacer"></div>
    <div class="search-bar">${icon('search')}<input class="input" id="inst-q" placeholder="Поиск по названию, версии или загрузчику…" value="${esc(state.instQuery)}" autocomplete="off"></div>
    <div class="spacer"></div>
    <div class="grid" id="inst-grid">${instCards()}</div>`;
}

function instCards() {
  const q = state.instQuery.trim().toLowerCase();
  const list = state.instances.filter(i => !q || `${i.name} ${i.version} ${loaderName(i)}`.toLowerCase().includes(q));
  if (q && !list.length) return '<div class="empty" style="grid-column:1/-1">Ничего не найдено</div>';
  const add = q ? '' : '<div class="add-card" data-act="new-inst"><div><b>+ Новая сборка</b>Vanilla, Fabric, Quilt, Forge, NeoForge или Minecraft на Rust</div></div>';
  return list.map(instCard).join('') + add;
}

function instCard(i) {
  const running = state.runningId === i.id;
  const cover = i.coverUrl
    ? `<img class="cover" src="${esc(i.coverUrl)}" alt="" loading="lazy">`
    : `<div class="cover cover-empty">${esc((i.name || '?')[0].toUpperCase())}</div>`;
  const id = esc(i.id);
  return `
    <div class="inst ${i.id === state.selected ? 'selected' : ''}">
      ${cover}
      ${i.id === state.selected ? '<span class="selected-badge">ВЫБРАНА</span>' : ''}
      ${running ? '<span class="running-badge">ИГРАЕТ</span>' : ''}
      <div class="inst-info"><h4>${esc(i.name)}</h4><div class="by">${esc(fmtPlay(i.playMs))}</div></div>
      <div class="tags">
        <span class="tag">Minecraft ${esc(i.version)}</span>
        <span class="tag ${hasLoader(i) ? 'fab' : ''}">${esc(loaderName(i))}</span>
        ${isRust(i) ? `<span class="tag fab">${esc((RUST_PLATFORMS.find(p => p.id === platformOf(i)) || {}).label || 'Rust')} · Rust</span>` : ''}
      </div>
      <div class="actions">
        ${i.id === state.selected ? '' : `<button class="btn small primary" data-act="select-inst" data-id="${id}">Выбрать</button>`}
        <button class="btn small" data-act="mods-manager" data-id="${id}">${icon('puzzle')} Моды</button>
        <button class="btn small" data-act="pick-cover" data-id="${id}" title="Обложка">${icon('image')}</button>
        <button class="btn small" data-act="open-inst" data-id="${id}">${icon('folder')} Папка</button>
        <button class="btn small" data-act="last-crash" data-id="${id}" title="Последний краш-отчёт">${icon('alert')}</button>
        <button class="btn small" data-act="dup-inst" data-id="${id}" title="Дубликат">${icon('copy')}</button>
        <button class="btn small" data-act="export-inst" data-id="${id}" title="Экспорт в zip">${icon('archive')}</button>
        <button class="btn small" data-act="backup-inst" data-id="${id}" title="Резервная копия миров">${icon('download')}</button>
        <button class="btn small danger" data-act="del-inst" data-id="${id}">${icon('trash')}</button>
      </div>
    </div>`;
}

function loaderBlockHTML(m) {
  if (m.loader === 'vanilla') return '<div class="hint">Vanilla — без модов.</div>';
  const lv = state.loaderCache[`${m.loader}|${m.version}`];
  if (!lv || lv.loading) return '<div class="hint">Загружаю список версий загрузчика…</div>';
  if (lv.error) return `<div class="note warn">${esc(lv.error)}</div>`;
  return `<select class="input" id="ni-lv">
      <option value="">Авто (рекомендуемая)</option>
      ${lv.list.slice(0, 60).map(v => `<option value="${esc(v)}" ${v === m.loaderVersion ? 'selected' : ''}>${esc(v)}</option>`).join('')}
    </select>`;
}

function coverBoxHTML(cover, letter = '?') {
  if (cover && cover.url) return `<div class="cover-preview"><img src="${esc(cover.url)}" alt=""></div>`;
  if (cover && cover.file) return `<div class="cover-preview"><div class="cover-file">${icon('image')}<span>${esc(cover.name || 'Файл выбран')}</span></div></div>`;
  return `<div class="cover-preview"><div class="cover-file muted">${icon('image')}<span>Без обложки: в списке будет буква «${esc(letter)}»</span></div></div>`;
}

function coverSearchHTML() {
  const cs = state.coverSearch;
  return `
    <div class="field" style="margin-top:14px"><label>Поиск картинки</label>
      <div class="search-bar">${icon('search')}<input class="input" id="cs-q" placeholder="Например: Create, выживание, RPG…" value="${esc(cs.q)}" autocomplete="off"></div>
      <div class="hint">Иконки модпаков и модов с Modrinth. Выберите подходящую — она станет обложкой.</div>
    </div>
    <div id="cs-results">${coverResultsHTML()}</div>`;
}

function coverResultsHTML() {
  const cs = state.coverSearch;
  if (!cs) return '';
  if (cs.loading) return '<div class="hint">Ищу картинки…</div>';
  if (cs.error) return `<div class="note warn">${esc(cs.error)}</div>`;
  if (!cs.items.length) return `<div class="hint">${cs.q.trim() ? 'Ничего не найдено. Попробуйте другое слово или выберите файл с диска.' : 'Введите название — покажу подходящие картинки.'}</div>`;
  const cur = state.modal && state.modal.type === 'new' ? state.modal.cover : null;
  return `<div class="cover-grid">${cs.items.map((it, i) => `
      <button class="cover-opt ${cur && cur.url === it.icon ? 'picked' : ''}" data-act="${cs.act}" data-idx="${i}" title="${esc(it.title)}">
        <img src="${esc(it.icon)}" alt="" loading="lazy">
        <span>${esc(it.title)}</span>
      </button>`).join('')}</div>`;
}

function releaseId() {
  const rel = state.versions.find(v => v.type === 'release');
  return rel ? rel.id : (state.versions[0] ? state.versions[0].id : '');
}

// Блок выбора версии Rust-движка (заменяет выбор загрузчика)
function rustBlockHTML(m) {
  const p = RUST_PLATFORMS.find(x => x.id === (m.platform || 'horizon')) || RUST_PLATFORMS[0];
  const info = (state.rustInfo || []).find(x => x.id === p.id) || {};
  const cache = state.rustCache[p.id];
  const head = `<div class="hint" style="margin-bottom:8px">Minecraft ${esc(info.game || p.game)} · движок ${esc(p.label)}. ${info.mods ? 'У него свой реестр модов .hmod.' : 'Модов нет: только игра и ресурспаки.'}</div>`;
  if (!cache || cache.loading) return `${head}<div class="hint">Загружаю версии ${esc(p.label)}…</div>`;
  if (cache.error) return `${head}<div class="note warn">${esc(cache.error)}</div>`;
  return `${head}
    <select class="input" id="ni-rust-tag">
      <option value="">Авто (последняя версия)</option>
      ${cache.list.slice(0, 40).map(r => `<option value="${esc(r.tag)}" ${r.tag === m.loaderVersion ? 'selected' : ''}>${esc(r.tag)}${r.prerelease ? ' (тест)' : ''}</option>`).join('')}
    </select>
    <div class="hint">Движок скачается с GitHub. Horizon один раз готовит данные из вашей копии Minecraft ${esc(p.game)}; JDK 25 лаунчер скачает сам.</div>`;
}

function modalNewInstance() {
  const m = state.modal;
  const plat = m.platform || 'java';
  const rust = plat !== 'java';
  const versions = state.versions.filter(v => (m.snap ? true : v.type === 'release'));
  const opts = versions.map(v => `<option value="${esc(v.id)}" ${v.id === m.version ? 'selected' : ''}>${esc(v.id)}${v.type !== 'release' ? ' (снапшот)' : ''}</option>`).join('');
  const letter = (m.name || 'Новая сборка')[0].toUpperCase();
  const rustP = RUST_PLATFORMS.find(x => x.id === plat);
  const rustInfo = (state.rustInfo || []).find(x => x.id === plat) || {};

  return `
  <div class="modal-bg" data-act="close-modal">
    <div class="modal wide ni-modal">
      <h2>Новая сборка</h2>
      <div class="ni-layout">
        <div class="ni-form">
          <div class="field"><label>Название</label><input class="input" id="ni-name" placeholder="Например: Выживание" value="${esc(m.name)}" maxlength="64" autocomplete="off"></div>
          <div class="field"><label>Платформа</label>
            <div class="seg wrap">
              <button class="${!rust ? 'active' : ''}" data-platform="java">Java Edition</button>
              ${RUST_PLATFORMS.map(p => `<button class="${plat === p.id ? 'active' : ''}" data-platform="${p.id}">${p.label} (Rust)</button>`).join('')}
            </div>
            <div class="hint">Minecraft на Rust — отдельный движок: своя папка, свои моды (.hmod) и своя страница «Minecraft Rust». Java-моды и загрузчики к нему не подходят.</div>
          </div>
          ${rust ? `
          <div class="grid-2 tight">
            <div class="field"><label>Версия движка ${esc(rustP ? rustP.label : '')}</label><div id="ni-rust-wrap">${rustBlockHTML(m)}</div></div>
            <div class="field"><label>Minecraft</label><input class="input" value="${esc((rustInfo.game || (rustP && rustP.game) || '26.3'))}" disabled></div>
          </div>
          <div class="note" style="margin-top:4px">Аккаунт Java не нужен: Horizon входит в игру сам${rustP && rustP.id === 'rustcraft' ? ', Rustcraft запускается с ником из лаунчера' : ''}. Данные игры берутся из вашей копии Minecraft.</div>
          ` : `
          <div class="grid-2 tight">
            <div class="field"><label>Версия Minecraft</label>
              <select class="input" id="ni-version">${opts}</select>
              <label class="check"><input type="checkbox" id="ni-snap" ${m.snap ? 'checked' : ''}> показать снапшоты</label>
            </div>
            <div class="field"><label>Версия загрузчика</label><div id="ni-lv-wrap">${loaderBlockHTML(m)}</div></div>
          </div>
          <div class="field"><label>Загрузчик модов</label>
            <div class="seg wrap">
              ${LOADERS.map(l => `<button class="${m.loader === l.id ? 'active' : ''}" data-loader="${l.id}">${l.label}</button>`).join('')}
            </div>
            <div class="hint">Моды Fabric, Quilt, Forge и NeoForge ставятся только в сборку с подходящим загрузчиком. Forge и NeoForge устанавливаются автоматически при первом запуске.</div>
          </div>`}
        </div>
        <div class="ni-cover">
          <div class="field"><label>Обложка</label>
            <div id="ni-cover-box">${coverBoxHTML(m.cover, letter)}</div>
            <div class="row" style="margin-top:8px">
              <button class="btn small" data-act="ni-pick-file">${icon('folder')} Файл…</button>
              <button class="btn small" data-act="ni-clear-cover">Без обложки</button>
            </div>
          </div>
          ${coverSearchHTML()}
        </div>
      </div>
      <div class="actions">
        <button class="btn" data-act="close-modal">Отмена</button>
        <button class="btn primary" data-act="create-inst">Создать</button>
      </div>
    </div>
  </div>`;
}

function modalCover() {
  const m = state.modal;
  const inst = state.instances.find(i => i.id === m.instId);
  const name = inst && inst.name ? inst.name : '?';
  const big = inst && inst.coverUrl
    ? `<img class="cover-big" src="${esc(inst.coverUrl)}" alt="">`
    : `<div class="cover-big cover-empty">${esc(name[0].toUpperCase())}</div>`;
  return `
  <div class="modal-bg" data-act="close-modal">
    <div class="modal wide ni-modal">
      <h2>Обложка: ${esc(name)}</h2>
      <div class="ni-layout">
        <div class="ni-cover-solo">${big}</div>
        <div class="ni-cover">
          ${coverSearchHTML()}
          <div class="row" style="margin-top:10px">
            <button class="btn" data-act="cv-pick-file">${icon('folder')} Файл с диска…</button>
            <button class="btn" data-act="cv-clear">Убрать обложку</button>
          </div>
        </div>
      </div>
      <div class="actions"><button class="btn primary" data-act="close-modal">Готово</button></div>
    </div>
  </div>`;
}

function modalCrash() {
  const m = state.modal;
  return `
  <div class="modal-bg" data-act="close-modal">
    <div class="modal wide">
      <h2>Последний краш-отчёт</h2>
      <div class="hint mono" style="margin-bottom:8px;word-break:break-all">${esc(m.path)}</div>
      <pre class="crash-text">${esc(m.text)}</pre>
      <div class="actions">
        <button class="btn" data-act="crash-open" data-path="${esc(m.path)}">${icon('ext')} Открыть файл</button>
        <button class="btn primary" data-act="close-modal">Закрыть</button>
      </div>
    </div>
  </div>`;
}

function modalMods() {
  const m = state.modal;
  const inst = state.instances.find(i => i.id === m.instId);
  const list = m.list;
  const rows = !list ? '<div class="empty">Загружаю список…</div>'
    : !list.length ? '<div class="empty">Своих модов пока нет. Установите моды из «Моды и сборки».</div>'
    : list.map(x => `
      <div class="mod-row ${x.enabled ? '' : 'off'}">
        <div class="grow">
          <b>${esc(x.name)}</b>
          <div class="hint">${esc(x.file)} · ${fmtMB(x.size)}</div>
        </div>
        <label class="toggle"><input type="checkbox" data-act-change="mod-toggle" data-file="${esc(x.file)}" ${x.enabled ? 'checked' : ''}><span class="track"></span></label>
        <button class="btn small danger" data-act="mod-del" data-file="${esc(x.file)}" title="Удалить">${icon('trash')}</button>
      </div>`).join('');
  const hidden = m.hidden
    ? `<div class="hint hidden-note">Скрыто: ${m.hidden}. Это Fabric API, Orange Visuals и моды, которые лаунчер поставил сам (зависимости и пакет оптимизации).</div>` : '';
  return `
  <div class="modal-bg" data-act="close-modal">
    <div class="modal wide">
      <h2>Моды: ${esc(inst ? inst.name : '')}</h2>
      <div class="hint" style="margin-bottom:12px">${inst ? esc(loaderName(inst)) + ' · Minecraft ' + esc(inst.version) : ''}. ${inst && isRust(inst) ? 'Моды .hmod из реестра Horizon: включение и выключение пишется в horizon-mods.txt.' : 'Выключенный мод переименовывается в .disabled и не загружается.'}</div>
      <div class="mod-list">${rows}</div>
      ${hidden}
      <div class="actions">
        <button class="btn" data-act="mods-open-folder" data-id="${esc(m.instId)}">${icon('folder')} Открыть папку модов</button>
        <button class="btn primary" data-act="close-modal">Готово</button>
      </div>
    </div>
  </div>`;
}

function modalPalette() {
  const p = state.palette;
  const items = paletteItems().filter(it => !p.q || it.label.toLowerCase().includes(p.q.toLowerCase()));
  p.sel = Math.min(p.sel, Math.max(0, items.length - 1));
  return `
  <div class="modal-bg palette-bg" data-act="close-palette">
    <div class="palette">
      <input class="input palette-input" id="pal-q" placeholder="Команда или раздел…" value="${esc(p.q)}" autocomplete="off">
      <div class="palette-list">
        ${items.map((it, i) => `<div class="pal-item ${i === p.sel ? 'sel' : ''}" data-pal="${i}"><span>${esc(it.label)}</span><small>${esc(it.hint || '')}</small></div>`).join('') || '<div class="empty" style="padding:24px">Ничего не найдено</div>'}
      </div>
    </div>
  </div>`;
}

function paletteItems() {
  const nav = NAV.flatMap(g => g.items).map(it => ({ label: `Перейти: ${it.label}`, run: () => setView(it.id) }));
  return [
    { label: 'Играть (выбранная сборка)', hint: 'Запуск', run: () => launch() },
    { label: state.running ? 'Остановить игру' : 'Остановить игру (сейчас не запущена)', run: () => window.ember.game.stop() },
    { label: 'Новая сборка', run: () => openNewInstance() },
    { label: 'Новая сборка Horizon (Minecraft на Rust)', hint: 'Rust', run: () => openRustInstance('horizon') },
    { label: 'Моды для Minecraft на Rust (реестр Horizon)', hint: 'Rust', run: () => setView('rust') },
    { label: 'Импорт сборки из .zip', run: () => importZip() },
    { label: 'Оптимизация: применить пресет к выбранной сборке', run: () => applyPerf() },
    { label: 'Поиск модов', run: () => setView('mods') },
    ...nav,
  ];
}

// Перерисовка модалки сохраняет фокус и позицию курсора в поле, которое было активно.
function renderModal() {
  const root = $('#modal-root');
  const ae = document.activeElement;
  const focusId = ae && ae.id && root.contains(ae) ? ae.id : null;
  const range = focusId && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null;

  if (state.palette) {
    root.innerHTML = modalPalette();
    const q = $('#pal-q');
    if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    return;
  }
  if (!state.modal) { root.innerHTML = ''; return; }

  // Запоминаем значения всех полей модалки: перерисовка не должна терять набранный текст
  const kept = {};
  root.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
    if (el.type === 'checkbox' || el.type === 'radio') return;
    kept[el.id] = el.value;
  });

  const m = state.modal;
  if (m.type === 'new') root.innerHTML = modalNewInstance();
  else if (m.type === 'mods') root.innerHTML = modalMods();
  else if (m.type === 'cover') root.innerHTML = modalCover();
  else if (m.type === 'crash') root.innerHTML = modalCrash();

  for (const id of Object.keys(kept)) {
    const el = document.getElementById(id);
    if (el && el.value !== kept[id] && el.tagName !== 'SELECT') el.value = kept[id];
  }

  if (m.autofocus) {
    m.autofocus = false;
    const el = $('#ni-name') || $('#cs-q');
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  } else if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      if (range && el.setSelectionRange) el.setSelectionRange(range[0], range[1]);
    }
  }
}

// Читает значения полей модалки в состояние, прежде чем её перерисовать
function syncModal() {
  if (!state.modal || state.modal.type !== 'new') return;
  const n = $('#ni-name');
  const v = $('#ni-version');
  const lv = $('#ni-lv');
  const rt = $('#ni-rust-tag');
  if (n) state.modal.name = n.value;
  if (v) state.modal.version = v.value;
  if (lv) state.modal.loaderVersion = lv.value;
  // Rust-сборка: выбранная версия движка (пусто — последняя)
  if (rt) state.modal.loaderVersion = rt.value;
}

// Обновляет только блок «Версия загрузчика», без перерисовки всей модалки и без потери фокуса
function refreshLoaderBlock() {
  const m = state.modal;
  if (!m || m.type !== 'new') return;
  const w = $('#ni-lv-wrap');
  if (w) w.innerHTML = loaderBlockHTML(m);
}

async function ensureLoaderList(loader, mc) {
  if (loader === 'vanilla' || !mc) return;
  const key = `${loader}|${mc}`;
  if (state.loaderCache[key]) return;
  state.loaderCache[key] = { loading: true };
  refreshLoaderBlock();
  try {
    const list = await window.ember.loaderVersions(loader, mc);
    state.loaderCache[key] = { list };
  } catch (e) {
    state.loaderCache[key] = { error: `Не удалось получить версии ${LOADER_LABEL[loader]}: ${e.message}` };
  }
  refreshLoaderBlock();
}

function newCoverSearch(act) {
  return { act, q: '', items: [], loading: false, error: '', seq: 0 };
}

function openNewInstance(loader = 'fabric') {
  state.modal = {
    type: 'new', platform: 'java', name: '', version: releaseId(), loader, loaderVersion: '',
    snap: false, cover: null, autofocus: true,
  };
  state.coverSearch = newCoverSearch('ni-pick-result');
  renderModal();
  ensureLoaderList(loader, state.modal.version);
}

// Сборка Minecraft на Rust: загрузчика нет, вместо него — версия движка
function openRustInstance(platformId = 'horizon') {
  const p = RUST_PLATFORMS.find(x => x.id === platformId) || RUST_PLATFORMS[0];
  const info = (state.rustInfo || []).find(x => x.id === p.id) || {};
  const game = info.game || p.game;
  state.modal = {
    type: 'new', platform: p.id, name: '', version: game, gameVersion: game,
    loader: p.id, loaderVersion: '', snap: false, cover: null, autofocus: true,
  };
  state.coverSearch = newCoverSearch('ni-pick-result');
  renderModal();
  ensureRustList(p.id);
}

async function ensureRustList(platformId) {
  const hit = state.rustCache[platformId];
  if (hit && !hit.error) return;
  state.rustCache[platformId] = { loading: true };
  try {
    const list = await window.ember.rust.releases(platformId);
    state.rustCache[platformId] = { list };
  } catch (e) {
    state.rustCache[platformId] = { error: `Не удалось получить версии ${platformId}: ${e.message}` };
  }
  if (state.modal && state.modal.type === 'new' && state.modal.platform === platformId) {
    const w = $('#ni-rust-wrap');
    if (w) w.innerHTML = rustBlockHTML(state.modal);
  }
}

function openCoverModal(id) {
  const inst = state.instances.find(i => i.id === id);
  if (!inst) return;
  state.modal = { type: 'cover', instId: id, autofocus: true };
  state.coverSearch = newCoverSearch('cv-pick-result');
  state.coverSearch.q = inst.name;
  renderModal();
  runCoverSearch();
}

function paintCoverResults() {
  const el = $('#cs-results');
  if (el) el.innerHTML = coverResultsHTML();
}

async function runCoverSearch() {
  const cs = state.coverSearch;
  if (!cs) return;
  const q = cs.q.trim();
  const seq = ++cs.seq;
  if (!q) {
    cs.items = []; cs.loading = false; cs.error = '';
    return paintCoverResults();
  }
  cs.loading = true; cs.error = '';
  paintCoverResults();
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
  paintCoverResults();
}

/* ================= Моды и сборки ================= */

function viewMods() {
  const s = state.search;
  const inst = selectedInst();
  const rust = isRust(inst);

  // Источники под платформу выбранной сборки: Java-моды и моды для Rust не смешиваются.
  // Пока сборка не выбрана, показываем всё — так можно установить сборку из реестра Horizon.
  const sources = SOURCES.filter(src => !inst || src.platform === 'any' || (rust ? src.platform === 'rust' : src.platform === 'java'));
  if (!sources.some(src => src.id === s.source)) {
    s.source = sources[0].id;
    s.kind = KINDS[s.source][0][0];
  }
  const kinds = KINDS[s.source];
  if (!kinds.some(k => k[0] === s.kind)) s.kind = kinds[0][0];
  const src = SOURCES.find(x => x.id === s.source) || sources[0];

  const cfWarn = s.source === 'curseforge' && !state.settings.curseforgeKey
    ? '<div class="note warn" style="margin-bottom:14px">Для CurseForge нужен бесплатный API-ключ. <a href="#" data-act="go-settings">Вставить в Настройках</a> — ключ берётся на console.curseforge.com.</div>'
    : '';
  const needLoader = s.kind === 'mod' && (s.source === 'modrinth' || s.source === 'curseforge' || s.source === 'github');
  const loaderWarn = !rust && needLoader && !hasLoader(inst)
    ? `<div class="empty loader-empty">
        <div class="big-ico">${icon('puzzle')}</div>
        <b>${inst ? `В сборке «${esc(inst.name)}» нет загрузчика модов` : 'Нет выбранной сборки'}</b>
        <p>Моды Java Edition работают только с загрузчиком: Fabric, Quilt, Forge или NeoForge. Чистая Vanilla их не запускает, поэтому список модов скрыт.</p>
        <div class="row" style="justify-content:center">
          ${MOD_LOADERS.map(l => `<button class="btn ${l === 'fabric' ? 'primary' : ''}" data-act="new-inst-loader" data-loader="${l}">${icon('plus')} Сборка с ${LOADER_LABEL[l]}</button>`).join('')}
        </div>
      </div>`
    : '';
  // Источник для Minecraft на Rust, а сборка Java (или не выбрана вовсе)
  const rustWarn = src.platform === 'rust' && !rust
    ? `<div class="empty loader-empty">
        <div class="big-ico">${icon('bolt')}</div>
        <b>Это моды для Minecraft на Rust</b>
        <p>Horizon запускает только .hmod из своего реестра: Java-сборка такой файл не увидит. Создайте сборку Horizon или откройте раздел «Minecraft Rust».</p>
        <div class="row" style="justify-content:center">
          <button class="btn primary" data-act="rust-new" data-platform="horizon">${icon('plus')} Создать сборку Horizon</button>
          <button class="btn" data-act="go-rust">${icon('bolt')} Что такое Minecraft на Rust</button>
        </div>
      </div>`
    : '';
  // Rustcraft — клиент без модов: искать .hmod для него бессмысленно
  const rustcraftWarn = inst && platformOf(inst) === 'rustcraft'
    ? `<div class="empty loader-empty">
        <div class="big-ico">${icon('bolt')}</div>
        <b>Rustcraft запускается без модов</b>
        <p>Это клиент вместо java.exe: он заменяет Java, но своей системы модов у него нет. Моды .hmod работают только в Horizon — там свой реестр. Ресурспаки в эту сборку ставить можно: вкладка «По ссылке», файл .zip.</p>
        <div class="row" style="justify-content:center">
          <button class="btn primary" data-act="rust-new" data-platform="horizon">${icon('plus')} Создать сборку Horizon</button>
          <button class="btn" data-act="go-rust">${icon('bolt')} Подробнее о движках</button>
        </div>
      </div>`
    : '';
  const blocked = loaderWarn || rustWarn || rustcraftWarn;

  const sameVer = s.onlySameVersion && inst;
  const where = inst
    ? `Установка в «${esc(inst.name)}» (Minecraft ${esc(inst.version)}, ${esc(loaderName(inst))})`
    : 'Сборка не выбрана: моды ставить некуда, сборки из реестра создадут новую сборку';
  const platformHint = rust && platformOf(inst) === 'horizon'
    ? ' Это сборка Horizon: Java-моды из Modrinth и CurseForge в неё не ставятся.'
    : '';
  const verNote = src.platform === 'java' && inst && !sameVer ? ' Фильтр по версии выключен, проверяйте совместимость.' : '';

  // Поиск не рисуем вовсе, когда ставить некуда: блокирующая подсказка уже на экране
  const searchArea = blocked ? '' : `
    <div class="toolbar">
      <div class="search-box">
        ${icon('search')}
        <input class="input" id="search-q" placeholder="${src.platform === 'rust' ? 'Поиск: minimap, zoom, veinminer…' : 'Поиск: sodium, JEI, Better Minecraft…'}" value="${esc(s.query)}">
      </div>
    </div>
    <div id="results"></div>`;

  return `
    <h1 class="page-title">Моды и сборки</h1>
    <p class="page-sub">Java Edition: Modrinth, CurseForge, Hangar, Smithed и GitHub. Minecraft на Rust: реестр Horizon и .hmod из GitHub.</p>
    <div class="src-tabs">
      ${sources.map(src => `<button class="src-tab ${s.source === src.id ? 'active' : ''}" data-src="${src.id}"><i style="color:${src.color}"></i>${src.label}</button>`).join('')}
    </div>
    <div class="toolbar">
      <div class="seg">
        ${kinds.map(k => `<button class="${s.kind === k[0] ? 'active' : ''}" data-kind="${k[0]}">${k[1]}</button>`).join('')}
      </div>
      <div class="grow"></div>
      <label class="hint check"><input type="checkbox" id="only-inst" ${s.onlySameVersion ? 'checked' : ''} ${s.source === 'hangar' || s.source === 'link' || src.platform === 'rust' ? 'disabled' : ''}> Только версия выбранной сборки</label>
      <select class="input" id="target-inst" style="min-width:260px" ${s.source === 'hangar' ? 'disabled' : ''}>
        ${state.instances.map(i => `<option value="${esc(i.id)}" ${i.id === state.selected ? 'selected' : ''}>${esc(i.name)} · ${esc(i.version)} · ${esc(loaderName(i))}</option>`).join('') || '<option>Нет сборок</option>'}
      </select>
    </div>
    ${cfWarn}
    ${SOURCE_HINTS[s.source] ? `<div class="hint" style="margin-bottom:14px">${esc(SOURCE_HINTS[s.source])}</div>` : ''}
    ${s.source === 'link' ? linkPanel() : `${blocked || ''}${searchArea}`}
    ${inst && s.source !== 'hangar' && s.source !== 'link' && !blocked ? `<div class="hint" style="margin-top:14px">${where}.${verNote}${platformHint}${s.kind === 'modpack' ? ' Каждая сборка из этого списка создаёт новую сборку автоматически.' : ''}</div>` : ''}`;
}

function linkPanel() {
  return `
    <div class="card">
      <h3>Установить по ссылке</h3>
      <div class="toolbar" style="margin-bottom:0">
        <input class="input grow" id="link-url" placeholder="https://example.com/mod-1.0.jar">
        <button class="btn primary" data-act="install-link">${icon('download')} Установить</button>
      </div>
    </div>`;
}

function itemCard(it, idx) {
  const st = installStateOf(it);
  const done = st === 'current';
  let action;
  if (done) {
    action = `<button class="btn small" disabled title="Уже есть в этой сборке">${icon('check')} Уже установлено</button>`;
  } else if (st === 'outdated') {
    action = `<button class="btn small primary" data-act="install" data-idx="${idx}" title="В сборке старая версия">${icon('download')} Обновить</button>`;
  } else {
    action = `<button class="btn small primary" data-act="install" data-idx="${idx}">${icon('download')} ${it.kind === 'modpack' ? 'Установить сборку' : it.kind === 'plugin' ? 'Скачать' : 'Установить'}</button>`;
  }
  return `
    <div class="item${done ? ' installed' : st === 'outdated' ? ' outdated' : ''}">
      <div class="head">
        ${it.icon ? `<img class="ico" src="${esc(it.icon)}" alt="" loading="lazy" decoding="async">` : `<div class="ico ph">${esc((it.title || '?')[0])}</div>`}
        <div style="min-width:0"><h4>${esc(it.title)}</h4><div class="by">${esc(it.author || '')}</div></div>
      </div>
      <p>${esc(it.description || '')}</p>
      ${it.meta ? `<div class="hint" style="margin:-2px 0 10px">${esc(it.meta)}</div>` : ''}
      <div class="foot">
        <span class="dl">${it.downloads != null ? fmt(it.downloads) + ' загрузок' : ''}</span>
        <button class="btn small" data-act="open-web" data-idx="${idx}" title="Открыть страницу">${icon('ext')}</button>
        ${action}
      </div>
    </div>`;
}

// Состояние результатов поиска в выбранной сборке: 'current' (стоит и актуален), 'outdated' (стоит, но старая версия), 'none'.
// Считается по файлам в папке mods, поэтому удалённый мод снова доступен для установки.
state.installStates = {};
async function refreshInstalled() {
  const inst = selectedInst();
  const items = (state.search.items || []).filter(it => it.kind === 'mod');
  if (!inst || !items.length) { state.installStates = {}; return; }
  const list = items.map(it => ({ source: it.source, id: it.id, slug: it.slug, kind: it.kind, title: it.title }));
  state.installStates = await window.ember.mods.states(inst.id, list).catch(() => ({})) || {};
}
function installStateOf(it) {
  if (!it || it.kind !== 'mod') return 'none';
  return (state.installStates && state.installStates[`${it.source}:${it.id}`]) || 'none';
}

// Полная отрисовка результатов (при новом запросе)
function renderResults() {
  const s = state.search;
  const box = $('#results');
  if (!box) return;
  if (s.error && !s.items.length) { box.innerHTML = `<div class="note warn">${esc(s.error)}</div>`; return; }
  const warn = s.error ? `<div class="note warn">${esc(s.error)}</div>` : '';
  if (!s.items.length && s.loading) { box.innerHTML = '<div class="empty">Ищу…</div>'; return; }
  if (!s.items.length) { box.innerHTML = '<div class="empty">Ничего не найдено. Попробуйте другой запрос или снимите фильтр по версии.</div>'; return; }
  box.innerHTML = `${warn}<div class="grid" id="grid">${s.items.map(itemCard).join('')}</div>${footerHTML()}`;
}

function footerHTML() {
  const s = state.search;
  if (s.loading && s.items.length) return '<div class="more-status" id="more-status">Загружаю ещё…</div><div id="sentinel"></div>';
  if (s.hasMore) return '<div id="sentinel" class="sentinel"></div>';
  if (s.items.length) return `<div class="more-status">Это всё. Найдено: ${s.items.length}</div>`;
  return '';
}

function setupInfinite() {
  const sentinel = $('#sentinel');
  const root = $('#view');
  if (observer) { observer.disconnect(); observer = null; }
  if (!sentinel || !root || !('IntersectionObserver' in window)) return;
  observer = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) loadMore();
  }, { root, rootMargin: '600px 0px' });
  observer.observe(sentinel);
}

// Догрузка следующей страницы без перерисовки всей сетки.
async function loadMore() {
  const s = state.search;
  if (s.loading || !s.hasMore) return;
  await runSearch(false);
}

// Статусы установленных модов не должны задерживать выдачу: обновляем их фоном
// и перерисовываем сетку, сохранив позицию прокрутки
function refreshStates(seq) {
  refreshInstalled().then(() => {
    if (seq !== state.search.seq || state.view !== 'mods') return;
    const view = $('#view');
    const top = view ? view.scrollTop : 0;
    renderResults();
    setupInfinite();
    if (view) view.scrollTop = top;
  }).catch(() => {});
}

async function runSearch(fresh = true) {
  const s = state.search;
  if (s.source === 'link') return;
  const inst = selectedInst();
  const src = SOURCES.find(x => x.id === s.source) || { platform: 'java' };
  const rustSource = src.platform === 'rust';
  const needLoader = !rustSource && s.kind === 'mod' && (s.source === 'modrinth' || s.source === 'curseforge' || s.source === 'github');
  // Моды .hmod не ищутся, пока выбрана Java-сборка: их всё равно некуда ставить
  const wrongPlatform = rustSource && !!inst && !isRust(inst);
  if ((needLoader && !hasLoader(inst)) || wrongPlatform) {
    s.items = []; s.hasMore = false; s.error = ''; s.loading = false;
    renderResults();
    return;
  }
  if (fresh) {
    s.items = []; s.hasMore = false; s.error = '';
    s.seq++;
    await refreshInstalled();
    renderResults();
  }
  const seq = s.seq;
  s.loading = true;
  const useInst = !rustSource && s.onlySameVersion && inst && s.source !== 'hangar' && s.source !== 'github';
  // Фильтр загрузчика: только для модов Java Edition. Rust-реестр знает только версию игры движка.
  const opts = {
    query: s.query,
    kind: s.kind,
    gameVersion: useInst ? inst.version : undefined,
    loader: !rustSource && s.kind === 'mod' && hasLoader(inst) ? inst.loader : undefined,
    offset: s.items.length,
  };
  if (!fresh) {
    const status = $('#more-status'); if (status) status.textContent = 'Загружаю ещё…';
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
  refreshStates(seq); // статусы «уже установлено» — в фоне, выдача уже на экране
  if (fresh || !$('#grid') || s.error) { renderResults(); setupInfinite(); return; }
  // Догрузка: дописываем карточки в конец сетки, без перерисовки всей выдачи
  const grid = $('#grid');
  const from = grid.children.length;
  grid.insertAdjacentHTML('beforeend', s.items.slice(from).map((it, i) => itemCard(it, from + i)).join(''));
  const old = $('#view').querySelector('#sentinel, #more-status');
  if (old) old.remove();
  const tail = footerHTML();
  if (tail) $('#results').insertAdjacentHTML('beforeend', tail);
  setupInfinite();
}

async function installItem(idx) {
  const it = state.search.items[idx];
  const inst = selectedInst();
  if (!it) return;
  if (it.kind !== 'modpack' && it.kind !== 'plugin' && !inst) {
    return toast('Сначала создайте сборку во вкладке «Сборки»', 'err');
  }
  const st = installStateOf(it);
  if (st === 'current') return toast(`«${it.title}» уже есть в этой сборке`, 'err');
  const update = st === 'outdated';
  state.progress = { stage: update ? 'Обновление' : 'Установка', text: it.title };
  renderBusy();
  try {
    const res = await window.ember.install(it, inst && inst.id, { update });
    if (res.instance) {
      toast(`Создана сборка «${res.instance.name}» и выбрана`, 'ok');
    } else if (res.note) {
      toast(res.note, 'ok');
    } else if (update) {
      toast(`«${it.title}» обновлён в «${inst.name}»`, 'ok');
    } else {
      toast(`Установлено в «${inst.name}»: ${(res.installed || []).length} файл(ов)`, 'ok');
    }
    await refreshInstalled();
    renderResults();
    await reloadInstances();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    state.progress = null;
    renderBusy();
  }
}

/* ================= Minecraft на Rust ================= */

function rustCard(r) {
  const p = RUST_PLATFORMS.find(x => x.id === r.id) || { label: r.label };
  const latest = r.latest;
  const engines = (r.engines || []).slice(0, 4);
  return `
  <div class="card">
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div>
        <h3 style="margin-bottom:2px">${icon('bolt')} ${esc(r.label)}</h3>
        <div class="hint">Minecraft ${esc(r.game)} · ${r.mods ? 'свой реестр модов' : 'без модов'}</div>
      </div>
      <span class="tag ${r.mods ? 'fab' : ''}">Rust</span>
    </div>
    <p class="page-sub" style="margin:10px 0 12px">${esc(r.note || '')}</p>
    ${r.error ? `<div class="note warn" style="margin-bottom:10px">${esc(r.error)}</div>` : ''}
    ${latest ? `<div class="hint" style="margin-bottom:8px">Последняя версия: <b>${esc(latest.tag)}</b> · ${esc(new Date(latest.publishedAt).toLocaleDateString('ru-RU'))}${latest.prerelease ? ' · тест' : ''}</div>` : ''}
    ${engines.length
      ? `<div style="margin-bottom:12px">${engines.map(e => `
          <div class="row" style="gap:8px;align-items:center;margin-bottom:6px">
            <span class="tag fab">${esc(e.tag)}</span>
            <span class="hint grow">${e.prepared ? 'данные игры готовы' : (r.id === 'horizon' ? 'данные игры не подготовлены — подготовятся при первом запуске' : 'готов к запуску')}</span>
            <button class="btn small" data-act="rust-open-file" data-path="${esc(e.path)}">${icon('folder')} Папка</button>
          </div>`).join('')}</div>`
      : '<div class="hint" style="margin-bottom:12px">Движок ещё не скачан: загрузится при первом запуске.</div>'}
    <div class="row">
      <button class="btn primary" data-act="rust-new" data-platform="${r.id}">${icon('plus')} Создать сборку</button>
      <button class="btn" data-act="rust-prepare" data-platform="${r.id}" data-tag="${latest ? esc(latest.tag) : ''}">${icon('download')} Скачать движок</button>
      <button class="btn" data-act="rust-site" data-url="${esc(r.site)}">${icon('ext')} Сайт</button>
    </div>
  </div>`;
}

function viewRust() {
  const list = state.rustInfo;
  const rows = list === null
    ? '<div class="empty" style="grid-column:1/-1">Загружаю платформы…</div>'
    : !list.length
      ? `<div class="note warn" style="grid-column:1/-1">${esc(state.rustError || 'Не удалось получить данные GitHub')}</div>`
      : list.map(rustCard).join('');
  const horizon = (list || []).find(r => r.id === 'horizon');
  return `
    <h1 class="page-title">Minecraft на Rust</h1>
    <p class="page-sub">Отдельные движки: Minecraft Java Edition 26.3, переписанный на Rust. Это не загрузчик и не мод к Java-версии — своя папка, свой запуск и свои моды.</p>
    <div class="grid-2">${rows}</div>
    <div class="spacer"></div>
    <div class="card">
      <h3>Платформы модов только для Minecraft на Rust</h3>
      <p class="page-sub" style="margin:6px 0 12px">Java-моды (.jar) здесь не работают. У Horizon свой реестр проверенных модов: .hmod и нативные .hnmod, сборки .hpack и ресурспаки. Каждый файл сверяется по SHA-256, снятые с публикации не ставятся. Шейдерпаки (.hshader) кладутся в папку сборки shaderpacks и выбираются в игре.</p>
      <div class="row">
        <button class="btn primary" data-act="rust-registry">${icon('puzzle')} Реестр Horizon</button>
        <button class="btn" data-act="rust-new" data-platform="horizon">${icon('plus')} Сборка Horizon</button>
      </div>
      <div class="hint" style="margin-top:12px">Второй источник — «Rust: GitHub» в разделе «Моды и сборки»: .hmod из релизов GitHub, которых ещё нет в реестре. Такие файлы не проверены.</div>
    </div>
    <div class="spacer"></div>
    <div class="card">
      <h3>Что нужно знать</h3>
      <ul class="hint" style="margin:8px 0 0;padding-left:18px;line-height:1.7">
        <li>Нужна своя копия Minecraft Java Edition ${esc(horizon ? horizon.game : '26.3')}: движок берёт из неё ресурсы и звуки.</li>
        <li>Horizon один раз готовит данные игры (JDK 25 лаунчер скачает сам), после этого игра запускается без Java.</li>
        <li>Rustcraft — клиент вместо <span class="mono">java.exe</span>: запускается из сборки, но модов не поддерживает.</li>
        <li>Аккаунт Ely.by для Rust-сборок не нужен. Worlds и настройки лежат в папке своей сборки.</li>
      </ul>
    </div>`;
}

async function loadRustPage(fresh = false) {
  if (state.rustInfo && !fresh) return;
  try {
    state.rustInfo = await window.ember.rust.info();
    state.rustError = '';
  } catch (e) {
    state.rustInfo = state.rustInfo || [];
    state.rustError = e.message;
  }
  if (state.view === 'rust') renderView();
}

/* ================= Скриншоты ================= */

function viewScreens() {
  const list = state.screens;
  if (!list) return '<h1 class="page-title">Скриншоты</h1><p class="page-sub">Загружаю…</p>';
  if (!list.length) {
    return `<h1 class="page-title">Скриншоты</h1>
      <p class="page-sub">Скриншоты из всех сборок. Снимок делается клавишей F2 в игре.</p>
      <div class="empty">Скриншотов пока нет.</div>`;
  }
  return `<h1 class="page-title">Скриншоты</h1>
    <p class="page-sub">${list.length} шт. из всех сборок. Нажмите на снимок, чтобы открыть его.</p>
    <div class="shots">
      ${list.map((s, i) => `
        <figure class="shot" data-act="open-shot" data-idx="${i}">
          <img src="${esc(s.url)}" alt="" loading="lazy" decoding="async">
          <figcaption><b>${esc(s.instance)}</b><span>${new Date(s.mtime).toLocaleDateString('ru-RU')}</span></figcaption>
        </figure>`).join('')}
    </div>`;
}

async function loadScreens() {
  state.screens = null;
  renderView();
  try { state.screens = await window.ember.screenshots(); } catch (e) { state.screens = []; toast(e.message, 'err'); }
  if (state.view === 'screens') renderView();
}

/* ================= Аккаунт ================= */

function accTypeLabel(type) {
  return type === 'elyby' ? 'Ely.by' : type === 'microsoft' ? 'Microsoft' : 'Оффлайн';
}

function accTypeHint(a) {
  if (a.type === 'elyby') return '<span class="badge-ely">ELY.BY</span> &nbsp;аккаунт Ely.by, скин подтягивается автоматически';
  if (a.type === 'microsoft') return '<span class="badge-ely" style="background:rgba(0,120,212,.18);color:#8FCBFF">MICROSOFT</span> &nbsp;официальный аккаунт Minecraft, скин и ник из профиля';
  return 'Оффлайн-режим: без пароля. Подходит только для серверов, которые не проверяют аккаунты';
}

function viewAccount() {
  const a = state.account;
  const current = a
    ? `<div class="card" style="margin-bottom:18px">
        <div class="current-acc">
          <div class="big-avatar">${esc(a.username[0].toUpperCase())}</div>
          <div class="grow">
            <div style="font-size:18px;font-weight:900">${esc(a.username)}</div>
            <div class="hint">${accTypeHint(a)}</div>
            <div class="hint mono" style="margin-top:4px;font-size:11px">UUID ${esc(a.uuid)}</div>
          </div>
          <button class="btn danger" data-act="logout">${icon('logout')} Выйти</button>
        </div>
      </div>`
    : '';

  const msBody = state.ms
    ? `<div class="ms-code" style="margin-top:12px;padding:14px;border:1px solid var(--navy-600);border-radius:12px;background:rgba(0,120,212,.06)">
        <div class="hint">Откройте <b>microsoft.com/link</b> на телефоне или компьютере и введите код:</div>
        <div style="font-size:26px;font-weight:900;letter-spacing:.15em;margin:10px 0;color:#8FCBFF">${esc(state.ms.userCode)}</div>
        <div class="row">
          <button class="btn primary" data-act="ms-open-link">Открыть страницу</button>
          <button class="btn" data-act="ms-copy">Копировать код</button>
          <button class="btn danger" data-act="ms-cancel">Отмена</button>
        </div>
        <div class="hint" style="margin-top:10px">Жду подтверждения в браузере…</div>
      </div>`
    : `<div class="hint" style="margin-top:12px">Вход по коду: лаунчер покажет код, вы вводите его на microsoft.com/link. Пароль в приложение вводить не нужно. Работают аккаунты Microsoft с купленной Minecraft (в том числе Game Pass).</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="ms-login">Войти через Microsoft</button></div>`;

  return `
    <h1 class="page-title">Аккаунт</h1>
    <p class="page-sub">Войдите через Microsoft (официальный аккаунт), Ely.by (скины и ник) или играйте оффлайн.</p>
    ${current}
    <div class="acc-grid">
      <div class="card">
        <div class="acc-head"><div class="big-avatar" style="font-size:20px">M</div>
          <div><h3 style="margin:0">Microsoft</h3><div class="hint">Официальный аккаунт Minecraft</div></div></div>
        ${msBody}
      </div>
      <div class="card">
        <div class="acc-head"><div class="big-avatar" style="font-size:20px">E</div>
          <div><h3 style="margin:0">Ely.by</h3><div class="hint">Скины и ник Ely.by работают в игре</div></div></div>
        <div class="field"><label>Логин или email</label><input class="input" id="ely-login" autocomplete="off"></div>
        <div class="field"><label>Пароль</label><input class="input" id="ely-pass" type="password"></div>
        <div class="row">
          <button class="btn primary" data-act="ely-login">Войти в Ely.by</button>
          <a class="hint" href="#" data-act="open-ely-reg">Нет аккаунта? Регистрация</a>
        </div>
        <div class="hint" style="margin-top:12px">Включена двухфакторная защита? Введите пароль и код через двоеточие: <b>пароль:код</b>.</div>
      </div>
      <div class="card">
        <div class="acc-head"><div class="big-avatar" style="font-size:20px">O</div>
          <div><h3 style="margin:0">Оффлайн</h3><div class="hint">Быстрый вход без пароля</div></div></div>
        <div class="field"><label>Ник</label><input class="input" id="off-name" placeholder="Steve_01" maxlength="16"></div>
        <div class="row"><button class="btn primary" data-act="offline-login">Играть оффлайн</button></div>
        <div class="hint" style="margin-top:12px">Ник от 3 до 16 символов: латиница, цифры и «_». Скины в оффлайне не работают.</div>
      </div>
    </div>`;
}

/* ================= Настройки ================= */

const PERF_LABEL = { standard: 'Обычный', optimized: 'Оптимизировано', potato: 'Очень оптимизировано' };
const PERF_DESC = {
  standard: 'Лаунчер ничего не меняет: ваши настройки Minecraft и JVM остаются как есть.',
  optimized: 'Дистанция прорисовки 10, умеренные частицы, до 120 FPS, пакет модов-оптимизаторов с Iris и встроенными шейдерами.',
  potato: 'Для слабых ПК: дистанция 4, быстрая графика без теней и облаков, 60 FPS, стабильный G1-сборщик мусора, пакет модов-оптимизаторов с Iris и встроенными шейдерами. Память задаёт ползунок в Настройках.',
};

function viewSettings() {
  const s = state.settings;
  const ov = s.orangeVisuals;
  const perf = s.perf || { preset: 'standard', installMods: true };
  const sw = (id, label, desc, checked) => `
    <div class="switch">
      <div class="lbl"><b>${label}</b><span>${desc}</span></div>
      <label class="toggle"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span class="track"></span></label>
    </div>`;
  const gcOpts = [['g1', 'G1 (рекомендуется)'], ['zgc', 'ZGC (меньше пауз, Java 17+)'], ['parallel', 'Parallel (быстрее, но с паузами)'], ['serial', 'SerialGC (только для маленькой памяти)'], ['none', 'Стандартный JVM']];
  const resOpts = [[854, 480], [1280, 720], [1600, 900], [1920, 1080], [2560, 1440]];
  const presetCards = ['standard', 'optimized', 'potato'].map(p => `
      <label class="preset ${p === 'potato' ? 'potato' : ''}">
        <input type="radio" name="preset" value="${p}" ${perf.preset === p ? 'checked' : ''}>
        <b>${esc(PERF_LABEL[p])}</b>
        <span>${esc(PERF_DESC[p])}</span>
      </label>`).join('');

  return `
    <h1 class="page-title">Настройки</h1>
    <p class="page-sub">Производительность, окно, источники модов, Orange Visuals и папка данных.</p>
    <div class="set-grid">
      <div class="card span-2">
        <h3>Производительность <small>пресеты для слабых ПК</small></h3>
        <div class="preset-grid">${presetCards}</div>
        <div class="switch" style="margin-top:14px">
          <div class="lbl"><b>Ставить моды-оптимизаторы</b><span>Sodium, Lithium, FerriteCore, EntityCulling и другие под загрузчик сборки. Моды, которых нет для её версии Minecraft, пропускаются. Ставятся один раз и скрываются из списка модов.</span></div>
          <label class="toggle"><input type="checkbox" id="perf-mods" ${perf.installMods ? 'checked' : ''}><span class="track"></span></label>
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn" data-act="perf-apply">${icon('check')} Применить к выбранной сборке сейчас</button>
          <button class="btn" data-act="perf-install">${icon('download')} Поставить пакет модов в выбранную сборку</button>
        </div>
        <div class="hint" style="margin-top:10px">Пресет применяется при каждом запуске: видеонастройки в options.txt и JVM-флаги. Объём памяти задаёт ползунок выше. Кнопки работают с выбранной сборкой и выбранным пресетом (сохранять настройки не нужно).</div>
      </div>
      <div class="card">
        <h3>Память и Java</h3>
        <div class="field"><label>Память для Minecraft</label>
          <div class="range-row"><input type="range" id="ram" min="2048" max="16384" step="512" value="${s.ram}"><b id="ram-val">${(s.ram / 1024).toFixed(1)} ГБ</b></div>
        </div>
        <div class="field"><label>Сборщик мусора</label>
          <select class="input" id="gc">${gcOpts.map(([v, l]) => `<option value="${v}" ${s.gcPreset === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Дополнительные аргументы JVM</label>
          <input class="input" id="jvm" placeholder="-Dfoo=bar" value="${esc(s.jvmArgs)}"></div>
        <div class="field"><label>Путь к Java (необязательно)</label>
          <div class="row" style="flex-wrap:nowrap">
            <input class="input grow" id="javapath" placeholder="Пусто — лаунчер сам скачает нужную Java" value="${esc(s.javaPath)}">
            <button class="btn" data-act="pick-java">Выбрать…</button>
          </div>
          <div class="hint">Java 21 или 25 (нужная версия выбирается автоматически), 17 или 8 для старых версий. Можно указать свою.</div>
        </div>
      </div>
      <div class="card">
        <h3>Окно игры и лаунчер</h3>
        <div class="field"><label>Разрешение окна</label>
          <select class="input" id="res">${resOpts.map(([w, h]) => `<option value="${w}x${h}" ${s.width === w && s.height === h ? 'selected' : ''}>${w} × ${h}</option>`).join('')}</select>
        </div>
        ${sw('fullscreen', 'Полноэкранный режим', 'Minecraft запускается на весь экран', s.fullscreen)}
        ${sw('closeOnLaunch', 'Сворачивать лаунчер после запуска', 'Окно лаунчера сворачивается, когда игра стартовала', s.closeOnLaunch)}
        ${sw('showLogOnLaunch', 'Показывать лог при запуске', 'Лог игры открывается на главной сразу после старта', s.showLogOnLaunch)}
        ${sw('animations', 'Анимации интерфейса', 'Выключите, если лаунчер тормозит на слабом ПК', s.animations)}
        <div class="field"><label>Ник в Minecraft на Rust</label>
          <input class="input" id="rustname" placeholder="Игрок" maxlength="16" value="${esc(s.rustPlayerName || '')}">
          <div class="hint">Подставляется при запуске Horizon и Rustcraft. Пусто — ник придумает сам движок. На Java-сборки не влияет.</div>
        </div>
      </div>
      <div class="card">
        <h3>Источники модов</h3>
        <div class="field"><label>GitHub токен (необязательно)</label>
          <input class="input" id="ghtoken" type="password" placeholder="ghp_… (без него лимит 60 запросов в час)" value="${esc(s.githubToken || '')}">
          <div class="hint">Нужен только если поиск на GitHub перестал работать из-за лимита.</div>
        </div>
        <div class="field"><label>CurseForge API Key</label>
          <input class="input" id="cfkey" type="password" placeholder="Вставьте ключ" value="${esc(s.curseforgeKey)}">
          <div class="hint">Бесплатный ключ: <a href="#" data-act="open-cf-keys">console.curseforge.com</a>. Modrinth, Hangar и Smithed работают без ключа.</div>
        </div>
      </div>
      <div class="card span-2">
        <h3>Orange Visuals <small>собственный мод EMBER · Minecraft 1.21.1 Fabric</small></h3>
        <div class="hint" style="margin-bottom:10px">Мод работает внутри игры: HUD, плавный зум на C, визуальные фильтры и музыка из выбранной папки. Меню открывается коротким нажатием клавиши меню (по умолчанию R Shift). Миникарта, полная карта (N) и метки настраиваются в этом же меню. Здесь задаются стартовые значения; в уже созданной сборке визуалы меняются в игре и сохраняются.</div>
        <div class="set-grid">
          <div>
            ${sw('ov-enabled', 'Включить мод', 'Ставится и обновляется при запуске. Выключено — удаляется из сборок', ov.enabled)}
            ${sw('ov-fps', 'Счётчик FPS', 'FPS в углу экрана (угол меняется в меню мода)', ov.hudFps)}
            ${sw('ov-coords', 'Координаты', 'XYZ текущего положения', ov.hudCoords)}
            ${sw('ov-np', 'Сейчас играет поверх экрана', 'Название трека и эквалайзер вверху экрана', ov.hudNowPlaying)}
          </div>
          <div>
            ${sw('ov-zoom', 'Плавный зум на ' + glfwName(ov.zoomKey), 'Удерживайте клавишу зума — картинка приближается', ov.zoom)}
            <div class="field" style="margin-top:14px"><label>Сила зума</label>
              <div class="range-row"><input type="range" id="ov-zoom-factor" min="5" max="90" step="5" value="${Math.round(ov.zoomFactor * 100)}"><b id="ov-zoom-val">${Math.round(ov.zoomFactor * 100)}%</b></div>
              <div class="hint">Меньше — сильнее приближение.</div>
            </div>
            <div class="field" style="margin-top:14px"><label>Клавиши Orange Visuals</label>
              <div class="row" style="flex-wrap:wrap;gap:8px">
                <button class="btn small" id="ov-menukey" data-code="${ov.menuKey}" data-act="ov-key" data-field="menuKey">Меню: ${esc(state.keyCapture === 'menuKey' ? 'нажмите клавишу…' : glfwName(ov.menuKey))}</button>
                <button class="btn small" id="ov-zoomkey" data-code="${ov.zoomKey}" data-act="ov-key" data-field="zoomKey">Зум: ${esc(state.keyCapture === 'zoomKey' ? 'нажмите клавишу…' : glfwName(ov.zoomKey))}</button>
              </div>
              <div class="hint">Нажмите кнопку, затем нужную клавишу. Esc — отмена. Короткое нажатие клавиши меню открывает меню в игре.</div>
            </div>
            ${sw('ov-music', 'Музыка в игре', 'Мод проигрывает треки из папки ниже. Громкость — в меню Orange Visuals', ov.music)}
            <div class="field" style="margin-top:14px"><label>Папка с музыкой</label>
              <div class="row" style="flex-wrap:nowrap">
                <input class="input grow mono" value="${esc(ov.musicFolder || state.musicFolder || '')}" readonly>
                <button class="btn" data-act="pick-music">Выбрать…</button>
              </div>
              <div class="hint">mp3, ogg, wav. Вложенные папки тоже читаются (до трёх уровней).</div>
            </div>
          </div>
        </div>
      </div>
      <div class="card span-2">
        <h3>Папка данных <small>сборки, моды, миры, Java и библиотеки</small></h3>
        <div class="hint" style="margin-bottom:10px">${state.info && state.info.isCustom ? 'Выбрана своя папка.' : 'Стандартная папка лаунчера.'} Изменение перенесёт данные и перезапустит лаунчер.</div>
        <div class="row">
          <div class="grow hint mono" style="word-break:break-all">${esc(state.info ? state.info.base : '')}</div>
          <button class="btn" data-act="open-data">${icon('folder')} Открыть</button>
          <button class="btn" data-act="change-data">Изменить папку…</button>
          ${state.info && state.info.isCustom ? '<button class="btn" data-act="reset-data">По умолчанию</button>' : ''}
        </div>
      </div>
      <div class="card span-2">
        <div class="row" style="justify-content:flex-end">
          <button class="btn primary" data-act="save-settings">${icon('check')} Сохранить настройки</button>
        </div>
      </div>
    </div>`;
}

// Клавиши для Orange Visuals: коды GLFW (как в Minecraft)
const GLFW_BY_CODE = {
  Space: 32, Quote: 39, Comma: 44, Minus: 45, Period: 46, Slash: 47, Semicolon: 59, Equal: 61,
  BracketLeft: 91, Backslash: 92, BracketRight: 93, Backquote: 96,
  Escape: 256, Enter: 257, Tab: 258, Backspace: 259, Insert: 260, Delete: 261,
  ArrowRight: 262, ArrowLeft: 263, ArrowDown: 264, ArrowUp: 265, PageUp: 266, PageDown: 267,
  Home: 268, End: 269, CapsLock: 280,
  ShiftLeft: 340, ControlLeft: 341, AltLeft: 342, ShiftRight: 344, ControlRight: 345, AltRight: 346,
};
const GLFW_NAMES = {
  340: 'L Shift', 344: 'R Shift', 341: 'L Ctrl', 345: 'R Ctrl', 342: 'L Alt', 346: 'R Alt',
  32: 'Space', 258: 'Tab', 257: 'Enter', 280: 'Caps Lock', 256: 'Esc', 96: '`',
};
function glfwCodeOf(e) {
  const c = e.code || '';
  if (GLFW_BY_CODE[c] != null) return GLFW_BY_CODE[c];
  if (/^Key[A-Z]$/.test(c)) return c.charCodeAt(3);
  if (/^Digit[0-9]$/.test(c)) return 48 + Number(c.slice(5));
  if (/^F([1-9]|1[0-2])$/.test(c)) return 289 + Number(c.slice(1));
  if (/^Numpad[0-9]$/.test(c)) return 320 + Number(c.slice(6));
  return null;
}
function glfwName(code) {
  if (GLFW_NAMES[code]) return GLFW_NAMES[code];
  if (code >= 65 && code <= 90) return String.fromCharCode(code);
  if (code >= 48 && code <= 57) return String(code - 48);
  if (code >= 290 && code <= 301) return 'F' + (code - 289);
  if (code >= 320 && code <= 329) return 'Num ' + (code - 320);
  return 'код ' + code;
}

async function setOvKey(field, code) {
  state.keyCapture = null;
  state.settings.orangeVisuals[field] = code;
  try {
    await window.ember.settings.save({ orangeVisuals: { [field]: code } });
    toast(`Клавиша назначена: ${glfwName(code)}. Применится при следующем запуске игры`, 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
  renderView();
}

function currentPreset() {
  const el = document.querySelector('input[name="preset"]:checked');
  return el ? el.value : state.settings.perf.preset;
}

async function saveSettings() {
  const [w, h] = $('#res').value.split('x').map(Number);
  const patch = {
    ram: +$('#ram').value,
    gcPreset: $('#gc').value,
    jvmArgs: $('#jvm').value.trim(),
    javaPath: $('#javapath').value.trim(),
    width: w,
    height: h,
    fullscreen: $('#fullscreen').checked,
    closeOnLaunch: $('#closeOnLaunch').checked,
    showLogOnLaunch: $('#showLogOnLaunch').checked,
    animations: $('#animations').checked,
    curseforgeKey: $('#cfkey').value.trim(),
    githubToken: $('#ghtoken').value.trim(),
    rustPlayerName: ($('#rustname').value.trim() || '').slice(0, 16),
    perf: {
      preset: currentPreset(),
      installMods: $('#perf-mods').checked,
    },
    orangeVisuals: {
      enabled: $('#ov-enabled').checked,
      hudFps: $('#ov-fps').checked,
      hudCoords: $('#ov-coords').checked,
      hudNowPlaying: $('#ov-np').checked,
      zoom: $('#ov-zoom').checked,
      zoomFactor: +$('#ov-zoom-factor').value / 100,
      menuKey: +$('#ov-menukey').dataset.code,
      zoomKey: +$('#ov-zoomkey').dataset.code,
      music: $('#ov-music').checked,
    },
  };
  try {
    state.settings = await window.ember.settings.save(patch);
    applyAnimations();
    applyLite();
    toast('Настройки сохранены', 'ok');
    renderView();
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function applyPerf() {
  const inst = selectedInst();
  if (!inst) return toast('Выберите сборку во вкладке «Сборки»', 'err');
  if (isRust(inst)) return toast('Пресеты производительности — для Java Edition: у Rust-движков свои настройки графики в игре', 'err');
  const preset = currentPreset();
  if (preset === 'standard') return toast('Пресет «Обычный» ничего не меняет', 'ok');
  try {
    await window.ember.perf.applyNow(inst.id, preset);
    toast(`Пресет «${PERF_LABEL[preset]}» применён к «${inst.name}»`, 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function installPerfPack() {
  const inst = selectedInst();
  if (!inst) return toast('Выберите сборку во вкладке «Сборки»', 'err');
  if (isRust(inst)) return toast('Пакет оптимизации — это Java-моды. У Horizon и Rustcraft собственный движок, оптимизировать нечего', 'err');
  if (inst.loader === 'vanilla') return toast('В Vanilla моды не ставятся. Создайте сборку с Fabric, Quilt, Forge или NeoForge', 'err');
  state.progress = { stage: 'Оптимизация', text: 'Начинаю…' };
  renderBusy();
  try {
    const r = await window.ember.perf.installPack(inst.id);
    const errText = r.errors && r.errors.length ? `, ошибок: ${r.errors.length}` : '';
    const noVer = r.unavailable && r.unavailable.length ? `, нет для этой версии: ${r.unavailable.length}` : '';
    const shText = r.shaders ? `, шейдеры: ${r.shaders}` : '';
    toast(`Установлено модов: ${r.installed.length}, уже были: ${r.skipped.length}${shText}${noVer}${errText}`, errText ? 'err' : 'ok');
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    state.progress = null;
    renderBusy();
  }
}

function applyLite() {
  document.body.classList.toggle('lite', (state.settings.perf || {}).preset === 'potato');
}

function applyAnimations() {
  document.body.classList.toggle('no-anim', !state.settings.animations);
}

/* ================= Данные и действия ================= */

async function reloadInstances() {
  const r = await window.ember.instances.list();
  state.instances = r.list;
  state.selected = r.selected;
  state.runningId = r.runningId;
  if (['home', 'instances', 'mods'].includes(state.view)) renderView();
}

async function launch() {
  const inst = selectedInst();
  if (!inst) return toast('Создайте сборку во вкладке «Сборки»', 'err');
  // Rust-движки не используют аккаунт Ely.by: Horizon входит сам, Rustcraft берёт оффлайн-ник
  if (!isRust(inst) && !state.account) return toast('Войдите в аккаунт во вкладке «Аккаунт»', 'err');
  state.preparing = true;
  renderView();
  try {
    await window.ember.game.launch(inst.id);
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    state.preparing = false;
    state.progress = null;
    if (state.view === 'home') renderView();
  }
}

function importZip() {
  return window.ember.instances.importZip().then(async inst => {
    if (!inst || inst.cancelled) return;
    toast(`Сборка «${inst.name}» импортирована`, 'ok');
    await reloadInstances();
  }).catch(e => toast(e.message, 'err'));
}

async function openModsManager(id) {
  state.modal = { type: 'mods', instId: id, list: null, hidden: 0 };
  renderModal();
  try {
    const r = await window.ember.mods.list(id);
    state.modal.list = r.list;
    state.modal.hidden = r.hidden;
  } catch (e) {
    state.modal.list = [];
    toast(e.message, 'err');
  }
  if (state.modal && state.modal.type === 'mods') renderModal();
}

function setupEvents() {
  window.ember.on('progress', p => {
    state.progress = p;
    renderBusy();
  });
  window.ember.on('log', t => {
    state.logs += t;
    if (state.logs.length > 60000) state.logs = state.logs.slice(-40000);
    const c = $('#console');
    if (c) {
      c.textContent += t;
      c.scrollTop = c.scrollHeight;
    }
  });
  window.ember.on('game:state', s => {
    state.running = !!s.running;
    state.runningId = s.running ? s.instanceId : null;
    if (!s.running) {
      state.preparing = false;
      if (s.error) toast(s.error, 'err');
      else if (typeof s.code === 'number') toast(`Minecraft закрыт (код ${s.code})${s.playMs ? ', сессия ' + fmtPlay(s.playMs) : ''}`);
      reloadInstances();
    }
    if (state.view === 'home') renderView();
    renderBusy();
  });
  window.ember.on('mod:status', m => {
    state.mod = m;
    if (state.view === 'home') renderView();
  });
}

function togglePalette(open) {
  state.palette = open ? { q: '', sel: 0 } : null;
  renderModal();
}

async function reloadSettings() {
  state.settings = await window.ember.settings.get();
}

document.addEventListener('click', async e => {
  const link = e.target.closest('a');
  if (link) e.preventDefault();

  const navEl = e.target.closest('[data-nav]');
  if (navEl) return setView(navEl.dataset.nav);
  const goEl = e.target.closest('[data-nav-go]');
  if (goEl) return setView(goEl.dataset.navGo);

  const srcEl = e.target.closest('[data-src]');
  if (srcEl) {
    state.search.source = srcEl.dataset.src;
    state.search.kind = KINDS[state.search.source][0][0];
    renderView();
    return runSearch(true);
  }
  const kindEl = e.target.closest('[data-kind]');
  if (kindEl) {
    state.search.kind = kindEl.dataset.kind;
    renderView();
    return runSearch(true);
  }
  const platEl = e.target.closest('[data-platform]');
  if (platEl && state.modal && state.modal.type === 'new') {
    syncModal();
    const next = platEl.dataset.platform;
    if (next === 'java') {
      state.modal.platform = 'java';
      state.modal.loader = 'fabric';
      state.modal.loaderVersion = '';
      state.modal.version = state.modal.version || releaseId();
      renderModal();
      return ensureLoaderList('fabric', state.modal.version);
    }
    const p = RUST_PLATFORMS.find(x => x.id === next) || RUST_PLATFORMS[0];
    const info = (state.rustInfo || []).find(x => x.id === p.id) || {};
    state.modal.platform = p.id;
    state.modal.loader = p.id;
    state.modal.loaderVersion = '';
    state.modal.version = info.game || p.game;
    state.modal.gameVersion = state.modal.version;
    renderModal();
    return ensureRustList(p.id);
  }
  const loaderEl = e.target.closest('[data-loader]');
  if (loaderEl && state.modal && state.modal.type === 'new') {
    syncModal();
    state.modal.loader = loaderEl.dataset.loader;
    state.modal.loaderVersion = '';
    renderModal();
    return ensureLoaderList(state.modal.loader, state.modal.version);
  }
  const palEl = e.target.closest('[data-pal]');
  if (palEl && state.palette) {
    const items = paletteItems().filter(it => !state.palette.q || it.label.toLowerCase().includes(state.palette.q.toLowerCase()));
    const it = items[+palEl.dataset.pal];
    togglePalette(false);
    if (it) it.run();
    return;
  }

  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;

  // Клик по подложке закрывает модалку (но не по содержимому)
  if (act === 'close-modal' || act === 'close-palette') {
    if (t.classList.contains('modal-bg') && e.target !== t) return;
    if (act === 'close-palette') return togglePalette(false);
    state.modal = null;
    return renderModal();
  }

  try {
    switch (act) {
      case 'win-min': return window.ember.win.min();
      case 'win-max': return window.ember.win.max();
      case 'win-close': return window.ember.win.close();
      case 'palette': return togglePalette(!state.palette);

      case 'play': return launch();
      case 'stop': return window.ember.game.stop();
      case 'toggle-log': state.showLog = !state.showLog; return renderView();

      case 'select-inst':
        await window.ember.instances.select(t.dataset.id);
        state.selected = t.dataset.id;
        toast('Сборка выбрана', 'ok');
        return renderView();
      case 'open-inst': return window.ember.instances.open(t.dataset.id);
      case 'mods-manager': return openModsManager(t.dataset.id);
      case 'mods-open-folder': {
        const inst = state.instances.find(i => i.id === t.dataset.id);
        return window.ember.instances.folder(t.dataset.id, isRust(inst) ? 'horizon-mods' : 'mods');
      }
      case 'mod-del': {
        const file = t.dataset.file;
        if (!confirm(`Удалить мод ${file}?`)) return;
        await window.ember.mods.remove(state.modal.instId, file);
        return openModsManager(state.modal.instId);
      }
      case 'dup-inst': {
        const r = await window.ember.instances.duplicate(t.dataset.id);
        toast(`Создан дубликат «${r.name}»`, 'ok');
        return reloadInstances();
      }
      case 'export-inst': {
        const r = await window.ember.instances.exportZip(t.dataset.id);
        if (!r.cancelled) toast('Сборка экспортирована в zip', 'ok');
        return;
      }
      case 'import-zip': return importZip();
      case 'backup-inst': {
        toast('Создаю резервную копию миров…');
        const p = await window.ember.instances.backup(t.dataset.id);
        toast(`Копия сохранена: ${p}`, 'ok');
        return window.ember.showFile(p.replace(/[\\/][^\\/]+$/, ''));
      }
      case 'del-inst': {
        if (!confirm('Удалить сборку вместе с модами и мирами?')) return;
        await window.ember.instances.remove(t.dataset.id);
        toast('Сборка удалена', 'ok');
        return reloadInstances();
      }
      case 'new-inst': return openNewInstance('fabric');
      case 'new-inst-loader': return openNewInstance(t.dataset.loader);
      case 'rust-new': return openRustInstance(t.dataset.platform || 'horizon');
      case 'go-rust': return setView('rust');
      case 'rust-registry': {
        const inst = selectedInst();
        state.search.source = 'horizon';
        state.search.kind = 'mod';
        setView('mods');
        if (inst && !isRust(inst)) toast('Выбрана Java-сборка: показан только список модов, установить их можно в сборку Horizon', 'err');
        return;
      }
      case 'rust-prepare': {
        const platform = t.dataset.platform;
        const tag = t.dataset.tag || '';
        t.disabled = true;
        state.progress = { stage: 'Minecraft Rust', text: 'Проверяю движок…' };
        renderBusy();
        try {
          const r = await window.ember.rust.prepare(platform, tag);
          toast(`${platform === 'horizon' ? 'Horizon' : 'Rustcraft'} ${r.tag} готов`, 'ok');
          await loadRustPage(true);
        } catch (e) {
          toast(e.message, 'err');
        } finally {
          state.progress = null;
          renderBusy();
          t.disabled = false;
        }
        return;
      }
      case 'rust-open-file': return window.ember.showFile(t.dataset.path);
      case 'rust-site': return window.ember.openUrl(t.dataset.url);
      case 'create-inst': {
        syncModal();
        const m = state.modal;
        const name = $('#ni-name').value.trim() || 'Новая сборка';
        const platform = m.platform || 'java';
        const created = await window.ember.instances.create({
          name,
          platform,
          version: platform === 'java' ? m.version : (m.gameVersion || m.version),
          loader: platform === 'java' ? m.loader : platform,
          loaderVersion: m.loaderVersion || '',
          cover: m.cover || null,
        });
        state.modal = null;
        renderModal();
        toast(`Сборка «${created.name}» создана`, 'ok');
        await reloadInstances();
        return;
      }

      case 'pick-cover': return openCoverModal(t.dataset.id);
      case 'last-crash': {
        const r = await window.ember.instances.lastCrash(t.dataset.id);
        if (!r.found) return toast('Краш-отчётов у этой сборки нет', 'ok');
        state.modal = { type: 'crash', path: r.path, text: r.text };
        return renderModal();
      }
      case 'crash-open': return window.ember.showFile(t.dataset.path);

      // Выбор обложки в модалке создания сборки
      case 'ni-pick-result': {
        const it = state.coverSearch && state.coverSearch.items[+t.dataset.idx];
        if (!it || !state.modal) return;
        state.modal.cover = { url: it.icon, name: it.title };
        $('#ni-cover-box').innerHTML = coverBoxHTML(state.modal.cover);
        return paintCoverResults();
      }
      case 'ni-pick-file': {
        const p = await window.ember.pickImage();
        if (!p || !state.modal) return;
        state.modal.cover = { file: p, name: p.split(/[\\/]/).pop() };
        $('#ni-cover-box').innerHTML = coverBoxHTML(state.modal.cover);
        return;
      }
      case 'ni-clear-cover': {
        if (!state.modal) return;
        state.modal.cover = null;
        $('#ni-cover-box').innerHTML = coverBoxHTML(null);
        return paintCoverResults();
      }

      // Выбор обложки для существующей сборки
      case 'cv-pick-result': {
        const it = state.coverSearch && state.coverSearch.items[+t.dataset.idx];
        if (!it || !state.modal) return;
        await window.ember.instances.setCover(state.modal.instId, { url: it.icon });
        toast('Обложка обновлена', 'ok');
        await reloadInstances();
        return renderModal();
      }
      case 'cv-pick-file': {
        if (!state.modal) return;
        const r = await window.ember.instances.pickCover(state.modal.instId);
        if (!r) return;
        toast('Обложка обновлена', 'ok');
        await reloadInstances();
        return renderModal();
      }
      case 'cv-clear': {
        if (!state.modal) return;
        await window.ember.instances.setCover(state.modal.instId, null);
        toast('Обложка убрана');
        await reloadInstances();
        return renderModal();
      }

      case 'open-shot': {
        const s = state.screens && state.screens[+t.dataset.idx];
        if (s) window.ember.showFile(s.path);
        return;
      }

      case 'pick-music': {
        const p = await window.ember.music.pickFolder();
        if (!p) return;
        state.musicFolder = await window.ember.music.folder();
        await reloadSettings();
        toast('Папка с музыкой выбрана', 'ok');
        return renderView();
      }
      case 'open-music': return window.ember.showFile(await window.ember.music.folder());

      case 'search': {
        state.search.query = $('#search-q') ? $('#search-q').value.trim() : state.search.query;
        return runSearch(true);
      }
      case 'install': return installItem(+t.dataset.idx);
      case 'ov-key': state.keyCapture = t.dataset.field; return renderView();
      case 'install-link': {
        const url = $('#link-url').value.trim();
        if (!url) return toast('Вставьте ссылку на файл', 'err');
        const inst = selectedInst();
        state.progress = { stage: 'Загрузка', text: url };
        renderBusy();
        try {
          const res = await window.ember.install({ source: 'link', kind: 'link', id: url, title: url }, inst && inst.id);
          if (res.instance) toast(`Создана сборка «${res.instance.name}» и выбрана`, 'ok');
          else toast(`Скачано: ${(res.installed || []).join(', ')}`, 'ok');
          await reloadInstances();
        } catch (err) {
          toast(err.message, 'err');
        } finally {
          state.progress = null;
          renderBusy();
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
        const it = state.search.items[+t.dataset.idx];
        if (it && it.url) window.ember.openUrl(it.url);
        return;
      }
      case 'go-settings': return setView('settings');
      case 'open-cf-keys': return window.ember.openUrl('https://console.curseforge.com/');
      case 'open-ely-reg': return window.ember.openUrl('https://ely.by/register');
      case 'open-tg': return window.ember.openUrl('https://t.me/EmberLauncher');
      case 'open-ds': return window.ember.openUrl('https://discord.gg/Wpr5kBxUM');

      case 'ely-login': {
        const login = $('#ely-login').value.trim();
        const pass = $('#ely-pass').value;
        if (!login || !pass) return toast('Введите логин и пароль Ely.by', 'err');
        t.disabled = true;
        try {
          state.account = await window.ember.auth.ely(login, pass);
          toast(`Вход выполнен: ${state.account.username}`, 'ok');
        } finally { t.disabled = false; }
        renderSidebarFoot();
        return renderView();
      }
      case 'offline-login': {
        const name = $('#off-name').value.trim();
        try {
          state.account = await window.ember.auth.offline(name);
          toast(`Оффлайн-ник: ${state.account.username}`, 'ok');
        } catch (err) { return toast(err.message, 'err'); }
        renderSidebarFoot();
        return renderView();
      }
      case 'logout': {
        await window.ember.auth.logout();
        state.account = null;
        toast('Вы вышли из аккаунта');
        renderSidebarFoot();
        return renderView();
      }

      case 'ms-login': {
        if (state.ms) return;
        t.disabled = true;
        try {
          state.ms = await window.ember.auth.msStart();
          renderView();
          const acc = await window.ember.auth.msWait();
          state.ms = null;
          state.account = acc;
          toast(`Вход выполнен: ${acc.username}`, 'ok');
        } catch (err) {
          state.ms = null;
          toast(err.message || 'Не удалось войти через Microsoft', 'err');
        } finally {
          t.disabled = false;
          renderSidebarFoot();
          return renderView();
        }
      }
      case 'ms-open-link': {
        if (!state.ms) return;
        return window.ember.openUrl(state.ms.verificationUriComplete || state.ms.verificationUri);
      }
      case 'ms-copy': {
        if (!state.ms) return;
        await window.ember.copyText(state.ms.userCode);
        return toast('Код скопирован', 'ok');
      }
      case 'ms-cancel': {
        await window.ember.auth.msCancel();
        state.ms = null;
        toast('Вход отменён');
        return renderView();
      }

      case 'save-settings': return saveSettings();
      case 'perf-apply': return applyPerf();
      case 'perf-install': return installPerfPack();
      case 'pick-java': {
        const p = await window.ember.pickJava();
        if (p) { $('#javapath').value = p; }
        return;
      }
      case 'open-data': return window.ember.showFile(state.info.base);
      default: return;
    }
  } catch (err) {
    toast(err.message || String(err), 'err');
  }
});

// Изменения переключателей и выбора
document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset && el.dataset.actChange === 'mod-toggle') {
    try {
      await window.ember.mods.toggle(state.modal.instId, el.dataset.file, el.checked);
      return openModsManager(state.modal.instId);
    } catch (err) { toast(err.message, 'err'); return openModsManager(state.modal.instId); }
  }
  if (el.id === 'home-inst' || el.id === 'target-inst') {
    const id = el.value;
    state.selected = id;
    window.ember.instances.select(id);
    if (state.view === 'home') renderView();
    if (state.view === 'mods') { renderView(); runSearch(true); }
  }
  if (el.id === 'only-inst') {
    state.search.onlySameVersion = el.checked;
    runSearch(true);
  }
  if (el.id === 'ni-snap' && state.modal) {
    syncModal();
    state.modal.snap = el.checked;
    renderModal();
  }
  if (el.id === 'ni-version' && state.modal) {
    syncModal();
    state.modal.loaderVersion = '';
    refreshLoaderBlock();
    ensureLoaderList(state.modal.loader, state.modal.version);
  }
});

document.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'ram') $('#ram-val').textContent = (e.target.value / 1024).toFixed(1) + ' ГБ';
  if (id === 'ov-zoom-factor') $('#ov-zoom-val').textContent = e.target.value + '%';
  if (id === 'search-q') { state.search.query = e.target.value; debounceSearch(); }
  if (id === 'inst-q') {
    state.instQuery = e.target.value;
    const grid = $('#inst-grid');
    if (grid) grid.innerHTML = instCards();
  }
  if (id === 'ni-name' && state.modal && state.modal.type === 'new') state.modal.name = e.target.value;
  if (id === 'cs-q' && state.coverSearch) {
    state.coverSearch.q = e.target.value;
    clearTimeout(coverTimer);
    coverTimer = setTimeout(runCoverSearch, 350);
  }
  if (id === 'pal-q' && state.palette) { state.palette.q = e.target.value; state.palette.sel = 0; renderModal(); }
});

let searchTimer = null;
let coverTimer = null;
function debounceSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (state.view === 'mods') runSearch(true);
  }, 380);
}

document.addEventListener('keydown', e => {
  if (state.keyCapture) {
    e.preventDefault();
    const field = state.keyCapture;
    if (e.key === 'Escape') { state.keyCapture = null; return renderView(); }
    const code = glfwCodeOf(e);
    if (code == null) { state.keyCapture = null; toast('Эту клавишу нельзя назначить', 'err'); return renderView(); }
    return setOvKey(field, code);
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    return togglePalette(!state.palette);
  }
  if (state.palette) {
    const items = paletteItems().filter(it => !state.palette.q || it.label.toLowerCase().includes(state.palette.q.toLowerCase()));
    if (e.key === 'Escape') return togglePalette(false);
    if (e.key === 'ArrowDown') { e.preventDefault(); state.palette.sel = Math.min(items.length - 1, state.palette.sel + 1); return renderModal(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); state.palette.sel = Math.max(0, state.palette.sel - 1); return renderModal(); }
    if (e.key === 'Enter') { const it = items[state.palette.sel]; togglePalette(false); if (it) it.run(); return; }
    return;
  }
  if (e.key === 'Enter' && e.target.id === 'search-q') {
    state.search.query = e.target.value.trim();
    return runSearch(true);
  }
  if (e.key === 'Enter' && e.target.id === 'ni-name' && state.modal && state.modal.type === 'new') {
    e.preventDefault();
    const btn = $('[data-act="create-inst"]');
    if (btn) btn.click();
    return;
  }
  if (e.key === 'Escape' && state.modal) {
    state.modal = null;
    return renderModal();
  }
});

async function boot() {
  state.info = await window.ember.info();
  state.settings = await window.ember.settings.get();
  state.account = state.settings.account;
  state.musicFolder = await window.ember.music.folder();
  applyAnimations();
  applyLite();
  state.logs = '';
  state.versions = await window.ember.versions().catch(err => {
    toast('Не удалось загрузить список версий Minecraft: ' + err.message, 'err');
    return [];
  });
  const r = await window.ember.instances.list();
  state.instances = r.list;
  state.selected = r.selected;
  state.runningId = r.runningId;
  const st = await window.ember.game.status();
  state.running = st.running;
  // Платформы Rust нужны модалке новой сборки: грузим в фоне, интерфейс не ждёт
  window.ember.rust.info().then(list => {
    state.rustInfo = list;
    if (state.view === 'rust') renderView();
  }).catch(() => {});
  setupEvents();
  renderShell();
  renderView();
}

boot().catch(err => {
  document.getElementById('app').innerHTML = `<div style="padding:40px;color:#FFB2B2">Ошибка запуска: ${esc(err.message)}</div>`;
});
