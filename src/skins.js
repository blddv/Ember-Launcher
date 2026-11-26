// Каталоги скинов и применение скина к аккаунту.
//
// Источники — по нику игрока берём его скин (так работают публичные галереи
// Ely.by, Mojang и LittleSkin). Для Mojang/Microsoft-аккаунтов скин ставится
// напрямую через официальный API (Bearer-токен Minecraft). Для Ely.by публичного
// API нет — смена скина происходит на сайте ely.by (кнопка «Открыть на ely.by»),
// игра подхватит его автоматически при входе через Ely.by.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const auth = require('./auth');

// Каталоги, из которых можно просматривать скины по нику игрока.
const SOURCES = [
  { id: 'elyby', label: 'Ely.by', color: '#FF7100', skinUrl: n => `https://ely.by/skin/${encodeURIComponent(n)}` },
  { id: 'mojang', label: 'Mojang', color: '#5FB85F', skinUrl: n => `https://mc-heads.net/skin/${encodeURIComponent(n)}/100` },
  { id: 'littleskin', label: 'LittleSkin', color: '#8B6FE8', skinUrl: n => `https://littleskin.cn/skin/${encodeURIComponent(n)}` },
];

function sourceById(id) {
  return SOURCES.find(s => s.id === id) || null;
}

function listSources() {
  return SOURCES.map(s => ({ id: s.id, label: s.label, color: s.color }));
}

// Текущий скин аккаунта (для предпросмотра)
function currentSkinUrl(account) {
  if (!account) return null;
  if (account.type === 'elyby') return `https://ely.by/skin/${encodeURIComponent(account.username)}`;
  if (account.type === 'microsoft') return `https://mc-heads.net/skin/${encodeURIComponent(account.uuid)}`;
  return null;
}

// Поиск скинов по нику: возвращает варианты из каталогов.
// Каждый вариант — это «готовый к примерке» скин конкретного игрока.
// source: 'all' (или не указан) — все каталоги, иначе конкретный id.
async function search(query, source = 'all') {
  const q = String(query || '').trim();
  if (!q) return [];
  const out = [];
  for (const s of SOURCES) {
    if (source && source !== 'all' && s.id !== source) continue;
    out.push({ source: s.id, label: s.label, color: s.color, name: q, url: s.skinUrl(q) });
  }
  return out;
}

// Обёртка над fetch с таймаутом (Node 20+ имеет глобальный fetch)
async function fetchWithTimeout(url, opts = {}, ms = 30000) {
  if (typeof fetch !== 'function') throw new Error('fetch недоступен в этой версии среды');
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

// Применение скина к аккаунту.
// opts: { file?: абсолютный путь к PNG, url?: ссылка на PNG, model?: 'classic'|'slim' }
async function apply(account, opts = {}) {
  if (!account) throw new Error('Сначала выберите аккаунт во вкладке «Аккаунт»');
  const model = opts.model === 'slim' ? 'slim' : 'classic';

  if (account.type === 'offline') {
    throw new Error('У оффлайн-аккаунта скина нет. Войдите в Microsoft или Ely.by, чтобы выбрать скин.');
  }

  if (account.type === 'elyby') {
    throw new Error('Ely.by не имеет публичного API для смены скина. Откройте страницу скина на ely.by '
      + '(кнопка «Открыть на ely.by» в этом окне) и поменяйте скин там — в игре он обновится автоматически.');
  }

  if (account.type !== 'microsoft') {
    throw new Error('Смена скина поддерживается для аккаунтов Mojang/Microsoft и Ely.by.');
  }

  // Освежаем токен Minecraft (он живёт сутки)
  const acc = await auth.ensureAccount(account);
  const token = acc.accessToken;
  if (!token) throw new Error('Нет токена Minecraft. Войдите в аккаунт заново.');

  if (opts.file) {
    return uploadFile(token, opts.file, model);
  }
  if (opts.url) {
    return uploadUrl(token, opts.url, model);
  }
  throw new Error('Укажите файл скина или ссылку на него');
}

async function uploadUrl(token, url, model) {
  const res = await fetchWithTimeout('https://api.minecraftservices.com/minecraft/profile/skins', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ variant: model, url }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Не удалось установить скин (HTTP ${res.status}): ${t.slice(0, 200)}`);
  }
  return { ok: true, source: 'mojang', method: 'url' };
}

async function uploadFile(token, file, model) {
  let buf;
  try { buf = await fsp.readFile(file); } catch (e) { throw new Error('Не удалось прочитать файл скина: ' + e.message); }
  // Простая проверка: PNG-заголовок
  if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) {
    throw new Error('Файл скина не похож на PNG');
  }
  let body;
  let headers = { Authorization: `Bearer ${token}` };
  if (typeof FormData === 'function' && typeof Blob === 'function') {
    const form = new FormData();
    form.append('variant', model);
    form.append('file', new Blob([buf], { type: 'image/png' }), path.basename(file));
    body = form;
  } else {
    // Запасной путь: multipart вручную
    const boundary = '----emberSkin' + Date.now();
    const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="variant"\r\n\r\n${model}\r\n`
      + `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${path.basename(file)}"\r\nContent-Type: image/png\r\n\r\n`);
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    body = Buffer.concat([head, buf, tail]);
    headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
  }
  const res = await fetchWithTimeout('https://api.minecraftservices.com/minecraft/profile/skins', {
    method: 'POST',
    headers,
    body,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Не удалось установить скин (HTTP ${res.status}): ${t.slice(0, 200)}`);
  }
  return { ok: true, source: 'mojang', method: 'file' };
}

// Ссылка на страницу смены скина на ely.by для текущего аккаунта
function elyProfileSkinUrl(account) {
  if (!account || account.type !== 'elyby') return 'https://ely.by/profile/skin';
  return `https://ely.by/profile/skin`;
}

module.exports = {
  listSources, search, currentSkinUrl, apply, elyProfileSkinUrl, sourceById,
};
