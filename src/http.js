const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');

const UA = 'EMBER-Launcher/2.2.0 (https://github.com/ember-launcher)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const NET_CODES = [
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN',
  'ENETUNREACH', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETDOWN', 'EADDRNOTAVAIL',
];

function isConnectError(e) {
  if (!e) return false;
  // AggregateError из happy-eyeballs (Node 20+): не удалось подключиться ни к одному адресу
  if (e.name === 'AggregateError') return true;
  return NET_CODES.includes(e.code);
}

function isNetError(e) {
  if (!e) return false;
  if (e.name === 'AggregateError') return true;
  const text = `${e.code || ''} ${e.message || ''}`;
  return NET_CODES.some(c => text.includes(c))
    || /socket hang up|premature close|other side closed|таймаут соединения/i.test(text);
}

// Человекочитаемая сводка сетевой ошибки: коды причин вместо пустого «AggregateError»
function describeNetError(e) {
  if (!e) return 'неизвестная ошибка';
  if (e.name === 'AggregateError') {
    const parts = (Array.isArray(e.errors) ? e.errors : [])
      .map(x => x && (x.code || x.message))
      .filter(Boolean);
    return parts.length ? [...new Set(parts)].join(', ') : 'соединение не установлено';
  }
  // Таймауты показываем текстом, а не кодом — так понятнее
  if (/таймаут/i.test(e.message || '')) return e.message;
  return e.code || e.message || String(e);
}

function netError(e, url) {
  if (e && e.netWrapped) return e; // не оборачиваем дважды
  let host = url;
  try { host = new URL(url).host; } catch (_) { /* url уже не URL */ }
  const err = new Error(`Сетевая ошибка (${describeNetError(e)}) для ${host}`);
  err.cause = e;
  err.netWrapped = true;
  return err;
}

// Последний рубеж перед IPC: чтобы в окне никогда не появлялось голое «AggregateError»
function humanizeError(e) {
  if (!e) return 'Неизвестная ошибка';
  if (e.name === 'AggregateError') {
    return `Сетевая ошибка (${describeNetError(e)}). Проверьте подключение к интернету`;
  }
  return e.message || String(e);
}

function request(url, opts = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const timeoutErr = why => Object.assign(new Error(`таймаут соединения (${why})`), { code: 'ETIMEDOUT' });
    let guard;
    let settled = false;
    // Запрос завершается ровно один раз: поздние ошибки сокета не должны
    // порождать «висящие» повторы, чей reject никто не ловит
    const settle = fn => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      fn();
    };
    const req = lib.request(u, {
      method: opts.method || 'GET',
      headers: { 'User-Agent': UA, ...(opts.headers || {}) },
      family: opts.family,
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 10) {
        res.resume();
        return settle(() => resolve(request(new URL(res.headers.location, url).toString(), opts, redirects + 1)));
      }
      settle(() => resolve(res));
    });
    // Страж на всё соединение: DNS, TCP, TLS и ожидание заголовков ответа.
    // Без него запрос может зависнуть навсегда (например, чёрная дыра вместо ответа).
    guard = setTimeout(() => req.destroy(timeoutErr('нет ответа')), opts.connectMs || 30000);
    req.on('error', err => {
      if (settled) return;
      // Один повтор с принудительным IPv4: помогает при сломанном маршруте IPv6
      if (!opts.family && isConnectError(err)) {
        return settle(() => resolve(request(url, { ...opts, family: 4 }, redirects)));
      }
      settle(() => reject(netError(err, url)));
    });
    // Простой сокета без данных (зависшая загрузка) — тоже обрываем
    req.setTimeout(opts.idleMs || 30000, () => req.destroy(timeoutErr('нет данных')));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function fetchBuffer(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  let body = opts.body;
  if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
    headers['Content-Type'] = 'application/json';
  }
  const method = opts.method || (body ? 'POST' : 'GET');
  const { attempts = 3, overallMs = 180000, connectMs, idleMs } = opts;
  // Сетевые сбои (обрывы, таймауты) повторяем; ошибки HTTP (4xx/5xx) — нет
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await request(url, { method, headers, body, connectMs, idleMs });
      const chunks = [];
      // Общий предел времени на тело ответа: защита от «вечной» загрузки
      const overall = setTimeout(() => res.destroy(Object.assign(new Error('таймаут загрузки'), { code: 'ETIMEDOUT' })), overallMs);
      try {
        for await (const c of res) chunks.push(c);
      } finally {
        clearTimeout(overall);
      }
      const buf = Buffer.concat(chunks);
      if (res.statusCode >= 400) {
        const err = new Error(`HTTP ${res.statusCode}: ${extractError(buf)}`);
        err.status = res.statusCode;
        throw err;
      }
      return buf;
    } catch (e) {
      lastErr = e;
      if (!isNetError(e) || attempt === attempts) {
        throw e.status ? e : (isNetError(e) ? netError(e, url) : e);
      }
      await sleep(700 * attempt);
    }
  }
  throw lastErr;
}

