const {app,BrowserWindow}=require('electron');
const fs=require('fs'),os=require('os'),path=require('path');
const root=path.join(os.tmpdir(),'qijian-image-undo-'+process.pid);
process.env.QIJIAN_TEST_LIBRARY_ROOT=root;
require('../src/main.js');
app.whenReady().then(async()=>{
 let code=0;
 try{
  await new Promise(resolve=>setTimeout(resolve,2400));
  const win=BrowserWindow.getAllWindows().find(window=>window.webContents.getURL().includes('index.html'));
  const result=await win.webContents.executeJavaScript(`(async()=>{
   const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',checks={};
   $('#editor').innerHTML='<p><br></p>';caretAtStart($('#editor p'));
   placeEditorImage(makeEditorImageFigure({url:pixel}),$('#editor p'));
   checks.inserted=!!$('#editor .image-row figure');checks.noAutomaticBlankOnInsert=$('#editor').children.length===1&&$('#editor').firstElementChild.classList.contains('image-row');
   const figure=$('#editor figure');figure.style.width='280px';figure.querySelector('img').style.height='160px';numbers();checks.imageLines=$('#lineNumbers').children.length===1;
   const start=performance.now();document.execCommand('undo');checks.undoMs=performance.now()-start;checks.undoInsert=!$('#editor img');document.execCommand('redo');checks.redoInsert=!!$('#editor figure');
   checks.deleteReturned=removeEditorImageFigure($('#editor figure'));checks.deleteImage=!$('#editor img');document.execCommand('undo');checks.undoDelete=!!$('#editor figure img');document.execCommand('redo');checks.redoDelete=!$('#editor figure');
   $('#editor').innerHTML='<p>正文</p><ul class="outline-list"><li>父项<ul class="outline-list"><li>子项<img src="'+pixel+'"></li></ul></li></ul><p>结束</p>';normalizeEditorImages();
   const selection=getSelection(),range=document.createRange();$('#editor').focus();range.selectNodeContents($('#editor'));selection.removeAllRanges();selection.addRange(range);const copied={};copyEditorImageContent({clipboardData:{setData:(type,value)=>copied[type]=value},preventDefault:()=>{}});
   checks.outlineCopyKeepsDepth=copied['text/plain'].includes(String.fromCharCode(9)+'- 子项');checks.outlineCopyHasOnlyImage=copied['text/html'].includes('<img')&&!/editor-image|image-drag-grip|image-resize-handle/.test(copied['text/html']);
   $('#editor').innerHTML='<p><br></p>';caretAtStart($('#editor p'));pasteEditorContent({clipboardData:{items:[{type:'image/png',getAsFile:()=>null}],getData:type=>copied[type]||''},preventDefault:()=>{}});await new Promise(resolve=>setTimeout(resolve,160));
   checks.outlineWithImageRoundTrips=!!$('#editor>ul>li>ul>li>.image-row>figure img')&&$('#editor').textContent.includes('正文')&&$('#editor').textContent.includes('结束');checks.pasteStoresImagePath=$('#editor img')?.src.startsWith('file:');document.execCommand('undo');checks.undoMixedPaste=!$('#editor img');document.execCommand('redo');checks.redoMixedPaste=!!$('#editor>ul>li>ul>li>.image-row>figure img');
   const row=$('#editor .image-row'),figureInOutline=row.querySelector('figure'),id=figureInOutline.dataset.imageId,rect=figureInOutline.getBoundingClientRect(),oldWidth=figureInOutline.style.width;
   figureInOutline.querySelector('[data-corner="se"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:rect.right,clientY:rect.bottom}));window.dispatchEvent(new PointerEvent('pointermove',{clientX:rect.right-80}));window.dispatchEvent(new PointerEvent('pointerup'));
   const newWidth=$('#editor figure[data-image-id="'+id+'"]').style.width;checks.resizeChangesWidth=newWidth!==oldWidth;document.execCommand('undo');checks.undoResize=$('#editor figure[data-image-id="'+id+'"]').style.width===oldWidth;document.execCommand('redo');checks.redoResize=$('#editor figure[data-image-id="'+id+'"]').style.width===newWidth;
   removeEditorImageFigure($('#editor figure'));checks.deleteOutlineImage=!$('#editor img')&&$('#editor li').textContent.includes('父项');document.execCommand('undo');checks.undoOutlineImageDelete=!!$('#editor>ul>li>ul>li>.image-row>figure img');
   const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1000;const context=canvas.getContext('2d'),noise=context.createImageData(canvas.width,canvas.height);let seed=7;for(let index=0;index<noise.data.length;index+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;noise.data[index]=seed&255;noise.data[index+1]=(seed>>>8)&255;noise.data[index+2]=(seed>>>16)&255;noise.data[index+3]=255}context.putImageData(noise,0,0);const largeData=canvas.toDataURL();
   const attachment=await window.qijian.addAttachmentData(largeData,'undo-perf');checks.largeImageStoredOutsideDocument=attachment.url.length<300&&largeData.length>1000000;
   $('#editor').innerHTML=Array.from({length:1000},(_,index)=>'<p>长文稿段落 '+index+' 中文正文 English 123。</p>').join('')+'<p><br></p>';caretAtStart($('#editor>p:last-child'));placeEditorImage(makeEditorImageFigure(attachment),$('#editor>p:last-child'));
   const times=[];for(let index=0;index<12;index++){removeEditorImageFigure($('#editor figure'));const t=performance.now();document.execCommand('undo');times.push(performance.now()-t);if(!$('#editor figure img'))throw new Error('长文稿图片撤销丢失');await new Promise(resolve=>requestAnimationFrame(resolve))}
   checks.longDocumentUndoMaxMs=Math.max(...times);checks.longDocumentUndoMedianMs=[...times].sort((a,b)=>a-b)[6];checks.longDocumentUndoResponsive=checks.longDocumentUndoMaxMs<150;
   const migrationDoc={id:'migration-picture',type:'document',content:'<p>旧文稿</p><img src="'+pixel+'">',versions:[{content:'<img src="'+pixel+'">'}]};library.nodes.push(migrationDoc);library.documentNormalizationVersion=3;await normalizeStoredDocuments();checks.oldEmbeddedImagesMigrated=!migrationDoc.content.includes('data:image')&&!migrationDoc.versions[0].content.includes('data:image')&&migrationDoc.content.includes('file:');
   $('#editor').innerHTML='';const legacyFigure=makeEditorImageFigure({url:pixel});legacyFigure.removeAttribute('tabindex');const legacyParagraph=document.createElement('p');legacyParagraph.appendChild(legacyFigure);$('#editor').appendChild(legacyParagraph);normalizeEditorImages();checks.legacyNestedFrameRepaired=!!$('#editor>.image-row>figure')&&$('#editor figure').tabIndex===0;
   const rowBefore=$('#editor .image-row');rowBefore.firstElementChild.classList.add('image-selected');checks.noAutomaticBoundaryBlank=!rowBefore.previousElementSibling?.matches('p')&&!rowBefore.nextElementSibling?.matches('p');
   const additional=makeEditorImageFigure({url:pixel});rowBefore.appendChild(additional);const first=rowBefore.firstElementChild;first.dataset.caretSide='after';first.focus();first.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));checks.enterSplitsImages=$$('#editor>.image-row').length===2&&$$('#editor img').length===2;document.execCommand('undo');checks.undoImageSplit=$$('#editor>.image-row').length===1&&$$('#editor img').length===2;
   breakImageRow($('#editor figure'),'before');checks.enterBeforeImageCreatesLine=$('#editor').firstElementChild.tagName==='P'&&!!$('#editor img');
   $('#editor').innerHTML='<p>正文</p>';const table=makeTableBlock([['标题'],['值']]);$('#editor').appendChild(table);checks.tableFontDefault=Math.abs(parseFloat(getComputedStyle(table).fontSize)-(parseFloat(getComputedStyle($('#editor')).fontSize)-2))<.1;openTableEditor(table);$('#tableFontSize').value=12;$('#tableEditorSave').click();checks.tableFontEditable=$('#editor .table-block').style.fontSize==='12px';
   return checks;
  })().catch(error=>({error:error.stack}))`);
  if(result.error)throw new Error(result.error);
  console.log(result);if(Object.entries(result).some(([key,value])=>!key.endsWith('Ms')&&!value))throw new Error('Image regression failed');
 }catch(error){console.error(error);code=1}
 finally{const temp=path.resolve(os.tmpdir())+path.sep;if(path.resolve(root).startsWith(temp))fs.rmSync(root,{recursive:true,force:true});app.exit(code)}
});
