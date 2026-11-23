/* 验证桌面外壳（desktop/main.js）的行为：启动本机服务、窗口参数、阻止外部导航、关闭时停止服务。
   用假的 electron 模块替代真实 GUI，因此在无显示环境也能运行。 */
import Module from 'node:module';
import { createRequire } from 'node:module';
import { createRunner, assert, assertEqual } from './harness.mjs';

const require = createRequire(import.meta.url);
const { test, done } = createRunner();
console.log('\n[桌面外壳]');

const created = [];
const handlers = {};
const dialogs = [];

const fakeApp = {
  requestSingleInstanceLock: () => true,
  whenReady: () => Promise.resolve(),
  on: (event, fn) => { handlers['app:' + event] = fn; },
  quit: () => { handlers.quit = true; }
};

class FakeBrowserWindow {
  constructor(opts) {
    this.opts = opts;
    this.webContents = {
      setWindowOpenHandler: (fn) => { handlers.openHandler = fn; },
      on: (event, fn) => { handlers['wc:' + event] = fn; }
    };
    created.push(this);
  }
  on(event, fn) { handlers['win:' + event] = fn; }
  loadURL(url) { this.url = url; return Promise.resolve(); }
  reload() { handlers.reloaded = true; }
  isMinimized() { return false; }
  restore() {}
  focus() {}
}

const fakeElectron = {
  app: fakeApp,
  ipcMain: {
    handle: (channel, fn) => { handlers['ipc:' + channel] = fn; },
    on: (channel, fn) => { handlers['ipc:' + channel] = fn; }
  },
  BrowserWindow: FakeBrowserWindow,
  Menu: { buildFromTemplate: (t) => t, setApplicationMenu: () => {} },
  shell: { openExternal: () => {} },
  dialog: {
    showMessageBox: (...args) => dialogs.push(args),
    showErrorBox: (...args) => dialogs.push(args)
  }
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return fakeElectron;
  return originalLoad.apply(this, arguments);
};

require('../desktop/main.js');

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function waitFor(fn, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (fn()) return true;
    await sleep(50);
  }
  return false;
}

await waitFor(() => created.length > 0, 8000);

await test('桌面外壳启动本机服务并加载界面', async () => {
  assert(created.length === 1, '应创建一个应用窗口');
  assert(/^http:\/\/127\.0\.0\.1:\d+\/index\.html$/.test(created[0].url), '加载地址应为本机回环地址，实际 ' + created[0].url);
  const res = await fetch(created[0].url);
  assertEqual(res.status, 200, '界面响应码');
  const html = await res.text();
  assert(/纸间 PDF/.test(html), '返回的应是应用界面');
});

await test('窗口启用隔离与沙箱，不开放 Node 集成', async () => {
  const wp = created[0].opts.webPreferences;
  assertEqual(wp.contextIsolation, true, 'contextIsolation');
  assertEqual(wp.nodeIntegration, false, 'nodeIntegration');
  assertEqual(wp.sandbox, true, 'sandbox');
});

await test('阻止窗口导航到外部地址', async () => {
  let prevented = false;
  handlers['wc:will-navigate']({ preventDefault: () => { prevented = true; } }, 'https://example.com/');
  assert(prevented, '外部地址应被阻止');
  prevented = false;
  handlers['wc:will-navigate']({ preventDefault: () => { prevented = true; } }, created[0].url);
  assert(!prevented, '本机界面地址应允许');
});

await test('新窗口请求被拒绝，外部链接交给系统浏览器', async () => {
  const result = handlers.openHandler({ url: 'https://example.com/' });
  assertEqual(result.action, 'deny', '应拒绝在应用内打开新窗口');
});

await test('关闭窗口时停止本机服务', async () => {
  const url = created[0].url;
  handlers['app:window-all-closed']();
  await sleep(200);
  let failed = false;
  try { await fetch(url); } catch (e) { failed = true; }
  assert(failed, '服务应已停止');
  assert(handlers.quit, '应用应退出');
});

Module._load = originalLoad;
done('桌面外壳测试');
