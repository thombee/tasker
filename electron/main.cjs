const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('path');

// Outbound park ping on behalf of the renderer. No CORS/preflight here,
// Chromium's stack handles system proxies the way the browser does, and
// using the default session's cookies means a corporate filter sign-in
// (e.g. Zscaler) completed in-app carries over to pings.
ipcMain.handle('tasker:ping', async (_event, url, init) => {
  try {
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
      return { status: 0, body: 'invalid url' };
    }
    const method = init && init.method === 'GET' ? 'GET' : 'POST';
    const response = await session.defaultSession.fetch(url, {
      method,
      credentials: 'include',
      headers: init && typeof init.headers === 'object' ? init.headers : {},
      body:
        method === 'POST' && init && typeof init.body === 'string'
          ? init.body
          : undefined,
    });
    const body = (await response.text()).slice(0, 500);
    return { status: response.status, body };
  } catch (err) {
    return { status: 0, body: String(err).slice(0, 300) };
  }
});

// Opens a normal in-app window so the user can complete their network
// filter's sign-in (the session cookie then applies to pings). Restricted
// to https URLs.
ipcMain.handle('tasker:open-auth', (_event, url) => {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return false;
  const authWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'network sign-in',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  authWindow.loadURL(url);
  return true;
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
