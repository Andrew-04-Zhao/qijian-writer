const { app, BrowserWindow, dialog, ipcMain, shell, nativeImage, clipboard, screen, net } = require('electron');
const { buildImageHtml } = require('./image-export');
const {buildPdfHtml,pdfLayout}=require('./pdf-export');
const {registerImageProtocol,createImageScope}=require('./export-images');
const {writeBackup,readBackupInfo}=require('./backup-stream');
app.whenReady().then(registerImageProtocol);
const {createSpellcheckController, seedBundledDictionaries} = require('./spellcheck');
let spellcheckController;
const {createDisplayPreferences} = require('./display-preferences');
let displayPreferences;
const { documentImageDirectory, libraryImageIssues, describeImageIssues, adoptLibraryImageSources, adoptRemoteLibraryImageSources, collectLibraryImageSources, replaceLibraryImageSources, localPathFromImageSource, removeUnreferencedAttachments } = require('./library-images');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { randomUUID, createHash } = require('crypto');
let Document,Packer,Paragraph,TextRun,HeadingLevel,AlignmentType,ExternalHyperlink,ImageRun;
function loadWordExporter(){if(!Document)({Document,Packer,Paragraph,TextRun,HeadingLevel,AlignmentType,ExternalHyperlink,ImageRun}=require('docx'));}
const { fileURLToPath, pathToFileURL } = require('url');

let mainWindow, splashWindow, splashStartedAt=0, startupFallback;
let startupStatus = { percent: 0, label: '正在启动' };
let sessionLibraryRoot = process.env.QIJIAN_TEST_LIBRARY_ROOT || null;

function defaultLibraryRoot() {
  return path.join(app.getPath('documents'), '栖简文稿库');
}

function libraryLocationFile() {
  return path.join(app.getPath('userData'), 'library-location.json');
}

function configuredLibraryRoot() {
  if (sessionLibraryRoot) return sessionLibraryRoot;
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(libraryLocationFile(), 'utf8'));
  } catch (_) {}
  try {
    const installed = JSON.parse(fs.readFileSync(path.join(path.dirname(process.execPath), 'library-selection.json'), 'utf8').replace(/^\uFEFF/, ''));
    if (typeof installed.root === 'string' && path.isAbsolute(installed.root) && (!saved?.configuredAt || installed.installedAt > saved.configuredAt)) {
      saveLibraryLocation(installed.root);
      return path.resolve(installed.root);
    }
  } catch (_) {}
  if (typeof saved?.root === 'string' && path.isAbsolute(saved.root)) return path.resolve(saved.root);
  return defaultLibraryRoot();
}

function saveLibraryLocation(root) {
  if (process.env.QIJIAN_TEST_LIBRARY_ROOT) { sessionLibraryRoot = root; return; }
  fs.mkdirSync(path.dirname(libraryLocationFile()), { recursive: true });
  atomicWrite(libraryLocationFile(), JSON.stringify({ root, configuredAt: new Date().toISOString() }, null, 2));
}

function dataPaths() {
  const root = configuredLibraryRoot();
  return {
    root,
    library: path.join(root, 'library.json'),
    attachments: path.join(root, 'attachments'),
    backups: path.join(root, 'backups'),
    manualBackup: path.join(root, 'backups', 'library-manual.qijian-backup.gz'),
    windowState: path.join(root, 'window-state.json'),
  };
}

function ensureLibrary() {
  const paths = dataPaths();
  for (const dir of [paths.root, paths.attachments, paths.backups]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(paths.library)) {
    const now = new Date().toISOString();
    const initial = {
      version: 1,
      settings: {
        theme: 'paper', fontFamily: 'system', latinFont: 'system', chineseFont: 'system', fontSize: 18,
        lineHeight: 1.8, paragraphSpacing: 12, pageWidth: 760,
      },
      nodes: [
        { id: 'welcome-folder', type: 'folder', title: '开始使用', parentId: null, order: 0, createdAt: now },
        {
          id: 'welcome-doc', type: 'document', title: '欢迎来到栖简', parentId: 'welcome-folder', order: 0,
          createdAt: now, updatedAt: now, deletedAt: null,
          content: '<h1>欢迎来到栖简</h1><p>这是一个只属于你的本地写作空间。</p><h2>从这里开始</h2><p>在左侧新建文档或文件夹，在右侧调整字体、行距与页面主题。标题会自动生成大纲，也可以切换为思维导图。</p>',
          versions: [],
        },
      ],
      activeId: 'welcome-doc',
      historyResetVersion: 1,
      historyPolicyVersion: 1,
      documentNormalizationVersion: 8,
      savedAt: now,
    };
    fs.writeFileSync(paths.library, JSON.stringify(initial, null, 2), 'utf8');
  }
  return paths;
}

function atomicWrite(file, content) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, content, 'utf8');
  fs.renameSync(temporary, file);
}

function atomicWriteBuffer(file, content) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}

function currentStateLibrary(library) {
  const snapshot = JSON.parse(JSON.stringify({...library,nodes:(library.nodes||[]).map(node=>({...node,versions:[]}))}));
  for (const node of snapshot.nodes || []) {
    if (node.type === 'document' || Array.isArray(node.versions)) node.versions = [];
  }
  delete snapshot.manualBackup;
  return snapshot;
}

