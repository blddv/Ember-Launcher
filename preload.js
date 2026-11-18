const { contextBridge, ipcRenderer } = require('electron');

const inv = (ch, ...args) => ipcRenderer.invoke(ch, ...args);
const EVENTS = ['progress', 'log', 'game:state', 'mod:status'];

contextBridge.exposeInMainWorld('ember', {
  info: () => inv('app:info'),
  win: {
    min: () => inv('win:min'),
    max: () => inv('win:max'),
    close: () => inv('win:close'),
    dragStart: () => inv('win:dragStart'),
    dragEnd: () => inv('win:dragEnd'),
  },
  settings: {
    get: () => inv('settings:get'),
    save: patch => inv('settings:save', patch),
  },
  dataDir: {
    change: () => inv('dataDir:change'),
    reset: () => inv('dataDir:reset'),
  },
  versions: () => inv('versions:list'),
  loaderVersions: (loader, mc) => inv('loader:versions', { loader, mc }),
  rust: {
    platforms: () => inv('rust:platforms'),
    releases: (platform, fresh) => inv('rust:releases', { platform, fresh }),
    info: () => inv('rust:info'),
    prepare: (platform, tag) => inv('rust:prepare', { platform, tag }),
  },
  instances: {
    list: () => inv('instances:list'),
    create: data => inv('instances:create', data),
    remove: id => inv('instances:delete', id),
    select: id => inv('instances:select', id),
    open: id => inv('instances:open', id),
    duplicate: id => inv('instances:duplicate', id),
    exportZip: id => inv('instances:exportZip', id),
    importZip: () => inv('import:zip'),
    backup: id => inv('instances:backup', id),
    folder: (id, sub) => inv('instances:folder', { id, sub }),
    setCover: (id, cover) => inv('instances:setCover', { id, cover }),
    pickCover: id => inv('instances:pickCover', id),
    lastCrash: id => inv('instances:lastCrash', id),
  },
  covers: {
    search: query => inv('covers:search', query),
  },
  perf: {
    presets: () => inv('perf:presets'),
    installPack: id => inv('perf:installPack', id),
    applyNow: (id, preset) => inv('perf:applyNow', { id, preset }),
  },
  mods: {
    installed: id => inv('mods:installed', id),
    states: (id, items) => inv('mods:states', { id, items }),
    list: id => inv('mods:list', id),
    toggle: (id, file, enabled) => inv('mods:toggle', { id, file, enabled }),
    remove: (id, file) => inv('mods:delete', { id, file }),
  },
  screenshots: () => inv('screenshots:list'),
  music: {
    folder: () => inv('music:folder'),
    pickFolder: () => inv('music:pickFolder'),
  },
  game: {
    launch: id => inv('game:launch', id),
    stop: () => inv('game:stop'),
    status: () => inv('game:status'),
    hide: () => inv('game:hide'),
  },
  accounts: {
    list: () => inv('accounts:list'),
    select: id => inv('accounts:select', id),
    add: (type, payload, label) => inv('accounts:add', { type, payload, label }),
    remove: id => inv('accounts:remove', id),
    logout: id => inv('accounts:logout', id),
  },
  auth: {
    msStart: () => inv('auth:msStart'),
    msWait: () => inv('auth:msWait'),
    msCancel: () => inv('auth:msCancel'),
  },
  skins: {
    sources: () => inv('skins:sources'),
    search: (source, query) => inv('skins:search', { source, query }),
    current: (accountId) => inv('skins:current', { accountId }),
    apply: (accountId, opts) => inv('skins:apply', { accountId, ...opts }),
    pickImage: () => inv('skins:pickImage'),
  },
  copyText: text => inv('clipboard:copy', text),
  search: (source, opts) => inv('search', { source, ...opts }),
  install: (item, instanceId, opts = {}) => inv('install', { item, instanceId, update: !!opts.update }),
  showFile: p => inv('files:open', p),
  pickImage: () => inv('dialog:image'),
  pickJava: () => inv('dialog:java'),
  openUrl: url => inv('shell:url', url),
  on: (channel, cb) => {
    if (!EVENTS.includes(channel)) return () => {};
    const listener = (_e, data) => cb(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
