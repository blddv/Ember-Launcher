const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { pipeline } = require('stream/promises');

const UA = 'EMBER-Launcher/2.0.6 (https://github.com/ember-launcher)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function request(url, opts = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(u, {
      method: opts.method || 'GET',
      headers: { 'User-Agent': UA, ...(opts.headers || {}) },
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 10) {
        res.resume();
        return resolve(request(new URL(res.headers.location, url).toString(), opts, redirects + 1));
      }
      resolve(res);
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('таймаут соединения')));
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
  const res = await request(url, { method, headers, body });
  const chunks = [];
  for await (const c of res) chunks.push(c);
  const buf = Buffer.concat(chunks);
  if (res.statusCode >= 400) {
    const err = new Error(`HTTP ${res.statusCode}: ${extractError(buf)}`);
    err.status = res.statusCode;
    throw err;
  }
  return buf;
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

function fileSha1(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1');
    fs.createReadStream(file)
      .on('data', d => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  });
}

async function downloadFile(url, dest, { sha1, headers } = {}) {
  if (fs.existsSync(dest) && (!sha1 || (await fileSha1(dest)) === sha1)) return dest;
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await request(url, { headers });
      if (res.statusCode >= 400) { res.resume(); throw new Error(`HTTP ${res.statusCode}`); }
      await pipeline(res, fs.createWriteStream(tmp));
      if (sha1 && (await fileSha1(tmp)) !== sha1) throw new Error('контрольная сумма не совпала');
      await fsp.rename(tmp, dest);
      return dest;
    } catch (e) {
      lastErr = e;
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

module.exports = { fetchJson, fetchBuffer, downloadFile, fileSha1, pool, sleep, UA };
