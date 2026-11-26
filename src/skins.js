// Каталоги скинов и применение скина к аккаунту.
//
// Источники — по нику игрока берём его скин. Прямые URL-обращения к
// публичным сервисам работают без авторизации:
//   - Ely.by:   https://skinsystem.ely.by/skins/{nick}.png  — прямая картика (редирект на файл;
//               браузер и загрузчик следят за редиректом сам). Без скина — 404.
//   - Mojang:   https://mc-heads.net/skin/{nick}           — прямая картика, 404 если скин нет.
//   - LittleSkin: https://littleskin.cn/skin/{nick}.png    — прямая картика.
// Текущий скин аккаунта определяется через официальные API:
//   - Ely.by:   https://skinsystem.ely.by/textures/{nick}  → { SKIN: { url, metadata: { model } } }
//   - Mojang:   https://sessionserver.mojang.com/session/minecraft/profile/{uuid}
//              → properties → base64 → { SKIN: { url, metadata: { model } } }
// Применение скина:
//   - Microsoft/Mojang: через официальный API (Bearer-токен), файл или ссылка.
//   - Ely.by: публичного API для выкладки скина нет — лаунчер открывает страницу
//     скина на ely.by, где пользователь ставит скин сам (игра подхватит его автоматически).
const fsp = require('fs/promises');
const path = require('path');
const auth = require('./auth');
const paths = require('./paths');
const { fetchBuffer } = require('./http');

// Каталоги, из которых можно просматривать скины по нику игрока.
const SOURCES = [
  { id: 'elyby', label: 'Ely.by', color: '#FF7100', skinUrl: n => `https://skinsystem.ely.by/skins/${encodeURIComponent(n)}.png` },
  { id: 'mojang', label: 'Mojang', color: '#5FB85F', skinUrl: n => `https://mc-heads.net/skin/${encodeURIComponent(n)}` },
  { id: 'littleskin', label: 'LittleSkin', color: '#8B6FE8', skinUrl: n => `https://littleskin.cn/skin/${encodeURIComponent(n)}.png` },
];

function sourceById(id) {
  return SOURCES.find(s => s.id === id) || null;
}

function listSources() {
  return SOURCES.map(s => ({ id: s.id, label: s.label, color: s.color }));
}

// Каталог готовых скинов: известные публичные скины по нику игрока.
// Для каждого скрина строятся URL для всех источников — preview и «Применить»
// работают из любого каталога (по умолчанию показываем Mojang — самый стабильный).
const CATALOG = [
  { id: 'steve', name: 'Steve', nick: 'Steve', desc: 'Классический скин Minecraft' },
  { id: 'alex', name: 'Alex', nick: 'Alex', desc: 'Скин по умолчанию' },
  { id: 'notch', name: 'Notch', nick: 'Notch', desc: 'Скин создателя игры' },
  { id: 'jeb', name: 'Jeb', nick: 'jeb_', desc: 'Скин ведущего разработчика' },
  { id: 'dinnerbone', name: 'Dinnerbone', nick: 'Dinnerbone', desc: 'Секретный скин' },
  { id: 'toast', name: 'Toast', nick: 'Toast', desc: 'Секретный скин' },
  { id: 'enderchick', name: 'EnderChick', nick: 'EnderChick', desc: 'Скин-чикен' },
  { id: 'skyler', name: 'Skyler', nick: 'Skyler', desc: 'Классический скин' },
  { id: 'commander', name: 'Commander', nick: 'Commander', desc: 'Классический скин' },
  { id: 'vechs', name: 'Vechs', nick: 'Vechs_', desc: 'Скин Vechs' },
];

function catalog() {
  return CATALOG.map(c => {
    const urls = {};
    for (const s of SOURCES) urls[s.id] = s.skinUrl(c.nick);
    return { id: c.id, name: c.name, nick: c.nick, desc: c.desc, urls };
  });
}

// Текущий скин аккаунта (для предпросмотра): { url, model } или null.
async function currentSkin(account) {
  if (!account) return null;
  if (account.type === 'elyby') return await elyCurrentSkin(account.username);
  if (account.type === 'microsoft') return await mcCurrentSkin(account.uuid);
  return null;
}

async function elyCurrentSkin(nick) {
  try {
    const buf = await fetchBuffer(`https://skinsystem.ely.by/textures/${encodeURIComponent(nick)}`);
    const data = JSON.parse(buf.toString('utf8'));
    const skin = data && data.SKIN;
    if (!skin || !skin.url) return null;
    return { url: skin.url, model: (skin.metadata && skin.metadata.model) || 'classic' };
  } catch (_) {
    return null;
  }
}

async function mcCurrentSkin(uuid) {
  try {
    const buf = await fetchBuffer(`https://sessionserver.mojang.com/session/minecraft/profile/${encodeURIComponent(uuid)}`);
    const data = JSON.parse(buf.toString('utf8'));
    const prop = (data.properties || []).find(p => p.type === 'skin');
    if (!prop) return null;
    const meta = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8'));
    const skin = meta && meta.SKIN;
    if (!skin || !skin.url) return null;
    return { url: skin.url, model: (skin.metadata && skin.metadata.model) || 'classic' };
  } catch (_) {
    return null;
  }
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

// Проверка, что ссылка выглядит как скин-картинка (http(s), PNG).
function looksLikeSkinUrl(url) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) return false;
  return /\.(png|jpg|jpeg|webp)$/i.test(u) || /\/skin(\/|$|\?)/i.test(u);
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
    // Скачиваем по ссылке и загружаем как файл: так работают и редиректы,
    // и проверка «это действительно PNG».
    return uploadUrl(token, opts.url, model);
  }
  throw new Error('Укажите файл скина или ссылку на него');
}

async function uploadUrl(token, url, model) {
  let buf;
  try {
    const res = await fetchWithTimeout(url, {}, 60000);
    if (!res.ok) throw new Error(`Не удалось скачать скин (HTTP ${res.status})`);
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    if (e && e.message && e.message.startsWith('Не удалось скачать')) throw e;
    throw new Error('Не удалось скачать скин по ссылке: ' + e.message);
  }
  if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) {
    throw new Error('По ссылке нет PNG-скина');
  }
  await fsp.mkdir(paths.dirs.tmp, { recursive: true });
  const tmp = path.join(paths.dirs.tmp, `skin-${Date.now()}.png`);
  await fsp.writeFile(tmp, buf);
  try {
    return await uploadFile(token, tmp, model);
  } finally {
    fsp.unlink(tmp).catch(() => {});
  }
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
  if (!account || account.type !== 'elyby') return 'https://ely.by/skin';
  return `https://ely.by/skin/${encodeURIComponent(account.username)}`;
}

module.exports = {
  listSources, catalog, search, currentSkin, apply, elyProfileSkinUrl, sourceById, looksLikeSkinUrl,
};
