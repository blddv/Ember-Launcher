// Модель интерфейса: навигация, списки источников/загрузчиков, состояние
// приложения и чистыеhelper-функции (без доступа к IPC).
const EMB = (window.EMB = window.EMB || {});
const { t } = EMB;

EMB.state = {
  view: 'home',
  info: null,
  settings: null,
  instances: [],
  selected: null,
  runningId: null,
  versions: [],
  account: null,
  accounts: [],
  selectedAccountId: null,
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
  skins: { sources: [], source: 'elyby', query: '', items: [], catalog: [], loading: false, error: '', current: null, urlInput: '', applying: false, model: 'classic' },
  update: { checking: false, available: false, current: '', latest: '', url: '', asset: null, error: '', downloading: false, progress: null, downloaded: false, downloadedPath: '', installing: false, savedLatest: '' },
  ms: null,
  keyCapture: null,
};

EMB.NAV = [
  { group: t('Игра'), items: [
    { id: 'home', label: 'Главная', icon: 'home' },
    { id: 'instances', label: 'Сборки', icon: 'layers' },
    { id: 'rust', label: 'Minecraft Rust', icon: 'bolt' },
    { id: 'screens', label: 'Скриншоты', icon: 'image' },
  ] },
  { group: t('Контент'), items: [
    { id: 'mods', label: 'Моды и сборки', icon: 'puzzle' },
  ] },
  { group: t('Система'), items: [
    { id: 'account', label: 'Аккаунт', icon: 'user' },
    { id: 'skins', label: 'Скины', icon: 'skin' },
    { id: 'settings', label: 'Настройки', icon: 'gear' },
  ] },
];

EMB.LOADERS = [
  { id: 'vanilla', label: 'Vanilla' },
  { id: 'fabric', label: 'Fabric' },
  { id: 'quilt', label: 'Quilt' },
  { id: 'forge', label: 'Forge' },
  { id: 'neoforge', label: 'NeoForge' },
];
EMB.LOADER_LABEL = Object.fromEntries(EMB.LOADERS.map(l => [l.id, l.label]));
EMB.MOD_LOADERS = ['fabric', 'quilt', 'forge', 'neoforge'];

// Minecraft на Rust: отдельные движки, а не загрузчики Java-модов
EMB.RUST_PLATFORMS = [
  { id: 'horizon', label: 'Horizon', color: '#F2A65A', game: '26.3' },
  { id: 'rustcraft', label: 'Rustcraft', color: '#7BD1A8', game: '26.3' },
];
EMB.PLATFORM_LABEL = { java: 'Java Edition', horizon: 'Horizon', rustcraft: 'Rustcraft' };
EMB.platformOf = i => {
  if (!i) return 'java';
  if (i.platform === 'horizon' || i.platform === 'rustcraft') return i.platform;
  return EMB.RUST_PLATFORMS.some(p => p.id === i.loader) ? i.loader : 'java';
};
EMB.isRust = i => EMB.platformOf(i) !== 'java';
EMB.RUST_SOURCE = src => src === 'horizon' || src === 'horizon-github';

// platform: java — источники Java Edition, rust — только для Minecraft на Rust.
// Списки не смешиваются: .jar не работает в Horizon, а .hmod — в Java.
EMB.SOURCES = [
  { id: 'modrinth', label: 'Modrinth', color: '#1BD96A', platform: 'java' },
  { id: 'curseforge', label: 'CurseForge', color: '#F16436', platform: 'java' },
  { id: 'hangar', label: 'Hangar', color: '#4C8DFF', platform: 'java' },
  { id: 'smithed', label: 'Smithed', color: '#B98BFF', platform: 'java' },
  { id: 'github', label: 'GitHub', color: '#E6EDF3', platform: 'java' },
  { id: 'horizon', label: 'Horizon (Rust)', color: '#F2A65A', platform: 'rust' },
  { id: 'horizon-github', label: 'Rust: GitHub', color: '#E6EDF3', platform: 'rust' },
  { id: 'link', label: t('По ссылке'), color: '#FF9A4D', platform: 'any' },
];
EMB.KINDS = {
  modrinth: [[ 'mod', t('Моды') ], ['modpack', t('Сборки')], ['resourcepack', t('Ресурспаки')]],
  curseforge: [['mod', t('Моды')], ['modpack', t('Сборки')], ['resourcepack', t('Ресурспаки')]],
  hangar: [['plugin', t('Плагины Paper')]],
  smithed: [['datapack', t('Датапаки')], ['resourcepack', t('Ресурспаки')]],
  github: [['mod', t('Моды (релизы)')]],
  horizon: [['mod', t('Моды')], ['modpack', t('Сборки')], ['resourcepack', t('Ресурспаки')]],
  'horizon-github': [['mod', t('Моды (релизы)')]],
  link: [['link', t('Файл по ссылке')]],
};
EMB.SOURCE_HINTS = {
  smithed: t('Smithed: датапаки и ресурспаки. Датапак кладётся в сборку, а в мир его нужно скопировать вручную. Здесь одна страница результатов (API не поддерживает пагинацию).'),
  github: t('GitHub: берётся последний релиз репозитория и его .jar под ваш загрузчик. Зависимости ставьте отдельно.'),
  hangar: t('Hangar: плагины для Paper-серверов. Файлы сохраняются в папку server-plugins, а не в клиент.'),
  horizon: t('Horizon: официальный реестр модов для Minecraft на Rust (playhorizon.dev/mods). Проверенные .hmod и .hnmod, сборки .hpack и ресурспаки. Каждый файл сверяется по SHA-256, снятые с публикации не ставятся.'),
  'horizon-github': t('GitHub: .hmod из последнего релиза репозитория, которого ещё нет в реестре Horizon. Такие файлы никто не проверял — ставьте на свой риск.'),
  link: t('Прямая ссылка: .jar и .mrpack — для Java Edition, .hmod, .hnmod и .hpack — для Minecraft на Rust, .zip — ресурспак в любую сборку.'),
};

