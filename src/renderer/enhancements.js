const slashCommands=[
  ['一级标题','h1'],['二级标题','h2'],['三级标题','h3'],['四级标题','h4'],['五级标题','h5'],['六级标题','h6'],
  ['正文','p'],['引用','blockquote'],['无序列表','insertUnorderedList'],['有序列表','insertOrderedList'],
  ['代码块','pre'],['注释','note'],['分隔线','hr'],['公式','formula']
];
let slashBlock=null,slashIndex=0,pastePlainOnce=false;
function editorRange(){const selection=getSelection();if(!selection?.rangeCount)return null;const range=selection.getRangeAt(0);return $('#editor').contains(range.commonAncestorContainer)?range:null}
function caretAfter(node){const r=document.createRange();r.setStartAfter(node);r.collapse(true);const selection=getSelection();selection.removeAllRanges();selection.addRange(r)}
function caretAtStart(node){const r=document.createRange();r.selectNodeContents(node);r.collapse(true);const selection=getSelection();selection.removeAllRanges();selection.addRange(r)}
function caretAtTextOffset(node,offset){const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT),nodes=[];let current;while(current=walker.nextNode())nodes.push(current);let remaining=Math.max(0,offset);for(let index=0;index<nodes.length;index++){current=nodes[index];if(remaining<current.length||remaining===current.length&&!nodes[index+1]){const range=document.createRange();range.setStart(current,remaining);range.collapse(true);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);return true}if(remaining===current.length&&nodes[index+1]){const range=document.createRange();range.setStart(nodes[index+1],0);range.collapse(true);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);return true}remaining-=current.length}caretAfter(node);return false}
function currentBlock(){const r=editorRange();if(!r)return null;const el=r.startContainer.nodeType===Node.ELEMENT_NODE?r.startContainer:r.startContainer.parentElement;return el?.closest('p,div,h1,h2,h3,h4,h5,h6,blockquote,li,pre,aside')}

