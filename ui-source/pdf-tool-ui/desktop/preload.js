/* 预加载脚本：只向页面暴露“另存为”能力，不暴露 Node API。 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('zjDesktop', {
  isDesktop: true,
  saveFile: function (name, bytes) {
    return ipcRenderer.invoke('zj:save-file', { name: name, bytes: bytes });
  },
  /* 只读取路径，不把 Node 的 fs 暴露给页面 */
  filePath: function (file) {
    try { return webUtils.getPathForFile(file) || ''; } catch (e) { return ''; }
  },
  readFile: function (filePath) {
    return ipcRenderer.invoke('zj:read-file', String(filePath || ''));
  },
  setDirty: function (dirty) {
    ipcRenderer.send('zj:dirty', !!dirty);
  },
  onSaveRequest: function (handler) {
    if (typeof handler !== 'function') return;
    ipcRenderer.on('zj:save-request', function () { handler(); });
  }
});
