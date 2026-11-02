const {app, BrowserWindow} = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const completeFormulaMethod = fs.readFileSync(path.join(__dirname, 'fixtures', 'method-formulas.md'), 'utf8');
const completeFormulaCounts = {
  block: (completeFormulaMethod.match(/\\\[/g) || []).length,
  inline: (completeFormulaMethod.match(/\\\(/g) || []).length
};
const escapeClipboardHtml = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const completeFormulaRichHtml = completeFormulaMethod.replace(/\r\n?/g, '\n').split('\n').filter(line => line.trim()).map(line => {
  const heading = line.match(/^(#{1,6})\s+(.+)$/);
  return heading ? `<h${heading[1].length}>${escapeClipboardHtml(heading[2])}</h${heading[1].length}>` : `<p>${escapeClipboardHtml(line)}</p>`;
}).join('');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qijian-structured-'));
const stamp = new Date().toISOString();
fs.writeFileSync(path.join(root, 'library.json'), JSON.stringify({
  nodes: [{id: 'mixed', type: 'document', title: '混合文稿', parentId: null, order: 1, createdAt: stamp, updatedAt: stamp, deletedAt: null, content: '<p>准备</p>', contentJson: null, versions: []}],
  activeId: 'mixed', settings: {}, writeRevision: 0
}), 'utf8');
process.env.QIJIAN_TEST_LIBRARY_ROOT = root;
require('../src/main.js');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let exitCode = 0;

app.whenReady().then(async () => {
  try {
    let win;
    for(let attempt=0;attempt<160;attempt++){win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html'));if(win&&await win.webContents.executeJavaScript('!!window.qijianEditor?.enabled && typeof activeDoc!=="undefined" && !!activeDoc').catch(()=>false))break;await wait(100)}
    if(!win)throw new Error('Editor startup timed out');
    await wait(350);
    let runIndex = 0;
    const run = async code => {
      const index = ++runIndex;
      try { return await win.webContents.executeJavaScript(code); }
      catch (error) { throw new Error(`渲染步骤 ${index} 失败（${code.slice(0, 120)}）：${error.message}`); }
    };
    const setContent = async html => {
      const result = await run(`(() => {try{window.qijianEditor.setContent(${JSON.stringify(html)}, null);return {ok:true}}catch(error){return {ok:false,error:error.stack||error.message}}})()`);
      if (!result.ok) throw new Error(`设置测试文稿失败：${result.error}`);
    };
    const snapshot = () => run(`(() => {
      const doc=window.qijianEditor.view.state.doc, nodes=[];
      doc.descendants((node,pos)=>nodes.push({type:node.type.name,pos,text:node.textContent,attrs:node.attrs}));
      return {json:window.qijianEditor.getDocumentJSON(),html:window.qijianEditor.getHTML(),top:[...Array(doc.childCount)].map((_,i)=>({type:doc.child(i).type.name,text:doc.child(i).textContent})),nodes};
    })()`);
    const locate = (type, text = '') => run(`(() => {let found=null;window.qijianEditor.view.state.doc.descendants((node,pos)=>{if(found===null&&node.type.name===${JSON.stringify(type)}&&(!${JSON.stringify(text)}||node.textContent.includes(${JSON.stringify(text)})))found=pos});return found})()`);
    const selectText = (type, text, start, end = start) => run(`(() => {let pos=null;window.qijianEditor.view.state.doc.descendants((node,p)=>{if(pos===null&&node.type.name===${JSON.stringify(type)}&&node.textContent.includes(${JSON.stringify(text)}))pos=p});window.qijianEditor.setTextSelection(pos+1+${start},pos+1+${end})})()`);
    const key = async (keyCode, modifiers = []) => {
      win.webContents.sendInputEvent({type: 'keyDown', keyCode, modifiers});
      win.webContents.sendInputEvent({type: 'keyUp', keyCode, modifiers});
      await wait(90);
    };
    const copySelection = () => run(`(() => {const data=new DataTransfer();const event=new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true});document.querySelector('#editor').dispatchEvent(event);window.__qijianTestClipboard={};for(const type of data.types)window.__qijianTestClipboard[type]=data.getData(type);return {prevented:event.defaultPrevented,types:[...data.types],data:window.__qijianTestClipboard}})()`);
    const pasteCopied = () => run(`(() => {const data=new DataTransfer();for(const [type,value] of Object.entries(window.__qijianTestClipboard||{}))data.setData(type,value);const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});document.querySelector('#editor').dispatchEvent(event);return event.defaultPrevented})()`);
    const pastePlain = text => run(`(() => {const data=new DataTransfer();data.setData('text/plain',${JSON.stringify(text)});const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});document.querySelector('#editor').dispatchEvent(event);return event.defaultPrevented})()`);
    const pasteRich = (plain, html) => run(`(() => {const data=new DataTransfer();data.setData('text/plain',${JSON.stringify(plain)});data.setData('text/html',${JSON.stringify(html)});const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});document.querySelector('#editor').dispatchEvent(event);return event.defaultPrevented})()`);
    const cutSelection = () => run(`(() => {const data=new DataTransfer();const event=new ClipboardEvent('cut',{clipboardData:data,bubbles:true,cancelable:true});document.querySelector('#editor').dispatchEvent(event);return {prevented:event.defaultPrevented,plain:data.getData('text/plain')}})()`);
    const checks = {};

    const title = '2.Landsat 数据与统一预处理';
    await setContent(`<h1><strong>${title}</strong></h1><p>正文段落</p>`);
    const startBefore = await snapshot();
    await selectText('heading', title, 0);
    await key('Enter');
    const startEnter = await snapshot();
    checks.headingStartEnter = startEnter.top.map(x => x.type).join(',') === 'paragraph,heading,paragraph' && startEnter.top[0].text === '' && startEnter.top[1].text === title;
    await run('window.qijianEditor.undo()'); await wait(60);
    checks.headingStartUndoExact = JSON.stringify((await snapshot()).json) === JSON.stringify(startBefore.json);
    await run('window.qijianEditor.redo()'); await wait(60);
    checks.headingStartRedoExact = JSON.stringify((await snapshot()).json) === JSON.stringify(startEnter.json);

    await setContent(`<h1><strong>${title}</strong></h1><p>正文段落</p>`);
    const middleBefore = await snapshot();
    await selectText('heading', title, 2);
    await key('Enter');
    const middleEnter = await snapshot();
    checks.headingMiddleEnter = middleEnter.top.map(x => x.type).join(',') === 'heading,paragraph,paragraph' && middleEnter.top[0].text === title.slice(0, 2) && middleEnter.top[1].text === title.slice(2);
    checks.headingSuffixIsBody = middleEnter.nodes.some(x => x.type === 'paragraph' && x.text === title.slice(2));
    await run('window.qijianEditor.undo()'); await wait(60);
    checks.headingMiddleUndoExact = JSON.stringify((await snapshot()).json) === JSON.stringify(middleBefore.json);

    await setContent('<h1><strong>2026.</strong></h1><p>10.13</p><p>后段</p>');
    const mergeBefore = await snapshot();
    await selectText('paragraph', '10.13', 0);
    await key('Backspace');
    const merged = await snapshot();
    checks.backspaceMergeIsSingleHeading = merged.top[0].type === 'heading' && merged.top[0].text === '2026.10.13' && merged.top[1].type === 'paragraph';
    await run('window.qijianEditor.undo()'); await wait(60);
    checks.backspaceUndoExact = JSON.stringify((await snapshot()).json) === JSON.stringify(mergeBefore.json);

    await setContent('<h1><strong>标题</strong></h1><p>正文甲乙</p>');
    await selectText('heading', '标题', 0, 1);
    const inlineClipboard = await copySelection();
    checks.copyWritesStructuredAndStandard = inlineClipboard.prevented && inlineClipboard.types.includes('application/x-qijian-fragment+json') && inlineClipboard.types.includes('text/html') && inlineClipboard.types.includes('text/plain');
    await selectText('paragraph', '正文甲乙', 2);
    await pasteCopied(); await wait(40);
    const afterOnePaste = await snapshot();
    await pasteCopied(); await wait(40);
    const afterTwoPastes = await snapshot();
    checks.inlinePasteDoesNotCreateBlocks = afterTwoPastes.top.map(x => x.type).join(',') === 'heading,paragraph' && afterTwoPastes.top[1].text === '正文标标甲乙';
    checks.inlinePastePreservesMark = afterTwoPastes.json.content[1].content.filter(x => x.type === 'text' && x.text.includes('标')).some(x => x.marks?.some(mark => mark.type === 'strong'));
    await run('window.qijianEditor.undo()'); await wait(60);
    const afterPasteUndo = await snapshot();
    checks.pasteIsUndoable = afterPasteUndo.top[1].text === afterOnePaste.top[1].text;

    await setContent('<h1><strong>整行标题</strong></h1><p>正文保持正文</p>');
    await selectText('heading', '整行标题', 0, '整行标题'.length);
    await copySelection();
    await selectText('paragraph', '正文保持正文', 2);
    await pasteCopied(); await wait(60);
    const wholeHeadingPaste = await snapshot();
    checks.wholeHeadingPasteKeepsBlockBoundary = wholeHeadingPaste.top.filter(x => x.type === 'heading').length === 2 && wholeHeadingPaste.top.filter(x => x.type === 'paragraph').every(x => x.type === 'paragraph');
    checks.wholeHeadingDoesNotRestyleDocument = wholeHeadingPaste.top.some(x => x.type === 'paragraph' && x.text.includes('正文'));

    const outlineHtml = '<ul class="outline-list"><li><p>大纲甲乙</p><div class="image-row"><figure class="editor-image" data-image-id="test-image"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="图"><figcaption></figcaption></figure></div><ul class="outline-list"><li><p>子项</p></li></ul></li></ul><p>尾段</p>';
    await setContent(outlineHtml);
    await selectText('paragraph', '大纲甲乙', 2, 3);
    await copySelection();
    await selectText('paragraph', '大纲甲乙', 3);
    await pasteCopied(); await wait(50);
    const outlineInline = await snapshot();
    checks.outlineInlinePasteStaysInItem = outlineInline.nodes.filter(x => x.type === 'list_item').length === 2 && outlineInline.nodes.some(x => x.type === 'paragraph' && x.text === '大纲甲甲乙');
    checks.outlineKeepsEmbeddedImage = outlineInline.nodes.some(x => x.type === 'image_row') && outlineInline.nodes.some(x => x.type === 'image_item');

    await setContent(outlineHtml);
    await selectText('paragraph', '大纲甲乙', 0, '大纲甲乙'.length);
    await copySelection();
    await selectText('paragraph', '尾段', 2);
    await pasteCopied(); await wait(60);
    const outlineBlockPaste = await snapshot();
    checks.wholeOutlinePastesAsOutline = outlineBlockPaste.nodes.filter(x => x.type === 'bullet_list').length >= 4 && !outlineBlockPaste.nodes.some(x => x.type === 'table_block');

    const tableHtml = '<p>表格前</p><div class="table-block" style="font-size:15px"><table><tbody><tr><th>列一</th><th>列二</th></tr><tr><td>A</td><td>B</td></tr></tbody></table></div><p>表格后</p>';
    await setContent(tableHtml);
    const tablePos = await locate('table_block');
    await run(`window.qijianEditor.selectNodeAt(${tablePos})`);
    await copySelection();
    await selectText('paragraph', '表格后', 3);
    await pasteCopied(); await wait(60);
    const tablePaste = await snapshot();
    checks.tablePastesAsTable = tablePaste.nodes.filter(x => x.type === 'table_block').length === 2 && !tablePaste.nodes.some(x => x.type === 'bullet_list');

    await setContent(tableHtml);
    const cutTablePos = await locate('table_block');
    await run(`window.qijianEditor.selectNodeAt(${cutTablePos})`);
    const cutTable = await cutSelection(); await wait(40);
    checks.tableCutProvidesTabText = cutTable.prevented && cutTable.plain.includes('\t') && !(await snapshot()).nodes.some(x => x.type === 'table_block');
    await run('window.qijianEditor.undo()'); await wait(50);
    checks.tableCutUndo = (await snapshot()).nodes.some(x => x.type === 'table_block');

    await setContent('<p>前</p>');
    await selectText('paragraph', '前', 1);
    await pastePlain('甲\t乙\n1\t2'); await wait(50);
    checks.tabSeparatedPasteBecomesTable = (await snapshot()).nodes.some(x => x.type === 'table_block' && JSON.parse(x.attrs.matrix)[1][1] === '2');

    await setContent('<p></p>');
    await run(`window.qijianEditor.setTextSelection(1)`);
    await run(`(() => {const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),c=>c.charCodeAt(0));const file=new File([bytes],'截图.png',{type:'image/png'});const data=new DataTransfer();data.items.add(file);const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});document.querySelector('#editor').dispatchEvent(event)})()`);
    await wait(250);
    const imagePaste = await snapshot();
    checks.clipboardImagePaste = imagePaste.nodes.some(x => x.type === 'image_item' && String(x.attrs.src).startsWith('file:'));

    await setContent('<div class="image-row"><figure class="editor-image" data-image-id="boundary"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><figcaption></figcaption></figure></div><p>图片后</p>');
    const imagePos = await locate('image_item');
    const imageBefore = await snapshot();
    await run(`window.qijianEditor.selectNodeAt(${imagePos})`);
    await key('Enter');
    const imageEnter = await snapshot();
    checks.imageEnterCreatesOnlyRequestedLine = imageEnter.top.map(x => x.type).join(',') === 'image_row,paragraph,paragraph';
    await run('window.qijianEditor.undo()'); await wait(60);
    checks.imageEnterUndoExact = JSON.stringify((await snapshot()).json) === JSON.stringify(imageBefore.json);

    await setContent(tableHtml);
    const boundaryTablePos = await locate('table_block');
    const tableBefore = await snapshot();
    await run(`window.qijianEditor.selectNodeAt(${boundaryTablePos})`);
    await key('Enter');
    checks.tableEnterCreatesOneLine = (await snapshot()).top.map(x => x.type).join(',') === 'paragraph,table_block,paragraph,paragraph';
    await run('window.qijianEditor.undo()'); await wait(60);
    checks.tableEnterUndoExact = JSON.stringify((await snapshot()).json) === JSON.stringify(tableBefore.json);

    await setContent('<p>值为 </p>');
    await selectText('paragraph', '值为 ', 3);
    await run(`openFormulaEditor(null,'inline');document.querySelector('#formulaSource').value='x_i^2';document.querySelector('#formulaEditorSave').click()`);
    let formulaState = await snapshot();
    checks.formulaDialogInsertsInline = formulaState.nodes.some(x => x.type === 'formula_inline' && x.attrs.latex === 'x_i^2') && formulaState.top[0].type === 'paragraph';
    const formulaBeforeEdit = formulaState.json;
    await run(`(() => {const formula=document.querySelector('#editor .formula-inline');formula.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true}));document.querySelector('#formulaSource').value='\\\\frac{a}{b}';document.querySelector('#formulaEditorSave').click()})()`);
    formulaState = await snapshot();
    checks.formulaDialogEdits = formulaState.nodes.some(x => x.type === 'formula_inline' && x.attrs.latex === '\\frac{a}{b}');
    const formulaPos = await locate('formula_inline');
    await run(`window.qijianEditor.selectNodeAt(${formulaPos})`);
    await key('Delete');
    checks.formulaDelete = !(await snapshot()).nodes.some(x => x.type === 'formula_inline');
    await run('window.qijianEditor.undo()'); await wait(50);
    checks.formulaDeleteUndo = (await snapshot()).nodes.some(x => x.type === 'formula_inline' && x.attrs.latex === '\\frac{a}{b}');
    checks.formulaStorageCompact = !(await snapshot()).html.includes('katex-html') && (await snapshot()).html.includes('data-latex="\\frac{a}{b}"');

    await run(`(() => {openFormulaEditor(null,'block');const source=document.querySelector('#formulaSource');source.value='x=1\\\\tag{7}';source.dispatchEvent(new Event('input',{bubbles:true}))})()`); await wait(60);
    checks.formulaPreviewTagRightAligned = await run(`(() => {const preview=document.querySelector('#formulaPreview'),tag=preview.querySelector('.katex-html>.tag'),base=preview.querySelector('.katex-html>.base');if(!tag||!base)return false;const pr=preview.getBoundingClientRect(),tr=tag.getBoundingClientRect(),br=base.getBoundingClientRect();return Math.abs((pr.right-22)-tr.right)<4&&tr.left>br.right+6})()`);
    checks.formulaDialogHasOnlyUsefulLabels = await run(`!document.querySelector('#formulaEditorDialog header span')&&!document.querySelector('#formulaEditorDialog small')&&document.querySelector('#formulaSource').getAttribute('aria-label')==='公式内容'`);
    await run(`document.querySelector('#formulaEditorCancel').click()`); await wait(30);
    checks.documentCardsKeepScrollbarWidth = await run(`(() => {const list=document.querySelector('#docList'),card=list.querySelector('.doc-card'),style=getComputedStyle(list);if(!card)return false;const before=card.getBoundingClientRect(),fillers=Array.from({length:30},()=>card.cloneNode(true));fillers.forEach(node=>list.appendChild(node));const after=card.getBoundingClientRect();fillers.forEach(node=>node.remove());return style.overflowY==='scroll'&&style.scrollbarGutter.includes('stable')&&parseFloat(style.paddingRight)<=3&&Math.abs(before.width-after.width)<.5&&Math.abs(before.height-after.height)<.5})()`);
    checks.scrollbarArrowButtonsHidden = await run(`(() => ['#docList','.writing'].every(selector=>{const style=getComputedStyle(document.querySelector(selector),'::-webkit-scrollbar-button');return style.display==='none'&&parseFloat(style.width)===0&&parseFloat(style.height)===0}))()`);

    const inferredFormulaPaste = '##### 3.4.2 非滑坡背景上的参考一致性\n向量 (\\boldsymbol l_j) 与 (\\boldsymbol\\mu_L)。\n\\frac{1}{J}\\sum_{j=1}^{J}\\boldsymbol b_j\n]\n\\left|\n\\boldsymbol\\mu_L-\\boldsymbol\\mu_B\n\\right|_2\n\\tag{6}\n]';
    await setContent('<h2>公式与正文混合测试</h2><p>插入位置</p><ul class="outline-list"><li><p>保留的大纲条目</p></li></ul>');
    await selectText('paragraph', '插入位置', 2);
    const inferredBefore = await snapshot();
    await pastePlain(inferredFormulaPaste); await wait(100);
    const inferredAfter = await snapshot();
    checks.inferredInlineAndBrokenBlockFormulas = inferredAfter.nodes.filter(x => x.type === 'formula_inline').length === 2 && inferredAfter.nodes.filter(x => x.type === 'formula_block').length === 2;
    checks.formulaPasteKeepsOtherStructures = inferredAfter.nodes.some(x => x.type === 'heading' && x.text === '公式与正文混合测试') && inferredAfter.nodes.some(x => x.type === 'list_item' && x.text === '保留的大纲条目');
    checks.formulaPasteKeepsMarkdownHeading = inferredAfter.nodes.some(x => x.type === 'heading' && x.attrs.level === 5 && x.text === '3.4.2 非滑坡背景上的参考一致性') && !inferredAfter.nodes.some(x => x.type === 'paragraph' && x.text.startsWith('#####'));
    checks.formulaKeepsOriginalSource = inferredAfter.nodes.some(x => x.type === 'formula_inline' && x.attrs.sourceText === '(\\boldsymbol l_j)') && inferredAfter.nodes.some(x => x.type === 'formula_block' && x.attrs.sourceText.endsWith('\n]'));
    checks.formulaTagRightAligned = await run(`(() => {const formula=[...document.querySelectorAll('#editor .formula-block')].find(node=>node.dataset.latex.includes('\\\\tag{6}')),render=formula?.querySelector(':scope>.formula-render'),tag=formula?.querySelector('.katex-html>.tag'),base=formula?.querySelector('.katex-html>.base');if(!formula||!render||!tag||!base)return false;const rr=render.getBoundingClientRect(),tr=tag.getBoundingClientRect(),br=base.getBoundingClientRect();return Math.abs(rr.right-tr.right)<3&&tr.left>br.right+6})()`);
    await run('window.qijianEditor.undo()'); await wait(60);
    checks.inferredFormulaPasteSingleUndo = JSON.stringify((await snapshot()).json) === JSON.stringify(inferredBefore.json);
    await run('window.qijianEditor.redo()'); await wait(60);
    checks.inferredFormulaPasteRedoExact = JSON.stringify((await snapshot()).json) === JSON.stringify(inferredAfter.json);

    const inferredInlinePos = await locate('formula_inline', '');
    await run(`window.qijianEditor.selectNodeAt(${inferredInlinePos})`); await wait(70);
    checks.formulaSelectionShowsRestore = await run(`!document.querySelector('#formulaActions').classList.contains('hidden') && document.querySelector('#formulaRestoreText').getAttribute('aria-label')==='恢复为文本'`);
    checks.formulaActionsUseRequestedIcons = await run(`(() => {const edit=document.querySelector('#formulaQuickEdit'),svg=edit.querySelector('svg'),txt=document.querySelector('#formulaRestoreText .formula-txt-icon'),txtStyle=getComputedStyle(txt);return !!svg&&svg.getAttribute('viewBox')==='0 0 20 20'&&svg.querySelectorAll('path').length===1&&edit.getAttribute('aria-label')==='编辑公式'&&txt?.textContent.trim()==='TXT'&&txtStyle.borderTopStyle==='none'})()`);
    checks.formulaActionIconsFollowDarkTheme = await run(`(() => {const previous=document.body.dataset.theme,edit=document.querySelector('#formulaQuickEdit'),svg=edit.querySelector('svg'),txt=document.querySelector('#formulaRestoreText .formula-txt-icon');document.body.dataset.theme='dark';const color=getComputedStyle(edit).color,passed=getComputedStyle(svg).fill===color&&getComputedStyle(txt).color===color;document.body.dataset.theme=previous;return passed})()`);
    await run(`document.querySelector('#formulaRestoreText').click()`); await wait(70);
    const restoredInline = await snapshot();
    checks.restoreInlineFormulaInPlace = restoredInline.nodes.filter(x => x.type === 'formula_inline').length === 1 && restoredInline.top.some(x => x.text.includes('(\\boldsymbol l_j)'));
    await run('window.qijianEditor.undo()'); await wait(60);
    checks.restoreInlineFormulaUndoExact = JSON.stringify((await snapshot()).json) === JSON.stringify(inferredAfter.json);

    const inferredBlockPos = await locate('formula_block', '');
    await run(`window.qijianEditor.selectNodeAt(${inferredBlockPos})`); await wait(70);
    await run(`document.querySelector('#formulaRestoreText').click()`); await wait(70);
    const restoredBlock = await snapshot();
    checks.restoreBlockFormulaAsOriginalLines = restoredBlock.nodes.filter(x => x.type === 'formula_block').length === 1 && restoredBlock.top.some(x => x.text.includes('\\frac{1}{J}')) && restoredBlock.top.some(x => x.text === ']');
    await run('window.qijianEditor.undo()'); await wait(60);
    checks.restoreBlockFormulaUndoExact = JSON.stringify((await snapshot()).json) === JSON.stringify(inferredAfter.json);

    await setContent('<p>路径 (C:\\Users\\lenovo) 保持文本</p>');
    await selectText('paragraph', '路径 (C:\\Users\\lenovo) 保持文本', '路径 '.length);
    await pastePlain('(C:\\Users\\lenovo)'); await wait(50);
    checks.windowsPathIsNotFormula = !(await snapshot()).nodes.some(x => x.type === 'formula_inline' || x.type === 'formula_block');

    const internalMixedHtml = '<h2><strong>内部组合标题</strong></h2><p>正文 <em>斜体</em> 与 <span class="editor-formula formula-inline" data-latex="x_i" data-formula-source="\\(x_i\\)"></span></p><ul class="outline-list"><li><p>大纲条目</p><div class="image-row"><figure class="editor-image" data-image-id="internal-mixed-image"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="组合图片"><figcaption></figcaption></figure></div><div class="editor-formula formula-block" data-latex="\\frac{a}{b}" data-formula-source="\\[\\frac{a}{b}\\]"></div></li></ul><div class="table-block"><table><tbody><tr><th>甲</th><th>乙</th></tr><tr><td>1</td><td>2</td></tr></tbody></table></div><p><s>结尾</s></p>';
    await setContent(internalMixedHtml);
    await run('window.qijianEditor.selectAll()');
    await copySelection();
    await setContent('<p></p>');
    await run('window.qijianEditor.setTextSelection(1)');
    const internalMixedBefore = await snapshot();
    await pasteCopied(); await wait(80);
    const internalMixed = await snapshot();
    checks.internalMixedPasteKeepsEveryNode = ['heading','formula_inline','bullet_list','image_item','formula_block','table_block'].every(type => internalMixed.nodes.some(node => node.type === type));
    checks.internalMixedPasteKeepsMarks = JSON.stringify(internalMixed.json).includes('"strong"') && JSON.stringify(internalMixed.json).includes('"em"') && JSON.stringify(internalMixed.json).includes('"strike"');
    await run('window.qijianEditor.undo()'); await wait(60);
    checks.internalMixedPasteSingleUndo = JSON.stringify((await snapshot()).json) === JSON.stringify(internalMixedBefore.json);

    const externalRichPlain = '外部组合标题\n含斜体和 \\(\\boldsymbol x_i\\)\n大纲一级\n大纲二级\n组合图片\n\\[\\frac{a}{b}\\]\n甲\t乙\n1\t2\n结尾';
    const externalRichHtml = '<h3><strong>外部组合标题</strong></h3><p>含 <em>斜体</em> 和 \\(\\boldsymbol <strong>x</strong>_i\\)</p><ul><li><p>大纲一级 <mark>标注</mark></p><ul><li><p>大纲二级</p></li></ul><div class="image-row"><figure class="editor-image"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="组合图片"><figcaption></figcaption></figure></div><p>\\[\\frac{a}{b}\\]</p></li></ul><table><tbody><tr><th>甲</th><th>乙</th></tr><tr><td>1</td><td>2</td></tr></tbody></table><p><s>结尾</s></p>';
    await setContent('<p>插入点</p>');
    await selectText('paragraph', '插入点', 2);
    const externalRichBefore = await snapshot();
    await pasteRich(externalRichPlain, externalRichHtml); await wait(350);
    const externalRich = await snapshot();
    checks.externalRichMixedKeepsEveryNode = externalRich.nodes.some(node => node.type === 'heading' && node.attrs.level === 3)
      && externalRich.nodes.some(node => node.type === 'formula_inline' && node.attrs.latex === '\\boldsymbol x_i')
      && externalRich.nodes.some(node => node.type === 'formula_block' && node.attrs.latex === '\\frac{a}{b}')
      && externalRich.nodes.filter(node => node.type === 'list_item').length === 2
      && externalRich.nodes.some(node => node.type === 'table_block')
      && externalRich.nodes.some(node => node.type === 'image_item' && String(node.attrs.src).startsWith('file:'));
    checks.externalRichMixedKeepsMarks = JSON.stringify(externalRich.json).includes('"strong"') && JSON.stringify(externalRich.json).includes('"em"') && JSON.stringify(externalRich.json).includes('"annotation"') && JSON.stringify(externalRich.json).includes('"strike"');
    await run('window.qijianEditor.undo()'); await wait(70);
    checks.externalRichMixedSingleUndo = JSON.stringify((await snapshot()).json) === JSON.stringify(externalRichBefore.json);

    const externalPlainMixed = '##### 纯文本组合标题\n正文 **粗体** 与 \\(z_i\\)\n- 父项\n  - 子项 $q^2$\n| 甲 | 乙 |\n| --- | --- |\n| 1 | 2 |\n\\[\n\\sum_{i=1}^{n} i\n\\]';
    await setContent('<p>纯文本插入点</p>');
    await selectText('paragraph', '纯文本插入点', 3);
    const externalPlainMixedBefore = await snapshot();
    await pastePlain(externalPlainMixed); await wait(120);
    const externalPlainMixedAfter = await snapshot();
    checks.externalPlainMixedKeepsEveryNode = externalPlainMixedAfter.nodes.some(node => node.type === 'heading' && node.attrs.level === 5)
      && externalPlainMixedAfter.nodes.filter(node => node.type === 'formula_inline').length === 2
      && externalPlainMixedAfter.nodes.some(node => node.type === 'formula_block')
      && externalPlainMixedAfter.nodes.filter(node => node.type === 'list_item').length === 2
      && externalPlainMixedAfter.nodes.some(node => node.type === 'table_block');
    checks.externalPlainMixedKeepsMark = JSON.stringify(externalPlainMixedAfter.json).includes('"strong"');
    await run('window.qijianEditor.undo()'); await wait(70);
    checks.externalPlainMixedSingleUndo = JSON.stringify((await snapshot()).json) === JSON.stringify(externalPlainMixedBefore.json);

    const spectrumRegressionPaste = '#### 3.2.2 质量与年度光谱代表性\n局部质量 (L_{t,p}) 为像元 (p) 的 (7\\times7) 邻域内质量合格像元比例，覆盖项使用原始覆盖率 (c_t)。\n时间项采用标准差为 45 d 的高斯函数：\n\\exp\\left[\n-\\frac{1}{2}\n\\left(\n\\frac{d_{\\mathrm{circ}}(t,\\tau)}{45}\n\\right)^2\n\\right]\n\\tag{2}\n]\n其中，d_circ 为年内环形日距。\n令 (m_{p,b}) 为像元年度有效观测在波段 (b) 的中位数，年度代表性 (A_{t,p}) 根据标准化距离计算：\n\\max\\left[\n\\operatorname{IQR}_{t}/Z_{t,b},0.02\n\\right]\n]';
    await setContent('<p>光谱测试插入点</p>');
    await selectText('paragraph', '光谱测试插入点', 4);
    const spectrumBefore = await snapshot();
    await pastePlain(spectrumRegressionPaste); await wait(140);
    const spectrumAfter = await snapshot();
    const spectrumInline = spectrumAfter.nodes.filter(node => node.type === 'formula_inline').map(node => node.attrs.latex);
    checks.spectrumRegressionHeading = spectrumAfter.nodes.some(node => node.type === 'heading' && node.attrs.level === 4 && node.text === '3.2.2 质量与年度光谱代表性');
    checks.spectrumRegressionInlineFormulas = ['L_{t,p}', '7\\times7', 'c_t', 'm_{p,b}', 'A_{t,p}'].every(latex => spectrumInline.includes(latex));
    checks.spectrumRegressionKeepsPlainParentheses = !spectrumInline.includes('p') && !spectrumInline.includes('b') && spectrumAfter.top.some(node => node.text.includes('像元 (p)')) && spectrumAfter.top.some(node => node.text.includes('波段 (b)'));
    checks.spectrumRegressionBlockFormulas = spectrumAfter.nodes.filter(node => node.type === 'formula_block').length === 2
      && spectrumAfter.nodes.some(node => node.type === 'formula_block' && node.attrs.latex.startsWith('\\exp\\left[') && node.attrs.latex.includes('\\tag{2}'))
      && spectrumAfter.nodes.some(node => node.type === 'formula_block' && node.attrs.latex.startsWith('\\max\\left['));
    await run('window.qijianEditor.undo()'); await wait(70);
    checks.spectrumRegressionSingleUndo = JSON.stringify((await snapshot()).json) === JSON.stringify(spectrumBefore.json);

    await setContent('<p>完整原文插入点</p>');
    await selectText('paragraph', '完整原文插入点', 4);
    const completeFormulaBefore = await snapshot();
    await pasteRich(completeFormulaMethod, completeFormulaRichHtml); await wait(350);
    const completeFormulaAfter = await snapshot();
    const completeFormulaBlocks = completeFormulaAfter.nodes.filter(node => node.type === 'formula_block');
    const completeFormulaInlines = completeFormulaAfter.nodes.filter(node => node.type === 'formula_inline');
    checks.completeFormulaDocumentAllBlocks = completeFormulaBlocks.length === completeFormulaCounts.block;
    checks.completeFormulaDocumentAllInlines = completeFormulaInlines.length === completeFormulaCounts.inline;
    checks.completeFormulaDocumentKeepsHeadings = completeFormulaAfter.nodes.some(node => node.type === 'heading' && node.attrs.level === 2 && node.text === '3 方法')
      && completeFormulaAfter.nodes.some(node => node.type === 'heading' && node.attrs.level === 4 && node.text === '3.2.3 局部空间反差');
    checks.completeFormulaDocumentKeepsCode = JSON.stringify(completeFormulaAfter.json).includes('"code"') && completeFormulaAfter.top.some(node => node.text.includes('QA_PIXEL'));
    checks.completeFormulaDocumentNoRawDelimiters = !completeFormulaAfter.nodes.some(node => ['paragraph','heading'].includes(node.type) && /\\\[|\\\]|\\\(|\\\)/.test(node.text));
    checks.completeFormulaDocumentRepresentativeNodes = completeFormulaBlocks.some(node => node.attrs.latex.includes('K_{t,p}') && node.attrs.latex.includes('\\mu^{\\mathrm{ring}}_{t,p,b}'))
      && completeFormulaBlocks.some(node => node.attrs.latex.includes('\\widetilde S_{t,p}') && node.attrs.latex.includes('\\tag{4}'))
      && completeFormulaInlines.some(node => node.attrs.latex === 'K')
      && completeFormulaInlines.some(node => node.attrs.latex === '[0,1]');
    await run('window.qijianEditor.undo()'); await wait(100);
    checks.completeFormulaDocumentSingleUndo = JSON.stringify((await snapshot()).json) === JSON.stringify(completeFormulaBefore.json);

    await setContent(tableHtml);
    await run(`document.querySelector('#editor .table-edit-button').click()`); await wait(30);
    await run(`(() => {const input=document.querySelector('#tableEditorGrid input');input.value='新标题';input.oninput();document.querySelector('#tableEditorSave').click()})()`);
    const editedTable = await snapshot();
    checks.tableDialogEditsTransactionally = editedTable.nodes.some(x => x.type === 'table_block' && JSON.parse(x.attrs.matrix)[0][0] === '新标题');
    await run('window.qijianEditor.undo()'); await wait(50);
    checks.tableDialogUndo = (await snapshot()).nodes.some(x => x.type === 'table_block' && JSON.parse(x.attrs.matrix)[0][0] === '列一');

    await setContent('<h2>小标题</h2><p>AB</p>');
    await selectText('paragraph', 'AB', 1);
    await pastePlain('量'); await wait(50);
    const plainPaste = await snapshot();
    checks.externalPlainPasteIsInline = plainPaste.top.map(x => x.type).join(',') === 'heading,paragraph' && plainPaste.top[1].text === 'A量B';
    await run('window.qijianEditor.undo()'); await wait(50);
    checks.externalPlainPasteUndo = (await snapshot()).top[1].text === 'AB';

    await setContent('<p></p>');
    await run('window.qijianEditor.setTextSelection(1)');
    win.webContents.sendInputEvent({type:'char',keyCode:'#'});win.webContents.sendInputEvent({type:'char',keyCode:' '});await wait(100);
    checks.headingMarkerInputRule = (await snapshot()).top[0].type === 'heading';

    await setContent('<p></p>');
    await run('window.qijianEditor.setTextSelection(1)');
    win.webContents.sendInputEvent({type:'char',keyCode:'-'});win.webContents.sendInputEvent({type:'char',keyCode:' '});await wait(100);
    checks.outlineMarkerInputRule = (await snapshot()).nodes.some(x => x.type === 'bullet_list' && x.text === '');

    await setContent('<p>正文</p><ul class="outline-list"><li><p>父项</p><ul class="outline-list"><li><p>子项</p></li></ul></li><li><p>同级项</p></li></ul><h2>结尾标题</h2>');
    const outlineLineMarkers=await run(`(()=>{numbers();const markers=[...document.querySelectorAll('#lineNumbers span')];return{labels:markers.map(node=>node.textContent),tops:markers.map(node=>parseFloat(node.style.top))}})()`);
    checks.outlineItemsHaveLineMarkers=outlineLineMarkers.labels.join(',')==='1,2,3,4,5'&&outlineLineMarkers.tops.every((top,index,list)=>index===0||top>list[index-1]);

    const longParagraphs = prefix => Array.from({length: 36}, (_, index) => `<p>${prefix} ${index + 1}：用于制造足够的正文高度，使大纲条目位于文稿中部。</p>`).join('');
    const richOutline = '<ul class="outline-list"><li><p>可收起父项</p><ul class="outline-list"><li><p>子项甲</p><div class="image-row"><figure class="editor-image" data-image-id="outline-motion-image"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="大纲图片"><figcaption></figcaption></figure></div><div class="editor-formula formula-block" data-latex="\\frac{x}{y}" data-formula-source="\\[\\frac{x}{y}\\]"></div><div class="table-block"><table><tbody><tr><th>甲</th><th>乙</th></tr><tr><td>1</td><td>2</td></tr></tbody></table></div></li><li><p>子项乙</p></li></ul></li><li><p>后续同级项</p></li></ul>';
    await setContent(longParagraphs('前文')+richOutline+longParagraphs('后文'));
    await wait(260);
    await run('window.qijianEditor.setTextSelection(1)');
    const outlineBeforeMotion = await snapshot();
    const collapseScroll = await run(`(async()=>{const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),writing=document.querySelector('.writing');let item=[...document.querySelectorAll('#editor li')].find(node=>node.textContent.includes('可收起父项')),branch=item.querySelector(':scope>ul,:scope>ol');const fullHeight=branch.getBoundingClientRect().height;writing.scrollTop=item.getBoundingClientRect().top-writing.getBoundingClientRect().top+writing.scrollTop-180;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const before=writing.scrollTop;window.qijianEditor.toggleCollapseFromDOM(item);await delay(75);item=[...document.querySelectorAll('#editor li')].find(node=>node.textContent.includes('可收起父项'));branch=item.querySelector(':scope>ul,:scope>ol');let style=getComputedStyle(branch);const collapseMid={height:branch.getBoundingClientRect().height,opacity:+style.opacity,visibility:style.visibility};await delay(180);style=getComputedStyle(branch);const collapseEnd={height:branch.getBoundingClientRect().height,opacity:+style.opacity,visibility:style.visibility};const collapsed=item.classList.contains('outline-collapsed'),afterCollapse=writing.scrollTop;window.qijianEditor.toggleCollapseFromDOM(item);await delay(75);item=[...document.querySelectorAll('#editor li')].find(node=>node.textContent.includes('可收起父项'));branch=item.querySelector(':scope>ul,:scope>ol');style=getComputedStyle(branch);const expandMid={height:branch.getBoundingClientRect().height,opacity:+style.opacity,visibility:style.visibility};await delay(180);style=getComputedStyle(branch);const expandEnd={height:branch.getBoundingClientRect().height,opacity:+style.opacity,visibility:style.visibility};return{supports:typeof branch.animate==='function',fullHeight,before,afterCollapse,afterExpand:writing.scrollTop,collapsed,expanded:!item.classList.contains('outline-collapsed'),collapseMid,collapseEnd,expandMid,expandEnd}})()`);
    checks.outlineCollapseKeepsScrollPosition=collapseScroll.before>100&&collapseScroll.collapsed&&collapseScroll.expanded&&Math.abs(collapseScroll.afterCollapse-collapseScroll.before)<2&&Math.abs(collapseScroll.afterExpand-collapseScroll.before)<2;
    checks.outlineCollapseAnimates=collapseScroll.supports&&collapseScroll.fullHeight>0&&collapseScroll.collapseMid.visibility==='visible'&&collapseScroll.collapseMid.height>0&&collapseScroll.collapseMid.height<collapseScroll.fullHeight&&collapseScroll.collapseMid.opacity>0&&collapseScroll.collapseMid.opacity<1&&collapseScroll.collapseEnd.visibility==='hidden'&&collapseScroll.collapseEnd.height===0;
    checks.outlineExpandAnimates=collapseScroll.expandMid.visibility==='visible'&&collapseScroll.expandMid.height>0&&collapseScroll.expandMid.height<collapseScroll.fullHeight&&collapseScroll.expandMid.opacity>0&&collapseScroll.expandMid.opacity<1&&collapseScroll.expandEnd.visibility==='visible'&&Math.abs(collapseScroll.expandEnd.height-collapseScroll.fullHeight)<2&&collapseScroll.expandEnd.opacity===1;
    const outlineAfterMotion = await snapshot();
    checks.outlineMotionKeepsRichChildren=JSON.stringify(outlineAfterMotion.json)===JSON.stringify(outlineBeforeMotion.json)&&outlineAfterMotion.nodes.some(node=>node.type==='image_item'&&node.attrs.alt==='大纲图片')&&outlineAfterMotion.nodes.some(node=>node.type==='formula_block'&&node.attrs.latex==='\\frac{x}{y}')&&outlineAfterMotion.nodes.some(node=>node.type==='table_block');

    const roundTripHtml = q => run(q);
    const saved = await snapshot();
    await roundTripHtml(`window.qijianEditor.setContent(${JSON.stringify(saved.html)}, ${JSON.stringify({schemaVersion: 2, doc: saved.json})})`);
    checks.jsonRoundTripExact = JSON.stringify((await snapshot()).json) === JSON.stringify(saved.json);

    const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
    console.log(JSON.stringify({checks, failed}, null, 2));
    if (failed.length) exitCode = 1;
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    try { fs.rmSync(root, {recursive: true, force: true}); } catch (_) {}
    app.exit(exitCode);
  }
});

app.on('window-all-closed', () => {});
