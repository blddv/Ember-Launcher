(function () {
// Вкладка «Главная».
const EMB = (window.EMB = window.EMB || {});
const { t } = EMB;

EMB.views = EMB.views || {};
EMB.views.home = function viewHome() {
  const inst = EMB.selectedInst();
  const rust = EMB.isRust(inst);
  const ov = EMB.state.settings.orangeVisuals;
  const perf = EMB.state.settings.perf || { preset: 'standard' };
  let modChip;
  if (rust) {
    const label = (EMB.RUST_PLATFORMS.find(p => p.id === EMB.platformOf(inst)) || {}).label || 'Rust';
    modChip = `<span class="chip ok"><span class="dot"></span>${EMB.esc(label)} · Minecraft на Rust</span>`;
  } else if (!ov.enabled) modChip = `<span class="chip off"><span class="dot"></span>${t('Orange Visuals выключен')}</span>`;
  else if (EMB.state.mod && EMB.state.mod.active) modChip = `<span class="chip ok"><span class="dot"></span>${t('Orange Visuals активен')}</span>`;
  else if (EMB.state.mod && EMB.state.mod.reason) modChip = `<span class="chip off"><span class="dot"></span>${t('Orange Visuals: {reason}', { reason: EMB.esc(EMB.state.mod.reason) })}</span>`;
  else modChip = `<span class="chip"><span class="dot"></span>${t('Orange Visuals включится при запуске')}</span>`;

  const accChip = rust
    ? `<span class="chip ok"><span class="dot"></span>${t('Аккаунт Java не нужен')}</span>`
    : EMB.state.account
      ? `<span class="chip ok"><span class="dot"></span>${EMB.esc(EMB.state.account.username)} · ${EMB.accTypeLabel(EMB.state.account.type)}</span>`
      : `<span class="chip off"><span class="dot"></span>${t('Аккаунт не выбран')}</span>`;

  const perfChip = `<span class="chip ${perf.preset === 'standard' ? '' : 'ok'}"><span class="dot"></span>${t('Пресет: {label}', { label: EMB.esc(EMB.PERF_LABEL[perf.preset] || perf.preset) })}</span>`;

  const playBtn = EMB.state.running
    ? `<button class="play stop" data-act="stop">${t('ОСТАНОВИТЬ')}</button>`
    : `<button class="play" data-act="play" ${EMB.state.preparing ? 'disabled' : ''}>${EMB.state.preparing ? t('ПОДГОТОВКА…') : t('ИГРАТЬ')}</button>`;

  const totalMs = EMB.state.instances.reduce((s, i) => s + (i.playMs || 0), 0);
  const warn = inst && rust
    ? `<div class="note" style="margin-top:16px">${t('{label}: движок на Rust. Моды — из реестра Horizon (.hmod), Java-моды не подходят. Нужна ваша копия Minecraft {version}.', { label: EMB.esc((EMB.RUST_PLATFORMS.find(p => p.id === EMB.platformOf(inst)) || {}).label || 'Rust'), version: EMB.esc(inst.version) })}</div>`
    : inst && !EMB.hasLoader(inst)
      ? `<div class="note warn" style="margin-top:16px">${t('Сборка «{name}» без загрузчика модов. Моды не запустятся — создайте сборку с Fabric, Quilt, Forge или NeoForge.', { name: EMB.esc(inst.name) })}</div>` : '';
  const cover = inst && inst.coverUrl ? `<img class="hero-cover" src="${EMB.esc(inst.coverUrl)}" alt="">` : '';

  return `
    <section class="hero ${cover ? 'has-cover' : ''}">
      ${cover}
      <div class="kicker">${EMB.state.running ? t('ИГРА ЗАПУЩЕНА') : t('ГОТОВ К ИГРЕ')}</div>
      <h1>${inst ? EMB.esc(inst.name) : t('Создайте первую сборку')}</h1>
      <p>${inst ? `Minecraft ${EMB.esc(inst.version)} · ${EMB.esc(EMB.loaderName(inst))}` : t('Во вкладке «Сборки» создайте версию Minecraft или установите сборку из «Моды и сборки».')}</p>
      <div class="chips">${accChip}${modChip}${perfChip}</div>
      ${warn}
      <div id="home-progress">${EMB.progressHTML(EMB.state.progress)}</div>
      <div class="play-row">
        ${playBtn}
        <select class="input" id="home-inst" style="min-width:260px;height:52px" ${EMB.state.running ? 'disabled' : ''}>
          ${EMB.state.instances.map(i => `<option value="${EMB.esc(i.id)}" ${i.id === EMB.state.selected ? 'selected' : ''}>${EMB.esc(i.name)} — ${EMB.esc(i.version)} · ${EMB.esc(EMB.loaderName(i))}</option>`).join('') || `<option>${t('Нет сборок')}</option>`}
        </select>
        <button class="btn log-toggle" data-act="toggle-log">${EMB.icon('terminal')} ${EMB.state.showLog ? t('Скрыть лог') : t('Показать лог')}</button>
      </div>
      ${EMB.state.showLog ? '<div class="console" id="console"></div>' : ''}
    </section>
    <div class="stat-grid">
      <div class="stat"><b>${EMB.state.instances.length}</b><span>${t('сборок')}</span></div>
      <div class="stat"><b>${EMB.fmtPlay(totalMs)}</b><span>${t('суммарно в игре')}</span></div>
      <div class="stat"><b>${t('{v} ГБ', { v: (EMB.state.settings.ram / 1024).toFixed(1) })}</b><span>${t('памяти для Minecraft')}</span></div>
    </div>
    <div class="spacer"></div>
    <div class="grid-2">
      <div class="card">
        <h3>${t('Быстрые действия')}</h3>
        <div class="row">
          <button class="btn" data-nav-go="instances">${EMB.icon('plus')} ${t('Новая сборка')}</button>
          <button class="btn" data-nav-go="mods">${EMB.icon('puzzle')} ${t('Найти мод')}</button>
          <button class="btn" data-nav-go="screens">${EMB.icon('image')} ${t('Скриншоты')}</button>
          <button class="btn" data-act="import-zip">${EMB.icon('upload')} ${t('Импорт сборки')}</button>
        </div>
      </div>
      <div class="card">
        <h3>${t('Быстрый старт')}</h3>
        <div class="hint">${t('1) «Аккаунт» — войдите через Microsoft или Ely.by, либо играйте оффлайн. 2) «Сборки» — создайте сборку с нужным загрузчиком и обложкой. 3) «Настройки» — выберите пресет «Очень оптимизировано» для слабого ПК. Minecraft на Rust — отдельная вкладка: там движки Horizon и Rustcraft и их моды. Ctrl+K открывает командную палитру. В игре клавиша меню (по умолчанию R Shift) открывает меню Orange Visuals.')}</div>
      </div>
    </div>`;
};

})();
