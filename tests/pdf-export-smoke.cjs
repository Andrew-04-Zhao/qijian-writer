const {app,BrowserWindow,dialog,nativeImage}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const {pathToFileURL}=require('url');
const {pdfLayout,buildPdfHtml}=require('../src/pdf-export');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qijian-pdf-options-'));
const output=path.resolve('dist/pdf-options-qa');fs.mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(root,'profile'));process.env.QIJIAN_TEST_LIBRARY_ROOT=root;process.env.QIJIAN_TEST_DETACHED='1';
const imageDir=path.join(root,'attachments','pdf-doc');fs.mkdirSync(imageDir,{recursive:true});
const imageFile=path.join(imageDir,'test.png'),pixels=Buffer.alloc(160*80*4);for(let i=0;i<pixels.length;i+=4){pixels[i]=60;pixels[i+1]=90;pixels[i+2]=210;pixels[i+3]=255}
const image=nativeImage.createFromBitmap(pixels,{width:160,height:80}).toPNG();fs.writeFileSync(imageFile,image);
const content='<h1>导出测试 Export heading</h1><p>FONT_PROBE 正文与字体 <strong>加粗</strong> <em>italic</em> <a href="https://example.com">链接</a></p><ul><li><p>父条目</p><ul><li><p>子条目</p></li></ul></li></ul><div class="image-row"><figure class="editor-image" data-image-id="test"><img src="'+pathToFileURL(imageFile).href+'" width="160" height="80"></figure></div><table><tbody><tr><th><p>表头</p></th><th><p>数据</p></th></tr><tr><td><p>中文单元格</p></td><td><p>123.45</p></td></tr></tbody></table><p><span class="editor-formula formula-inline" data-latex="x^2+y^2">x</span></p><div class="editor-formula formula-block" data-latex="E=mc^2\\tag{1}"></div>'+Array.from({length:22},(_,i)=>'<p>PARAGRAPH_'+i+' '+('中英文混合段落 Mixed paragraph. '.repeat(5))+'</p>').join('')+'<p>END_OF_DOCUMENT 文稿结束</p>';
const now=new Date().toISOString();fs.writeFileSync(path.join(root,'library.json'),JSON.stringify({nodes:[{id:'pdf-doc',type:'document',title:'导出测试',content,versions:[],createdAt:now,updatedAt:now}],activeId:'pdf-doc',settings:{latinFont:'georgia',chineseFont:'yahei',fontSize:19,lineHeight:1.8},historyResetVersion:1,historyPolicyVersion:1,documentNormalizationVersion:8,writeRevision:0}));
let destination,saveCalls=0,cancel=false;
dialog.showSaveDialog=async()=>{saveCalls++;return cancel?{canceled:true}:{canceled:false,filePath:destination}};
require(process.env.QIJIAN_TEST_APP||'../src/main.js');const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<180;i++){if(await fn())return;await pause(60)}throw Error('Timeout '+label)}
app.whenReady().then(async()=>{try{
 let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html'));return win},'main');
 const run=code=>win.webContents.executeJavaScript(code,true);
 await until(()=>run('typeof activeDoc!=="undefined"&&!!activeDoc&&qijianEditor.enabled').catch(()=>false),'editor');win.webContents.setBackgroundThrottling(false);
 await run('window.__original=qijianEditor.getHTML();window.__originalSettings=JSON.stringify(library.settings);window.alert=message=>window.__exportError=message;openImageExport();true');
 await run('document.querySelector("[data-image-size=large]").click();document.querySelector("[data-image-width=\\"1080\\"]").click();closeImageExport();true');
 await run('action("pdf");true');await until(()=>BrowserWindow.getAllWindows().some(w=>w.getTitle()==='导出 PDF'),'pdf popup');
 let popup=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='导出 PDF');popup.webContents.setBackgroundThrottling(false);popup.showInactive();
 const checks={menuOpensOptionsWithoutSaving:saveCalls===0};
 checks.defaults=await run('exportFormat==="pdf"&&pdfExportState.width==="a4"&&pdfExportState.size==="normal"');
 const cases=[];
 for(const width of ['a4',720,1080,1440])for(const size of ['small','normal','large']){
  await popup.webContents.executeJavaScript('document.querySelector('+JSON.stringify('[data-image-width="'+width+'"]')+').click();document.querySelector('+JSON.stringify('[data-image-size="'+size+'"]')+').click();true');
  const layout=pdfLayout({width,size});
  await until(()=>run('!imagePreviewRunning&&document.querySelector("#imageExportFrame").srcdoc.includes('+JSON.stringify('body{font-size:'+layout.fontPt+'pt')+')'),'preview');
  const payload=await run('imageExportPayload()');assert.equal(String(payload.width),String(width));assert.equal(payload.size,size);assert.equal(payload.format,'pdf');
  assert(buildPdfHtml(payload,root).includes('@page{size:'+layout.pageSize));
  destination=path.join(output,String(width)+'-'+size+'.pdf');
  await run('window.qijian.exportPdf(imageExportPayload())');const pdf=fs.readFileSync(destination);assert(pdf.subarray(0,4).toString()==='%PDF');
  const raw=pdf.toString('latin1'),boxes=[...raw.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
  assert(boxes.length>0);assert(boxes.every(b=>Math.abs(Number(b[1])-layout.width*.75)<1&&Math.abs(Number(b[2])-layout.height*.75)<1));
  assert(/\/Subtype\s*\/Image/.test(raw));
  cases.push({width,size,file:destination,fontPt:layout.fontPt,widthPt:layout.width*.75,heightPt:layout.height*.75});
 }
 checks.allTwelveCombinations=cases.length===12;
 await popup.webContents.executeJavaScript('document.querySelector("[data-image-width=a4]").click();document.querySelector("[data-image-size=normal]").click();true');
 await pause(350);fs.writeFileSync(path.join(output,'pdf-dialog.png'),(await popup.webContents.capturePage()).toPNG());
 cancel=true;await run('document.querySelector("#saveImageExport").onclick()');
 checks.cancelKeepsOptions=await run('!document.querySelector("#imageExportDialog").classList.contains("hidden")&&!document.querySelector("#saveImageExport").disabled');
 cancel=false;destination=output;await run('document.querySelector("#saveImageExport").onclick()');
 checks.failureAllowsRetry=await run('!!__exportError&&!document.querySelector("#saveImageExport").disabled&&!document.querySelector("#imageExportDialog").classList.contains("hidden")');
 destination=path.join(output,'button-export.pdf');await run('document.querySelector("#saveImageExport").onclick()');
 checks.saveButtonExportsAndReleasesPreview=fs.existsSync(destination)&&await run('document.querySelector("#imageExportDialog").classList.contains("hidden")&&!document.querySelector("#imageExportFrame").srcdoc');
 await run('openImageExport();true');await pause(200);
 checks.pngSettingsIndependent=await run('exportFormat==="png"&&imageExportState.width===1080&&imageExportState.size==="large"&&getComputedStyle(document.querySelector(".pdf-only")).display==="none"');
 await run('closeImageExport();true');
 checks.documentUnchanged=await run('__original===qijianEditor.getHTML()&&__originalSettings===JSON.stringify(library.settings)')&&fs.readFileSync(imageFile).equals(image);
 checks.invalidOptionsFallBack=pdfLayout({width:2,size:'invalid'}).pageSize==='A4'&&pdfLayout({width:2,size:'invalid'}).fontPt===12;
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({checks,cases},null,2));console.log(JSON.stringify(checks,null,2));assert(Object.values(checks).every(Boolean));app.exit(0);
}catch(e){console.error(e);app.exit(1)}});
