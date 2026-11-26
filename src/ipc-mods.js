// IPC: моды в сборках (список, переключение, удаление, статусы установки).
const { ipcMain } = require('electron');
const instances = require('./instances');
const horizon = require('./horizon');
const mods = require('./mods');
const installed = require('./installed');
const providers = require('./providers');

function registerModsIpc() {
  ipcMain.handle('mods:list', (_e, id) => {
    const inst = instances.find(id);
    return instances.isRust(inst) ? horizon.listMods(inst) : mods.listMods(inst);
  });
  ipcMain.handle('mods:toggle', (_e, { id, file, enabled }) => {
    const inst = instances.find(id);
    return instances.isRust(inst)
      ? horizon.setModEnabled(inst, file, enabled)
      : mods.setModEnabled(inst, file, enabled);
  });
  ipcMain.handle('mods:installed', (_e, id) => {
    const inst = instances.find(id);
    // У сборок на Rust список ключей ведёт реестр Horizon, разбор jar не нужен
    return instances.isRust(inst) ? [] : installed.keysFor(inst);
  });
  // Состояние результатов поиска в сборке: { 'modrinth:ID': 'current' | 'outdated' | 'none' }
  ipcMain.handle('mods:states', (_e, { id, items }) => {
    let inst = null;
    try { inst = instances.find(id); } catch (_) { inst = null; }
    return providers.installStates(inst, items);
  });
  ipcMain.handle('mods:delete', (_e, { id, file }) => {
    const inst = instances.find(id);
    return instances.isRust(inst) ? horizon.deleteMod(inst, file) : mods.deleteMod(inst, file);
  });
}

module.exports = { registerModsIpc };
