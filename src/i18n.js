// Перевод интерфейса main-процесса: меню трея, диалоги, сообщения об ошибках.
// Словари живут в renderer/locales/*.js — это UMD-файлы, которые работают
// и в браузере (рендерер) и в Node (main-процесс), поэтому перевод одинаков
// для обоих процессов. Ключи — исходные русские строки UI, т.к. это
// одновременно и дефолтный перевод.
const LANGS = ['en', 'ru', 'uk', 'sr', 'pl', 'cs', 'sk', 'de', 'fr', 'es', 'it', 'pt', 'ro', 'sv', 'hu'];

const LOCALES = {};
for (const lang of LANGS) {
  try {
    LOCALES[lang] = require(`../renderer/locales/${lang}.js`);
  } catch (_) {
    LOCALES[lang] = {};
  }
}

let lang = 'ru';

function setLang(next) {
  if (LOCALES[next]) lang = next;
}

function t(key, vars) {
  const dict = LOCALES[lang] || {};
  let s = dict[key];
  if (s == null) s = (LOCALES.en || {})[key];
  if (s == null) s = key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

module.exports = { t, setLang, lang: () => lang, langs: () => LANGS.slice() };
