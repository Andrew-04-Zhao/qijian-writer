const {app, BrowserWindow} = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qijian-scrollbar-'));
const stamp = new Date().toISOString();
const paragraphs = Array.from({length: 80}, (_, index) => `<p>正文滚动测试第 ${index + 1} 行</p>`).join('');
const nodes = Array.from({length: 28}, (_, index) => ({
  id: `scroll-doc-${index}`,
  type: 'document',
  title: `滚动条测试文稿 ${String(index + 1).padStart(2, '0')}`,
  parentId: null,
  order: index,
  createdAt: stamp,
  updatedAt: stamp,
  deletedAt: null,
  content: index === 0 ? `<h1>滚动条测试</h1>${paragraphs}` : `<h2>文稿 ${index + 1}</h2><p>用于检查中间栏滚动条。</p>`,
  contentJson: null,
  versions: []
}));
fs.writeFileSync(path.join(root, 'library.json'), JSON.stringify({nodes, activeId: nodes[0].id, settings: {}, writeRevision: 0}), 'utf8');
process.env.QIJIAN_TEST_LIBRARY_ROOT = root;
require('../src/main.js');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  let code = 0;
  try {
    await wait(1800);
    const win = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('index.html'));
    win.setSize(1000, 700);
    await wait(350);
    const inspect = () => win.webContents.executeJavaScript(`(() => {const inspectOne=element=>({overflow:element.scrollHeight>element.clientHeight,standard:getComputedStyle(element).scrollbarWidth,button:getComputedStyle(element,'::-webkit-scrollbar-button').display,thumb:getComputedStyle(element,'::-webkit-scrollbar-thumb').backgroundColor,active:element.classList.contains('scrollbar-active')});return {list:inspectOne(document.querySelector('#docList')),writing:inspectOne(document.querySelector('.writing'))}})()`);
    const initial = await inspect();
    await win.webContents.executeJavaScript(`(() => {const list=document.querySelector('#docList');list.dispatchEvent(new WheelEvent('wheel',{deltaY:180,bubbles:true}));list.scrollTop+=180})()`);
    await wait(220);
    const middleActive = await inspect();
    await win.capturePage();
    await wait(120);
    fs.writeFileSync(path.join(__dirname, '../dist/qa-scrollbars-middle-active.png'), (await win.capturePage()).toPNG());
    await wait(1100);
    const faded = await inspect();
    await win.webContents.executeJavaScript(`(() => {const writing=document.querySelector('.writing');writing.dispatchEvent(new WheelEvent('wheel',{deltaY:180,bubbles:true}));writing.scrollTop+=180})()`);
    await wait(220);
    const writingActive = await inspect();
    fs.writeFileSync(path.join(__dirname, '../dist/qa-scrollbars.png'), (await win.capturePage()).toPNG());
    console.log({initial,middleActive,faded,writingActive});
    const transparent = value => value === 'rgba(0, 0, 0, 0)';
    if (!initial.list.overflow || !initial.writing.overflow || initial.list.standard !== 'auto' || initial.writing.standard !== 'auto' || initial.list.button !== 'none' || initial.writing.button !== 'none' || !transparent(initial.list.thumb) || !transparent(initial.writing.thumb) || !middleActive.list.active || transparent(middleActive.list.thumb) || middleActive.writing.active || !transparent(middleActive.writing.thumb) || faded.list.active || faded.writing.active || !transparent(faded.list.thumb) || !transparent(faded.writing.thumb) || writingActive.list.active || !writingActive.writing.active || !transparent(writingActive.list.thumb) || transparent(writingActive.writing.thumb)) throw new Error(JSON.stringify({initial,middleActive,faded,writingActive}));
  } catch (error) {
    console.error(error);
    code = 1;
  } finally {
    try { fs.rmSync(root, {recursive: true, force: true}); } catch {}
    app.exit(code);
  }
});
