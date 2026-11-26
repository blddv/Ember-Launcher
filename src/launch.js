// Цикл запуска Minecraft: проверка аккаунта, подготовка, старт, завершение.
const { ipcMain } = require('electron');
const store = require('./store');
const auth = require('./auth');
const minecraft = require('./minecraft');
const instances = require('./instances');
const mods = require('./mods');
const rust = require('./rust');
const perf = require('./perf');
const http = require('./http');
const i18n = require('./i18n');
const { ctx, send, report, pushLog } = require('./app-context');
const { refreshTray } = require('./window');
const { handleUnexpectedExit } = require('./crash-window');

async function launchFlow(instanceId) {
  if (ctx.running) throw new Error(i18n.t('Minecraft уже запущен'));
  ctx.stopRequested = false;
  ctx.logBuffer = [];
  let inst = instances.find(instanceId);
  const platform = instances.platformOf(inst);
  const rustInstance = platform !== 'java';
  // Поддерживаем несколько аккаунтов: стартуем с выбранным в настройках/вкладке «Аккаунт»
  let account = store.activeAccount();
  // Java Edition без аккаунта не запустится. Minecraft на Rust обходится без Ely.by:
  // Horizon входит сам, Rustcraft получает оффлайн-профиль.
  if (!rustInstance && !account) throw new Error(i18n.t('Сначала выберите аккаунт во вкладке «Аккаунт»'));
  ctx.running = { instanceId, proc: null, startedAt: 0 };
  refreshTray();
  send('game:state', { running: true, instanceId, platform });

  // Игра закрылась: считаем время, сообщаем интерфейсу и при падении открываем разбор
  const finish = code => {
    const startedAt = ctx.running && ctx.running.startedAt ? ctx.running.startedAt : 0;
    const ms = startedAt ? Date.now() - startedAt : 0;
    if (ms > 0) instances.addPlaytime(instanceId, ms);
    const wasStopped = ctx.stopRequested;
    ctx.stopRequested = false;
    ctx.running = null;
    refreshTray();
    send('game:state', { running: false, instanceId, code, playMs: ms, platform });
    if (!wasStopped) {
      handleUnexpectedExit({ instanceId, code, startedAt, playMs: ms, logLines: ctx.logBuffer.slice() })
        .catch(e => console.error('Разбор падения:', e));
    }
  };

  try {
    if (rustInstance) {
      const s = store.get();
      send('mod:status', {
        active: false,
        reason: platform === 'horizon' ? i18n.t('моды ставятся из реестра Horizon') : i18n.t('Rustcraft без модов'),
      });
      report({ stage: platform === 'horizon' ? i18n.t('Horizon') : i18n.t('Rustcraft'), text: i18n.t('Подготовка Minecraft {version}…', { version: inst.version }) });
      let proc;
      if (platform === 'rustcraft') {
        // Rustcraft работает как замена java.exe: те же аргументы игры, другой исполняемый файл
        const acc = account || auth.offlineAccount((store.get('rustPlayerName') || 'Player'));
        const bin = await rust.javaExecBin(inst, report, t => { pushLog(t); send('log', t); });
        proc = await minecraft.launch({
          instance: inst,
          account: acc,
          report,
          bin,
          ram: s.ram || 4096,
          width: s.width || 1280,
          height: s.height || 720,
          fullscreen: !!s.fullscreen,
          onLog: t => { pushLog(t); send('log', t); },
          onExit: finish,
        });
      } else {
        proc = await rust.launch({
          instance: inst,
          report,
          onLog: t => { pushLog(t); send('log', t); },
          onExit: finish,
        });
      }
      ctx.running.proc = proc;
      ctx.running.startedAt = Date.now();
      if (proc.rustEngine && proc.rustEngine.tag && proc.rustEngine.tag !== inst.loaderVersion) {
        instances.update(instanceId, { loaderVersion: proc.rustEngine.tag });
      }
      if (s.closeOnLaunch && ctx.win) setTimeout(() => ctx.win && ctx.win.minimize(), 1500);
      return { ok: true, showLog: !!s.showLogOnLaunch };
    }

    account = await auth.ensureAccount(account);
    const s = store.get();

    const modState = await mods.syncOrangeVisuals(inst, report).catch(e => ({ active: false, reason: e.message }));
    send('mod:status', { active: !!modState.active, reason: modState.reason || '' });

    // Пресет производительности: options.txt, моды-оптимизаторы, JVM и память
    const tuning = await perf.prepareLaunch(inst, s.perf.preset, s.ram || 4096, s.perf.installMods, report);

    const extraJvm = [];
    if (account.type === 'elyby') {
      const jar = await auth.ensureAuthlibInjector();
      extraJvm.push(`-javaagent:${jar}=ely.by`);
    }

    const proc = await minecraft.launch({
      instance: inst,
      account,
      report,
      extraJvm,
      jvmArgs: [s.jvmArgs || '', ...tuning.jvm].join(' ').trim(),
      ram: tuning.ram,
      gc: tuning.gc || s.gcPreset || 'g1',
      width: s.width || 1280,
      height: s.height || 720,
      fullscreen: !!s.fullscreen,
      onLog: t => { pushLog(t); send('log', t); },
      onExit: finish,
    });
    ctx.running.proc = proc;
    ctx.running.startedAt = Date.now();
    if (proc.loaderVersion && proc.loaderVersion !== inst.loaderVersion) {
      instances.update(instanceId, { loaderVersion: proc.loaderVersion });
    }

    // Сворачиваем, а не закрываем: закрытие окна завершает приложение вместе с игрой
    if (s.closeOnLaunch && ctx.win) setTimeout(() => ctx.win && ctx.win.minimize(), 1500);
    return { ok: true, showLog: !!s.showLogOnLaunch };
  } catch (e) {
    ctx.running = null;
    // Любая ошибка (в т.ч. сырая сокетная AggregateError) показывается понятным текстом
    const message = http.humanizeError(e);
    send('game:state', { running: false, instanceId, error: message });
    throw new Error(message);
  }
}

// Запуск и остановка игры из интерфейса.
function registerLaunchIpc() {
  ipcMain.handle('game:launch', (_e, instanceId) => launchFlow(instanceId));
  ipcMain.handle('game:stop', () => {
    ctx.stopRequested = true;
    if (ctx.running && ctx.running.proc) ctx.running.proc.kill();
    return true;
  });
  ipcMain.handle('game:status', () => ({ running: !!ctx.running, instanceId: ctx.running && ctx.running.instanceId }));
  ipcMain.handle('game:hide', () => ctx.win && ctx.win.hide());
}

module.exports = { launchFlow, registerLaunchIpc };