function isInsideDirectory(file, directory) {
  const relative = path.relative(path.resolve(directory), path.resolve(file));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function prepareCompleteBackup(library, paths) {
  const snapshot = currentStateLibrary(library);
  const sources = new Set();
  collectLibraryImageSources(snapshot, sources);
  const issues = libraryImageIssues(snapshot, paths.attachments);
  const external = issues.filter(issue => issue.reason === 'external');
  if (external.length) {
    const documents = describeImageIssues(snapshot, external).map(item => item.title).join('、');
    throw new Error('图片尚未完成入库，未创建备份：' + documents);
  }
  const missing = issues.filter(issue => issue.reason === 'missing');
  const missingSources = new Set(missing.map(issue => issue.source));
  const attachments = [];
  for (const source of sources) {
    if (missingSources.has(source)) continue;
    if (/^data:image\//i.test(source)) continue;
    const file = localPathFromImageSource(source);
    if (!file || !isInsideDirectory(file, paths.attachments) || !fs.existsSync(file)) {
      throw new Error('备份失败：文稿中仍有未保存到文稿库的图片');
    }
    attachments.push({source,name:path.basename(file),file});
  }
  return {snapshot,images:attachments,missingImages:describeImageIssues(snapshot,missing)};
}

function readCompleteBackup(paths) {
  if (!fs.existsSync(paths.manualBackup)) throw new Error('没有可恢复的备份');
  const packed = fs.readFileSync(paths.manualBackup);
  let bundle;
  try { bundle = JSON.parse(zlib.gunzipSync(packed).toString('utf8')); }
  catch (_) { throw new Error('备份文件已损坏，无法恢复'); }
  if (bundle?.format !== 'qijian-complete-backup' || bundle.version !== 1 || !Array.isArray(bundle.library?.nodes) || !Array.isArray(bundle.attachments)) {
    throw new Error('备份文件格式无效，无法恢复');
  }
  for (const attachment of bundle.attachments) {
    const data = Buffer.from(String(attachment.data || ''), 'base64');
    const digest = createHash('sha256').update(data).digest('hex');
    if (!data.length || data.length !== attachment.bytes || digest !== attachment.sha256) throw new Error('备份中的图片已损坏，无法恢复');
  }
  return {bundle, bytes:packed.length, backupId:createHash('sha256').update(packed).digest('hex')};
}

function restoreBackupImages(bundle, paths, createdFiles) {
  const restored = currentStateLibrary(bundle.library);
  const images = new Map(bundle.attachments.map(item => [item.source, item]));
  for (const doc of restored.nodes.filter(node => node.type === 'document')) {
    const sources = new Set(), replacements = new Map();
    collectLibraryImageSources(doc, sources);
    for (const source of sources) {
      const attachment = images.get(source);
      if (!attachment) continue;
      const extension = path.extname(String(attachment.name || '')).toLowerCase();
      if (!/^\.(?:png|jpe?g|gif|webp|svg|bmp|avif)$/.test(extension)) throw new Error('备份中包含不支持的图片格式');
      const directory = documentImageDirectory(paths.attachments, doc.id);
      const original = localPathFromImageSource(source);
      // Reuse only the backup's exact original path within this document's folder.
      // The hash is an integrity check, not content deduplication between documents.
      if (original && isInsideDirectory(original, directory)) {
        try {
          const data = fs.readFileSync(original);
          if (data.length === attachment.bytes && createHash('sha256').update(data).digest('hex') === attachment.sha256) {
            replacements.set(source, pathToFileURL(path.resolve(original)).href);
            continue;
          }
        } catch (_) {}
      }
      fs.mkdirSync(directory, { recursive: true });
      const destination = path.join(directory, `restored-${Date.now()}-${randomUUID()}${extension}`);
      const handle = fs.openSync(destination, 'wx');
      createdFiles.push(destination);
      try { fs.writeFileSync(handle, Buffer.from(attachment.data, 'base64')); }
      finally { fs.closeSync(handle); }
      replacements.set(source, pathToFileURL(destination).href);
    }
    replaceLibraryImageSources(doc, replacements);
  }
  return restored;
}

function readWindowState() {
  try { return JSON.parse(fs.readFileSync(dataPaths().windowState, 'utf8')); } catch { return {}; }
}

function displayWindowOptions() {
  const saved = readWindowState();
  const fallbackDisplay = screen.getPrimaryDisplay();
  const candidate = saved.bounds && Number.isFinite(saved.bounds.x) && Number.isFinite(saved.bounds.y)
    ? screen.getDisplayMatching(saved.bounds) : fallbackDisplay;
  const area = candidate.workArea;
  const minWidth = Math.max(640, Math.floor(area.width / 2));
  const minHeight = Math.max(420, Math.floor(area.height / 2));
  const validSaved = saved.bounds && saved.bounds.width >= minWidth && saved.bounds.height >= minHeight
    && saved.bounds.x < area.x + area.width - 80 && saved.bounds.y < area.y + area.height - 50
    && saved.bounds.x + saved.bounds.width > area.x + 80 && saved.bounds.y + saved.bounds.height > area.y + 50;
  const width = validSaved ? saved.bounds.width : Math.max(minWidth, Math.round(area.width * .84));
  const height = validSaved ? saved.bounds.height : Math.max(minHeight, Math.round(area.height * .78));
  return {
    bounds: validSaved ? saved.bounds : {
      x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2), width, height,
    },
    minWidth, minHeight, maximized: !!saved.maximized,
  };
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const state = { bounds: mainWindow.isMaximized() ? mainWindow.getNormalBounds() : mainWindow.getBounds(), maximized: mainWindow.isMaximized() };
  try { atomicWrite(dataPaths().windowState, JSON.stringify(state, null, 2)); } catch (error) { console.error('Window state save failed:', error); }
}


function createSplashWindow() {
  splashStartedAt = Date.now();
  splashWindow = new BrowserWindow({
    width: 390, height: 246, frame: false, resizable: false, show: false,
    transparent: false, backgroundColor: '#eee8d8', alwaysOnTop: true, skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, 'splash-preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  splashWindow.webContents.once('did-finish-load', () => {
    if (!splashWindow || splashWindow.isDestroyed()) return;
    splashWindow.webContents.send('startup-progress', startupStatus);
    splashWindow.show();
  });
  splashWindow.loadFile(path.join(__dirname, 'renderer', 'splash.html'));
}

function updateSplash(percent, label) {
  startupStatus = { percent: Math.max(0, Math.min(100, percent)), label };
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents.send('startup-progress', startupStatus);
}

function revealMainWindow(maximized=false) {
  clearTimeout(startupFallback);
  const elapsed = Date.now() - splashStartedAt;
  const delay = splashWindow ? Math.max(80, 650 - elapsed) : 0;
  updateSplash(100, '准备完成');
  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (maximized) mainWindow.maximize();
    mainWindow.show();
    mainWindow.focus();
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
    splashWindow = null;
  }, delay);
}

