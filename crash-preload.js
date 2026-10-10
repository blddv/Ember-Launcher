const { contextBridge, ipcRenderer } = require('electron');

// Окно разбора падения: только получение данных и три безопасных действия
contextBridge.exposeInMainWorld('crash', {
  get: () => ipcRenderer.invoke('crash:get'),
  copy: () => ipcRenderer.invoke('crash:copy'),
  openFolder: () => ipcRenderer.invoke('crash:openFolder'),
  openLog: () => ipcRenderer.invoke('crash:openLog'),
  close: () => ipcRenderer.invoke('crash:close'),
});
