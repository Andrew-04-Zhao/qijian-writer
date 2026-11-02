const {app, BrowserWindow} = require('electron');
const fs = require('fs'), os = require('os'), path = require('path');
const {pathToFileURL} = require('url');
const assert = require('assert/strict');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qijian-detached-map-'));
const stamp = new Date().toISOString();
fs.writeFileSync(path.join(root, 'library.json'), JSON.stringify({
  nodes:[{id:'map-test',type:'document',title:'思维导图验证',parentId:null,order:1,createdAt:stamp,updatedAt:stamp,deletedAt:null,content:'<p>准备</p>',versions:[]}],
  activeId:'map-test',settings:{theme:'paper'},writeRevision:0
}));
process.env.QIJIAN_TEST_LIBRARY_ROOT = root;
process.env.QIJIAN_TEST_DETACHED = '1';
require('../src/main.js');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  let code = 0;
  try {
    await wait(2400);
    const main = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('index.html'));
    const run = source => main.webContents.executeJavaScript(source);
    const imageFile = path.join(root, 'attachments', 'doc-map-test', 'map-test.gif');
    fs.mkdirSync(path.dirname(imageFile), {recursive:true});
    fs.writeFileSync(imageFile, Buffer.from('R0lGODlhAQABAPAAAIbG5f///yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'));
    const rich = '<div class="image-row"><figure class="editor-image" data-image-id="map-image"><img src="'+pathToFileURL(imageFile).href+'" alt="导图图片"></figure></div>'
      + '<div class="editor-formula formula-block" data-latex="x_i"></div>'
      + '<div class="table-block"><table><tbody><tr><th>列</th></tr><tr><td>内容</td></tr></tbody></table></div>';
    const html = '<h2>组合文稿</h2><p>正文</p><ul class="outline-list"><li><p>主题</p><ul class="outline-list">'
      + '<li><p>分支甲</p><ul class="outline-list"><li><p>子条目</p><ul class="outline-list"><li><p>孙条目</p>'+rich+'</li></ul></li></ul></li>'
      + '<li><p>分支乙</p></li></ul></li></ul><p>结束</p>';
    await run('window.qijianEditor.setContent('+JSON.stringify(html)+',null)');
    const snapshot = () => run('JSON.stringify(window.qijianEditor.getDocumentJSON())');
    const beforeEdit = await snapshot();
    await run("window.qijianEditor.setTextSelection(1);window.qijianEditor.insertText('编辑');true");
    const beforeMap = await snapshot();
    const selection = await run('window.qijianEditor.getSelection()');
    const editorScroll = await run("document.querySelector('.editor-wrap').scrollTop");
    await run('openMindmapForOutline(0);true');
    await wait(650);
    const child = BrowserWindow.getAllWindows().find(win => win!==main && win.webContents.getURL()==='about:blank');
    assert(child, '应创建独立思维导图窗口');
    const mapRun = source => child.webContents.executeJavaScript(source);
    const labels = () => mapRun("[...document.querySelectorAll('.map-node>title')].map(node=>node.textContent)");
    const has = (names, label) => names.some(name => name.startsWith(label));
    const clickCollapse = async label => {
      child.show(); child.focus();
      const point = await mapRun(`(()=>{
        const node=[...document.querySelectorAll('.map-node')].find(node=>node.querySelector(':scope>title').textContent.startsWith(${JSON.stringify(label)}));
        const control=node?.querySelector('.map-collapse circle');
        if(!control)throw new Error('找不到折叠按钮：'+${JSON.stringify(label)});
        control.scrollIntoView({block:'nearest',inline:'nearest'});
        const r=control.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};
      })()`);
      child.webContents.sendInputEvent({type:'mouseMove',...point});
      child.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
      child.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
      await wait(220);
    };
    const action = async name => {
      await mapRun(`document.querySelector('[data-map-action="${name}"]').click()`);
      await wait(250);
    };
    assert(has(await labels(),'孙条目'), '初始应显示全部层级');
    await clickCollapse('分支甲');
    let visible = await labels();
    assert(!has(visible,'子条目') && !has(visible,'孙条目') && has(visible,'分支乙'), '收起分支甲应隐藏全部后代，保留同级分支');
    await clickCollapse('分支甲');
    assert(has(await labels(),'孙条目'), '展开应恢复全部后代');
    await clickCollapse('子条目');
    assert(!has(await labels(),'孙条目'), '子层级可以独立收起');
    await clickCollapse('分支甲');
    await clickCollapse('分支甲');
    visible = await labels();
    assert(has(visible,'子条目') && !has(visible,'孙条目'), '父项收起再展开应保留子项折叠状态');
    await action('plus');
    await action('minus');
    await action('fit');
    const fit = await mapRun("(()=>{const body=document.querySelector('.mindmap-window-body'),svg=body.querySelector('svg');return svg.getBoundingClientRect().width<=body.clientWidth+1&&svg.getBoundingClientRect().height<=body.clientHeight+1})()");
    assert(fit, '适应窗口应正常');
    const initial = child.getSize();
    await action('fullscreen');
    await wait(200);
    const enlarged = child.getSize();
    assert(enlarged[0]>initial[0] || enlarged[1]>initial[1], '全屏应放大窗口');
    await action('fullscreen');
    await wait(200);
    const restored = child.getSize();
    assert(Math.abs(restored[0]-initial[0])<12 && Math.abs(restored[1]-initial[1])<12, '退出全屏应还原尺寸');
    assert(!has(await labels(),'孙条目'), '缩放、适应、全屏后仍应保持折叠状态');
    await clickCollapse('子条目');
    assert(has(await labels(),'孙条目'), '刷新窗口后折叠按钮仍然可用');
    await clickCollapse('主题');
    assert.equal((await labels()).length,1, '根主题也可以收起');
    await clickCollapse('主题');
    assert(has(await labels(),'孙条目'), '根主题可以重新展开');
    await action('close');
    assert(child.isDestroyed() || !child.isVisible(), '关闭按钮正常');
    assert.equal(await snapshot(),beforeMap, '导图折叠不能改动正文、图片、公式和表格');
    assert.deepEqual(await run('window.qijianEditor.getSelection()'),selection, '导图折叠不能改变正文选区');
    assert.equal(await run("document.querySelector('.editor-wrap').scrollTop"),editorScroll, '导图折叠不能滚动正文');
    await run('window.qijianEditor.undo()');
    assert.equal(await snapshot(),beforeEdit, '一次撤销仍然对应先前的文字编辑');
    await run('window.qijianEditor.redo()');
    assert.equal(await snapshot(),beforeMap, '重做仍然恢复先前文字编辑');
    console.log('PASS: 独立窗口多层收起/展开、嵌套状态、缩放/适应/全屏/关闭、混合文稿/选区/滚动/撤销重做');
  } catch (error) { console.error(error); code=1; }
  finally {
    if(path.dirname(root)===os.tmpdir() && path.basename(root).startsWith('qijian-detached-map-')) {
      try { fs.rmSync(root,{recursive:true,force:true}); } catch (_) {}
    }
    app.exit(code);
  }
});