function extractError(buf) {
  const text = buf.toString('utf8');
  try {
    const j = JSON.parse(text);
    return j.errorMessage || j.message || j.error || text.slice(0, 200);
  } catch (_) {
    return text.slice(0, 200);
  }
}

async function fetchJson(url, opts = {}) {
  const buf = await fetchBuffer(url, { ...opts, headers: { Accept: 'application/json', ...(opts.headers || {}) } });
  return JSON.parse(buf.toString('utf8'));
}

function hashFile(file, algo) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash(algo);
    fs.createReadStream(file)
      .on('data', d => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  });
}

function fileSha1(file) {
  return hashFile(file, 'sha1');
}

function fileSha256(file) {
  return hashFile(file, 'sha256');
}

async function downloadFile(url, dest, { sha1, sha256, headers, onProgress, attempts = 3, overallMs = 300000, connectMs, idleMs } = {}) {
  if (fs.existsSync(dest) && (!sha1 || (await fileSha1(dest)) === sha1) && (!sha256 || (await fileSha256(dest)) === sha256)) return dest;
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await request(url, { headers, connectMs, idleMs });
      if (res.statusCode >= 400) {
        res.resume();
        const err = new Error(`HTTP ${res.statusCode}`);
        err.status = res.statusCode;
        throw err;
      }
      const total = Number(res.headers['content-length']) || 0;
      let received = 0;
      const counter = onProgress && new Transform({
        transform(chunk, _enc, cb) {
          received += chunk.length;
          onProgress(received, total);
          cb(null, chunk);
        },
      });
      // Общий предел времени на загрузку файла
      const overall = setTimeout(() => res.destroy(Object.assign(new Error('таймаут загрузки'), { code: 'ETIMEDOUT' })), overallMs);
      try {
        if (counter) await pipeline(res, counter, fs.createWriteStream(tmp));
        else await pipeline(res, fs.createWriteStream(tmp));
      } finally {
        clearTimeout(overall);
      }
      if (sha1 && (await fileSha1(tmp)) !== sha1) throw new Error('контрольная сумма не совпала');
      if (sha256 && (await fileSha256(tmp)) !== sha256) throw new Error('контрольная сумма не совпала');
      await fsp.rename(tmp, dest);
      return dest;
    } catch (e) {
      lastErr = e;
      // Повторяем сбои сети, битые суммы и 5xx; 4xx — нет, они не «починятся»
      const retryable = isNetError(e) || e.message === 'контрольная сумма не совпала' || e.status >= 500;
      if (!retryable || attempt === attempts) throw e;
      await sleep(700 * attempt);
    }
  }
  throw new Error(`Не удалось скачать ${url}: ${lastErr.message}`);
}

async function pool(items, limit, worker) {
  let i = 0;
  const results = new Array(items.length);
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

module.exports = { fetchJson, fetchBuffer, downloadFile, fileSha1, fileSha256, pool, sleep, UA, humanizeError, describeNetError };
