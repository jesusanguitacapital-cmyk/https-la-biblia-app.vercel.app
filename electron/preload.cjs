const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('tradingApp', {
  getDefaultFolder: () => ipcRenderer.invoke('storage/get-default-folder'),
  selectFolder: () => ipcRenderer.invoke('storage/select-folder'),
  loadData: () => ipcRenderer.invoke('storage/load-data'),
  saveData: (payload) => ipcRenderer.invoke('storage/save-data', payload),
  copyImage: (payload) => ipcRenderer.invoke('storage/copy-image', payload),
  selectImage: () => ipcRenderer.invoke('storage/select-image'),
  extractOperationFromImage: (payload) => ipcRenderer.invoke('ai/extract-operation-from-image', payload),
})
