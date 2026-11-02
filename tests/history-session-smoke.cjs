const {app,BrowserWindow}=require('electron'),fs=require('fs'),os=require('os'),path=require('path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qijian-history-session-'));
const at=days=>new Date(Date.now()-days*24*60*60*1000).toISOString();
const docA={id:'doc-a',type:'document',title:'甲',parentId:null,order:1,createdAt:at(20),updatedAt:at(1),deletedAt:null,content:'<p>初始内容</p>',versions:[{id:'old',at:at(16),content:'<p>十六天前</p>'},{id:'recent',at:at(14),content:'<p>十四天前</p>'}]};
const docB={id:'doc-b',type:'document',title:'乙',parentId:null,order:2,createdAt:at(2),updatedAt:at(1),deletedAt:null,content:'<p>乙文稿</p>',versions:[]};
fs.mkdirSync(root,{recursive:true});
fs.writeFileSync(path.join(root,'library.json'),JSON.stringify({version:1,settings:{},nodes:[docA,docB],activeId:docA.id,historyResetVersion:1,documentNormalizationVersion:8,historyPolicyVersion:0,writeRevision:0},null,2));
process.env.QIJIAN_TEST_LIBRARY_ROOT=root;
require('../src/main.js');
const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const mainWindow=()=>BrowserWindow.getAllWindows().find(item=>item.webContents.getURL().includes('index.html'));

app.whenReady().then(async()=>{
 try{
  await wait(2400);const win=mainWindow();if(!win)throw new Error('Main window missing');
  const first=await win.webContents.executeJavaScript(`(async()=>{
   const checks={};const doc=node('doc-a');
   checks.fifteenDayRetention=doc.versions.some(item=>item.id==='recent')&&!doc.versions.some(item=>item.id==='old')&&library.historyPolicyVersion===1;
   const edit=async html=>{window.qijianEditor.setContent(html,null);persist(true);await new Promise(resolve=>setTimeout(resolve,520))};
   await edit('<p>本次启动第一结果</p>');
   let sessions=doc.versions.filter(item=>item.sessionId===historySessionId),sessionId=sessions[0]?.id;
   checks.firstEditCreatesOne=sessions.length===1&&sessions[0].content.includes('第一结果');
   await edit('<p>本次启动第二结果</p>');
   sessions=doc.versions.filter(item=>item.sessionId===historySessionId);
   checks.sameLaunchOverwrites=sessions.length===1&&sessions[0].id===sessionId&&sessions[0].content.includes('第二结果')&&!doc.versions.some(item=>item.content.includes('第一结果'));
   select('doc-b');await new Promise(resolve=>setTimeout(resolve,520));select('doc-a');
   await edit('<p>本次启动最终结果</p>');
   sessions=doc.versions.filter(item=>item.sessionId===historySessionId);
   openTool("versions");
   checks.switchStillOne=sessions.length===1&&sessions[0].id===sessionId&&sessions[0].content.includes('最终结果');
   checks.currentLaunchHiddenFromHistory=$$('#versionList .history-version').length===2;
   await flushSave();return {checks,sessionId:historySessionId};
  })()`);
  win.webContents.reload();await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));await wait(900);
  const second=await win.webContents.executeJavaScript(`(async()=>{
   const doc=node('doc-a'),oldSessions=new Set(doc.versions.map(item=>item.sessionId).filter(Boolean));
   window.qijianEditor.setContent('<p>下一次启动的结果</p>',null);persist(true);await new Promise(resolve=>setTimeout(resolve,520));await flushSave();
   const current=doc.versions.filter(item=>item.sessionId===historySessionId);
   return {newSession:!oldSessions.has(historySessionId),oneVersionForNewSession:current.length===1&&current[0].content.includes('下一次启动'),priorSessionKept:doc.versions.some(item=>item.sessionId&&item.sessionId!==historySessionId&&item.content.includes('本次启动最终结果'))};
  })()`);
  const checks={...first.checks,...second};console.log(JSON.stringify(checks,null,2));app.exit(Object.values(checks).every(Boolean)?0:1)
 }catch(error){console.error(error);app.exit(1)}
}).catch(error=>{console.error(error);app.exit(1)});
