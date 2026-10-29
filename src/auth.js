const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { dirs } = require('./paths');
const { fetchJson, fetchBuffer, downloadFile, sleep } = require('./http');
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

// ===== Microsoft (официальный аккаунт Minecraft) =====
// Device code flow через login.live.com (legacy Live SDK-клиент Minecraft Launcher):
// пользователь вводит код на microsoft.com/link, дальше цепочка
// OAuth → Xbox Live → XSTS → Minecraft services. Refresh-токен храним в аккаунте.
// Важно: Azure AD (login.microsoftonline.com) этот client_id не принимает — там нужен
// свой зарегистрированный клиент, поэтому используем login.live.com.
const MS_CLIENT_ID = '00000000402b5328'; // публичный клиент Minecraft Launcher
const MS_DEVICE = 'https://login.live.com/oauth20_connect.srf';
const MS_TOKEN = 'https://login.live.com/oauth20_token.srf';
const MS_SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL';
const MCS = 'https://api.minecraftservices.com';

function msForm(params) {
  return new URLSearchParams(params).toString();
}

function msPost(url, params) {
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: msForm(params),
  });
}

// Шаг 1: код устройства. Пользователь вводит его на microsoft.com/link
async function msDeviceCode() {
  return msPost(MS_DEVICE, {
    client_id: MS_CLIENT_ID,
    scope: MS_SCOPE,
    response_type: 'device_code',
  });
}

// Шаг 2: опрашиваем токен, пока пользователь вводит код
async function msPollToken(deviceCode, intervalSec, shouldCancel = () => false) {
  let iv = Math.max(3, intervalSec || 5);
  for (;;) {
    await sleep(iv * 1000);
    if (shouldCancel()) throw new Error('Вход отменён');
    try {
      return await msPost(MS_TOKEN, {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: deviceCode,
        client_id: MS_CLIENT_ID,
        scope: MS_SCOPE,
      });
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('authorization_pending')) continue;
      if (msg.includes('slow_down')) { iv += 5; continue; }
      if (msg.includes('expired_token')) throw new Error('Код входа истёк. Нажмите «Войти через Microsoft» ещё раз');
      if (msg.includes('authorization_declined')) throw new Error('Вход отклонён в браузере');
      throw e;
    }
  }
}

// Обновление пары токенов Microsoft по refresh-токену
async function msRefresh(refreshToken) {
  return msPost(MS_TOKEN, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: MS_CLIENT_ID,
    scope: MS_SCOPE,
  });
}

// Шаг 3–4: Xbox Live и XSTS. Возвращает userhash и токен XSTS
async function msXbox(msAccessToken) {
  let xbl;
  try {
    xbl = await fetchJson('https://user.auth.xboxlive.com/user/authenticate', {
      json: {
        Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: 'd=' + msAccessToken },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT',
      },
    });
  } catch (e) {
    throw new Error(`Xbox Live не принял вход: ${e.message}`);
  }
  const uhs = xbl.DisplayClaims && xbl.DisplayClaims.xui && xbl.DisplayClaims.xui[0] && xbl.DisplayClaims.xui[0].uhs;
  if (!uhs) throw new Error('Xbox Live не вернул профиль (userhash)');
  let xsts;
  try {
    xsts = await fetchJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
      json: {
        Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT',
      },
    });
  } catch (e) {
    const msg = e.message || '';
    if (msg.includes('2148916238')) throw new Error('Детский аккаунт Microsoft: добавьте его в семейную группу или войдите взрослым аккаунтом');
    if (msg.includes('2148916233')) throw new Error('У аккаунта Microsoft нет профиля Xbox. Зайдите на xbox.com и создайте его');
    throw new Error(`Xbox Live (XSTS) не принял вход: ${e.message}`);
  }
  return { uhs, token: xsts.Token };
}

// Шаг 5–6: токен Minecraft services и профиль персонажа
async function msAccount(msAuth, prevRefresh) {
  const { uhs, token } = await msXbox(msAuth.access_token);
  const mc = await fetchJson(`${MCS}/authentication/login_with_xbox`, {
    json: { identityToken: `XBL3.0 x=${uhs};${token}`, ensureLegacyEnabled: true },
  }).catch(e => { throw new Error(`Minecraft services не принял вход: ${e.message}`); });
  let profile;
  try {
    profile = await fetchJson(`${MCS}/minecraft/profile`, { headers: { Authorization: `Bearer ${mc.access_token}` } });
  } catch (e) {
    if (e.status === 404) throw new Error('У аккаунта Microsoft нет профиля Minecraft: купите игру или создайте профиль на minecraft.net');
    throw e;
  }
  return {
    type: 'microsoft',
    username: profile.name,
    uuid: formatUuid(profile.id),
    accessToken: mc.access_token,
    mcExpiresAt: Date.now() + Math.max(0, (mc.expires_in || 86400) - 60) * 1000,
    msRefreshToken: msAuth.refresh_token || prevRefresh || '',
  };
}

// Полный вход: код устройства → токен → аккаунт
async function msLogin({ deviceCode, interval }, shouldCancel) {
  const msAuth = await msPollToken(deviceCode, interval, shouldCancel);
  return msAccount(msAuth);
}

// Перед запуском: проверяем токен, при необходимости обновляем.
async function ensureAccount(account) {
  if (!account) return account;
  if (account.type === 'microsoft') {
    // Токен Minecraft живёт сутки — пока жив, ничего не делаем
    if (account.mcExpiresAt && Date.now() < account.mcExpiresAt && account.accessToken) return account;
    if (!account.msRefreshToken) throw new Error('Сессия Microsoft истекла. Войдите в аккаунт заново.');
    try {
      const msAuth = await msRefresh(account.msRefreshToken);
      const fresh = await msAccount(msAuth, account.msRefreshToken);
      store.set('account', fresh);
      return fresh;
    } catch (e) {
      throw new Error('Сессия Microsoft истекла. Войдите в аккаунт заново.');
    }
  }
  if (account.type !== 'elyby') return account;
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

module.exports = {
  offlineAccount, elyAuthenticate, ensureAccount, elyLogout, ensureAuthlibInjector, offlineUuid,
  msDeviceCode, msLogin, msAccount, msRefresh,
};
