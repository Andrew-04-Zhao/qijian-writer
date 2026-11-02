const {app,BrowserWindow,screen}=require('electron');
const fs=require('fs'),os=require('os'),path=require('path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qijian-window-'));
process.env.QIJIAN_TEST_LIBRARY_ROOT=root;
require('../src/main.js');
app.whenReady().then(async()=>{
 const win=BrowserWindow.getAllWindows()[0];
 await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
 const area=screen.getDisplayMatching(win.getBounds()).workArea;
 const [minWidth,minHeight]=win.getMinimumSize();
 const initial=win.getBounds();
 const checks={
  halfScreenMinimum:minWidth===Math.max(640,Math.floor(area.width/2))&&minHeight===Math.max(420,Math.floor(area.height/2)),
  defaultNotFullscreen:!win.isMaximized()&&initial.width<area.width&&initial.height<area.height,
 };
 win.setSize(minWidth,minHeight);
 await new Promise(resolve=>setTimeout(resolve,400));
 const collapsed=await win.webContents.executeJavaScript("({folders:document.querySelector('#app').classList.contains('folders-collapsed'),docs:document.querySelector('#app').classList.contains('docs-collapsed')})");
 checks.narrowWindowCollapsesBoth=collapsed.folders&&collapsed.docs;
 const saved=JSON.parse(fs.readFileSync(path.join(root,'window-state.json'),'utf8')),actual=win.getBounds();
 checks.windowStateSaved=saved.bounds.width===actual.width&&saved.bounds.height===actual.height&&saved.maximized===false;
 checks.stateDetails={minWidth,minHeight,actual,saved};
 console.log(checks);
 app.quit();
 if(Object.values(checks).some(value=>!value))process.exitCode=1;
}).catch(error=>{console.error(error);app.quit();process.exitCode=1});
