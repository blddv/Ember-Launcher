// Окно разбора падения Minecraft. Данные приходят из main.js через preload
// (window.crash). Язык передаётся в данных (crashInfo.language).
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LOCALES = window.EMB_LOCALES || {};
const TAGS = {
  en: 'en-US', ru: 'ru-RU', uk: 'uk-UA', sr: 'sr-RS', pl: 'pl-PL', cs: 'cs-CZ',
  sk: 'sk-SK', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pt: 'pt-BR',
  ro: 'ro-RO', sv: 'sv-SE', hu: 'hu-HU',
};
let lang = 'ru';

function t(key, vars) {
  const dict = LOCALES[lang] || {};
  let s = dict[key];
  if (s == null) s = (LOCALES.en || {})[key];
  if (s == null) s = key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

function fmtPlay(ms) {
  if (!ms) return '';
  const m = Math.round(ms / 60000);
  if (m < 1) return t('меньше минуты');
  if (m < 60) return t('{m} мин', { m });
  return t('{h} ч {m} мин', { h: Math.floor(m / 60), m: m % 60 });
}

function fmtWhen(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString(TAGS[lang] || 'ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function render(d) {
  const root = document.getElementById('root');
  if (d && d.language && LOCALES[d.language]) lang = d.language;
  document.documentElement.lang = lang;
  if (!d) {
    root.innerHTML = `<div class="crash-scroll"><div class="crash-card">${t('Нет данных о падении.')}</div></div>`;
    return;
  }

  const sub = [d.instanceName, fmtWhen(d.when), d.playMs ? t('играли {p}', { p: fmtPlay(d.playMs) }) : ''].filter(Boolean).join(' · ');

  const issues = d.issues.length
    ? d.issues.map(i => `<div class="crash-issue"><b>${esc(i.title)}</b><p>${esc(i.explanation)}</p></div>`).join('')
    : `<div class="crash-issue"><p>${t('Известная причина не найдена. Посмотрите технические данные ниже и отчёт о падении.')}</p></div>`;

  const fixes = d.fixes.length
    ? `<ol class="crash-fixes">${d.fixes.map(f => `<li>${esc(f)}</li>`).join('')}</ol>`
    : `<p class="hint">${t('Конкретных советов нет. Попробуйте перезапустить игру и пришлите отчёт разработчикам.')}</p>`;

  const exitRow = d.exit.raw === null
    ? esc(d.exit.title)
    : `<span class="crash-code">${esc(d.exit.raw)}${d.exit.hex ? ` (${esc(d.exit.hex)})` : ''}</span> — ${esc(d.exit.title)}`;
  const exitText = d.exit.text ? `<p class="hint" style="margin:8px 0 0">${esc(d.exit.text)}</p>` : '';

  const p = d.parsed;
  const heap = p.heapUsedMiB != null ? `${p.heapUsedMiB} из ${p.heapMaxMiB} МБ` : t('нет данных');
  // У Minecraft на Rust нет Java: в технических данных показываем движок, а не JVM
  const isRust = !!d.engine;
  const runtimeRows = isRust
    ? `<span>${t('Движок')}</span><span>${esc(d.engine)} (Rust)</span>`
    : `<span>Java</span><span>${esc(p.java) || '—'}</span>
       <span>${t('Куча Java при падении')}</span><span>${esc(heap)}</span>`;

  root.innerHTML = `
    <header class="crash-head">
      <div class="crash-dot">!</div>
      <div>
        <h1>${isRust ? esc(d.engine) : t('Minecraft')} ${t('закрылся с ошибкой')}</h1>
        <div class="sub">${esc(sub)}</div>
      </div>
    </header>
    <main class="crash-scroll">
      <section class="crash-card">
        <h2>${t('Что случилось')}</h2>
        <div class="crash-summary">${esc(d.summary)}</div>
        <div style="margin-top:14px">${issues}</div>
      </section>

      <section class="crash-card">
        <h2>${t('Что делать')}</h2>
        ${fixes}
      </section>

      <section class="crash-card">
        <h2>${t('Код выхода')}</h2>
        <div>${exitRow}</div>
        ${exitText}
      </section>

      <details class="crash-card crash-details">
        <summary>${t('Технические данные')}</summary>
        <div class="crash-kv">
          <span>${t('Описание отчёта')}</span><span>${esc(p.description) || '—'}</span>
          <span>${t('Главная ошибка')}</span><span>${esc(p.top) || '—'}</span>
          <span>${t('Вызвано')}</span><span>${esc(p.caused) || '—'}</span>
          <span>${t('Подозреваемые моды')}</span><span>${esc(p.suspected) || '—'}</span>
          <span>Minecraft</span><span>${esc(p.minecraft) || '—'}</span>
          ${runtimeRows}
          <span>${t('Файл отчёта')}</span><span>${esc(d.reportPath) || t('не найден')}</span>
          ${d.hsErrPath ? `<span>${t('Файл hs_err')}</span><span>${esc(d.hsErrPath)}</span>` : ''}
        </div>
        <div class="hint" style="margin-top:14px">${t('Отчёт о падении')}</div>
        <pre class="crash-pre">${esc(d.reportText || t('Отчёт о падении не создан. Ниже — последние строки лога.\n\n') + d.logText)}</pre>
        ${d.reportText ? `<div class="hint" style="margin-top:14px">${t('Лог (последние строки)')}</div><pre class="crash-pre">${esc(d.logText)}</pre>` : ''}
      </details>
    </main>
    <footer class="crash-foot">
      <span class="hint" id="crash-status"></span>
      <button class="btn small" id="crash-copy">${t('Копировать отчёт')}</button>
      <button class="btn small" id="crash-folder">${t('Открыть папку отчётов')}</button>
      <button class="btn small" id="crash-log" ${d.logPath ? '' : 'disabled'}>${t('Открыть лог')}</button>
      <button class="btn primary small" id="crash-close">${t('Закрыть')}</button>
    </footer>`;

  const status = document.getElementById('crash-status');
  document.getElementById('crash-copy').onclick = async () => {
    const ok = await window.crash.copy();
    status.textContent = ok ? t('Скопировано в буфер обмена') : t('Нечего копировать');
  };
  document.getElementById('crash-folder').onclick = () => window.crash.openFolder();
  document.getElementById('crash-log').onclick = () => window.crash.openLog();
  document.getElementById('crash-close').onclick = () => window.crash.close();
}

window.crash.get().then(render).catch(e => {
  document.getElementById('root').innerHTML = `<div class="crash-scroll"><div class="crash-card">${t('Не удалось загрузить данные: {msg}', { msg: esc(e.message) })}</div></div>`;
});
