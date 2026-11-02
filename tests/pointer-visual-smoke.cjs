const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const testRoot = path.join(os.tmpdir(), `qijian-pointer-visual-${process.pid}`);
const outputRoot = path.join(__dirname, '..', 'dist');
process.env.QIJIAN_TEST_LIBRARY_ROOT = testRoot;
require('../src/main.js');

const mouse = (win, type, point) => win.webContents.sendInputEvent({ type, x: Math.round(point.x), y: Math.round(point.y), button: 'left', clickCount: 1 });

app.whenReady().then(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 3200));
    const win = BrowserWindow.getAllWindows().find(item => !item.isDestroyed() && item.webContents.getURL().includes('index.html'));
    const points = await win.webContents.executeJavaScript(`(() => {
      const pixel='data:image/gif;base64,R0lGODlhAQABAPAAAIbG5f///yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
      const folder={id:'visual-folder',type:'folder',title:'视觉检查',parentId:null,order:1,createdAt:now(),deletedAt:null};
      const a={id:'visual-a',type:'document',title:'第一篇文稿',parentId:folder.id,order:1,createdAt:now(),updatedAt:now(),deletedAt:null,content:'<p>第一篇内容</p>',versions:[]};
      const b={id:'visual-b',type:'document',title:'第二篇文稿',parentId:folder.id,order:2,createdAt:now(),updatedAt:now(),deletedAt:null,content:'<p>第二篇内容</p>',versions:[]};
      library.nodes.push(folder,a,b);activeFolder=folder.id;filter='all';select(a.id);render();
      $('#editor').innerHTML='<ul class="outline-list"><li>大纲主题<ul class="outline-list"><li>子项</li></ul></li></ul><table><tbody><tr><td>波段</td><td>中位数</td></tr><tr><td>Blue</td><td>0.914</td></tr></tbody></table><div class="image-row"></div><div class="image-row"></div>';
      normalizeEditorTables();const rows=$$('.image-row');rows[0].appendChild(makeEditorImageFigure({url:pixel}));rows[1].appendChild(makeEditorImageFigure({url:pixel}));numbers();
      const img=rows[1].querySelector('img').getBoundingClientRect(),target=rows[0].querySelector('figure').getBoundingClientRect(),cards=$$('.doc-card'),source=cards[0].getBoundingClientRect(),cardTarget=cards[1].getBoundingClientRect();
      return {image:{x:img.left+img.width/2,y:img.top+img.height/2},imageTarget:{x:target.right-3,y:target.top+8},card:{x:source.left+15,y:source.top+15},cardTarget:{x:cardTarget.left+15,y:cardTarget.top+2}};
    })()`);
    mouse(win, 'mouseDown', points.image); mouse(win, 'mouseUp', points.image);
    await new Promise(resolve => setTimeout(resolve, 120));
    fs.writeFileSync(path.join(outputRoot, 'qa-image-frame.png'), (await win.capturePage()).toPNG());
    mouse(win, 'mouseDown', points.image); mouse(win, 'mouseMove', points.imageTarget);
    await new Promise(resolve => setTimeout(resolve, 120));
    fs.writeFileSync(path.join(outputRoot, 'qa-image-drag.png'), (await win.capturePage()).toPNG());
    mouse(win, 'mouseUp', points.imageTarget);
    mouse(win, 'mouseDown', points.card); mouse(win, 'mouseMove', points.cardTarget);
    await new Promise(resolve => setTimeout(resolve, 120));
    fs.writeFileSync(path.join(outputRoot, 'qa-card-drag.png'), (await win.capturePage()).toPNG());
    const cardDropLineVisible = await win.webContents.executeJavaScript(`!!$('#docList .doc-card.drop-before,#docList .doc-card.drop-after')`);
    mouse(win, 'mouseUp', points.cardTarget);
    const checks = await win.webContents.executeJavaScript(`({imageSelected:!!$('#editor figure.image-selected'),imageMerged:$$('#editor .image-row')[0]?.querySelectorAll('figure').length===2,tableButton:!!$('#editor .table-edit-button'),mindmapButton:!!$('#mindmapButtons .mindmap-toggle')})`);checks.cardDropLineVisible=cardDropLineVisible;
    console.log(JSON.stringify(checks));
    app.exit(Object.values(checks).every(Boolean) ? 0 : 1);
  } catch (error) { console.error(error); app.exit(1); }
}).finally(() => { try { fs.rmSync(testRoot, { recursive:true, force:true }); } catch (_) {} });
