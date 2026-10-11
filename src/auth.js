const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { dirs } = require('./paths');
const { fetchJson, fetchBuffer, downloadFile } = require('./http');
const store = require('./store');

const ELY = 'https://authserver.ely.by';

function formatUuid(hex) {
  const h = hex.replace(/-/g, '');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// UUID для оффлайн-режима (как в самой Minecraft: MD5 от "OfflinePlayer:<name>")
function offlineUuid(name) {
  const h = crypto.createHash('md5').update('OfflinePlayer:' + name, 'utf8').digest();
  h[6] = (h[6] & 0x0f) | 0x30;
  h[8] = (h[8] & 0x3f) | 0x80;
  return formatUuid(h.toString('hex'));
}

function clientToken() {
  let t = store.get('clientToken');
  if (!t) {
    t = crypto.randomUUID().replace(/-/g, '');
    store.set('clientToken', t);
  }
  return t;
}

function offlineAccount(name) {
  const username = (name || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) throw new Error('Ник: 3–16 символов, латиница, цифры и _');
  return { type: 'offline', username, uuid: offlineUuid(username) };
}

async function elyAuthenticate(login, password) {
  const res = await fetchJson(`${ELY}/auth/authenticate`, {
    json: { username: login, password, clientToken: clientToken(), requestUser: true, agent: { name: 'Minecraft', version: 1 } },
  });
  return fromElyResponse(res);
}

function fromElyResponse(res) {
  if (!res.selectedProfile) throw new Error('Ely.by не вернул профиль персонажа');
  return {
    type: 'elyby',
    username: res.selectedProfile.name,
    uuid: formatUuid(res.selectedProfile.id),
    accessToken: res.accessToken,
  };
}

async function elyValid(accessToken) {
  try {
    await fetchBuffer(`${ELY}/auth/validate`, { method: 'POST', json: { accessToken } });
    return true;
  } catch (_) {
    return false;
  }
}

// Перед запуском: проверяем токен, при необходимости обновляем.
async function ensureAccount(account) {
  if (!account || account.type !== 'elyby') return account;
  if (await elyValid(account.accessToken)) return account;
  try {
    const res = await fetchJson(`${ELY}/auth/refresh`, {
      json: { accessToken: account.accessToken, clientToken: clientToken(), requestUser: true },
    });
    const fresh = fromElyResponse(res);
    store.set('account', fresh);
    return fresh;
  } catch (e) {
    throw new Error('Сессия Ely.by истекла. Войдите в аккаунт заново.');
  }
}

async function elyLogout(account) {
  if (account && account.type === 'elyby' && account.accessToken) {
    try { await fetchBuffer(`${ELY}/auth/invalidate`, { method: 'POST', json: { accessToken: account.accessToken, clientToken: clientToken() } }); } catch (_) {}
  }
}

// Уже скачанный authlib-injector: используется, если сервер меты недоступен
function findCachedAuthlib() {
  try {
    const jars = fs.readdirSync(dirs.tools)
      .filter(n => /^authlib-injector-.*\.jar$/i.test(n))
      .sort();
    return jars.length ? path.join(dirs.tools, jars[jars.length - 1]) : null;
  } catch (_) {
    return null;
  }
}

// authlib-injector подменяет серверы авторизации клиента на Ely.by
async function ensureAuthlibInjector() {
  let meta;
  try {
    meta = await fetchJson('https://authlib-injector.yushi.moe/artifact/latest.json');
  } catch (e) {
    // Сервер меты недоступен: берём уже скачанный jar, чтобы запуск не срывался
    const cached = findCachedAuthlib();
    if (cached) return cached;
    throw new Error(`Не удалось скачать authlib-injector (Ely.by): ${e.message}. Проверьте интернет`);
  }
  const jar = path.join(dirs.tools, `authlib-injector-${meta.version}.jar`);
  if (!fs.existsSync(jar)) {
    await fsp.mkdir(dirs.tools, { recursive: true });
    await downloadFile(meta.download_url, jar);
  }
  return jar;
}

module.exports = { offlineAccount, elyAuthenticate, ensureAccount, elyLogout, ensureAuthlibInjector, offlineUuid };
