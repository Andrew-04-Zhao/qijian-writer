const {app,BrowserWindow}=require('electron');
const fs=require('fs'),os=require('os'),path=require('path');
const {pathToFileURL}=require('url');
const {buildImageHtml}=require('../src/image-export');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'qijian-export-images-'));
const attachments=path.join(root,'attachments'),outside=path.join(root,'临时 图片');
fs.mkdirSync(attachments,{recursive:true});fs.mkdirSync(outside,{recursive:true});
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlOQAAAAASUVORK5CYII=','base64');
const managed=path.join(attachments,'附件.png'),external=path.join(outside,'外部 & 图片.png');
fs.writeFileSync(managed,pixel);fs.writeFileSync(external,pixel);

app.whenReady().then(async()=>{
 let win,code=0;
 try{
  const externalUrl=pathToFileURL(external).href.replace('&','&amp;');
  const legacyManagedUrl=`file://${managed.replace(/\\/g,'/')}`;
  const html=buildImageHtml({title:'图片导出测试',settings:{latinFont:'times',chineseFont:'kai',lineHeight:2.1},html:`<p>English 中文</p><div class="image-row"><figure class="editor-image"><img src="${legacyManagedUrl}" alt="旧附件地址"></figure><figure class="editor-image"><img src="${externalUrl}" alt="旧临时图片"></figure></div><p>图片后</p>`},attachments);
  const dataCount=(html.match(/src="data:image\//g)||[]).length;
  win=new BrowserWindow({width:720,height:900,show:false,paintWhenInitiallyHidden:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  const file=path.join(root,'export.html');fs.writeFileSync(file,html,'utf8');await win.loadFile(file);
  const rendered=await win.webContents.executeJavaScript(`Promise.all([...document.images].map(img=>img.decode().catch(()=>{}))).then(()=>({count:document.images.length,loaded:[...document.images].every(img=>img.complete&&img.naturalWidth>0),sources:[...document.images].map(img=>img.currentSrc.slice(0,20)),fontFamily:getComputedStyle(document.body).fontFamily,lineHeight:getComputedStyle(document.body).lineHeight,fontSize:getComputedStyle(document.body).fontSize}))`);
  const pdf=await win.webContents.printToPDF({printBackground:true,preferCSSPageSize:true,pageSize:'A4'});
  const checks={bothInlined:dataCount===2,noLocalUrls:!html.includes('src="file:'),bothRendered:rendered.count===2&&rendered.loaded,usesDocumentLatinFont:rendered.fontFamily.includes('Times New Roman'),usesDocumentChineseFont:rendered.fontFamily.includes('KaiTi'),usesDocumentLineHeight:Math.abs(parseFloat(rendered.lineHeight)/parseFloat(rendered.fontSize)-2.1)<.02,pdfCreated:pdf.length>10000};
  console.log(JSON.stringify({checks,rendered,pdfBytes:pdf.length},null,2));if(Object.values(checks).some(value=>!value))code=1;
 }catch(error){console.error(error);code=1}finally{try{win?.destroy()}catch{}try{fs.rmSync(root,{recursive:true,force:true})}catch{}app.exit(code)}
});
