// Тесты обёртки ошибок HTTP: человекочитаемые сообщения, а не голые коды.
const test = require('node:test');
const assert = require('node:assert');
const { humanizeError, describeNetError, pool, sleep } = require('../src/http');

test('humanizeError: сетевые ошибки описательно', () => {
  const agg = Object.assign(new Error('failed'), { name: 'AggregateError', errors: [{ code: 'ECONNRESET' }, { code: 'ETIMEDOUT' }] });
  const msg = humanizeError(agg);
  assert.match(msg, /Сетевая ошибка/);
  assert.ok(msg.includes('ECONNRESET') && msg.includes('ETIMEDOUT'));

  const econn = Object.assign(new Error('connect'), { code: 'ECONNREFUSED' });
  // Простые ошибки показываются по сообщению; голый код так не всплывает
  assert.strictEqual(humanizeError(econn), 'connect');

  assert.strictEqual(humanizeError(null), 'Неизвестная ошибка');
  assert.strictEqual(humanizeError(new Error('что-то')), 'что-то');
});

test('describeNetError: коды и таймауты', () => {
  const agg = Object.assign(new Error('x'), { name: 'AggregateError', errors: [{ code: 'ENOTFOUND' }] });
  assert.strictEqual(describeNetError(agg), 'ENOTFOUND');

  const timeout = Object.assign(new Error('таймаут соединения'), { code: 'ETIMEDOUT' });
  assert.match(describeNetError(timeout), /таймаут/i);

  assert.strictEqual(describeNetError(null), 'неизвестная ошибка');
});

test('pool: обработает все элементы с ограничением', async () => {
  const items = [1, 2, 3, 4, 5];
  const results = await pool(items, 2, async x => x * 2);
  assert.deepStrictEqual(results, [2, 4, 6, 8, 10]);
});

test('sleep: ждёт указанное время', async () => {
  const t0 = Date.now();
  await sleep(20);
  assert.ok(Date.now() - t0 >= 15);
});
