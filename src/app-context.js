// Совместное состояние main-процесса: окно, запущенная игра, буфер лога.
// Все ipc-модули, окна и цикл запуска читают и меняют состояние через этот
// контекст — вместо перекрестных зависимостей между модулями.
const ctx = {
  win: null,            // основное окно лаунчера
  running: null,        // { instanceId, proc, startedAt }
  stopRequested: false, // игра остановлена кнопкой лаунчера, это не падение
  logBuffer: [],        // последние строки лога текущей сессии
  forceQuit: false,     // реальный выход по кнопке «Выход» из трея
  tray: null,           // иконка в трее: лаунчер можно скрыть, не убивая игру
};

function send(channel, payload) {
  const w = ctx.win;
  if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
}
const report = p => send('progress', p);

function pushLog(text) {
  ctx.logBuffer.push(...String(text).split(/\r?\n/));
  if (ctx.logBuffer.length > 800) ctx.logBuffer = ctx.logBuffer.slice(-400);
}

module.exports = { ctx, send, report, pushLog };
