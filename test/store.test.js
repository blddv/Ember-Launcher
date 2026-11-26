// Тесты хранилища и путей: работа без Electron, принудительно в тестовой папке.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Хранилище и пути читают EMBER_HOME при загрузке — ставим перед require.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-test-'));
process.env.EMBER_HOME = TMP;

const store = require('../src/store');
const paths = require('../src/paths');

test('paths: папка данных в EMBER_HOME', () => {
  assert.strictEqual(paths.dirs.base, TMP);
  assert.ok(paths.dirs.versions.startsWith(TMP));
  assert.ok(paths.dirs.tmp.startsWith(TMP));
});

test('store: дефолты и загрузка пустого хранилища', () => {
  const s = store.get();
  assert.strictEqual(s.ram, 4096);
  assert.strictEqual(s.perf.preset, 'standard');
  assert.deepStrictEqual(s.accounts, []);
  assert.strictEqual(s.selectedAccount, null);
});

test('store: save/load — данные сохраняются и читаются', () => {
  store.set('ram', 8192);
  store.patch({ gcPreset: 'zgc' });
  store.patch({ perf: { preset: 'potato' } });
  // перечитываем заново (как при перезапуске лаунчера)
  delete require.cache[require.resolve('../src/store')];
  const fresh = require('../src/store');
  const s = fresh.get();
  assert.strictEqual(s.ram, 8192);
  assert.strictEqual(s.gcPreset, 'zgc');
  assert.strictEqual(s.perf.preset, 'potato');
});

test('store: patch сливает вложенные блоки, а не заменяет', () => {
  const before = store.get().orangeVisuals;
  store.patch({ orangeVisuals: { hudFps: false } });
  const after = store.get().orangeVisuals;
  assert.strictEqual(after.hudFps, false);
  assert.strictEqual(after.fov, before.fov, 'остальные ключи orangeVisuals должны остаться');
});

test('store: аккаунты — добавление, выбор, удаление', () => {
  const acc = { type: 'elyby', username: 'Tester', uuid: 'u1' };
  const created = store.addAccount(acc);
  assert.ok(created.id);
  assert.strictEqual(store.activeAccount().username, 'Tester');

  const second = store.addAccount({ type: 'offline', username: 'Offline' });
  assert.strictEqual(store.activeAccount().username, 'Offline');
  store.selectAccount(created.id);
  assert.strictEqual(store.activeAccount().username, 'Tester');

  store.removeAccount(created.id);
  assert.strictEqual(store.accountById(created.id), null);
  assert.strictEqual(store.activeAccount().username, 'Offline');
});

test('store: секреты аккаунтов не лежат в launcher.json открытым текстом', () => {
  store.set('curseforgeKey', 'secret-key-123');
  store.addAccount({ type: 'elyby', username: 'Sec', uuid: 'u2', token: 'secret-token' });
  const raw = fs.readFileSync(path.join(TMP, 'launcher.json'), 'utf8');
  assert.ok(!raw.includes('secret-token'), 'секрет аккаунта не должен быть в открытом виде');
  assert.ok(!raw.includes('"accounts":'), 'аккаунты не хранятся открытым текстом (только accountsSecure)');
  assert.ok(raw.includes('accountsSecure'), 'аккаунты шифруются в accountsSecure');
});

test('store: accountId стабилен по uuid и типу+нику', () => {
  assert.strictEqual(store.accountId({ type: 'elyby', uuid: 'abc' }), 'elyby:abc');
  assert.strictEqual(store.accountId({ type: 'offline', username: 'P' }), 'offline:P');
});
