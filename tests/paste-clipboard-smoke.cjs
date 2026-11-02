const { app, BrowserWindow, clipboard } = require('electron');
const os = require('os');
const path = require('path');

process.env.QIJIAN_TEST_LIBRARY_ROOT = path.join(os.tmpdir(), `qijian-paste-clipboard-${process.pid}`);
const previousClipboard = { text: clipboard.readText(), html: clipboard.readHTML(), rtf: clipboard.readRTF() };
require('../src/main.js');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const paste = window => {
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'V', modifiers: ['control'] });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'V', modifiers: ['control'] });
};

let exitCode = 0;
app.whenReady().then(async () => {
  try {
    await wait(2500);
    const window = BrowserWindow.getAllWindows()[0];
    const copySelection = async (html, selector, start, end) => {
      await window.webContents.executeJavaScript(`(() => {const editor=document.querySelector('#editor');editor.innerHTML=${JSON.stringify(html)};editor.focus();const node=editor.querySelector(${JSON.stringify(selector)}).firstChild,range=document.createRange();range.setStart(node,${start});range.setEnd(node,${end});const selection=getSelection();selection.removeAllRanges();selection.addRange(range)})()`);
      window.webContents.copy();
      await wait(60);
    };
    const copyContents = async (html, selector) => {
      await window.webContents.executeJavaScript(`(() => {const editor=document.querySelector('#editor');editor.innerHTML=${JSON.stringify(html)};editor.focus();const target=editor.querySelector(${JSON.stringify(selector)}),range=document.createRange();range.selectNodeContents(target);const selection=getSelection();selection.removeAllRanges();selection.addRange(range)})()`);
      window.webContents.copy();
      await wait(60);
    };
    const copyAcrossBlocks = async (html, startSelector, startOffset, endSelector) => {
      await window.webContents.executeJavaScript(`(() => {const editor=document.querySelector('#editor');editor.innerHTML=${JSON.stringify(html)};editor.focus();const start=editor.querySelector(${JSON.stringify(startSelector)}).firstChild,end=editor.querySelector(${JSON.stringify(endSelector)}).firstChild,range=document.createRange();range.setStart(start,${startOffset});range.setEnd(end,end.length);const selection=getSelection();selection.removeAllRanges();selection.addRange(range)})()`);
      window.webContents.copy();
      await wait(60);
    };
    const copyNode = async (html, selector) => {
      await window.webContents.executeJavaScript(`(() => {const editor=document.querySelector('#editor');editor.innerHTML=${JSON.stringify(html)};editor.focus();const target=editor.querySelector(${JSON.stringify(selector)}),range=document.createRange();range.selectNode(target);const selection=getSelection();selection.removeAllRanges();selection.addRange(range)})()`);
      window.webContents.copy();
      await wait(60);
    };
    const copyBlockSpan = async (html, startSelector, endSelector) => {
      await window.webContents.executeJavaScript(`(() => {const editor=document.querySelector('#editor');editor.innerHTML=${JSON.stringify(html)};editor.focus();const range=document.createRange();range.setStartBefore(editor.querySelector(${JSON.stringify(startSelector)}));range.setEndAfter(editor.querySelector(${JSON.stringify(endSelector)}));const selection=getSelection();selection.removeAllRanges();selection.addRange(range)})()`);
      window.webContents.copy();
      await wait(60);
    };
    const placeCaret = (html, selector, offset) => window.webContents.executeJavaScript(`(() => {const editor=document.querySelector('#editor');editor.innerHTML=${JSON.stringify(html)};editor.focus();const node=editor.querySelector(${JSON.stringify(selector)}).firstChild,range=document.createRange();range.setStart(node,${offset});range.collapse(true);const selection=getSelection();selection.removeAllRanges();selection.addRange(range)})()`);
    const state = () => window.webContents.executeJavaScript(`(() => {const editor=document.querySelector('#editor'),formatted=editor.querySelector('strong,b,em,i,u,s,strike,del,a,code,mark,ins,.md-token,.editor-comment,.editor-formula,[style*="font-weight"]'),visible=[...editor.children].filter(node=>!node.matches('[data-qijian-transient-block]'));return {html:editor.innerHTML,text:visible.map(node=>node.textContent).join(''),children:visible.length,topTags:visible.map(node=>node.tagName),topTexts:visible.map(node=>node.textContent),p:visible.filter(node=>node.tagName==='P').length,h1:visible.filter(node=>node.tagName==='H1').length,h2:visible.filter(node=>node.tagName==='H2').length,comments:(editor.innerHTML.match(/<!--/g)||[]).length,formatted:formatted?getComputedStyle(formatted).fontWeight:null,tokens:editor.querySelectorAll('.md-token').length,strong:editor.querySelectorAll('strong,b').length,em:editor.querySelectorAll('em,i').length,strike:editor.querySelectorAll('s,strike,del').length,annotation:editor.querySelectorAll('.editor-annotation,[data-qijian-mark="annotation"]').length,comment:editor.querySelectorAll('.editor-comment').length,code:editor.querySelectorAll('code').length,table:editor.querySelectorAll('table,.table-block').length,ul:editor.querySelectorAll('ul').length,ol:editor.querySelectorAll('ol').length,li:editor.querySelectorAll('li').length}})()`);

    const checks = {};
    await copySelection('<p>前课程上，后</p>', 'p', 1, 5);
    await placeCaret('<p>前后</p>', 'p', 1);
    paste(window);paste(window);paste(window);await wait(220);
    let current = await state();
    checks.repeatedPlainStaysInline = current.children === 1 && current.p === 1 && current.text === '前课程上，课程上，课程上，后' && current.comments === 0;
    window.webContents.undo();await wait(80);current = await state();
    checks.plainUndo = current.text === '前课程上，课程上，后' && current.p === 1;
    window.webContents.redo();await wait(80);current = await state();
    checks.plainRedo = current.text === '前课程上，课程上，课程上，后' && current.p === 1;

    await placeCaret('<h2>标题内容</h2>', 'h2', 2);
    paste(window);await wait(120);current = await state();
    checks.headingStaysOneBlock = current.children === 1 && current.h2 === 1 && current.text === '标题课程上，内容' && current.comments === 0;

    await copySelection('<h1>复制标题</h1><p>正文</p>', 'h1', 1, 3);
    const headingTextClipboard = { text: clipboard.readText(), html: clipboard.readHTML() };
    await placeCaret('<p>正文前后</p><p>第二段</p>', 'p', 2);
    paste(window);await wait(120);current = await state();
    checks.headingTextSelectionStaysInline = current.h1 === 0 && current.topTags.join(',') === 'P,P' && current.topTexts.join('|') === '正文制标前后|第二段';
    checks.headingTextClipboardHasNoBlock = !/<h1[\s>]/i.test(headingTextClipboard.html);

    await copySelection('<h1>复制标题</h1><p>正文</p>', 'h1', 0, 4);
    const wholeHeadingTextClipboard = { text: clipboard.readText(), html: clipboard.readHTML() };
    await placeCaret('<p>保留前段</p><p>正文前后</p><p>保留后段</p>', 'p:nth-of-type(2)', 2);
    paste(window);await wait(120);current = await state();
    checks.wholeHeadingTextSelectionKeepsHeading = current.topTags.join(',') === 'P,P,H1,P,P' && current.topTexts.join('|') === '保留前段|正文|复制标题|前后|保留后段';
    checks.wholeHeadingTextClipboardIsStructural = /<h1[\s>]/i.test(wholeHeadingTextClipboard.html) && /data-qijian-clipboard-blocks/i.test(wholeHeadingTextClipboard.html);

    await copyContents('<h1><span style="color:rgb(183,66,56);font-size:24px">2.Landsat 数据与统一预处理</span></h1>', 'span');
    const styledHeadingClipboard = { text: clipboard.readText(), html: clipboard.readHTML() };
    await placeCaret('<h1>3.两条主评价轴</h1><p>后续正文</p>', 'h1', 2);
    paste(window);await wait(130);const headingIntoHeadingPaste = await state();
    const headingIntoHeadingStyle = await window.webContents.executeJavaScript(`(() => {const heading=document.querySelector('#editor h1');return {inlineStyle:!!heading.querySelector('[style*="font-size"],[style*="color"]'),fontSize:getComputedStyle(heading).fontSize,color:getComputedStyle(heading).color}})()`);
    checks.headingIntoHeadingStaysOneHeading = headingIntoHeadingPaste.topTags.join(',') === 'H1,P' && headingIntoHeadingPaste.topTexts.join('|') === '3.2.Landsat 数据与统一预处理两条主评价轴|后续正文';
    checks.headingIntoHeadingDropsForeignVisualStyle = !headingIntoHeadingStyle.inlineStyle && /data-qijian-clipboard-blocks/i.test(styledHeadingClipboard.html);
    window.webContents.undo();await wait(80);const headingIntoHeadingUndo = await state();
    checks.headingIntoHeadingUndoRestoresStructure = headingIntoHeadingUndo.topTags.join(',') === 'H1,P' && headingIntoHeadingUndo.topTexts.join('|') === '3.两条主评价轴|后续正文';
    window.webContents.redo();await wait(80);const headingIntoHeadingRedo = await state();
    checks.headingIntoHeadingRedoKeepsStructure = headingIntoHeadingRedo.topTags.join(',') === 'H1,P' && headingIntoHeadingRedo.topTexts.join('|') === headingIntoHeadingPaste.topTexts.join('|');

    const recoveredBrokenHeading = await window.webContents.executeJavaScript(`(() => {const html=normalizeDocumentHtml('<h1><span style="color:rgb(183,66,56);font-size:24px"></span></h1><p><span>3.两条主评价轴</span></p><h2>质量</h2>'),root=document.createElement('div');root.innerHTML=html;return {html,tags:[...root.children].map(node=>node.tagName),texts:[...root.children].map(node=>node.textContent)}})()`);
    checks.brokenStyledHeadingShellIsRecovered = recoveredBrokenHeading.tags.join(',') === 'H1,H2' && recoveredBrokenHeading.texts.join('|') === '3.两条主评价轴|质量' && !/font-size/i.test(recoveredBrokenHeading.html);
    const ordinaryEmptyHeading = await window.webContents.executeJavaScript(`(() => {const html=normalizeDocumentHtml('<h1></h1><p>正文</p>'),root=document.createElement('div');root.innerHTML=html;return [...root.children].map(node=>node.tagName+':'+node.textContent).join('|')})()`);
    checks.ordinaryEmptyHeadingDoesNotPromoteBody = ordinaryEmptyHeading === 'P:|P:正文';

    await copyNode('<h1>复制标题</h1><p>正文</p>', 'h1');
    const headingBlockClipboard = { text: clipboard.readText(), html: clipboard.readHTML() };
    await placeCaret('<p>保留前段</p><p>正文前后</p><p>保留后段</p>', 'p:nth-of-type(2)', 2);
    await window.webContents.executeJavaScript(`(() => {const editor=document.querySelector('#editor');window.__qijianUntouchedBefore=editor.firstElementChild;window.__qijianUntouchedAfter=editor.lastElementChild})()`);
    paste(window);await wait(120);current = await state();
    checks.headingBlockOnlyFormatsHeading = current.h1 === 1 && current.p === 4 && current.topTags.join(',') === 'P,P,H1,P,P' && current.topTexts.join('|') === '保留前段|正文|复制标题|前后|保留后段';
    checks.blockPasteKeepsUnrelatedNodes = await window.webContents.executeJavaScript(`(() => {const editor=document.querySelector('#editor'),visible=[...editor.children].filter(node=>!node.matches('[data-qijian-transient-block]'));return window.__qijianUntouchedBefore===visible[0]&&window.__qijianUntouchedAfter===visible.at(-1)})()`);
    checks.headingBlockClipboardKeepsHeading = /<h1[\s>]/i.test(headingBlockClipboard.html);
    window.webContents.undo();await wait(70);const headingBlockUndo = await state();
    checks.headingBlockUndo = headingBlockUndo.topTags.join(',') === 'P,P,P' && headingBlockUndo.topTexts.join('|') === '保留前段|正文前后|保留后段';
    window.webContents.redo();await wait(70);const headingBlockRedo = await state();
    checks.headingBlockRedo = headingBlockRedo.h1 === 1 && headingBlockRedo.topTags.join(',') === 'P,P,H1,P,P';

    await copyNode('<h1>末尾标题</h1>', 'h1');
    await placeCaret('<p>正文</p>', 'p', 2);
    paste(window);await wait(120);current = await state();
    checks.headingAtDocumentEndDoesNotRetitleBody = current.topTags.join(',') === 'P,H1' && current.topTexts.join('|') === '正文|末尾标题';

    await copyAcrossBlocks('<h1>2026.9.28</h1><p>第一段正文</p><p>第二段正文</p>', 'h1', 0, 'p:last-of-type');
    const headingParagraphClipboard = { text: clipboard.readText(), html: clipboard.readHTML() };
    await placeCaret('<p>前后</p>', 'p', 1);
    paste(window);await wait(140);current = await state();
    checks.headingAndParagraphsKeepStructure = current.h1 === 1 && current.p === 4 && current.topTags.join(',') === 'P,H1,P,P,P' && current.topTexts.join('|') === '前|2026.9.28|第一段正文|第二段正文|后';
    checks.crossBlockClipboardIsMarked = /data-qijian-clipboard-blocks/i.test(headingParagraphClipboard.html);
    const storedBlockHtml = await window.webContents.executeJavaScript(`(() => {syncActiveDoc();return activeDoc.content})()`);
    checks.transientBlockNeverStored = !storedBlockHtml.includes('qijian-transient-block') && storedBlockHtml.includes('<h1>2026.9.28</h1>');
    window.webContents.undo();await wait(80);const blockUndo = await state();
    checks.headingParagraphUndo = blockUndo.topTags.join(',') === 'P' && blockUndo.topTexts.join('|') === '前后';
    window.webContents.redo();await wait(80);const blockRedo = await state();
    checks.headingParagraphRedo = blockRedo.h1 === 1 && blockRedo.topTags.join(',') === 'P,H1,P,P,P';

    await copyAcrossBlocks('<p>甲段</p><p>乙段</p>', 'p:first-of-type', 0, 'p:last-of-type');
    await placeCaret('<p>前后</p>', 'p', 1);
    paste(window);await wait(140);current = await state();
    checks.multipleParagraphsStaySeparate = current.p === 4 && current.topTags.join(',') === 'P,P,P,P' && current.topTexts.join('|') === '前|甲段|乙段|后';

    const mixedHtml = [
      '<h1 data-mixed="title">总标题</h1>',
      '<p data-mixed="lead">引言<strong>加粗</strong><em>斜体</em><span class="editor-annotation" data-qijian-mark="annotation">标注</span></p>',
      '<h2 data-mixed="section">小标题</h2>',
      '<ol class="outline-list" data-mixed="outline"><li>第一项<ul class="outline-list"><li>子项</li></ul></li><li>第二项</li></ol>',
      '<div class="editor-formula formula-block" data-latex="x^2" data-mixed="formula" contenteditable="false"><span class="formula-render">x²</span></div>',
      '<div class="table-block" data-mixed="table" contenteditable="false"><table><tbody><tr><th>列一</th><th>列二</th></tr><tr><td>甲</td><td>乙</td></tr></tbody></table></div>',
      '<div class="image-row" data-mixed="image" contenteditable="false"><figure class="editor-image" contenteditable="false"><img src="attachment://mixed-test.png" alt="混合测试图"></figure></div>',
      '<p data-mixed="target">目标前后</p>',
      '<p data-mixed="tail">尾段</p>'
    ].join('');
    const rememberMixedDocument = () => window.webContents.executeJavaScript(`(() => {
      const editor=document.querySelector('#editor'),keys=['title','lead','section','outline','formula','table','image','tail'];
      window.__qijianMixedStable=Object.fromEntries(keys.map(key=>{const node=editor.querySelector('[data-mixed="'+key+'"]');return [key,{node,html:node.outerHTML}]}));
      const style=node=>{const value=getComputedStyle(node);return {fontSize:value.fontSize,color:value.color,fontFamily:value.fontFamily,fontWeight:value.fontWeight}};
      window.__qijianMixedStyles={h1:style(editor.querySelector('[data-mixed="title"]')),h2:style(editor.querySelector('[data-mixed="section"]')),p:style(editor.querySelector('[data-mixed="lead"]'))};
    })()`);
    const mixedState = () => window.webContents.executeJavaScript(`(() => {
      const editor=document.querySelector('#editor'),visible=[...editor.children].filter(node=>!node.matches('[data-qijian-transient-block]')),style=node=>{const value=getComputedStyle(node);return {fontSize:value.fontSize,color:value.color,fontFamily:value.fontFamily,fontWeight:value.fontWeight}},sameStyle=(left,right)=>Object.keys(left).every(key=>left[key]===right[key]),stable=Object.entries(window.__qijianMixedStable||{});
      const insertedTitle=visible.find((node,index)=>node.tagName==='H1'&&node.textContent==='插入标题'&&index>0),insertedSpanStart=visible.findIndex((node,index)=>index>2&&node.tagName==='H1'&&node.textContent==='总标题');
      return {
        tags:visible.map(node=>node.tagName),texts:visible.map(node=>node.textContent),
        stableIdentity:stable.every(([key,value])=>value.node===editor.querySelector('[data-mixed="'+key+'"]')),
        stableHtml:stable.every(([,value])=>value.node.outerHTML===value.html),
        counts:{h1:visible.filter(node=>node.tagName==='H1').length,h2:visible.filter(node=>node.tagName==='H2').length,p:visible.filter(node=>node.tagName==='P').length,outline:editor.querySelectorAll('[data-mixed="outline"]').length,formula:editor.querySelectorAll('[data-mixed="formula"] .formula-render').length,table:editor.querySelectorAll('[data-mixed="table"] table').length,image:editor.querySelectorAll('[data-mixed="image"] img').length},
        insertedTitleStyle:!!insertedTitle&&sameStyle(style(insertedTitle),window.__qijianMixedStyles.h1),
        insertedSpanStyles:insertedSpanStart>=0&&sameStyle(style(visible[insertedSpanStart]),window.__qijianMixedStyles.h1)&&sameStyle(style(visible[insertedSpanStart+1]),window.__qijianMixedStyles.p)&&sameStyle(style(visible[insertedSpanStart+2]),window.__qijianMixedStyles.h2)
      };
    })()`);

    await copySelection('<h1>插入标题</h1>', 'h1', 0, 4);
    const mixedWholeHeadingClipboard = { text: clipboard.readText(), html: clipboard.readHTML() };
    await placeCaret(mixedHtml, '[data-mixed="target"]', 2);
    await rememberMixedDocument();
    paste(window);await wait(160);const mixedHeadingPaste = await mixedState();
    checks.mixedDocumentHeadingKeepsEveryOtherPart = mixedHeadingPaste.stableIdentity && mixedHeadingPaste.stableHtml && mixedHeadingPaste.counts.outline === 1 && mixedHeadingPaste.counts.formula === 1 && mixedHeadingPaste.counts.table === 1 && mixedHeadingPaste.counts.image === 1;
    checks.mixedDocumentHeadingOnlyFormatsInsertedHeading = mixedHeadingPaste.tags.join(',') === 'H1,P,H2,OL,DIV,DIV,DIV,P,H1,P,P' && mixedHeadingPaste.texts.join('|') === '总标题|引言加粗斜体标注|小标题|第一项子项第二项|x²|列一列二甲乙||目标|插入标题|前后|尾段' && mixedHeadingPaste.counts.h1 === 2 && mixedHeadingPaste.counts.h2 === 1 && mixedHeadingPaste.counts.p === 4;
    checks.mixedDocumentWholeHeadingTextIsStructural = /<h1[\s>]/i.test(mixedWholeHeadingClipboard.html) && /data-qijian-clipboard-blocks/i.test(mixedWholeHeadingClipboard.html);
    checks.mixedDocumentInsertedHeadingUsesHeadingStyle = mixedHeadingPaste.insertedTitleStyle;
    window.webContents.undo();await wait(90);const mixedHeadingUndo = await mixedState();
    checks.mixedDocumentHeadingUndo = mixedHeadingUndo.tags.join(',') === 'H1,P,H2,OL,DIV,DIV,DIV,P,P' && mixedHeadingUndo.texts.at(-2) === '目标前后' && mixedHeadingUndo.counts.h1 === 1 && mixedHeadingUndo.counts.h2 === 1;
    window.webContents.redo();await wait(90);const mixedHeadingRedo = await mixedState();
    checks.mixedDocumentHeadingRedo = mixedHeadingRedo.tags.join(',') === mixedHeadingPaste.tags.join(',') && mixedHeadingRedo.texts.join('|') === mixedHeadingPaste.texts.join('|');

    await copyBlockSpan(mixedHtml, '[data-mixed="title"]', '[data-mixed="section"]');
    const mixedSpanClipboard = { text: clipboard.readText(), html: clipboard.readHTML() };
    await placeCaret(mixedHtml, '[data-mixed="target"]', 2);
    await rememberMixedDocument();
    paste(window);await wait(180);const mixedSpanPaste = await mixedState();
    checks.mixedDocumentRangeClipboardIsStructural = /data-qijian-clipboard-blocks/i.test(mixedSpanClipboard.html);
    checks.mixedDocumentRangeKeepsBlockKinds = mixedSpanPaste.tags.join(',') === 'H1,P,H2,OL,DIV,DIV,DIV,P,H1,P,H2,P,P' && mixedSpanPaste.counts.h1 === 2 && mixedSpanPaste.counts.h2 === 2 && mixedSpanPaste.counts.p === 5;
    checks.mixedDocumentRangeKeepsEveryOtherPart = mixedSpanPaste.stableIdentity && mixedSpanPaste.stableHtml && mixedSpanPaste.counts.outline === 1 && mixedSpanPaste.counts.formula === 1 && mixedSpanPaste.counts.table === 1 && mixedSpanPaste.counts.image === 1;
    checks.mixedDocumentRangeKeepsEachStyle = mixedSpanPaste.insertedSpanStyles;
    window.webContents.undo();await wait(90);const mixedSpanUndo = await mixedState();
    checks.mixedDocumentRangeUndo = mixedSpanUndo.tags.join(',') === 'H1,P,H2,OL,DIV,DIV,DIV,P,P' && mixedSpanUndo.texts.at(-2) === '目标前后' && mixedSpanUndo.counts.h1 === 1 && mixedSpanUndo.counts.h2 === 1;
    window.webContents.redo();await wait(90);const mixedSpanRedo = await mixedState();
    checks.mixedDocumentRangeRedo = mixedSpanRedo.tags.join(',') === mixedSpanPaste.tags.join(',') && mixedSpanRedo.texts.join('|') === mixedSpanPaste.texts.join('|');

    await copySelection('<p>前<strong>加粗</strong>后</p>', 'strong', 0, 2);
    await placeCaret('<p>前后</p>', 'p', 1);
    paste(window);await wait(120);current = await state();
    checks.semanticFormattingKept = current.p === 1 && current.text === '前加粗后' && Number(current.formatted) >= 600 && current.comments === 0;
    window.webContents.undo();await wait(80);const boldUndo = await state();window.webContents.redo();await wait(80);const boldRedo = await state();
    checks.semanticUndoRedo = boldUndo.html === '<p>前后</p>' && boldRedo.p === 1 && boldRedo.text === '前加粗后' && Number(boldRedo.formatted) >= 600;

    const formats = [
      { name: 'bold', html: '<p>前<strong>加粗</strong>后</p>', selector: 'strong', key: 'strong' },
      { name: 'italic', html: '<p>前<em>斜体</em>后</p>', selector: 'em', key: 'em' },
      { name: 'strike', html: '<p>前<s>删除</s>后</p>', selector: 's', key: 'strike' },
      { name: 'annotation', html: '<p>前<span class="editor-annotation" data-qijian-mark="annotation">高亮</span>后</p>', selector: '.editor-annotation', key: 'annotation' },
      { name: 'comment', html: '<p>前<span class="editor-comment">评论</span>后</p>', selector: '.editor-comment', key: 'comment' },
      { name: 'code', html: '<p>前<code>代码</code>后</p>', selector: 'code', key: 'code' }
    ];
    const formatDetails = {};
    for (const format of formats) {
      await copySelection(format.html, format.selector, 0, 2);
      const copied = { text: clipboard.readText(), html: clipboard.readHTML() };
      await placeCaret('<p>前后</p>', 'p', 1);
      paste(window);await wait(120);current = await state();
      const passed = current.p === 1 && current.text === `前${format.selector === 's' ? '删除' : format.selector === 'strong' ? '加粗' : format.selector === 'em' ? '斜体' : format.selector === '.editor-annotation' ? '高亮' : format.selector === '.editor-comment' ? '评论' : '代码'}后` && current[format.key] > 0 && current.tokens === 0;
      checks[`format_${format.name}`] = passed;
      formatDetails[format.name] = { copied, pasted: current };
      window.webContents.undo();await wait(50);const undoState = await state();
      checks[`format_${format.name}_undo`] = undoState.html === '<p>前后</p>';
    }

    await copyContents('<p>正文含 **星号**、::冒号::、++加号++、~~波浪~~</p>', 'p');
    await placeCaret('<p>前后</p>', 'p', 1);
    paste(window);await wait(120);current = await state();
    checks.plainMarkersStayLiteral = current.text === '前正文含 **星号**、::冒号::、++加号++、~~波浪~~后' && current.strong === 0 && current.em === 0 && current.strike === 0 && current.annotation === 0 && current.comment === 0;

    await copySelection('<ul class="outline-list"><li>这是部分文字</li></ul>', 'li', 2, 4);
    const partialOutlineClipboard = { text: clipboard.readText(), html: clipboard.readHTML() };
    await placeCaret('<p>前后</p>', 'p', 1);
    paste(window);await wait(120);current = await state();
    checks.partialOutlineTextStaysInline = current.html === '<p>前部分后</p>' && current.table === 0 && current.li === 0 && partialOutlineClipboard.text === '部分';

    await copyContents('<p>补充文字</p>', 'p');
    await placeCaret('<ul class="outline-list"><li>前后</li></ul>', 'li', 1);
    paste(window);await wait(120);current = await state();
    checks.plainPasteStaysInsideOutlineItem = current.html === '<ul class="outline-list"><li>前补充文字后</li></ul>' && current.li === 1;
    window.webContents.undo();await wait(60);const outlinePlainUndo = await state();
    checks.plainPasteInOutlineUndo = outlinePlainUndo.html === '<ul class="outline-list"><li>前后</li></ul>';

    await copySelection('<p><strong>加粗内容</strong></p>', 'strong', 0, 4);
    await placeCaret('<ul class="outline-list"><li>父项<ul class="outline-list"><li>前后</li></ul></li></ul>', 'ul ul li', 1);
    paste(window);await wait(120);current = await state();const nestedFormattedState=current;
    checks.formattedPasteStaysInsideNestedOutlineItem = current.li === 2 && current.text === '父项前加粗内容后' && current.strong === 1 && /<li>前<(?:strong|b)>加粗内容<\/(?:strong|b)>后<\/li>/.test(current.html);
    window.webContents.undo();await wait(60);const nestedFormattedUndo=await state();
    checks.formattedPasteInOutlineUndo = nestedFormattedUndo.html === '<ul class="outline-list"><li>父项<ul class="outline-list"><li>前后</li></ul></li></ul>';
    window.webContents.redo();await wait(60);const nestedFormattedRedo=await state();
    checks.formattedPasteInOutlineRedo = nestedFormattedRedo.li === 2 && nestedFormattedRedo.text === '父项前加粗内容后' && nestedFormattedRedo.strong === 1 && /<li>前<(?:strong|b)>加粗内容<\/(?:strong|b)>后<\/li>/.test(nestedFormattedRedo.html);

    await copySelection('<p><span class="editor-annotation" data-qijian-mark="annotation">标注内容</span></p>', '.editor-annotation', 0, 4);
    await placeCaret('<ul class="outline-list"><li>前后</li></ul>', 'li', 1);
    paste(window);await wait(120);current = await state();
    checks.specialFormatPasteNeverBreaksOutline = current.li === 1 && current.text === '前标注内容后' && current.ul === 1;

    await copySelection('<ul class="outline-list"><li>完整一行</li></ul>', 'li', 0, 4);
    const singleOutlineClipboard = { text: clipboard.readText(), html: clipboard.readHTML() };
    await placeCaret('<p>前后</p>', 'p', 1);
    paste(window);await wait(120);current = await state();
    checks.singleCompleteOutlineStaysOutline = current.table === 0 && current.ul === 1 && current.li === 1 && singleOutlineClipboard.text === '- 完整一行' && /<ul[\s>]/i.test(singleOutlineClipboard.html);

    clipboard.writeText('甲\t乙\n丙\t丁');
    await placeCaret('<p>前后</p>', 'p', 1);
    paste(window);await wait(120);current = await state();
    checks.realTabularTextStaysTable = current.table > 0 && current.li === 0;

    await copyContents('<ul class="outline-list"><li>父项<strong>加粗</strong><ul class="outline-list"><li>子项一</li><li>子项二</li></ul></li><li>末项</li></ul>', ':scope > ul');
    const unorderedClipboard = { text: clipboard.readText(), html: clipboard.readHTML() };
    await placeCaret('<p>前后</p>', 'p', 1);
    paste(window);await wait(120);current = await state();
    checks.unorderedNotTable = current.table === 0 && current.ul >= 2 && current.li === 4 && current.strong > 0;
    checks.unorderedPlainHasNoFormatMarkers = !unorderedClipboard.text.includes('**') && unorderedClipboard.text.includes('\t- 子项一');

    await copyContents('<ol class="outline-list"><li>第一项<ol class="outline-list"><li>子编号一</li><li>子编号二</li></ol></li><li>第二项</li></ol>', ':scope > ol');
    const orderedClipboard = { text: clipboard.readText(), html: clipboard.readHTML() };
    await placeCaret('<p>前后</p>', 'p', 1);
    paste(window);await wait(120);current = await state();
    checks.orderedNotTable = current.table === 0 && current.ol >= 2 && current.li === 4;
    checks.orderedNumbersKept = /^1\. 第一项\n\t1\. 子编号一\n\t2\. 子编号二\n2\. 第二项$/.test(orderedClipboard.text);

    const failed = Object.entries(checks).filter(([, value]) => !value).map(([name]) => name);
    console.log(JSON.stringify({ checks, failed, details: failed.length ? { headingTextClipboard, wholeHeadingTextClipboard, styledHeadingClipboard, headingIntoHeadingPaste, headingIntoHeadingStyle, headingIntoHeadingUndo, headingIntoHeadingRedo, recoveredBrokenHeading, ordinaryEmptyHeading, headingBlockClipboard, headingBlockUndo, headingBlockRedo, headingParagraphClipboard, storedBlockHtml, blockUndo, blockRedo, mixedWholeHeadingClipboard, mixedHeadingPaste, mixedHeadingUndo, mixedHeadingRedo, mixedSpanClipboard, mixedSpanPaste, mixedSpanUndo, mixedSpanRedo, formatDetails, partialOutlineClipboard, nestedFormattedState, nestedFormattedUndo, nestedFormattedRedo, singleOutlineClipboard, unorderedClipboard, orderedClipboard, current } : undefined }, null, 2));
    if (failed.length) exitCode = 1;
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    clipboard.write(previousClipboard);
    app.exit(exitCode);
  }
});
app.on('window-all-closed', () => {});
