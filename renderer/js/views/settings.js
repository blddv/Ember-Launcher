(function () {
// Вкладка «Настройки»: производительность, окно, источники, обновления,
// Orange Visuals, папка данных и выбор языка интерфейса.
const EMB = (window.EMB = window.EMB || {});
const { t } = EMB;

EMB.views = EMB.views || {};

EMB.views.settings = function viewSettings() {
  const s = EMB.state.settings;
  const ov = s.orangeVisuals;
  const perf = s.perf || { preset: 'standard', installMods: true };
  const sw = (id, label, desc, checked) => `
    <div class="switch">
      <div class="lbl"><b>${label}</b><span>${desc}</span></div>
      <label class="toggle"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span class="track"></span></label>
    </div>`;
  const gcOpts = [['g1', t('G1 (рекомендуется)')], ['zgc', t('ZGC (меньше пауз, Java 17+)')], ['parallel', t('Parallel (быстрее, но с паузами)')], ['serial', t('SerialGC (только для маленькой памяти)')], ['none', t('Стандартный JVM')]];
  const resOpts = [[854, 480], [1280, 720], [1600, 900], [1920, 1080], [2560, 1440]];
  const presetCards = ['standard', 'optimized', 'potato'].map(p => `
      <label class="preset ${p === 'potato' ? 'potato' : ''}">
        <input type="radio" name="preset" value="${p}" ${perf.preset === p ? 'checked' : ''}>
        <b>${EMB.esc(EMB.PERF_LABEL[p])}</b>
        <span>${EMB.esc(EMB.PERF_DESC[p])}</span>
      </label>`).join('');

  const u = EMB.state.update;
  const updateCard = `
    <div class="card span-2" id="update-card">
      <h3>${t('Обновления')} <small>${t('проверка релизов на GitHub')}</small></h3>
      <div class="hint" style="margin-bottom:10px">${t('Лаунчер проверяет релизы {repo} и ставит новую версию: Windows — тихо, Linux — замена AppImage, иначе открыть установщик.', { repo: EMB.esc(EMB.state.info && EMB.state.info.releaseRepo || 'blddv/Ember-Launcher') })}</div>
      ${u.error ? `<div class="note warn">${EMB.esc(u.error)}</div>` : ''}
      <div class="row" style="align-items:center">
        <div class="grow">
          <b>${u.current || (EMB.state.info ? EMB.state.info.version : '')}</b>
          ${u.available ? `<span class="chip ok" style="margin-left:8px"><span class="dot"></span>${t('Доступна {v}', { v: EMB.esc(u.latest) })}</span>`
            : u.latest ? `<span class="chip" style="margin-left:8px"><span class="dot"></span>${t('Актуальная {v}', { v: EMB.esc(u.latest) })}</span>`
            : `<span class="hint" style="margin-left:8px">${t('проверка не выполнена')}</span>`}
        </div>
        ${u.checking ? `<span class="hint">${t('Проверяю…')}</span>`
          : u.downloading
            ? `<span class="hint">${t('Загрузка обновления…')}</span>`
            : `<button class="btn" data-act="update-check">${EMB.icon('refresh')} ${t('Проверить обновления')}</button>`}
      </div>
      ${u.downloading ? `<div class="progress" style="margin-top:14px"><div class="meta"><span>${t('Загрузка')}</span><b>${u.progress && u.progress.total ? Math.min(100, Math.round((u.progress.received / u.progress.total) * 100)) : ''}%</b></div><div class="bar"><i style="width:${u.progress && u.progress.total ? Math.min(100, Math.round((u.progress.received / u.progress.total) * 100)) : 30}%"></i></div></div>` : ''}
      ${u.available ? `<div class="row" style="margin-top:12px">
        ${u.downloaded
          ? `<button class="btn primary" data-act="update-install">${EMB.icon('check')} ${t('Установить {v} и перезапустить', { v: EMB.esc(u.latest) })}</button>
             <button class="btn" data-act="update-open">${EMB.icon('folder')} ${t('Открыть файл')}</button>`
          : `<button class="btn primary" data-act="update-download" ${u.downloading ? 'disabled' : ''}>${EMB.icon('download')} ${t('Скачать {v}', { v: EMB.esc(u.latest) })}</button>`}
        ${u.url ? `<a href="#" data-act="update-release">${t('Открыть релиз на GitHub')}</a>` : ''}
      </div>` : ''}
      ${!u.available && u.latest ? `<div class="hint" style="margin-top:8px">${t('Загрузка и установка: лаунчер ставит обновление и перезапускается автоматически.')}</div>` : ''}
    </div>`;

  return `
    <h1 class="page-title">${t('Настройки')}</h1>
    <p class="page-sub">${t('Производительность, окно, источники модов, Orange Visuals и папка данных.')}</p>
    <div class="set-grid">
      <div class="card span-2">
        <h3>${t('Производительность')} <small>${t('пресеты для слабых ПК')}</small></h3>
        <div class="preset-grid">${presetCards}</div>
        <div class="switch" style="margin-top:14px">
          <div class="lbl"><b>${t('Ставить моды-оптимизаторы')}</b><span>${t('Sodium, Lithium, FerriteCore, EntityCulling и другие под загрузчик сборки. Моды, которых нет для её версии Minecraft, пропускаются. Ставятся один раз и скрываются из списка модов.')}</span></div>
          <label class="toggle"><input type="checkbox" id="perf-mods" ${perf.installMods ? 'checked' : ''}><span class="track"></span></label>
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn" data-act="perf-apply">${EMB.icon('check')} ${t('Применить к выбранной сборке сейчас')}</button>
          <button class="btn" data-act="perf-install">${EMB.icon('download')} ${t('Поставить пакет модов в выбранную сборку')}</button>
        </div>
        <div class="hint" style="margin-top:10px">${t('Пресет применяется при каждом запуске: видеонастройки в options.txt и JVM-флаги. Объём памяти задаёт ползунок выше. Кнопки работают с выбранной сборкой и выбранным пресетом (сохранять настройки не нужно).')}</div>
      </div>
      <div class="card">
        <h3>${t('Память и Java')}</h3>
        <div class="field"><label>${t('Память для Minecraft')}</label>
          <div class="range-row"><input type="range" id="ram" min="2048" max="16384" step="512" value="${s.ram}"><b id="ram-val">${t('{v} ГБ', { v: (s.ram / 1024).toFixed(1) })}</b></div>
        </div>
        <div class="field"><label>${t('Сборщик мусора')}</label>
          <select class="input" id="gc">${gcOpts.map(([v, l]) => `<option value="${v}" ${s.gcPreset === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        <div class="field"><label>${t('Дополнительные аргументы JVM')}</label>
          <input class="input" id="jvm" placeholder="-Dfoo=bar" value="${EMB.esc(s.jvmArgs)}"></div>
        <div class="field"><label>${t('Путь к Java (необязательно)')}</label>
          <div class="row" style="flex-wrap:nowrap">
            <input class="input grow" id="javapath" placeholder="${t('Пусто — лаунчер сам скачает нужную Java')}" value="${EMB.esc(s.javaPath)}">
            <button class="btn" data-act="pick-java">${t('Выбрать…')}</button>
          </div>
          <div class="hint">${t('Java 21 или 25 (нужная версия выбирается автоматически), 17 или 8 для старых версий. Можно указать свою.')}</div>
        </div>
      </div>
      <div class="card">
        <h3>${t('Окно игры и лаунчер')}</h3>
        <div class="field"><label>${t('Разрешение окна')}</label>
          <select class="input" id="res">${resOpts.map(([w, h]) => `<option value="${w}x${h}" ${s.width === w && s.height === h ? 'selected' : ''}>${w} × ${h}</option>`).join('')}</select>
        </div>
        ${sw('fullscreen', t('Полноэкранный режим'), t('Minecraft запускается на весь экран'), s.fullscreen)}
        ${sw('closeOnLaunch', t('Сворачивать лаунчер после запуска'), t('Окно лаунчера сворачивается, когда игра стартовала'), s.closeOnLaunch)}
        ${sw('showLogOnLaunch', t('Показывать лог при запуске'), t('Лог игры открывается на главной сразу после старта'), s.showLogOnLaunch)}
        ${sw('animations', t('Анимации интерфейса'), t('Выключите, если лаунчер тормозит на слабом ПК'), s.animations)}
        <div class="field"><label>${t('Ник в Minecraft на Rust')}</label>
          <input class="input" id="rustname" placeholder="${t('Игрок')}" maxlength="16" value="${EMB.esc(s.rustPlayerName || '')}">
          <div class="hint">${t('Подставляется при запуске Horizon и Rustcraft. Пусто — ник придумает сам движок. На Java-сборки не влияет.')}</div>
        </div>
      </div>
      <div class="card">
        <h3>${t('Источники модов')}</h3>
        <div class="field"><label>${t('GitHub токен (необязательно)')}</label>
          <input class="input" id="ghtoken" type="password" placeholder="ghp_… (без него лимит 60 запросов в час)" value="${EMB.esc(s.githubToken || '')}">
          <div class="hint">${t('Нужен только если поиск на GitHub перестал работать из-за лимита.')}</div>
        </div>
        <div class="field"><label>${t('CurseForge API Key')}</label>
          <input class="input" id="cfkey" type="password" placeholder="${t('Вставьте ключ')}" value="${EMB.esc(s.curseforgeKey)}">
          <div class="hint">${t('Бесплатный ключ: ')}<a href="#" data-act="open-cf-keys">console.curseforge.com</a>. ${t('Modrinth, Hangar и Smithed работают без ключа.')}</div>
        </div>
        <div class="field"><label>${t('Язык интерфейса')}</label>
          <select class="input" id="lang">
            ${EMB.i18n.list.map(l => `<option value="${l}" ${EMB.i18n.lang === l ? 'selected' : ''}>${EMB.esc(EMB.i18n.names[l] || l)}</option>`).join('')}
          </select>
          <div class="hint">${t('Выбор языка интерфейса лаунчера. Изменения применяются сразу.')}</div>
        </div>
      </div>
      ${updateCard}
      <div class="card span-2">
        <h3>${t('Orange Visuals')} <small>${t('собственный мод EMBER · Minecraft 1.21.1 Fabric')}</small></h3>
        <div class="hint" style="margin-bottom:10px">${t('Мод работает внутри игры: HUD, плавный зум на C, визуальные фильтры и музыка из выбранной папки. Меню открывается коротким нажатием клавиши меню (по умолчанию R Shift). Миникарта, полная карта (N) и метки настраиваются в этом же меню. Здесь задаются стартовые значения; в уже созданной сборке визуалы меняются в игре и сохраняются.')}</div>
        <div class="set-grid">
          <div>
            ${sw('ov-enabled', t('Включить мод'), t('Ставится и обновляется при запуске. Выключено — удаляется из сборок'), ov.enabled)}
            ${sw('ov-fps', t('Счётчик FPS'), t('FPS в углу экрана (угол меняется в меню мода)'), ov.hudFps)}
            ${sw('ov-coords', t('Координаты'), t('XYZ текущего положения'), ov.hudCoords)}
            ${sw('ov-np', t('Сейчас играет поверх экрана'), t('Название трека и эквалайзер вверху экрана'), ov.hudNowPlaying)}
          </div>
          <div>
            ${sw('ov-zoom', t('Плавный зум на {key}', { key: EMB.glfwName(ov.zoomKey) }), t('Удерживайте клавишу зума — картинка приближается'), ov.zoom)}
            <div class="field" style="margin-top:14px"><label>${t('Сила зума')}</label>
              <div class="range-row"><input type="range" id="ov-zoom-factor" min="5" max="90" step="5" value="${Math.round(ov.zoomFactor * 100)}"><b id="ov-zoom-val">${Math.round(ov.zoomFactor * 100)}%</b></div>
              <div class="hint">${t('Меньше — сильнее приближение.')}</div>
            </div>
            <div class="field" style="margin-top:14px"><label>${t('Клавиши Orange Visuals')}</label>
              <div class="row" style="flex-wrap:wrap;gap:8px">
                <button class="btn small" id="ov-menukey" data-code="${ov.menuKey}" data-act="ov-key" data-field="menuKey">${t('Меню: {name}', { name: EMB.esc(EMB.state.keyCapture === 'menuKey' ? t('нажмите клавишу…') : EMB.glfwName(ov.menuKey)) })}</button>
                <button class="btn small" id="ov-zoomkey" data-code="${ov.zoomKey}" data-act="ov-key" data-field="zoomKey">${t('Зум: {name}', { name: EMB.esc(EMB.state.keyCapture === 'zoomKey' ? t('нажмите клавишу…') : EMB.glfwName(ov.zoomKey)) })}</button>
              </div>
              <div class="hint">${t('Нажмите кнопку, затем нужную клавишу. Esc — отмена. Короткое нажатие клавиши меню открывает меню в игре.')}</div>
            </div>
            ${sw('ov-music', t('Музыка в игре'), t('Мод проигрывает треки из папки ниже. Громкость — в меню Orange Visuals'), ov.music)}
            <div class="field" style="margin-top:14px"><label>${t('Папка с музыкой')}</label>
              <div class="row" style="flex-wrap:nowrap">
                <input class="input grow mono" value="${EMB.esc(ov.musicFolder || EMB.state.musicFolder || '')}" readonly>
                <button class="btn" data-act="pick-music">${t('Выбрать…')}</button>
              </div>
              <div class="hint">${t('mp3, ogg, wav. Вложенные папки тоже читаются (до трёх уровней).')}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="card span-2">
        <h3>${t('Папка данных')} <small>${t('сборки, моды, миры, Java и библиотеки')}</small></h3>
        <div class="hint" style="margin-bottom:10px">${EMB.state.info && EMB.state.info.isCustom ? t('Выбрана своя папка.') : t('Стандартная папка лаунчера.')} ${t('Изменение перенесёт данные и перезапустит лаунчер.')}</div>
        <div class="row">
          <div class="grow hint mono" style="word-break:break-all">${EMB.esc(EMB.state.info ? EMB.state.info.base : '')}</div>
          <button class="btn" data-act="open-data">${EMB.icon('folder')} ${t('Открыть')}</button>
          <button class="btn" data-act="change-data">${t('Изменить папку…')}</button>
          ${EMB.state.info && EMB.state.info.isCustom ? `<button class="btn" data-act="reset-data">${t('По умолчанию')}</button>` : ''}
        </div>
      </div>
      <div class="card span-2">
        <div class="row" style="justify-content:flex-end">
          <button class="btn primary" data-act="save-settings">${EMB.icon('check')} ${t('Сохранить настройки')}</button>
        </div>
      </div>
    </div>`;
};

EMB.settingsView = EMB.settingsView || {};
EMB.settingsView.setOvKey = async function setOvKey(field, code) {
  EMB.state.keyCapture = null;
  EMB.state.settings.orangeVisuals[field] = code;
  try {
    await window.ember.settings.save({ orangeVisuals: { [field]: code } });
    EMB.toast(EMB.t('Клавиша назначена: {name}. Применится при следующем запуске игры', { name: EMB.glfwName(code) }), 'ok');
  } catch (e) {
    EMB.toast(e.message, 'err');
  }
  EMB.renderView();
};

})();