function createWindow() {
  const windowOptions = displayWindowOptions();
  mainWindow = new BrowserWindow({
    ...windowOptions.bounds,
    minWidth: windowOptions.minWidth,
    minHeight: windowOptions.minHeight,
    backgroundColor: '#f4f1ea',
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  displayPreferences ||= createDisplayPreferences(path.join(app.getPath('userData'), 'display-preferences.json'), screen);
  displayPreferences.attach(mainWindow);
  spellcheckController = createSpellcheckController(mainWindow.webContents.session, state => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('spellcheck:status-changed', state);
  });
  let windowStateTimer;
  const queueWindowState = () => { clearTimeout(windowStateTimer); windowStateTimer = setTimeout(saveWindowState, 250); };
  const updateMinimumSize = () => {
    const area = screen.getDisplayMatching(mainWindow.getBounds()).workArea;
    mainWindow.setMinimumSize(Math.max(640, Math.floor(area.width / 2)), Math.max(420, Math.floor(area.height / 2)));
  };
  mainWindow.once('ready-to-show', () => { if (!splashWindow) revealMainWindow(windowOptions.maximized); });
  mainWindow.webContents.once('did-finish-load', () => updateSplash(62, '正在载入写作界面'));
  mainWindow.__startupMaximized = windowOptions.maximized;
  mainWindow.on('resize', queueWindowState);
  mainWindow.on('move', () => { updateMinimumSize(); queueWindowState(); });
  mainWindow.on('close', () => { clearTimeout(windowStateTimer); saveWindowState(); });
  mainWindow.webContents.on('render-process-gone', (_event, details) => console.error('Renderer stopped:', details));
  mainWindow.webContents.on('did-fail-load', (_event, code, description) => console.error('Page load failed:', code, description));
  mainWindow.webContents.setWindowOpenHandler(({url}) => url==='about:blank'?{action:'allow',overrideBrowserWindowOptions:{frame:false,autoHideMenuBar:true,backgroundColor:'#fcfcfc',minWidth:120,minHeight:100,parent:mainWindow,modal:false,webPreferences:{contextIsolation:true,nodeIntegration:false}}}:{action:'deny'});
  mainWindow.webContents.on('did-create-window', child => {
    displayPreferences.attach(child, true);
    child.setMenu(null);
    child.setParentWindow(mainWindow);
    const placeWordStats = () => {
      if (child.isDestroyed() || child.getTitle() !== '字数统计' || !mainWindow || mainWindow.isDestroyed()) return;
      const parent = mainWindow.getBounds(), [width, height] = child.getSize(), area = screen.getDisplayMatching(parent).workArea;
      const x = Math.max(area.x, Math.min(area.x + area.width - width, parent.x + parent.width - width - 18));
      const y = Math.max(area.y, Math.min(area.y + area.height - height, parent.y + 40));
      child.setPosition(Math.round(x), Math.round(y), false);
    };
    child.webContents.on('page-title-updated', (_event, title) => { if (title === '字数统计') setTimeout(placeWordStats, 30); });
    setTimeout(placeWordStats, 180);
  });
  if (process.env.QIJIAN_DIAGNOSTIC_SCREENSHOT) {
    mainWindow.webContents.once('did-finish-load', () => setTimeout(async () => {
      const image = await mainWindow.capturePage();
      fs.writeFileSync(process.env.QIJIAN_DIAGNOSTIC_SCREENSHOT, image.toPNG());
    }, 1200));
  }
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'),process.env.QIJIAN_TEST_LIBRARY_ROOT&&!process.env.QIJIAN_TEST_DETACHED?{query:{embeddedTest:'1'}}:undefined);
}

app.whenReady().then(() => {
  seedBundledDictionaries(app.getPath('sessionData'));
  const showSplash = !process.env.QIJIAN_TEST_LIBRARY_ROOT || process.env.QIJIAN_TEST_SPLASH === '1';
  if (showSplash) createSplashWindow();
  updateSplash(12, '正在准备本地文稿库');
  setImmediate(() => {
    ensureLibrary();
    updateSplash(32, '正在读取启动设置');
    createWindow();
    startupFallback=setTimeout(()=>revealMainWindow(mainWindow?.__startupMaximized),12000);
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.on('startup:progress', (event, payload={}) => {
  if (event.sender !== mainWindow?.webContents) return;
  updateSplash(Number(payload.percent)||0, String(payload.label||'正在启动'));
});
ipcMain.on('startup:ready', event => {
  if (event.sender !== mainWindow?.webContents) return;
  revealMainWindow(mainWindow.__startupMaximized);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function migrationProgress(sender, percent, label) {
  sender.send('library:migration-progress', { percent: Math.max(0, Math.min(100, percent)), label });
}

async function collectLibraryFiles(root, relative = '', files = [], directories = []) {
  const current = path.join(root, relative);
  const entries = await fs.promises.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      directories.push(child);
      await collectLibraryFiles(root, child, files, directories);
    } else if (entry.isFile()) files.push(child);
  }
  return { files, directories };
}

async function copyLibraryTree(source, destination, sender) {
  const { files, directories } = await collectLibraryFiles(source);
  await fs.promises.mkdir(destination, { recursive: true });
  for (const directory of directories) await fs.promises.mkdir(path.join(destination, directory), { recursive: true });
  const total = Math.max(1, files.length);
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    await fs.promises.copyFile(path.join(source, file), path.join(destination, file));
    migrationProgress(sender, 8 + Math.round((index + 1) / total * 76), '正在搬移文稿与附件（' + (index + 1) + '/' + files.length + '）');
  }
}

function rebaseLibraryAttachments(library, sourceRoot, targetRoot) {
  const clone = JSON.parse(JSON.stringify(library));
  const sourceAttachments = path.join(sourceRoot, 'attachments');
  const targetAttachments = path.join(targetRoot, 'attachments');
  const replacements = [
    [`file://${sourceAttachments.replace(/\\/g, '/')}`, `file://${targetAttachments.replace(/\\/g, '/')}`],
    [pathToFileURL(sourceAttachments).href, pathToFileURL(targetAttachments).href],
  ];
  const replaceContent = value => {
    let next = String(value || '');
    for (const [from, to] of replacements) next = next.split(from).join(to);
    return next;
  };
  const replaceStructuredContent = value => {
    if (typeof value === 'string') return replaceContent(value);
    if (Array.isArray(value)) return value.map(replaceStructuredContent);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceStructuredContent(item)]));
    return value;
  };
  for (const node of clone.nodes || []) {
    if (typeof node.content === 'string') node.content = replaceContent(node.content);
    if (node.contentJson) node.contentJson = replaceStructuredContent(node.contentJson);
    for (const version of node.versions || []) {
      if (typeof version.content === 'string') version.content = replaceContent(version.content);
    }
  }
  return clone;
}

function isSameOrNestedPath(candidate, parent) {
  const normalizedCandidate = path.resolve(candidate).toLowerCase();
  const normalizedParent = path.resolve(parent).toLowerCase();
  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(normalizedParent + path.sep);
}

ipcMain.handle('library:choose-location', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择新的文稿库位置',
    defaultPath: path.dirname(dataPaths().root),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return path.join(result.filePaths[0], '栖简文稿库');
});

