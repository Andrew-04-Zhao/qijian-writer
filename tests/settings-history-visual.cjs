const {app,BrowserWindow}=require('electron'),fs=require('fs'),os=require('os'),path=require('path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qijian-settings-history-visual-'));process.env.QIJIAN_TEST_LIBRARY_ROOT=root;process.env.QIJIAN_TEST_DETACHED='1';require('../src/main.js');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{let code=0;try{
 await pause(2500);const main=BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().includes('index.html'));if(!main)throw new Error('主窗口未创建');
 await main.webContents.executeJavaScript(`openSettings('theme');true`);await pause(1100);let child=BrowserWindow.getAllWindows().find(win=>win!==main&&win.isVisible()&&win.webContents.getTitle()==='设置');if(!child)throw new Error('设置窗口未创建');
 await child.capturePage();await pause(120);fs.writeFileSync(path.join(__dirname,'../dist/qa-settings-theme.png'),(await child.capturePage()).toPNG());
 await main.webContents.executeJavaScript(`settingsTab('advanced');true`);await pause(500);fs.writeFileSync(path.join(__dirname,'../dist/qa-settings-advanced.png'),(await child.capturePage()).toPNG());
 await main.webContents.executeJavaScript(`closeDetachedDialog('settingsDialog');const stamp=Date.now().toString();const d={id:'visual-'+stamp,type:'document',title:'历史版本示例',content:'<h1>当前文稿</h1><p>这是当前版本的正文内容。</p>',parentId:null,order:Date.now(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),deletedAt:null,versions:[{id:'v1-'+stamp,at:'2026-09-25T00:02:00.000Z',content:'<h1>旧版本标题</h1><p>第一份历史版本的正文内容，用于检查预览排版。</p>'},{id:'v2-'+stamp,at:'2026-09-25T00:00:00.000Z',content:'<h1>更早的版本</h1><p>第二份历史版本的正文内容。</p>'}]};library.nodes.push(d);select(d.id);openTool('versions');true`);await pause(1100);child=BrowserWindow.getAllWindows().find(win=>win!==main&&win.isVisible()&&win.webContents.getTitle()==='历史版本');if(!child)throw new Error('历史版本窗口未创建');
 await child.capturePage();await pause(120);fs.writeFileSync(path.join(__dirname,'../dist/qa-history.png'),(await child.capturePage()).toPNG());
 await main.webContents.executeJavaScript(`closeDetachedDialog('toolPanel');window.__visualNamePromise=requestFolderName('重命名文件夹','开始使用');true`);await pause(800);child=BrowserWindow.getAllWindows().find(win=>win!==main&&win.isVisible()&&win.webContents.getTitle()==='重命名文件夹');if(!child)throw new Error('重命名窗口未创建');
 await child.capturePage();await pause(120);fs.writeFileSync(path.join(__dirname,'../dist/qa-rename.png'),(await child.capturePage()).toPNG());
 console.log('visual screenshots saved');
 }catch(error){console.error(error);code=1}finally{try{fs.rmSync(root,{recursive:true,force:true})}catch{}app.exit(code)}});
