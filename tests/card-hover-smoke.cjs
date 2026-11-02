const {app,BrowserWindow}=require('electron');
const fs=require('fs'),os=require('os'),path=require('path');
process.env.QIJIAN_TEST_LIBRARY_ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'qijian-hover-'));
require('../src/main.js');
app.whenReady().then(async()=>{
 const win=BrowserWindow.getAllWindows()[0];
 await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
 await new Promise(resolve=>setTimeout(resolve,250));
 const before=await win.webContents.executeJavaScript(`(()=>{const card=document.querySelector('.doc-card'),r=card.getBoundingClientRect(),s=getComputedStyle(card);return{x:r.left+r.width/2,y:r.top+r.height/2,bg:s.backgroundColor,transform:s.transform}})()`);
 win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(before.x),y:Math.round(before.y),movementX:0,movementY:0});
 await new Promise(resolve=>setTimeout(resolve,220));
 const after=await win.webContents.executeJavaScript(`(()=>{const s=getComputedStyle(document.querySelector('.doc-card'));return{bg:s.backgroundColor,transform:s.transform}})()`);
 const scale=after.transform==='none'?1:Number(after.transform.match(/matrix\(([^,]+)/)?.[1]||1);
 const checks={hoverKeepsColor:before.bg===after.bg,hoverGentlyScales:scale>1&&scale<1.04};
 console.log(checks);app.quit();if(Object.values(checks).some(value=>!value))process.exitCode=1;
}).catch(error=>{console.error(error);app.quit();process.exitCode=1});

