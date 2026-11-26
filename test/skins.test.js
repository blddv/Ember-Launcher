// Тесты каталога и логики скина (без сети: чистые функции и проверка ошибок).
const test = require('node:test');
const assert = require('node:assert');
const skins = require('../src/skins');

test('listSources: три источника с метаданными', () => {
  const sources = skins.listSources();
  assert.strictEqual(sources.length, 3);
  assert.deepStrictEqual(sources.map(s => s.id), ['elyby', 'mojang', 'littleskin']);
  for (const s of sources) {
    assert.ok(s.label && s.color, `источник ${s.id} должен иметь label и color`);
  }
});

test('sourceById: поиск по id', () => {
  assert.strictEqual(skins.sourceById('elyby').id, 'elyby');
  assert.strictEqual(skins.sourceById('nope'), null);
});

test('catalog: 10 скинов, у каждого URL по всем источникам', () => {
  const items = skins.catalog();
  assert.strictEqual(items.length, 10);
  const ids = items.map(c => c.id);
  assert.ok(ids.includes('steve') && ids.includes('notch') && ids.includes('dinnerbone'));
  for (const c of items) {
    assert.ok(c.nick && c.name && c.desc);
    for (const id of ['elyby', 'mojang', 'littleskin']) {
      const u = c.urls[id];
      assert.ok(u && /^https?:\/\//i.test(u), `у скина ${c.id} должен быть URL для ${id}`);
    }
    // Ники с пробелами/спецсимволами кодируются в URL
    if (c.nick !== c.nick.replace(/[^A-Za-z0-9_-]/g, '')) {
      assert.ok(!/\s/.test(c.urls.elyby), 'ник со спецсимволами должен быть заэкранирован в URL');
    }
  }
});

test('search: поиск по нику, фильтр по источнику', async () => {
  const all = await skins.search('Steve');
  assert.strictEqual(all.length, 3);
  assert.ok(all.every(i => i.name === 'Steve' && i.url && /^https?:\/\//i.test(i.url)));
  const ely = await skins.search('Steve', 'elyby');
  assert.strictEqual(ely.length, 1);
  assert.strictEqual(ely[0].source, 'elyby');
  const empty = await skins.search('   ');
  assert.deepStrictEqual(empty, []);
});

test('looksLikeSkinUrl: распознавание скин-ссылок', () => {
  assert.strictEqual(skins.looksLikeSkinUrl('https://x.com/skin.png'), true);
  assert.strictEqual(skins.looksLikeSkinUrl('http://x.com/s.JPG'), true);
  assert.strictEqual(skins.looksLikeSkinUrl('https://x.com/skin/Steve'), true);
  assert.strictEqual(skins.looksLikeSkinUrl('https://x.com/skins/Steve'), false);
  assert.strictEqual(skins.looksLikeSkinUrl('ftp://x.com/skin.png'), false);
  assert.strictEqual(skins.looksLikeSkinUrl('https://x.com/readme.txt'), false);
  assert.strictEqual(skins.looksLikeSkinUrl(''), false);
  assert.strictEqual(skins.looksLikeSkinUrl(null), false);
});

test('elyProfileSkinUrl: ссылка на страницу скина ely.by', () => {
  assert.strictEqual(skins.elyProfileSkinUrl({ type: 'elyby', username: 'Player' }), 'https://ely.by/skin/Player');
  assert.strictEqual(skins.elyProfileSkinUrl({ type: 'microsoft' }), 'https://ely.by/skin');
  assert.strictEqual(skins.elyProfileSkinUrl(null), 'https://ely.by/skin');
});

test('apply: оффлайн-аккаунт, ely.by и неизвестный тип — понятные ошибки', async () => {
  await assert.rejects(skins.apply({ type: 'offline', username: 'X' }), /оффлайн-аккаунт/i);
  await assert.rejects(skins.apply({ type: 'elyby', username: 'X' }, { url: 'https://x/s.png' }), /Ely\.by/i);
  await assert.rejects(skins.apply({ type: 'unknown' }, {}), /Смена скина поддерживается/i);
});