ipcMain.handle('library:migrate', async (event, { targetRoot, library }) => {
  const source = dataPaths().root;
  if (!targetRoot || !path.isAbsolute(targetRoot)) throw new Error('请选择有效的目标位置');
  const target = path.resolve(targetRoot);
  if (path.resolve(source).toLowerCase() === target.toLowerCase()) return { root: source, moved: false, oldRemoved: true };
  if (isSameOrNestedPath(target, source) || isSameOrNestedPath(source, target)) throw new Error('新位置不能位于当前文稿库内部，也不能包含当前文稿库');
  if (library) saveLibrarySafely(library);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  if (fs.existsSync(target) && (await fs.promises.readdir(target)).length) throw new Error('目标位置已存在内容。请选择另一个存放位置。');
  const staging = target + '.qijian-moving-' + process.pid + '-' + Date.now();
  migrationProgress(event.sender, 3, '正在准备搬移');
  try {
    await copyLibraryTree(source, staging, event.sender);
    migrationProgress(event.sender, 87, '正在校验新文稿库');
    const copiedLibrary = path.join(staging, 'library.json');
    const copiedData = JSON.parse(await fs.promises.readFile(copiedLibrary, 'utf8'));
    const migratedLibrary = rebaseLibraryAttachments(library || copiedData, source, target);
    atomicWrite(copiedLibrary, JSON.stringify(migratedLibrary, null, 2));
    if (fs.existsSync(target)) await fs.promises.rmdir(target);
    await fs.promises.rename(staging, target);
    saveLibraryLocation(target);
    migrationProgress(event.sender, 93, '正在删除旧文稿库');
    const oldRemoved = await removeLibraryRoot(source);
    migrationProgress(event.sender, 100, oldRemoved ? '文稿库已搬移完成' : '新位置已启用，但旧位置未能完全删除');
    return { root: target, moved: true, oldRemoved, library: migratedLibrary };
  } catch (error) {
    await fs.promises.rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
});
async function libraryStorageInfo(root = ensureLibrary().root) {
  const { files } = await collectLibraryFiles(root);
  let bytes = 0, fileCount = 0;
  for (const file of files) {
    try {
      const stat = await fs.promises.stat(path.join(root, file));
      if (stat.isFile()) { bytes += stat.size; fileCount += 1; }
    } catch (error) {
      // A completed restore/history cleanup may remove a file after enumeration.
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return { bytes, fileCount };
}

async function removeLibraryRoot(root) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 2, retryDelay: 180 });
      if (!fs.existsSync(root)) return true;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 220 * (attempt + 1)));
  }
  return !fs.existsSync(root);
}

