const { contextBridge, ipcRenderer } = require('electron');

// Minimal native bridge: lets the renderer send park pings from the main
// process, where requests use Chromium's network stack without CORS
// preflights — the same path a normal browser navigation takes, which
// matters behind corporate proxies.
contextBridge.exposeInMainWorld('taskerNative', {
  ping: (url, init) => ipcRenderer.invoke('tasker:ping', url, init),
});
