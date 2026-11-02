const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const testRoot = path.join(os.tmpdir(), `qijian-paste-image-${process.pid}`);
const output = path.join(__dirname, '..', 'dist', 'qa-pasted-image-frame.png');
process.env.QIJIAN_TEST_LIBRARY_ROOT = testRoot;
require('../src/main.js');

app.whenReady().then(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 3200));
    const win = BrowserWindow.getAllWindows().find(item => !item.isDestroyed() && item.webContents.getURL().includes('index.html'));
    win.webContents.on('console-message', (_event, level, message) => { if (level >= 2) console.error('renderer:', message); });
    const point = await win.webContents.executeJavaScript(`(async () => {
      const editor=$('#editor');editor.innerHTML='<p><br></p>';editor.focus();
      const range=document.createRange();range.selectNodeContents(editor.firstElementChild);range.collapse(true);getSelection().removeAllRanges();getSelection().addRange(range);
      const svg='<svg xmlns="http://www.w3.org/2000/svg" width="900" height="420"><rect width="900" height="420" fill="#2f69cf"/><circle cx="180" cy="210" r="110" fill="#8cb8ff"/><rect x="360" y="100" width="390" height="220" rx="24" fill="#dce9ff"/><text x="555" y="225" text-anchor="middle" font-size="52" fill="#224477">粘贴图片</text></svg>';
      const file=new File([svg],'visual-paste.svg',{type:'image/svg+xml'});let prevented=false;
      pasteEditorContent({clipboardData:{items:[{type:'image/svg+xml',getAsFile:()=>file}],getData:()=>''},preventDefault:()=>prevented=true});
      await new Promise(resolve=>setTimeout(resolve,350));
      const image=editor.querySelector('figure.editor-image img'),rect=image.getBoundingClientRect();
      return {x:rect.left+rect.width/2,y:rect.top+rect.height/2,prevented};
    })()`);
    win.webContents.sendInputEvent({type:'mouseDown',x:Math.round(point.x),y:Math.round(point.y),button:'left',clickCount:1});
    win.webContents.sendInputEvent({type:'mouseUp',x:Math.round(point.x),y:Math.round(point.y),button:'left',clickCount:1});
    await new Promise(resolve => setTimeout(resolve, 150));
    fs.mkdirSync(path.dirname(output), { recursive:true });
    fs.writeFileSync(output, (await win.capturePage()).toPNG());
    const checks = await win.webContents.executeJavaScript(`(() => {const figure=$('#editor figure.editor-image');return {wrapped:!!$('#editor>.image-row>figure.editor-image'),selected:figure?.classList.contains('image-selected'),handles:figure?.querySelectorAll('.image-resize-handle').length===4,grip:!!figure?.querySelector('.image-drag-grip'),nativeDragDisabled:figure?.draggable===false&&figure?.querySelector('img')?.draggable===false}})()`);
    checks.prevented = point.prevented;
    console.log(JSON.stringify(checks));
    app.exit(Object.values(checks).every(Boolean) ? 0 : 1);
  } catch (error) { console.error(error); app.exit(1); }
}).finally(() => { try { fs.rmSync(testRoot, { recursive:true, force:true }); } catch (_) {} });
