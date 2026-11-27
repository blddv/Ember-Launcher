(function () {
// Вкладка «Minecraft на Rust»: карточки платформ, движки и инструкции.
const EMB = (window.EMB = window.EMB || {});
const { t } = EMB;

EMB.views = EMB.views || {};
EMB.rustView = EMB.rustView || {};

EMB.rustView.card = function rustCard(r) {
  const p = EMB.RUST_PLATFORMS.find(x => x.id === r.id) || { label: r.label };
  const latest = r.latest;
  const engines = (r.engines || []).slice(0, 4);
  return `
  <div class="card">
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div>
        <h3 style="margin-bottom:2px">${EMB.icon('bolt')} ${EMB.esc(r.label)}</h3>
        <div class="hint">Minecraft ${EMB.esc(r.game)} · ${r.mods ? t('свой реестр модов') : t('без модов')}</div>
      </div>
      <span class="tag ${r.mods ? 'fab' : ''}">Rust</span>
    </div>
    <p class="page-sub" style="margin:10px 0 12px">${EMB.esc(r.note || '')}</p>
    ${r.error ? `<div class="note warn" style="margin-bottom:10px">${EMB.esc(r.error)}</div>` : ''}
    ${latest ? `<div class="hint" style="margin-bottom:8px">${t('Последняя версия: {tag} · {date}', { tag: EMB.esc(latest.tag), date: new Date(latest.publishedAt).toLocaleDateString(EMB.localeTag(EMB.i18n.lang)) })}${latest.prerelease ? ' · ' + t('тест') : ''}</div>` : ''}
    ${engines.length
      ? `<div style="margin-bottom:12px">${engines.map(e => `
          <div class="row" style="gap:8px;align-items:center;margin-bottom:6px">
            <span class="tag fab">${EMB.esc(e.tag)}</span>
            <span class="hint grow">${e.prepared ? t('данные игры готовы') : (r.id === 'horizon' ? t('данные игры не подготовлены — подготовятся при первом запуске') : t('готов к запуску'))}</span>
            <button class="btn small" data-act="rust-open-file" data-path="${EMB.esc(e.path)}">${EMB.icon('folder')} ${t('Папка')}</button>
          </div>`).join('')}</div>`
      : `<div class="hint" style="margin-bottom:12px">${t('Движок ещё не скачан: загрузится при первом запуске.')}</div>`}
    <div class="row">
      <button class="btn primary" data-act="rust-new" data-platform="${r.id}">${EMB.icon('plus')} ${t('Создать сборку')}</button>
      <button class="btn" data-act="rust-prepare" ${!latest ? 'disabled' : ''} data-platform="${r.id}" data-tag="${latest ? EMB.esc(latest.tag) : ''}">${EMB.icon('download')} ${t('Скачать движок')}</button>
      <button class="btn" data-act="rust-site" data-url="${EMB.esc(r.site)}">${EMB.icon('ext')} ${t('Сайт')}</button>
    </div>
  </div>`;
};

EMB.views.rust = function viewRust() {
  const list = EMB.state.rustInfo;
  const rows = list === null
    ? `<div class="empty" style="grid-column:1/-1">${t('Загружаю платформы…')}</div>`
    : !list.length
      ? `<div class="note warn" style="grid-column:1/-1">${EMB.esc(EMB.state.rustError || t('Не удалось получить данные GitHub'))}</div>`
      : list.map(EMB.rustView.card).join('');
  const horizon = (list || []).find(r => r.id === 'horizon');
  return `
    <h1 class="page-title">${t('Minecraft на Rust')}</h1>
    <p class="page-sub">${t('Отдельные движки: Minecraft Java Edition 26.3, переписанный на Rust. Это не загрузчик и не мод к Java-версии — своя папка, свой запуск и свои моды.')}</p>
    <div class="grid-2">${rows}</div>
    <div class="spacer"></div>
    <div class="card">
      <h3>${t('Платформы модов только для Minecraft на Rust')}</h3>
      <p class="page-sub" style="margin:6px 0 12px">${t('Java-моды (.jar) здесь не работают. У Horizon свой реестр проверенных модов: .hmod и нативные .hnmod, сборки .hpack и ресурспаки. Каждый файл сверяется по SHA-256, снятые с публикации не ставятся. Шейдерпаки (.hshader) кладутся в папку сборки shaderpacks и выбираются в игре.')}</p>
      <div class="row">
        <button class="btn primary" data-act="rust-registry">${EMB.icon('puzzle')} ${t('Реестр Horizon')}</button>
        <button class="btn" data-act="rust-new" data-platform="horizon">${EMB.icon('plus')} ${t('Сборка Horizon')}</button>
      </div>
      <div class="hint" style="margin-top:12px">${t('Второй источник — «Rust: GitHub» в разделе «Моды и сборки»: .hmod из релизов GitHub, которых ещё нет в реестре. Такие файлы не проверены.')}</div>
    </div>
    <div class="spacer"></div>
    <div class="card">
      <h3>${t('Что нужно знать')}</h3>
      <ul class="hint" style="margin:8px 0 0;padding-left:18px;line-height:1.7">
        <li>${t('Нужна своя копия Minecraft Java Edition {game}: движок берёт из неё ресурсы и звуки.', { game: EMB.esc(horizon ? horizon.game : '26.3') })}</li>
        <li>${t('Horizon один раз готовит данные игры (JDK 25 лаунчер скачает сам), после этого игра запускается без Java.')}</li>
        <li>${t('Rustcraft — клиент вместо <span class="mono">java.exe</span>: запускается из сборки, но модов не поддерживает.')}</li>
        <li>${t('Аккаунт Ely.by для Rust-сборок не нужен. Worlds и настройки лежат в папке своей сборки.')}</li>
      </ul>
    </div>`;
};

EMB.rustView.loadPage = async function loadRustPage(fresh = false) {
  if (EMB.state.rustInfo && !fresh) return;
  try {
    EMB.state.rustInfo = await window.ember.rust.info();
    EMB.state.rustError = '';
  } catch (e) {
    EMB.state.rustInfo = EMB.state.rustInfo || [];
    EMB.state.rustError = e.message;
  }
  if (EMB.state.view === 'rust') EMB.renderView();
};

})();
