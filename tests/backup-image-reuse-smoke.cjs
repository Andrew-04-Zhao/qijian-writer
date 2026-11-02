const {app,BrowserWindow}=require('electron');
const fs=require('fs'),os=require('os'),path=require('path'),zlib=require('zlib'),assert=require('assert');
const {pathToFileURL,fileURLToPath}=require('url');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qijian-backup-image-reuse-'));
fs.mkdirSync(path.join(root,'user-data'));app.setPath('userData',path.join(root,'user-data'));
const attachments=path.join(root,'attachments'),stamp=new Date().toISOString();
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
const nodes=['a','b'].map(id=>{const dir=path.join(attachments,'doc-'+id);fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'original.png');fs.writeFileSync(file,png);return {id,type:'document',title:id,parentId:null,content:'<p>'+id+'</p><img src="'+pathToFileURL(file).href+'">',contentJson:null,versions:[],createdAt:stamp,updatedAt:stamp,deletedAt:null}});
const unrelatedFile=path.join(attachments,'legacy-unrelated.png');fs.writeFileSync(unrelatedFile,png);
const historyFile=path.join(attachments,'doc-a','history.png');fs.writeFileSync(historyFile,png);nodes[0].versions=[{id:'history',sessionId:'previous',at:stamp,content:'<img src="'+pathToFileURL(historyFile).href+'">'}];
const libraryPath=path.join(root,'library.json'),backupPath=path.join(root,'backups','library-manual.qijian-backup.gz');
fs.writeFileSync(libraryPath,JSON.stringify({nodes,activeId:'a',settings:{},documentNormalizationVersion:8,historyResetVersion:1,historyPolicyVersion:1,writeRevision:0}));
const read=()=>JSON.parse(fs.readFileSync(libraryPath,'utf8'));
const imageFile=(doc)=>fileURLToPath(doc.content.match(/<img\b[^>]*src=["']([^"']+)/)[1]);
const inventory=()=>{const result=[];const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.isFile())result.push({file,bytes:fs.statSync(file).size})}};walk(attachments);return result.sort((a,b)=>a.file.localeCompare(b.file))};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const waitFor=async fn=>{for(let i=0;i<100;i++){try{if(await fn())return}catch{}await pause(50)}throw Error('startup timeout')};
process.env.QIJIAN_TEST_LIBRARY_ROOT=root;require(process.env.QIJIAN_TEST_APP||'../src/main.js');
app.whenReady().then(async()=>{const checks={},counts=[];try{
 let win;await waitFor(()=>win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')));
 const run=code=>win.webContents.executeJavaScript(code);await waitFor(()=>run('!!activeDoc&&!!window.qijianEditor?.enabled'));
 await run('window.qijian.backupLibrary()');const originalFiles=inventory();checks.ordinaryBackupKeepsHistoryImage=fs.existsSync(historyFile);
 const sourceFiles=read().nodes.map(imageFile);
 for(let i=0;i<8;i++){await run('window.qijian.restoreLibraryBackup()');counts.push(inventory().length)}
 checks.repeatedRestoreDoesNotGrowFiles=counts.every(n=>n===originalFiles.length-1);
 checks.repeatedRestoreReusesOriginalPaths=read().nodes.every((doc,i)=>imageFile(doc)===sourceFiles[i]);
 checks.repeatedRestoreImagesIntact=read().nodes.every(doc=>fs.readFileSync(imageFile(doc)).equals(png));
 checks.documentsKeepIndependentImages=imageFile(read().nodes[0])!==imageFile(read().nodes[1])&&read().nodes.every(doc=>imageFile(doc).includes('doc-'+doc.id+path.sep));
 checks.restoreHistoryEmpty=read().nodes.every(doc=>doc.versions.length===0);
 checks.restoreClearsHistoryOnlyImages=!fs.existsSync(historyFile);
 checks.unrelatedFilesNotCleaned=fs.existsSync(unrelatedFile);
 checks.backupRemainsSingleFile=fs.readdirSync(path.dirname(backupPath)).length===1;
 // The original path may now contain different data. It must not be overwritten or reused.
 await run('window.qijian.backupLibrary()');const changedPath=imageFile(read().nodes[0]);const changedBytes=Buffer.concat([png,Buffer.from('changed fixture image')]);fs.writeFileSync(changedPath,changedBytes);
 await run('window.qijian.restoreLibraryBackup()');const restoredPath=imageFile(read().nodes[0]);
 const swapped=JSON.parse(zlib.gunzipSync(fs.readFileSync(backupPath)));
 checks.changedOriginalArchivedBeforeCleanup=swapped.attachments.some(a=>a.source===pathToFileURL(changedPath).href&&Buffer.from(a.data,'base64').equals(changedBytes))&&!fs.existsSync(changedPath);
 checks.changedOriginalGetsSeparateRestoredFile=restoredPath!==changedPath&&fs.readFileSync(restoredPath).equals(png);
 const countAfterCollision=inventory().length;
 for(let i=0;i<6;i++)await run('window.qijian.restoreLibraryBackup()');
 checks.collisionThenSwapsRemainBounded=inventory().length===countAfterCollision;
 // Missing on-disk sources are recovered from the embedded archive.
 await run('window.qijian.backupLibrary()');const missingPath=imageFile(read().nodes[0]);const expected=fs.readFileSync(missingPath);fs.unlinkSync(missingPath);
 await run('window.qijian.restoreLibraryBackup()');checks.missingOriginalRecovered=fs.readFileSync(imageFile(read().nodes[0])).equals(expected);
 // Failure after staging images must roll back the library/backup and discard only newly staged files.
 await run('window.qijian.backupLibrary()');fs.unlinkSync(imageFile(read().nodes[0]));
 const libraryBefore=fs.readFileSync(libraryPath),backupBefore=fs.readFileSync(backupPath),filesBefore=inventory();const rename=fs.renameSync;let injected=false;
 fs.renameSync=function(from,to){if(path.resolve(from)===path.resolve(backupPath+'.swap')&&path.resolve(to)===path.resolve(backupPath)){injected=true;throw Error('fixture backup swap failure')}return rename.apply(this,arguments)};
 try{await run('window.qijian.restoreLibraryBackup()');checks.failedRestoreReported=false}catch(error){checks.failedRestoreReported=injected&&error.message.includes('fixture backup swap failure')}finally{fs.renameSync=rename}
 checks.failedRestorePreservesLibrary=fs.readFileSync(libraryPath).equals(libraryBefore);
 checks.failedRestorePreservesBackup=fs.readFileSync(backupPath).equals(backupBefore);
 checks.failedRestoreLeavesNoNewImages=JSON.stringify(inventory())===JSON.stringify(filesBefore);
 checks.failedRestoreRemovesPendingArchive=!fs.existsSync(backupPath+'.swap');
 const raceFile=path.join(root,'removed-during-stat.tmp');fs.writeFileSync(raceFile,'fixture');const stat=fs.promises.stat;let raceHit=false;
 fs.promises.stat=async function(file,...args){if(path.resolve(file)===raceFile){fs.unlinkSync(raceFile);raceHit=true}return stat.call(this,file,...args)};
 try{const info=await run('window.qijian.libraryStorageInfo()');checks.storageStatsTolerateConcurrentRemoval=raceHit&&info.fileCount>0&&Number.isFinite(info.bytes)}finally{fs.promises.stat=stat}
 const result={root,counts,checks};fs.mkdirSync('dist/storage-audit',{recursive:true});fs.writeFileSync('dist/storage-audit/backup-image-reuse-report.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));assert.deepStrictEqual(Object.entries(checks).filter(([,pass])=>!pass),[]);app.exit(0);
}catch(error){console.error(error);app.exit(1)}});