ipcMain.handle('display:get', event => {
  if (event.sender !== mainWindow?.webContents) throw Error('无效的显示设置窗口');
  return displayPreferences.get();
});
ipcMain.handle('display:configure', (event, patch) => {
  if (event.sender !== mainWindow?.webContents) throw Error('无效的显示设置窗口');
  return displayPreferences.configure(patch);
});
ipcMain.handle('spellcheck:status', event => {
  if (event.sender !== mainWindow?.webContents) throw new Error('无效的拼写设置窗口');
  return spellcheckController.status();
});
ipcMain.handle('spellcheck:configure', (event, preferences) => {
  if (event.sender !== mainWindow?.webContents) throw new Error('无效的拼写设置窗口');
  return spellcheckController.configure(preferences);
});
ipcMain.handle('library:storage-info', async () => libraryStorageInfo());
ipcMain.handle('library:load', () => {
  const paths = ensureLibrary();
  const data = JSON.parse(fs.readFileSync(paths.library, 'utf8'));
  const adopted = adoptLibraryImageSources(data, paths.attachments);
  if (adopted.changed) {
    atomicWrite(paths.library, JSON.stringify(data, null, 2));
  }
  const preferences = data.settings || {};
  spellcheckController?.configure({enabled:preferences.spellcheckEnabled, languages:preferences.spellcheckLanguages}, false);
  // Automatic deletion is disabled: saved content is not the complete set of
  // image owners (undo history and other open windows can still reference files).
  return { data, root: paths.root };
});

function saveLibrarySafely(library, options = {}) {
  if(restoreBusy)throw new Error('正在恢复备份，请稍后保存');
  if (!library || !Array.isArray(library.nodes)) throw new Error('文稿库数据无效');
  const paths = ensureLibrary();
  const incomingRevision = Number(library.writeRevision) || 0;
  const current = JSON.parse(fs.readFileSync(paths.library, 'utf8'));
  const currentRevision = Number(current.writeRevision) || 0;
  if (current.restoreGeneration && library.restoreGeneration !== current.restoreGeneration) return {savedAt:current.savedAt,skipped:true,reason:'library-restored'};
  if (incomingRevision < currentRevision) return { savedAt: current.savedAt, skipped: true };
  const adopted = adoptLibraryImageSources(library, paths.attachments);
  library.savedAt = new Date().toISOString();
  atomicWrite(paths.library, JSON.stringify(library, null, 2));
  if (Array.isArray(options.cleanupDocumentIds) && options.cleanupDocumentIds.length) {
    const candidates = [...new Set(options.cleanupDocumentIds)].map(id => documentImageDirectory(paths.attachments,id));
    const protectedImages = (options.protectedImageSources || []).map(src => ({src}));
    removeUnreferencedAttachments({library, protectedImages}, paths.attachments, 0, candidates);
  }
  return { savedAt: library.savedAt, imageReplacements: [], documentImageReplacements: adopted.documentReplacements, imageFailures: libraryImageIssues(library, paths.attachments) };
}
async function fetchRemoteImage(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await net.fetch(source, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) throw new Error(`下载失败：${response.status}`);
    const declared = Number(response.headers.get('content-length')) || 0;
    if (declared > 30 * 1024 * 1024) throw new Error('图片超过 30MB');
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > 30 * 1024 * 1024) throw new Error('图片超过 30MB');
    return { data, contentType: response.headers.get('content-type') || '', finalUrl: response.url };
  } finally { clearTimeout(timeout); }
}
ipcMain.handle('library:save', async (_event, library, options) => {
  const remote = await adoptRemoteLibraryImageSources(library, ensureLibrary().attachments, fetchRemoteImage);
  const saved = saveLibrarySafely(library, options);
  if (!saved.skipped) saved.documentImageReplacements = [...(remote.documentReplacements || []), ...(saved.documentImageReplacements || [])];
  saved.imageFailures = [...(saved.imageFailures || [])].map(issue => ({...issue, message: remote.failures.find(failure => failure.source === issue.source)?.message || issue.message}));
  return saved;
});
ipcMain.on('library:save-sync', (event, library) => {
  try { event.returnValue = saveLibrarySafely(library); }
  catch (error) { event.returnValue = { error: error.message }; }
});