function clearBlockPresentation(block){
  block.removeAttribute('style');
  block.querySelectorAll('[style]').forEach(element=>element.removeAttribute('style'));
}
function normalizeEmptyHeading(){
  const block=currentBlock();
  if(!block||!/^H[1-6]$/.test(block.tagName)||block.textContent.trim()||block.querySelector('img,table'))return false;
  const paragraph=document.createElement('p');paragraph.innerHTML='<br>';block.replaceWith(paragraph);caretAtStart(paragraph);return true;
}
function setBlock(tag){
  if(window.qijianEditor?.enabled)return window.qijianEditor.setBlock(tag);
  const saved=editorRange()?.cloneRange();$('#editor').focus({preventScroll:true});if(saved&&$('#editor').contains(saved.commonAncestorContainer)){const selection=getSelection();selection.removeAllRanges();selection.addRange(saved)}const block=currentBlock();if(!block)return;
  const target=String(tag).toUpperCase();
  if(block.tagName!==target){
    if(!block.textContent&&block.parentElement?.id==='editor'){
      const replacement=document.createElement(String(tag).toLowerCase());replacement.innerHTML='<br>';block.replaceWith(replacement);caretAtStart(replacement);persist(true);requestAnimationFrame(numbers);renderOutline();return;
    }
    const previous=block.previousElementSibling,originalHtml=block.innerHTML||'<br>';document.execCommand('formatBlock',false,`<${String(tag).toLowerCase()}>`);const candidate=previous?previous.nextElementSibling:$('#editor').firstElementChild;
    if(candidate?.tagName!==target&&candidate?.parentElement?.id==='editor'){
      const replacement=document.createElement(String(tag).toLowerCase());replacement.innerHTML=originalHtml;
      const replace=document.createRange(),selection=getSelection();replace.selectNode(candidate);selection.removeAllRanges();selection.addRange(replace);document.execCommand('insertHTML',false,replacement.outerHTML);const inserted=previous?previous.nextElementSibling:$('#editor').firstElementChild;if(inserted)caretAtStart(inserted);
    }
  }
  const replacement=currentBlock();if(target==='P'&&replacement)clearBlockPresentation(replacement);
  persist(true);requestAnimationFrame(numbers);renderOutline();
}
function setOutline(ordered=false){
  if(window.qijianEditor?.enabled)return window.qijianEditor.setOutline(ordered);
  $('#editor').focus();
  const block=currentBlock();if(!block)return;
  const tag=ordered?'OL':'UL';
  if(block.tagName==='LI'){
    const list=block.parentElement;
    if(list?.tagName!==tag){const replacement=document.createElement(tag.toLowerCase());replacement.className='outline-list';while(list?.firstChild)replacement.appendChild(list.firstChild);list?.replaceWith(replacement)}
    else list.classList.add('outline-list');
  }else if(block.parentElement?.id==='editor'){
    const list=document.createElement(tag.toLowerCase()),item=document.createElement('li');list.className='outline-list';
    while(block.firstChild)item.appendChild(block.firstChild);
    if(!item.textContent&&!item.querySelector('img,br'))item.innerHTML='<br>';
    list.appendChild(item);block.replaceWith(list);caretAtStart(item);
  }else return;
  $('#editor').querySelectorAll('ul,ol').forEach(list=>list.classList.add('outline-list'));
  persist(true);requestAnimationFrame(numbers);renderOutline();refreshMindmapWindows();
}
function insertSpecialBlock(kind,block=currentBlock()){
  if(window.qijianEditor?.enabled)return window.qijianEditor.insertSpecialBlock(kind);
  if(!block||block.parentElement?.id!=='editor')return;
  if(kind==='note'){
    const note=document.createElement('aside');note.className='editor-note';
    note.innerHTML=block.innerHTML||'<br>';block.replaceWith(note);caretAtStart(note);
  }else{
    const rule=document.createElement('hr');rule.setAttribute('contenteditable','false');const paragraph=document.createElement('p');paragraph.innerHTML='<br>';
    if(!block.textContent.trim()||block.textContent.trim()==='---')block.replaceWith(rule,paragraph);
    else block.after(rule,paragraph);
    caretAtStart(paragraph);
  }
  persist(true);requestAnimationFrame(numbers);renderOutline();
}
function applyMarkAction(action){
  if(window.qijianEditor?.enabled){if(action==='escapeMark')return window.qijianEditor.insertText('\\');if(action==='clearMark')return window.qijianEditor.clearFormatting();return window.qijianEditor.toggleMark(action)}
  const range=editorRange();
  if(!range)return;
  if(action==='escapeMark'){document.execCommand('insertText',false,'\\');persist(true);return}
  if(action==='clearMark'){
    document.execCommand('removeFormat',false);
    const block=currentBlock();
    if(block&&/^(H[1-6]|BLOCKQUOTE|PRE)$/.test(block.tagName))setBlock('p');
    else persist(true);
    return;
  }
  if(['annotation','comment','codeInline'].includes(action))return insertSemanticMark(action);
  if(range.collapsed){toast('请先选中文字');return}
  const start=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement;
  const end=range.endContainer.nodeType===Node.ELEMENT_NODE?range.endContainer:range.endContainer.parentElement;
  const selector='p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,aside';
  if(start.closest(selector)!==end.closest(selector)){toast('请在同一段内选择文字');return}
  const element=document.createElement(action==='annotation'?'mark':action==='codeInline'?'code':'span');
  if(action==='comment')element.className='editor-comment';
  element.appendChild(range.extractContents());range.insertNode(element);
  const selection=getSelection(),selected=document.createRange();selected.selectNodeContents(element);
  selection.removeAllRanges();selection.addRange(selected);
  persist(true);
}
function runSlash(command){if(!slashBlock?.isConnected)return;const block=slashBlock;$('#slashPanel').classList.add('hidden');slashBlock=null;if(window.qijianEditor?.enabled){window.qijianEditor.deleteTextBefore(1);if(command==='formula')openFormulaEditor(null,'block');else if(command==='hr'||command==='note')insertSpecialBlock(command);else if(command.startsWith('insert'))setOutline(command==='insertOrderedList');else setBlock(command);return}block.textContent=block.textContent.replace(/^\//,'');$('#editor').focus();caretAtStart(block);if(command==='formula')openFormulaEditor(null,'block');else if(command==='hr'||command==='note')insertSpecialBlock(command,block);else if(command.startsWith('insert'))setOutline(command==='insertOrderedList');else setBlock(command)}
function updateSlashHighlight(){[...$('#slashPanel').children].forEach((b,i)=>b.classList.toggle('active',i===slashIndex))}
function showSlashPanel(){const block=currentBlock();const panel=$('#slashPanel');if(!block||block.parentElement?.id!=='editor'||block.textContent!=='/'){panel.classList.add('hidden');slashBlock=null;return}slashBlock=block;slashIndex=0;panel.innerHTML='';slashCommands.forEach(([label,command])=>{const b=document.createElement('button');b.textContent=label;b.onmousedown=e=>e.preventDefault();b.onclick=()=>runSlash(command);panel.appendChild(b)});const r=editorRange()?.getBoundingClientRect()||block.getBoundingClientRect();panel.style.left=`${Math.min(Math.max(8,r.left),innerWidth-190)}px`;panel.style.top=`${Math.min(Math.max(34,r.bottom+6),innerHeight-330)}px`;panel.classList.remove('hidden');updateSlashHighlight()}
const inlineMarkRules=[[/\*\*([^*\n]+)\*\*$/,'strong'],[/\*([^*\n]+)\*$/,'em'],[/~~([^~\n]+)~~$/,'strike'],[/`([^`\n]+)`$/,'code'],[/::([^:\n]+)::$/,'mark'],[/\+\+([^+\n]+)\+\+$/,'comment']];
function insertedSemanticMark(kind){const selection=getSelection();if(!selection?.rangeCount)return null;let node=selection.anchorNode;if(node?.nodeType===Node.ELEMENT_NODE&&selection.anchorOffset>0)node=node.childNodes[selection.anchorOffset-1]||node;else if(node?.nodeType===Node.TEXT_NODE)node=node.parentElement;let found=null;while(node&&node!==$('#editor')){if(semanticMarkKind(node)===kind)found=node;node=node.parentElement}return found}
function replaceRangeWithSemanticMark(range,kind,content,html=false){const editor=$('#editor'),selector={strong:'strong,b',em:'em,i',strike:'s,strike,del',code:'code',mark:'.editor-annotation,[data-qijian-mark="annotation"],mark',comment:'.editor-comment'}[kind],before=new Set(selector?[...editor.querySelectorAll(selector)]:[]),element=semanticMarkElement(kind,content,html),selection=getSelection();editor.focus({preventScroll:true});selection.removeAllRanges();selection.addRange(range);const changed=document.execCommand('insertHTML',false,element.outerHTML);if(!changed)return null;normalizeSemanticInlineStyles(editor);const inserted=(selector?[...editor.querySelectorAll(selector)].find(node=>!before.has(node)):null)||insertedSemanticMark(kind);if(inserted)caretAfter(inserted);return inserted}
function inlineMarkdown(){
 const range=editorRange();if(!range||!range.collapsed||range.startContainer.nodeType!==Node.TEXT_NODE)return false;
 const textNode=range.startContainer,text=textNode.textContent.slice(0,range.startOffset);
 for(const [pattern,kind] of inlineMarkRules){const match=text.match(pattern);if(!match)continue;const start=text.length-match[0].length;if(start>0&&text[start-1]==='\\')return false;
   const replace=document.createRange();replace.setStart(textNode,start);replace.setEnd(textNode,range.startOffset);replaceRangeWithSemanticMark(replace,kind,match[1]);return true
 }return false
}
function insertSemanticMark(kind){
  if(window.qijianEditor?.enabled)return window.qijianEditor.toggleMark(kind);
 const mark={bold:'strong',italic:'em',strikeThrough:'strike',annotation:'mark',comment:'comment',codeInline:'code'}[kind],range=editorRange();
 if(!mark||!range||range.collapsed){toast('请先选中文字');return}
 const start=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement,end=range.endContainer.nodeType===Node.ELEMENT_NODE?range.endContainer:range.endContainer.parentElement,selector='p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,aside';
 if(start.closest(selector)!==end.closest(selector)){toast('请在同一段内选择文字');return}
 const holder=document.createElement('span');holder.append(range.cloneContents());replaceRangeWithSemanticMark(range,mark,holder.innerHTML,true);persist(true)
}
function normalizeExecCommandWhitespaceBlocks(editor=$('#editor')){
 [...editor.querySelectorAll(':scope>[data-qijian-transient-block]')]
  .filter(node=>{
   const boundary=node.hasAttribute('data-qijian-paste-boundary')&&node.childNodes.length===1&&node.firstElementChild?.tagName==='BR';
   return !boundary&&(node.childElementCount||!/^[\r\n\u2028\u2029]+$/.test(node.textContent))
  })
  .forEach(node=>{
   node.removeAttribute('data-qijian-transient-block');
   node.removeAttribute('data-qijian-paste-boundary');
   node.removeAttribute('hidden');
   node.removeAttribute('contenteditable');
   node.removeAttribute('aria-hidden')
  });
 [...editor.children]
  .filter(node=>{
   if(node.tagName!=='P'||node.textContent.trim()||node.querySelector('img,table,.editor-formula'))return false;
   const generatedWhitespace=node.childElementCount===0&&/^[\r\n\u2028\u2029]+$/.test(node.textContent);
   const orphanedBoundary=node.style.position==='absolute'&&parseFloat(node.style.width||'0')===0&&parseFloat(node.style.height||'0')===0&&node.style.overflow==='hidden';
   return generatedWhitespace||orphanedBoundary
  })
  .forEach(node=>{
   node.dataset.qijianTransientBlock='true';
   if(node.style.position==='absolute')node.dataset.qijianPasteBoundary='true';
   node.hidden=true;
   node.contentEditable='false';
   node.setAttribute('aria-hidden','true')
  })
}
function enhancedEditorInput(e){normalizeExecCommandWhitespaceBlocks();if(!e.isComposing){normalizeSemanticInlineStyles($('#editor'));if(normalizeTypedFormula()){persist(true);scheduleEditorRefresh({outline:true,mindmap:true});return}if(normalizeEmptyHeading()){persist(true);scheduleEditorRefresh({outline:true,mindmap:true});return}inlineMarkdown()}let list=currentBlock()?.closest?.('ul,ol');while(list){list.classList.add('outline-list');list=list.parentElement?.closest?.('ul,ol')}showSlashPanel();persist(true);scheduleEditorRefresh({outline:true,mindmap:true});updateWordStats();updateFindStatus()}
function changeOutlineDepth(item,outdent){
  const list=item.parentElement;
  if(!list||!['UL','OL'].includes(list.tagName))return false;
  const selection=getSelection(),range=selection.rangeCount?selection.getRangeAt(0):null;
  const caretNode=range?.startContainer,caretOffset=range?.startOffset;
  if(outdent){
    const parent=list.parentElement;
    if(parent?.tagName!=='LI')return false;
    parent.after(item);
    if(!list.children.length)list.remove();
  }else{
    const previous=item.previousElementSibling;
    if(!previous||previous.tagName!=='LI')return false;
    let nested=[...previous.children].find(child=>child.tagName===list.tagName);
    if(!nested){nested=document.createElement(list.tagName.toLowerCase());nested.className='outline-list';previous.appendChild(nested)}else nested.classList.add('outline-list')
    nested.appendChild(item);
    if(!list.children.length)list.remove();
  }
  if(caretNode&&$('#editor').contains(caretNode)){
    const restored=document.createRange();
    restored.setStart(caretNode,Math.min(caretOffset,caretNode.nodeType===Node.TEXT_NODE?caretNode.length:caretNode.childNodes.length));
    restored.collapse(true);selection.removeAllRanges();selection.addRange(restored);
  }else caretAtStart(item);
  persist(true);requestAnimationFrame(numbers);renderOutline();refreshMindmapWindows();
  return true;
}
function selectedOutlineItems(range){
 const editor=$('#editor');if(range.collapsed){const node=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement;return node.closest('li')?[node.closest('li')]:[]}
 const items=[...editor.querySelectorAll('li')].filter(item=>[...item.childNodes].filter(node=>!(node.nodeType===Node.ELEMENT_NODE&&/^(UL|OL)$/.test(node.tagName))).some(node=>{try{return range.intersectsNode(node)}catch(_){return false}}));
 return items.filter(item=>!items.some(parent=>parent!==item&&parent.contains(item)));
}
function changeSelectedOutlineDepth(range,outdent){
 const items=selectedOutlineItems(range);if(!items.length)return false;if(range.collapsed)return changeOutlineDepth(items[0],outdent);
 const start=range.startContainer,startOffset=range.startOffset,end=range.endContainer,endOffset=range.endOffset,groups=new Map();
 items.forEach(item=>{const list=item.parentElement;if(!groups.has(list))groups.set(list,[]);groups.get(list).push(item)});let changed=false;
 for(const [list,group] of groups){
  if(outdent){const parent=list.parentElement;if(parent.tagName!=='LI')continue;const last=group.at(-1),trailing=[];let sibling=last.nextElementSibling;while(sibling){trailing.push(sibling);sibling=sibling.nextElementSibling}if(trailing.length){let nested=[...last.children].find(child=>child.tagName===list.tagName);if(!nested){nested=document.createElement(list.tagName);nested.className='outline-list';last.appendChild(nested)}nested.append(...trailing)}let anchor=parent;group.forEach(item=>{anchor.after(item);anchor=item});if(!list.children.length)list.remove();changed=true
  }else{const previous=group[0].previousElementSibling;if(!previous||items.includes(previous))continue;let nested=[...previous.children].find(child=>child.tagName===list.tagName);if(!nested){nested=document.createElement(list.tagName);nested.className='outline-list';previous.appendChild(nested)}nested.append(...group);if(!list.children.length)list.remove();changed=true}
 }
 if(changed){const selection=getSelection(),restored=document.createRange();restored.setStart(start,Math.min(startOffset,start.nodeType===Node.TEXT_NODE?start.length:start.childNodes.length));restored.setEnd(end,Math.min(endOffset,end.nodeType===Node.TEXT_NODE?end.length:end.childNodes.length));selection.removeAllRanges();selection.addRange(restored);persist(true);scheduleEditorRefresh({outline:true,mindmap:true})}return changed;
}
function breakOutlineItem(range){
 const node=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement,item=node.closest('li');if(!item)return false;
 const nested=[...item.children].find(child=>/^(UL|OL)$/.test(child.tagName)),own=[...item.childNodes].filter(child=>!(child.nodeType===Node.ELEMENT_NODE&&/^(UL|OL)$/.test(child.tagName)));
 const empty=!own.some(child=>child.textContent.trim()||child.nodeType===Node.ELEMENT_NODE&&(child.tagName==='IMG'||child.querySelector('img,table')));
 if(empty&&!nested){if(item.parentElement.parentElement.tagName==='LI'){changeOutlineDepth(item,true);return true}const list=item.parentElement,paragraph=document.createElement('p');paragraph.innerHTML='<br>';const after=list.cloneNode(false);while(item.nextElementSibling)after.appendChild(item.nextElementSibling);list.after(paragraph);if(after.children.length)paragraph.after(after);item.remove();if(!list.children.length)list.remove();caretAtStart(paragraph)}
 else{const tail=document.createRange();tail.selectNodeContents(item);if(nested)tail.setEndBefore(nested);try{tail.setStart(range.startContainer,range.startOffset)}catch(_){tail.collapse(false)}const next=document.createElement('li');next.appendChild(tail.extractContents());if(!next.textContent&&!next.querySelector('img,br'))next.innerHTML='<br>';item.after(next);caretAtStart(next)}
 if(item.isConnected){const remaining=[...item.childNodes].filter(child=>!(child.nodeType===Node.ELEMENT_NODE&&/^(UL|OL)$/.test(child.tagName))),hasRemaining=remaining.some(child=>child.textContent.trim()||child.nodeType===Node.ELEMENT_NODE&&(child.tagName==='BR'||child.querySelector?.('img,table')));if(!hasRemaining){const br=document.createElement('br');nested&&nested.parentElement===item?item.insertBefore(br,nested):item.prepend(br)}}
 persist(true);scheduleEditorRefresh({outline:true,mindmap:true});return true;
}
function markAtCaretEnd(range){
 if(!range?.collapsed)return null;
 const selector='strong,b,em,i,s,strike,del,code,mark,.editor-annotation,[data-qijian-mark="annotation"],.editor-comment';let mark=null;
 if(range.startContainer.nodeType===Node.TEXT_NODE){if(range.startOffset!==range.startContainer.length)return null;mark=range.startContainer.parentElement?.closest(selector)}
 else if(range.startContainer.nodeType===Node.ELEMENT_NODE){const container=range.startContainer,previous=container.childNodes[range.startOffset-1];if(container.matches?.(selector)&&range.startOffset===container.childNodes.length)mark=container;else if(previous?.nodeType===Node.ELEMENT_NODE&&previous.matches(selector))mark=previous}
 if(!mark)return null;while(mark.parentElement?.matches?.(selector)&&!mark.nextSibling)mark=mark.parentElement;return mark
}
let insertingOutsideSemanticMark=false;
function keepTextOutsideSemanticMark(event){if(insertingOutsideSemanticMark||event.inputType!=='insertText'||!event.data||!event.cancelable)return;const range=editorRange(),mark=markAtCaretEnd(range);if(!mark||!$('#editor').contains(mark))return;event.preventDefault();const outside=document.createRange(),selection=getSelection();outside.setStartAfter(mark);outside.collapse(true);selection.removeAllRanges();selection.addRange(outside);insertingOutsideSemanticMark=true;try{document.execCommand('insertHTML',false,esc(event.data))}finally{insertingOutsideSemanticMark=false}}
function breakAfterMark(range){
 const token=markAtCaretEnd(range);if(!token)return false;
 const block=token.closest('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,aside');if(!block)return false;
 const tail=document.createRange();tail.selectNodeContents(block);tail.setStartAfter(token);const remainder=tail.extractContents();
 const next=document.createElement(block.tagName==='LI'?'li':'p');next.appendChild(remainder);
 if(!next.textContent&&!next.querySelector('img,br'))next.innerHTML='<br>';
 block.after(next);caretAtStart(next);persist(true);requestAnimationFrame(numbers);renderOutline();refreshMindmapWindows();return true
}
function breakHeadingBlock(range,heading){
 const editor=$('#editor'),children=[...editor.children].filter(node=>!node.matches('[data-qijian-transient-block]')),index=children.indexOf(heading);if(index<0)return false;
 const leading=document.createRange(),trailing=document.createRange();leading.selectNodeContents(heading);leading.setEnd(range.startContainer,range.startOffset);trailing.selectNodeContents(heading);trailing.setStart(range.startContainer,range.startOffset);
 const prefix=leading.cloneContents(),suffix=trailing.cloneContents(),probe=document.createElement('div');probe.appendChild(prefix.cloneNode(true));const atStart=!probe.textContent.trim()&&!probe.querySelector('img,table,.editor-formula'),output=document.createElement('div');
 if(atStart){const paragraph=document.createElement('p');paragraph.innerHTML='<br>';const nextHeading=heading.cloneNode(false);nextHeading.appendChild(suffix);output.append(paragraph,nextHeading)}
 else{const firstHeading=heading.cloneNode(false);firstHeading.appendChild(prefix);const paragraph=document.createElement('p');paragraph.appendChild(suffix);clearBlockPresentation(paragraph);if(!paragraph.textContent&&!paragraph.querySelector('img,br,.editor-formula'))paragraph.innerHTML='<br>';output.append(firstHeading,paragraph)}
 const changed=commitPastedEditorBlocks(heading,heading,output.innerHTML);if(!changed)return false;
 const visible=[...editor.children].filter(node=>!node.matches('[data-qijian-transient-block]')),paragraph=visible[index+(atStart?0:1)];if(paragraph?.tagName==='P')caretAtStart(paragraph);persist(true);requestAnimationFrame(numbers);renderOutline();return true
}
function backspaceAtHeadingStart(event,range,heading){
 if(event.key!=='Backspace'||event.ctrlKey||event.metaKey||event.altKey||!range?.collapsed||heading.parentElement?.id!=='editor')return false;
 const before=document.createRange();before.selectNodeContents(heading);try{before.setEnd(range.startContainer,range.startOffset)}catch{return false}
 if(before.toString()||before.cloneContents().querySelector?.('img,table,.editor-formula'))return false;
 const editor=$('#editor'),visible=[...editor.children].filter(node=>!node.matches('[data-qijian-transient-block]')),headingIndex=visible.indexOf(heading);if(headingIndex<0)return false;
 const blank=node=>!!node&&!node.textContent.trim()&&!node.querySelector('img,table,.editor-formula');
 let firstIndex=headingIndex-1;
 if(firstIndex<0){event.preventDefault();return true}
 if(!blank(visible[firstIndex]))return false;
 while(firstIndex>0&&/^H[1-6]$/.test(visible[firstIndex-1].tagName)&&blank(visible[firstIndex-1]))firstIndex--;
 event.preventDefault();event.stopPropagation();const changed=commitPastedEditorBlocks(visible[firstIndex],heading,heading.outerHTML);if(!changed)return true;
 const updated=[...editor.children].filter(node=>!node.matches('[data-qijian-transient-block]')),replacement=updated[firstIndex];if(replacement?.tagName===heading.tagName)caretAtStart(replacement);
 persist(true);scheduleEditorRefresh({outline:true,mindmap:true});return true
}
function mergeBodyLineIntoHeading(event,range){
 if(!['Backspace','Delete'].includes(event.key)||event.ctrlKey||event.metaKey||event.altKey||!range?.collapsed)return false;
 const editor=$('#editor'),node=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement,origin=node.closest('p,h1,h2,h3,h4,h5,h6');if(origin?.parentElement!==editor)return false;
 const visible=[...editor.children].filter(item=>!item.matches('[data-qijian-transient-block]'));let heading,paragraph;
 if(event.key==='Delete'&&/^H[1-6]$/.test(origin.tagName)){
  const after=document.createRange();after.selectNodeContents(origin);try{after.setStart(range.startContainer,range.startOffset)}catch{return false}if(after.toString()||after.cloneContents().querySelector?.('img,table,.editor-formula'))return false;
  const index=visible.indexOf(origin);heading=origin;paragraph=visible[index+1];
 }else if(event.key==='Backspace'&&origin.tagName==='P'){
  const before=document.createRange();before.selectNodeContents(origin);try{before.setEnd(range.startContainer,range.startOffset)}catch{return false}if(before.toString()||before.cloneContents().querySelector?.('img,table,.editor-formula'))return false;
  const index=visible.indexOf(origin);heading=visible[index-1];paragraph=origin;
 }else return false;
 if(!/^H[1-6]$/.test(heading?.tagName||'')||paragraph?.tagName!=='P')return false;
 event.preventDefault();event.stopPropagation();const headingIndex=visible.indexOf(heading),caretOffset=heading.textContent.length,merged=heading.cloneNode(false),body=document.createElement('div');
 merged.append(...[...heading.childNodes].map(child=>child.cloneNode(true)));body.append(...[...paragraph.childNodes].map(child=>child.cloneNode(true)));clearBlockPresentation(body);if(body.textContent.trim()||body.querySelector('img,.editor-formula'))merged.append(...body.childNodes);
 const changed=commitPastedEditorBlocks(heading,paragraph,merged.outerHTML);if(!changed)return true;
 const updated=[...editor.children].filter(item=>!item.matches('[data-qijian-transient-block]')),replacement=updated[headingIndex];if(replacement?.tagName===heading.tagName)caretAtTextOffset(replacement,caretOffset);
 persist(true);scheduleEditorRefresh({outline:true,mindmap:true});return true
}
function enhancedEditorKeys(e){const panel=$('#slashPanel');if(!panel.classList.contains('hidden')){if(['ArrowDown','ArrowRight','ArrowUp','ArrowLeft'].includes(e.key)){e.preventDefault();slashIndex=(slashIndex+(e.key==='ArrowDown'||e.key==='ArrowRight'?1:-1)+slashCommands.length)%slashCommands.length;updateSlashHighlight();panel.children[slashIndex]?.scrollIntoView({block:'nearest'});return}if(e.key==='Enter'){e.preventDefault();runSlash(slashCommands[slashIndex][1]);return}if(e.key==='Escape'){e.preventDefault();panel.classList.add('hidden');slashBlock=null;return}}
  const selectionRange=editorRange();
  if(e.key==='Tab'&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&selectionRange){
    const node=selectionRange.startContainer.nodeType===Node.ELEMENT_NODE?selectionRange.startContainer:selectionRange.startContainer.parentElement;
    if(node.closest('li')){
      e.preventDefault();changeSelectedOutlineDepth(selectionRange,e.shiftKey);return;
    }
  }
  if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&selectionRange?.collapsed){
    if(selectedOutlineItems(selectionRange).length){e.preventDefault();breakOutlineItem(selectionRange);return}
    if(markAtCaretEnd(selectionRange)){e.preventDefault();breakAfterMark(selectionRange);return}
    const node=selectionRange.startContainer.nodeType===Node.ELEMENT_NODE?selectionRange.startContainer:selectionRange.startContainer.parentElement;
    const heading=node.closest('h1,h2,h3,h4,h5,h6');
    if(heading?.parentElement?.id==='editor'){
      e.preventDefault();breakHeadingBlock(selectionRange,heading);return;
    }
  }
  if(!e.isComposing&&selectionRange?.collapsed&&mergeBodyLineIntoHeading(e,selectionRange))return;
  if(e.key==='Backspace'&&!e.isComposing&&selectionRange?.collapsed){
    const node=selectionRange.startContainer.nodeType===Node.ELEMENT_NODE?selectionRange.startContainer:selectionRange.startContainer.parentElement;
    const heading=node.closest('h1,h2,h3,h4,h5,h6');
    if(heading&&backspaceAtHeadingStart(e,selectionRange,heading))return;
  }
  const block=currentBlock(),range=editorRange();if(!block||!range||!range.collapsed||block.parentElement?.id!=='editor')return;
  if(e.key==='Enter'&&block.textContent.trim()==='---'){e.preventDefault();insertSpecialBlock('hr',block);return}
  if(e.key!==' ')return;
  const before=document.createRange();before.selectNodeContents(block);before.setEnd(range.startContainer,range.startOffset);const marker=before.toString();const map={'#':'h1','##':'h2','###':'h3','####':'h4','#####':'h5','######':'h6','>':'blockquote','-':'insertUnorderedList','*':'insertUnorderedList','1.':'insertOrderedList','%%':'note','``':'pre'};const command=map[marker];if(!command)return;e.preventDefault();block.textContent=block.textContent.slice(marker.length);caretAtStart(block);if(command==='note')insertSpecialBlock('note',block);else if(command.startsWith('insert'))setOutline(command==='insertOrderedList');else setBlock(command)
}
function editorTextMap(){const nodes=[],walker=document.createTreeWalker($('#editor'),NodeFilter.SHOW_TEXT);let text='',node;while(node=walker.nextNode()){nodes.push({node,start:text.length,end:text.length+node.length});text+=node.textContent}return {nodes,text}}
function occurrences(text,term){if(!term)return [];const hay=text.toLocaleLowerCase(),needle=term.toLocaleLowerCase(),found=[];let pos=0;while((pos=hay.indexOf(needle,pos))!==-1){found.push(pos);pos+=Math.max(1,needle.length)}return found}
function rangeAt(map,start,length){const range=document.createRange();const first=map.nodes.find(x=>x.end>start)||map.nodes.at(-1);const last=map.nodes.find(x=>x.end>=start+length)||map.nodes.at(-1);if(!first||!last)return null;range.setStart(first.node,Math.max(0,start-first.start));range.setEnd(last.node,Math.min(last.node.length,start+length-last.start));return range}
function selectionOffset(map){const selection=getSelection();if(!selection?.rangeCount||!$('#editor').contains(selection.anchorNode))return 0;const probe=document.createRange();probe.selectNodeContents($('#editor'));try{probe.setEnd(selection.focusNode,selection.focusOffset);return probe.toString().length}catch(_){return 0}}
function findPositions(){const map=editorTextMap(),term=$('#findText').value;return {map,term,positions:occurrences(map.text,term)}}
function updateFindStatus(){if($('#findPanel').classList.contains('hidden'))return;const positions=window.qijianEditor?.enabled?window.qijianEditor.textMatches($('#findText').value):findPositions().positions;$('#findStatus').textContent=positions.length?`${positions.length} 处匹配`:'没有匹配内容'}
function findNext(back=false){if(window.qijianEditor?.enabled){const positions=window.qijianEditor.textMatches($('#findText').value);if(!positions.length)return;const selection=window.qijianEditor.getSelection();let index;if(back)index=positions.findLastIndex(match=>match.to<selection.from||(selection.empty&&match.from<selection.from));else index=positions.findIndex(match=>match.from>selection.from||selection.empty&&match.from>=selection.from);if(index<0)index=back?positions.length-1:0;window.qijianEditor.selectMatch(positions[index]);$('#findStatus').textContent=`${index+1} / ${positions.length}`;return}const {map,term,positions}=findPositions();if(!positions.length)return;const selection=getSelection(),selected=selection?.toString()||'',offset=selectionOffset(map);let target;if(back)target=[...positions].reverse().find(x=>x<offset-(selected?0:1))??positions.at(-1);else target=positions.find(x=>x>=offset+(selected?0:0))??positions[0];const range=rangeAt(map,target,term.length);if(!range)return;selection.removeAllRanges();selection.addRange(range);range.startContainer.parentElement?.scrollIntoView({block:'center'});$('#findStatus').textContent=`${positions.indexOf(target)+1} / ${positions.length}`}
function replaceCurrent(){const term=$('#findText').value;if(!term)return;if(window.qijianEditor?.enabled){window.qijianEditor.replaceCurrent(term,$('#replaceText').value);findNext();updateFindStatus();return}const selection=getSelection(),range=editorRange();if(range&&!range.collapsed&&selection.toString().toLocaleLowerCase()===term.toLocaleLowerCase()){range.deleteContents();const replacement=document.createTextNode($('#replaceText').value);range.insertNode(replacement);caretAfter(replacement);persist(true);requestAnimationFrame(numbers);renderOutline()}findNext();updateFindStatus()}
function replaceAll(){if(window.qijianEditor?.enabled){const count=window.qijianEditor.replaceAll($('#findText').value,$('#replaceText').value);updateFindStatus();if(count)toast(`已替换 ${count} 处`);return}const {term,positions}=findPositions();if(!term||!positions.length)return;const replacement=$('#replaceText').value;for(const start of [...positions].reverse()){const range=rangeAt(editorTextMap(),start,term.length);if(!range)continue;range.deleteContents();range.insertNode(document.createTextNode(replacement))}persist(true);requestAnimationFrame(numbers);renderOutline();updateFindStatus();toast(`已替换 ${positions.length} 处`)}
function openFind(replace=false){$('#findPanel').classList.remove('hidden');$('#findText').focus();if(replace)$('#replaceText').focus();updateFindStatus()}
function ownListTextNodes(item){const nodes=[],walker=document.createTreeWalker(item,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode())if(node.parentElement?.closest('ul,ol')===item.parentElement)nodes.push(node);return nodes}
function rangeCoversOwnListText(range,item){const nodes=ownListTextNodes(item);if(!nodes.length)return false;const whole=document.createRange();whole.setStart(nodes[0],0);whole.setEnd(nodes.at(-1),nodes.at(-1).length);return range.compareBoundaryPoints(Range.START_TO_START,whole)<=0&&range.compareBoundaryPoints(Range.END_TO_END,whole)>=0}
function copyOutlineAsMarkdown(e){
 if(e.defaultPrevented)return false;
 const range=editorRange();if(!range||range.collapsed)return false;
 const items=[...$('#editor').querySelectorAll('li')].filter(item=>[...item.childNodes].filter(node=>!(node.nodeType===Node.ELEMENT_NODE&&['UL','OL'].includes(node.tagName))).some(node=>{try{return range.intersectsNode(node)}catch(_){return false}}));
 if(!items.length||items.some(item=>!rangeCoversOwnListText(range,item)))return false;
 const lineFor=(item,markdown=false)=>{let depth=0,parent=item.parentElement;while(parent&&parent!==$('#editor')){if(['UL','OL'].includes(parent.tagName))depth++;parent=parent.parentElement}const ordered=item.parentElement?.tagName==='OL',siblings=ordered?[...item.parentElement.children].filter(child=>child.tagName==='LI'):[],marker=ordered?(siblings.indexOf(item)+1)+'.':'-';const ownNodes=[...item.childNodes].filter(node=>!(node.nodeType===Node.ELEMENT_NODE&&['UL','OL'].includes(node.tagName))),own=markdown?ownNodes.map(markdownInline).join('').trim():ownNodes.map(node=>node.textContent||'').join('').trim();return '\t'.repeat(Math.max(0,depth-1))+marker+' '+own};
 const plainLines=items.map(item=>lineFor(item)),markdownLines=items.map(item=>lineFor(item,true));
 const holder=document.createElement('div');holder.innerHTML=plainOutlineHtml(plainLines.join('\n'));const targets=[...holder.querySelectorAll('li')];if(targets.length!==items.length)return false;targets.forEach((target,index)=>{const nested=[...target.children].filter(child=>/^(UL|OL)$/.test(child.tagName));ownListItemNodes(target).forEach(node=>node.remove());target.prepend(...ownListItemNodes(items[index]).map(node=>node.cloneNode(true)));nested.forEach(list=>target.appendChild(list))});cleanClipboardImages(holder);holder.querySelectorAll('.outline-control-hover,.outline-collapsed').forEach(item=>item.classList.remove('outline-control-hover','outline-collapsed'));
 e.preventDefault();e.clipboardData.setData('text/plain',plainLines.join('\n'));e.clipboardData.setData('text/markdown',markdownLines.join('\n'));e.clipboardData.setData('text/html',holder.innerHTML);
 return true;
}
function wrapClipboardInlineContext(holder,range){
 const inline='strong,b,em,i,u,s,strike,del,a,code,mark,ins,.editor-annotation,[data-qijian-mark="annotation"],.editor-comment';let node=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement;while(node&&node!==$('#editor')&&node.matches?.(inline)&&node.contains(range.endContainer)){const wrapper=node.cloneNode(false);wrapper.append(...holder.childNodes);holder.appendChild(wrapper);node=node.parentElement}
}
function editorTopLevelBlock(container,offset=0,end=false){const editor=$('#editor');let node;if(container===editor){const nodes=[...editor.childNodes];let index=Math.max(0,end?offset-1:offset);node=nodes[index];while(node?.nodeType===Node.ELEMENT_NODE&&node.matches('[data-qijian-transient-block]')){index+=end?-1:1;node=nodes[index]}}else node=container?.nodeType===Node.ELEMENT_NODE?container:container?.parentElement;if(!node||node===editor)return null;while(node.parentElement&&node.parentElement!==editor)node=node.parentElement;return node.parentElement===editor?node:null}
function rangeCoversBlockText(range,block){const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT),nodes=[];let node;while(node=walker.nextNode())if(node.textContent.length)nodes.push(node);if(!nodes.length)return false;const whole=document.createRange();whole.setStart(nodes[0],0);whole.setEnd(nodes.at(-1),nodes.at(-1).length);return range.compareBoundaryPoints(Range.START_TO_START,whole)<=0&&range.compareBoundaryPoints(Range.END_TO_END,whole)>=0}
function copyEditorTextContent(e){
 if(e.defaultPrevented)return false;const range=editorRange();if(!range||range.collapsed)return false;const holder=document.createElement('div');holder.appendChild(range.cloneContents());wrapClipboardInlineContext(holder,range);const first=editorTopLevelBlock(range.startContainer,range.startOffset),last=editorTopLevelBlock(range.endContainer,range.endOffset,true),wholeHeading=first&&first===last&&/^H[1-6]$/.test(first.tagName)&&rangeCoversBlockText(range,first);if(wholeHeading&&!holder.querySelector(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6')){const heading=first.cloneNode(false);heading.removeAttribute('id');heading.append(...holder.childNodes);holder.appendChild(heading)}if(first&&last&&(first!==last||wholeHeading))holder.firstElementChild?.setAttribute('data-qijian-clipboard-blocks','true');normalizeLegacyMarkTokens(holder);cleanClipboardImages(holder);holder.querySelectorAll('.outline-control-hover,.outline-collapsed').forEach(item=>item.classList.remove('outline-control-hover','outline-collapsed'));e.preventDefault();e.clipboardData.setData('text/plain',range.toString());e.clipboardData.setData('text/html',holder.innerHTML);return true
}
function cleanClipboardImages(holder){
 holder.querySelectorAll('[data-qijian-transient-block]').forEach(node=>node.remove());
 holder.querySelectorAll('.image-resize-handle,.image-drag-grip').forEach(node=>node.remove());
 holder.querySelectorAll('figure.editor-image').forEach(figure=>{const original=figure.querySelector('img');if(!original){figure.remove();return}const image=original.cloneNode(true);image.removeAttribute('draggable');figure.replaceWith(image)});
 holder.querySelectorAll('.image-row').forEach(row=>row.replaceWith(...row.childNodes));
}
function copyEditorImageContent(e){
 const editor=$('#editor'),range=editorRange(),focused=document.activeElement?.closest?.('figure.editor-image'),selected=focused?.classList.contains('image-selected')?focused:editor.querySelector('figure.image-selected');
 if(focused?.classList.contains('image-selected')){e.preventDefault();window.qijian.copyImage(focused.querySelector('img')?.src).catch(error=>toast(error?.message||'复制图片失败'));return true}
 if(!range||range.collapsed)return false;
 const figures=[...editor.querySelectorAll('figure.editor-image')].filter(figure=>{try{return range.intersectsNode(figure)}catch(_){return false}});if(!figures.length)return false;
 const holder=document.createElement('div');holder.appendChild(range.cloneContents());cleanClipboardImages(holder);
 const images=[...holder.querySelectorAll('img')],plain=holder.querySelector('li')?serializeMarkdown(holder.innerHTML).replace(/^( +)(?=\S)/gm,spaces=>'\t'.repeat(Math.floor(spaces.length/2))):holder.textContent.replace(/\s+/g,' ').trim();e.preventDefault();
 if(images.length===1&&!plain)window.qijian.copyImage(images[0].src).catch(error=>toast(error?.message||'复制图片失败'));
 else{e.clipboardData.setData('text/html',holder.innerHTML);e.clipboardData.setData('text/plain',plain)}
 return true;
}
function cutEditorImageContent(e){
 const editor=$('#editor'),focused=document.activeElement?.closest?.('figure.editor-image'),range=editorRange();
 if(focused?.classList.contains('image-selected')){copyEditorImageContent(e);removeEditorImageFigure(focused);return true}
 if(!range||range.collapsed)return false;
 const hasImage=[...editor.querySelectorAll('figure.editor-image')].some(figure=>{try{return range.intersectsNode(figure)}catch(_){return false}});if(!hasImage)return false;
 if(!copyEditorImageContent(e))return false;commitEditorHtml(range,'');persist(true);scheduleEditorRefresh({outline:true,mindmap:true});return true;
}
function copyEditorFormulaContent(e){const formula=document.activeElement?.closest?.('.editor-formula');if(!formula||!$('#editor').contains(formula))return false;const latex=formula.dataset.latex||'',block=formula.classList.contains('formula-block'),markdown=block?`$$\n${latex}\n$$`:`$${latex}$`;e.preventDefault();e.clipboardData?.setData('text/plain',markdown);e.clipboardData?.setData('text/markdown',markdown);e.clipboardData?.setData('text/html',formula.outerHTML);return true}
function cutEditorFormulaContent(e){const formula=document.activeElement?.closest?.('.editor-formula');if(!formula||!$('#editor').contains(formula))return false;copyEditorFormulaContent(e);removeEditorFormula(formula);return true}
function copyEditorTableContent(e){const block=document.activeElement?.closest?.('.table-block');if(!block||!$('#editor').contains(block))return false;const table=block.querySelector('table');if(!table)return false;const rows=[...table.rows].map(row=>[...row.cells].map(cell=>cell.textContent));const plain=rows.map(row=>row.join('\t')).join('\n'),markdown=rows.map(row=>'| '+row.map(value=>String(value).replace(/\|/g,'\\|')).join(' | ')+' |');if(rows.length)markdown.splice(1,0,'| '+rows[0].map(()=>'---').join(' | ')+' |');const clean=table.cloneNode(true);clean.removeAttribute('style');clean.querySelectorAll('[style]').forEach(node=>node.removeAttribute('style'));e.preventDefault();e.clipboardData?.setData('text/plain',plain);e.clipboardData?.setData('text/markdown',markdown.join('\n'));e.clipboardData?.setData('text/html',clean.outerHTML);return true}
function cutEditorTableContent(e){const block=document.activeElement?.closest?.('.table-block');if(!block||!$('#editor').contains(block))return false;if(!copyEditorTableContent(e))return false;removeEditorTableBlock(block);return true}
function clipboardFileAsDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error||new Error('无法读取剪贴板图片'));reader.readAsDataURL(file)})}
async function pasteClipboardImages(items,savedRange){
 try{
  const images=[];
  for(const item of items){const file=item.getAsFile?.();if(!file)continue;const dataUrl=await clipboardFileAsDataUrl(file);images.push(await window.qijian.addAttachmentData(dataUrl,file.name||'clipboard-image',currentImageDocumentId()))}
  if(!images.length)return;
  $('#editor').focus();
  if(savedRange&&$('#editor').contains(savedRange.commonAncestorContainer)){const selection=getSelection();selection.removeAllRanges();selection.addRange(savedRange)}
  let block=currentBlock(),listItem=block?.closest?.('li');
  if(listItem){
   const clone=listItem.cloneNode(true),nested=[...clone.children].find(child=>/^(UL|OL)$/.test(child.tagName)),own=[...clone.childNodes].filter(node=>node!==nested&&!(node.nodeType===Node.ELEMENT_NODE&&/^(UL|OL)$/.test(node.tagName)));
   const hasOwnContent=own.some(node=>(node.nodeType===Node.TEXT_NODE&&node.textContent.trim())||(node.nodeType===Node.ELEMENT_NODE&&!['BR'].includes(node.tagName)&&node.textContent.trim())||(node.nodeType===Node.ELEMENT_NODE&&node.querySelector?.('img,table')));
   if(!hasOwnContent)own.forEach(node=>node.remove());
   const row=document.createElement('div');row.className='image-row';images.forEach(image=>row.appendChild(makeEditorImageFigure(image)));nested?clone.insertBefore(row,nested):clone.appendChild(row);
   replaceEditorNode(listItem,clone.outerHTML);
  }else for(const image of images){placeEditorImage(makeEditorImageFigure(image),block);block=currentBlock()}
  normalizeEditorImages();persist(true);requestAnimationFrame(numbers);
 }catch(error){toast(error?.message||'粘贴图片失败')}
}
function plainOutlineHtml(text){
 const source=String(text||'').replace(/\r\n?/g,'\n'),lines=source.split('\n'),parsed=lines.map(line=>{const match=line.match(/^([ \t]*)([-*+] |\d+[.)] )(.+)$/);return match?{indent:match[1],ordered:/\d/.test(match[2]),text:match[3]}:null});if(!parsed.some(Boolean)||parsed.some(item=>item?.text.includes('\t')))return '';
 const columns=parsed.filter(Boolean).map(item=>[...item.indent].reduce((total,char)=>char==='\t'?total+2:total+1,0)),positive=columns.filter(Boolean),unit=positive.length?Math.min(...positive):2,holder=document.createElement('div');let stack=[];
 parsed.forEach((item,index)=>{if(!item){stack=[];if(lines[index].trim()){const paragraph=document.createElement('p');paragraph.innerHTML=parseInlineMarkdown(lines[index]);holder.appendChild(paragraph)}return}let depth=Math.round([...item.indent].reduce((total,char)=>char==='\t'?total+2:total+1,0)/Math.max(1,unit));depth=Math.min(depth,stack.length);const tag=item.ordered?'ol':'ul';let list=stack[depth];if(!list||list.tagName.toLowerCase()!==tag){list=document.createElement(tag);list.className='outline-list';if(depth===0)holder.appendChild(list);else{const parent=stack[depth-1]?.lastElementChild;if(!parent){depth=0;holder.appendChild(list)}else parent.appendChild(list)}stack[depth]=list}stack.length=depth+1;const li=document.createElement('li');li.innerHTML=parseInlineMarkdown(item.text);list.appendChild(li)});
 return holder.innerHTML;
}
function sanitizePastedHtml(holder){
 const walker=document.createTreeWalker(holder,NodeFilter.SHOW_COMMENT),comments=[];while(walker.nextNode())comments.push(walker.currentNode);comments.forEach(node=>node.remove());
 holder.querySelectorAll('script,style,meta,link').forEach(node=>node.remove());
 holder.querySelectorAll('font').forEach(node=>node.replaceWith(...node.childNodes));
 holder.querySelectorAll('[face],[size]').forEach(node=>{node.removeAttribute('face');node.removeAttribute('size')});
 holder.querySelectorAll('[style]').forEach(node=>{
  for(const property of ['font-family','font-size','line-height','letter-spacing'])node.style.removeProperty(property);
  if(!node.getAttribute('style')?.trim())node.removeAttribute('style');
 });
 normalizeLegacyMarkTokens(holder);
 return holder;
}
function ownListItemNodes(item){return [...item.childNodes].filter(node=>!(node.nodeType===Node.ELEMENT_NODE&&/^(UL|OL)$/.test(node.tagName)))}
function mergePlainOutlineWithRichHtml(plainHtml,richHtml){
 const structure=document.createElement('div'),rich=document.createElement('div');structure.innerHTML=plainHtml;rich.innerHTML=richHtml;sanitizePastedHtml(rich);
 const structureItems=[...structure.querySelectorAll('li')],richItems=[...rich.querySelectorAll('li')];
 if(structureItems.length===richItems.length)structureItems.forEach((target,index)=>{
  const nested=[...target.children].filter(child=>/^(UL|OL)$/.test(child.tagName));
  ownListItemNodes(target).forEach(node=>node.remove());
  const content=ownListItemNodes(richItems[index]).map(node=>node.cloneNode(true));
  target.prepend(...(content.length?content:[document.createTextNode(richItems[index].textContent||'')]));
  nested.forEach(list=>target.appendChild(list));
 });
 const structureLists=[...structure.children].filter(node=>/^(UL|OL)$/.test(node.tagName)),richLists=[...rich.children].filter(node=>/^(UL|OL)$/.test(node.tagName));
 if(structureItems.length===richItems.length&&structureLists.length===richLists.length){
  richLists.forEach((list,index)=>list.replaceWith(structureLists[index].cloneNode(true)));
  return rich.innerHTML;
 }
 const structureBlocks=[...structure.children].filter(node=>!/^(UL|OL)$/.test(node.tagName)),richBlocks=[...rich.children].filter(node=>!/^(UL|OL)$/.test(node.tagName));
 if(structureBlocks.length===richBlocks.length)structureBlocks.forEach((block,index)=>block.replaceWith(richBlocks[index].cloneNode(true)));
 return structure.innerHTML;
}
function cleanOutlineStructure(holder){
 for(const item of [...holder.querySelectorAll('li')].reverse()){
  const nested=[...item.children].filter(child=>/^(UL|OL)$/.test(child.tagName));
  const own=[...item.childNodes].filter(child=>!(child.nodeType===Node.ELEMENT_NODE&&/^(UL|OL)$/.test(child.tagName)));
  const meaningful=own.some(child=>child.textContent.trim()||child.nodeType===Node.ELEMENT_NODE&&(child.tagName==='IMG'||child.querySelector('img,table')));
  if(!meaningful&&nested.length&&nested.every(list=>list.tagName===item.parentElement.tagName))item.replaceWith(...nested.flatMap(list=>[...list.children]));
 }
 for(const list of [...holder.children].filter(child=>/^(UL|OL)$/.test(child.tagName))){let next=list.nextElementSibling;while(next?.tagName===list.tagName){list.append(...next.childNodes);next.remove();next=list.nextElementSibling}if(!list.querySelector('li'))list.remove()}
}
function pastedTableHtml(text){
 const source=String(text||'').replace(/\r\n?/g,'\n'),lines=source.split('\n'),nonblank=lines.filter(line=>line.trim());
 const tabRows=nonblank.map(line=>line.split('\t'));
 if(tabRows.length&&tabRows.some(row=>row.length>1)&&tabRows.every(row=>row.length===tabRows[0].length))return makeTableBlock(tabRows).outerHTML;
 const splitRow=line=>{let value=line.trim();if(value.startsWith('|'))value=value.slice(1);if(value.endsWith('|'))value=value.slice(0,-1);return value.split(/(?<!\\)\|/).map(cell=>cell.replace(/\\\|/g,'|').trim())};
 const separator=line=>{const cells=splitRow(line);return cells.length>1&&cells.every(cell=>/^:?-{3,}:?$/.test(cell))};
 const output=[];let prose=[];const flush=()=>{if(prose.length){output.push(parseMarkdown(prose.join('\n')));prose=[]}};
 for(let index=0;index<lines.length;){
  if(index+1<lines.length&&lines[index].includes('|')&&separator(lines[index+1])){
   flush();const rows=[splitRow(lines[index])];index+=2;
   while(index<lines.length&&lines[index].includes('|')&&lines[index].trim()){rows.push(splitRow(lines[index]));index++}
   const columns=Math.max(...rows.map(row=>row.length));output.push(makeTableBlock(rows.map(row=>[...row,...Array(columns-row.length).fill('')])).outerHTML);continue
  }
  prose.push(lines[index]);index++
 }
 flush();return output.some(part=>/class="table-block"/.test(part))?output.join(''):''
}
function editorOffsetAt(container,offset){const probe=document.createRange();probe.selectNodeContents($('#editor'));try{probe.setEnd(container,offset);return probe.toString().length}catch(_){return 0}}
function semanticPasteSegments(holder){return [...holder.querySelectorAll('.editor-comment,code')].map(node=>{const before=document.createRange();before.selectNodeContents(holder);before.setEndBefore(node);return {start:before.toString().length,length:node.textContent.length,kind:semanticMarkKind(node),html:node.innerHTML}}).filter(segment=>segment.kind==='comment'||segment.kind==='code').sort((a,b)=>a.length-b.length||b.start-a.start)}
function restoreSemanticPasteSegments(start,segments){for(const segment of segments){const target=rangeAt(editorTextMap(),start+segment.start,segment.length);if(!target)continue;target.deleteContents();target.insertNode(semanticMarkElement(segment.kind,segment.html,true))}}
function inlineClipboardHtml(holder,plainText){
 const clone=holder.cloneNode(true);clone.querySelectorAll('br').forEach(node=>node.remove());
 [...clone.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,blockquote,pre,aside')].reverse().forEach(node=>node.replaceWith(...node.childNodes));
 const richText=clone.textContent.replace(/\u00a0/g,' '),plain=String(plainText).replace(/\u00a0/g,' ');
 if(richText===plain)return clone.innerHTML;
 if(richText.trim()===plain){const texts=[],walker=document.createTreeWalker(clone,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode())texts.push(node);while(texts.length&&/^\s*$/.test(texts[0].textContent)){texts.shift().remove()}while(texts.length&&/^\s*$/.test(texts.at(-1).textContent)){texts.pop().remove()}if(texts.length){texts[0].textContent=texts[0].textContent.replace(/^\s+/,'');texts.at(-1).textContent=texts.at(-1).textContent.replace(/\s+$/,'')}if(clone.textContent.replace(/\u00a0/g,' ')===plain)return clone.innerHTML}
 return esc(plainText)
}
function clipboardInlineText(text){return String(text||'').replace(/\r\n?/g,'\n').replace(/^[\n\u2028\u2029]+|[\n\u2028\u2029]+$/g,'')}
function nativeListMarkCommand(holder){const nodes=[...holder.childNodes].filter(node=>node.nodeType===Node.ELEMENT_NODE||node.nodeType===Node.TEXT_NODE&&node.textContent);if(nodes.length!==1||nodes[0].nodeType!==Node.ELEMENT_NODE)return'';return {strong:'bold',b:'bold',em:'italic',i:'italic',s:'strikeThrough',strike:'strikeThrough',del:'strikeThrough'}[nodes[0].tagName.toLowerCase()]||''}
function commitNativeListMark(range,holder,command){const selection=getSelection();$('#editor').focus({preventScroll:true});selection.removeAllRanges();selection.addRange(range);document.execCommand(command,false);const changed=document.execCommand('insertText',false,holder.textContent);document.execCommand(command,false);return changed}
function commitPlainInlineListPaste(range,text){const selection=getSelection();$('#editor').focus({preventScroll:true});selection.removeAllRanges();selection.addRange(range);return document.execCommand('insertText',false,text)}
function commitInlineHtml(range,html,plainText=''){
 const holder=document.createElement('div');holder.innerHTML=html;normalizeLegacyMarkTokens(holder);const hasRichFormat=!!holder.querySelector('strong,b,em,i,u,s,strike,del,a,code,mark,ins,.editor-annotation,[data-qijian-mark="annotation"],.editor-comment,.editor-formula'),segments=semanticPasteSegments(holder),start=editorOffsetAt(range.startContainer,range.startOffset),insertedLength=holder.textContent.length,startNode=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement,endNode=range.endContainer.nodeType===Node.ELEMENT_NODE?range.endContainer:range.endContainer.parentElement,startItem=startNode?.closest?.('li'),inlineListPaste=!!startItem&&startItem===endNode?.closest?.('li'),nativeCommand=inlineListPaste&&range.collapsed?nativeListMarkCommand(holder):'';if(nativeCommand)return commitNativeListMark(range,holder,nativeCommand);if(hasRichFormat&&inlineListPaste)return commitPlainInlineListPaste(range,plainText||holder.textContent);const selection=getSelection();$('#editor').focus({preventScroll:true});selection.removeAllRanges();selection.addRange(range);const changed=document.execCommand(hasRichFormat?'insertHTML':'insertText',false,hasRichFormat?holder.innerHTML:plainText||holder.textContent);if(changed){restoreSemanticPasteSegments(start,segments);normalizeLegacyMarkTokens($('#editor'));const inserted=rangeAt(editorTextMap(),start,insertedLength);if(inserted){selection.removeAllRanges();inserted.collapse(false);selection.addRange(inserted)}}if(selection.rangeCount)selection.collapseToEnd();return changed
}
function pasteWithOwnFormatting(range,holder,plainText='',forceBlocks=false){
 const editor=$('#editor'),topBlock=(container,offset,end=false)=>{if(container===editor)return container.childNodes[Math.max(0,end?offset-1:offset)];let node=container.nodeType===Node.ELEMENT_NODE?container:container.parentElement;while(node?.parentElement&&node.parentElement!==editor)node=node.parentElement;return node},editingBlock=container=>{const node=container.nodeType===Node.ELEMENT_NODE?container:container.parentElement;return node?.closest?.('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,aside')};
 if(range.startContainer===editor&&range.endContainer===editor)return commitEditorHtml(range,holder.innerHTML);
 const first=topBlock(range.startContainer,range.startOffset),last=topBlock(range.endContainer,range.endOffset,true);if(!first||!last)return commitEditorHtml(range,holder.innerHTML);
 const structural=holder.querySelector('table,.table-block,.image-row,ul,ol,h1,h2,h3,h4,h5,h6,blockquote,pre,aside,.formula-block');
 const startEditingBlock=editingBlock(range.startContainer),endEditingBlock=editingBlock(range.endContainer),inlineDestination=!!startEditingBlock&&startEditingBlock===endEditingBlock;
 const semanticStructure=holder.querySelector('table,.table-block,.image-row,img,figure,ul,ol,.formula-block'),inlineText=clipboardInlineText(plainText);
 const meaningful=[...holder.childNodes].filter(node=>node.nodeType===Node.ELEMENT_NODE||node.nodeType===Node.TEXT_NODE&&node.textContent.trim()),singleHeading=meaningful.length===1&&meaningful[0].nodeType===Node.ELEMENT_NODE&&/^H[1-6]$/.test(meaningful[0].tagName)?meaningful[0]:null;
 if(inlineDestination&&/^H[1-6]$/.test(startEditingBlock.tagName)&&singleHeading)return commitInlineHtml(range,singleHeading.innerHTML,inlineText||singleHeading.textContent);
 if(inlineDestination&&!forceBlocks&&!structural&&!semanticStructure&&inlineText&&!/[\n\u2028\u2029]/.test(inlineText))return commitInlineHtml(range,inlineClipboardHtml(holder,inlineText),inlineText);
 if(inlineDestination&&!forceBlocks&&!structural){
  let source=holder;
  while(true){const meaningful=[...source.childNodes].filter(node=>node.nodeType===Node.ELEMENT_NODE||node.nodeType===Node.TEXT_NODE&&node.textContent.trim());if(meaningful.length!==1||meaningful[0].nodeType!==Node.ELEMENT_NODE)break;const child=meaningful[0];if(child.tagName==='P')return commitInlineHtml(range,child.innerHTML,clipboardInlineText(plainText)||child.textContent);if(child.tagName!=='DIV')break;source=child}
  if(!source.textContent.includes('\n')&&!source.querySelector('p,div'))return commitInlineHtml(range,source.innerHTML,clipboardInlineText(plainText)||source.textContent)
 }
 const before=document.createRange();before.selectNodeContents(first);before.setEnd(range.startContainer,range.startOffset);const after=document.createRange();after.selectNodeContents(last);after.setStart(range.endContainer,range.endOffset);
 const prefix=before.cloneContents(),suffix=after.cloneContents(),source=[...holder.children],output=document.createElement('div');
 if(first===last&&source.length===1&&source[0].tagName==='P'&&/^(P|H[1-6]|BLOCKQUOTE|PRE|ASIDE)$/.test(first.tagName)){
  const paragraph=source[0].cloneNode(false);paragraph.append(prefix,...source[0].childNodes,suffix);output.appendChild(paragraph);
 }else{
  const appendPart=(original,part)=>{if(!part.textContent.trim()&&!part.querySelector('img,table'))return;const block=original.cloneNode(false);block.appendChild(part);output.appendChild(block)};
  appendPart(first,prefix);output.append(...holder.childNodes);appendPart(last,suffix);
 }
 cleanOutlineStructure(output);return commitPastedEditorBlocks(first,last,output.innerHTML);
}
function formulaTextFromClipboard(html,plain=''){
 if(!html)return plain;const holder=document.createElement('div');holder.innerHTML=html;
 const read=node=>{if(node.nodeType===Node.TEXT_NODE)return node.textContent;if(node.nodeType!==Node.ELEMENT_NODE)return'';const tag=node.tagName.toLowerCase(),value=[...node.childNodes].map(read).join('');if(tag==='br')return'\n';if(tag==='em'||tag==='i')return`*${value}*`;if(tag==='strong'||tag==='b')return`**${value}**`;if(tag==='s'||tag==='del'||tag==='strike')return`~~${value}~~`;if(tag==='code')return`\`${value}\``;return value+(/^(p|div|li|tr)$/.test(tag)?'\n':'')};
 const restored=[...holder.childNodes].map(read).join('').replace(/\n{3,}/g,'\n\n').trim();return /\\[A-Za-z]+|\$\$|\\\[/.test(restored)?restored:plain
}
function pasteEditorContent(e){
 const plainOnly=pastePlainOnce;pastePlainOnce=false;
 const imageItems=[...(e.clipboardData?.items||[])].filter(item=>String(item.type||'').startsWith('image/'));
 const html=plainOnly?'':e.clipboardData?.getData('text/html')||'';
 if(imageItems.length&&!html){const saved=editorRange()?.cloneRange();e.preventDefault();pasteClipboardImages(imageItems,saved);return}
 let plainText=e.clipboardData?.getData('text/plain')||'';const restoredFormulaText=formulaTextFromClipboard(html,plainText),hasHtmlOutline=/<(?:ul|ol)(?:\s|>)/i.test(html)&&/<li(?:\s|>)/i.test(html),plainOutline=plainOutlineHtml(plainText),plainHasDepth=/(?:^|\n)(?:\t| {2,})(?:[-*+] |\d+[.)] )/.test(plainText),usePlain=!!plainOutline&&(!hasHtmlOutline||plainHasDepth),plainTable=plainOutline||hasHtmlOutline?'':pastedTableHtml(plainText),plainHasFormula=/(?:^|\n)\s*(?:\$\$|\\\[|\[\s*\\[A-Za-z])|\\\(.+?\\\)|(?<!\\)\$[^$\n]+(?<!\\)\$/.test(restoredFormulaText);if(plainHasFormula)plainText=restoredFormulaText;if(!html&&!plainText)return;
 const holder=document.createElement('div');holder.innerHTML=plainTable||(plainHasFormula?parseMarkdown(plainText):((usePlain&&html)?mergePlainOutlineWithRichHtml(plainOutline,html):(usePlain?plainOutline:(html||plainText.split(/\r?\n/).map(line=>'<p>'+ (esc(line)||'<br>')+'</p>').join('')))));const forceBlocks=!!holder.querySelector('[data-qijian-clipboard-blocks="true"]');holder.querySelectorAll('[data-qijian-clipboard-blocks]').forEach(node=>node.removeAttribute('data-qijian-clipboard-blocks'));sanitizePastedHtml(holder);normalizeEditorTables(holder);normalizeEditorFormulas(holder);holder.querySelectorAll('ul,ol').forEach(list=>list.classList.add('outline-list'));holder.querySelectorAll('.outline-control-hover,.outline-collapsed').forEach(item=>item.classList.remove('outline-control-hover','outline-collapsed'));cleanOutlineStructure(holder);
 e.preventDefault();normalizeEditorImages(holder);const saved=editorRange()?.cloneRange(),docId=activeDoc?.id;
 const commit=()=>{if(activeDoc?.id!==docId)return;if(saved&&$('#editor').contains(saved.commonAncestorContainer))pasteWithOwnFormatting(saved,holder,plainText,forceBlocks);else return;persist(true);scheduleEditorRefresh({outline:true,mindmap:true})};
 const embedded=[...holder.querySelectorAll('img')].filter(image=>/^data:image\//i.test(image.getAttribute('src')||''));
 if(embedded.length)Promise.all(embedded.map(async image=>{const attachment=await window.qijian.addAttachmentData(image.src,'pasted-image',currentImageDocumentId());image.src=attachment.url})).then(commit).catch(error=>toast(error?.message||'粘贴图片失败'));else commit();
}
function openGlobalSearch(){if($('#app').classList.contains('folders-collapsed'))toggleFolders();filter='search';activeFolder=null;query='';$('#search').value='';navState();render();$('#search').focus()}
function insertLink(){if(window.qijianEditor?.enabled){requestFolderName('插入链接','https://').then(url=>{if(url)window.qijianEditor.insertLink(url)});return}const saved=editorRange()?.cloneRange();requestFolderName('插入链接','https://').then(url=>{if(!url)return;$('#editor').focus();if(saved){const selection=getSelection();selection.removeAllRanges();selection.addRange(saved)}if(!getSelection()?.toString())document.execCommand('insertHTML',false,`<a href="${esc(url)}">${esc(url)}</a>`);else document.execCommand('createLink',false,url);persist(true)})}
function makeEditorImageFigure(image){
  const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');
  figure.className='editor-image';figure.dataset.imageId=uid();figure.draggable=true;img.src=image.url;img.alt=image.alt||'插图';img.draggable=false;caption.contentEditable='false';caption.draggable=false;
  figure.append(img,caption);ensureImageHandles(figure);return figure;
}
function ensureImageHandles(figure){
  if(!figure.dataset.imageId)figure.dataset.imageId=uid();
  figure.tabIndex=0;figure.draggable=false;
  if(figure.querySelectorAll('.image-resize-handle').length===4&&figure.querySelector('.image-drag-grip')&&figure.contentEditable==='false')return;
  figure.querySelectorAll('.image-resize-handle').forEach(handle=>handle.remove());
  if(!figure.querySelector('.image-drag-grip')){const grip=document.createElement('span');grip.className='image-drag-grip';grip.contentEditable='false';grip.draggable=false;grip.setAttribute('aria-label','拖动图片');grip.textContent='•••';figure.appendChild(grip)}
  for(const corner of ['nw','ne','sw','se']){const handle=document.createElement('span');handle.className='image-resize-handle';handle.dataset.corner=corner;handle.contentEditable='false';handle.draggable=false;handle.setAttribute('aria-label','拖动调整图片大小');figure.appendChild(handle)}
  figure.draggable=false;figure.contentEditable='false';figure.tabIndex=0;figure.setAttribute('aria-label','图片，按 Delete 或 Backspace 删除');figure.querySelector('img')?.setAttribute('draggable','false');const caption=figure.querySelector('figcaption');if(caption)caption.contentEditable='false';
}
function commitEditorHtml(range,html){
 const editor=$('#editor'),selection=getSelection();if(html){const holder=document.createElement('div');holder.innerHTML=html;holder.querySelectorAll('.image-row').forEach(row=>row.contentEditable='false');html=holder.innerHTML}editor.focus({preventScroll:true});selection.removeAllRanges();selection.addRange(range);return html?document.execCommand('insertHTML',false,html):document.execCommand('delete',false);
}
function replaceEditorNode(node,html){
 const editor=$('#editor');let block=node;const path=[];while(block.parentElement!==editor){path.unshift([...block.parentElement.childNodes].indexOf(block));block=block.parentElement}
 const clone=block.cloneNode(true);let copy=clone;for(const index of path)copy=copy.childNodes[index];const holder=document.createElement('div');holder.innerHTML=html;const replacement=copy===clone?html:(copy.replaceWith(...holder.childNodes),clone.outerHTML);
 return commitEditorBlocks(block,block,replacement);
}
function commitPastedEditorBlocks(first,last,html){
 const editor=$('#editor'),children=[...editor.children].filter(node=>!node.matches('[data-qijian-transient-block]')),start=children.indexOf(first),end=children.indexOf(last);if(start<0||end<start)return false;
 const makeBoundary=()=>{const node=document.createElement('p');node.dataset.qijianTransientBlock='true';node.dataset.qijianPasteBoundary='true';node.setAttribute('aria-hidden','true');node.style.cssText='position:absolute;width:0;height:0;overflow:hidden;margin:0;padding:0;line-height:0;opacity:0';node.innerHTML='<br>';return node},before=first.previousElementSibling?.matches('[data-qijian-paste-boundary]')?first.previousElementSibling:makeBoundary(),after=last.nextElementSibling?.matches('[data-qijian-paste-boundary]')?last.nextElementSibling:makeBoundary();if(!before.isConnected)first.before(before);if(!after.isConnected)last.after(after);
 const replacement=document.createElement('div');replacement.innerHTML=html||'<p><br></p>';const insertedCount=replacement.children.length,range=document.createRange();range.setStart(before,before.childNodes.length);range.setEnd(after,0);const changed=commitEditorHtml(range,replacement.innerHTML);if(changed){before.contentEditable='false';after.contentEditable='false';normalizeExecCommandWhitespaceBlocks(editor);const visibleChildren=[...editor.children].filter(node=>!node.matches('[data-qijian-transient-block]')),lastInserted=visibleChildren[start+Math.max(0,insertedCount-1)];if(lastInserted)caretAfter(lastInserted)}return changed;
}
function commitEditorBlocks(first,last,html){
 let before=first.previousElementSibling,after=last.nextElementSibling,createdBefore=false,createdAfter=false;
 if(!before?.matches('p')){before=document.createElement('p');before.innerHTML='<br>';first.before(before);createdBefore=true}
 if(!after?.matches('p')){after=document.createElement('p');after.innerHTML='<br>';last.after(after);createdAfter=true}
 const range=document.createRange();range.setStart(before,before.childNodes.length);range.setEnd(after,0);const changed=commitEditorHtml(range,html||'<br>');
 if(createdBefore&&before.isConnected&&!before.textContent.trim()&&!before.querySelector('img,table,.editor-formula'))before.remove();
 if(createdAfter&&after.isConnected&&!after.textContent.trim()&&!after.querySelector('img,table,.editor-formula'))after.remove();
 return changed;
}
function placeEditorImage(figure,block){
  if(!block)return;
  const currentRow=block?.closest?.('.image-row');
  if(currentRow){const clone=currentRow.cloneNode(true);clone.appendChild(figure);replaceEditorNode(currentRow,clone.outerHTML);return}
  const blank=block&&!block.textContent.trim()&&!block.querySelector('img,table'),previous=blank?block.previousElementSibling:null;
  if(previous?.classList.contains('image-row')){const clone=previous.cloneNode(true);clone.appendChild(figure);commitEditorBlocks(previous,block,clone.outerHTML);return}
  const row=document.createElement('div');row.className='image-row';row.appendChild(figure);
  const range=document.createRange(),listItem=block.closest('li');let html=row.outerHTML;
  if(listItem){range.selectNodeContents(listItem);range.collapse(false);html=row.outerHTML}
  else if(blank){range.selectNode(block)}
  else{range.setStartAfter(block);range.collapse(true)}
  commitEditorHtml(range,html);
}
function removeEditorImageFigure(figure){
  const editor=$('#editor');if(!figure||!editor.contains(figure))return false;const row=figure.closest('.image-row'),last=row?.querySelectorAll('figure.editor-image').length===1,target=last?row:figure;
  replaceEditorNode(target,'');persist(true);scheduleEditorRefresh();return true;
}
function normalizeEditorImages(editor=$('#editor')){
  let changed=false;
  [...editor.children].forEach(block=>{
    if(block.matches?.('img')){const row=document.createElement('div');row.className='image-row';row.appendChild(makeEditorImageFigure({url:block.getAttribute('src')}));block.replaceWith(row);changed=true;return}
    if(block.matches?.('figure.editor-image')){const row=document.createElement('div');row.className='image-row';block.replaceWith(row);row.appendChild(block);changed=true;return}
    if(block.matches?.('p,div')&&!block.matches?.('.image-row,.table-block')&&block.querySelectorAll(':scope > img').length&&![...block.childNodes].some(node=>(node.nodeType===Node.TEXT_NODE&&node.textContent.trim())||(node.nodeType===Node.ELEMENT_NODE&&!['IMG','BR'].includes(node.tagName)))){
      const row=document.createElement('div');row.className='image-row';[...block.querySelectorAll(':scope > img')].forEach(img=>row.appendChild(makeEditorImageFigure({url:img.getAttribute('src')})));block.replaceWith(row);changed=true;
    }
  });
  [...editor.querySelectorAll('img')].filter(img=>!img.closest('figure.editor-image')).forEach(img=>{
    if(!editor.contains(img))return;const figure=makeEditorImageFigure({url:img.getAttribute('src'),alt:img.getAttribute('alt')||'插图'}),listItem=img.closest('li');
    if(listItem){const parent=img.parentElement,row=document.createElement('div');row.className='image-row';
      if(parent!==listItem&&parent.matches?.('p,div')&&![...parent.childNodes].some(node=>(node.nodeType===Node.TEXT_NODE&&node.textContent.trim())||(node.nodeType===Node.ELEMENT_NODE&&!['IMG','BR'].includes(node.tagName)))){
        const images=[...parent.querySelectorAll(':scope > img')];images.forEach(source=>row.appendChild(makeEditorImageFigure({url:source.getAttribute('src'),alt:source.getAttribute('alt')||'插图'})));parent.replaceWith(row);
      }else if(parent!==listItem&&parent.matches?.('p,div')){row.appendChild(figure);const sibling=parent.nextElementSibling;if(sibling?.classList.contains('image-row')){sibling.appendChild(figure);row.remove()}else parent.after(row);img.remove()}
      else{const previous=img.previousElementSibling?.classList.contains('image-row')?img.previousElementSibling:null;if(previous){previous.appendChild(figure);img.remove()}else{row.appendChild(figure);img.replaceWith(row)}}changed=true;return;
    }
    let host=img;while(host.parentElement&&host.parentElement!==editor)host=host.parentElement;if(host.parentElement!==editor)return;const row=document.createElement('div');row.className='image-row';row.appendChild(figure);
    if(!host.textContent.trim()&&host.querySelectorAll('img').length===1)host.replaceWith(row);else img.replaceWith(row);changed=true;
  });
  editor.querySelectorAll('figure.editor-image').forEach(figure=>{if(!figure.closest('.image-row')){const row=document.createElement('div');row.className='image-row';figure.replaceWith(row);row.appendChild(figure);changed=true}ensureImageHandles(figure)});
  editor.querySelectorAll('.image-row').forEach(row=>row.contentEditable='false');
  editor.querySelectorAll('.image-row').forEach(row=>{let parent=row.parentElement;while(parent&&parent!==editor&&parent.matches('p,div')&&!parent.matches('.image-row,.table-block')&&![...parent.childNodes].some(node=>node!==row&&node.textContent.trim())&&parent.querySelectorAll('.image-row').length===1){parent.replaceWith(row);parent=row.parentElement;changed=true}});
  return changed;
}
window.normalizeEditorImages=normalizeEditorImages;
async function insertImage(){
  if(window.qijianEditor?.enabled){const documentId=currentImageDocumentId(),image=await window.qijian.addAttachment(documentId);if(image&&currentImageDocumentId()===documentId)window.qijianEditor.insertImage({src:image.url,alt:image.alt||'插图'});return}
  const saved=editorRange()?.cloneRange(),image=await window.qijian.addAttachment(currentImageDocumentId());
  if(!image)return;
  $('#editor').focus();
  if(saved){const selection=getSelection();selection.removeAllRanges();selection.addRange(saved)}
  const block=currentBlock();
  placeEditorImage(makeEditorImageFigure(image),block);
  persist(true);requestAnimationFrame(numbers);
}
function breakImageRow(figure,side){
 const row=figure.closest('.image-row');if(!row)return false;const images=[...row.querySelectorAll(':scope>figure')],index=images.indexOf(figure)+(side==='after'?1:0),before=images.slice(0,index),after=images.slice(index),holder=document.createElement('div');
 const appendRow=items=>{if(!items.length)return;const copy=row.cloneNode(false);items.forEach(item=>{const clone=item.cloneNode(true);clone.classList.remove('image-selected','image-edge-caret');copy.appendChild(clone)});holder.appendChild(copy)};
 appendRow(before);const paragraph=document.createElement('p');paragraph.innerHTML='<br>';paragraph.dataset.imageBreak='true';holder.appendChild(paragraph);appendRow(after);replaceEditorNode(row,holder.innerHTML);const caret=$('#editor [data-image-break]');if(caret){caret.removeAttribute('data-image-break');caretAtStart(caret)}persist(true);scheduleEditorRefresh();return true;
}
function bindImageResize(){
  if(window.qijianEditor?.enabled){
    const editor=$('#editor');let resizing=null,pointerDrag=null,draggedFigure=null,dropTarget=null,dropBlock=null,dropRow=null,dropAfter=false,dragPreview=null,dropIndicator=null;
    const clearImageDrop=()=>editor.querySelectorAll('.image-drop-before,.image-drop-after,.image-drop-target').forEach(item=>item.classList.remove('image-drop-before','image-drop-after','image-drop-target'));
    const clearPreview=()=>{dragPreview?.remove();dropIndicator?.remove();dragPreview=null;dropIndicator=null};
    editor.addEventListener('dragstart',event=>{if(event.target.closest?.('figure.editor-image'))event.preventDefault()},true);
    editor.addEventListener('pointerdown',event=>{
      const handle=event.target.closest?.('.image-resize-handle'),figure=event.target.closest?.('figure.editor-image');if(!figure)return;
      if(handle){event.preventDefault();event.stopPropagation();const rect=figure.getBoundingClientRect();resizing={figure,startX:event.clientX,scale:window.QijianDisplay?.readingFactor()||1,startWidth:rect.width/(window.QijianDisplay?.readingFactor()||1),max:figure.parentElement.getBoundingClientRect().width/(window.QijianDisplay?.readingFactor()||1),corner:handle.dataset.corner||'se'};figure.classList.add('image-resizing');return}
      if(event.button!==0||(!event.target.closest?.('.image-drag-grip')&&event.target.tagName!=='IMG'))return;
      event.preventDefault();event.stopPropagation();window.qijianEditor.selectDomNode(figure);pointerDrag={figure,startX:event.clientX,startY:event.clientY};
    });
    window.addEventListener('pointermove',event=>{
      if(resizing){const direction=resizing.corner.includes('w')?-1:1,width=Math.max(120,Math.min(resizing.max,(event.clientX-resizing.startX)/resizing.scale*direction+resizing.startWidth));resizing.figure.style.width=Math.round(width)+'px';event.preventDefault();return}
      if(!pointerDrag)return;if(!draggedFigure&&Math.hypot(event.clientX-pointerDrag.startX,event.clientY-pointerDrag.startY)<6)return;
      if(!draggedFigure){draggedFigure=pointerDrag.figure;draggedFigure.classList.add('image-dragging');const rect=draggedFigure.getBoundingClientRect(),width=Math.min(220,rect.width),height=Math.min(180,rect.height*(width/Math.max(1,rect.width)));dragPreview=draggedFigure.cloneNode(true);dragPreview.className='image-drag-preview';dragPreview.querySelectorAll('.image-resize-handle,.image-drag-grip').forEach(node=>node.remove());dragPreview.style.width=Math.round(width)+'px';dragPreview.style.height=Math.round(height)+'px';document.body.appendChild(dragPreview)}
      if(dragPreview){dragPreview.style.left=Math.min(innerWidth-dragPreview.offsetWidth-8,event.clientX+15)+'px';dragPreview.style.top=Math.min(innerHeight-dragPreview.offsetHeight-8,event.clientY+15)+'px'}
      clearImageDrop();dropTarget=null;dropBlock=null;dropRow=null;const hit=document.elementFromPoint(event.clientX,event.clientY),figures=[...editor.querySelectorAll('figure.editor-image')].filter(item=>item!==draggedFigure);let target=hit?.closest?.('figure.editor-image'),row=hit?.closest?.('.image-row');if(target===draggedFigure)target=null;if(!target&&row&&row!==draggedFigure.parentElement){target=row.querySelector(':scope>figure:last-child');dropAfter=true}
      if(!target&&figures.length)target=figures.find(item=>{const rect=item.getBoundingClientRect();return event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom})||null;
      if(target&&target!==draggedFigure){dropTarget=target;dropRow=target.parentElement;const rect=target.getBoundingClientRect();dropAfter=event.clientX>rect.left+rect.width/2;if(!dropIndicator){dropIndicator=document.createElement('div');dropIndicator.className='image-drop-indicator';document.body.appendChild(dropIndicator)}dropIndicator.classList.remove('horizontal');dropIndicator.style.left=Math.round(dropAfter?rect.right+5:rect.left-8)+'px';dropIndicator.style.top=Math.round(rect.top)+'px';dropIndicator.style.width='4px';dropIndicator.style.height=Math.max(24,Math.round(rect.height))+'px'}else{
        const block=hit?.closest?.('p,h1,h2,h3,h4,h5,h6,blockquote,pre,aside,.table-block,.formula-block');
        if(block&&!block.closest('figure.editor-image')){dropBlock=block;const rect=block.getBoundingClientRect();dropAfter=event.clientY>rect.top+rect.height/2;if(!dropIndicator){dropIndicator=document.createElement('div');dropIndicator.className='image-drop-indicator';document.body.appendChild(dropIndicator)}dropIndicator.classList.add('horizontal');dropIndicator.style.left=Math.round(rect.left)+'px';dropIndicator.style.top=Math.round(dropAfter?rect.bottom+5:rect.top-8)+'px';dropIndicator.style.width=Math.max(40,Math.round(rect.width))+'px';dropIndicator.style.height='4px'}else{dropIndicator?.remove();dropIndicator=null}
      }
      event.preventDefault();
    },{passive:false});
    const finish=(move=true)=>{
      if(resizing){const {figure}=resizing,width=Math.round(figure.getBoundingClientRect().width/resizing.scale);figure.classList.remove('image-resizing');window.qijianEditor.updateImageFromDOM(figure,width);resizing=null}
      if(pointerDrag&&move&&draggedFigure){if(dropTarget)window.qijianEditor.moveImageFromDOM(draggedFigure,dropTarget,dropAfter);else if(dropBlock)window.qijianEditor.moveImageToBlockFromDOM(draggedFigure,dropBlock,dropAfter)}
      draggedFigure?.classList.remove('image-dragging');pointerDrag=null;draggedFigure=null;dropTarget=null;dropBlock=null;dropRow=null;clearImageDrop();clearPreview();
    };
    window.addEventListener('pointerup',()=>finish(true));window.addEventListener('pointercancel',()=>finish(false));return
  }
  const editor=$('#editor');let resizing=null,pointerDrag=null,draggedFigure=null,dropTarget=null,dropRow=null,dropAfter=false,suppressClick=false;normalizeEditorImages();
  editor.addEventListener('keydown',event=>{const figure=event.target.closest?.('figure.editor-image');if(!figure||event.target.closest('figcaption')||!['Enter','ArrowUp','ArrowDown','Home'].includes(event.key))return;event.preventDefault();if(event.key==='Enter'){breakImageRow(figure,figure.dataset.caretSide||'before');return}const row=figure.closest('.image-row'),before=event.key!=='ArrowDown',neighbor=before?row.previousElementSibling:row.nextElementSibling;if(neighbor?.matches('p')){editor.focus();caretAtStart(neighbor);return}breakImageRow(figure,before?'before':'after')});
  editor.addEventListener('keydown',event=>{if(!['Backspace','Delete'].includes(event.key)||event.target.closest?.('figure'))return;const range=editorRange();if(!range?.collapsed)return;const node=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement,block=node.closest?.('p');if(block&&!block.textContent.trim()&&!block.querySelector('img')&&(event.key==='Backspace'?block.previousElementSibling:block.nextElementSibling)?.matches('.image-row')){event.preventDefault();event.stopPropagation()}},true);
  const clearImageDrop=()=>editor.querySelectorAll('.image-drop-before,.image-drop-after,.image-drop-target').forEach(item=>item.classList.remove('image-drop-before','image-drop-after','image-drop-target'));
  editor.addEventListener('click',event=>{if(suppressClick){suppressClick=false;event.preventDefault();event.stopPropagation();return}const figure=event.target.closest?.('figure.editor-image');editor.querySelectorAll('figure.image-selected').forEach(item=>item.classList.toggle('image-selected',item===figure));if(figure){if(!event.target.closest?.('figcaption'))figure.focus({preventScroll:true});event.stopPropagation()}});
  const deleteSelectedImage=event=>{
    if(!['Delete','Backspace'].includes(event.key)||event.target.closest?.('figcaption'))return;
    const focused=event.target.closest?.('figure.editor-image'),figure=focused?.classList.contains('image-selected')?focused:null;if(!figure)return;
    if(!editor.contains(figure))return;
    event.preventDefault();event.stopPropagation();removeEditorImageFigure(figure);
  };
  document.addEventListener('keydown',deleteSelectedImage,true);
  editor.addEventListener('pointerdown',event=>{
    const handle=event.target.closest?.('.image-resize-handle'),figure=event.target.closest?.('figure.editor-image');if(!figure)return;
    editor.querySelectorAll('figure.image-selected').forEach(item=>item.classList.toggle('image-selected',item===figure));figure.classList.add('image-selected');
    if(!handle&&!event.target.closest('.image-drag-grip')){const rect=figure.getBoundingClientRect(),side=event.clientX<rect.left+rect.width/2?'before':'after',nearEdge=event.clientX<rect.left+18||event.clientX>rect.right-18;figure.dataset.caretSide=side;figure.classList.toggle('image-edge-caret',nearEdge);event.preventDefault();figure.focus({preventScroll:true})}
    if(handle){event.preventDefault();event.stopPropagation();const rect=figure.getBoundingClientRect();resizing={figure,originalStyle:figure.getAttribute('style'),startX:event.clientX,scale:window.QijianDisplay?.readingFactor()||1,startWidth:rect.width/(window.QijianDisplay?.readingFactor()||1),max:figure.parentElement.getBoundingClientRect().width/(window.QijianDisplay?.readingFactor()||1),corner:handle.dataset.corner||'se'};figure.classList.add('image-resizing');return}
    if((event.target.tagName==='IMG'||event.target.closest?.('.image-drag-grip'))&&event.button===0){event.stopPropagation();pointerDrag={figure,startX:event.clientX,startY:event.clientY,pointerId:event.pointerId}}
  });
  window.addEventListener('pointermove',event=>{
    if(resizing){const direction=resizing.corner.includes('w')?-1:1,width=Math.max(120,Math.min(resizing.max,(event.clientX-resizing.startX)/resizing.scale*direction+resizing.startWidth));resizing.figure.style.width=Math.round(width)+'px';event.preventDefault();return}
    if(!pointerDrag)return;if(!draggedFigure&&Math.hypot(event.clientX-pointerDrag.startX,event.clientY-pointerDrag.startY)<6)return;
    if(!draggedFigure){draggedFigure=pointerDrag.figure;draggedFigure.classList.add('image-dragging');suppressClick=true}
    clearImageDrop();dropTarget=null;dropRow=null;const hit=document.elementFromPoint(event.clientX,event.clientY),figures=[...editor.querySelectorAll('figure.editor-image')].filter(item=>item!==draggedFigure);let target=hit?.closest?.('figure.editor-image'),row=hit?.closest?.('.image-row');if(target===draggedFigure)target=null;if(!target&&figures.length){target=figures.find(item=>{const rect=item.getBoundingClientRect();return event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom})||figures.reduce((best,item)=>{const rect=item.getBoundingClientRect(),bestRect=best.getBoundingClientRect(),distance=Math.hypot(event.clientX-(rect.left+rect.width/2),event.clientY-(rect.top+rect.height/2)),bestDistance=Math.hypot(event.clientX-(bestRect.left+bestRect.width/2),event.clientY-(bestRect.top+bestRect.height/2));return distance<bestDistance?item:best},figures[0]);row=target?.parentElement}
    if(target&&target!==draggedFigure){dropTarget=target;dropRow=target.parentElement;dropAfter=event.clientX>target.getBoundingClientRect().left+target.getBoundingClientRect().width/2;target.classList.add(dropAfter?'image-drop-after':'image-drop-before')}
    else if(row&&row!==draggedFigure.parentElement){dropRow=row;row.classList.add('image-drop-target')}
    event.preventDefault();
  },{passive:false});
  const finish=()=>{
    if(resizing){const {figure,originalStyle}=resizing;figure.classList.remove('image-resizing');const html=figure.outerHTML;if(originalStyle===null)figure.removeAttribute('style');else figure.setAttribute('style',originalStyle);replaceEditorNode(figure,html);resizing=null;persist(true);scheduleEditorRefresh()}
    if(pointerDrag){const sourceRow=draggedFigure?.closest('.image-row');if(draggedFigure&&dropRow){
      const topBlock=row=>{while(row.parentElement!==editor)row=row.parentElement;return row},sourceBlock=topBlock(sourceRow),targetBlock=topBlock(dropRow);
      const range=document.createRange();const first=sourceBlock===targetBlock||sourceBlock.compareDocumentPosition(targetBlock)&Node.DOCUMENT_POSITION_FOLLOWING?sourceBlock:targetBlock,last=first===sourceBlock?targetBlock:sourceBlock;range.setStartBefore(first);range.setEndAfter(last);
      // Preserve intermediate content, and change both image rows in one native undo operation.
      const holder=document.createElement('div');holder.appendChild(range.cloneContents());const copies=[...holder.querySelectorAll('figure.editor-image')];const selectedCopy=copies.find(copy=>copy.dataset.imageId===draggedFigure.dataset.imageId);
      const targetCopy=dropTarget?copies.find(copy=>copy.dataset.imageId===dropTarget.dataset.imageId):null;
      const targetRowCopy=targetCopy?.parentElement||[...holder.querySelectorAll('.image-row')].find(row=>row.querySelector('figure')?.dataset.imageId===dropRow.querySelector('figure')?.dataset.imageId);
      if(selectedCopy&&targetRowCopy){if(targetCopy)targetCopy.parentElement.insertBefore(selectedCopy,dropAfter?targetCopy.nextSibling:targetCopy);else targetRowCopy.appendChild(selectedCopy);holder.querySelectorAll('.image-row').forEach(row=>{if(!row.querySelector('figure'))row.remove()});holder.querySelectorAll('.image-dragging,.image-drop-before,.image-drop-after').forEach(node=>node.classList.remove('image-dragging','image-drop-before','image-drop-after'));clearImageDrop();draggedFigure.classList.remove('image-dragging');commitEditorBlocks(first,last,holder.innerHTML);persist(true);scheduleEditorRefresh()}
    }if(draggedFigure)draggedFigure.classList.remove('image-dragging');pointerDrag=null;draggedFigure=null;dropTarget=null;dropRow=null;clearImageDrop()}
  };
  window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);
}
let formulaEditingElement=null,formulaSavedRange=null;
function formulaPlainSource(latex,mode='inline'){return mode==='block'?`\\[\n${latex}\n\\]`:`\\(${latex}\\)`}
function formulaMarkup(latex,mode='inline',sourceText=''){
 const tag=mode==='block'?'div':'span',element=document.createElement(tag),render=document.createElement('span');element.className=`editor-formula formula-${mode}`;element.dataset.latex=latex;element.dataset.formulaSource=sourceText||formulaPlainSource(latex,mode);element.contentEditable='false';element.tabIndex=0;element.setAttribute('aria-label',`${mode==='block'?'独立':'行内'}公式，单击显示操作，双击编辑`);render.className='formula-render';element.appendChild(render);renderFormulaElement(element);return element
}
function renderFormulaElement(element){
 if(!element||!window.katex)return false;const render=element.querySelector(':scope>.formula-render')||element.appendChild(Object.assign(document.createElement('span'),{className:'formula-render'})),latex=element.dataset.latex||'',displayMode=element.classList.contains('formula-block');
 try{window.katex.render(latex,render,{displayMode,throwOnError:true,strict:'warn',trust:false,output:'htmlAndMathml',maxSize:20,maxExpand:1000});element.classList.remove('formula-invalid');element.removeAttribute('data-formula-error');return true}catch(error){render.textContent=latex;element.classList.add('formula-invalid');element.dataset.formulaError=error.message;return false}
}
function normalizeTypedFormula(){
 const range=editorRange();if(!range?.collapsed||range.startContainer.nodeType!==Node.TEXT_NODE)return false;const textNode=range.startContainer,before=textNode.textContent.slice(0,range.startOffset),block=currentBlock(),whole=block?.textContent.trim(),blockMatch=whole?.match(/^(?:\$\$([\s\S]+)\$\$|\\\[([\s\S]+)\\\])$/);
 if(blockMatch&&block?.parentElement?.id==='editor'){const element=formulaMarkup((blockMatch[1]??blockMatch[2]).trim(),'block'),next=document.createElement('p');next.innerHTML='<br>';const replace=document.createRange();replace.selectNode(block);commitEditorHtml(replace,element.outerHTML+next.outerHTML);normalizeEditorFormulas();const inserted=[...$('#editor').querySelectorAll('.formula-block')].at(-1);if(inserted?.nextElementSibling)caretAtStart(inserted.nextElementSibling);return true}
 const match=before.match(/(^|[^\\$])\$([^$\n]+)\$$/);if(!match)return false;const latex=match[2].trim();if(!latex)return false;const start=range.startOffset-match[0].length+(match[1]?match[1].length:0),replace=document.createRange();replace.setStart(textNode,start);replace.setEnd(textNode,range.startOffset);const selection=getSelection();selection.removeAllRanges();selection.addRange(replace);document.execCommand('insertHTML',false,formulaMarkup(latex,'inline').outerHTML+'&#8203;');normalizeEditorFormulas();return true
}
function normalizeEditorFormulas(root=$('#editor')){let changed=false;root.querySelectorAll('.editor-formula').forEach(element=>{element.contentEditable='false';element.tabIndex=0;const mode=element.classList.contains('formula-block')?'block':'inline';if(!element.dataset.formulaSource){element.dataset.formulaSource=formulaPlainSource(element.dataset.latex||'',mode);changed=true}element.setAttribute('aria-label',`${mode==='block'?'独立':'行内'}公式，单击显示操作，双击编辑`);if(!element.querySelector(':scope>.formula-render')){element.replaceChildren(Object.assign(document.createElement('span'),{className:'formula-render'}));changed=true}renderFormulaElement(element)});if(root.id==='editor')root.querySelectorAll(':scope>.formula-block').forEach(element=>{if(!element.previousElementSibling){const paragraph=document.createElement('p');paragraph.innerHTML='<br>';element.before(paragraph);changed=true}if(!element.nextElementSibling){const paragraph=document.createElement('p');paragraph.innerHTML='<br>';element.after(paragraph);changed=true}});return changed}
window.normalizeEditorFormulas=normalizeEditorFormulas;
function normalizeFormulaSource(value){
 let source=String(value||'').trim(),mode=null,match;
 if((match=source.match(/^\\\[\s*([\s\S]*?)\s*\\\]$/))){source=match[1];mode='block'}
 else if((match=source.match(/^\$\$\s*([\s\S]*?)\s*\$\$$/))){source=match[1];mode='block'}
 else if((match=source.match(/^\\\(\s*([\s\S]*?)\s*\\\)$/))){source=match[1];mode='inline'}
 else if((match=source.match(/^\$(?!\$)\s*([\s\S]*?)\s*\$$/))){source=match[1];mode='inline'}
 else if((match=source.match(/^\[\s*([\s\S]*?\\[A-Za-z]+[\s\S]*?)\s*\]$/))){source=match[1];mode='block'}
 return{latex:source.trim(),mode}
}
window.normalizeFormulaSource=normalizeFormulaSource;
function updateFormulaPreview(){const normalized=normalizeFormulaSource($('#formulaSource').value),latex=normalized.latex,mode=normalized.mode||document.querySelector('input[name="formulaMode"]:checked')?.value||'block',preview=$('#formulaPreview'),error=$('#formulaError');if(normalized.mode){const input=document.querySelector(`input[name="formulaMode"][value="${normalized.mode}"]`);if(input)input.checked=true}preview.replaceChildren();error.textContent='';if(!latex)return;try{window.katex.render(latex,preview,{displayMode:mode==='block',throwOnError:true,strict:'warn',trust:false,output:'htmlAndMathml',maxSize:20,maxExpand:1000})}catch(exception){preview.textContent=latex;error.textContent=exception.message.replace(/^KaTeX parse error:\s*/,'') }}
function openFormulaEditor(element=null,mode='block'){
 formulaEditingElement=element;formulaSavedRange=element?null:editorRange()?.cloneRange();$('#formulaSource').value=element?.dataset.latex||'';const selectedMode=element?.classList.contains('formula-inline')?'inline':element?'block':mode;document.querySelector(`input[name="formulaMode"][value="${selectedMode}"]`).checked=true;$('#formulaEditorDelete').classList.toggle('hidden',!element);$('#formulaEditorSave').textContent=element?'保存':'插入公式';$('#formulaEditorDialog').classList.remove('hidden');updateFormulaPreview();openDetachedDialog('formulaEditorDialog',{title:'公式编辑器',width:700,height:470,closeSelector:'#closeFormulaEditor'});$('#formulaSource').focus()
}
function closeFormulaEditor(){formulaEditingElement=null;formulaSavedRange=null;$('#formulaEditorDialog').classList.add('hidden');closeDetachedDialog('formulaEditorDialog')}
function removeEditorFormula(element){if(window.qijianEditor?.enabled){const removed=window.qijianEditor.removeDomNode(element);if(removed&&formulaEditingElement===element)closeFormulaEditor();return removed}if(!element||!$('#editor').contains(element))return false;replaceEditorNode(element,'');if(formulaEditingElement===element)closeFormulaEditor();persist(true);scheduleEditorRefresh();return true}
function saveFormulaEditor(){
 const entered=$('#formulaSource').value.trim(),normalized=normalizeFormulaSource(entered),latex=normalized.latex,mode=normalized.mode||document.querySelector('input[name="formulaMode"]:checked')?.value||'block';if(!latex){toast('请输入公式');return}const previousMode=formulaEditingElement?.classList.contains('formula-block')?'block':'inline',unchanged=formulaEditingElement?.isConnected&&formulaEditingElement.dataset.latex===latex&&previousMode===mode,sourceText=unchanged?(formulaEditingElement.dataset.formulaSource||formulaPlainSource(latex,mode)):(normalized.mode?entered:formulaPlainSource(latex,mode));if(window.qijianEditor?.enabled){if(formulaEditingElement?.isConnected)window.qijianEditor.updateFormulaFromDOM(formulaEditingElement,latex,mode,sourceText);else window.qijianEditor.insertFormula(latex,mode,sourceText);closeFormulaEditor();return}const element=formulaMarkup(latex,mode,sourceText),editor=$('#editor');
 if(formulaEditingElement?.isConnected){const old=formulaEditingElement;if(old.classList.contains('formula-block')||mode==='block')replaceEditorNode(old,element.outerHTML);else{const range=document.createRange();range.selectNode(old);commitEditorHtml(range,element.outerHTML)}}
 else if(mode==='inline'&&formulaSavedRange&&editor.contains(formulaSavedRange.commonAncestorContainer))commitEditorHtml(formulaSavedRange,element.outerHTML+'&#8203;');
 else{const block=formulaSavedRange&&editor.contains(formulaSavedRange.commonAncestorContainer)?(()=>{let node=formulaSavedRange.startContainer.nodeType===Node.ELEMENT_NODE?formulaSavedRange.startContainer:formulaSavedRange.startContainer.parentElement;return node.closest('p,h1,h2,h3,h4,h5,h6,blockquote,aside,pre,li')})():currentBlock(),next=document.createElement('p');next.innerHTML='<br>';if(block?.parentElement?.id==='editor'){const range=document.createRange(),blank=!block.textContent.trim()&&!block.querySelector('img,table,.editor-formula');blank?range.selectNode(block):(range.setStartAfter(block),range.collapse(true));commitEditorHtml(range,element.outerHTML+next.outerHTML)}else{const range=formulaSavedRange||editorRange();if(range)commitEditorHtml(range,element.outerHTML+'<p><br></p>')}}
 closeFormulaEditor();normalizeEditorFormulas();const inserted=[...editor.querySelectorAll('.editor-formula')].findLast(item=>item.dataset.latex===latex&&item.classList.contains(`formula-${mode}`));if(mode==='block'&&inserted?.nextElementSibling)caretAtStart(inserted.nextElementSibling);persist(true);requestAnimationFrame(numbers)
}
let formulaQuickElement=null;
function hideFormulaQuickActions(){formulaQuickElement=null;$('#formulaActions')?.classList.add('hidden')}
function positionFormulaQuickActions(){const panel=$('#formulaActions'),formula=formulaQuickElement;if(!panel||!formula?.isConnected)return hideFormulaQuickActions();const rect=formula.getBoundingClientRect();panel.classList.remove('hidden');const panelRect=panel.getBoundingClientRect(),left=Math.max(8,Math.min(innerWidth-panelRect.width-8,rect.right-panelRect.width));let top=rect.top-panelRect.height-6;if(top<8)top=Math.min(innerHeight-panelRect.height-8,rect.bottom+6);panel.style.left=`${left}px`;panel.style.top=`${Math.max(8,top)}px`}
function showFormulaQuickActions(formula){if(!formula?.matches?.('.editor-formula')||!$('#editor').contains(formula))return hideFormulaQuickActions();formulaQuickElement=formula;positionFormulaQuickActions()}
function syncFormulaQuickActions(){const selected=$('#editor .editor-formula.ProseMirror-selectednode');if(selected)return showFormulaQuickActions(selected);if(formulaQuickElement&&!formulaQuickElement.matches(':focus'))hideFormulaQuickActions();else if(formulaQuickElement)positionFormulaQuickActions()}
window.syncFormulaQuickActions=syncFormulaQuickActions;
function restoreFormulaAsText(formula=formulaQuickElement){if(!formula?.isConnected)return false;const mode=formula.classList.contains('formula-block')?'block':'inline',source=formula.dataset.formulaSource||formulaPlainSource(formula.dataset.latex||'',mode);hideFormulaQuickActions();if(window.qijianEditor?.enabled)return window.qijianEditor.restoreFormulaFromDOM(formula);if(mode==='inline'){const range=document.createRange(),selection=getSelection(),text=document.createTextNode(source);range.selectNode(formula);range.deleteContents();range.insertNode(text);range.setStartAfter(text);range.collapse(true);selection.removeAllRanges();selection.addRange(range)}else{replaceEditorNode(formula,source.replace(/\r\n?/g,'\n').split('\n').map(line=>`<p>${esc(line)||'<br>'}</p>`).join(''))}persist(true);scheduleEditorRefresh();return true}
function bindFormulaEditor(){
 const editor=$('#editor'),source=$('#formulaSource'),actions=$('#formulaActions');if(!window.qijianEditor?.enabled)normalizeEditorFormulas();source.addEventListener('input',updateFormulaPreview);source.addEventListener('paste',event=>{const plain=event.clipboardData?.getData('text/plain')||'',restored=formulaTextFromClipboard(event.clipboardData?.getData('text/html')||'',plain);if(restored===plain)return;event.preventDefault();source.setRangeText(restored,source.selectionStart,source.selectionEnd,'end');source.dispatchEvent(new Event('input',{bubbles:true}))});document.querySelectorAll('input[name="formulaMode"]').forEach(input=>input.addEventListener('change',updateFormulaPreview));$('#closeFormulaEditor').onclick=$('#formulaEditorCancel').onclick=closeFormulaEditor;$('#formulaEditorSave').onclick=saveFormulaEditor;$('#formulaEditorDelete').onclick=()=>removeEditorFormula(formulaEditingElement);actions?.addEventListener('mousedown',event=>event.preventDefault());$('#formulaQuickEdit').onclick=()=>{const formula=formulaQuickElement;if(!formula)return;hideFormulaQuickActions();openFormulaEditor(formula)};$('#formulaRestoreText').onclick=()=>restoreFormulaAsText();document.addEventListener('pointerdown',event=>{if(event.target.closest?.('#formulaActions,.editor-formula'))return;hideFormulaQuickActions()},true);document.addEventListener('scroll',()=>formulaQuickElement&&positionFormulaQuickActions(),true);window.addEventListener('resize',()=>formulaQuickElement&&positionFormulaQuickActions());
 if(window.qijianEditor?.enabled){editor.addEventListener('click',event=>{const formula=event.target.closest?.('.editor-formula');if(formula)requestAnimationFrame(()=>showFormulaQuickActions(formula))});editor.addEventListener('dblclick',event=>{const formula=event.target.closest?.('.editor-formula');if(!formula)return;event.preventDefault();event.stopPropagation();hideFormulaQuickActions();window.qijianEditor.selectDomNode(formula);openFormulaEditor(formula)});return}
 editor.addEventListener('click',event=>{const formula=event.target.closest?.('.editor-formula');if(!formula)return;event.preventDefault();event.stopPropagation();formula.focus({preventScroll:true});showFormulaQuickActions(formula)});editor.addEventListener('dblclick',event=>{const formula=event.target.closest?.('.editor-formula');if(!formula)return;event.preventDefault();event.stopPropagation();hideFormulaQuickActions();openFormulaEditor(formula)});document.addEventListener('keydown',event=>{const formula=document.activeElement?.closest?.('.editor-formula');if(!formula||!editor.contains(formula))return;if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();hideFormulaQuickActions();const range=document.createRange(),selection=getSelection();event.key==='ArrowLeft'?range.setStartBefore(formula):range.setStartAfter(formula);range.collapse(true);editor.focus({preventScroll:true});selection.removeAllRanges();selection.addRange(range);return}if(!['Delete','Backspace'].includes(event.key))return;event.preventDefault();event.stopPropagation();hideFormulaQuickActions();removeEditorFormula(formula)},true)
}
let tableEditingBlock=null,tableEditorMatrix=[];
function makeTableBlock(matrix=[['标题 1','标题 2'],['内容','内容']]){const block=document.createElement('div');block.className='table-block';block.contentEditable='false';block.tabIndex=0;block.setAttribute('aria-label','表格，按 Delete 或 Backspace 删除');const button=document.createElement('button');button.className='table-edit-button';button.type='button';button.title='编辑表格';button.setAttribute('aria-label','编辑表格');button.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 14.2V17h2.8L15.9 6.9l-2.8-2.8L3 14.2Zm14.6-9.1a1 1 0 0 0 0-1.4l-1.3-1.3a1 1 0 0 0-1.4 0l-1 1 2.8 2.8 0.9-1.1Z"/></svg>';const table=document.createElement('table'),body=document.createElement('tbody');matrix.forEach((row,rowIndex)=>{const tr=document.createElement('tr');row.forEach(value=>{const cell=document.createElement(rowIndex===0?'th':'td');cell.textContent=value;tr.appendChild(cell)});body.appendChild(tr)});table.appendChild(body);block.append(table,button);return block}
function tableMatrix(block){return [...block.querySelectorAll('tr')].map(row=>[...row.children].map(cell=>cell.textContent.replace(/\u00a0/g,' ').trim()))}
function insertTableBoundaryLine(block,side='after'){if(window.qijianEditor?.enabled)return window.qijianEditor.insertBoundaryParagraph(block,side);if(!block?.isConnected)return false;const paragraph=document.createElement('p');paragraph.innerHTML='<br>';side==='before'?block.before(paragraph):block.after(paragraph);$('#editor').focus({preventScroll:true});caretAtStart(paragraph);persist(true);scheduleEditorRefresh();return true}
function normalizeEditorTables(root=$('#editor')){let changed=false;[...root.querySelectorAll('table')].forEach(table=>{if(table.closest('.table-block'))return;const block=makeTableBlock([...table.rows].map(row=>[...row.cells].map(cell=>cell.textContent)));table.replaceWith(block);changed=true});root.querySelectorAll('.table-block').forEach(block=>{block.contentEditable='false';block.tabIndex=0;block.setAttribute('aria-label','表格，按 Delete 或 Backspace 删除')});return changed}
window.normalizeEditorTables=normalizeEditorTables;
function renderTableEditor(){const grid=$('#tableEditorGrid'),columns=Math.max(1,...tableEditorMatrix.map(row=>row.length));tableEditorMatrix=tableEditorMatrix.map(row=>[...row,...Array(columns-row.length).fill('')]);grid.style.setProperty('--table-columns',columns);grid.innerHTML='';tableEditorMatrix.forEach((row,r)=>row.forEach((value,c)=>{const input=document.createElement('input');input.value=value;input.dataset.row=r;input.dataset.column=c;input.setAttribute('aria-label',`第 ${r+1} 行第 ${c+1} 列`);input.oninput=()=>tableEditorMatrix[r][c]=input.value;grid.appendChild(input)}))}
function openTableEditor(block){tableEditingBlock=block;$('#tableFontSize').value=Math.round(parseFloat(getComputedStyle(block).fontSize));tableEditorMatrix=tableMatrix(block);if(!tableEditorMatrix.length)tableEditorMatrix=[['']];renderTableEditor();$('#tableEditorDialog').classList.remove('hidden');const height=Math.min(720,Math.max(290,178+tableEditorMatrix.length*40));openDetachedDialog('tableEditorDialog',{title:'编辑表格',width:900,height,closeSelector:'#closeTableEditor'});$('#tableEditorGrid input')?.focus()}
function closeTableEditor(){tableEditingBlock=null;$('#tableEditorDialog').classList.add('hidden');closeDetachedDialog('tableEditorDialog')}
function removeEditorTableBlock(block){if(window.qijianEditor?.enabled){const removed=window.qijianEditor.removeDomNode(block);if(removed&&tableEditingBlock===block)closeTableEditor();return removed}const editor=$('#editor');if(!block||!editor.contains(block))return false;replaceEditorNode(block,'');if(tableEditingBlock===block)closeTableEditor();persist(true);scheduleEditorRefresh();return true}
function bindTableEditor(){const editor=$('#editor');if(!window.qijianEditor?.enabled)normalizeEditorTables();if(window.qijianEditor?.enabled)editor.addEventListener('click',event=>{const button=event.target.closest?.('.table-edit-button');if(!button)return;const block=button.closest('.table-block');event.preventDefault();event.stopPropagation();window.qijianEditor.selectDomNode(block);openTableEditor(block)},true);else editor.addEventListener('click',event=>{const block=event.target.closest?.('.table-block');if(!block)return;event.preventDefault();event.stopPropagation();const rect=block.getBoundingClientRect();block.dataset.caretSide=event.clientY<rect.top+rect.height/2?'before':'after';block.focus({preventScroll:true});const button=event.target.closest?.('.table-edit-button');if(button)openTableEditor(block)});if(!window.qijianEditor?.enabled)document.addEventListener('keydown',event=>{if(!editor.contains(document.activeElement))return;const block=document.activeElement.closest?.('.table-block');if(!block)return;if(event.key==='Enter'){event.preventDefault();event.stopPropagation();insertTableBoundaryLine(block,block.dataset.caretSide||'after');return}if(event.key==='ArrowUp'||event.key==='Home'){event.preventDefault();event.stopPropagation();insertTableBoundaryLine(block,'before');return}if(event.key==='ArrowDown'||event.key==='End'){event.preventDefault();event.stopPropagation();insertTableBoundaryLine(block,'after');return}if(!['Delete','Backspace'].includes(event.key))return;event.preventDefault();event.stopPropagation();removeEditorTableBlock(block)},true);$('#closeTableEditor').onclick=$('#tableEditorCancel').onclick=closeTableEditor;$('#tableAddRow').onclick=()=>{tableEditorMatrix.push(Array(Math.max(1,tableEditorMatrix[0]?.length||1)).fill(''));renderTableEditor()};$('#tableRemoveRow').onclick=()=>{if(tableEditorMatrix.length>1){tableEditorMatrix.pop();renderTableEditor()}};$('#tableAddColumn').onclick=()=>{tableEditorMatrix.forEach(row=>row.push(''));renderTableEditor()};$('#tableRemoveColumn').onclick=()=>{if((tableEditorMatrix[0]?.length||0)>1){tableEditorMatrix.forEach(row=>row.pop());renderTableEditor()}};$('#tableEditorSave').onclick=()=>{if(!tableEditingBlock)return;const size=Math.max(8,Math.min(72,Number($('#tableFontSize').value)||16));if(window.qijianEditor?.enabled)window.qijianEditor.updateTableFromDOM(tableEditingBlock,tableEditorMatrix,size);else{const replacement=makeTableBlock(tableEditorMatrix);replacement.style.fontSize=size+'px';replaceEditorNode(tableEditingBlock,replacement.outerHTML);persist(true);requestAnimationFrame(numbers)}closeTableEditor()}}
function insertTable(){if(window.qijianEditor?.enabled)return window.qijianEditor.insertTable([['标题 1','标题 2','标题 3'],['内容','内容','内容'],['内容','内容','内容']],15);if(!editorRange())return;const block=currentBlock(),table=makeTableBlock([['标题 1','标题 2','标题 3'],['内容','内容','内容'],['内容','内容','内容']]);if(block?.parentElement?.id==='editor'){const blank=!block.textContent.trim()&&!block.querySelector('img,table');blank?block.replaceWith(table):block.after(table)}else{document.execCommand('insertHTML',false,table.outerHTML);normalizeEditorTables()}table.focus({preventScroll:true});persist(true);requestAnimationFrame(numbers)}
function navigateDoc(step){const items=docs();const index=items.findIndex(x=>x.id===activeDoc?.id),next=items[index+step];if(next)select(next.id)}
function formatDocument(){if(!activeDoc)return;if(window.qijianEditor?.enabled){toast('排版已整理');return}const editor=$('#editor');editor.querySelectorAll('div').forEach(div=>{if(div.parentElement!==editor||div.matches('.image-row,.table-block,.formula-block'))return;const p=document.createElement('p');p.innerHTML=div.innerHTML;div.replaceWith(p)});editor.querySelectorAll('p').forEach(p=>{if(!p.textContent.trim()&&!p.querySelector('img,br,.editor-formula'))p.innerHTML='<br>'});persist(true);requestAnimationFrame(numbers);toast('排版已整理')}
function onGlobalShortcut(e){
 const ctrl=e.ctrlKey||e.metaKey,key=e.key.toLowerCase(),digit=e.code?.match(/^Digit([0-9])$/)?.[1]||key;
 if(e.key==='F3'){e.preventDefault();findNext(e.shiftKey);return}
 if(e.key==='F5'&&$('#editor').contains(document.activeElement)){e.preventDefault();if(window.qijianEditor?.enabled)window.qijianEditor.insertText(new Date().toLocaleString('zh-CN'));else{document.execCommand('insertText',false,new Date().toLocaleString('zh-CN'));persist(true)}return}
 if(e.shiftKey&&e.altKey&&!ctrl&&/^[1-6]$/.test(digit)){e.preventDefault();setBlock(`h${digit}`);return}
 if(!ctrl)return;
 let handled=true;
 if(e.altKey&&key==='e')openFormulaEditor();
 else if(e.altKey&&key===',')openSettings();
 else if(e.altKey&&key==='f')formatDocument();
 else if(e.altKey&&key==='m')applyMarkAction('comment');
 else if(e.altKey&&key==='c')setBlock('pre');
 else if(e.shiftKey&&key==='f')openGlobalSearch();
 else if(e.shiftKey&&key==='n')createFolder();
 else if(e.shiftKey&&key==='h')openTool('versions');
 else if(e.shiftKey&&key==='i')openTool('outline');
 else if(e.shiftKey&&digit==='7')setOutline(false)
 else if(e.shiftKey&&digit==='8')setOutline(true)
 else if(e.shiftKey&&digit==='5')insertSpecialBlock('note');
 else if(e.shiftKey&&key==='m')applyMarkAction('annotation');
 else if(e.shiftKey&&key==='c')applyMarkAction('codeInline');
 else if(e.shiftKey&&key==='v'){pastePlainOnce=true;handled=false}
 else if(key==='1')toggleFolders();
 else if(key==='2')toggleDocs();
 else if(key==='6'){if($('#wordStatsPanel').classList.contains('hidden')||!detachedDialogs.has('wordStatsPanel'))openWordStats();else{$('#wordStatsPanel').classList.add('hidden');closeDetachedDialog('wordStatsPanel')}}
 else if(key==='n')createDoc();
 else if(key==='f')openFind();
 else if(key==='h')openFind(true);
 else if(key==='b'||key==='i'||key==='d')insertSemanticMark(key==='b'?'bold':key==='i'?'italic':'strikeThrough')
 else if(key==='l')applyMarkAction('clearMark');
 else if(key==='m')insertImage();
 else if(key==='t')insertTable();
 else if(key==='k')insertLink();
 else if(key==='q')setBlock('blockquote');
 else if(key==='`')openTool('mindmap');
 else if(e.key==='ArrowUp')navigateDoc(-1);
 else if(e.key==='ArrowDown')navigateDoc(1);
 else if(e.key==='Delete'&&activeDoc&&(document.activeElement===document.body||$('#docList').contains(document.activeElement)))trash(activeDoc);
 else handled=false;
 if(handled)e.preventDefault();
}
function bindWordStatsDrag(){const panel=$('#wordStatsPanel');let dragging=false,dx=0,dy=0;panel.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;dragging=true;dx=e.clientX-panel.offsetLeft;dy=e.clientY-panel.offsetTop;panel.setPointerCapture(e.pointerId)});panel.addEventListener('pointermove',e=>{if(!dragging)return;panel.style.left=`${Math.max(0,Math.min(innerWidth-panel.offsetWidth,e.clientX-dx))}px`;panel.style.top=`${Math.max(0,Math.min(innerHeight-panel.offsetHeight,e.clientY-dy))}px`;panel.style.right='auto'});panel.addEventListener('pointerup',()=>dragging=false)}
function removeOrderedMarkerAtLineStart(event){
 if(event.key!=='Backspace'||event.ctrlKey||event.metaKey||event.altKey)return false;const range=editorRange();if(!range?.collapsed)return false;const node=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement,item=node.closest?.('li'),list=item?.parentElement;if(!item||list?.tagName!=='OL'||list.parentElement?.id!=='editor')return false;
 const before=document.createRange();before.selectNodeContents(item);try{before.setEnd(range.startContainer,range.startOffset)}catch{return false}if(before.toString()||before.cloneContents().querySelector?.('img,.editor-formula'))return false;
 event.preventDefault();event.stopPropagation();const holder=document.createElement('div'),leading=list.cloneNode(false),trailing=list.cloneNode(false),paragraph=document.createElement('div'),marker=uid();paragraph.dataset.unlistedLine=marker;
 let passed=false;for(const child of [...list.children]){if(child===item){passed=true;for(const content of [...child.childNodes])if(!(content.nodeType===Node.ELEMENT_NODE&&['UL','OL'].includes(content.tagName)))paragraph.append(content.cloneNode(true));continue}(passed?trailing:leading).append(child.cloneNode(true))}
 if(!paragraph.hasChildNodes())paragraph.innerHTML='<br>';if(leading.children.length)holder.append(leading);else{const boundary=document.createElement('hr');boundary.dataset.unlistBoundary=marker;holder.append(boundary)}holder.append(paragraph);for(const nested of [...item.children].filter(child=>['UL','OL'].includes(child.tagName)))holder.append(nested.cloneNode(true));if(trailing.children.length)holder.append(trailing);commitEditorBlocks(list,list,holder.innerHTML);$(`[data-unlist-boundary="${marker}"]`)?.remove();let inserted=$(`[data-unlisted-line="${marker}"]`);if(inserted?.tagName==='DIV'){const body=document.createElement('p');body.innerHTML=inserted.innerHTML;inserted.replaceWith(body);inserted=body}inserted?.removeAttribute('data-unlisted-line');if(inserted)caretAtStart(inserted);persist(true);scheduleEditorRefresh({outline:true,mindmap:true});return true
}
async function renameEditorLink(link){
 const docId=activeDoc?.id,label=await requestFolderName('修改链接文字',link.textContent.trim()||link.href);if(!label||activeDoc?.id!==docId||!link.isConnected)return;
 if(window.qijianEditor?.enabled){window.qijianEditor.updateLinkFromDOM(link,label);return}
 const range=document.createRange(),selection=getSelection();range.selectNodeContents(link);$('#editor').focus({preventScroll:true});selection.removeAllRanges();selection.addRange(range);document.execCommand('insertText',false,label);persist(true);scheduleEditorRefresh();
}
function setupEnhancements(){document.addEventListener('keydown',onGlobalShortcut);if(!window.qijianEditor?.enabled)$('#editor').addEventListener('beforeinput',keepTextOutsideSemanticMark);bindImageResize();bindTableEditor();bindFormulaEditor();
 const editor=$('#editor');
 editor.addEventListener('mousedown',event=>{const link=event.target.closest?.('a[href]');if(!link||event.button!==0)return;event.preventDefault();event.stopPropagation();window.qijianEditor?.setCursorFromDOM?.(link,true)},true);
 if(!window.qijianEditor?.enabled)editor.addEventListener('keydown',removeOrderedMarkerAtLineStart,true);
 editor.addEventListener('click',event=>{const link=event.target.closest?.('a[href]');if(!link)return;event.preventDefault();event.stopPropagation();if(event.ctrlKey||event.metaKey)window.qijian.openExternal(link.href).catch(error=>toast(error?.message||'无法打开链接'));else renameEditorLink(link)});
 editor.addEventListener('dblclick',event=>{const image=event.target.closest?.('figure.editor-image img');if(!image)return;event.preventDefault();event.stopPropagation();window.qijian.openImage(image.src).catch(error=>toast(error?.message||'无法打开图片'))});
 const outlineBulletItem=event=>{const item=event.target.closest?.('li');if(!item||!item.parentElement?.classList.contains('outline-list'))return null;const rect=item.getBoundingClientRect(),style=getComputedStyle(item),scale=window.QijianDisplay?.readingFactor()||1,size=(parseFloat(style.fontSize)||19)*scale,lineHeight=(parseFloat(style.lineHeight)||(parseFloat(style.fontSize)||19)*1.75)*scale;return event.clientX>=rect.left-size*.25&&event.clientX<=rect.left+size*.9&&event.clientY>=rect.top&&event.clientY<=rect.top+lineHeight?item:null};
 editor.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;const item=outlineBulletItem(event);if(!item)return;
  const branches=[...item.children].filter(child=>['UL','OL'].includes(child.tagName));
  if(!branches.length)return;
  event.preventDefault();if(window.qijianEditor?.enabled)window.qijianEditor.toggleCollapseFromDOM(item);else{item.classList.toggle('outline-collapsed');persist(true);requestAnimationFrame(numbers);refreshMindmapWindows()}
 },true);if(!window.qijianEditor?.enabled){$('#editor').addEventListener('copy',event=>{if(!copyEditorTableContent(event)&&!copyEditorFormulaContent(event)&&!copyEditorImageContent(event)&&!copyOutlineAsMarkdown(event))copyEditorTextContent(event)});$('#editor').addEventListener('cut',event=>{if(!cutEditorTableContent(event)&&!cutEditorFormulaContent(event))cutEditorImageContent(event)});$('#editor').addEventListener('paste',pasteEditorContent)}$('#findText').oninput=updateFindStatus;$('#findText').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();findNext(e.shiftKey)}};$('#findNext').onclick=()=>findNext();$('#findPrevious').onclick=()=>findNext(true);$('#replaceOne').onclick=replaceCurrent;$('#replaceAll').onclick=replaceAll;$('#closeFind').onclick=()=>$('#findPanel').classList.add('hidden');document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#findPanel').classList.add('hidden');$('#slashPanel').classList.add('hidden');closeFormulaEditor()}})}

init().then(()=>{setupEnhancements();window.qijian.startupReady()}).catch(e=>{console.error(e);alert(`栖简启动失败：${e.message}`)});

