const {app,BrowserWindow}=require('electron');
const fs=require('fs'),os=require('os'),path=require('path');
const root=path.join(os.tmpdir(),'qijian-format-undo-'+process.pid);
process.env.QIJIAN_TEST_LIBRARY_ROOT=root;
require('../src/main.js');
app.whenReady().then(async()=>{
 let code=0;
 try{
  await new Promise(resolve=>setTimeout(resolve,2400));
  const win=BrowserWindow.getAllWindows().find(window=>window.webContents.getURL().includes('index.html'));
  const checks=await win.webContents.executeJavaScript(`(()=>{
   const editor=$('#editor'),selection=getSelection(),selectText=(node,start=0,end=node.length)=>{editor.focus();const range=document.createRange();range.setStart(node,start);range.setEnd(node,end);selection.removeAllRanges();selection.addRange(range)};
   editor.innerHTML='<p>11.5补卡</p><p>政权问题：这一部分明确了代表会与委员</p>';selectText(editor.firstChild.firstChild,editor.firstChild.firstChild.length);setBlock('h1');
   const result={headingApplied:editor.firstElementChild.tagName==='H1'};document.execCommand('undo');result.headingUndo=editor.firstElementChild.tagName==='P'&&editor.firstElementChild.textContent==='11.5补卡';document.execCommand('redo');result.headingRedo=editor.firstElementChild.tagName==='H1';
   const body=editor.children[1].firstChild,start=body.textContent.lastIndexOf('委员');selectText(body,start,start+2);insertSemanticMark('bold');result.boldApplied=editor.querySelector('strong')?.textContent==='委员'&&!editor.textContent.includes('**');document.execCommand('undo');result.boldUndo=!editor.querySelector('strong')&&editor.children[1].textContent.endsWith('委员');document.execCommand('redo');result.boldRedo=editor.querySelector('strong')?.textContent==='委员'&&!editor.textContent.includes('**');
   editor.innerHTML='<p><br></p>';resetEditorUndoHistory();const rawLine=editor.querySelector('p');editor.focus();const rawRange=document.createRange();rawRange.selectNodeContents(rawLine);rawRange.collapse(true);selection.removeAllRanges();selection.addRange(rawRange);document.execCommand('insertText',false,'**格式**');const typedText=rawLine.firstChild,typedRange=document.createRange();typedRange.setStart(typedText,typedText.length);typedRange.collapse(true);selection.removeAllRanges();selection.addRange(typedRange);const converted=inlineMarkdown();result.typedFormatApplied=editor.querySelector('strong')?.textContent==='格式'&&editor.textContent==='格式';document.execCommand('undo');result.typedFormatUndo=editor.textContent==='**格式**'&&!editor.querySelector('strong');document.execCommand('redo');result.typedFormatRedo=editor.querySelector('strong')?.textContent==='格式'&&editor.textContent==='格式';
   const docA={id:'undo-doc-a',type:'document',title:'A',parentId:null,order:1,createdAt:now(),updatedAt:now(),deletedAt:null,content:'<p>A原文</p>',versions:[]},docB={id:'undo-doc-b',type:'document',title:'B',parentId:null,order:2,createdAt:now(),updatedAt:now(),deletedAt:null,content:'<p>B原文</p>',versions:[]};library.nodes.push(docA,docB);select(docA.id);const aText=editor.querySelector('p').firstChild;selectText(aText,aText.length);document.execCommand('insertText',false,'已修改');syncActiveDoc();select(docB.id);editor.focus();document.execCommand('undo');result.undoStaysInCurrentDocument=activeDoc.id===docB.id&&editor.textContent==='B原文'&&docA.content.includes('已修改');return result;
  })()`);
  console.log(checks);if(Object.values(checks).some(value=>!value))throw new Error('Format undo regression failed');
 }catch(error){console.error(error);code=1}
 finally{if(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep))fs.rmSync(root,{recursive:true,force:true});app.exit(code)}
});
