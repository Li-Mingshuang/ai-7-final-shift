// AI-7 最后一班岗 · Electron 桌面壳
'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');

// 说明：
// - webSecurity:false 仅为了让「玩家自己填的 DeepSeek Key」能从本机直连 API（绕过浏览器 CORS）。
//   本应用不加载任何远程页面，玩家数据都留在本机。
// - 若你更在意安全，可去掉该行并引导玩家使用本地代理版。
function createWindow(){
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    autoHideMenuBar: true,
    backgroundColor: '#f4f1e8',
    title: 'AI 毁灭世界：最后一班岗',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      spellcheck: false
    }
  });
  win.loadFile(path.join(__dirname, 'web', 'index.html'));
  // 去掉菜单栏快捷键
  win.removeMenu();
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
