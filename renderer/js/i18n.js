(function () {
// Система переводов интерфейса. Словари лежат в renderer/locales/*.js
// и загружаются как обычные сценарии (window.EMB_LOCALES). Ключи — это
// исходные русские строки UI: они же и являются дефолтным переводом.
const EMB = (window.EMB = window.EMB || {});
const LOCALES = window.EMB_LOCALES || {};

// BCP-47 теги для форматирования чисел/дат по языку.
const TAGS = {
  en: 'en-US', ru: 'ru-RU', uk: 'uk-UA', sr: 'sr-RS', pl: 'pl-PL', cs: 'cs-CZ',
  sk: 'sk-SK', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pt: 'pt-BR',
  ro: 'ro-RO', sv: 'sv-SE', hu: 'hu-HU',
};

EMB.localeTag = code => TAGS[code] || 'en-US';

// Названия языков для селектора языка интерфейса.
EMB.i18nNames = {
  en: 'English', ru: 'Русский', uk: 'Українська', sr: 'Српски', pl: 'Polski',
  cs: 'Čeština', sk: 'Slovenčina', de: 'Deutsch', fr: 'Français', es: 'Español',
  it: 'Italiano', pt: 'Português', ro: 'Română', sv: 'Svenska', hu: 'Magyar',
};

EMB.i18n = {
  names: EMB.i18nNames,
  lang: 'ru',
  list: Object.keys(LOCALES),
  shellReady: false,
  // render=false — загрузка языка до первого рендера (boot).
  setLang(l, render) {
    if (!LOCALES[l]) return;
    this.lang = l;
    document.documentElement.lang = l;
    if (render === false || !this.shellReady) return;
    EMB.renderShell();
    EMB.renderView();
    if (EMB.renderModal) EMB.renderModal();
  },
};

EMB.t = function t(key, vars) {
  const dict = LOCALES[EMB.i18n.lang] || {};
  let s = dict[key];
  if (s == null) s = (LOCALES.en || {})[key];
  if (s == null) s = key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
};

})();
