const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  session,
  shell,
} = require('electron');
const path = require('path');

let mainWindow = null;

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
// filter's sign-in (the session cookie then applies to pings). Resolves
// true once the window actually reaches the destination origin — i.e.
// the filter let it through — then closes itself; SSO redirect chains
// that auto-complete need no interaction at all. Restricted to https.
let authWindow = null;

ipcMain.handle('tasker:open-auth', (_event, url) => {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return false;
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.focus();
    return false;
  }
  const target = new URL(url).origin;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    const win = new BrowserWindow({
      width: 900,
      height: 700,
      title: 'network sign-in',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    authWindow = win;
    win.webContents.on('did-navigate', (_ev, navUrl) => {
      try {
        if (new URL(navUrl).origin === target) {
          finish(true);
          setTimeout(() => {
            if (!win.isDestroyed()) win.close();
          }, 600);
        }
      } catch {
        // Unparseable interim URL — keep waiting.
      }
    });
    win.on('closed', () => {
      authWindow = null;
      finish(false);
    });
    setTimeout(() => finish(false), 180000);
    win.loadURL(url);
  });
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
  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  // Any external link opens in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Global capture: a system-wide hotkey brings the app forward and opens the
// capture box, so a stray thought can be dropped in the Backlog from
// anywhere without hunting for the window.
function registerQuickCapture() {
  const ok = globalShortcut.register('CommandOrControl+Shift+K', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('tasker:quick-capture');
    }
  });
  return ok;
}

app.whenReady().then(() => {
  createWindow();
  registerQuickCapture();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
