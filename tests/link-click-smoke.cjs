const {app,BrowserWindow}=require('electron');
const fs=require('fs'),os=require('os'),path=require('path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qijian-link-click-')),stamp=new Date().toISOString();
fs.writeFileSync(path.join(root,'library.json'),JSON.stringify({nodes:[{id:'link-doc',type:'document',title:'链接测试',parentId:null,order:1,createdAt:stamp,updatedAt:stamp,deletedAt:null,content:'<p>前文 <a href="https://example.com">点击查看</a> 后文</p>',contentJson:null,versions:[]}],activeId:'link-doc',settings:{},writeRevision:0}),'utf8');
process.env.QIJIAN_TEST_LIBRARY_ROOT=root;require('../src/main.js');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

app.whenReady().then(async()=>{let code=0;try{
 await pause(1800);const main=BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().includes('index.html'));await main.webContents.executeJavaScript(`window.qijianEditor.setContent('<p>前文 <a href="https://example.com">点击查看</a> 后文</p>',null);true`);await pause(100);
 const down=await main.webContents.executeJavaScript(`(()=>{const link=document.querySelector('#editor a[href]'),rect=link.getBoundingClientRect();link.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0,clientX:rect.left+5,clientY:rect.top+5}));return{selection:window.qijianEditor.view.state.selection.constructor.name,selectedBlocks:document.querySelectorAll('#editor .ProseMirror-selectednode').length,paragraphOutline:getComputedStyle(link.closest('p')).outlineStyle}})()`);
 await main.webContents.executeJavaScript(`(()=>{const link=document.querySelector('#editor a[href]'),rect=link.getBoundingClientRect();link.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,button:0,clientX:rect.left+5,clientY:rect.top+5}));link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0,clientX:rect.left+5,clientY:rect.top+5}));return true})()`);await pause(300);
 const afterClick=await main.webContents.executeJavaScript(`({selectedBlocks:document.querySelectorAll('#editor .ProseMirror-selectednode').length,selection:window.qijianEditor.view.state.selection.constructor.name,renameVisible:!document.querySelector('#nameDialog').classList.contains('hidden')})`);
 await main.webContents.executeJavaScript(`document.querySelector('#nameDialogCancel')?.click()`);await pause(120);
 await main.webContents.executeJavaScript(`(()=>{const link=document.querySelector('#editor a[href]');link.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0,ctrlKey:true}));link.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,button:0,ctrlKey:true}));link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0,ctrlKey:true}));return true})()`);await pause(120);
 const ctrlDialogVisible=await main.webContents.executeJavaScript(`!document.querySelector('#nameDialog').classList.contains('hidden')`);
 const checks={textSelectionOnLink:down.selection.endsWith('TextSelection'),noLongSelectionFrame:down.selectedBlocks===0&&afterClick.selectedBlocks===0,plainClickStillOpensRename:afterClick.renameVisible,ctrlClickDoesNotOpenDialog:!ctrlDialogVisible};
 console.log(JSON.stringify({checks,down,afterClick},null,2));if(Object.values(checks).some(value=>!value))code=1;
 }catch(error){console.error(error);code=1}finally{try{fs.rmSync(root,{recursive:true,force:true})}catch{}app.exit(code)}});
