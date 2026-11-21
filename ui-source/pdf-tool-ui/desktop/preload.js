/* 预加载脚本：只向页面暴露“另存为”能力，不暴露 Node API。 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zjDesktop', {
  isDesktop: true,
  saveFile: function (name, bytes) {
    return ipcRenderer.invoke('zj:save-file', { name: name, bytes: bytes });
  }
});
