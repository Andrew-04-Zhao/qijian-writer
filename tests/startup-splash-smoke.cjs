const path = require('path');
const os = require('os');
const fs = require('fs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qijian-startup-'));
process.env.QIJIAN_TEST_LIBRARY_ROOT = root;
process.env.QIJIAN_TEST_SPLASH = '1';

const startedAt = Date.now();
const { app, BrowserWindow } = require('electron');
let splashCreated=false,splashVisible=false,progress=Promise.resolve(false);
app.on('browser-window-created',(_event,window)=>{
 window.on('show',()=>{if(!window.isDestroyed()&&window.webContents.getURL().endsWith('/splash.html'))splashVisible=true});
 window.webContents.once('did-finish-load',()=>{if(window.isDestroyed()||!window.webContents.getURL().endsWith('/splash.html'))return;splashCreated=true;progress=window.webContents.executeJavaScript("Boolean(document.querySelector('#startupBar') && document.querySelector('#startupLabel'))").catch(()=>false)});
});
require('../src/main.js');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (predicate, timeout = 10000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = predicate();
    if (result) return result;
    await delay(40);
  }
  return null;
};

app.whenReady().then(async () => {
  const checks = {};
  const main = await waitFor(() => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('/index.html') && window.isVisible()), 12000);
  checks.splashCreated=splashCreated;checks.splashVisible=splashVisible;checks.hasProgress=await progress;
  checks.mainVisible = !!main;
  checks.splashClosed = !!main && !BrowserWindow.getAllWindows().some(window => window.webContents.getURL().endsWith('/splash.html'));
  if (!main) checks.windows = BrowserWindow.getAllWindows().map(window => ({url:window.webContents.getURL(),visible:window.isVisible(),destroyed:window.isDestroyed()}));
  const passed = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ passed, elapsedMs: Date.now() - startedAt, checks }, null, 2));
  app.exit(passed ? 0 : 1);
}).catch(error=>{console.error(error);app.exit(1)});
