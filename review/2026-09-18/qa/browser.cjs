const { app, BrowserWindow } = require('electron');
const path = require('node:path');
app.setPath('userData', path.join(__dirname, 'browser-profile'));
app.whenReady().then(() => {
  const window = new BrowserWindow({ show: false, width: 1440, height: 1050, webPreferences: { sandbox: true } });
  window.loadURL('about:blank');
});