EMB.selectedInst = () => EMB.state.instances.find(i => i.id === EMB.state.selected) || null;
EMB.hasLoader = i => !!i && EMB.MOD_LOADERS.includes(i.loader);
EMB.loaderName = i => {
  const p = EMB.platformOf(i);
  if (p !== 'java') {
    const label = (EMB.RUST_PLATFORMS.find(x => x.id === p) || {}).label || p;
    return EMB.t('Rust · {label}', { label }) + (i.loaderVersion ? ' ' + i.loaderVersion : '');
  }
  return i.loader === 'vanilla' ? 'Vanilla' : `${EMB.LOADER_LABEL[i.loader] || i.loader}${i.loaderVersion ? ' ' + i.loaderVersion : ''}`;
};

EMB.accTypeLabel = type => (type === 'elyby' ? 'Ely.by' : type === 'microsoft' ? 'Microsoft' : t('Оффлайн'));

EMB.accTypeHint = a => {
  if (a.type === 'elyby') return '<span class="badge-ely">ELY.BY</span> &nbsp;' + t('аккаунт Ely.by, скин подтягивается автоматически');
  if (a.type === 'microsoft') return '<span class="badge-ely" style="background:rgba(0,120,212,.18);color:#8FCBFF">MICROSOFT</span> &nbsp;' + t('официальный аккаунт Minecraft, скин и ник из профиля');
  return t('Оффлайн-режим: без пароля. Подходит только для серверов, которые не проверяют аккаунты');
};

EMB.SKIN_SOURCE_LABEL = { elyby: 'Ely.by', mojang: 'Mojang', littleskin: 'LittleSkin' };

EMB.PERF_LABEL = { standard: t('Обычный'), optimized: t('Оптимизировано'), potato: t('Очень оптимизировано') };
EMB.PERF_DESC = {
  standard: t('Лаунчер ничего не меняет: ваши настройки Minecraft и JVM остаются как есть.'),
  optimized: t('Дистанция прорисовки 10, умеренные частицы, до 120 FPS, пакет модов-оптимизаторов с Iris и встроенными шейдерами.'),
  potato: t('Для слабых ПК: дистанция 4, быстрая графика без теней и облаков, 60 FPS, стабильный G1-сборщик мусора, пакет модов-оптимизаторов с Iris и встроенными шейдерами. Память задаёт ползунок в Настройках.'),
};

// Клавиши для Orange Visuals: коды GLFW (как в Minecraft)
EMB.GLFW_BY_CODE = {
  Space: 32, Quote: 39, Comma: 44, Minus: 45, Period: 46, Slash: 47, Semicolon: 59, Equal: 61,
  BracketLeft: 91, Backslash: 92, BracketRight: 93, Backquote: 96,
  Escape: 256, Enter: 257, Tab: 258, Backspace: 259, Insert: 260, Delete: 261,
  ArrowRight: 262, ArrowLeft: 263, ArrowDown: 264, ArrowUp: 265, PageUp: 266, PageDown: 267,
  Home: 268, End: 269, CapsLock: 280,
  ShiftLeft: 340, ControlLeft: 341, AltLeft: 342, ShiftRight: 344, ControlRight: 345, AltRight: 346,
};
EMB.GLFW_NAMES = {
  340: 'L Shift', 344: 'R Shift', 341: 'L Ctrl', 345: 'R Ctrl', 342: 'L Alt', 346: 'R Alt',
  32: 'Space', 258: 'Tab', 257: 'Enter', 280: 'Caps Lock', 256: 'Esc', 96: '`',
};
EMB.glfwCodeOf = e => {
  const c = e.code || '';
  if (EMB.GLFW_BY_CODE[c] != null) return EMB.GLFW_BY_CODE[c];
  if (/^Key[A-Z]$/.test(c)) return c.charCodeAt(3);
  if (/^Digit[0-9]$/.test(c)) return 48 + Number(c.slice(5));
  if (/^F([1-9]|1[0-2])$/.test(c)) return 289 + Number(c.slice(1));
  if (/^Numpad[0-9]$/.test(c)) return 320 + Number(c.slice(6));
  return null;
};
EMB.glfwName = code => {
  if (EMB.GLFW_NAMES[code]) return EMB.GLFW_NAMES[code];
  if (code >= 65 && code <= 90) return String.fromCharCode(code);
  if (code >= 48 && code <= 57) return String(code - 48);
  if (code >= 290 && code <= 301) return 'F' + (code - 289);
  if (code >= 320 && code <= 329) return 'Num ' + (code - 320);
  return EMB.t('код {code}', { code });
};

EMB.releaseId = () => {
  const rel = EMB.state.versions.find(v => v.type === 'release');
  return rel ? rel.id : (EMB.state.versions[0] ? EMB.state.versions[0].id : '');
};

EMB.currentPreset = () => {
  const el = document.querySelector('input[name="preset"]:checked');
  return el ? el.value : EMB.state.settings.perf.preset;
};
