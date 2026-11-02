const {app, BrowserWindow} = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {pathToFileURL} = require('url');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qijian-outline-interaction-'));
const stamp = new Date().toISOString();
fs.writeFileSync(path.join(root, 'library.json'), JSON.stringify({
  nodes: [{id:'outline-ui', type:'document', title:'大纲交互验证', parentId:null, order:1, createdAt:stamp, updatedAt:stamp, deletedAt:null, content:'<p>准备</p>', versions:[]}],
  activeId:'outline-ui', settings:{theme:'solarized-light'}, writeRevision:0
}));
process.env.QIJIAN_TEST_LIBRARY_ROOT = root;
app.setPath('userData',path.join(root,'profile'));
require('../src/main.js');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  let code = 0;
  try {
    let win,ready=false;for(let i=0;i<160;i++){win=BrowserWindow.getAllWindows().find(item=>item.webContents.getURL().includes('index.html'));if(win&&await win.webContents.executeJavaScript('typeof activeDoc!=="undefined"&&!!activeDoc&&!!window.qijianEditor?.enabled').catch(()=>false)){ready=true;break}await wait(100)}if(!ready)throw Error('Editor startup timed out');win.webContents.setBackgroundThrottling(false);
    win.show(); win.focus();
    const run = value => win.webContents.executeJavaScript(value).catch(error=>{throw Error(value.slice(0,200)+"\n"+error.message)});
    const imageFile = path.join(root, 'attachments', 'doc-outline-ui', 'outline-test.gif');
    fs.mkdirSync(path.dirname(imageFile), {recursive:true});
    fs.writeFileSync(imageFile, Buffer.from('R0lGODlhAQABAPAAAIbG5f///yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'));
    const pixel = pathToFileURL(imageFile).href;
    const figure = `<div class="image-row"><figure class="editor-image" style="width:180px" data-image-id="nested-edge"><img src="${pixel}"></figure></div>`;
    const html = '<h2>父条目与图片边缘</h2><ul class="outline-list"><li><p>父条目</p><ul class="outline-list"><li><p>子条目</p><ul class="outline-list"><li><p>末尾图片</p>'+figure+'</li></ul></li></ul></li><li><p>后续同级</p></li></ul><p>正文结尾</p>';
    await run(`window.qijianEditor.setContent(${JSON.stringify(html)},null)`);
    await wait(150);
    const before = await run('JSON.stringify(window.qijianEditor.getDocumentJSON())');
    const move = async (selector, gutter = false) => {
      win.focus();
      const pt = await run(`(()=>{const item=document.querySelector(${JSON.stringify(selector)}),r=item.getBoundingClientRect();return{x:Math.round(r.left+${gutter ? '5' : '60'}),y:Math.round(r.top+12)}})()`);
      win.webContents.sendInputEvent({type:'mouseMove', ...pt});
      await wait(220);
      return pt;
    };
    const rootItem = '#editor>ul>li:first-child';
    const childItem = rootItem+'>ul>li:first-child';
    const inspect = selector => run(`(()=>{const item=document.querySelector(${JSON.stringify(selector)}),row=item.querySelector(':scope>p'),icon=getComputedStyle(item,'::before');return{strokes:(icon.backgroundImage.match(/linear-gradient/g)||[]).length,strokeSize:icon.backgroundSize,strokePosition:icon.backgroundPosition,rowBackground:getComputedStyle(row).backgroundColor,itemBackground:getComputedStyle(item).backgroundColor,collapsed:item.classList.contains('outline-collapsed')}})()`);
    const highlighted = state => [state.rowBackground,state.itemBackground].some(value => value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent');
    await move(rootItem);
    const rowHover = await inspect(rootItem);
    await wait(350);
    const persistentHover = await inspect(rootItem);
    const afterHover = await run('JSON.stringify(window.qijianEditor.getDocumentJSON())');
    const checks = {
      parentTextHoverShowsMinus: rowHover.strokes===1 && highlighted(rowHover),
      hoverPersists: persistentHover.strokes===1 && highlighted(persistentHover),
      highlightCoversWholeBranch: rowHover.itemBackground!=='rgba(0, 0, 0, 0)' && rowHover.rowBackground==='rgba(0, 0, 0, 0)',
      hoverKeepsDocument: before === afterHover
    };
    await move(childItem);
    const childHover = await inspect(childItem), parentWhileChild = await inspect(rootItem);
    checks.onlyHoveredBranchHighlighted = highlighted(childHover) && !highlighted(parentWhileChild);
    const point = await move(rootItem, true);
    const click = async pt => {
      win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...pt});
      win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...pt});
      await wait(300);
      win.webContents.sendInputEvent({type:'mouseMove',...pt});await wait(60);
    };
    await click(point);
    const collapsed = await inspect(rootItem);
    checks.clickCollapseShowsPlus = collapsed.collapsed && collapsed.strokes===2 && highlighted(collapsed);
    await click(point);
    const expanded = await inspect(rootItem);
    checks.clickExpandShowsMinus = !expanded.collapsed && expanded.strokes===1;
    checks.roundTripKeepsDocument = before === await run('JSON.stringify(window.qijianEditor.getDocumentJSON())');

    const selectImage = () => run(`(()=>{const image=document.querySelector('[data-image-id="nested-edge"]');window.qijianEditor.selectDomNode(image)})()`);
    await selectImage();
    win.webContents.sendInputEvent({type:'mouseMove', x:10, y:400});
    await wait(200);
    const inspectEdges = () => run(`(()=>{
      const image=document.querySelector('[data-image-id="nested-edge"]');
      const controls=[...image.querySelectorAll('.image-resize-handle,.image-drag-grip')];
      return controls.map(control=>{const r=control.getBoundingClientRect(), points=[[r.left+r.width/2,r.top+2],[r.left+r.width/2,r.bottom-2],[r.left+2,r.top+r.height/2],[r.right-2,r.top+r.height/2]];return{control:control.dataset.corner||'grip',visible:points.every(([x,y])=>{const hit=document.elementFromPoint(x,y);return hit===control||control.contains(hit)})}});
    })()`);
    const edges = await inspectEdges();
    checks.nestedImageHandlesFullyVisible = edges.length === 5 && edges.every(edge => edge.visible);
    await run(`window.qijianEditor.toggleCollapseFromDOM(document.querySelector(${JSON.stringify(rootItem)}))`);
    await wait(250);
    await run(`window.qijianEditor.toggleCollapseFromDOM(document.querySelector(${JSON.stringify(rootItem)}))`);
    await wait(250);
    await selectImage();
    const edgesAfterMotion = await inspectEdges();
    checks.imageEdgesSurviveCollapseExpand = edgesAfterMotion.every(edge => edge.visible);
    const screenshots = path.join(__dirname, '..', 'dist', 'qa-outline-interactions');
    fs.mkdirSync(screenshots, {recursive:true});
    fs.writeFileSync(path.join(screenshots, 'image-edges.png'), (await win.webContents.capturePage()).toPNG());
    await move(rootItem);
    fs.writeFileSync(path.join(screenshots, 'parent-hover.png'), (await win.webContents.capturePage()).toPNG());
    await run('window.qijianEditor.undo()');
    await wait(250);
    checks.undoExpansionCollapses = (await inspect(rootItem)).collapsed;
    await move(rootItem);
    fs.writeFileSync(path.join(screenshots, 'parent-collapsed.png'), (await win.webContents.capturePage()).toPNG());
    await run('window.qijianEditor.undo()');
    await wait(60);
    checks.undoRoundTripExact = before === await run('JSON.stringify(window.qijianEditor.getDocumentJSON())');
    console.log(JSON.stringify({checks, rowHover, persistentHover, collapsed, edges, edgesAfterMotion},null,2));
    if (!Object.values(checks).every(Boolean)) code=1;
  } catch (error) { console.error(error); code=1; }
  finally {
    if (path.dirname(root) === os.tmpdir() && path.basename(root).startsWith('qijian-outline-interaction-')) {
      try { fs.rmSync(root,{recursive:true,force:true}); } catch (_) {}
    }
    app.exit(code);
  }
});
