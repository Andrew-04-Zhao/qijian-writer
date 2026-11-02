const {app,BrowserWindow,dialog}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qijian-display-'));
const output=path.resolve('dist/display-qa');fs.mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(root,'profile'));fs.mkdirSync(path.join(root,'profile'));fs.writeFileSync(path.join(root,'profile','display-preferences.json'),JSON.stringify({uiScale:1.25,readingScale:1.1}));
process.env.QIJIAN_TEST_LIBRARY_ROOT=path.join(root,'library');process.env.QIJIAN_TEST_DETACHED='1';
let destination;const exportMetrics=[];app.on('browser-window-created',(_e,w)=>{w.webContents.on('did-finish-load',()=>{if(!/qijian-(export|pdf)-/.test(w.webContents.getURL()))return;const record=async stage=>{if(w.isDestroyed())return;exportMetrics.push({stage,zoom:w.webContents.getZoomFactor(),bounds:w.getBounds(),measure:await w.webContents.executeJavaScript('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,total:document.documentElement.scrollHeight})')})};record('load');setTimeout(()=>record('later'),150)})});dialog.showSaveDialog=async()=>({canceled:false,filePath:destination});
require(process.env.QIJIAN_TEST_APP||'../src/main.js');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<180;i++){if(await fn())return;await pause(70)}throw Error('Timeout: '+label)}
app.whenReady().then(async()=>{let win;const checks={},details={};try{
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html'));return win},'main');
 const run=code=>win.webContents.executeJavaScript(code,true);
 await until(()=>run('typeof activeDoc!=="undefined"&&!!activeDoc&&qijianEditor.enabled&&!!QijianDisplay').catch(()=>false),'editor');
 checks.startupRestoresLocalChoices=win.webContents.getZoomFactor()===1.25&&await run('QijianDisplay.get().readingScale===1.1');await run('QijianDisplay.configure({uiScale:1,readingScale:1})');win.webContents.setBackgroundThrottling(false);win.setBounds({x:20,y:20,width:1300,height:900});win.showInactive();
 const pixel='data:image/gif;base64,R0lGODlhAQABAPAAAIbG5f///yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
 const content='<h1>混合内容 Heading</h1><p>Reading probe 正文 <strong>加粗</strong> <em>italic</em></p><ul><li><p>父条目</p><ul><li><p>子条目</p></li></ul></li></ul><table><tr><td><p>单元格 A</p></td><td><p>Cell B</p></td></tr></table><div class="editor-formula formula-block" data-latex="E=mc^2\\tag{1}"></div><div class="image-row"><figure class="editor-image" data-image-id="zoom-img" style="width:180px"><img src="'+pixel+'"></figure></div><p>END</p>';
 await run('qijianEditor.setContent('+JSON.stringify(content)+');qijianEditor.setTextSelection(3);window.__original=qijianEditor.getHTML();window.__selection=JSON.stringify(qijianEditor.getSelection());window.__settings=JSON.stringify(library.settings);true');
 const measure=()=>run(`(()=>{numbers();const text=document.querySelector('#editor>p').firstChild,range=document.createRange();range.setStart(text,0);range.setEnd(text,7);const rect=range.getBoundingClientRect(),heading=document.querySelector('#editor h1'),marker=document.querySelector('#lineNumbers span'),h=heading.getBoundingClientRect(),m=marker.getBoundingClientRect(),k=QijianDisplay.readingFactor();return{textWidth:rect.width,headingHeight:h.height,gutterError:Math.abs(m.top+m.height/2-(h.top+parseFloat(getComputedStyle(heading).lineHeight)*k/2)),factor:k,ui:QijianDisplay.get().uiScale}})()`);
 await pause(150);const baseline=await measure();details.baseline=baseline;details.scales=[];
 for(const uiScale of [1,1.1,1.25,1.5])for(const readingScale of [.75,.9,1,1.1,1.25,1.5,1.75,2]){
  await run('QijianDisplay.configure('+JSON.stringify({uiScale,readingScale})+')');await pause(80);
  const metric=await measure();assert.equal(win.webContents.getZoomFactor(),uiScale);
  assert(Math.abs(metric.textWidth*uiScale/baseline.textWidth-readingScale)<.02,JSON.stringify(metric));
  assert(metric.gutterError<2,JSON.stringify(metric));details.scales.push({uiScale,readingScale,...metric});
 }
 checks.all32ScaleCombinations=true;
 checks.zoomPreservesDocumentAndSelection=await run('__original===qijianEditor.getHTML()&&__selection===JSON.stringify(qijianEditor.getSelection())&&__settings===JSON.stringify(library.settings)');
 // Reading zoom and toolbar actions must leave edit history intact.
 await run('qijianEditor.view.dispatch(qijianEditor.view.state.tr.insertText("INSERT"));true');
 await run('action("readingZoomReset")');await run('action("readingZoomIn")');
 await run('qijianEditor.undo();true');checks.zoomPreservesUndo=await run('__original===qijianEditor.getHTML()');
 await run('qijianEditor.redo();true');checks.zoomPreservesRedo=await run('qijianEditor.getHTML().includes("INSERT")');
 // Hit testing and image resize at both zoom ratios (UI compensation can be below 1).
 for(const pair of [{uiScale:1.5,readingScale:.75},{uiScale:1,readingScale:1.5}]){
  await run('QijianDisplay.configure('+JSON.stringify(pair)+')');
  await run('qijianEditor.setContent('+JSON.stringify(content)+');document.querySelector(".writing").scrollTop=0;true');await pause(100);
  const hit=await run(`(()=>{const p=document.querySelector('#editor>p'),text=p.firstChild,r=document.createRange();r.setStart(text,3);r.setEnd(text,4);const b=r.getBoundingClientRect();return {x:b.left+1,y:b.top+b.height/2,expected:qijianEditor.view.posAtDOM(text,3)}})()`);
  // sendInputEvent receives physical DIP coordinates of the web contents.
  win.webContents.sendInputEvent({type:'mouseDown',x:Math.round(hit.x*pair.uiScale),y:Math.round(hit.y*pair.uiScale),button:'left',clickCount:1});
  win.webContents.sendInputEvent({type:'mouseUp',x:Math.round(hit.x*pair.uiScale),y:Math.round(hit.y*pair.uiScale),button:'left',clickCount:1});await pause(80);
  const selection=await run('qijianEditor.view.state.selection.from');assert(Math.abs(selection-hit.expected)<=1,JSON.stringify({selection,hit,pair}));
  const resized=await run(`(async()=>{const figure=document.querySelector('#editor figure.editor-image');figure.scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(r));const k=QijianDisplay.readingFactor(),before=qijianEditor.getHTML(),r=figure.getBoundingClientRect(),handle=figure.querySelector('[data-corner=se]'),start=r.width/k;handle.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0,clientX:r.right,clientY:r.bottom}));window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,buttons:1,clientX:r.right+30*k,clientY:r.bottom}));window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0}));await new Promise(r=>setTimeout(r,50));const width=document.querySelector('#editor figure').getBoundingClientRect().width/k;qijianEditor.undo();return{start,width,undo:qijianEditor.getHTML()===before}})()`);
  details['resize'+pair.uiScale+'-'+pair.readingScale]=resized;assert(Math.abs(resized.width-resized.start-30)<2);assert(resized.undo);
  const moved=await run(`(async()=>{const before=qijianEditor.getHTML(),figure=document.querySelector('#editor figure'),last=document.querySelector('#editor>p:last-child');last.scrollIntoView({block:'end'});await new Promise(r=>requestAnimationFrame(r));const a=figure.getBoundingClientRect(),b=last.getBoundingClientRect(),x=a.left+a.width/2,y=a.top+a.height/2;figure.querySelector('img').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y}));window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,buttons:1,clientX:b.left+b.width/2,clientY:b.bottom-2}));const preview=!!document.querySelector('.image-drop-indicator');window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0}));await new Promise(r=>setTimeout(r,60));const moved=document.querySelector('#editor').lastElementChild.classList.contains('image-row');qijianEditor.undo();return {preview,moved,undo:before===qijianEditor.getHTML(),stale:!!document.querySelector('.image-drop-indicator,.image-drag-preview')}})()`);
  assert(moved.preview&&moved.moved&&moved.undo&&!moved.stale,JSON.stringify(moved));
 }
 checks.caretImageResizeAndDragAtBothRatios=true;
 for(const scale of [.75,1.5]){
  await run('QijianDisplay.configure({uiScale:1.25,readingScale:'+scale+'})');
  const outline=await run(`(async()=>{document.querySelector('.writing').scrollTop=0;const item=document.querySelector('#editor li'),k=QijianDisplay.readingFactor(),rect=item.getBoundingClientRect(),size=parseFloat(getComputedStyle(item).fontSize)*k;item.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0,clientX:rect.left+size*.3,clientY:rect.top+size*.6}));await new Promise(r=>setTimeout(r,300));const current=document.querySelector('#editor li'),collapsed=current.classList.contains('outline-collapsed'),newRect=current.getBoundingClientRect();current.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0,clientX:newRect.left+size*.3,clientY:newRect.top+size*.6}));await new Promise(r=>setTimeout(r,300));return {collapsed,expanded:!document.querySelector('#editor li').classList.contains('outline-collapsed')}})()`);
  assert(outline.collapsed&&outline.expanded,JSON.stringify(outline));
 }
 checks.outlineBulletAtBothScales=true;
 // Detached settings change uses the same preference controls and keeps dimensions usable.
 await run('QijianDisplay.configure({uiScale:1,readingScale:1})');await run('openSettings();true');
 await until(()=>BrowserWindow.getAllWindows().some(w=>w.getTitle()==='设置'),'settings');
 const popup=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='设置');popup.webContents.setBackgroundThrottling(false);popup.showInactive();
 const poprun=code=>popup.webContents.executeJavaScript(code,true);
 await until(()=>poprun('!!document.querySelector("#interfaceScale")').catch(()=>false),'setting controls');
 const sizeBefore=popup.getSize();
 await poprun('document.querySelector("#interfaceScale").value="1.5";document.querySelector("#interfaceScale").dispatchEvent(new Event("change",{bubbles:true}));true');
 await until(()=>win.webContents.getZoomFactor()===1.5,'UI scale');await pause(150);
 assert.equal(popup.webContents.getZoomFactor(),1.5);
 checks.detachedSettingsAndResizing=popup.getSize()[0]>sizeBefore[0];
 await poprun('document.querySelector(".display-preferences").scrollIntoView({block:"end"});true');await pause(150);
 fs.writeFileSync(path.join(output,'settings-150.png'),(await popup.webContents.capturePage()).toPNG());
 await poprun('document.querySelector("#readingScale").value="1.25";document.querySelector("#readingScale").dispatchEvent(new Event("change",{bubbles:true}));true');
 await until(()=>run('QijianDisplay.get().readingScale===1.25'),'reading select');
 const prefFile=path.join(root,'profile','display-preferences.json');
 checks.savedOutsideLibrary=JSON.parse(fs.readFileSync(prefFile)).readingScale===1.25&&await run('!("readingScale" in library.settings)&&!("uiScale" in library.settings)');
 await poprun('document.querySelector("#resetDisplay").click();true');await until(()=>win.webContents.getZoomFactor()===1,'reset');
 checks.resetBoth=await run('QijianDisplay.get().uiScale===1&&QijianDisplay.get().readingScale===1');
 await run('closeDetachedDialog("settingsDialog");document.querySelector("#settingsDialog").classList.add("hidden");true');
 // Export HTML and actual raster/PDF geometry are independent of display scale.
 await run('qijianEditor.setContent('+JSON.stringify(content)+');true');
 const exports=[];
 for(const value of [1,1.5]){
  await run('QijianDisplay.configure({uiScale:'+value+',readingScale:'+value+'})');
  const payload=await run('imageExportPayload()');exports.push(payload);
  destination=path.join(output,'zoom-'+value+'.png');await run('qijian.exportPng('+JSON.stringify(payload)+')');
  destination=path.join(output,'zoom-'+value+'.pdf');await run('qijian.exportPdf('+JSON.stringify({...payload,width:'a4',format:'pdf'})+')');
 }
 assert.deepEqual(exports[0],exports[1]);
 details.pngEqual=fs.readFileSync(path.join(output,'zoom-1.png')).equals(fs.readFileSync(path.join(output,'zoom-1.5.png')));details.exportMetrics=exportMetrics;assert(details.pngEqual);
 const pdfSize=value=>[...fs.readFileSync(path.join(output,'zoom-'+value+'.pdf'),'latin1').matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map(m=>m[1]);
 assert.deepEqual(pdfSize(1),pdfSize(1.5));checks.exportsUnaffected=true;
 checks.exportDidNotResetZoom=win.webContents.getZoomFactor()===1.5;
 await run('openSettings();true');await until(()=>BrowserWindow.getAllWindows().some(w=>w.getTitle()==='设置'),'new zoomed settings');
 const zoomedPopup=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='设置');await pause(200);
 checks.newDialogsInheritInterfaceScale=zoomedPopup.webContents.getZoomFactor()===1.5;
 await run('closeDetachedDialog("settingsDialog");document.querySelector("#settingsDialog").classList.add("hidden");true');
 await run('QijianDisplay.configure({uiScale:1,readingScale:1})');
 await run('qijianEditor.setContent(Array.from({length:60},(_,i)=>"<p>Section "+i+" "+"正文段落 ".repeat(20)+"</p>").join(""));document.querySelectorAll("#editor>p")[30].scrollIntoView({block:"start"});true');await pause(100);
 const anchorBefore=await run('(()=>{const top=document.querySelector(".writing").getBoundingClientRect().top;return [...document.querySelectorAll("#editor>p")].findIndex(p=>p.getBoundingClientRect().bottom>top+1)})()');
 await run('QijianDisplay.configure({uiScale:1.25,readingScale:1.5})');await pause(100);
 const anchorAfter=await run('(()=>{const top=document.querySelector(".writing").getBoundingClientRect().top;return [...document.querySelectorAll("#editor>p")].findIndex(p=>p.getBoundingClientRect().bottom>top+1)})()');
 checks.zoomKeepsReadingParagraph=Math.abs(anchorAfter-anchorBefore)<=1;

 // Reload actually re-reads the persisted local setting; malformed values reject safely.
 await run('QijianDisplay.configure({uiScale:1.25,readingScale:1.1})');win.reload();
 await until(()=>run('typeof activeDoc!=="undefined"&&!!activeDoc&&QijianDisplay.get().uiScale===1.25').catch(()=>false),'reload');
 checks.reloadRestoresLocalChoices=await run('QijianDisplay.get().readingScale===1.1');
 checks.invalidValueRejected=await run('qijian.configureDisplay({uiScale:99}).then(()=>false,()=>true)');
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({checks,details},null,2));console.log(JSON.stringify({checks,details},null,2));
 assert(Object.values(checks).every(Boolean));app.exit(0);
}catch(error){console.error(error);console.log(JSON.stringify({checks,details},null,2));app.exit(1)}});
