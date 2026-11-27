(function () {
// Вкладка «Аккаунт»: мультиаккаунтинг, вход по коду Microsoft, Ely.by, оффлайн.
const EMB = (window.EMB = window.EMB || {});
const { t } = EMB;

EMB.views = EMB.views || {};

EMB.views.account = function viewAccount() {
  const a = EMB.state.account;
  const list = EMB.state.accounts || [];

  const accountCards = list.length
    ? `<div class="acc-list">
        ${list.map(acc => `
          <div class="acc-item ${acc.id === EMB.state.selectedAccountId ? 'active' : ''}">
            <button class="acc-pick" data-act="account-select" data-id="${EMB.esc(acc.id)}" title="${t('Сделать активным')}">
              <div class="big-avatar">${EMB.esc((acc.username || '?').charAt(0).toUpperCase())}</div>
              <div class="grow">
                <div style="font-size:16px;font-weight:900">${EMB.esc(acc.username)} ${acc.id === EMB.state.selectedAccountId ? `<span class="badge">${t('активный')}</span>` : ''}</div>
                <div class="hint">${EMB.accTypeHint(acc)}</div>
                <div class="hint mono" style="margin-top:3px;font-size:11px">${EMB.esc(acc.uuid || '')}</div>
              </div>
            </button>
            <div class="acc-actions">
              <button class="btn sm" data-act="account-skins" data-id="${EMB.esc(acc.id)}">${EMB.icon('skin')} ${t('Скин')}</button>
              ${acc.type === 'elyby' ? `<button class="btn sm" data-act="account-logout" data-id="${EMB.esc(acc.id)}">${EMB.icon('logout')} ${t('Выйти')}</button>` : ''}
              <button class="btn sm danger" data-act="account-remove" data-id="${EMB.esc(acc.id)}">${t('Удалить')}</button>
            </div>
          </div>`).join('')}
      </div>`
    : `<div class="hint" style="margin-bottom:14px">${t('Аккаунтов пока нет. Добавьте Microsoft (официальный аккаунт), Ely.by (скины и ник) или оффлайн-ник.')}</div>`;

  const msBody = EMB.state.ms
    ? `<div class="ms-code" style="margin-top:12px;padding:14px;border:1px solid var(--navy-600);border-radius:12px;background:rgba(0,120,212,.06)">
        <div class="hint">${t('Откройте microsoft.com/link на телефоне или компьютере и введите код:')}</div>
        <div style="font-size:26px;font-weight:900;letter-spacing:.15em;margin:10px 0;color:#8FCBFF">${EMB.esc(EMB.state.ms.userCode)}</div>
        <div class="row">
          <button class="btn primary" data-act="ms-open-link">${t('Открыть страницу')}</button>
          <button class="btn" data-act="ms-copy">${t('Копировать код')}</button>
          <button class="btn danger" data-act="ms-cancel">${t('Отмена')}</button>
        </div>
        <div class="hint" style="margin-top:10px">${t('Жду подтверждения в браузере…')}</div>
      </div>`
    : `<div class="hint" style="margin-top:12px">${t('Вход по коду: лаунчер покажет код, вы введете его на microsoft.com/link. Пароль в приложение вводить не нужно. Работают аккаунты Microsoft с купленной Minecraft (в том числе Game Pass).')}</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="ms-login">${t('Войти через Microsoft')}</button></div>`;

  return `
    <h1 class="page-title">${t('Аккаунт')}</h1>
    <p class="page-sub">${t('Мультиаккаунтинг: добавляйте несколько аккаунтов и переключайтесь между ними. Выбранный аккаунт используется при запуске Java-сборок. Токены зашифрованы на диске и не отдаются интерфейсу.')}</p>
    ${a ? `<div class="card" style="margin-bottom:18px">
        <div class="current-acc">
          <div class="big-avatar">${EMB.esc(a.username.charAt(0).toUpperCase())}</div>
          <div class="grow">
            <div style="font-size:18px;font-weight:900">${EMB.esc(a.username)}</div>
            <div class="hint">${EMB.accTypeHint(a)}</div>
            <div class="hint mono" style="margin-top:4px;font-size:11px">UUID ${EMB.esc(a.uuid)}</div>
          </div>
          <button class="btn primary" data-act="account-skins" data-id="${EMB.esc(a.id)}">${EMB.icon('skin')} ${t('Скин')}</button>
        </div>
      </div>` : ''}
    ${accountCards}
    <h2 class="section-title" style="margin-top:26px">${t('Добавить аккаунт')}</h2>
    <div class="acc-grid">
      <div class="card">
        <div class="acc-head"><div class="big-avatar" style="font-size:20px">M</div>
          <div><h3 style="margin:0">Microsoft</h3><div class="hint">${t('Официальный аккаунт Minecraft')}</div></div></div>
        ${msBody}
      </div>
      <div class="card">
        <div class="acc-head"><div class="big-avatar" style="font-size:20px">E</div>
          <div><h3 style="margin:0">Ely.by</h3><div class="hint">${t('Скины и ник Ely.by работают в игре')}</div></div></div>
        <div class="field"><label>${t('Логин или email')}</label><input class="input" id="ely-login" autocomplete="off"></div>
        <div class="field"><label>${t('Пароль')}</label><input class="input" id="ely-pass" type="password"></div>
        <div class="row">
          <button class="btn primary" data-act="ely-login">${t('Войти в Ely.by')}</button>
          <a class="hint" href="#" data-act="open-ely-reg">${t('Нет аккаунта? Регистрация')}</a>
        </div>
        <div class="hint" style="margin-top:12px">${t('Включена двухфакторная защита? Введите пароль и код через двоеточие: <b>пароль:код</b>.')}</div>
      </div>
      <div class="card">
        <div class="acc-head"><div class="big-avatar" style="font-size:20px">O</div>
          <div><h3 style="margin:0">${t('Оффлайн')}</h3><div class="hint">${t('Быстрый вход без пароля')}</div></div></div>
        <div class="field"><label>${t('Ник')}</label><input class="input" id="off-name" placeholder="Steve_01" maxlength="16"></div>
        <div class="row"><button class="btn primary" data-act="offline-login">${t('Играть оффлайн')}</button></div>
        <div class="hint" style="margin-top:12px">${t('Ник от 3 до 16 символов: латиница, цифры и «_». Скины в оффлайне не работают.')}</div>
      </div>
    </div>`;
};

})();