function imageRunFromSource(source, alt) {
  try {
    let data;
    if (source.startsWith('data:image/')) data = Buffer.from(source.split(',')[1], 'base64');
    else {
      const root = path.resolve(ensureLibrary().attachments) + path.sep;
      const file = path.resolve(fileURLToPath(source));
      if (!file.toLowerCase().startsWith(root.toLowerCase())) return null;
      data = fs.readFileSync(file);
    }
    const image = nativeImage.createFromBuffer(data);
    if (image.isEmpty()) return null;
    const dimensions = image.getSize();
    const width = Math.min(480, dimensions.width);
    const height = Math.max(1, Math.round(dimensions.height * width / dimensions.width));
    return new ImageRun({ type: 'png', data: image.toPNG(), transformation: { width, height }, altText: { title: alt || '插图' } });
  } catch (_) { return null; }
}
ipcMain.handle('document:export-docx', async (_event, { title, blocks }) => {
  loadWordExporter();
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出 Word', defaultPath: `${title || '未命名文稿'}.docx`,
    filters: [{ name: 'Word 文档', extensions: ['docx'] }],
  });
  if (result.canceled || !result.filePath) return null;
  const headingMap = { h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3, h4: HeadingLevel.HEADING_4, h5: HeadingLevel.HEADING_5, h6: HeadingLevel.HEADING_6 };
  const children = [];
  for (const block of blocks || []) {
    const runs = [];
    if (block.type === 'li' && block.ordered) runs.push(new TextRun(`${block.index || 1}. `));
    for (const item of block.runs || [{ text: block.text || '' }]) {
      if (item.image) { runs.push(imageRunFromSource(item.image, item.alt) || new TextRun(`[图片：${item.alt || '插图'}]`)); continue; }
      const options = { text: item.text || '', bold: !!item.bold, italics: !!item.italic, strike: !!item.strike };
      if (item.code) options.font = 'Consolas';
      if (item.highlight) options.highlight = 'yellow';
      const run = new TextRun(options);
      if (item.link && /^https?:\/\//i.test(item.link)) runs.push(new ExternalHyperlink({ children: [run], link: item.link }));
      else runs.push(run);
    }
    const options = { children: runs.length ? runs : [new TextRun('')], spacing: { after: 180, line: 360 } };
    if (headingMap[block.type]) options.heading = headingMap[block.type];
    if (block.type === 'aside') options.indent = { left: 480 };
    if (block.type === 'li' && !block.ordered) options.bullet = { level: 0 };
    if (block.align === 'center') options.alignment = AlignmentType.CENTER;
    if (block.align === 'right') options.alignment = AlignmentType.RIGHT;
    children.push(new Paragraph(options));
  }
  const document = new Document({ sections: [{ properties: {}, children }] });
  fs.writeFileSync(result.filePath, await Packer.toBuffer(document));
  return result.filePath;
});

let backupJobs=Promise.resolve(),restoreBusy=false;
function backupJob(operation){const job=backupJobs.then(operation);backupJobs=job.catch(()=>{});return job}
ipcMain.handle('library:backup', () => backupJob(async()=> {
  const paths = ensureLibrary();
  const library = JSON.parse(fs.readFileSync(paths.library, 'utf8'));
  if (!library || !Array.isArray(library.nodes)) throw new Error('当前文稿库数据无效，未创建备份');
  const adopted = adoptLibraryImageSources(library, paths.attachments);
  if (adopted.changed) atomicWrite(paths.library, JSON.stringify(library, null, 2));
  const backup = await writeBackup(paths.manualBackup,prepareCompleteBackup(library, paths));
  for (const entry of fs.readdirSync(paths.backups, { withFileTypes: true })) {
    const target = path.join(paths.backups, entry.name);
    if (entry.isFile() && path.resolve(target) !== path.resolve(paths.manualBackup)) fs.rmSync(target, { force: true });
  }
  return { path: paths.manualBackup, createdAt: backup.createdAt, imageCount: backup.imageCount, bytes: backup.bytes, imageReplacements: [], documentImageReplacements: adopted.documentReplacements, missingImages: backup.missingImages };
}));

ipcMain.handle('library:backup-info', () => backupJob(()=>{const paths=ensureLibrary();return readBackupInfo(paths.manualBackup,()=>readCompleteBackup(paths))}));

ipcMain.handle('library:restore-backup', (_event, expectedBackupId) => backupJob(async()=> {
 restoreBusy=true;try{
  const paths = ensureLibrary();
  const {bundle:backup, backupId} = readCompleteBackup(paths);
  if (expectedBackupId && expectedBackupId !== backupId) throw new Error('备份已更新，请重新点击恢复并确认备份时间');
  const current = JSON.parse(fs.readFileSync(paths.library, 'utf8'));
  if (!current || !Array.isArray(current.nodes)) throw new Error('当前文稿库数据无效，无法交换备份');
  const pendingBackup = `${paths.manualBackup}.swap`;
  const currentBackup = await writeBackup(pendingBackup,prepareCompleteBackup(current, paths));
  let restored, libraryReplaced = false;
  const createdFiles = [];
  try {
    restored = restoreBackupImages(backup, paths, createdFiles);
    restored.restoreGeneration = randomUUID();
    restored.writeRevision = Math.max(Number(current.writeRevision) || 0, Number(restored.writeRevision) || 0) + 1;
    restored.savedAt = new Date().toISOString();
    atomicWrite(paths.library, JSON.stringify(restored, null, 2));
    libraryReplaced = true;
    fs.renameSync(pendingBackup, paths.manualBackup);
  } catch (error) {
    if (libraryReplaced) atomicWrite(paths.library, JSON.stringify(current, null, 2));
    for (const file of createdFiles) { try { fs.unlinkSync(file); } catch (_) {} }
    fs.rmSync(pendingBackup, { force: true });
    throw error;
  }
  // Restoring replaces the library and clears its history/undo session. Only after
  // both writes commit may unused images from the replaced documents be removed;
  // the previous current images are already embedded in the swapped backup.
  const documentIds = new Set([...current.nodes, ...restored.nodes].filter(node => node.type === 'document').map(node => node.id));
  const directories = [...documentIds].map(id => documentImageDirectory(paths.attachments, id));
  const removedImages = removeUnreferencedAttachments(restored, paths.attachments, 0, directories);
  return { removedImageCount: removedImages.length, restoredAt: restored.savedAt, documentCount: restored.nodes.filter(node => node.type === 'document').length, backupCreatedAt: currentBackup.createdAt };
 }finally{restoreBusy=false}
}));

