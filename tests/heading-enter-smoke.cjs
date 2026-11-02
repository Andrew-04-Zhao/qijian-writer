const { app, BrowserWindow } = require('electron');
const os = require('os');
const path = require('path');

process.env.QIJIAN_TEST_LIBRARY_ROOT = path.join(os.tmpdir(), `qijian-heading-enter-${process.pid}`);
require('../src/main.js');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let exitCode = 0;

app.whenReady().then(async () => {
  try {
    await wait(2500);
    const window = BrowserWindow.getAllWindows()[0];
    const prepare = (html, selector, offset) => window.webContents.executeJavaScript(`(() => {
      const editor=document.querySelector('#editor');editor.innerHTML=${JSON.stringify(html)};resetEditorUndoHistory();editor.focus();
      const node=editor.querySelector(${JSON.stringify(selector)}).firstChild,range=document.createRange();range.setStart(node,${offset});range.collapse(true);
      const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
    })()`);
    const enter = async () => {
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
      await wait(120);
    };
    const backspace = async () => {
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' });
      await wait(120);
    };
    const deleteForward = async () => {
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Delete' });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Delete' });
      await wait(120);
    };
    const state = () => window.webContents.executeJavaScript(`(() => {
      const editor=document.querySelector('#editor'),visible=[...editor.children].filter(node=>!node.matches('[data-qijian-transient-block]')),selection=getSelection(),anchor=selection?.anchorNode?.nodeType===Node.ELEMENT_NODE?selection.anchorNode:selection?.anchorNode?.parentElement;
      return {html:editor.innerHTML,tags:visible.map(node=>node.tagName),texts:visible.map(node=>node.textContent),h1:visible.filter(node=>node.tagName==='H1').length,p:visible.filter(node=>node.tagName==='P').length,caretBlock:anchor?.closest?.('p,h1,h2,h3,h4,h5,h6')?.tagName||'',styledParagraph:!!editor.querySelector(':scope>p [style]'),emptyHeading:visible.some(node=>/^H[1-6]$/.test(node.tagName)&&!node.textContent.trim())};
    })()`);
    const checks = {};
    const title = '2.Landsat 数据与统一预处理';
    const styledTitle = `<p>前段</p><h1><span style="color:rgb(183,66,56);font-size:24px">${title}</span></h1><p>后段</p>`;

    await prepare(styledTitle, 'h1 span', 0);
    await enter();
    const startBreak = await state();
    checks.startEnterCreatesParagraphBeforeHeading = startBreak.tags.join(',') === 'P,P,H1,P' && startBreak.texts.join('|') === `前段||${title}|后段` && startBreak.h1 === 1 && startBreak.caretBlock === 'P' && !startBreak.emptyHeading;
    window.webContents.undo();await wait(100);const startUndo = await state();
    checks.startEnterUndoRestoresExactHeading = startUndo.tags.join(',') === 'P,H1,P' && startUndo.texts.join('|') === `前段|${title}|后段` && startUndo.h1 === 1 && !startUndo.emptyHeading;
    window.webContents.redo();await wait(100);const startRedo = await state();
    checks.startEnterRedoRestoresSplit = startRedo.tags.join(',') === startBreak.tags.join(',') && startRedo.texts.join('|') === startBreak.texts.join('|') && !startRedo.emptyHeading;

    await prepare(styledTitle, 'h1 span', 2);
    await enter();
    const middleBreak = await state();
    checks.middleEnterCreatesHeadingAndBody = middleBreak.tags.join(',') === 'P,H1,P,P' && middleBreak.texts.join('|') === `前段|2.|Landsat 数据与统一预处理|后段` && middleBreak.h1 === 1 && !middleBreak.styledParagraph && !middleBreak.emptyHeading;
    window.webContents.undo();await wait(100);const middleUndo = await state();
    checks.middleEnterUndoRestoresExactHeading = middleUndo.tags.join(',') === 'P,H1,P' && middleUndo.texts.join('|') === `前段|${title}|后段` && middleUndo.h1 === 1 && !middleUndo.emptyHeading;
    window.webContents.redo();await wait(100);const middleRedo = await state();
    checks.middleEnterRedoRestoresSplit = middleRedo.tags.join(',') === middleBreak.tags.join(',') && middleRedo.texts.join('|') === middleBreak.texts.join('|') && !middleRedo.emptyHeading;

    await prepare(styledTitle, 'h1 span', title.length);
    await enter();
    const endBreak = await state();
    checks.endEnterCreatesParagraphAfterHeading = endBreak.tags.join(',') === 'P,H1,P,P' && endBreak.texts.join('|') === `前段|${title}||后段` && endBreak.h1 === 1 && endBreak.caretBlock === 'P' && !endBreak.emptyHeading;
    window.webContents.undo();await wait(100);const endUndo = await state();
    checks.endEnterUndoRestoresExactHeading = endUndo.tags.join(',') === 'P,H1,P' && endUndo.texts.join('|') === `前段|${title}|后段` && endUndo.h1 === 1 && !endUndo.emptyHeading;
    window.webContents.redo();await wait(100);const endRedo = await state();
    checks.endEnterRedoRestoresSplit = endRedo.tags.join(',') === endBreak.tags.join(',') && endRedo.texts.join('|') === endBreak.texts.join('|') && !endRedo.emptyHeading;

    await prepare(styledTitle, 'h1 span', 0);
    await enter();
    const beforeStartBackspace = await state();
    await backspace();
    const startBackspace = await state();
    checks.startBackspaceRemovesBlankWithoutDuplicatingHeading = startBackspace.tags.join(',') === 'P,H1,P' && startBackspace.texts.join('|') === `前段|${title}|后段` && startBackspace.h1 === 1 && !startBackspace.emptyHeading;
    window.webContents.undo();await wait(100);const startBackspaceUndo = await state();
    checks.startBackspaceUndoRestoresBlankBeforeHeading = startBackspaceUndo.tags.join(',') === beforeStartBackspace.tags.join(',') && startBackspaceUndo.texts.join('|') === beforeStartBackspace.texts.join('|') && startBackspaceUndo.h1 === 1 && !startBackspaceUndo.emptyHeading;
    window.webContents.redo();await wait(100);const startBackspaceRedo = await state();
    checks.startBackspaceRedoRemovesBlankAgain = startBackspaceRedo.tags.join(',') === startBackspace.tags.join(',') && startBackspaceRedo.texts.join('|') === startBackspace.texts.join('|') && startBackspaceRedo.h1 === 1 && !startBackspaceRedo.emptyHeading;

    const firstHeading = `<h1><span style="color:rgb(183,66,56);font-size:24px">${title}</span></h1>`;
    await prepare(firstHeading, 'h1 span', 0);
    const firstHeadingBeforeBackspace = await state();
    await backspace();
    const firstHeadingBackspace = await state();
    checks.firstHeadingBackspaceIsNoOp = firstHeadingBackspace.tags.join(',') === 'H1' && firstHeadingBackspace.texts.join('|') === title && firstHeadingBackspace.h1 === 1 && !firstHeadingBackspace.emptyHeading;

    await prepare(firstHeading, 'h1 span', 0);
    await window.webContents.executeJavaScript(`(() => {
      const heading=document.querySelector('#editor>h1'),boundary=document.createElement('p');boundary.dataset.qijianTransientBlock='true';boundary.dataset.qijianPasteBoundary='true';boundary.setAttribute('aria-hidden','true');boundary.contentEditable='false';boundary.style.cssText='position:absolute;width:0;height:0;overflow:hidden;margin:0;padding:0;line-height:0;opacity:0';boundary.innerHTML='<br>';heading.before(boundary);
    })()`);
    await backspace();
    const boundaryFirstHeadingBackspace = await state();
    checks.boundaryBeforeFirstHeadingBackspaceIsNoOp = boundaryFirstHeadingBackspace.tags.join(',') === 'H1' && boundaryFirstHeadingBackspace.texts.join('|') === title && boundaryFirstHeadingBackspace.h1 === 1 && !boundaryFirstHeadingBackspace.emptyHeading;

    const damagedPrefix = `<h1></h1><p><br></p><h1><span style="color:rgb(183,66,56);font-size:24px">${title}</span></h1><p>后段</p>`;
    await prepare(damagedPrefix, 'h1:nth-of-type(2) span', 0);
    await backspace();
    const damagedPrefixBackspace = await state();
    checks.backspaceRepairsOldBlankHeadingPrefix = damagedPrefixBackspace.tags.join(',') === 'H1,P' && damagedPrefixBackspace.texts.join('|') === `${title}|后段` && damagedPrefixBackspace.h1 === 1 && !damagedPrefixBackspace.emptyHeading;
    window.webContents.undo();await wait(100);const damagedPrefixUndo = await state();
    checks.backspaceOldPrefixUndoRestoresExactly = damagedPrefixUndo.tags.join(',') === 'H1,P,H1,P' && damagedPrefixUndo.texts.join('|') === `||${title}|后段` && damagedPrefixUndo.h1 === 2;
    window.webContents.redo();await wait(100);const damagedPrefixRedo = await state();
    checks.backspaceOldPrefixRedoRepairsAgain = damagedPrefixRedo.tags.join(',') === damagedPrefixBackspace.tags.join(',') && damagedPrefixRedo.texts.join('|') === damagedPrefixBackspace.texts.join('|') && damagedPrefixRedo.h1 === 1 && !damagedPrefixRedo.emptyHeading;

    const mergedTitleSource = '<h1><strong>2026.</strong></h1><p><span>10.13</span></p><p>后段</p>';
    await prepare(mergedTitleSource, 'p span', 0);
    await backspace();
    const bodyMergedIntoHeading = await state();
    checks.bodyBackspaceMergeKeepsOneCleanHeading = bodyMergedIntoHeading.tags.join(',') === 'H1,P' && bodyMergedIntoHeading.texts.join('|') === '2026.10.13|后段' && bodyMergedIntoHeading.h1 === 1 && !bodyMergedIntoHeading.emptyHeading;
    await window.webContents.executeJavaScript(`(() => {const walker=document.createTreeWalker(document.querySelector('#editor h1'),NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode())if(node.textContent.includes('10.13'))break;const range=document.createRange();range.setStart(node,0);range.collapse(true);const selection=getSelection();selection.removeAllRanges();selection.addRange(range)})()`);
    await enter();
    const mergedTitleJunctionEnter = await state();
    checks.enterAtMergedTextBoundarySplitsHeadingAndBody = mergedTitleJunctionEnter.tags.join(',') === 'H1,P,P' && mergedTitleJunctionEnter.texts.join('|') === '2026.|10.13|后段' && mergedTitleJunctionEnter.h1 === 1 && !mergedTitleJunctionEnter.emptyHeading;
    window.webContents.undo();await wait(100);const mergedTitleJunctionUndo = await state();
    checks.mergedTitleJunctionUndoRestoresMerge = mergedTitleJunctionUndo.tags.join(',') === bodyMergedIntoHeading.tags.join(',') && mergedTitleJunctionUndo.texts.join('|') === bodyMergedIntoHeading.texts.join('|') && mergedTitleJunctionUndo.h1 === 1;

    await prepare(mergedTitleSource, 'p span', 0);
    await backspace();
    await window.webContents.executeJavaScript(`(() => {const node=document.querySelector('#editor h1');const range=document.createRange();range.selectNodeContents(node);range.collapse(true);const selection=getSelection();selection.removeAllRanges();selection.addRange(range)})()`);
    await enter();
    const mergedTitleStartEnter = await state();
    checks.enterAtMergedHeadingStartCreatesBodyBefore = mergedTitleStartEnter.tags.join(',') === 'P,H1,P' && mergedTitleStartEnter.texts.join('|') === '|2026.10.13|后段' && mergedTitleStartEnter.h1 === 1 && !mergedTitleStartEnter.emptyHeading;

    await prepare(mergedTitleSource, 'h1 strong', '2026.'.length);
    await deleteForward();
    const bodyDeletedIntoHeading = await state();
    checks.bodyDeleteMergeKeepsOneCleanHeading = bodyDeletedIntoHeading.tags.join(',') === 'H1,P' && bodyDeletedIntoHeading.texts.join('|') === '2026.10.13|后段' && bodyDeletedIntoHeading.h1 === 1 && !bodyDeletedIntoHeading.emptyHeading && !bodyDeletedIntoHeading.html.includes('style=');
    await enter();
    const deletedTitleJunctionEnter = await state();
    checks.enterAfterDeleteMergeSplitsHeadingAndBody = deletedTitleJunctionEnter.tags.join(',') === 'H1,P,P' && deletedTitleJunctionEnter.texts.join('|') === '2026.|10.13|后段' && deletedTitleJunctionEnter.h1 === 1 && !deletedTitleJunctionEnter.emptyHeading && !deletedTitleJunctionEnter.styledParagraph;
    window.webContents.undo();await wait(100);const deletedTitleJunctionUndo = await state();
    checks.deleteMergedTitleEnterUndoRestoresMerge = deletedTitleJunctionUndo.tags.join(',') === bodyDeletedIntoHeading.tags.join(',') && deletedTitleJunctionUndo.texts.join('|') === bodyDeletedIntoHeading.texts.join('|') && deletedTitleJunctionUndo.h1 === 1;

    await prepare(mergedTitleSource, 'h1 strong', '2026.'.length);
    await deleteForward();
    const deleteMerge = await state();
    window.webContents.undo();await wait(100);const deleteMergeUndo = await state();
    checks.deleteMergeUndoRestoresSeparateBlocks = deleteMergeUndo.tags.join(',') === 'H1,P,P' && deleteMergeUndo.texts.join('|') === '2026.|10.13|后段' && deleteMergeUndo.h1 === 1;
    window.webContents.redo();await wait(100);const deleteMergeRedo = await state();
    checks.deleteMergeRedoRestoresCleanHeading = deleteMergeRedo.tags.join(',') === deleteMerge.tags.join(',') && deleteMergeRedo.texts.join('|') === deleteMerge.texts.join('|') && deleteMergeRedo.h1 === 1 && !deleteMergeRedo.html.includes('style=');

    const failed = Object.entries(checks).filter(([, value]) => !value).map(([name]) => name);
    console.log(JSON.stringify({ checks, failed, details: failed.length ? { startBreak, startUndo, startRedo, middleBreak, middleUndo, middleRedo, endBreak, endUndo, endRedo, beforeStartBackspace, startBackspace, startBackspaceUndo, startBackspaceRedo, firstHeadingBeforeBackspace, firstHeadingBackspace, boundaryFirstHeadingBackspace, damagedPrefixBackspace, damagedPrefixUndo, damagedPrefixRedo, bodyMergedIntoHeading, mergedTitleJunctionEnter, mergedTitleJunctionUndo, mergedTitleStartEnter, bodyDeletedIntoHeading, deletedTitleJunctionEnter, deletedTitleJunctionUndo, deleteMerge, deleteMergeUndo, deleteMergeRedo } : undefined }, null, 2));
    if (failed.length) exitCode = 1;
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    app.exit(exitCode);
  }
});

app.on('window-all-closed', () => {});
