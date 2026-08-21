const { app, BrowserWindow, session } = require('electron');
const path = require('path');

let kioskWindow;
const stagingURL = 'https://photo-box-staging-hilmansulaeman-hilmansulaemans-projects.vercel.app';

function isKioskOrigin(origin) {
  return origin === 'file:'
    || origin === stagingURL
    || origin.startsWith('http://127.0.0.1:')
    || origin.startsWith('http://localhost:');
}

function createWindow() {
  kioskWindow = new BrowserWindow({
    show: false,
    backgroundColor: '#111827',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  const kioskSession = kioskWindow.webContents.session;
  
  kioskSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'usb') {
      callback(true);
    } else {
      callback(false);
    }
  });

  kioskSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
    (permission === 'media' || permission === 'usb') && isKioskOrigin(requestingOrigin));
  kioskSession.setDevicePermissionHandler(({ deviceType, origin }) =>
    deviceType === 'usb' && isKioskOrigin(origin));

  // Do not allow the guest session to navigate away from the locally installed
  // app. Device selection remains user initiated from the Camera settings UI.
  kioskWindow.webContents.on('will-navigate', (event, url) => {
    if (!isKioskOrigin(url)) event.preventDefault();
  });
  kioskWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  kioskWindow.once('ready-to-show', () => {
    kioskWindow.show();
    kioskWindow.setFullScreen(true);
  });

  // Production kiosk loads the verified staging deployment. A local URL can
  // still be injected for development without changing the packaged app.
  const rendererURL = process.env.ELECTRON_RENDERER_URL || stagingURL;
  if (rendererURL) kioskWindow.loadURL(rendererURL);
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