ipcMain.handle('attachment:add', async (_event, documentId) => {
  const paths = ensureLibrary();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const source = result.filePaths[0];
  const safeName = `${Date.now()}-${randomUUID()}-${path.basename(source).replace(/[^\w.\-\u4e00-\u9fa5]/g, '_')}`;
  const directory = documentImageDirectory(paths.attachments, documentId || JSON.parse(fs.readFileSync(paths.library,'utf8')).activeId);
  fs.mkdirSync(directory,{recursive:true});
  const destination = path.join(directory, safeName);
  fs.copyFileSync(source, destination);
  return { path: destination, url: pathToFileURL(destination).href };
});

async function adoptAttachmentSources(sources, baseDirectory = '', documentId = '') {
  const imageList = [...new Set(sources.map(source => String(source || '').trim()).filter(Boolean))];
  const value = {images: imageList.map(src => ({src}))};
  const paths = ensureLibrary();
  const owner = documentId || JSON.parse(fs.readFileSync(paths.library,'utf8')).activeId;
  const directory = documentImageDirectory(paths.attachments, owner);
  const remote = await adoptRemoteLibraryImageSources(value, directory, fetchRemoteImage);
  const local = adoptLibraryImageSources(value, directory, baseDirectory);
  const failures = libraryImageIssues(value, paths.attachments);
  if (failures.length) {
    const first = failures[0];
    const reason = remote.failures.find(item => item.source === first.source)?.message || first.message;
    throw new Error('图片未能保存到文稿库，操作未完成：' + reason);
  }
  return {replacements: [...remote.replacements, ...local.replacements]};
}
ipcMain.handle('attachment:adopt-sources', (_event, {sources, baseDirectory, documentId}) => adoptAttachmentSources(sources, baseDirectory, documentId));
ipcMain.handle('attachment:add-data', async (_event, {dataUrl, documentId}) => {
  const result = await adoptAttachmentSources([dataUrl], '', documentId);
  const url = new Map(result.replacements).get(dataUrl);
  if (!url) throw new Error('图片内容无效，未保存');
  return {path: localPathFromImageSource(url), url};
});

ipcMain.handle('clipboard:copy-image', async (_event, source) => {
  const value = String(source || '');
  let image;
  if (value.startsWith('data:image/')) image = nativeImage.createFromDataURL(value);
  else {
    const imagePath = value.startsWith('file:') ? fileURLToPath(value) : value;
    image = nativeImage.createFromPath(imagePath);
  }
  if (!image || image.isEmpty()) throw new Error('无法读取要复制的图片');
  clipboard.writeImage(image);
  return true;
});
ipcMain.handle('system:open-external', async (_event, target) => {
  const value=String(target||'').trim();
  if(!/^(https?:|mailto:)/i.test(value))throw new Error('只支持打开网页或邮件链接');
  if(process.env.QIJIAN_TEST_LIBRARY_ROOT)return true;
  await shell.openExternal(value);return true;
});
ipcMain.handle('system:open-image', async (_event, source) => {
  const value=String(source||'').trim(),imagePath=value.startsWith('file:')?fileURLToPath(value):value;
  if(!path.isAbsolute(imagePath)||!fs.existsSync(imagePath))throw new Error('图片文件不存在');
  if(process.env.QIJIAN_TEST_LIBRARY_ROOT)return imagePath;
  const error=await shell.openPath(imagePath);if(error)throw new Error(error);return imagePath;
});

ipcMain.handle('document:import-markdown', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入 Markdown', properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const file = result.filePaths[0];
  return { baseDirectory: path.dirname(file), title: path.basename(file, path.extname(file)), extension: path.extname(file).toLowerCase(), text: fs.readFileSync(file, 'utf8') };
});

ipcMain.handle('document:export-markdown', async (_event, { title, markdown }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出 Markdown', defaultPath: `${title || '未命名文稿'}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, markdown, 'utf8');
  return result.filePath;
});

