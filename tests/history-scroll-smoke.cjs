const {app,BrowserWindow}=require('electron'),fs=require('fs'),os=require('os'),path=require('path');
process.env.QIJIAN_TEST_LIBRARY_ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'qijian-history-scroll-'));
process.env.QIJIAN_TEST_DETACHED='1';
require('../src/main.js');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

app.whenReady().then(async()=>{
 try{
  await pause(2500);
  const win=BrowserWindow.getAllWindows().find(item=>item.webContents.getURL().includes('index.html'));
  win.webContents.setBackgroundThrottling(false);
  const result=await win.webContents.executeJavaScript('('+async function(){
   const stamp=Date.now().toString(),created=new Date().toISOString();
   const versions=Array.from({length:30},(_,index)=>({id:`scroll-${stamp}-${index}`,at:new Date(Date.now()-index*60000).toISOString(),content:`<p>历史版本 ${index+1}</p>`}));
   const doc={id:`scroll-doc-${stamp}`,type:'document',title:'滚动位置测试',content:'<p>当前版本</p>',parentId:null,order:Date.now(),createdAt:created,updatedAt:created,deletedAt:null,versions};
   library.nodes.push(doc);select(doc.id);openTool('versions');
   await new Promise(resolve=>setTimeout(resolve,250));
   const popup=detachedDialogs.get('toolPanel'),list=popup?.document.querySelector('#versionList');
   if(!list)return {opened:false};
   list.scrollTop=620;
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const before=list.scrollTop,target=list.querySelectorAll('.history-version')[15];
   target.click();
   await new Promise(resolve=>setTimeout(resolve,120));
   const nextList=popup.document.querySelector('#versionList'),selected=nextList.querySelector('.history-version.selected');
   return {opened:true,before,after:nextList.scrollTop,selected:selected?.dataset.versionId===versions[14].id};
  }.toString()+')()');
  const passed=result.opened&&result.before>200&&Math.abs(result.after-result.before)<2&&result.selected;
  console.log(JSON.stringify({...result,passed},null,2));
  app.exit(passed?0:1);
 }catch(error){console.error(error);app.exit(1)}
}).catch(error=>{console.error(error);app.exit(1)});
