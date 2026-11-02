const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let library,activeDoc=null,activeFolder=null,filter='all',query='',saveTimer,edgeTimer,dragNodeId=null,docDropTargetId=null,docDropAfter=false,libraryRoot='',pendingLibraryRoot='',libraryMigrating=false;
const collapsedFolderIds=new Set(),collapsedTrashFolderIds=new Set(),pendingHistoryDocIds=new Set();
let trashExpanded=false;
const forcedPaneState={folders:false,docs:false,foldersWasCollapsed:false,docsWasCollapsed:false};
let paneCycleDirection=null;
let saveQueue=Promise.resolve(),saveDrain=null,saveRequested=false;
let libraryRestoreInProgress=false,libraryWritesSuspended=false;
const pendingImageCleanup=new Set();
let editorRefreshTimer=null,editorRefreshOutline=false,editorRefreshMindmap=false;
let historySelection='current',toolPanelMode='';
const uid=()=>`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,now=()=>new Date().toISOString();
const historySessionId=uid(),historyRetentionMs=15*24*60*60*1000;
const esc=(v='')=>v.replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const folderGlyph='<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M2.5 5.5h5l1.7 1.8h8.3v8.2a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
function normalizeDocumentHtml(html){
  const root=document.createElement('div');
  root.innerHTML=html||'<p><br></p>';
  const originalText=root.textContent;
  root.querySelectorAll('font').forEach(node=>node.replaceWith(...node.childNodes));
  root.querySelectorAll('[face],[size]').forEach(node=>{node.removeAttribute('face');node.removeAttribute('size')});
  root.querySelectorAll('[style]').forEach(node=>{for(const property of ['font-family','font-size','line-height','letter-spacing'])node.style.removeProperty(property);if(!node.getAttribute('style')?.trim())node.removeAttribute('style')});
  for(const heading of [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')]){
    if(![...heading.children].some(child=>child.tagName==='DIV'))continue;
    const parts=document.createDocumentFragment();
    let pending=heading.cloneNode(false);
    pending.removeAttribute('data-outline-id');
    const flush=()=>{
      if(!pending.hasChildNodes())return;
      if(!pending.textContent.trim()&&!pending.querySelector('img,table,.editor-formula')){const blank=document.createElement('p');blank.innerHTML='<br>';parts.appendChild(blank)}
      else parts.appendChild(pending);
      pending=heading.cloneNode(false);pending.removeAttribute('data-outline-id');
    };
    for(const child of [...heading.childNodes]){
      if(child.nodeType===Node.ELEMENT_NODE&&child.tagName==='DIV'){
        flush();
        const meaningful=child.textContent.trim()||child.querySelector('img,table,.editor-formula');
        const block=document.createElement('p');
        block.innerHTML=child.innerHTML||'<br>';
        if(child.style.textAlign)block.style.textAlign=child.style.textAlign;
        parts.appendChild(block);
      }else pending.appendChild(child.cloneNode(true));
    }
    flush();
    heading.replaceWith(parts);
  }
  for(const list of [...root.querySelectorAll('ul,ol')]){
    for(const child of [...list.children]){
      if(!['UL','OL'].includes(child.tagName))continue;
      const previous=child.previousElementSibling;
      if(previous?.tagName==='LI')previous.appendChild(child);
      else{while(child.firstChild)list.insertBefore(child.firstChild,child);child.remove()}
    }
  }
  for(const div of [...root.children].filter(child=>child.tagName==='DIV')){
    if(div.classList.contains('formula-block')||div.querySelector('p,h1,h2,h3,h4,h5,h6,ul,ol,blockquote,pre,table,div'))continue;
    const paragraph=document.createElement('p');
    paragraph.innerHTML=div.innerHTML||'<br>';
    if(div.style.textAlign)paragraph.style.textAlign=div.style.textAlign;
    div.replaceWith(paragraph);
  }
  for(const paragraph of [...root.querySelectorAll(':scope > p')]){
    const orphanedBoundary=!paragraph.textContent.trim()&&!paragraph.querySelector('img,table,.editor-formula')&&paragraph.style.position==='absolute'&&parseFloat(paragraph.style.width||'0')===0&&parseFloat(paragraph.style.height||'0')===0&&paragraph.style.overflow==='hidden';
    if(orphanedBoundary)paragraph.remove();
  }
  for(const heading of [...root.querySelectorAll(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6')]){
    if(heading.textContent.trim()||heading.querySelector('img,table,.editor-formula'))continue;
    const paragraph=heading.nextElementSibling,styledShell=heading.matches('[style]')||!!heading.querySelector('[style]'),styledParagraph=paragraph?.matches?.('[style]')||!!paragraph?.querySelector?.('[style]');
    if((!styledShell&&!styledParagraph)||paragraph?.tagName!=='P'||!paragraph.textContent.trim())continue;
    const recovered=heading.cloneNode(false);recovered.removeAttribute('style');recovered.append(...paragraph.childNodes);recovered.querySelectorAll('[style]').forEach(node=>{node.style.removeProperty('color');node.style.removeProperty('font-weight');if(!node.getAttribute('style')?.trim())node.removeAttribute('style')});heading.replaceWith(recovered);paragraph.remove();
  }
  for(const heading of [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')]){
    if(heading.textContent.trim()||heading.querySelector('img,table,.editor-formula'))continue;
    const paragraph=document.createElement('p');paragraph.innerHTML='<br>';heading.replaceWith(paragraph);
  }
  root.querySelectorAll('h1[style],h1 [style],h2[style],h2 [style],h3[style],h3 [style],h4[style],h4 [style],h5[style],h5 [style],h6[style],h6 [style]').forEach(node=>{for(const property of ['color','font-weight'])node.style.removeProperty(property);if(!node.getAttribute('style')?.trim())node.removeAttribute('style')});
  if(root.textContent!==originalText)root.innerHTML=html||'<p><br></p>';
  normalizeLegacyMarkTokens(root);
  return root.innerHTML;
}
async function normalizeStoredDocuments(){
  const targetVersion=8,needsNormalization=Number(library.documentNormalizationVersion||0)<targetVersion,clearHistory=library.historyResetVersion!==1,upgradeHistoryPolicy=library.historyPolicyVersion!==1;
  if(!needsNormalization&&!clearHistory&&!upgradeHistoryPolicy)return 0;
  const records=library.nodes.filter(item=>item.type==='document').flatMap(item=>[item,...(item.versions||[])]).filter(item=>typeof item.content==='string');
  const changes=needsNormalization?records.map(item=>({item,content:normalizeDocumentHtml(item.content)})).filter(x=>x.content!==x.item.content):[];
  const embeddedImages=needsNormalization&&library.nodes.some(item=>item.type==='document'&&[item,...(item.versions||[])].some(version=>/data:image\//i.test(version.content||'')));
  changes.forEach(({item,content})=>{item.content=content});
  if(embeddedImages){try{for(const item of library.nodes.filter(item=>item.type==='document')){
    const urls=new Map();
    for(const version of [item,...(item.versions||[])]){
      if(!/data:image\//i.test(version.content||''))continue;
      const root=document.createElement('div');root.innerHTML=version.content||'';
      for(const image of root.querySelectorAll('img')){
        const source=image.getAttribute('src')||'';if(!/^data:image\//i.test(source))continue;
        if(!urls.has(source))urls.set(source,(await window.qijian.addAttachmentData(source,'library-image',item.id)).url);
        image.setAttribute('src',urls.get(source));
      }
      version.content=root.innerHTML;
    }
  }}catch(error){console.error('内嵌图片整理失败',error);toast('部分旧图片未完成整理，将在下次启动重试');return Math.max(1,changes.length)}}
  if(clearHistory){library.nodes.filter(item=>item.type==='document').forEach(item=>{item.versions=[]});library.historyResetVersion=1;pendingHistoryDocIds.clear()}
  if(upgradeHistoryPolicy){library.nodes.filter(item=>item.type==='document').forEach(item=>pruneHistoryVersions(item));library.historyPolicyVersion=1}
  library.documentNormalizationVersion=targetVersion;
  return Math.max(1,changes.length+Number(clearHistory)+Number(upgradeHistoryPolicy));
}
function textOf(html=''){const d=document.createElement('div');d.innerHTML=html;d.querySelectorAll('.editor-formula').forEach(formula=>formula.replaceChildren(document.createTextNode(formula.dataset.latex||'')));return(d.innerText||d.textContent||'').replace(/\s+/g,' ').trim()}
function preview(doc){return textOf(doc.content)||'空白文稿'}
const cardCache=new WeakMap();
function cardParts(doc){
  const cached=cardCache.get(doc);if(cached&&cached.content===doc.content&&cached.title===doc.title)return cached.parts;
  const root=document.createElement('div');root.innerHTML=doc.content||'';root.querySelectorAll('.editor-formula').forEach(formula=>formula.replaceChildren(document.createTextNode(formula.dataset.latex||'')));
  const blocks=[...root.querySelectorAll(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6,:scope > p,:scope > blockquote,:scope > pre,:scope > ul > li,:scope > ol > li')].map(el=>({el,text:el.textContent.replace(/\s+/g,' ').trim()})).filter(item=>item.text);
  const first=blocks.shift(),explicit=(doc.title||'').trim(),title=explicit||first?.text||'空白文稿';
  if(explicit&&first&&first.text!==explicit)blocks.unshift(first);
  const parts={title,body:blocks.map(item=>item.text).join(' ').slice(0,600),heading:!!first&&/^H[1-6]$/.test(first.el.tagName)&&(first.text===title||!explicit)};
  cardCache.set(doc,{content:doc.content,title:doc.title,parts});return parts;
}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.remove('hidden');clearTimeout(e.t);e.t=setTimeout(()=>e.classList.add('hidden'),1800)}
function focusActiveEditor(documentId=activeDoc?.id){
 if(!documentId||activeDoc?.id!==documentId||libraryWritesSuspended||libraryRestoreInProgress||document.body.inert||$('#editorWrap').classList.contains('hidden'))return false;
 if(window.qijianEditor?.enabled)window.qijianEditor.focus();else $('#editor').focus({preventScroll:true});
 return true;
}
function restoreFocusAfterDialog(context){
 if(libraryWritesSuspended||libraryRestoreInProgress||document.body.inert)return;
 if([...detachedDialogs.values()].some(popup=>!popup.closed&&popup.document.hasFocus()))return;
 const current=document.activeElement,editor=$('#editor');
 // Respect input or a document the user chose while the modeless window was open.
 if(current!==context.element&&current!==document.body&&!editor.contains(current))return;
 window.focus();
 if(current?.matches('input,textarea,select')){current.focus({preventScroll:true});return}
 if(activeDoc?.id===context.documentId)focusActiveEditor(context.documentId);
}
function patchDetachedNode(target,source){
 if(!target||target.nodeType!==source.nodeType||target.nodeName!==source.nodeName){const copy=source.cloneNode(true);if(target)target.replaceWith(copy);return copy}
 if(source.nodeType!==Node.ELEMENT_NODE){if(target.nodeValue!==source.nodeValue)target.nodeValue=source.nodeValue;return target}
 for(const attribute of [...target.attributes])if(!source.hasAttribute(attribute.name))target.removeAttribute(attribute.name);
 for(const attribute of source.attributes)if(target.getAttribute(attribute.name)!==attribute.value)target.setAttribute(attribute.name,attribute.value);
 const children=[...source.childNodes];for(let i=0;i<children.length;i++){const child=target.childNodes[i];if(child)patchDetachedNode(child,children[i]);else target.appendChild(children[i].cloneNode(true))}
 while(target.childNodes.length>children.length)target.lastChild.remove();
 if(source.matches('input,textarea,select')){if(target.value!==source.value)target.value=source.value;if('checked'in source)target.checked=source.checked}
 return target;
}
const detachedDialogs=new Map();
function closeDetachedDialog(id){const popup=detachedDialogs.get(id);if(!popup||popup.closed)return;popup.__qijianClosing=true;popup.close();detachedDialogs.delete(id);document.getElementById(id)?.style.removeProperty('display')}
function openDetachedDialog(id,{title='栖简',width=760,height=600,left=null,top=null,closeSelector=''}={}){
 const source=document.getElementById(id);if(!source)return null;let popup=detachedDialogs.get(id);if(popup&&!popup.closed){popup.focus();return popup}
 if(new URLSearchParams(location.search).has('embeddedTest'))return null;
 const returnFocus={documentId:activeDoc?.id,element:document.activeElement};
 const uiScale=window.QijianDisplay?.get().uiScale||1;width=Math.min(Math.round(width*uiScale),screen.availWidth);height=Math.min(Math.round(height*uiScale),screen.availHeight);
 const placement=`${Number.isFinite(left)?`,left=${Math.round(left)}`:''}${Number.isFinite(top)?`,top=${Math.round(top)}`:''}`;popup=window.open('about:blank',`qijian-${id}`,`popup=yes,width=${width},height=${height}${placement},resizable=yes,scrollbars=yes`);if(!popup)return null;detachedDialogs.set(id,popup);
 const links=[...document.querySelectorAll('link[rel="stylesheet"]')].map(link=>`<link rel="stylesheet" href="${link.href}">`).join('');popup.document.open();popup.document.write(`<!doctype html><html><head><meta charset="UTF-8"><title>${esc(title)}</title>${links}<style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:var(--paper,#fff)}body>.detached-mount{width:100%;height:100%;display:grid}.detached-mount>section,.detached-mount>aside{position:relative!important;inset:auto!important;left:auto!important;top:auto!important;right:auto!important;bottom:auto!important;transform:none!important;box-sizing:border-box!important}.detached-mount>.tool-panel,.detached-mount>.mindmap-window{display:flex!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;border-radius:0!important}.detached-mount>.settings-dialog{display:grid!important;width:100%!important;height:100%!important;min-height:0!important;font:12px/1.35 "Microsoft YaHei","Segoe UI",sans-serif!important;border-radius:0!important}.detached-mount>.settings-dialog *{font-family:"Microsoft YaHei","Segoe UI",sans-serif!important}.detached-mount>.settings-dialog .settings-nav button,.detached-mount>.settings-dialog .settings-fields label,.detached-mount>.settings-dialog .settings-fields input,.detached-mount>.settings-dialog .settings-fields select{font-size:12px!important}.detached-mount>.settings-dialog .settings-page h1{font-size:17px!important}.detached-mount>.settings-dialog .theme-choices button{font-size:10px!important}.detached-mount>.settings-dialog .theme-preview{height:138px!important;padding:14px 16px!important;font-size:14px!important;line-height:1.55!important}.detached-mount>.settings-dialog .theme-preview-heading{font-size:17px!important}.detached-mount>.settings-dialog .theme-preview-level,.detached-mount>.settings-dialog .theme-preview-mode{font-size:10px!important}.detached-mount>.table-editor-dialog,.detached-mount>.formula-editor-dialog,.detached-mount>.image-export-dialog,.detached-mount>.name-dialog{display:grid!important;width:100%!important;height:100%!important;min-height:0!important;padding:0!important;background:transparent!important}.detached-mount .formula-editor-card,.detached-mount .table-editor-card,.detached-mount .image-export-shell{width:100%!important;height:100%!important;max-height:none!important;border-radius:0!important}.detached-mount>.word-stats{display:block!important;align-self:stretch!important;justify-self:stretch!important;width:100%!important;height:100%!important;margin:0!important;padding:7px 9px 8px!important;border-radius:0!important}.detached-mount>.word-stats .word-stat{padding:5px 0 4px!important}.detached-mount>.word-stats .word-stat strong{font-size:15px!important;line-height:1.15!important}.detached-mount>.word-stats .word-stat span{font-size:10px!important;line-height:1.15!important}.formula-editor-card>header,.table-editor-card>header,.image-export-top,.settings-drag-handle,.panel-head,.mindmap-window-head,.word-stats,.name-dialog-card h2{-webkit-app-region:drag}.detached-mount button,.detached-mount input,.detached-mount select,.detached-mount textarea,.mindmap-window-body{-webkit-app-region:no-drag}</style></head><body><main class="detached-mount"></main></body></html>`);popup.document.close();
 let syncing=false,closing=false,scheduled=false;const controls='button,input,select,textarea,[data-close],[data-map-action]';
 const fitDetachedMindmap=()=>{const panel=popup.document.querySelector('.mindmap-window'),svg=panel?.querySelector('svg'),body=panel?.querySelector('.mindmap-window-body');if(!svg||!body)return;const mapWidth=Number(svg.dataset.mapWidth||420),mapHeight=Number(svg.dataset.mapHeight||260),zoom=Math.max(.45,Math.min(1,(body.clientWidth-20)/mapWidth,(body.clientHeight-20)/mapHeight));source.mapZoom=zoom;svg.style.width=mapWidth*zoom+'px';svg.style.height=mapHeight*zoom+'px';panel.querySelector('[data-map-zoom]')?.replaceChildren(popup.document.createTextNode(Math.round(zoom*100)+'%'));requestAnimationFrame(()=>{body.scrollLeft=Math.max(0,(svg.clientWidth-body.clientWidth)/2);body.scrollTop=Math.max(0,(svg.clientHeight-body.clientHeight)/2)})};
 const render=()=>{if(closing||popup.closed)return;scheduled=false;syncing=true;popup.document.documentElement.style.cssText=document.documentElement.style.cssText;popup.document.body.dataset.theme=document.body.dataset.theme||'';for(const property of document.body.style)if(property.startsWith('--'))popup.document.body.style.setProperty(property,document.body.style.getPropertyValue(property));const mount=popup.document.querySelector('.detached-mount'),scrollSelectors=['#versionList','.history-preview','#settingsGeneral','#settingsAdvanced','#settingsTheme','#settingsStorage'],scrollState=scrollSelectors.map(selector=>{const element=mount.querySelector(selector);return [selector,element?.scrollLeft||0,element?.scrollTop||0]});const clone=source.cloneNode(true);clone.classList.remove('hidden');clone.removeAttribute('style');[...clone.querySelectorAll(controls)].forEach((node,index)=>node.dataset.detachedControl=String(index));if(mount.firstChild)patchDetachedNode(mount.firstChild,clone);else mount.appendChild(clone);scrollState.forEach(([selector,left,top])=>{const element=mount.querySelector(selector);if(element){element.scrollLeft=left;element.scrollTop=top}});if(source.classList.contains('mindmap-window')&&popup.__qijianFitMap)requestAnimationFrame(fitDetachedMindmap);if(source.classList.contains('image-export-dialog'))requestAnimationFrame(()=>fitImageExportPreview(popup.document));syncing=false};
 const localEditor=()=>popup.document.activeElement?.matches?.('input,textarea,select');
 const schedule=()=>{if(scheduled||closing||popup.closed||localEditor())return;if(source.classList.contains('hidden')){closing=true;popup.close();return}scheduled=true;setTimeout(render,0)};render();const observer=new MutationObserver(schedule);observer.observe(source,{subtree:true,childList:true,characterData:true,attributes:true});
 const originalControl=target=>{const control=target.closest?.('[data-detached-control]');if(!control)return null;return source.querySelectorAll(controls)[Number(control.dataset.detachedControl)]||null};
 for(const type of ['input','change'])popup.document.addEventListener(type,event=>{if(syncing)return;const original=originalControl(event.target);if(!original)return;if('value'in original)original.value=event.target.value;if('checked'in original)original.checked=event.target.checked;original.dispatchEvent(new Event(type,{bubbles:true}))});
 popup.document.addEventListener('focusout',event=>{if(event.target.matches?.('input,textarea,select'))setTimeout(schedule,0)});
 popup.document.addEventListener('keydown',event=>{const original=originalControl(event.target);if(!original||!['Enter','Escape'].includes(event.key))return;event.preventDefault();original.dispatchEvent(new KeyboardEvent('keydown',{key:event.key,code:event.code,bubbles:true,cancelable:true}));if(source.classList.contains('hidden')){closing=true;popup.close()}else schedule()});
 popup.document.addEventListener('wheel',event=>{if(!event.ctrlKey||!source.classList.contains('mindmap-window'))return;event.preventDefault();source.querySelector('.mindmap-window-body')?.dispatchEvent(new WheelEvent('wheel',{deltaY:event.deltaY,ctrlKey:true,bubbles:true,cancelable:true}));schedule()},{passive:false});
 popup.document.addEventListener('click',async event=>{const local=event.target.closest?.('[data-detached-control]');if(local?.matches('input,textarea,select'))return;const original=originalControl(event.target);if(!original)return;event.preventDefault();const mapAction=local?.dataset.mapAction;if(source.classList.contains('mindmap-window')&&mapAction==='fit'){popup.__qijianFitMap=true;fitDetachedMindmap();return}if(source.classList.contains('mindmap-window')&&mapAction==='fullscreen'){await window.qijian.toggleDetachedFullscreen(title);popup.__qijianFitMap=true;original.click();setTimeout(()=>{schedule();setTimeout(fitDetachedMindmap,30)},180);return}if(typeof original.click==='function')original.click();else original.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));if(source.classList.contains('hidden')||!source.isConnected){closing=true;popup.close()}else schedule()});
 popup.addEventListener('resize',()=>{if(source.classList.contains('mindmap-window')&&popup.__qijianFitMap)setTimeout(fitDetachedMindmap,30);if(source.classList.contains('image-export-dialog'))setTimeout(()=>fitImageExportPreview(popup.document),30)});
 popup.addEventListener('beforeunload',()=>{observer.disconnect();detachedDialogs.delete(id);source.style.removeProperty('display');if(!closing&&!popup.__qijianClosing){closing=true;const closer=closeSelector&&source.querySelector(closeSelector);if(closer)closer.click();else source.classList.add('hidden')}setTimeout(()=>restoreFocusAfterDialog(returnFocus),0)});source.style.display='none';popup.focus();return popup
}
window.openDetachedDialog=openDetachedDialog;
window.closeDetachedDialog=closeDetachedDialog;
async function init(){window.qijian.startupProgress(68,'正在读取本地文稿');const r=await window.qijian.loadLibrary();library=r.data;libraryRoot=r.root;library.settings={theme:'paper',fontFamily:'system',fontSize:19,lineHeight:1.75,paragraphSpacing:10,pageWidth:920,readingSpeed:284,...library.settings};const legacyFont=library.settings.fontFamily||'system';if(!library.settings.latinFont)library.settings.latinFont=['times','arial','georgia','mono'].includes(legacyFont)?legacyFont:'system';if(!library.settings.chineseFont)library.settings.chineseFont=['serif','kai','heiti','fangsong','yahei'].includes(legacyFont)?legacyFont:'system';window.qijian.startupProgress(78,'正在检查文稿结构');const normalizedCount=await normalizeStoredDocuments();window.qijian.startupProgress(88,'正在恢复上次界面');setupAdvancedSettings();setupThemeChoices();bind();await setupWritingPreferences();await window.QijianDisplay.setup();settings();select(library.activeId);render();if(normalizedCount)persist();window.qijian.startupProgress(96,'正在准备编辑器');}
function node(id){return library.nodes.find(n=>n.id===id)}
function docs(){let a=library.nodes.filter(n=>n.type==='document'&&(filter==='trash'?n.deletedAt:!n.deletedAt));if(filter==='trash')a=a.filter(n=>activeFolder?n.parentId===activeFolder:!n.parentId||!node(n.parentId)?.deletedAt);else if(activeFolder&&!query)a=a.filter(n=>n.parentId===activeFolder);if(query)a=a.filter(n=>(n.title+' '+preview(n)+' '+textOf(n.content)).toLowerCase().includes(query));if(filter==='recent')a.sort((x,y)=>(y.updatedAt||'').localeCompare(x.updatedAt||''));else if(filter==='trash')a.sort((x,y)=>(y.deletedAt||'').localeCompare(x.deletedAt||''));else a.sort((x,y)=>(x.order||0)-(y.order||0));return a}
function editorContentForStorage(){if(window.qijianEditor?.enabled)return window.qijianEditor.getHTML();const clone=$('#editor').cloneNode(true);clone.querySelectorAll('[data-qijian-transient-block]').forEach(node=>node.remove());normalizeLegacyMarkTokens(clone);clone.querySelectorAll('.editor-formula').forEach(formula=>{const render=document.createElement('span');render.className='formula-render';formula.replaceChildren(render);formula.removeAttribute('style')});return clone.innerHTML}
function syncActiveDoc(){if(!activeDoc)return false;const content=editorContentForStorage(),contentJson=window.qijianEditor?.enabled?window.qijianEditor.getJSON():null,jsonChanged=contentJson&&JSON.stringify(activeDoc.contentJson)!==JSON.stringify(contentJson);if(activeDoc.content===content&&!jsonChanged)return false;activeDoc.content=content;if(contentJson)activeDoc.contentJson=contentJson;activeDoc.updatedAt=now();return true}
function pruneHistoryVersions(doc,at=Date.now()){if(!doc||doc.type!=='document')return false;const versions=Array.isArray(doc.versions)?doc.versions:[],cutoff=at-historyRetentionMs,kept=versions.filter(version=>{const time=Date.parse(version.at||'');return !Number.isFinite(time)||time>=cutoff}).sort((a,b)=>(b.at||'').localeCompare(a.at||''));const changed=kept.length!==versions.length||doc.versions!==versions;doc.versions=kept;if(kept.length<versions.length)pendingImageCleanup.add(doc.id);return changed}
function updateSessionHistory(doc){if(!doc||doc.type!=='document'||doc.deletedAt)return false;pruneHistoryVersions(doc);const versions=doc.versions,current=doc.content||'',session=versions.find(version=>version.sessionId===historySessionId),previous=versions.find(version=>version!==session);if(session&&previous?.content===current){doc.versions=versions.filter(version=>version!==session);return true}if(session){if(session.content===current)return false;session.content=current;session.at=now();doc.versions.sort((a,b)=>(b.at||'').localeCompare(a.at||''));return true}if(previous?.content===current)return false;versions.unshift({id:uid(),at:now(),content:current,sessionId:historySessionId});return true}
function flushPendingSessionHistory(){let changed=false,refresh=false;for(const docId of [...pendingHistoryDocIds]){pendingHistoryDocIds.delete(docId);const doc=node(docId);if(updateSessionHistory(doc)){changed=true;if(activeDoc?.id===docId)refresh=true}}if(refresh)renderVersions();return changed}
function currentImageDocumentId(){return activeDoc?.id||''}
function imageSourcesInDocument(value,sources=new Set(),key=''){
 if(typeof value==='string'){
  if(key==='src'&&value.trim())sources.add(value);
  for(const match of value.matchAll(/<img\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1/gi))sources.add(match[2].replace(/&amp;/g,'&'));
 }else if(Array.isArray(value))value.forEach(child=>imageSourcesInDocument(child,sources));
 else if(value&&typeof value==='object')for(const [childKey,child] of Object.entries(value))imageSourcesInDocument(child,sources,childKey);
 return sources;
}
function rewriteDocumentImages(value,map,key=''){
 if(typeof value==='string'){
  if(key==='src')return map.get(value)||value;
  return value.replace(/(<img\b[^>]*\bsrc\s*=\s*)(["'])([^"']+)\2/gi,(match,prefix,quote,source)=>{
   const target=map.get(source)||map.get(source.replace(/&amp;/g,'&'));
   return target?prefix+quote+target+quote:match;
  });
 }
 if(Array.isArray(value))value.forEach((child,index)=>value[index]=rewriteDocumentImages(child,map));
 else if(value&&typeof value==='object')for(const childKey of Object.keys(value))value[childKey]=rewriteDocumentImages(value[childKey],map,childKey);
 return value;
}
async function prepareDocumentImages(doc){
 const sources=[...imageSourcesInDocument(doc)];
 if(!sources.length)return;
 const replacements=await window.qijian.adoptImageSources(sources,'',doc.id);
 rewriteDocumentImages(doc,new Map(replacements.replacements));
}
function applySavedImageReplacements(replacements,documentReplacements=[]){
 const groups=documentReplacements.length?documentReplacements:library.nodes.filter(item=>item.type==='document').map(item=>({documentId:item.id,replacements:replacements||[]}));
 for(const item of groups){
  if(!item.replacements?.length)continue;
  const owner=node(item.documentId);if(!owner)continue;
  const map=new Map(item.replacements);rewriteDocumentImages(owner,map);
  if(activeDoc?.id===owner.id&&window.qijianEditor?.enabled){
   window.qijianEditor.replaceImageSources(map);
   owner.content=editorContentForStorage();owner.contentJson=window.qijianEditor.getJSON();
  }
 }
}
let lastImageFailureKey='';
async function drainSaves(){
 while(saveRequested&&!libraryWritesSuspended){
  saveRequested=false;
  const revision=Number(library.writeRevision)||0;
  // Snapshot only the request being sent. Later requests share one pending flag.
  const snapshot=JSON.parse(JSON.stringify(library)),cleanupDocumentIds=[...pendingImageCleanup];pendingImageCleanup.clear();
  try{
   const result=await window.qijian.saveLibrary(snapshot,{cleanupDocumentIds,protectedImageSources:cleanupDocumentIds.length?[...imageSourcesInDocument(library),...(activeDoc?(window.qijianEditor?.getRetainedImageSources?.()||[]):[])]:[]});
   if(result?.skipped){cleanupDocumentIds.forEach(id=>pendingImageCleanup.add(id));if(result.reason==='library-restored')throw new Error('文稿库已恢复，请重新打开栖简后继续编辑');continue}
   applySavedImageReplacements(result?.imageReplacements,result?.documentImageReplacements);
   if(Number(library.writeRevision)===revision){library.savedAt=result.savedAt;const failures=result.imageFailures||[];$('#saveState').textContent=failures.length?`文字已保存 · ${failures.length} 张图片异常`:'已保存';const failureKey=failures.map(item=>item.source).sort().join('|');if(failureKey&&failureKey!==lastImageFailureKey)toast('部分图片缺失或未完成入库，请检查图片来源');lastImageFailureKey=failureKey}
   renderDocs();
  }catch(error){cleanupDocumentIds.forEach(id=>pendingImageCleanup.add(id));saveRequested=false;$('#saveState').textContent='保存失败';console.error('保存失败',error);toast('保存失败，请检查文稿库');throw error}
 }
}
function flushSave({throwOnError=false}={}){
 if(libraryWritesSuspended)return Promise.resolve({skipped:true});clearTimeout(saveTimer);
 if(syncActiveDoc()&&activeDoc)pendingHistoryDocIds.add(activeDoc.id);flushPendingSessionHistory();saveRequested=true;
 if(!saveDrain){saveDrain=Promise.resolve().then(drainSaves).finally(()=>{saveDrain=null});saveQueue=saveDrain.catch(()=>{});}
 return throwOnError?saveDrain:saveQueue;
}
function persist(history=false){if(libraryWritesSuspended)return;library.writeRevision=(Number(library.writeRevision)||0)+1;$('#saveState').textContent='保存中';clearTimeout(saveTimer);saveTimer=setTimeout(flushSave,350);if(history&&activeDoc)pendingHistoryDocIds.add(activeDoc.id)}
function requestFolderName(title,value=''){return new Promise(resolve=>{const dialog=$('#nameDialog'),input=$('#nameDialogInput');$('#nameDialogTitle').textContent=title;input.value=value;dialog.classList.remove('hidden');input.focus();input.select();const finish=result=>{dialog.classList.add('hidden');input.onkeydown=null;$('#nameDialogConfirm').onclick=null;$('#nameDialogCancel').onclick=null;resolve(result)};$('#nameDialogConfirm').onclick=()=>{const name=input.value.trim();if(!name){input.focus();return}finish(name)};$('#nameDialogCancel').onclick=()=>finish(null);input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#nameDialogConfirm').click()}else if(e.key==='Escape')finish(null)};openDetachedDialog('nameDialog',{title,width:400,height:210,closeSelector:'#nameDialogCancel'})})}
function createDoc(parentId=activeFolder){if(parentId&&node(parentId)?.deletedAt)parentId=null;if(filter==='trash'){filter='all';navState()}const d={id:uid(),type:'document',title:'',parentId,order:Date.now(),createdAt:now(),updatedAt:now(),deletedAt:null,content:'<p><br></p>',contentJson:null,versions:[]};library.nodes.push(d);activeFolder=parentId;select(d.id);persist();render();$('#editor').focus()}
async function createFolder(parentId=activeFolder){const title=await requestFolderName('新建文件夹','新建文件夹');if(!title)return;if(parentId&&node(parentId)?.deletedAt)parentId=null;if(filter==='trash'){filter='all';navState()}const folder={id:uid(),type:'folder',title,parentId,order:Date.now(),createdAt:now(),deletedAt:null};library.nodes.push(folder);if(parentId)collapsedFolderIds.delete(parentId);persist();render();toast('文件夹已创建');return folder}
function updateEmptyState(){const empty=!activeDoc;$('#editorWrap').classList.toggle('hidden',empty);$('#emptyState').classList.toggle('hidden',!empty);if(empty){$('#emptyStateText').textContent='没有选中的文稿';$('#emptyCreateDoc').classList.toggle('hidden',filter==='trash')}}
function resetEditorUndoHistory(){if(window.qijianEditor?.enabled){window.qijianEditor.resetHistory();return}const editor=$('#editor');editor.blur();editor.contentEditable='false';void editor.offsetHeight;editor.contentEditable='true'}
function select(id,{focus=false}={}){if(activeDoc?.id===id){renderDocs();updateEmptyState();if(focus)focusActiveEditor(id);return}if(syncActiveDoc())persist(true);$('#mindmapWindows').replaceChildren();const d=node(id);activeDoc=d?.type==='document'&&!d.deletedAt?d:null;library.activeId=activeDoc?.id||null;updateEmptyState();if(activeDoc){if(window.qijianEditor?.enabled){window.qijianEditor.setContent(activeDoc.content||'<p><br></p>',activeDoc.contentJson);activeDoc.contentJson=window.qijianEditor.getJSON()}else{$('#editor').innerHTML=activeDoc.content||'<p><br></p>';$('#editor').querySelectorAll('p>ul,p>ol').forEach(list=>list.parentElement.replaceWith(list));$('#editor').querySelectorAll('ul,ol').forEach(list=>list.classList.add('outline-list'));const normalized=!!normalizeLegacyMarkTokens($('#editor'))|!!window.normalizeEditorImages?.()|!!window.normalizeEditorTables?.()|!!window.normalizeEditorFormulas?.();if(normalized)syncActiveDoc();resetEditorUndoHistory()}requestAnimationFrame(numbers);renderOutline();renderVersions()}else{clearHistoryPreview();$('#outlineView').replaceChildren();if(!window.qijianEditor?.enabled)resetEditorUndoHistory()}renderDocs();updateWordStats();if(focus)focusActiveEditor(id)}
function selectFolder(folderId,deleted=false){activeFolder=folderId;filter=deleted?'trash':'all';query='';$('#search').value='';navState();if(deleted){select(null);render();return}const latest=library.nodes.filter(item=>item.type==='document'&&!item.deletedAt&&item.parentId===folderId).sort((a,b)=>(b.updatedAt||b.createdAt||'').localeCompare(a.updatedAt||a.createdAt||''))[0];select(latest?.id||null,{focus:true});render()}
function render(){renderFolders();renderTrashFolders();renderDocs();counts()}
function folderRow(folder,depth,deleted=false){
  const folders=library.nodes.filter(n=>n.type==='folder'&&!!n.deletedAt===deleted);
  const children=folders.some(n=>n.parentId===folder.id);
  const closed=(deleted?collapsedTrashFolderIds:collapsedFolderIds).has(folder.id);
  const row=document.createElement('button');
  row.className=`folder-row ${deleted?'trash-folder-row ':''}${activeFolder===folder.id&&(deleted?filter==='trash':filter!=='trash')?'active':''}`;
  row.dataset.nodeId=folder.id;
  row.style.setProperty('--tree-depth',depth);
  row.innerHTML=`<span class="folder-chevron ${children?'':'empty'}" aria-hidden="true">${children?(closed?'▸':'▾'):''}</span><span class="folder-icon">${folderGlyph}</span><span class="rail-label">${esc(folder.title)}</span>`;
  row.onclick=e=>{
    if(e.target.closest('.folder-chevron')&&children){const set=deleted?collapsedTrashFolderIds:collapsedFolderIds;closed?set.delete(folder.id):set.add(folder.id);deleted?renderTrashFolders():renderFolders();return}
    selectFolder(folder.id,deleted);
  };
  row.onkeydown=e=>{if(children&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();const set=deleted?collapsedTrashFolderIds:collapsedFolderIds;e.key==='ArrowLeft'?set.add(folder.id):set.delete(folder.id);deleted?renderTrashFolders():renderFolders()}};
  if(!deleted)row.ondblclick=()=>renameFolder(folder);
  row.oncontextmenu=e=>{e.preventDefault();openItemContext(e,folder)};
  makeDraggable(row,folder);
  deleted?makeTrashFolderDropTarget(row,folder):makeDropTarget(row,folder.id);
  return row;
}
function renderFolders(){
  const root=$('#folderTree');root.innerHTML='';
  const folders=library.nodes.filter(n=>n.type==='folder'&&!n.deletedAt),seen=new Set();
  function add(parent,depth){folders.filter(f=>f.parentId===parent).sort((a,b)=>(a.order||0)-(b.order||0)).forEach(f=>{
    if(seen.has(f.id))return;seen.add(f.id);
    root.appendChild(folderRow(f,depth));
    if(!collapsedFolderIds.has(f.id))add(f.id,depth+1);
  })}
  add(null,0);
}
function renderTrashFolders(){
  const root=$('#trashFolderTree');root.innerHTML='';
  const folders=library.nodes.filter(n=>n.type==='folder'&&n.deletedAt);
  const chevron=$('.trash-chevron');chevron.textContent=folders.length?(trashExpanded?'▾':'▸'):'';
  chevron.classList.toggle('empty',!folders.length);
  root.classList.toggle('hidden',!trashExpanded||!folders.length);
  if(!trashExpanded)return;
  const seen=new Set();
  function add(parent,depth){folders.filter(f=>parent===null?!f.parentId||!node(f.parentId)?.deletedAt:f.parentId===parent).sort((a,b)=>(a.order||0)-(b.order||0)).forEach(f=>{
    if(seen.has(f.id))return;seen.add(f.id);
    root.appendChild(folderRow(f,depth+1,true));
    if(!collapsedTrashFolderIds.has(f.id))add(f.id,depth+1);
  })}
  add(null,0);
}
function renderDocs(){
 const root=$('#docList');if(root.__filter!==filter||root.__library!==library){root.replaceChildren();root.__filter=filter;root.__library=library}
 const existing=new Map([...root.children].map(card=>[card.dataset.nodeId,card]));let next=root.firstElementChild;
 for(const d of docs()){
  const c=existing.get(d.id)||document.createElement('div');existing.delete(d.id);
  c.classList.add('doc-card');c.classList.toggle('active',activeDoc?.id===d.id);c.dataset.nodeId=d.id;
  const parts=d.type==='folder'?null:cardParts(d);
  const html=parts?`<div class="doc-title ${parts.heading?'is-heading':''}">${esc(parts.title.slice(0,300))}</div><p>${esc(parts.body)}</p><time>${time(d.updatedAt||d.createdAt)}</time>`:`<p><span class="folder-icon">${folderGlyph}</span>${esc(d.title)}</p><time>文件夹 · ${time(d.deletedAt)}</time>`;
  if(c.__cardHtml!==html){c.innerHTML=html;c.__cardHtml=html}
  if(c.__document!==d||c.__filter!==filter){
   c.__document=d;c.__filter=filter;
   c.onclick=()=>{if(filter==='trash')return;if(d.type==='folder'){activeFolder=d.id;render()}else select(d.id,{focus:true})};c.oncontextmenu=e=>{e.preventDefault();openItemContext(e,d)};
   makeDraggable(c,d);if(filter!=='trash'&&d.type==='document')makeReorderTarget(c,d);
  }
  if(c!==next)root.insertBefore(c,next);next=c.nextElementSibling;
 }
 existing.forEach(card=>card.remove());counts();
}
function counts(){$('#allCount').textContent=library.nodes.filter(n=>n.type==='document'&&!n.deletedAt).length;$('#trashCount').textContent=library.nodes.filter(n=>n.deletedAt).length}
function navState(){$$('.folders nav button').forEach(b=>{const matches=b.dataset.filter===filter;const atRoot=b.dataset.filter!=='all'||activeFolder===null;b.classList.toggle('active',matches&&atRoot)});$('.sidebar-search').classList.toggle('active',filter==='search')}
function descendants(d){const result=[];const visit=(parent)=>library.nodes.filter(n=>n.parentId===parent).forEach(n=>{if(result.some(x=>x.id===n.id))return;result.push(n);visit(n.id)});visit(d.id);return result}
function trash(d=activeDoc){if(!d||d.deletedAt)return;const stamp=now(),children=d.type==='folder'?descendants(d):[];d.deletedAt=stamp;children.forEach(n=>{if(!n.deletedAt)n.deletedAt=stamp});if(activeDoc?.deletedAt)select(null);if(activeFolder===d.id||children.some(n=>n.id===activeFolder))activeFolder=null;if(d.type==='folder')trashExpanded=true;persist();render();toast('已移到废纸篓')}
function restore(d){const stamp=d.deletedAt;if(!stamp)return;d.deletedAt=null;if(d.type==='folder')descendants(d).forEach(n=>{if(n.deletedAt===stamp)n.deletedAt=null});if(d.parentId&&(!node(d.parentId)||node(d.parentId).deletedAt))d.parentId=null;filter='all';activeFolder=d.type==='folder'?d.id:d.parentId;navState();persist();render();if(d.type==='document')select(d.id);toast('已恢复')}
function permanent(d){if(!confirm(`永久删除${d.type==='folder'?'这个文件夹及其中的所有内容':'这篇文稿'}？此操作不可撤销。`))return;const ids=new Set([d.id,...(d.type==='folder'?descendants(d).map(x=>x.id):[])]);ids.forEach(id=>{if(node(id)?.type==='document')pendingImageCleanup.add(id)});library.nodes=library.nodes.filter(n=>!ids.has(n.id));if(activeDoc&&ids.has(activeDoc.id))select(null);if(ids.has(activeFolder))activeFolder=null;persist();render()}
async function renameFolder(d){const title=await requestFolderName('重命名文件夹',d.title);if(!title)return;d.title=title;persist();renderFolders()}
async function duplicateDoc(d){if(activeDoc?.id===d.id)syncActiveDoc();const copy={...JSON.parse(JSON.stringify(d)),id:uid(),parentId:d.parentId,order:Date.now(),createdAt:now(),updatedAt:now(),deletedAt:null,versions:[]};try{await prepareDocumentImages(copy)}catch(error){toast(error?.message||'图片入库失败，未复制文稿');return}library.nodes.push(copy);filter='all';activeFolder=copy.parentId;navState();persist();render();select(copy.id);toast('已复制文稿')}
function canMove(d,targetId){if(!d||d.id===targetId)return false;if(targetId===null)return true;const target=node(targetId);if(!target||target.type!=='folder'||target.deletedAt)return false;let cursor=target;const seen=new Set();while(cursor){if(cursor.id===d.id)return false;if(seen.has(cursor.id))return false;seen.add(cursor.id);cursor=node(cursor.parentId)}return true}
function moveNode(d,targetId){if(!canMove(d,targetId))return;const wasDeleted=!!d.deletedAt;if(wasDeleted)restore(d);d.parentId=targetId;d.order=Date.now();filter='all';activeFolder=targetId;navState();persist();render();toast(wasDeleted?'已恢复并移动':'已移动')}
function moveDocumentToFolder(documentNode,targetId){
 if(!documentNode||documentNode.type!=='document'||documentNode.deletedAt||!canMove(documentNode,targetId)||documentNode.parentId===targetId)return false;
 syncActiveDoc();documentNode.parentId=targetId;const siblings=library.nodes.filter(item=>item.type==='document'&&!item.deletedAt&&item.parentId===targetId&&item.id!==documentNode.id);documentNode.order=Math.max(0,...siblings.map(item=>Number(item.order)||0))+1;persist();renderFolders();renderDocs();counts();toast(targetId?'已移到“'+node(targetId).title+'”':'已移到全部文稿');return true
}
function reorderDoc(source,target,event,afterOverride){if(!source||!target||source.id===target.id||source.type!=='document'||target.type!=='document'||source.deletedAt||target.deletedAt)return;source.parentId=target.parentId;const siblings=library.nodes.filter(n=>n.type==='document'&&!n.deletedAt&&n.parentId===target.parentId).sort((a,b)=>(a.order||0)-(b.order||0));const rest=siblings.filter(n=>n.id!==source.id);let index=rest.findIndex(n=>n.id===target.id);if(index<0)return;const after=typeof afterOverride==='boolean'?afterOverride:event.clientY>event.currentTarget.getBoundingClientRect().top+event.currentTarget.offsetHeight/2;if(after)index++;rest.splice(index,0,source);rest.forEach((n,i)=>n.order=i+1);persist();renderDocs();toast('顺序已调整')}
function clearDropCues(){$$('.drop-target,.drop-before,.drop-after').forEach(x=>x.classList.remove('drop-target','drop-before','drop-after'))}
function edgePosition(event,element){const r=element.getBoundingClientRect(),y=(event.clientY-r.top)/Math.max(1,r.height);return y<.27?'before':y>.73?'after':'inside'}
function reorderFolder(source,target,after,deleted=false){
  if(!source||!target||source.type!=='folder'||target.type!=='folder'||source.id===target.id||!!source.deletedAt!==deleted||!!target.deletedAt!==deleted)return;
  if(!deleted&&!canMove(source,target.parentId))return;
  if(deleted){let parent=node(target.parentId);while(parent){if(parent.id===source.id)return;parent=node(parent.parentId)}}
  source.parentId=target.parentId;
  const siblings=library.nodes.filter(n=>n.type==='folder'&&!!n.deletedAt===deleted&&n.parentId===target.parentId&&n.id!==source.id).sort((a,b)=>(a.order||0)-(b.order||0));
  const index=siblings.findIndex(n=>n.id===target.id);
  siblings.splice(index+(after?1:0),0,source);
  siblings.forEach((n,i)=>n.order=i+1);
  persist();render();toast('顺序已调整');
}
function makeDraggable(element,item){element.dataset.dragNodeId=item.id;if(item.type==='document'){element.draggable=false;element.classList.add('pointer-draggable');return}element.draggable=true;element.addEventListener('dragstart',event=>{dragNodeId=item.id;event.dataTransfer.setData('text/plain',item.id);event.dataTransfer.effectAllowed='move';const ghost=document.createElement('canvas');ghost.width=ghost.height=1;event.dataTransfer.setDragImage(ghost,0,0);element.classList.add('dragging')});element.addEventListener('dragend',()=>{dragNodeId=null;element.classList.remove('dragging');clearDropCues()})}
function dragged(event){return node(dragNodeId||event.dataTransfer?.getData('text/plain'))}
function makeDropTarget(element,folderId){
  element.addEventListener('dragover',event=>{
    const item=dragged(event),target=folderId?node(folderId):null;
    if(!canMove(item,folderId))return;
    event.preventDefault();event.stopPropagation();clearDropCues();
    const edge=target&&item?.type==='folder'&&!item.deletedAt?edgePosition(event,element):'inside';
    element.classList.add(edge==='inside'?'drop-target':edge==='before'?'drop-before':'drop-after');
  });
  element.addEventListener('dragleave',event=>{if(!element.contains(event.relatedTarget))element.classList.remove('drop-target','drop-before','drop-after')});
  element.addEventListener('drop',event=>{
    event.preventDefault();event.stopPropagation();
    const item=dragged(event),target=folderId?node(folderId):null,edge=element.classList.contains('drop-before')?'before':element.classList.contains('drop-after')?'after':'inside';
    clearDropCues();dragNodeId=null;
    if(target&&item?.type==='folder'&&edge!=='inside')reorderFolder(item,target,edge==='after');
    else if(item)moveNode(item,folderId);
  });
}
function makeTrashFolderDropTarget(element,folder){
  const allowed=item=>{if(!item||item.id===folder.id)return false;let parent=folder;const seen=new Set();while(parent){if(parent.id===item.id||seen.has(parent.id))return false;seen.add(parent.id);parent=node(parent.parentId)}return true};
  element.addEventListener('dragover',event=>{
    const item=dragged(event);if(!allowed(item))return;
    event.preventDefault();event.stopPropagation();clearDropCues();
    const edge=item.type==='folder'&&item.deletedAt?edgePosition(event,element):'inside';
    element.classList.add(edge==='inside'?'drop-target':edge==='before'?'drop-before':'drop-after');
  });
  element.addEventListener('dragleave',event=>{if(!element.contains(event.relatedTarget))element.classList.remove('drop-target','drop-before','drop-after')});
  element.addEventListener('drop',event=>{
    event.preventDefault();event.stopPropagation();const item=dragged(event),edge=element.classList.contains('drop-before')?'before':element.classList.contains('drop-after')?'after':'inside';
    clearDropCues();dragNodeId=null;if(!allowed(item))return;
    if(item.type==='folder'&&item.deletedAt&&edge!=='inside'){reorderFolder(item,folder,edge==='after',true);return}
    if(!item.deletedAt)trash(item);
    item.parentId=folder.id;filter='trash';activeFolder=folder.id;trashExpanded=true;navState();persist();render();toast('已移入废纸篓文件夹');
  });
}
function makeReorderTarget(element,target){
  element.addEventListener('dragover',event=>{const item=dragged(event);if(!item||item.type!=='document'||item.deletedAt)return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';clearDropCues();if(item.id===target.id)return;const r=element.getBoundingClientRect();element.classList.add(event.clientY<r.top+r.height/2?'drop-before':'drop-after')});
  element.addEventListener('dragleave',event=>{if(!element.contains(event.relatedTarget))element.classList.remove('drop-before','drop-after')});
  element.addEventListener('drop',event=>{event.preventDefault();clearDropCues();const item=dragged(event);dragNodeId=null;reorderDoc(item,target,event)});
}
function bindDocumentDropZone(){
  const list=$('#docList');
  let pointerDrag=null,pointerSourceCard=null,pointerTargetCard=null,pointerAfter=false,pointerFolderTarget=null,pointerFolderTargetId=null,pointerFolderTargetSet=false,folderExpandTimer=null,hoverExpandId=null;
  const clearFolderTarget=()=>{clearTimeout(folderExpandTimer);folderExpandTimer=null;hoverExpandId=null;pointerFolderTarget?.classList.remove('drop-target');pointerFolderTarget=null;pointerFolderTargetId=null;pointerFolderTargetSet=false};
  const setFolderTarget=(element,targetId)=>{if(pointerFolderTarget===element&&pointerFolderTargetSet){element.classList.add('drop-target');return}clearFolderTarget();pointerFolderTarget=element;pointerFolderTargetId=targetId;pointerFolderTargetSet=true;element.classList.add('drop-target');if(targetId&&collapsedFolderIds.has(targetId)){hoverExpandId=targetId;folderExpandTimer=setTimeout(()=>{if(hoverExpandId!==targetId)return;collapsedFolderIds.delete(targetId);renderFolders();pointerFolderTarget=$(`#folderTree .folder-row[data-node-id="${targetId}"]`);pointerFolderTarget?.classList.add('drop-target')},650)}};
  list.addEventListener('pointerdown',event=>{const card=event.target.closest('.doc-card.pointer-draggable');if(!card||event.button!==0)return;pointerDrag={id:card.dataset.nodeId,startX:event.clientX,startY:event.clientY};pointerSourceCard=card});
  window.addEventListener('pointermove',event=>{if(!pointerDrag)return;if(!dragNodeId&&Math.hypot(event.clientX-pointerDrag.startX,event.clientY-pointerDrag.startY)<6)return;if(!dragNodeId){dragNodeId=pointerDrag.id;pointerSourceCard?.classList.add('dragging')}const source=node(pointerDrag.id),hit=document.elementFromPoint(event.clientX,event.clientY),folderRow=hit?.closest?.('.folder-row:not(.trash-folder-row)'),allButton=hit?.closest?.('.folders nav>button[data-filter="all"]');clearDropCues();if(source?.type==='document'&&!source.deletedAt&&(folderRow||allButton)){const targetId=folderRow?.dataset.nodeId||null;if(source.parentId!==targetId&&canMove(source,targetId)){pointerTargetCard=null;setFolderTarget(folderRow||allButton,targetId);event.preventDefault();return}}clearFolderTarget();if(hit?.closest?.('.folders')||!hit?.closest?.('#documents')){pointerTargetCard=null;return}const cards=[...list.querySelectorAll('.doc-card')].filter(card=>card!==pointerSourceCard);if(!cards.length)return;pointerTargetCard=cards.find(card=>{const rect=card.getBoundingClientRect();return event.clientY>=rect.top&&event.clientY<=rect.bottom})||cards.reduce((best,card)=>Math.abs(event.clientY-(card.getBoundingClientRect().top+card.getBoundingClientRect().height/2))<Math.abs(event.clientY-(best.getBoundingClientRect().top+best.getBoundingClientRect().height/2))?card:best,cards[0]);const rect=pointerTargetCard.getBoundingClientRect();pointerAfter=event.clientY>=rect.top+rect.height/2;pointerTargetCard.classList.add(pointerAfter?'drop-after':'drop-before');event.preventDefault()},{passive:false});
  const finishPointerDocDrag=event=>{if(!pointerDrag)return;const source=node(pointerDrag.id),target=pointerTargetCard&&node(pointerTargetCard.dataset.nodeId),didDrag=!!dragNodeId,folderTargetSet=pointerFolderTargetSet,folderTargetId=pointerFolderTargetId;pointerSourceCard?.classList.remove('dragging');if(didDrag&&source&&folderTargetSet)moveDocumentToFolder(source,folderTargetId);else if(didDrag&&source&&target)reorderDoc(source,target,{clientY:event.clientY,currentTarget:pointerTargetCard},pointerAfter);dragNodeId=null;pointerDrag=null;pointerSourceCard=null;pointerTargetCard=null;clearFolderTarget();clearDropCues()};
  window.addEventListener('pointerup',finishPointerDocDrag);window.addEventListener('pointercancel',finishPointerDocDrag);
  const chooseTarget=event=>{
    const source=dragged(event);
    if(!source||source.type!=='document'||source.deletedAt||filter==='trash')return null;
    const cards=[...list.querySelectorAll('.doc-card')].filter(card=>card.dataset.nodeId!==source.id);
    if(!cards.length)return null;
    const hovered=event.target.closest?.('.doc-card');
    const targetCard=hovered&&hovered.dataset.nodeId!==source.id?hovered:cards.reduce((best,card)=>Math.abs(event.clientY-(card.getBoundingClientRect().top+card.getBoundingClientRect().height/2))<Math.abs(event.clientY-(best.getBoundingClientRect().top+best.getBoundingClientRect().height/2))?card:best,cards[0]);
    const rect=targetCard.getBoundingClientRect();
    return {source,targetCard,target:node(targetCard.dataset.nodeId),after:event.clientY>=rect.top+rect.height/2};
  };
  list.addEventListener('dragenter',event=>{if(chooseTarget(event)){event.preventDefault();event.dataTransfer.dropEffect='move'}},true);
  list.addEventListener('dragover',event=>{
    const placement=chooseTarget(event);if(!placement)return;
    event.preventDefault();event.stopImmediatePropagation();event.dataTransfer.dropEffect='move';clearDropCues();
    docDropTargetId=placement.target.id;docDropAfter=placement.after;
    placement.targetCard.classList.add(placement.after?'drop-after':'drop-before');
  },true);
  list.addEventListener('dragleave',event=>{if(!list.contains(event.relatedTarget)){docDropTargetId=null;clearDropCues()}},true);
  list.addEventListener('drop',event=>{
    const placement=chooseTarget(event),target=node(docDropTargetId)||placement?.target;if(!placement||!target)return;
    event.preventDefault();event.stopImmediatePropagation();const source=placement.source,after=docDropTargetId?docDropAfter:placement.after;
    dragNodeId=null;docDropTargetId=null;clearDropCues();reorderDoc(source,target,event,after);
  },true);
}
function openItemContext(event,item){const popup=$('#itemContext');popup.innerHTML='';const add=(label,callback,danger=false)=>{const b=document.createElement('button');b.textContent=label;if(danger)b.className='danger';b.onclick=()=>{popup.classList.add('hidden');callback()};popup.appendChild(b)};if(item.deletedAt){add('恢复',()=>restore(item));add('永久删除',()=>permanent(item),true)}else if(item.type==='folder'){add('新建文稿',()=>createDoc(item.id));add('新建子文件夹',()=>createFolder(item.id));add('重命名',()=>renameFolder(item));add('移到废纸篓',()=>trash(item),true)}else{add('复制文稿',()=>duplicateDoc(item));add('导出图片 (PNG)',()=>{select(item.id);action('png')});add('历史版本',()=>{if(activeDoc?.id!==item.id)select(item.id);openTool('versions')});add('字数统计',()=>openWordStats(item));add('移到废纸篓',()=>trash(item),true)}popup.style.left=`${Math.min(event.clientX,window.innerWidth-190)}px`;popup.style.top=`${Math.min(event.clientY,window.innerHeight-180)}px`;popup.classList.remove('hidden')}
function time(v){return v?new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v)):''}
function numbers(){
  const editor=$('#editor'),gutter=$('#lineNumbers'),wrap=$('#editorWrap');
  if(!activeDoc||wrap.classList.contains('hidden')){gutter.replaceChildren();$('#mindmapButtons').replaceChildren();return}
  const selector='p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,aside,div,img';
  const isBlock=element=>['block','list-item','flow-root','flex','grid','table'].includes(getComputedStyle(element).display);
  const hasOwnLine=element=>[...element.childNodes].some(child=>{
    if(child.nodeType===Node.TEXT_NODE)return !!child.textContent.trim();
    if(child.nodeType!==Node.ELEMENT_NODE)return false;
    return !isBlock(child);
  });
  const wrapTop=wrap.getBoundingClientRect().top,readingFactor=window.QijianDisplay?.readingFactor()||1;
  const positions=[...editor.querySelectorAll(selector)].flatMap(block=>{
    let markerBlock=block;
    if(block.tagName==='LI'){
      const ownTextBlock=[...block.children].find(child=>/^(P|H[1-6]|BLOCKQUOTE|PRE|ASIDE)$/.test(child.tagName));
      if(ownTextBlock)markerBlock=ownTextBlock;
    }
    const style=getComputedStyle(markerBlock),rect=markerBlock.getBoundingClientRect();
    if(style.display==='none'||style.visibility==='hidden'||rect.height<1)return [];
    if(block.classList.contains('image-row')||block.classList.contains('table-block')||block.classList.contains('formula-block'))return [(rect.top-wrapTop)/readingFactor+(parseFloat(getComputedStyle(editor).lineHeight)/2||16)];
    if(block.closest('.image-row'))return [];
    if(!block.textContent.trim()&&!block.querySelector('img,svg,video')&&block.tagName!=='HR')return [];
    if(block.tagName==='IMG'&&block.closest('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,aside,div'))return [];
    if(block.tagName!=='LI'&&block.closest('li'))return [];
    if(markerBlock===block&&[...block.children].some(isBlock)&&!hasOwnLine(block))return [];
    const fontSize=parseFloat(style.fontSize)||19;
    const lineHeight=parseFloat(style.lineHeight)||fontSize*1.75;
    const paddingTop=parseFloat(style.paddingTop)||0;
    const borderTop=parseFloat(style.borderTopWidth)||0;
    return [(rect.top-wrapTop)/readingFactor+paddingTop+borderTop+lineHeight/2];
  }).sort((a,b)=>a-b);
  const unique=positions.filter((y,i)=>!i||Math.abs(y-positions[i-1])>2);
  gutter.replaceChildren(...unique.map((y,i)=>{
    const span=document.createElement('span');
    span.textContent=String(i+1);
    span.style.top=`${y}px`;
    return span;
  }));
  renderMindmapButtons(wrapTop)
}
function scheduleEditorRefresh({outline=false,mindmap=false}={}){
 editorRefreshOutline=editorRefreshOutline||outline;editorRefreshMindmap=editorRefreshMindmap||mindmap;
 if(editorRefreshTimer)return;
 editorRefreshTimer=setTimeout(()=>{editorRefreshTimer=null;const updateOutline=editorRefreshOutline,updateMindmap=editorRefreshMindmap;editorRefreshOutline=false;editorRefreshMindmap=false;requestAnimationFrame(()=>{numbers();if(updateOutline&&!$('#toolPanel').classList.contains('hidden')&&!$('#outlineView').classList.contains('hidden'))renderOutline();if(updateMindmap&&$('#mindmapWindows').children.length)refreshMindmapWindows()})},70)
}
function headings(){return activeDoc?[...$('#editor').querySelectorAll('h1,h2,h3')].map((e,i)=>({e,text:e.textContent||'未命名标题',level:+e.tagName[1],id:`h-${i}`})):[]}
function renderOutline(){const v=$('#outlineView');v.innerHTML='';const hs=headings();if(!hs.length)v.innerHTML='<p>正文中还没有标题。</p>';hs.forEach(h=>{const b=document.createElement('button');b.className=`l${h.level}`;b.textContent=h.text;b.onclick=()=>{h.e.scrollIntoView({behavior:'smooth',block:'center'});closeTools()};v.appendChild(b)})}
function outlineLists(){return [...$('#editor').children].filter(child=>child.tagName==='UL'&&child.previousElementSibling?.tagName!=='UL')}
function outlineGroupLists(list){const group=[list];while(list.nextElementSibling?.tagName===list.tagName){list=list.nextElementSibling;group.push(list)}return group}
function renderMindmapButtons(wrapTop){
 const host=$('#mindmapButtons');host.replaceChildren();
 outlineLists().forEach((list,index)=>{
  const first=[...list.children].find(child=>child.tagName==='LI');if(!first)return;
  const style=getComputedStyle(first),lineHeight=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.75;
  const button=document.createElement('button');button.type='button';button.className='mindmap-toggle';button.dataset.outlineIndex=index;button.title='打开这个大纲的思维导图';button.setAttribute('aria-label','打开第'+(index+1)+'个大纲的思维导图');
  button.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h5m3-5h5m-5 10h5M8 10l3-5m-3 5 3 5"/><circle cx="3" cy="10" r="1.4"/><circle cx="16" cy="5" r="1.4"/><circle cx="16" cy="15" r="1.4"/></svg>';
  button.style.top=((first.getBoundingClientRect().top-wrapTop)/(window.QijianDisplay?.readingFactor()||1)+lineHeight/2-10.5)+'px';
  button.onclick=()=>openMindmapForOutline(index);host.appendChild(button)
 })
}
function mindmapTopic(item){
 const content=[...item.childNodes].filter(child=>child.nodeType===Node.TEXT_NODE||child.nodeType===Node.ELEMENT_NODE&&!['UL','OL'].includes(child.tagName));
 return content.map(child=>{if(child.nodeType===Node.TEXT_NODE)return child.textContent;const clone=child.cloneNode(true);if(clone.classList?.contains('editor-formula'))return clone.dataset.latex||'';clone.querySelectorAll?.('.editor-formula').forEach(formula=>formula.replaceChildren(document.createTextNode(formula.dataset.latex||'')));return clone.textContent}).join(' ').replace(/\s+/g,' ').trim()||'未命名主题'
}
function mindmapTitle(list,index){
 let previous=list.previousElementSibling;while(previous&&!/^H[1-6]$/.test(previous.tagName))previous=previous.previousElementSibling;
 return previous?.textContent.trim()||activeDoc?.title||('大纲 '+(index+1))
}
function wrapMindmapText(text,maxWidth=210,maxLines=5){
 const canvas=wrapMindmapText.canvas||(wrapMindmapText.canvas=document.createElement('canvas')),context=canvas.getContext('2d'),family=getComputedStyle($('#editor')).fontFamily||'sans-serif';context.font=`12px ${family}`;
 const characters=[...text],lines=[];let line='',consumed=0;
 for(;consumed<characters.length;consumed++){const character=characters[consumed];if(context.measureText(line+character).width<=maxWidth||!line){line+=character;continue}lines.push(line.trimEnd());if(lines.length===maxLines){line='';break}line=character===' '?'':character}
 if(lines.length<maxLines&&line)lines.push(line.trimEnd());
 const complete=consumed===characters.length;if(!complete&&lines.length){let last=lines.at(-1);while(last&&context.measureText(last+'…').width>maxWidth)last=last.slice(0,-1);lines[lines.length-1]=(last||'')+'…'}
 return{lines:lines.length?lines:['未命名主题'],width:Math.min(maxWidth,Math.max(...lines.map(item=>context.measureText(item).width))),truncated:!complete}
}
function renderMindmapSvg(svg,list,panel=svg.closest('.mindmap-window')){
 const NS='http://www.w3.org/2000/svg',collapsed=panel?.mapCollapsed||(panel.mapCollapsed=new Set()),roots=[];
 const readList=current=>[...current.children].filter(item=>item.tagName==='LI').map(item=>{const children=[...item.children].filter(child=>['UL','OL'].includes(child.tagName)).flatMap(readList);return{item,text:mindmapTopic(item),children,image:item.querySelector(':scope>img,:scope>.image-row img')?.src||''}});
 outlineGroupLists(list).forEach(part=>roots.push(...readList(part)));
 const index=outlineLists().indexOf(list),synthetic=roots.length!==1,root=synthetic?{item:null,text:mindmapTitle(list,index),children:roots,synthetic:true}:roots[0];
 svg.replaceChildren();if(!root)return;
 const visible=[],depthGap=54,branchGap=18;
 const measure=node=>{const wrapped=wrapMindmapText(node.text,node.synthetic?230:210,node.synthetic?4:5);node.lines=wrapped.lines;node.truncated=wrapped.truncated;node.w=Math.max(node.synthetic?116:92,wrapped.width+(node.synthetic?30:28));node.h=18+node.lines.length*18+(node.image?42:0);node.hidden=collapsed.has(node.item);if(!node.hidden)node.children.forEach(measure)};
 measure(root);
 const branchHeight=node=>{const children=node.hidden?[]:node.children;if(!children.length)return node.branchH=node.h;children.forEach(branchHeight);const childrenHeight=children.reduce((sum,child)=>sum+child.branchH,0)+branchGap*(children.length-1);return node.branchH=Math.max(node.h,childrenHeight)};
 const alignSiblingWidths=node=>{const children=node.hidden?[]:node.children;if(children.length){const siblingWidth=Math.max(...children.map(child=>child.w));children.forEach(child=>{child.w=siblingWidth;alignSiblingWidths(child)})}};
 alignSiblingWidths(root);
 const place=(node,depth,top)=>{node.depth=depth;node.cy=top+node.branchH/2;const children=node.hidden?[]:node.children;if(children.length){const childrenHeight=children.reduce((sum,child)=>sum+child.branchH,0)+branchGap*(children.length-1);let childTop=top+(node.branchH-childrenHeight)/2;children.forEach(child=>{place(child,depth+1,childTop);childTop+=child.branchH+branchGap})}visible.push(node)};
 branchHeight(root);place(root,0,26);visible.sort((a,b)=>a.depth-b.depth||a.cy-b.cy);
 const levelWidths=[];visible.forEach(node=>levelWidths[node.depth]=Math.max(levelWidths[node.depth]||0,node.w));const levelX=[28];for(let depth=1;depth<levelWidths.length;depth++)levelX[depth]=levelX[depth-1]+levelWidths[depth-1]+depthGap;visible.forEach(node=>{node.x=levelX[node.depth];node.y=node.cy-node.h/2});
 const content=document.createElementNS(NS,'g');content.setAttribute('class','mindmap-content');svg.appendChild(content);
 visible.forEach(parent=>(parent.hidden?[]:parent.children).filter(child=>visible.includes(child)).forEach(child=>{const link=document.createElementNS(NS,'path'),startX=parent.x+parent.w,endX=child.x,mid=startX+(endX-startX)*.48;link.setAttribute('class','map-link level-'+Math.min(child.depth,5));link.setAttribute('d',`M${startX} ${parent.cy} C${mid} ${parent.cy},${mid} ${child.cy},${endX} ${child.cy}`);content.appendChild(link)}));
 visible.forEach(node=>{const group=document.createElementNS(NS,'g'),box=document.createElementNS(NS,'rect');group.setAttribute('class','map-node level-'+Math.min(node.depth,5)+(node.synthetic?' map-root':''));group.setAttribute('transform',`translate(${node.x} ${node.y})`);group.setAttribute('tabindex','0');box.setAttribute('width',node.w);box.setAttribute('height',node.h);box.setAttribute('rx',node.synthetic?10:7);group.appendChild(box);
  const title=document.createElementNS(NS,'title');title.textContent=node.text;group.appendChild(title);const textHeight=node.lines.length*18,textTop=Math.max(0,(node.h-(textHeight+(node.image?42:0)))/2);node.lines.forEach((line,lineIndex)=>{const text=document.createElementNS(NS,'text');text.setAttribute('x',node.synthetic?14:12);text.setAttribute('y',textTop+14+lineIndex*18);text.textContent=line;group.appendChild(text)});
  if(node.image){const image=document.createElementNS(NS,'image');image.setAttribute('href',node.image);image.setAttribute('x',12);image.setAttribute('y',20+node.lines.length*18);image.setAttribute('width',Math.min(58,node.w-24));image.setAttribute('height',36);image.setAttribute('preserveAspectRatio','xMidYMid slice');image.setAttribute('class','map-image');group.appendChild(image)}
  if(node.children.length&&!node.synthetic){const control=document.createElementNS(NS,'g'),circle=document.createElementNS(NS,'circle'),mark=document.createElementNS(NS,'text');control.setAttribute('class','map-collapse');control.setAttribute('data-map-action','collapse');control.setAttribute('transform',`translate(${node.w} ${node.h/2})`);circle.setAttribute('r','8');mark.setAttribute('text-anchor','middle');mark.setAttribute('y','4');mark.textContent=node.hidden?'+':'−';control.append(circle,mark);control.onclick=event=>{event.stopPropagation();node.hidden?collapsed.delete(node.item):collapsed.add(node.item);renderMindmapSvg(svg,list,panel)};group.appendChild(control)}
  group.onclick=()=>{if(!node.item)return;node.item.scrollIntoView({behavior:'smooth',block:'center'});node.item.classList.add('mindmap-source-flash');setTimeout(()=>node.item?.classList.remove('mindmap-source-flash'),900)};content.appendChild(group)});
 const width=Math.max(420,...visible.map(node=>node.x+node.w+28)),height=Math.max(260,...visible.map(node=>node.y+node.h+28));svg.dataset.mapWidth=width;svg.dataset.mapHeight=height;svg.setAttribute('viewBox',`0 0 ${width} ${height}`);setMindmapZoom(panel,panel?.mapZoom||1,false)
}
function setMindmapZoom(panel,zoom,center=true){if(!panel)return;const svg=panel.querySelector('svg'),body=panel.querySelector('.mindmap-window-body'),old=panel.mapZoom||1;panel.mapZoom=Math.max(.45,Math.min(2.2,zoom));svg.style.width=(Number(svg.dataset.mapWidth||420)*panel.mapZoom)+'px';svg.style.height=(Number(svg.dataset.mapHeight||260)*panel.mapZoom)+'px';panel.querySelector('[data-map-zoom]')?.replaceChildren(document.createTextNode(Math.round(panel.mapZoom*100)+'%'));if(center&&body){const ratio=panel.mapZoom/old;body.scrollLeft=(body.scrollLeft+body.clientWidth/2)*ratio-body.clientWidth/2;body.scrollTop=(body.scrollTop+body.clientHeight/2)*ratio-body.clientHeight/2}}
function fitMindmap(panel){const svg=panel.querySelector('svg'),body=panel.querySelector('.mindmap-window-body'),width=Number(svg.dataset.mapWidth||420),height=Number(svg.dataset.mapHeight||260);setMindmapZoom(panel,Math.min(1.35,(body.clientWidth-24)/width,(body.clientHeight-24)/height),false);body.scrollLeft=Math.max(0,(svg.clientWidth-body.clientWidth)/2);body.scrollTop=Math.max(0,(svg.clientHeight-body.clientHeight)/2)}
function toggleMindmapFullscreen(panel,force){
 const fullscreen=force??!panel.classList.contains('mindmap-fullscreen'),button=panel.querySelector('[data-map-action="fullscreen"]');panel.classList.toggle('mindmap-fullscreen',fullscreen);button.textContent=fullscreen?'↙':'↗';button.title=fullscreen?'还原悬浮窗口':'全屏显示';button.setAttribute('aria-label',button.title);requestAnimationFrame(()=>fitMindmap(panel))
}
let floatingZ=140;
function enableFloatingDrag(panel,handle){
 handle.addEventListener('pointerdown',event=>{
  if(event.button!==0||event.target.closest('button')||panel.classList.contains('mindmap-fullscreen'))return;
  const rect=panel.getBoundingClientRect(),dx=event.clientX-rect.left,dy=event.clientY-rect.top;
  panel.style.transform='none';panel.style.left=rect.left+'px';panel.style.top=rect.top+'px';panel.style.right='auto';panel.style.bottom='auto';
  panel.style.zIndex=String(++floatingZ);handle.setPointerCapture(event.pointerId);
  const move=e=>{panel.style.left=Math.max(0,Math.min(innerWidth-panel.offsetWidth,e.clientX-dx))+'px';panel.style.top=Math.max(29,Math.min(innerHeight-panel.offsetHeight,e.clientY-dy))+'px'};
  const stop=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',stop);handle.removeEventListener('pointercancel',stop)};
  handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',stop);handle.addEventListener('pointercancel',stop)
 })
}
function openMindmapForOutline(index){
 const list=outlineLists()[index];if(!list){toast('当前文稿没有这个大纲');return}
 const host=$('#mindmapWindows');let panel=[...host.children].find(child=>Number(child.dataset.outlineIndex)===index);
 if(!panel){panel=document.createElement('section');panel.className='mindmap-window';panel.dataset.outlineIndex=index;panel.innerHTML='<div class="mindmap-window-head"><span></span><div class="mindmap-window-tools"><button type="button" data-map-action="minus" aria-label="缩小">−</button><span data-map-zoom>100%</span><button type="button" data-map-action="plus" aria-label="放大">+</button><button type="button" data-map-action="fit" aria-label="适应窗口">适应</button><button type="button" data-map-action="fullscreen" title="全屏显示" aria-label="全屏显示">↗</button><button type="button" data-map-action="close" aria-label="关闭思维导图">×</button></div></div><div class="mindmap-window-body"><svg aria-label="大纲思维导图"></svg></div>';host.appendChild(panel);
  const offset=host.children.length-1;panel.style.left=Math.max(8,innerWidth-panel.offsetWidth-32-offset*28)+'px';panel.style.top=(55+offset*28)+'px';
  panel.mapCollapsed=new Set();panel.mapZoom=1;panel.querySelector('[data-map-action="close"]').onclick=()=>panel.remove();panel.querySelector('[data-map-action="minus"]').onclick=()=>setMindmapZoom(panel,panel.mapZoom-.15);panel.querySelector('[data-map-action="plus"]').onclick=()=>setMindmapZoom(panel,panel.mapZoom+.15);panel.querySelector('[data-map-action="fit"]').onclick=()=>fitMindmap(panel);panel.querySelector('[data-map-action="fullscreen"]').onclick=()=>toggleMindmapFullscreen(panel);panel.querySelector('.mindmap-window-body').addEventListener('wheel',event=>{if(!event.ctrlKey)return;event.preventDefault();setMindmapZoom(panel,panel.mapZoom*(event.deltaY<0?1.1:.9))},{passive:false});enableFloatingDrag(panel,panel.querySelector('.mindmap-window-head'))
 }
 panel.outlineRoot=list;panel.querySelector('.mindmap-window-head span').textContent='思维导图 · 大纲 '+(index+1);
 panel.id=`mindmapWindow${index}`;panel.style.zIndex=String(++floatingZ);renderMindmapSvg(panel.querySelector('svg'),list,panel);requestAnimationFrame(()=>{fitMindmap(panel);openDetachedDialog(panel.id,{title:`思维导图 · 大纲 ${index+1}`,width:960,height:700,closeSelector:'[data-map-action="close"]'})})
}
function refreshMindmapWindows(){
 const lists=outlineLists(),seen=new Set();[...$('#mindmapWindows').children].forEach(panel=>{const list=panel.outlineRoot?lists.find(root=>outlineGroupLists(root).includes(panel.outlineRoot)):lists[Number(panel.dataset.outlineIndex)];if(!list||seen.has(list))panel.remove();else{seen.add(list);panel.outlineRoot=list;const index=lists.indexOf(list);panel.dataset.outlineIndex=index;panel.querySelector('.mindmap-window-head>span').textContent='思维导图 · 大纲 '+(index+1);renderMindmapSvg(panel.querySelector('svg'),list,panel)}})
}
function openCurrentMindmap(){
 const selection=getSelection();let list=selection?.anchorNode?.nodeType===Node.ELEMENT_NODE?selection.anchorNode:selection?.anchorNode?.parentElement;
 list=list?.closest?.('ul,ol');while(list?.parentElement?.closest('ul,ol'))list=list.parentElement.closest('ul,ol');
 const index=outlineLists().findIndex(root=>outlineGroupLists(root).includes(list));openMindmapForOutline(index>=0?index:0)
}
function historyTime(value){if(!value)return '';return new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)).replaceAll('/','-')}
function historyContent(id){if(!activeDoc)return '';if(id==='current')return editorContentForStorage();return (activeDoc.versions||[]).find(version=>version.id===id)?.content||''}
function renderHistoryPreview(content){const preview=$('#versionPreviewContent');preview.innerHTML=content||'<p><br></p>';preview.querySelectorAll('[contenteditable]').forEach(item=>item.removeAttribute('contenteditable'));window.normalizeEditorImages?.(preview);window.normalizeEditorTables?.(preview);window.normalizeEditorFormulas?.(preview)}
function selectHistoryVersion(id){
 const versions=activeDoc?.versions||[];historySelection=id==='current'||versions.some(version=>version.id===id)?id:'current';
 $$('#versionList .history-version').forEach(button=>button.classList.toggle('selected',button.dataset.versionId===historySelection));
 renderHistoryPreview(historyContent(historySelection));
 const historical=historySelection!=='current';$('#saveVersionAsNew').disabled=!historical;$('#restoreHistoryVersion').disabled=!historical;
}
function renderVersions(){
 if($('#toolPanel').classList.contains('hidden')||toolPanelMode!=='versions')return;
 const list=$('#versionList');if(!list)return;const listScrollTop=list.scrollTop;list.replaceChildren();
 if(!activeDoc){renderHistoryPreview('<p>请先选择文稿。</p>');$('#saveVersionAsNew').disabled=true;$('#restoreHistoryVersion').disabled=true;return}
 const add=(id,label,at,content)=>{const button=document.createElement('button');button.type='button';button.className='history-version';button.dataset.versionId=id;const words=countWords(textOf(content));button.innerHTML=id==='current'?`<strong>${label}</strong><span>${words.toLocaleString('zh-CN')} 字数</span>`:`<time>${historyTime(at)}</time><span>${words.toLocaleString('zh-CN')} 字数</span>`;button.onclick=()=>selectHistoryVersion(id);list.appendChild(button)};
 const current=editorContentForStorage();add('current','当前版本',activeDoc.updatedAt,current);(activeDoc.versions||[]).filter(version=>version.sessionId!==historySessionId).forEach(version=>add(version.id,'',version.at,version.content));
 selectHistoryVersion(historySelection);list.scrollTop=listScrollTop;
}
function selectedHistoryVersion(){return historySelection==='current'?null:(activeDoc?.versions||[]).find(version=>version.id===historySelection)||null}
async function saveHistoryVersionAsDocument(){
 const version=selectedHistoryVersion();if(!activeDoc||!version)return;
 const base=(activeDoc.title||cardParts(activeDoc).title||'未命名文稿').trim();const copy={id:uid(),type:'document',title:`${base}（历史版本）`,parentId:activeDoc.parentId,order:Date.now(),createdAt:now(),updatedAt:now(),deletedAt:null,content:version.content,versions:[]};
 try{await prepareDocumentImages(copy)}catch(error){toast(error?.message||'图片入库失败，未另存文稿');return}
 library.nodes.push(copy);persist();render();closeTools();select(copy.id);toast('历史版本已另存为新文稿');
}
function restoreSelectedHistoryVersion(){
 const version=selectedHistoryVersion();if(!activeDoc||!version)return;if(!confirm('将这个历史版本恢复为当前文稿？'))return;
 const current=editorContentForStorage();activeDoc.versions||=[];if(current!==version.content){const session=activeDoc.versions.find(item=>item.sessionId===historySessionId);if(session){session.sessionId=`${historySessionId}:before-restore:${uid()}`;session.content=current;session.at=now()}else if(activeDoc.versions[0]?.content!==current)activeDoc.versions.unshift({id:uid(),at:now(),content:current,sessionId:`${historySessionId}:before-restore:${uid()}`})}pruneHistoryVersions(activeDoc);
 activeDoc.content=version.content;activeDoc.contentJson=null;activeDoc.updatedAt=now();if(window.qijianEditor?.enabled){window.qijianEditor.setContent(version.content||'<p><br></p>',null);activeDoc.contentJson=window.qijianEditor.getJSON()}else{$('#editor').innerHTML=version.content||'<p><br></p>';$('#editor').querySelectorAll('ul,ol').forEach(list=>list.classList.add('outline-list'));normalizeLegacyMarkTokens($('#editor'));window.normalizeEditorImages?.();window.normalizeEditorTables?.();window.normalizeEditorFormulas?.();resetEditorUndoHistory()}historySelection='current';persist(true);renderDocs();renderOutline();renderVersions();requestAnimationFrame(numbers);toast('已恢复所选历史版本');
}
function openTool(tab){
 if(tab==='mindmap')return openCurrentMindmap();if(!activeDoc&&tab==='versions'){toast('请先选择文稿');return}
 if(toolPanelMode&&toolPanelMode!==tab)closeDetachedDialog('toolPanel');toolPanelMode=tab;
 if(tab==='versions')historySelection='current';const panel=$('#toolPanel');panel.dataset.toolMode=tab;panel.classList.toggle('versions-mode',tab==='versions');panel.classList.remove('hidden');$$('.tool-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));['outline','versions'].forEach(x=>$(`#${x}View`).classList.toggle('hidden',x!==tab));if(tab==='versions')renderVersions();else{clearHistoryPreview();renderOutline()}openDetachedDialog('toolPanel',{title:tab==='versions'?'历史版本':'大纲',width:tab==='versions'?840:460,height:tab==='versions'?600:520,closeSelector:'[data-close]'})
}
function clearHistoryPreview(){$('#versionPreviewContent').replaceChildren();$('#versionList').replaceChildren()}
function closeTools(){$('#toolPanel').classList.add('hidden');clearHistoryPreview();$('#outlineView').replaceChildren();closeDetachedDialog('toolPanel');requestAnimationFrame(numbers)}
function formatLibraryBytes(bytes){
  const units=['B','KB','MB','GB','TB'];let value=Math.max(0,Number(bytes)||0),index=0;
  while(value>=1024&&index<units.length-1){value/=1024;index++}
  return (index===0?String(Math.round(value)):value.toFixed(value>=100?0:1))+units[index];
}
function updateLibraryLocationView(){
  const target=pendingLibraryRoot||libraryRoot;
  const field=$('#libraryLocation');if(field)field.value=target||'';
  const note=$('#libraryLocationNote');if(note)note.textContent=pendingLibraryRoot?'关闭设置后将完整搬移到此位置。':'文稿、附件和备份都保存在这里。';
}
async function refreshLibraryStorageInfo(){
  const size=$('#libraryLocationSize');if(!size)return;
  size.textContent='正在计算…';
  try{const info=await window.qijian.libraryStorageInfo();size.textContent=formatLibraryBytes(info.bytes)+' · '+info.fileCount+' 个文件'}catch(_){size.textContent='容量暂不可用'}
}
function setupAdvancedSettings(){
  $('#settingsAdvanced').innerHTML='<h1>高级</h1><div class="advanced-fields"><label for="readingSpeed">阅读速度</label><input id="readingSpeed" type="number" min="1" max="2000" step="1"><span>字/分钟</span></div><p>用于估算字数统计中的阅读时长，默认 284 字/分钟。</p><div class="library-location-setting"><div class="library-location-head"><label for="libraryLocation">文稿库位置</label><span id="libraryLocationSize">正在计算…</span></div><div class="library-location-row"><input id="libraryLocation" readonly><button id="chooseLibraryLocation" type="button">选择新位置</button></div><p id="libraryLocationNote"></p></div><div id="libraryMigrationProgress" class="library-migration-progress hidden"><div><span id="libraryMigrationLabel">正在准备搬移</span><strong id="libraryMigrationValue">0%</strong></div><i><b id="libraryMigrationBar"></b></i></div>';
  $('#readingSpeed').value=library.settings.readingSpeed;
  updateLibraryLocationView();refreshLibraryStorageInfo();
  $('#chooseLibraryLocation').onclick=async()=>{
    if(libraryMigrating)return;
    const selected=await window.qijian.chooseLibraryLocation();
    if(!selected)return;
    pendingLibraryRoot=selected;updateLibraryLocationView();
  };
}function setLibraryMigrationProgress(progress={}){
  const percent=Math.max(0,Math.min(100,Number(progress.percent)||0));
  $('#libraryMigrationLabel').textContent=progress.label||'正在准备搬移';
  $('#libraryMigrationValue').textContent=Math.round(percent)+'%';
  $('#libraryMigrationBar').style.width=percent+'%';
}
async function closeSettings(){
  if(libraryMigrating)return;
  if(!pendingLibraryRoot||pendingLibraryRoot===libraryRoot){pendingLibraryRoot='';$('#settingsDialog').classList.add('hidden');closeDetachedDialog('settingsDialog');return}
  libraryMigrating=true;
  const progress=$('#libraryMigrationProgress'),button=$('#chooseLibraryLocation');
  progress.classList.remove('hidden');button.disabled=true;setLibraryMigrationProgress({percent:0,label:'正在保存当前文稿'});
  const stop=window.qijian.onLibraryMigrationProgress(setLibraryMigrationProgress);
  try{
    syncActiveDoc();clearTimeout(saveTimer);library.writeRevision=(Number(library.writeRevision)||0)+1;await flushSave();
    const result=await window.qijian.migrateLibrary(pendingLibraryRoot,library);
    const activeId=activeDoc?.id||library.activeId;
    const loaded=await window.qijian.loadLibrary();
    library=loaded.data;libraryRoot=loaded.root;pendingLibraryRoot='';activeDoc=null;
    select(activeId);render();settings();
    await refreshLibraryStorageInfo();
    $('#settingsDialog').classList.add('hidden');closeDetachedDialog('settingsDialog');
    toast(result.oldRemoved?'文稿库已搬移':'已切换新位置，请关闭占用旧文稿库的程序后重试清理');
  }catch(error){
    alert('文稿库搬移失败：'+error.message);
    updateLibraryLocationView();
  }finally{
    stop();libraryMigrating=false;button.disabled=false;progress.classList.add('hidden');
  }
}
function countWords(text){return(text.match(/\p{Script=Han}|[\p{L}\p{M}]+(?:[’'][\p{L}\p{M}]+)*|\p{N}+/gu)||[]).length}
function readableEditorText(fragment=$('#editor').cloneNode(true)){const holder=document.createElement('div');holder.style.cssText='position:fixed;left:-100000px;top:0;white-space:pre-wrap';holder.append(fragment);holder.querySelectorAll('.editor-formula').forEach(formula=>{const latex=formula.dataset.latex||'',display=formula.classList.contains('formula-block');formula.replaceWith(document.createTextNode(display?`\\[${latex}\\]`:`$${latex}$`))});document.body.appendChild(holder);const text=holder.innerText||holder.textContent||'';holder.remove();return text}
function wordStatText(){if(!activeDoc)return '';const selection=window.getSelection(),editor=$('#editor');if(selection&&!selection.isCollapsed&&editor.contains(selection.anchorNode)&&editor.contains(selection.focusNode))return readableEditorText(selection.getRangeAt(0).cloneContents());return readableEditorText()}
function updateWordStats(){if($('#wordStatsPanel').classList.contains('hidden')&&!detachedDialogs.has('wordStatsPanel'))return;const text=wordStatText(),words=countWords(text),chars=[...text.replace(/\s/gu,'')].length,speed=Math.max(1,Number(library?.settings?.readingSpeed)||284),seconds=Math.round(words*60/speed);$('#wordStatWords').textContent=words.toLocaleString('zh-CN');$('#wordStatChars').textContent=chars.toLocaleString('zh-CN');$('#wordStatTime').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`}
function openWordStats(doc){if(doc&&!doc.deletedAt&&activeDoc?.id!==doc.id)select(doc.id);closeDetachedDialog('wordStatsPanel');$('#wordStatsPanel').classList.remove('hidden');updateWordStats();openDetachedDialog('wordStatsPanel',{title:'字数统计',width:122,height:142,closeSelector:'#closeWordStats'})}
const lightBase={mode:'light','paper':'#fcfcfc','text':'#353b43','nav':'#e4e3df','list':'#f2f2ef','line':'#d7d9db','sel':'#e2e4e5','muted':'#9298a0','accent':'#1685b5','strong-ink':'#bd3e80','italic-ink':'#db9a14','annotation-ink':'#4e4e50','annotation-bg':'#fff0b9','code-ink':'#227d76','code-bg':'#e2f2ee','comment-ink':'#c58d98','strike-ink':'#a1a5a9'};
const darkBase={mode:'dark','paper':'#181a1b','text':'#e1e5e8','nav':'#111314','list':'#272a2b','line':'#505559','sel':'#41474b','muted':'#aab0b6','accent':'#4b9ee0','strong-ink':'#d59257','italic-ink':'#e0c976','annotation-ink':'#e0d4a8','annotation-bg':'#615c3e','code-ink':'#55b5ad','code-bg':'#2d3639','comment-ink':'#7894b5','strike-ink':'#718caf'};
const themePalettes={
 paper:{...lightBase,name:'Light'},
 'solarized-light':{...lightBase,name:'Solarized Light',paper:'#fdf6e3',nav:'#e4dcc6',list:'#f5eddc',text:'#47515b',accent:'#b74238','strong-ink':'#bf4b80','italic-ink':'#697eac','annotation-bg':'#ffe9a5','code-bg':'#a8d8d1','comment-ink':'#59a9ae'},
 'summer-rain':{...lightBase,name:'Summer Rain',paper:'#f3faf8',nav:'#dceae7',list:'#eff8f6',text:'#3d4b52',accent:'#288d92','strong-ink':'#7b91c8','italic-ink':'#db8c24','annotation-bg':'#dff2ee','code-bg':'#c9e9df','comment-ink':'#5a9ebe'},
 'ayu-light':{...lightBase,name:'Ayu Light',paper:'#fbfcfd',nav:'#e5e6e5',list:'#f7f7f6',accent:'#154c94','strong-ink':'#e07413','italic-ink':'#a87900','annotation-bg':'#e8f0ff','code-bg':'#dde7f1','comment-ink':'#b257dc'},
 'deep-sea':{...lightBase,name:'Deep Sea',paper:'#eff0f1',nav:'#dce4e8',list:'#f0f4f6',accent:'#183e6e','strong-ink':'#237c9d','italic-ink':'#d17c24','annotation-bg':'#cbece4','code-bg':'#d7e8f5','comment-ink':'#839735'},
 sepia:{...lightBase,name:'暖纸',paper:'#fffaf1',nav:'#ded2bf',list:'#f0e9dd',text:'#574d40',accent:'#a45a38','annotation-bg':'#f7e6b6'},
 dark:{...darkBase,name:'Dark'},
 'solarized-dark':{...darkBase,name:'Solarized Dark',paper:'#002b35',nav:'#00242c',list:'#10323b',accent:'#48a8b7','strong-ink':'#b9508d','italic-ink':'#cda662','annotation-bg':'#746c44','code-bg':'#0b4660','comment-ink':'#638e6d'},
 dracula:{...darkBase,name:'Dracula',paper:'#232425',nav:'#1b1d1e',list:'#303233',accent:'#5ab7bc','strong-ink':'#cd9159','italic-ink':'#d9c46e','annotation-bg':'#3f5c54','code-bg':'#434946','comment-ink':'#8b779c'},
 'ayu-dark':{...darkBase,name:'Ayu Dark',paper:'#202a39',nav:'#182230',list:'#273341',accent:'#36b8ce','strong-ink':'#ef9083','italic-ink':'#e4c34c','annotation-bg':'#767a70','code-bg':'#243a4d','comment-ink':'#a766d1'},
 nord:{...darkBase,name:'Nord',paper:'#2e3541',nav:'#252b35',list:'#333b47',accent:'#de9b80','strong-ink':'#9dbd8e','italic-ink':'#b58c9f','annotation-bg':'#645d4d','code-bg':'#404e62','comment-ink':'#94b2d7'}
};
function setupThemeChoices(){
 const host=$('.theme-choices');host.replaceChildren();
 for(const [id,palette] of Object.entries(themePalettes)){
  const button=document.createElement('button');button.dataset.themeChoice=id;button.title=palette.name;button.setAttribute('aria-label','使用 '+palette.name+' 主题');
  const preview=document.createElement('span');preview.className='theme-preview';
  for(const key of ['paper','text','accent','strong-ink','italic-ink','annotation-ink','annotation-bg','code-ink','code-bg','comment-ink'])preview.style.setProperty('--preview-'+key,palette[key]);
  const dark=palette.mode==='dark';preview.innerHTML='<span class="theme-preview-top"><span class="theme-preview-heading"><span class="theme-preview-level">H1</span>'+palette.name+'</span><span class="theme-preview-mode" aria-hidden="true">'+(dark?'☾':'☀')+'</span></span><span class="theme-preview-line">Lorem <b>**ipsum**</b> dolor <i>*sit amet*</i></span><span class="theme-preview-line"><mark>::consectetur::</mark> adipiscing elit, <code>'+String.fromCharCode(96)+'sed'+String.fromCharCode(96)+'</code></span><span class="theme-preview-line"><small>++eiusmod tempor++</small></span>';
  button.append(preview);host.appendChild(button)
 }
}
function applyTheme(id){
 const palette=themePalettes[id]||themePalettes.paper;
 for(const [key,value] of Object.entries(palette))if(key!=='name'&&key!=='mode')document.body.style.setProperty('--'+key,value)
}
function settings(){const s=library.settings,latin=QijianFonts.cssFontName(QijianFonts.latinFonts[s.latinFont]||QijianFonts.latinFonts.system),chinese=QijianFonts.cssFontName(QijianFonts.chineseFonts[s.chineseFont]||QijianFonts.chineseFonts.system);document.body.dataset.theme=s.theme;applyTheme(s.theme);document.documentElement.style.setProperty('--font-en',latin);document.documentElement.style.setProperty('--font-zh',chinese);document.documentElement.style.setProperty('--font',`${latin},${chinese},serif`);document.documentElement.style.setProperty('--size',`${s.fontSize}px`);document.documentElement.style.setProperty('--leading',s.lineHeight);document.documentElement.style.setProperty('--para',`${s.paragraphSpacing}px`);document.documentElement.style.setProperty('--width',`${s.pageWidth}px`);for(const [key,css] of [['heading1Size','--h1-size'],['heading2Size','--h2-size'],['heading3Size','--h3-size']])document.documentElement.style.setProperty(css,`${s[key]||{heading1Size:31,heading2Size:26,heading3Size:22}[key]}px`);['latinFont','chineseFont','fontSize','lineHeight','paragraphSpacing','pageWidth','heading1Size','heading2Size','heading3Size'].forEach(id=>{const input=$(`#${id}`);if(input)input.value=s[id]??{heading1Size:31,heading2Size:26,heading3Size:22}[id]});$$('[data-theme-choice]').forEach(b=>b.classList.toggle('selected',b.dataset.themeChoice===s.theme));requestAnimationFrame(numbers)}
function openSettings(tab='general'){$('#settingsDialog').classList.remove('hidden');$('#settingsDialog').style.zIndex=String(++floatingZ);settingsTab(tab);$('#menuPopup').classList.add('hidden');$('#edgebar').classList.remove('open');openDetachedDialog('settingsDialog',{title:'设置',width:760,height:560,closeSelector:'#closeSettings'})}
function settingsTab(tab){$$('[data-settings-tab]').forEach(b=>b.classList.toggle('active',b.dataset.settingsTab===tab));['general','advanced','theme','storage'].forEach(x=>$(`#settings${x[0].toUpperCase()+x.slice(1)}`).classList.toggle('hidden',x!==tab))}
async function createManualBackup(){
 if(libraryRestoreInProgress)return;
 try{await flushSave({throwOnError:true});const result=await window.qijian.backupLibrary();applySavedImageReplacements(result.imageReplacements,result.documentImageReplacements);if(result.missingImages?.length){const details=result.missingImages.map(item=>`《${item.title}》：${item.images.length} 张`).join('\n');alert('已备份现有文稿和能够读取的图片（已压缩，'+formatLibraryBytes(result.bytes)+'）。以下文稿的原图缺失，未包含在备份中；备份内已保留缺图清单和原引用：\n\n'+details)}else toast('压缩备份已完成（'+formatLibraryBytes(result.bytes)+'），上一份备份已覆盖')}
 catch(error){console.error('备份失败',error);toast(error?.message||'备份失败')}
}
function formatBackupTime(value){
 const date=new Date(value);
 if(!value||!Number.isFinite(date.getTime()))return '未记录';
 return new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date).replaceAll('/','-');
}
async function restoreManualBackup(){
 if(libraryRestoreInProgress)return;
 libraryRestoreInProgress=true;
 let bodies=[];
 try{
  const info=await window.qijian.backupLibraryInfo();
  const message='备份时间：'+formatBackupTime(info.createdAt)+'\n备份大小：'+formatLibraryBytes(info.bytes)+'（已压缩）\n\n恢复后，当前文稿会自动成为新的备份，可以再次恢复切换回来。备份不包含历史版本，确定继续吗？';
  if(!confirm(message)){libraryRestoreInProgress=false;return}
  bodies=[document.body,...[...detachedDialogs.values()].filter(popup=>!popup.closed).map(popup=>popup.document.body)].map(body=>({body,inert:body.inert}));
  bodies.forEach(({body})=>body.inert=true);
  // Finish current edits before capturing the state that becomes the swap backup.
  await flushSave({throwOnError:true});
  libraryWritesSuspended=true;
  clearTimeout(saveTimer);
  await saveQueue;
  await window.qijian.restoreLibraryBackup(info.backupId);
  clearTimeout(editorRefreshTimer);
  pendingHistoryDocIds.clear();
  pendingImageCleanup.clear();
  // Reload must not run the old library's normal close-time save.
  for(const id of [...detachedDialogs.keys()])closeDetachedDialog(id);
  location.reload();
 }catch(error){
  libraryWritesSuspended=false;
  libraryRestoreInProgress=false;
  bodies.forEach(({body,inert})=>{if(body.isConnected)body.inert=inert});
  console.error('恢复备份失败',error);toast(error?.message||'恢复备份失败');
 }
}
function menu(name,anchor){
  const menus={
    file:[['新建文稿','new'],['新建文件夹','folder'],['—'],['导入 Markdown / TXT…','import'],['—'],['导出 Markdown…','md'],['导出纯文本 (.txt)…','txt'],['导出 Word (.docx)…','docx'],['导出 PDF…','pdf'],['导出图片 (PNG)…','png'],['立即备份','backup'],['恢复备份','restoreBackup'],['—'],['设置','settings'],['移到废纸篓','trash']],
    edit:[['撤销','undo'],['重做','redo'],['—'],['全选','selectAll'],['—'],['拼写检查','spellcheck',spellcheckState?.enabled?'✓':''],['拼写检查语言…','spellcheckLanguages']],
    mark:[['清除文字格式','clearMark','Ctrl+L'],['—'],['一级标题','h1','Shift+Alt+1'],['二级标题','h2','Shift+Alt+2'],['三级标题','h3','Shift+Alt+3'],['四级标题','h4','Shift+Alt+4'],['五级标题','h5','Shift+Alt+5'],['六级标题','h6','Shift+Alt+6'],['分隔线','hr'],['—'],['加粗文字','bold','Ctrl+B'],['斜体文字','italic','Ctrl+I'],['高亮标注','annotation','Shift+Ctrl+M'],['删除线','strikeThrough','Ctrl+D'],['—'],['无序大纲','insertUnorderedList','Shift+Ctrl+7'],['编号大纲','insertOrderedList','Shift+Ctrl+8'],['引用块','blockquote','Ctrl+Q'],['—'],['插入公式','formula','Ctrl+Alt+E'],['添加评论','comment','Ctrl+Alt+M'],['注释块','note','Shift+Ctrl+5'],['—'],['行内代码','codeInline','Shift+Ctrl+C'],['代码块','pre','Ctrl+Alt+C'],['—'],['插入转义字符','escapeMark']],
    view:[['放大阅读','readingZoomIn'],['缩小阅读','readingZoomOut'],['恢复阅读 100%','readingZoomReset'],['—'],['大纲','outline'],['历史版本','versions'],['—'],['收起/展开目录','folders'],['收起/展开文稿列表','docs']],
    help:[['打开本地文稿库','library']]
  };
  const popup=$('#menuPopup');popup.innerHTML='';popup.dataset.menu=name;
  (menus[name]||[]).forEach(([label,act,shortcut])=>{
    if(label==='—'){popup.appendChild(document.createElement('hr'));return}
    const button=document.createElement('button'),title=document.createElement('span');
    title.textContent=label;button.appendChild(title);button.dataset.action=act;
    if(act==='spellcheck'){button.setAttribute('role','menuitemcheckbox');button.setAttribute('aria-checked',String(!!spellcheckState?.enabled))}
    if(shortcut){const hint=document.createElement('span');hint.className='menu-shortcut';hint.textContent=shortcut;button.appendChild(hint)}
    button.onmousedown=event=>event.preventDefault();
    button.onclick=()=>{popup.classList.add('hidden');action(act)};
    popup.appendChild(button);
  });
  popup.style.left=`${anchor.offsetLeft}px`;popup.classList.remove('hidden');
}
async function action(a){if(a==='readingZoomIn')return QijianDisplay.stepReading(1);if(a==='readingZoomOut')return QijianDisplay.stepReading(-1);if(a==='readingZoomReset')return QijianDisplay.configure({readingScale:1});if(a==='spellcheck')return toggleSpellcheck();if(a==='spellcheckLanguages')return openSpellcheckLanguages();if(window.qijianEditor?.enabled&&a==='undo')return window.qijianEditor.undo();if(window.qijianEditor?.enabled&&a==='redo')return window.qijianEditor.redo();if(window.qijianEditor?.enabled&&a==='selectAll')return window.qijianEditor.selectAll();if(['clearMark','annotation','comment','codeInline','escapeMark'].includes(a))return applyMarkAction(a);if(['bold','italic','strikeThrough'].includes(a))return insertSemanticMark(a);if(a==='formula')return openFormulaEditor();if(a==='new')return createDoc();if(a==='folder')return createFolder();if(a==='trash')return trash();if(a==='settings')return openSettings();if(a==='outline'||a==='mindmap'||a==='versions')return openTool(a);if(a==='folders')return toggleFolders();if(a==='docs')return toggleDocs();if(a==='library')return window.qijian.showLibrary();if(a==='backup'){if(!document.activeElement?.matches('input,textarea,select'))focusActiveEditor();return createManualBackup()}if(a==='restoreBackup')return restoreManualBackup();if(a==='import'){const x=await window.qijian.importMarkdown();if(x){const d={id:uid(),type:'document',title:x.title||'',parentId:activeFolder,order:Date.now(),createdAt:now(),updatedAt:now(),deletedAt:null,content:x.extension==='.txt'?x.text.split(/\r?\n/).map(line=>`<p>${esc(line)||'<br>'}</p>`).join(''):parseMarkdown(x.text),versions:[]};const holder=document.createElement('div');holder.innerHTML=d.content;try{await window.adoptImageElements(holder,x.baseDirectory,d.id)}catch(error){toast(error?.message||'图片入库失败，未导入文稿');return}d.content=holder.innerHTML;library.nodes.push(d);select(d.id);persist()}return}if(['md','txt','docx','pdf','png'].includes(a)&&!activeDoc){toast('请先选择文稿');return}if(a==='md'&&activeDoc)return window.qijian.exportMarkdown({title:fileName(),markdown:serializeMarkdown(editorContentForStorage())});if(a==='txt'&&activeDoc)return window.qijian.exportText({title:fileName(),text:readableEditorText()});if(a==='docx'&&activeDoc)return window.qijian.exportDocx({title:fileName(),blocks:docxBlocksRich()});if(a==='pdf'&&activeDoc)return openImageExport('pdf');if(a==='png'&&activeDoc)return openImageExport();if(a==='hr'||a==='note')return insertSpecialBlock(a);if(['h1','h2','h3','h4','h5','h6','p','blockquote','pre'].includes(a))return setBlock(a);if(a==='insertUnorderedList'||a==='insertOrderedList')return setOutline(a==='insertOrderedList');document.execCommand(a,false);persist(true)}
function fileName(){return String(activeDoc?.title||preview(activeDoc).slice(0,30)||'空白文稿').replace(/[\\/:*?"<>|]/g,'_')}
function syncPanes(){const app=$('#app'),folders=app.classList.contains('folders-collapsed'),docs=app.classList.contains('docs-collapsed');$('#expandFolders').classList.toggle('hidden',!folders);$('#collapseFolders').classList.toggle('hidden',folders);$('#expandDocs').classList.toggle('hidden',!docs);$('#collapseDocs').classList.toggle('hidden',docs);const cycle=$('#paneCycle');if(cycle){const next=!folders&&!docs?'收起左栏':folders&&docs?'展开文稿栏':paneCycleDirection==='collapse'?'继续收起栏位':paneCycleDirection==='expand'?'继续展开栏位':'切换栏位';cycle.title=next;cycle.setAttribute('aria-label',next)}}
function applyResponsivePanes(){
 const app=$('#app'),forceFolders=innerWidth<=1100,forceDocs=innerWidth<=1000;
 if(forceFolders&&!forcedPaneState.folders){forcedPaneState.foldersWasCollapsed=app.classList.contains('folders-collapsed');app.classList.add('folders-collapsed')}
 else if(!forceFolders&&forcedPaneState.folders&&!forcedPaneState.foldersWasCollapsed)app.classList.remove('folders-collapsed');
 if(forceDocs&&!forcedPaneState.docs){forcedPaneState.docsWasCollapsed=app.classList.contains('docs-collapsed');app.classList.add('docs-collapsed')}
 else if(!forceDocs&&forcedPaneState.docs&&!forcedPaneState.docsWasCollapsed)app.classList.remove('docs-collapsed');
 forcedPaneState.folders=forceFolders;forcedPaneState.docs=forceDocs;syncPanes();
}
function toggleFolders(){if(forcedPaneState.folders)return;$('#app').classList.toggle('folders-collapsed');syncPanes()}
function toggleDocs(){if(forcedPaneState.docs)return;$('#app').classList.toggle('docs-collapsed');syncPanes()}
function swipePanes(direction){const app=$('#app');if(direction==='left'){if(!app.classList.contains('folders-collapsed'))app.classList.add('folders-collapsed');else app.classList.add('docs-collapsed')}else{if(app.classList.contains('docs-collapsed'))app.classList.remove('docs-collapsed');else app.classList.remove('folders-collapsed')}syncPanes()}
function cyclePanes(){const app=$('#app'),folders=app.classList.contains('folders-collapsed'),docs=app.classList.contains('docs-collapsed');if(!folders&&!docs){paneCycleDirection='collapse';app.classList.add('folders-collapsed')}else if(folders&&docs){paneCycleDirection='expand';app.classList.remove('docs-collapsed')}else{if(!paneCycleDirection)paneCycleDirection=Math.random()<.5?'collapse':'expand';if(paneCycleDirection==='collapse'){app.classList.add('folders-collapsed','docs-collapsed')}else app.classList.remove('folders-collapsed','docs-collapsed')}syncPanes()}
function bindPaneGestures(){let horizontal=0,last=0,touchX=null;const visibleHere=element=>!element.classList.contains('hidden')&&element.style.display!=='none';document.addEventListener('wheel',e=>{if(e.ctrlKey||visibleHere($('#settingsDialog'))||visibleHere($('#toolPanel')))return;if(Math.abs(e.deltaX)<Math.abs(e.deltaY)*1.3||Math.abs(e.deltaX)<3)return;const time=Date.now();if(time-last<650)return;horizontal+=e.deltaX;if(Math.abs(horizontal)<85)return;e.preventDefault();swipePanes(horizontal>0?'left':'right');horizontal=0;last=time},{passive:false});document.addEventListener('touchstart',e=>{touchX=e.touches.length===1?e.touches[0].clientX:null},{passive:true});document.addEventListener('touchend',e=>{if(touchX===null||e.changedTouches.length!==1)return;const delta=e.changedTouches[0].clientX-touchX;touchX=null;if(Math.abs(delta)>90)swipePanes(delta<0?'left':'right')},{passive:true})}
function htmlToMd(html){const d=document.createElement('div');d.innerHTML=html;return[...d.childNodes].map(n=>{const t=n.textContent||'',g=n.tagName?.toLowerCase();return g==='h1'?`# ${t}\n\n`:g==='h2'?`## ${t}\n\n`:g==='h3'?`### ${t}\n\n`:g==='blockquote'?`> ${t}\n\n`:g==='li'?`- ${t}\n`:`${t}\n\n`}).join('').trim()}
function mdToHtml(m){return m.split(/\r?\n/).map(l=>l.startsWith('### ')?`<h3>${esc(l.slice(4))}</h3>`:l.startsWith('## ')?`<h2>${esc(l.slice(3))}</h2>`:l.startsWith('# ')?`<h1>${esc(l.slice(2))}</h1>`:l?`<p>${esc(l)}</p>`:'<p><br></p>').join('')}
function docxBlocks(){return[...$('#editor').children].map(e=>({type:e.tagName.toLowerCase(),text:e.innerText||'',align:e.style.textAlign||'left'}))}
function bindTransientScrollbars(){
  for(const element of [$('#docList'),$('.writing')]){if(!element)continue;let timer;const show=()=>{if(element.scrollHeight<=element.clientHeight)return;element.classList.add('scrollbar-active');clearTimeout(timer);timer=setTimeout(()=>element.classList.remove('scrollbar-active'),900)};element.addEventListener('wheel',show,{passive:true});element.addEventListener('scroll',show,{passive:true})}
}
function bind(){
  bindPaneGestures();bindTransientScrollbars();applyResponsivePanes();setupImageExport();bindDocumentDropZone();
  $('#emptyCreateDoc').onclick=()=>createDoc(activeFolder);
  const revealEdge=()=>{clearTimeout(edgeTimer);$('#edgebar').classList.add('open')};const hideEdge=()=>{if(!$('#menuPopup').classList.contains('hidden')||$('#edgebar').matches(':hover'))return;clearTimeout(edgeTimer);$('#edgebar').classList.remove('open')};$('#edgeTrigger').onmouseenter=revealEdge;document.addEventListener('pointermove',e=>{if(e.buttons){if($('#edgebar').classList.contains('open'))revealEdge();return}if(e.clientY<=10)revealEdge();else if(e.clientY>38)hideEdge()});$('#edgebar').onmouseenter=revealEdge;
  $$('.menus button[data-menu]').forEach(b=>{b.onmousedown=event=>{if(event.button===0)event.preventDefault()};b.onclick=()=>menu(b.dataset.menu,b)});
  $('#folders').addEventListener('contextmenu',e=>{if(e.target.closest('button,.folder-row,input'))return;e.preventDefault();const popup=$('#itemContext');popup.innerHTML='<button id="blankNewFolder">新建文件夹</button>';popup.style.left=`${Math.min(e.clientX,window.innerWidth-190)}px`;popup.style.top=`${Math.min(e.clientY,window.innerHeight-100)}px`;popup.classList.remove('hidden');$('#blankNewFolder').onclick=()=>{popup.classList.add('hidden');createFolder(null)}});
  $('#documents').addEventListener('contextmenu',e=>{if(e.target.closest('.doc-card,button,input'))return;e.preventDefault();const popup=$('#itemContext');popup.innerHTML='<button id="blankNewDoc">新建文稿</button>';popup.style.left=`${Math.min(e.clientX,window.innerWidth-190)}px`;popup.style.top=`${Math.min(e.clientY,window.innerHeight-100)}px`;popup.classList.remove('hidden');$('#blankNewDoc').onclick=()=>{popup.classList.add('hidden');createDoc(activeFolder)}});$('.sidebar-search').onclick=()=>{if(filter!=='search')openGlobalSearch()};$('#search').onfocus=()=>{if(filter!=='search')openGlobalSearch()};$('#search').oninput=e=>{filter='search';activeFolder=null;query=e.target.value.trim().toLowerCase();navState();renderDocs()};
  $$('.folders nav > button').forEach(b=>{
    b.onclick=e=>{
      if(b.dataset.filter==='trash'&&e.target.closest('.trash-chevron')){trashExpanded=!trashExpanded;renderTrashFolders();return}
      filter=b.dataset.filter;activeFolder=null;query='';$('#search').value='';if(filter==='trash')trashExpanded=true;navState();render();
    };
    if(b.dataset.filter==='trash'){
      b.addEventListener('dragover',e=>{if(!dragged(e)||dragged(e).deletedAt)return;e.preventDefault();clearDropCues();b.classList.add('drop-target')});
      b.addEventListener('dragleave',()=>b.classList.remove('drop-target'));
      b.addEventListener('drop',e=>{e.preventDefault();clearDropCues();const item=dragged(e);dragNodeId=null;if(item)trash(item)});
    }else if(b.dataset.filter==='all')makeDropTarget(b,null);
  });
  $('#editor').addEventListener('focusin',()=>$('#app').classList.add('document-editing'));
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('#editor'))$('#app').classList.remove('document-editing')},true);
  if(!window.qijianEditor?.enabled){$('#editor').oninput=enhancedEditorInput;$('#editor').addEventListener('keydown',enhancedEditorKeys)}window.addEventListener('resize',()=>{applyResponsivePanes();scheduleEditorRefresh()});new ResizeObserver(()=>scheduleEditorRefresh()).observe($('#editor'));new MutationObserver(()=>scheduleEditorRefresh({outline:true,mindmap:true})).observe($('#editor'),{childList:true,subtree:true,characterData:true});document.addEventListener('selectionchange',updateWordStats);$('#closeWordStats').onclick=()=>{$('#wordStatsPanel').classList.add('hidden');closeDetachedDialog('wordStatsPanel')};$('#readingSpeed').onchange=e=>{const speed=Math.min(2000,Math.max(1,Math.round(Number(e.target.value)||284)));library.settings.readingSpeed=speed;e.target.value=speed;persist();updateWordStats()};$('#resetSettings').addEventListener('click',()=>{library.settings.readingSpeed=284;$('#readingSpeed').value=284;persist();updateWordStats()});
  $$('[data-close]').forEach(b=>b.onclick=()=>{if(b.closest('#toolPanel'))closeTools();else b.closest('section').classList.add('hidden')});$('#closeSettings').onclick=closeSettings;$$('[data-settings-tab]').forEach(b=>b.onclick=()=>settingsTab(b.dataset.settingsTab));for(const id of ['latinFont','chineseFont','fontSize','lineHeight','paragraphSpacing','pageWidth','heading1Size','heading2Size','heading3Size']){const input=$(`#${id}`),apply=e=>{const isFont=id==='latinFont'||id==='chineseFont';let value=isFont?e.target.value:+e.target.value;if(!isFont&&!Number.isFinite(value))return;if(id==='pageWidth')value=Math.min(1100,Math.max(560,value));library.settings[id]=value;settings()};input.onchange=e=>{apply(e);persist()};if(id==='pageWidth')input.oninput=apply}$$('[data-theme-choice]').forEach(b=>b.onclick=()=>{library.settings.theme=b.dataset.themeChoice;settings();persist()});$('#resetSettings').onclick=()=>{library.settings={...library.settings,theme:'paper',latinFont:'system',chineseFont:'system',fontSize:19,lineHeight:1.75,paragraphSpacing:10,pageWidth:920,heading1Size:31,heading2Size:26,heading3Size:22};settings();persist()};$('#openDataFolder').onclick=()=>window.qijian.showLibrary();$('#backupFromSettings').onclick=createManualBackup;$('#restoreBackupFromSettings').onclick=restoreManualBackup;$$('.tool-tabs button').forEach(b=>b.onclick=()=>openTool(b.dataset.tab));$('#saveVersionAsNew').onclick=saveHistoryVersionAsDocument;$('#restoreHistoryVersion').onclick=restoreSelectedHistoryVersion;enableFloatingDrag($('#settingsDialog'),$('#settingsDragHandle'));
  $('#collapseFolders').onclick=toggleFolders;$('#expandFolders').onclick=toggleFolders;$('#collapseDocs').onclick=toggleDocs;$('#expandDocs').onclick=toggleDocs;$('#paneCycle').onclick=cyclePanes;$('#showLibrary').onclick=()=>window.qijian.showLibrary();$('#windowMinimize').onclick=()=>window.qijian.minimizeWindow();$('#windowMaximize').onclick=()=>window.qijian.toggleMaximizeWindow();$('#windowClose').onclick=()=>window.qijian.closeWindow();bindWordStatsDrag();document.onclick=e=>{if(!e.target.closest('.menus')&&!e.target.closest('#menuPopup'))$('#menuPopup').classList.add('hidden');if(!e.target.closest('#itemContext'))$('#itemContext').classList.add('hidden');if(!e.target.closest('#slashPanel'))$('#slashPanel').classList.add('hidden')};window.onbeforeunload=()=>{if(libraryWritesSuspended)return;clearTimeout(saveTimer);if(syncActiveDoc()&&activeDoc)pendingHistoryDocIds.add(activeDoc.id);flushPendingSessionHistory();library.writeRevision=(Number(library.writeRevision)||0)+1;const result=window.qijian.saveLibrarySync(library);if(result?.error)console.error('关闭前保存失败',result.error)}
}
function exportReadyHtml(){
 const copy=$('#editor').cloneNode(true);
  copy.querySelectorAll('[data-qijian-transient-block]').forEach(node=>node.remove());
  normalizeLegacyMarkTokens(copy);
  copy.querySelectorAll('.editor-annotation,[data-qijian-mark="annotation"]').forEach(annotation=>{const mark=document.createElement('mark');mark.innerHTML=annotation.innerHTML;annotation.replaceWith(mark)});
  copy.querySelectorAll('.editor-formula').forEach(formula=>{const math=formula.querySelector('.katex-mathml math')?.cloneNode(true);formula.replaceChildren(math||document.createTextNode(formula.dataset.latex||''));formula.removeAttribute('contenteditable');formula.removeAttribute('tabindex')});copy.querySelectorAll('.image-resize-handle,.image-drag-grip,.ProseMirror-separator,.ProseMirror-trailingBreak,.table-edit-button').forEach(item=>item.remove());copy.querySelectorAll('[draggable]').forEach(item=>item.removeAttribute('draggable'));
 return copy.innerHTML
}
const imageExportState={template:'classic',size:'normal',width:720};
const pdfExportState={template:'classic',size:'normal',width:'a4'};
let exportFormat='png',exportDialogSession=0;
function currentExportState(){return exportFormat==='pdf'?pdfExportState:imageExportState}
function exportPreviewWidth(){const width=currentExportState().width;return width==='a4'?210*96/25.4:Number(width)}
function imageExportPayload(){return {title:fileName(),html:exportReadyHtml(),settings:{...library.settings},...currentExportState(),format:exportFormat}}
function fitImageExportPreview(root=document,width=exportPreviewWidth()){const frame=root.querySelector('#imageExportFrame'),viewport=root.querySelector('.image-export-preview-inner');if(!frame||!viewport)return false;const available=Math.max(260,viewport.clientWidth),scale=Math.min(1,available/width);frame.style.width=width+'px';frame.style.transform=`scale(${scale})`;frame.style.height=(100/scale)+'%';return true}
let imagePreviewRevision=0,imagePreviewPending=null,imagePreviewRunning=false;
async function refreshImageExport(){
 if($('#imageExportDialog').classList.contains('hidden'))return;
 $$('[data-image-template]').forEach(b=>b.classList.toggle('selected',b.dataset.imageTemplate===currentExportState().template));$$('[data-image-size]').forEach(b=>b.classList.toggle('selected',b.dataset.imageSize===currentExportState().size));$$('[data-image-width]').forEach(b=>b.classList.toggle('selected',b.dataset.imageWidth===String(currentExportState().width)));fitImageExportPreview();
 imagePreviewPending=++imagePreviewRevision;if(imagePreviewRunning)return;
 imagePreviewRunning=true;
 try{while(imagePreviewPending!==null){const revision=imagePreviewPending;imagePreviewPending=null;const html=await window.qijian.imagePreview(imageExportPayload());if(revision===imagePreviewRevision&&!$('#imageExportDialog').classList.contains('hidden'))$('#imageExportFrame').srcdoc=html;}}
 catch(error){if(!$('#imageExportDialog').classList.contains('hidden'))toast('预览生成失败：'+error.message)}
 finally{imagePreviewRunning=false;if($('#imageExportDialog').classList.contains('hidden'))window.qijian.releaseImagePreview?.();}
}
function closeImageExport(){exportDialogSession++;imagePreviewRevision++;imagePreviewPending=null;$('#imageExportDialog').classList.add('hidden');closeDetachedDialog('imageExportDialog');const frame=$('#imageExportFrame');frame.removeAttribute('srcdoc');frame.src='about:blank';window.qijian.releaseImagePreview?.();}
function openImageExport(format='png'){
 if(!activeDoc)return;
 if(!$('#imageExportDialog').classList.contains('hidden'))closeImageExport();
 exportFormat=format==='pdf'?'pdf':'png';exportDialogSession++;
 const pdf=exportFormat==='pdf',title=pdf?'导出 PDF':'导出图片',panel=$('#imageExportDialog');
 panel.classList.toggle('pdf-export-mode',pdf);panel.setAttribute('aria-label',title);
 $('#exportDialogTitle').textContent=title;
 $('#exportDialogSubtitle').textContent=pdf?'A4、手机、电脑与大屏布局 · PDF':'手机、电脑与大屏布局 · PNG';
 $('#exportPreviewNote').textContent=pdf?'预览显示连续内容；PDF 按所选页面尺寸自动分页。':'可在预览中滚动查看；导出包含完整文稿。';
 $('#exportOutputNote').textContent=pdf?'字体跟随当前文稿；字号和页面尺寸仅用于本次导出。':'字体跟随当前文稿。优先保存为一张完整图片；内容超过图片高度上限时自动分段编号。';
 $('#saveImageExport').textContent=title;$('#saveImageExport').disabled=false;
 $$('[data-image-size]').forEach(b=>b.textContent=pdf?({small:'小 10pt',normal:'中 12pt',large:'大 14pt'})[b.dataset.imageSize]:({small:'小',normal:'标准',large:'大'})[b.dataset.imageSize]);
 $('#exportMobileLabel').textContent=pdf?'720px 宽':'720px 长图';
 panel.classList.remove('hidden');refreshImageExport();
 openDetachedDialog('imageExportDialog',{title,width:pdf?980:1180,height:820,closeSelector:'#closeImageExport'});
}
function setupImageExport(){
 $('#closeImageExport').onclick=closeImageExport;
 $$('[data-image-template]').forEach(b=>b.onclick=()=>{currentExportState().template=b.dataset.imageTemplate;refreshImageExport()});
 $$('[data-image-size]').forEach(b=>b.onclick=()=>{currentExportState().size=b.dataset.imageSize;refreshImageExport()});
 $$('[data-image-width]').forEach(b=>b.onclick=()=>{currentExportState().width=b.dataset.imageWidth==='a4'?'a4':Number(b.dataset.imageWidth)||720;refreshImageExport()});
 $('#saveImageExport').onclick=async()=>{
  const button=$('#saveImageExport'),format=exportFormat,session=exportDialogSession,payload=imageExportPayload();button.disabled=true;button.textContent='导出中…';
  try{const result=await (format==='pdf'?window.qijian.exportPdf(payload):window.qijian.exportPng(payload));
   if(result?.length&&session===exportDialogSession){closeImageExport();toast(format==='pdf'?'PDF 已导出':result.length===1?'图片已导出':'已导出 '+result.length+' 张连续图片')}
  }catch(e){alert((format==='pdf'?'PDF':'图片')+'导出失败：'+e.message)}
  finally{if(session===exportDialogSession){button.disabled=false;button.textContent=format==='pdf'?'导出 PDF':'导出图片'}}
 }
}

