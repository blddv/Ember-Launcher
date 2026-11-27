const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function rustWith(fetchJson, runtime = '/unused') {
  const filename = path.join(__dirname, '../src/rust.js');
  const realRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, process, Buffer, console,
    require(id) {
      if (id === './http') return { fetchJson };
      if (id === './store') return { get: () => '' };
      if (id === './paths') return { dirs: { runtime } };
      return realRequire(id);
    },
  }, { filename });
  return module.exports;
}

const release = (name = 'horizon-linux-x86_64.tar.gz') => ({ tag_name: 'v1', assets: [{ name, browser_download_url: 'https://github.com/example/asset', size: 10 }] });

test('Horizon: GitHub 404 не выдаётся за пустой репозиторий', async () => {
  const rust = rustWith(async () => { throw Object.assign(new Error('Not Found'), { status: 404 }); });
  await assert.rejects(rust.latestRelease('horizon'), /репозиторий horizon-rust\/horizon недоступен.*404/);
  await assert.rejects(rust.launch({ instance: { loader: 'horizon' } }), /404/);
});

test('пустые релизы и неподходящие файлы имеют разные сообщения', async () => {
  await assert.rejects(rustWith(async () => []).ensureEngine('horizon'), /нет опубликованных релизов/);
  await assert.rejects(rustWith(async () => [release('source.zip')]).latestRelease('horizon'), /нет готового движка для/);
});

test('неожиданный ответ GitHub и лимит запросов', async () => {
  await assert.rejects(rustWith(async () => ({})).listReleases('horizon'), /неожиданный список/);
  await assert.rejects(rustWith(async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }); }).latestRelease('horizon'), /Добавьте токен/);
});

test('подходящий релиз выбирается и кешируется', async () => {
  let calls = 0;
  const name = process.platform === 'win32' ? 'horizon-windows-x64.zip' : process.platform === 'darwin' ? 'horizon-macos-arm64.zip' : 'horizon-linux-x86_64.tar.gz';
  const rust = rustWith(async () => { calls++; return [release(name)]; });
  assert.equal((await rust.latestRelease('horizon')).tag, 'v1');
  await rust.latestRelease('horizon');
  assert.equal(calls, 1);
});

test('закреплённый установленный движок доступен без GitHub', async t => {
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-rust-'));
  t.after(() => fs.rmSync(runtime, { recursive: true, force: true }));
  const rust = rustWith(async () => { throw new Error('GitHub must not be called'); }, runtime);
  const dir = path.join(runtime, 'rust/horizon/v1');
  fs.mkdirSync(dir, { recursive: true });
  const bin = rust.platform('horizon').clientBin[rust.osKey()];
  fs.writeFileSync(path.join(dir, bin), '');
  fs.writeFileSync(path.join(dir, '.ember-engine.json'), JSON.stringify({ tag: 'v1' }));
  assert.equal((await rust.ensureEngine('horizon', 'v1')).tag, 'v1');
});
