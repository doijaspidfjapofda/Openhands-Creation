/* 纸间 PDF 桌面外壳：启动本机服务并用应用窗口打开界面。
   仍然只在本机读写文件，不包含任何联网或遥测代码。 */
const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { start } = require(path.join(__dirname, '..', 'server.js'));

const APP_ROOT = path.join(__dirname, '..');
let mainWindow = null;
let localServer = null;
let localPort = 0;

function isLocalUrl(url) {
  return typeof url === 'string' && url.startsWith('http://127.0.0.1:' + localPort + '/');
}

async function createWindow() {
  const started = await start({ root: APP_ROOT, port: 5173 });
  localServer = started.server;
  localPort = started.port;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    title: '纸间 PDF',
    backgroundColor: '#F7F3EE',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        { label: '重新载入界面', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.reload() },
        { type: 'separator' },
        { label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于纸间 PDF',
          click: () => dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: '关于纸间 PDF',
            message: '纸间 PDF · 本机 PDF 工具',
            detail: '所有 PDF 与图片只在这台电脑上处理。应用不包含上传、云端处理或遥测。'
          })
        }
      ]
    }
  ]));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isLocalUrl(url)) event.preventDefault();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(started.url);
}

const SAVE_FILTERS = {
  '.pdf': [{ name: 'PDF 文档', extensions: ['pdf'] }],
  '.zip': [{ name: 'ZIP 压缩包', extensions: ['zip'] }],
  '.txt': [{ name: '纯文本', extensions: ['txt'] }],
  '.png': [{ name: 'PNG 图片', extensions: ['png'] }],
  '.jpg': [{ name: 'JPEG 图片', extensions: ['jpg', 'jpeg'] }]
};

ipcMain.handle('zj:save-file', async (event, payload) => {
  const name = String((payload && payload.name) || '输出.pdf');
  const bytes = payload && payload.bytes;
  if (!bytes) return { canceled: false, error: '没有可保存的数据。' };

  const ext = ((name.match(/\.[a-z0-9]+$/i) || ['.pdf'])[0] || '.pdf').toLowerCase();
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    title: '另存为新文件',
    defaultPath: path.join(app.getPath('documents'), name),
    filters: SAVE_FILTERS[ext] || [{ name: '所有文件', extensions: ['*'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  try {
    fs.writeFileSync(result.filePath, Buffer.from(bytes));
    return { canceled: false, path: result.filePath, name: path.basename(result.filePath) };
  } catch (err) {
    return { canceled: false, error: '写入文件失败：' + ((err && err.message) || err) };
  }
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow).catch((err) => {
    dialog.showErrorBox('纸间 PDF 启动失败', String((err && err.message) || err));
    app.quit();
  });

  app.on('window-all-closed', () => {
    if (localServer) localServer.close();
    app.quit();
  });
}
