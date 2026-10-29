// Окно разбора падения Minecraft. Данные приходят из main.js через preload (window.crash).
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtPlay(ms) {
  if (!ms) return '';
  const m = Math.round(ms / 60000);
  if (m < 1) return 'меньше минуты';
  if (m < 60) return `${m} мин`;
  return `${Math.floor(m / 60)} ч ${m % 60} мин`;
}

function fmtWhen(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function render(d) {
  const root = document.getElementById('root');
  if (!d) {
    root.innerHTML = '<div class="crash-scroll"><div class="crash-card">Нет данных о падении.</div></div>';
    return;
  }

  const sub = [d.instanceName, fmtWhen(d.when), d.playMs ? `играли ${fmtPlay(d.playMs)}` : ''].filter(Boolean).join(' · ');

  const issues = d.issues.length
    ? d.issues.map(i => `<div class="crash-issue"><b>${esc(i.title)}</b><p>${esc(i.explanation)}</p></div>`).join('')
    : `<div class="crash-issue"><p>Известная причина не найдена. Посмотрите технические данные ниже и отчёт о падении.</p></div>`;

  const fixes = d.fixes.length
    ? `<ol class="crash-fixes">${d.fixes.map(f => `<li>${esc(f)}</li>`).join('')}</ol>`
    : `<p class="hint">Конкретных советов нет. Попробуйте перезапустить игру и пришлите отчёт разработчикам.</p>`;

  const exitRow = d.exit.raw === null
    ? esc(d.exit.title)
    : `<span class="crash-code">${esc(d.exit.raw)}${d.exit.hex ? ` (${esc(d.exit.hex)})` : ''}</span> — ${esc(d.exit.title)}`;
  const exitText = d.exit.text ? `<p class="hint" style="margin:8px 0 0">${esc(d.exit.text)}</p>` : '';

  const p = d.parsed;
  const heap = p.heapUsedMiB != null ? `${p.heapUsedMiB} из ${p.heapMaxMiB} МБ` : 'нет данных';
  // У Minecraft на Rust нет Java: в технических данных показываем движок, а не JVM
  const isRust = !!d.engine;
  const runtimeRows = isRust
    ? `<span>Движок</span><span>${esc(d.engine)} (Rust)</span>`
    : `<span>Java</span><span>${esc(p.java) || '—'}</span>
       <span>Куча Java при падении</span><span>${esc(heap)}</span>`;

  root.innerHTML = `
    <header class="crash-head">
      <div class="crash-dot">!</div>
      <div>
        <h1>${isRust ? esc(d.engine) : 'Minecraft'} закрылся с ошибкой</h1>
        <div class="sub">${esc(sub)}</div>
      </div>
    </header>
    <main class="crash-scroll">
      <section class="crash-card">
        <h2>Что случилось</h2>
        <div class="crash-summary">${esc(d.summary)}</div>
        <div style="margin-top:14px">${issues}</div>
      </section>

      <section class="crash-card">
        <h2>Что делать</h2>
        ${fixes}
      </section>

      <section class="crash-card">
        <h2>Код выхода</h2>
        <div>${exitRow}</div>
        ${exitText}
      </section>

      <details class="crash-card crash-details">
        <summary>Технические данные</summary>
        <div class="crash-kv">
          <span>Описание отчёта</span><span>${esc(p.description) || '—'}</span>
          <span>Главная ошибка</span><span>${esc(p.top) || '—'}</span>
          <span>Вызвано</span><span>${esc(p.caused) || '—'}</span>
          <span>Подозреваемые моды</span><span>${esc(p.suspected) || '—'}</span>
          <span>Minecraft</span><span>${esc(p.minecraft) || '—'}</span>
          ${runtimeRows}
          <span>Файл отчёта</span><span>${esc(d.reportPath) || 'не найден'}</span>
          ${d.hsErrPath ? `<span>Файл hs_err</span><span>${esc(d.hsErrPath)}</span>` : ''}
        </div>
        <div class="hint" style="margin-top:14px">Отчёт о падении</div>
        <pre class="crash-pre">${esc(d.reportText || 'Отчёт о падении не создан. Ниже — последние строки лога.\n\n' + d.logText)}</pre>
        ${d.reportText ? `<div class="hint" style="margin-top:14px">Лог (последние строки)</div><pre class="crash-pre">${esc(d.logText)}</pre>` : ''}
      </details>
    </main>
    <footer class="crash-foot">
      <span class="hint" id="crash-status"></span>
      <button class="btn small" id="crash-copy">Копировать отчёт</button>
      <button class="btn small" id="crash-folder">Открыть папку отчётов</button>
      <button class="btn small" id="crash-log" ${d.logPath ? '' : 'disabled'}>Открыть лог</button>
      <button class="btn primary small" id="crash-close">Закрыть</button>
    </footer>`;

  const status = document.getElementById('crash-status');
  document.getElementById('crash-copy').onclick = async () => {
    const ok = await window.crash.copy();
    status.textContent = ok ? 'Скопировано в буфер обмена' : 'Нечего копировать';
  };
  document.getElementById('crash-folder').onclick = () => window.crash.openFolder();
  document.getElementById('crash-log').onclick = () => window.crash.openLog();
  document.getElementById('crash-close').onclick = () => window.crash.close();
}

window.crash.get().then(render).catch(e => {
  document.getElementById('root').innerHTML = `<div class="crash-scroll"><div class="crash-card">Не удалось загрузить данные: ${esc(e.message)}</div></div>`;
});