ipcMain.handle('document:export-text', async (_event, { title, text }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出纯文本', defaultPath: `${title || '未命名文稿'}.txt`,
    filters: [{ name: '纯文本', extensions: ['txt'] }],
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, String(text || ''), 'utf8');
  return result.filePath;
});
ipcMain.handle('document:export-pdf', async (_event, payload) => {
  const title = String(payload?.title || '未命名文稿').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出 PDF', defaultPath: `${title}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return null;
  const imageScope=createImageScope();
  const layout=pdfLayout(payload);
  const html=buildPdfHtml(payload,ensureLibrary().attachments,{imageSource:file=>imageScope.urlFor(file)});
  const pdfWindow = new BrowserWindow({ width: Math.ceil(layout.width), height: Math.ceil(layout.height), show: false, frame: false, useContentSize: true, paintWhenInitiallyHidden: true, backgroundColor: '#fff', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  const temporary = path.join(app.getPath('temp'), `qijian-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(temporary, html, 'utf8');
  try {
    pdfWindow.setMenu(null);
    await pdfWindow.loadFile(temporary);
    await pdfWindow.webContents.executeJavaScript("Promise.all(Array.from(document.images, img => img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = resolve; img.onerror = resolve; setTimeout(resolve, 5000) })))");
    await pdfWindow.webContents.executeJavaScript("document.fonts.ready.then(()=>true)");
    const pdf = await pdfWindow.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize: 'A4' });
    fs.writeFileSync(result.filePath, pdf);
    return result.filePath;
  } finally {
    pdfWindow.destroy();imageScope.dispose();
    try { fs.unlinkSync(temporary); } catch (_) {}
  }
});

const previewScopes=new Map();
function releasePreview(id){previewScopes.get(id)?.dispose();previewScopes.delete(id)}
ipcMain.handle('document:image-preview', (event,payload)=>{
 releasePreview(event.sender.id);const scope=createImageScope();previewScopes.set(event.sender.id,scope);
 if(!event.sender.__previewCleanup){event.sender.__previewCleanup=true;const id=event.sender.id;event.sender.once('destroyed',()=>releasePreview(id));event.sender.on('did-navigate',()=>releasePreview(id))}
 try{return (payload?.format==='pdf'?buildPdfHtml:buildImageHtml)(payload,ensureLibrary().attachments,{imageSource:file=>scope.urlFor(file)})}catch(error){releasePreview(event.sender.id);throw error}
});
ipcMain.on('document:release-preview',event=>releasePreview(event.sender.id));

ipcMain.handle('document:export-png', async (_event, payload) => {
  const title = String(payload?.title || '未命名文稿').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  const exportWidth = [720, 1080, 1440].includes(Number(payload?.width)) ? Number(payload.width) : 720;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出图片', defaultPath: `${title}.png`,
    filters: [{ name: 'PNG 图片', extensions: ['png'] }],
  });
  if (result.canceled || !result.filePath) return null;
  const imageScope=createImageScope();
  const html = buildImageHtml(payload, ensureLibrary().attachments,{imageSource:file=>imageScope.urlFor(file)});
  const exportWindow = new BrowserWindow({ width: exportWidth, height: Math.round(exportWidth * 1100 / 720), show: false, frame: false, useContentSize: true, paintWhenInitiallyHidden: true, backgroundColor: '#fff', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  const temporary = path.join(app.getPath('temp'), `qijian-export-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(temporary, html, 'utf8');
  const created = [];
  try {
    exportWindow.setMenu(null);
    await exportWindow.loadFile(temporary);
    await exportWindow.webContents.executeJavaScript("Promise.all(Array.from(document.images, img => img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = resolve; img.onerror = resolve; setTimeout(resolve, 5000) })))");
    await exportWindow.webContents.executeJavaScript('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)))))');
    const dimensions = await exportWindow.webContents.executeJavaScript('({total:Math.ceil(document.documentElement.scrollHeight),viewport:window.innerHeight})');
    const { total, viewport } = dimensions;
    if (!Number.isFinite(total) || !Number.isFinite(viewport) || total < 1 || viewport < 1) throw new Error('无法确定图片高度');
    await exportWindow.webContents.executeJavaScript('window.scrollTo(0,0)');
    await new Promise(resolve => setTimeout(resolve, 100));
    const first = (await exportWindow.capturePage()).resize({ width: exportWidth });
    if (first.isEmpty()) throw new Error('图片渲染失败');
    const scale = first.getSize().height / viewport;
    const totalPixels = Math.ceil(total * scale);
    const maxPixels = 18000;
    const count = Math.ceil(totalPixels / maxPixels);
    const parsed = path.parse(result.filePath);
    const destinations = Array.from({length:count}, (_,i) => count === 1 ? result.filePath : path.join(parsed.dir, `${parsed.name}-${String(i + 1).padStart(2, '0')}${parsed.ext}`));
    if (count > 1 && destinations.some(file => fs.existsSync(file))) throw new Error('同名分段图片已存在，请换一个文件名');
    for (let part = 0; part < count; part++) {
      const start = part * maxPixels;
      const height = Math.min(maxPixels, totalPixels - start);
      const bitmap = Buffer.alloc(exportWidth * height * 4, 255);
      const startCss = start / scale;
      const endCss = (start + height) / scale;
      for (let target = startCss; target < endCss; target += viewport * 0.85) {
        const requested = Math.min(Math.max(0, total - viewport), Math.max(0, Math.floor(target)));
        const actual = await exportWindow.webContents.executeJavaScript(`window.scrollTo(0,${requested});window.scrollY`);
        await new Promise(resolve => setTimeout(resolve, 50));
        const shot = (await exportWindow.capturePage()).resize({ width: exportWidth });
        if (shot.isEmpty()) throw new Error('图片渲染失败');
        const shotHeight = shot.getSize().height;
        const source = shot.toBitmap();
        const origin = Math.round(actual * scale);
        const firstRow = Math.max(start, origin);
        const lastRow = Math.min(start + height, origin + shotHeight);
        for (let row = firstRow; row < lastRow; row++) source.copy(bitmap, (row - start) * exportWidth * 4, (row - origin) * exportWidth * 4, (row - origin + 1) * exportWidth * 4);
      }
      fs.writeFileSync(destinations[part], nativeImage.createFromBitmap(bitmap, { width: exportWidth, height }).toPNG());
      created.push(destinations[part]);
    }
    return created;
  } catch (error) {
    for (const file of created) try { fs.unlinkSync(file); } catch (_) {}
    throw error;
  } finally {
    exportWindow.destroy();imageScope.dispose();
    try { fs.unlinkSync(temporary); } catch (_) {}
  }
});

ipcMain.handle('path:show-library', () => shell.openPath(ensureLibrary().root));
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:toggle-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.handle('window:toggle-detached-fullscreen', (event, title) => {
  const parent = BrowserWindow.fromWebContents(event.sender);
  const child = BrowserWindow.getAllWindows().find(window => window !== parent && window.getParentWindow() === parent && window.getTitle() === String(title || ''));
  if (!child || child.isDestroyed()) return false;
  child.setFullScreen(!child.isFullScreen());
  return child.isFullScreen();
});
ipcMain.on('window:close', () => mainWindow?.close());
