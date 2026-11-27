// Загружаем обычные script в одном контексте, как Chromium (не CommonJS).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function renderer({ versions = () => new Promise(() => {}), account = false, info } = {}) {
  const nodes = Object.fromEntries(['app', 'view', 'sidebar-foot', 'busy', 'modal-root', 'toasts', 'startup-message', 'startup-reload', 'startup-close'].map(id => [id, {
    innerHTML: '', textContent: '', classList: { toggle() {}, add() {} },
    addEventListener() {}, setAttribute() {}, appendChild() {},
  }]));
  const document = {
    documentElement: {}, body: { classList: { toggle() {}, add() {} } },
    getElementById: id => nodes[id] || null,
    querySelector: selector => nodes[selector.slice(1)] || null,
    querySelectorAll: () => [], addEventListener() {},
    createElement: () => ({ classList: { add() {} }, remove() {} }),
  };
  const settings = { animations: true, perf: { preset: 'standard' }, orangeVisuals: { enabled: true }, ram: 4096 };
  const window = {
    addEventListener() {},
    ember: {
      info: info || (async () => ({ version: '2.2.5A', language: 'ru' })),
      settings: { get: async () => settings },
      accounts: { list: async () => ({ accounts: account ? [{ id: 'a', username: 'Steve', type: 'offline' }] : [], selected: 'a' }) },
      skins: { sources: async () => [], catalog: async () => [], current: () => new Promise(() => {}) },
      music: { folder: async () => '/music' }, versions,
      instances: { list: async () => ({ list: [], selected: null }) },
      game: { status: async () => ({ running: false }) },
      rust: { info: async () => [] }, on() {},
    },
  };
  const context = vm.createContext({ window, document, console, Intl, setTimeout: () => {}, clearTimeout() {} });
  const root = path.join(__dirname, '../renderer');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const [, src] of html.matchAll(/<script src="([^"]+)"/g)) {
    vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
  }
  return { window, nodes, EMB: window.EMB };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('все сценарии index.html загружаются вместе; окно не ждёт Mojang или скин', async () => {
  const { EMB, nodes } = renderer({ account: true });
  await flush();
  assert.equal(EMB.i18n.shellReady, true);
  assert.equal(EMB.i18n.names.ru, 'Русский');
  assert.match(nodes.app.innerHTML, /class="titlebar"/);
  assert.match(nodes.app.innerHTML, /data-act="win-close"/);
  assert.match(nodes.app.innerHTML, /data-nav="settings"/);
  assert.match(nodes.view.innerHTML, /ИГРАТЬ/);
  // Навигация через тот же обработчик, что у настоящего клика.
  await EMB.onClick({ target: { closest: s => s === '[data-nav]' ? { dataset: { nav: 'settings' } } : null } });
  assert.match(nodes.view.innerHTML, /Память и Java/);
  for (const view of Object.values(EMB.views)) assert.equal(typeof view(), 'string');
});

test('ошибка манифеста не ломает готовый интерфейс', async () => {
  const { EMB, nodes } = renderer({ versions: async () => { throw new Error('offline'); } });
  await flush();
  assert.equal(EMB.i18n.shellReady, true);
  assert.match(nodes.view.innerHTML, /ИГРАТЬ/);
  assert.equal(EMB.state.versions.length, 0);
});

test('ошибка начального IPC отображается на статическом экране', async () => {
  const { nodes } = renderer({ info: async () => { throw new Error('preload failed'); } });
  await flush();
  assert.match(nodes['startup-message'].textContent, /preload failed/);
});
