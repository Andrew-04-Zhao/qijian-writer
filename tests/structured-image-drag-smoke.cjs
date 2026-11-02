const {app,BrowserWindow}=require('electron');
const fs=require('fs'),os=require('os'),path=require('path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qijian-structured-image-drag-'));
const stamp=new Date().toISOString();
fs.writeFileSync(path.join(root,'library.json'),JSON.stringify({nodes:[{id:'image-ui',type:'document',title:'图片交互测试',parentId:null,order:1,createdAt:stamp,updatedAt:stamp,deletedAt:null,content:'<p>准备</p>',contentJson:null,versions:[]}],activeId:'image-ui',settings:{},writeRevision:0}),'utf8');
process.env.QIJIAN_TEST_LIBRARY_ROOT=root;
app.setPath('userData',path.join(root,'profile'));
require('../src/main.js');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

app.whenReady().then(async()=>{
 let code=0;
 try{
  let win,ready=false;for(let i=0;i<160;i++){win=BrowserWindow.getAllWindows().find(item=>item.webContents.getURL().includes('index.html'));if(win&&await win.webContents.executeJavaScript('typeof activeDoc!=="undefined"&&!!activeDoc&&!!window.qijianEditor?.enabled').catch(()=>false)){ready=true;break}await wait(100)}if(!ready)throw Error('Editor startup timed out');win.webContents.setBackgroundThrottling(false);
   const result=await win.webContents.executeJavaScript(`(async()=>{
   const pixel='data:image/gif;base64,R0lGODlhAQABAPAAAIbG5f///yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
   const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
   const drag=async(source,target,{x=.5,y=.5}={})=>{if(!source||!target)throw Error('Missing drag elements: '+document.querySelector('#editor').innerHTML);const a=source.getBoundingClientRect(),b=target.getBoundingClientRect(),start={x:a.left+a.width/2,y:a.top+a.height/2},end={x:b.left+b.width*x,y:b.top+b.height*y};source.querySelector('img').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0,clientX:start.x,clientY:start.y}));for(let step=1;step<=8;step++){window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,buttons:1,clientX:start.x+(end.x-start.x)*step/8,clientY:start.y+(end.y-start.y)*step/8}));await new Promise(resolve=>requestAnimationFrame(resolve))}const preview={ghost:!!document.querySelector('.image-drag-preview'),dropTarget:!!document.querySelector('.image-drop-indicator'),horizontal:document.querySelector('.image-drop-indicator')?.classList.contains('horizontal')||false};window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,button:0,clientX:end.x,clientY:end.y}));await pause(80);return preview};
   const inspect=()=>{const json=window.qijianEditor.getDocumentJSON(),rows=[];const walk=node=>{if(node.type==='image_row')rows.push(node);(node.content||[]).forEach(walk)};walk(json);return{rows:rows.length,images:rows.reduce((sum,row)=>sum+(row.content?.length||0),0),emptyRows:rows.filter(row=>!row.content?.length).length,domRows:document.querySelectorAll('#editor>.image-row').length,domFigures:document.querySelectorAll('#editor figure.editor-image').length,emptyFrames:[...document.querySelectorAll('#editor figure.editor-image')].filter(node=>!node.querySelector('img[src]')).length,staleVisuals:document.querySelectorAll('.image-drag-preview,.image-drop-indicator,.image-dragging,.image-drop-before,.image-drop-after,.image-drop-target').length,topTypes:(json.content||[]).map(node=>node.type),ids:[...document.querySelectorAll('#editor figure.editor-image')].map(node=>node.dataset.imageId)}};
   window.qijianEditor.setContent('<p>拖动前</p><div class="image-row"><figure class="editor-image" data-image-id="drag-a" style="width:180px"><img src="'+pixel+'" alt="甲"></figure></div><div class="image-row"><figure class="editor-image" data-image-id="drag-b" style="width:180px"><img src="'+pixel+'" alt="乙"></figure></div><p>拖动后</p>',null);
   await pause(100);
   const preview=await drag(document.querySelector('[data-image-id="drag-a"]'),document.querySelector('[data-image-id="drag-b"]'));
   const moved=inspect();window.qijianEditor.undo();await pause(50);const undone=inspect();

   window.qijianEditor.setContent('<p>同行</p><div class="image-row"><figure class="editor-image" data-image-id="same-a" style="width:180px"><img src="'+pixel+'" alt="甲"></figure><figure class="editor-image" data-image-id="same-b" style="width:180px"><img src="'+pixel+'" alt="乙"></figure></div>',null);await pause(80);
   const samePreview=await drag(document.querySelector('[data-image-id="same-a"]'),document.querySelector('[data-image-id="same-b"]'),{x:.8,y:.5}),sameMoved=inspect();window.qijianEditor.undo();await pause(50);const sameUndone=inspect();

   window.qijianEditor.setContent('<p>上方正文</p><div class="image-row"><figure class="editor-image" data-image-id="block-a" style="width:180px"><img src="'+pixel+'" alt="甲"></figure></div><p>下方正文</p>',null);await pause(80);
   const paragraphs=[...document.querySelectorAll('#editor>p')],blockPreview=await drag(document.querySelector('[data-image-id="block-a"]'),paragraphs.at(-1),{x:.5,y:.8}),blockMoved=inspect();window.qijianEditor.undo();await pause(50);const blockUndone=inspect();
   return{preview,moved,undone,samePreview,sameMoved,sameUndone,blockPreview,blockMoved,blockUndone};
  })()`);
  console.log(JSON.stringify(result,null,2));
  const crossOk=result.preview.ghost&&result.preview.dropTarget&&result.moved.rows===1&&result.moved.images===2&&!result.moved.emptyRows&&!result.moved.emptyFrames&&!result.moved.staleVisuals&&result.undone.rows===2&&result.undone.images===2;
  const sameOk=result.samePreview.ghost&&result.samePreview.dropTarget&&!result.samePreview.horizontal&&result.sameMoved.ids.join(',')==='same-b,same-a'&&result.sameMoved.staleVisuals===0&&result.sameUndone.ids.join(',')==='same-a,same-b';
  const blockOk=result.blockPreview.ghost&&result.blockPreview.dropTarget&&result.blockPreview.horizontal&&result.blockMoved.topTypes.join(',')==='paragraph,paragraph,image_row'&&result.blockMoved.rows===1&&result.blockMoved.images===1&&result.blockMoved.staleVisuals===0&&result.blockUndone.topTypes.join(',')==='paragraph,image_row,paragraph';
  if(!crossOk||!sameOk||!blockOk)code=1;
  await win.webContents.executeJavaScript("history.replaceState(null,'',location.pathname);openImageExport();true");await wait(600);
  const exportWindow=BrowserWindow.getAllWindows().find(item=>item.id!==win.id&&!item.isDestroyed());
  if(!exportWindow){console.error('导出图片独立窗口未打开');code=1}
  else{
   const ratio=async selector=>{await exportWindow.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).click()`);await wait(350);return exportWindow.webContents.executeJavaScript(`(()=>{const viewport=document.querySelector('.image-export-preview-inner'),frame=document.querySelector('#imageExportFrame');return{viewport:viewport.clientWidth,frame:frame.getBoundingClientRect().width}})()`)};
   const template=await ratio('[data-image-template="warm"]'),wide=await ratio('[data-image-width="1440"]');
   const fontSelectorRemoved=await exportWindow.webContents.executeJavaScript(`!document.querySelector('#imageExportFont')&&!document.querySelector('.image-export-options>select')`);
   const exportChecks={templateFillsPreview:template.viewport>300&&Math.abs(template.frame-template.viewport)<2,wideFillsPreview:wide.viewport>300&&Math.abs(wide.frame-wide.viewport)<2,fontSelectorRemoved};
   console.log(JSON.stringify({exportChecks,template,wide},null,2));if(!Object.values(exportChecks).every(Boolean))code=1;exportWindow.close();
  }
 }catch(error){console.error(error);code=1}
 finally{try{fs.rmSync(root,{recursive:true,force:true})}catch{}app.exit(code)}
});
