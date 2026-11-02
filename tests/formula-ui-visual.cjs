const {app, BrowserWindow} = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qijian-formula-ui-'));
process.env.QIJIAN_TEST_LIBRARY_ROOT = root;
process.env.QIJIAN_TEST_DETACHED = '1';
require('../src/main.js');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  let code = 0;
  try {
    await wait(2400);
    const main = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('index.html'));
    await main.webContents.executeJavaScript(`openFormulaEditor(null,'block');true`);
    await wait(550);
    await main.webContents.executeJavaScript(`(() => {const source=document.querySelector('#formulaSource');source.value='T_t=\\\\exp\\\\left[-\\\\frac{1}{2}\\\\left(\\\\frac{d_{\\\\mathrm{circ}}(t,\\\\tau)}{45}\\\\right)^2\\\\right]\\\\tag{6}';source.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
    await wait(450);
    const dialog = BrowserWindow.getAllWindows().find(win => win !== main && win.isVisible() && win.webContents.getTitle() === '公式编辑器');
    if (!dialog) throw new Error('没有打开公式编辑器窗口');
    const layout = await dialog.webContents.executeJavaScript(`(() => {const preview=document.querySelector('#formulaPreview'),tag=preview.querySelector('.katex-html>.tag'),base=preview.querySelector('.katex-html>.base'),actions={subtitle:!!document.querySelector('.formula-editor-card>header span'),help:!!document.querySelector('.formula-editor-body small')};if(!tag||!base)return{tag:false,actions};const pr=preview.getBoundingClientRect(),tr=tag.getBoundingClientRect(),br=base.getBoundingClientRect();return{tag:true,rightAligned:Math.abs((pr.right-22)-tr.right)<4,separated:tr.left>br.right+6,actions,window:[innerWidth,innerHeight]}})()`);
    await dialog.capturePage();
    await wait(150);
    fs.writeFileSync(path.join(__dirname, '../dist/qa-formula-editor.png'), (await dialog.capturePage()).toPNG());
    console.log(layout);
    if (!layout.tag || !layout.rightAligned || !layout.separated || layout.actions.subtitle || layout.actions.help) throw new Error(JSON.stringify(layout));
  } catch (error) {
    console.error(error);
    code = 1;
  } finally {
    try { fs.rmSync(root, {recursive: true, force: true}); } catch {}
    app.exit(code);
  }
});
