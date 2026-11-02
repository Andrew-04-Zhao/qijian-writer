const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { pathToFileURL } = require('url');

const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qijian-library-source-'));
const targetParent = fs.mkdtempSync(path.join(os.tmpdir(), 'qijian-library-target-'));
const targetRoot = path.join(targetParent, '栖简文稿库');
process.env.QIJIAN_TEST_LIBRARY_ROOT = sourceRoot;
require('../src/main.js');

app.whenReady().then(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 1400));
    const window = BrowserWindow.getAllWindows()[0];
    const attachment = path.join(sourceRoot, 'attachments', '迁移图片.png');
    fs.mkdirSync(path.dirname(attachment), { recursive: true });
    fs.writeFileSync(attachment, Buffer.from('89504e470d0a1a0a', 'hex'));
    const oldImageUrl = `file://${attachment.replace(/\\/g, '/')}`;
    const rendererScript = "(async () => {" +
      "const updates=[];const stop=window.qijian.onLibraryMigrationProgress(update=>updates.push(update));" +
      "window.qijianEditor.setContent('<p>迁移后仍应存在的内容</p><div class=\"image-row\"><figure class=\"editor-image\"><img src=\"" + oldImageUrl + "\"><figcaption></figcaption></figure></div>',null);syncActiveDoc();library.writeRevision=(Number(library.writeRevision)||0)+1;await flushSave();await window.qijian.backupLibrary();" +
      "const moved=await window.qijian.migrateLibrary(" + JSON.stringify(targetRoot) + ",library);" +
      "const loaded=await window.qijian.loadLibrary();const storage=await window.qijian.libraryStorageInfo();await window.qijian.restoreLibraryBackup();const restored=await window.qijian.loadLibrary();stop();return {moved,loaded,restored,storage,updates};" +
    "})()";
    const result = await window.webContents.executeJavaScript(rendererScript);
    const migratedBackup = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(targetRoot, 'backups', 'library-manual.qijian-backup.gz'))).toString('utf8'));
    const checks = {
      targetExists: fs.existsSync(path.join(targetRoot, 'library.json')),
      oldLocationRemoved: !fs.existsSync(sourceRoot),
      savedContentKept: result.loaded.data.nodes.some(item => String(item.content || '').includes('迁移后仍应存在的内容')),
      runtimeUsesNewLocation: result.loaded.root === targetRoot,
      progressReported: result.updates.some(update => update.percent >= 80) && result.updates.some(update => update.percent === 100),
      storageReported: result.storage.bytes > 0 && result.storage.fileCount > 0,
      attachmentMoved: fs.existsSync(path.join(targetRoot, 'attachments', '迁移图片.png')),
      imagePathRebased: result.loaded.data.nodes.some(item => String(item.content || '').includes(pathToFileURL(targetRoot).href) && !String(item.content || '').includes(pathToFileURL(sourceRoot).href)),
      structuredImagePathRebased: result.loaded.data.nodes.some(item => JSON.stringify(item.contentJson || {}).includes(pathToFileURL(targetRoot).href) && !JSON.stringify(item.contentJson || {}).includes(pathToFileURL(sourceRoot).href)),
      manualBackupMoved: migratedBackup.library.nodes.some(item => String(item.content || '').includes('迁移后仍应存在的内容')),
      manualBackupIncludesImage: migratedBackup.attachments.length === 1 && migratedBackup.attachments[0].bytes > 0,
      manualBackupRestoresAfterMigration: result.restored.data.nodes.some(item => String(item.content || '').includes('迁移后仍应存在的内容') && String(item.content || '').includes(pathToFileURL(targetRoot).href)),
    };
    const passed = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({ passed, checks }, null, 2));
    app.exit(passed ? 0 : 1);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
