const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { fileURLToPath, pathToFileURL } = require('url');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qijian-manual-backup-'));
const attachments = path.join(root, 'attachments');
const backups = path.join(root, 'backups');
fs.mkdirSync(attachments, { recursive: true });
fs.mkdirSync(backups, { recursive: true });
const originalImage = path.join(attachments, 'backup-image.png');
fs.writeFileSync(originalImage, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
const oldTime = new Date(Date.now() - 60 * 60 * 1000);
fs.utimesSync(originalImage, oldTime, oldTime);
const imageUrl = pathToFileURL(originalImage).href;
const historyImage = path.join(attachments, 'history-only.png');
fs.writeFileSync(historyImage, fs.readFileSync(originalImage));
const historyImageUrl = pathToFileURL(historyImage).href;
const stamp = new Date().toISOString();
const initial = {
  version: 1,
  settings: {},
  nodes: [{
    id: 'backup-doc', type: 'document', title: '备份测试', parentId: null, order: 1,
    createdAt: stamp, updatedAt: stamp, deletedAt: null,
    content: `<p>初始正文<img src="${imageUrl}"></p>`, contentJson: null,
    versions: [{ id: 'old-version', at: stamp, content: `<p>不应进入备份的历史正文</p><img src="${historyImageUrl}">` }],
  }],
  activeId: 'backup-doc', historyResetVersion: 1, historyPolicyVersion: 1,
  documentNormalizationVersion: 8, writeRevision: 0,
};
fs.writeFileSync(path.join(root, 'library.json'), JSON.stringify(initial, null, 2));
fs.writeFileSync(path.join(backups, 'library-auto-old.json'), JSON.stringify(initial));
process.env.QIJIAN_TEST_LIBRARY_ROOT = root;
require('../src/main.js');

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const mainWindow = () => BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('index.html'));
const backupFile = path.join(backups, 'library-manual.qijian-backup.gz');
const readBackup = () => JSON.parse(zlib.gunzipSync(fs.readFileSync(backupFile)).toString('utf8'));
const firstImagePath = library => {
  const match = String(library.nodes.find(node => node.type === 'document')?.content || '').match(/<img[^>]+src=["']([^"']+)/i);
  return match ? fileURLToPath(match[1]) : '';
};

app.whenReady().then(async () => {
  try {
    await wait(2200);
    const win = mainWindow();
    if (!win) throw new Error('Main window missing');
    const compressibleText = '压缩测试内容。'.repeat(1000);
    const backupHtml = `<h1>备份中的标题</h1><p>${compressibleText}<img src="${imageUrl}"></p>`;
    await win.webContents.executeJavaScript(`(async()=>{
      window.qijianEditor.setContent(${JSON.stringify(backupHtml)},null);
      persist(true);
      await createManualBackup();
      return true;
    })()`);

    const first = readBackup();
    const rawBytes = Buffer.byteLength(JSON.stringify(first));
    const firstFiles = fs.readdirSync(backups);
    const checks = {
      oneFixedCompressedBackup: firstFiles.length === 1 && firstFiles[0] === path.basename(backupFile),
      latestEditorStateSaved: first.library.nodes[0].content.includes('备份中的标题') && first.library.nodes[0].content.includes('/doc-backup-doc/'),
      historyExcluded: first.historyIncluded === false && first.library.nodes[0].versions.length === 0,
      imageEmbedded: first.attachments.length === 1 && first.attachments[0].bytes > 0 && first.attachments[0].data.length > 0,
      compressed: fs.statSync(backupFile).size < rawBytes,
      restoreButtonPresent: await win.webContents.executeJavaScript("!!document.querySelector('#restoreBackupFromSettings')"),
    };

    const currentHtml = '<h1>当前状态</h1><p>备份之后的新改动</p>';
    await win.webContents.executeJavaScript(`(async()=>{
      window.qijianEditor.setContent(${JSON.stringify(currentHtml)},null);
      persist(true);
      await flushSave();
      return true;
    })()`);
    checks.liveImageRetainedForUndo = fs.existsSync(firstImagePath(first.library));
    checks.historyOnlyImageExcluded = first.attachments.length === 1 && fs.existsSync(historyImage);
    checks.noDailyBackup = !fs.readdirSync(backups).some(name => name.startsWith('library-auto-'));

    await win.webContents.executeJavaScript('window.qijian.restoreLibraryBackup()');
    const restoredBackupState = JSON.parse(fs.readFileSync(path.join(root, 'library.json'), 'utf8'));
    const swappedCurrentState = readBackup();
    const restoredImage = firstImagePath(restoredBackupState);
    checks.restoresCompleteBackup = restoredBackupState.nodes[0].content.includes('备份中的标题') && fs.existsSync(restoredImage);
    checks.currentBecomesBackup = swappedCurrentState.library.nodes[0].content.includes('备份之后的新改动') && swappedCurrentState.attachments.length === 0;
    checks.restoredHistoryEmpty = restoredBackupState.nodes[0].versions.length === 0;

    await win.webContents.executeJavaScript('window.qijian.restoreLibraryBackup()');
    const restoredCurrentState = JSON.parse(fs.readFileSync(path.join(root, 'library.json'), 'utf8'));
    const swappedBackupState = readBackup();
    checks.secondRestoreSwapsBack = restoredCurrentState.nodes[0].content.includes('备份之后的新改动') && swappedBackupState.library.nodes[0].content.includes('备份中的标题');
    checks.swappedBackupKeepsImage = swappedBackupState.attachments.length === 1 && swappedBackupState.attachments[0].bytes > 0;
    checks.allBackupHistoryEmpty = swappedBackupState.library.nodes[0].versions.length === 0;

    const missingUrl=pathToFileURL(path.join(attachments,'missing-original.png')).href;
    await win.webContents.executeJavaScript(`(async()=>{const state=(await window.qijian.loadLibrary()).data;state.nodes[0].content+='<img src="'+${JSON.stringify(missingUrl)}+'">';state.nodes[0].contentJson=null;state.writeRevision++;await window.qijian.saveLibrary(state);return window.qijian.backupLibrary()})()`);
    const partial=readBackup();
    checks.missingImageExplicitlyReported=partial.missingImages.length===1&&partial.missingImages[0].images[0].source===missingUrl;
    checks.missingReferencePreserved=partial.library.nodes[0].content.includes(missingUrl);
    console.log(JSON.stringify(checks, null, 2));
    app.exit(Object.values(checks).every(Boolean) ? 0 : 1);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
}).catch(error => {
  console.error(error);
  app.exit(1);
});