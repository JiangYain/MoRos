const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  savePDF: (html, defaultFileName) =>
    ipcRenderer.invoke('save-pdf', html, defaultFileName),
})
