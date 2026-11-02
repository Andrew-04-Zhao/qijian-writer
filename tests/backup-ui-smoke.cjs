const {app,BrowserWindow}=require('electron');
const fs=require('fs'),os=require('os'),path=require('path'),zlib=require('zlib'),assert=require('assert');
const {pathToFileURL,fileURLToPath}=require('url');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qijian-backup-ui-'));
const stamp=new Date().toISOString(),attachments=path.join(root,'attachments');
fs.mkdirSync(attachments,{recursive:true});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
const currentImage=path.join(attachments,'current.png'),historyImage=path.join(attachments,'history.png');
fs.writeFileSync(currentImage,png);fs.writeFileSync(historyImage,png);
const url=pathToFileURL(currentImage).href,oldUrl=pathToFileURL(historyImage).href;
const initial={nodes:['a','b','trash'].map((id,i)=>({id,type:'document',title:id,content:i?'<p>文稿 '+id+'</p>':'<h1>备份正文</h1><p>当前图片</p><img src="'+url+'">',contentJson:null,versions:[{id:'history-'+id,sessionId:'previous-session',at:stamp,content:'<p>旧历史 '+id+'</p><img src="'+oldUrl+'">'}],createdAt:stamp,updatedAt:stamp,deletedAt:id==='trash'?stamp:null})),activeId:'a',settings:{},documentNormalizationVersion:8,historyResetVersion:1,historyPolicyVersion:1,writeRevision:0};
fs.writeFileSync(path.join(root,'library.json'),JSON.stringify(initial));
process.env.QIJIAN_TEST_LIBRARY_ROOT=root;process.env.QIJIAN_TEST_DETACHED='1';require('../src/main.js');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const waitFor=async(fn,label)=>{for(let i=0;i<160;i++){try{const result=await fn();if(result)return result}catch(_){}await wait(50)}throw new Error('Timed out: '+label)};
const read=()=>JSON.parse(fs.readFileSync(path.join(root,'library.json'),'utf8'));
const backupPath=path.join(root,'backups','library-manual.qijian-backup.gz');
const backup=()=>JSON.parse(zlib.gunzipSync(fs.readFileSync(backupPath)));
app.whenReady().then(async()=>{
 try{
  const win=await waitFor(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')),'main window');
  const run=code=>win.webContents.executeJavaScript(code).catch(error=>{throw new Error(code.slice(0,300)+"\n"+error.message)});
  await waitFor(()=>run('!!activeDoc&&!!window.qijianEditor?.enabled'),'editor ready');
  const currentSession=()=>run('historySessionId');
  const readyAfter=old=>waitFor(()=>run('historySessionId!=='+JSON.stringify(old)+'&&!!activeDoc'),'reload with restored content');
  const openSettings=async()=>{await run('window.__acceptBackupRestore=true;window.confirm=message=>{window.__lastBackupConfirm=message;return window.__acceptBackupRestore};openSettings("storage");true');return waitFor(()=>BrowserWindow.getAllWindows().find(w=>w!==win&&w.webContents.getURL()==='about:blank'),'detached settings')};
  const click=async(popup,id)=>{
   const point=await popup.webContents.executeJavaScript('(()=>{const b=document.getElementById('+JSON.stringify(id)+'),r=b.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()');
   popup.webContents.sendInputEvent({type:'mouseMove',...point});
   popup.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
   popup.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
  };
  const checks={};
  let popup=await openSettings();
  await click(popup,'backupFromSettings');await waitFor(()=>fs.existsSync(backupPath),'backup file');
  const saved=backup(),stale=read();
  checks.backupButtonExcludesAllHistory=saved.library.nodes.every(d=>d.versions.length===0)&&saved.attachments.length===1;
  const originalInfo=await run('window.qijian.backupLibraryInfo()');
  checks.backupInfoMatchesArchive=originalInfo.createdAt===saved.createdAt&&originalInfo.bytes===fs.statSync(backupPath).size&&typeof originalInfo.backupId==='string';
  fs.utimesSync(backupPath,new Date('2001-01-01'),new Date('2001-01-01'));
  const beforeCancel=fs.readFileSync(path.join(root,'library.json'),'utf8');
  await run('window.__acceptBackupRestore=false');
  await click(popup,'restoreBackupFromSettings');
  const confirmation=await waitFor(()=>run('window.__lastBackupConfirm'),'timestamp confirmation');
  const expectedTime=new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(saved.createdAt)).replaceAll('/','-');
  checks.confirmationUsesBackupCreationTime=confirmation.includes('备份时间：'+expectedTime);
  checks.confirmationShowsCompressedSize=confirmation.includes('备份大小：')&&confirmation.includes('（已压缩）');
  checks.cancelDoesNotChangeLibrary=fs.readFileSync(path.join(root,'library.json'),'utf8')===beforeCancel&&await run('!libraryRestoreInProgress&&!document.body.inert');
  await run('window.__acceptBackupRestore=true');
  let oldSession=await currentSession();
  await click(popup,'restoreBackupFromSettings');await readyAfter(oldSession);await wait(700);
  checks.immediateRestoreDiskHistoryEmpty=read().nodes.every(d=>d.versions.length===0);
  checks.immediateRestoreMemoryHistoryEmpty=await run('library.nodes.every(d=>d.versions.length===0)');
  checks.historyPageOnlyCurrent=await run('(()=>{openTool("versions");const onlyCurrent=document.querySelectorAll("#versionList .history-version").length===1;closeTools();return onlyCurrent})()');
  console.log('Immediate restore through settings buttons:',JSON.stringify(checks));
  assert(Object.values(checks).every(Boolean),'Backup → immediate restore → real reload must not revive history');
  oldSession=await currentSession();win.webContents.reload();await readyAfter(oldSession);await wait(600);
  checks.reopenWithoutEditStaysHistoryEmpty=read().nodes.every(d=>d.versions.length===0);
  assert(checks.reopenWithoutEditStaysHistoryEmpty);

  // Restore immediately after an edit, before its debounce save runs.
  popup=await openSettings();oldSession=await currentSession();
  await run('window.qijianEditor.setContent("<h1>未落盘的最新修改</h1><p>交换后必须保留</p>",null);persist(true)');
  await click(popup,'restoreBackupFromSettings');await readyAfter(oldSession);await wait(600);
  checks.restoresOriginalContent=read().nodes[0].content.includes('备份正文');
  checks.unsavedEditBecomesSwapBackup=backup().library.nodes[0].content.includes('未落盘的最新修改');
  checks.swapBackupHasNoHistory=backup().library.nodes.every(d=>d.versions.length===0);
  assert(checks.restoresOriginalContent&&checks.unsavedEditBecomesSwapBackup&&checks.swapBackupHasNoHistory);
  popup=await openSettings();oldSession=await currentSession();
  await click(popup,'restoreBackupFromSettings');await readyAfter(oldSession);await wait(600);
  checks.secondSwapRestoresLatestEdit=read().nodes[0].content.includes('未落盘的最新修改')&&read().nodes.every(d=>d.versions.length===0);
  const imageBackup=backup();
  const swappedInfo=await run('window.qijian.backupLibraryInfo()');
  checks.swapUpdatesBackupTime=swappedInfo.createdAt===imageBackup.createdAt&&swappedInfo.backupId!==originalInfo.backupId;
  checks.swappedImageBackupSelfContained=imageBackup.attachments.length===1&&imageBackup.library.nodes.every(d=>d.versions.length===0);
  assert(checks.secondSwapRestoresLatestEdit&&checks.swappedImageBackupSelfContained);

  const unchangedLibrary=fs.readFileSync(path.join(root,'library.json'),'utf8'),unchangedBackup=fs.readFileSync(backupPath);
  checks.rejectsBackupChangedAfterConfirmation=await run('(async()=>{try{await window.qijian.restoreLibraryBackup('+JSON.stringify(originalInfo.backupId)+');return false}catch(error){return error.message.includes("备份已更新")}})()');
  checks.rejectedRestoreChangesNothing=fs.readFileSync(path.join(root,'library.json'),'utf8')===unchangedLibrary&&fs.readFileSync(backupPath).equals(unchangedBackup);
  assert(checks.rejectsBackupChangedAfterConfirmation&&checks.rejectedRestoreChangesNothing);

  // A delayed write from the replaced library must be rejected even at a higher revision.
  stale.writeRevision=read().writeRevision+1000;
  const diskBefore=fs.readFileSync(path.join(root,'library.json'),'utf8');
  const response=await run('window.qijian.saveLibrary('+JSON.stringify(stale)+')');
  const syncResponse=await run('window.qijian.saveLibrarySync('+JSON.stringify(stale)+')');
  checks.lateAsyncAndSyncSavesRejected=response.skipped&&syncResponse.skipped&&fs.readFileSync(path.join(root,'library.json'),'utf8')===diskBefore;
  assert(checks.lateAsyncAndSyncSavesRejected);

  // A failed restore must release its busy state, preserve the live library and keep editing usable.
  fs.writeFileSync(backupPath,'invalid gzip');
  popup=await openSettings();oldSession=await currentSession();
  await click(popup,'restoreBackupFromSettings');
  await waitFor(()=>run('document.querySelector("#toast").textContent.includes("损坏")'),'restore failure reported');
  checks.failedRestoreKeepsCurrentLibrary=(await currentSession())===oldSession&&read().nodes[0].content.includes('未落盘的最新修改');
  checks.failedRestoreReleasesInput=await run('!document.body.inert&&!libraryWritesSuspended&&!libraryRestoreInProgress');
  await run('window.qijianEditor.setContent("<p>失败后仍能编辑和保存</p>",null);persist(true);flushSave()');
  checks.editingAfterFailurePersists=read().nodes[0].content.includes('失败后仍能编辑和保存');
  assert(checks.failedRestoreKeepsCurrentLibrary&&checks.failedRestoreReleasesInput&&checks.editingAfterFailurePersists);
  console.log(JSON.stringify(checks,null,2));
  assert(Object.values(checks).every(Boolean));
  app.exit(0);
 }catch(error){console.error(error);app.exit(1)}
});
