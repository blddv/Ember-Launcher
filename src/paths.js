const fs = require('fs');
const path = require('path');
const os = require('os');

function electronApp() {
  try {
    const e = require('electron');
    if (e && e.app) return e.app;
  } catch (_) { /* запуск вне Electron (тесты) */ }
  return null;
}

// Файл с выбранной пользователем папкой данных лежит в системной папке приложения,
// потому что сама папка данных может быть где угодно.
function bootstrapFile() {
  const app = electronApp();
  const dir = app ? app.getPath('userData') : path.join(os.homedir(), '.ember-launcher');
  return path.join(dir, 'bootstrap.json');
}

function readBootstrap() {
  try { return JSON.parse(fs.readFileSync(bootstrapFile(), 'utf8')); } catch (_) { return {}; }
}

function writeBootstrap(obj) {
  fs.mkdirSync(path.dirname(bootstrapFile()), { recursive: true });
  fs.writeFileSync(bootstrapFile(), JSON.stringify(obj, null, 2), 'utf8');
}

function defaultBase() {
  const app = electronApp();
  return app ? path.join(app.getPath('appData'), '.ember') : path.join(os.homedir(), '.ember');
}

function resolveBase() {
  if (process.env.EMBER_HOME) return process.env.EMBER_HOME;
  const b = readBootstrap();
  if (b.dataDir) return b.dataDir;
  return defaultBase();
}

const base = resolveBase();
const dirs = {
  base,
  versions: path.join(base, 'versions'),
  libraries: path.join(base, 'libraries'),
  assets: path.join(base, 'assets'),
  runtime: path.join(base, 'runtime'),
  instances: path.join(base, 'instances'),
  tools: path.join(base, 'tools'),
  tmp: path.join(base, 'tmp'),
};

module.exports = { dirs, defaultBase, readBootstrap, writeBootstrap };
