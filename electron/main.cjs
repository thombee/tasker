const { app, BrowserWindow, ipcMain, net, shell } = require('electron');
const path = require('path');

// Outbound park ping on behalf of the renderer. No CORS/preflight here,
// and Chromium's stack handles system proxies the way the browser does.
ipcMain.handle('tasker:ping', async (_event, url, init) => {
  try {
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
      return { status: 0, body: 'invalid url' };
    }
    const response = await net.fetch(url, {
      method: 'POST',
      headers: init && typeof init.headers === 'object' ? init.headers : {},
      body: init && typeof init.body === 'string' ? init.body : '',
    });
    const body = (await response.text()).slice(0, 500);
    return { status: response.status, body };
  } catch (err) {
    return { status: 0, body: String(err).slice(0, 300) };
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 720,
    height: 860,
    minWidth: 420,
    minHeight: 520,
    title: 'tasker',
    backgroundColor: '#faf9f6',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // Any external link opens in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
