// Шифрование секретов на диске. Токены аккаунтов (Microsoft, Ely.by) не лежат
// в launcher.json открытым текстом: при сохранении аккаунт шифруется, при чтении —
// расшифровывается только в память, в интерфейс и логи токены не попадают.
//
// Режимы шифрования (префикс в blob):
//   ss1: — системное хранилище ключей: safeStorage (DPAPI на Windows, Keychain на
//          macOS, keyring на Linux). Файл, скопированный на другой компьютер,
//          не расшифровать.
//   mk1: — запасной вариант, если системное хранилище недоступно: AES-256-GCM с
//          ключом, привязанным к этому компьютеру. Защищает от утечки копии файла,
//          но не от вредоноса с правами текущего пользователя.
const crypto = require('crypto');
const os = require('os');

function safeStorage() {
  try {
    const e = require('electron');
    if (e && e.safeStorage) return e.safeStorage;
  } catch (_) { /* запуск вне Electron (тесты) */ }
  return null;
}

function ssAvailable() {
  const s = safeStorage();
  try { return !!(s && s.isEncryptionAvailable()); } catch (_) { return false; }
}

function machineKey() {
  const seed = [os.hostname(), os.homedir(), (os.userInfo() || {}).username || '', os.platform(), os.arch()].join('|');
  return crypto.createHash('sha256').update('ember-secure-v1|' + seed).digest();
}

// Шифрует объект или строку; на выходе самодостаточный blob с префиксом режима
function encrypt(plain) {
  const text = typeof plain === 'string' ? plain : JSON.stringify(plain);
  const s = safeStorage();
  if (s && ssAvailable()) {
    try { return 'ss1:' + s.encryptString(text).toString('base64'); } catch (_) { /* падаем в запасной режим */ }
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', machineKey(), iv);
  const ct = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return 'mk1:' + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

// Обратная операция. Любая ошибка (чужой компьютер, повреждённый файл, утерянный
// ключ) означает «секрет утерян»: возвращаем null, чтобы вызывающий попросил
// войти заново, а не падал.
function decrypt(blob) {
  if (!blob || typeof blob !== 'string') return null;
  try {
    if (blob.startsWith('ss1:')) {
      const s = safeStorage();
      if (!s) return null;
      return JSON.parse(s.decryptString(Buffer.from(blob.slice(4), 'base64')));
    }
    if (blob.startsWith('mk1:')) {
      const raw = Buffer.from(blob.slice(4), 'base64');
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const ct = raw.subarray(28);
      const d = crypto.createDecipheriv('aes-256-gcm', machineKey(), iv);
      d.setAuthTag(tag);
      return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
    }
  } catch (_) { /* не расшифровалось */ }
  return null;
}

// Аккаунт без секретов — всё, что можно показывать интерфейсу
function publicAccount(acc) {
  if (!acc) return null;
  return { type: acc.type, username: acc.username, uuid: acc.uuid };
}

module.exports = { encrypt, decrypt, publicAccount, ssAvailable };
