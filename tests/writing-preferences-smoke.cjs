const {app, BrowserWindow} = require('electron');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const {documentFontStack, buildImageHtml} = require('../src/image-export');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qijian-writing-preferences-'));
app.setPath('userData', path.join(root, 'profile'));
process.env.QIJIAN_TEST_LIBRARY_ROOT = path.join(root, 'library');
require(process.env.QIJIAN_TEST_APP || '../src/main.js');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = {}, details = {};
app.whenReady().then(async () => {
  let win;
  const run = code => win.webContents.executeJavaScript(code, true);
  try {
    for (let i=0;i<100;i++) {
      win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html'));
      if (win && await run('typeof spellcheckState !== "undefined" && !!spellcheckState && typeof library !== "undefined" && !!activeDoc').catch(() => false)) break;
      await pause(100);
    }
    assert(win, 'Editor startup failed');
    checks.initialLanguages = await run('spellcheckState.languages.includes("en-US") && spellcheckState.languages.includes("de")');
    const ses = win.webContents.session;
    checks.nativeLanguages = ['en-US','de'].every(code => ses.getSpellCheckerLanguages().includes(code));
    details.fonts = await run('Array.from(document.querySelector("#latinFont").options, option => ({value:option.value,label:option.label}))');
    checks.moreFonts = details.fonts.length >= 20 && ['cambria','calibri','garamond','courier'].every(key => details.fonts.some(font => font.value === key));
    checks.fontGroups = await run('document.querySelectorAll("#latinFont optgroup").length === 3');
    await run('window.qijianEditor.setContent("<h2>Mixed heading</h2><p>hello <strong>bold</strong> <em>italic</em> große</p><ul><li><p>Parent</p><ul><li><p>Child</p></li></ul></li></ul><blockquote><p>Quote</p></blockquote><table><tr><td>Cell A</td><td>Cell B</td></tr></table><p>Formula <span class=\\"editor-formula formula-inline\\" data-latex=\\"x^2\\">x^2</span></p><div class=\\"image-row\\"><figure class=\\"editor-image\\"><img src=\\"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=\\"></figure></div><p>End</p>"); window.qijianEditor.setTextSelection(7); window.__beforeSpellDoc=JSON.stringify(window.qijianEditor.getDocumentJSON()); window.__beforeSpellSelection=JSON.stringify(window.qijianEditor.getSelection()); menu("edit",document.querySelector("[data-menu=edit]")); true');
    checks.editMenu = await run('document.querySelector("#menuPopup [data-action=spellcheck]").getAttribute("aria-checked") === "true" && !!document.querySelector("#menuPopup [data-action=spellcheckLanguages]")');
    await run('document.querySelector("#menuPopup [data-action=spellcheck]").click(); true');
    await pause(200);
    checks.disabled = !ses.isSpellCheckerEnabled() && await run('document.querySelector("#editor").spellcheck === false');
    checks.documentAndCaretUnchanged = await run('JSON.stringify(window.qijianEditor.getDocumentJSON())===window.__beforeSpellDoc && JSON.stringify(window.qijianEditor.getSelection())===window.__beforeSpellSelection');
    await run('openSpellcheckLanguages(); document.querySelectorAll("#spellcheckLanguageList input").forEach(input=>input.checked=false); document.querySelector("#saveSpellcheck").click(); true');
    checks.emptyLanguageRejected = await run('!document.querySelector("#spellcheckDialog").classList.contains("hidden") && document.querySelector("#spellcheckError").textContent.includes("至少")');
    await run('document.querySelector("#spellcheckLanguageList input[value=de]").checked=true; document.querySelector("#spellcheckLanguageList input[value=en-US]").checked=true; document.querySelector("#saveSpellcheck").click(); true');
    await pause(250);
    checks.languageSelectionKeepsDisabled = !ses.isSpellCheckerEnabled();
    await run('toggleSpellcheck()');
    const beforeTyping = await run('JSON.stringify(qijianEditor.getDocumentJSON())');
    await run('qijianEditor.view.dispatch(qijianEditor.view.state.tr.insertText("!"));true');
    const afterTyping = await run('JSON.stringify(qijianEditor.getDocumentJSON())');
    await run('saveSpellcheckPreferences(true,["de"])');
    await pause(150);
    await run('qijianEditor.undo();true');
    checks.languageChangePreservesUndo = beforeTyping === await run('JSON.stringify(qijianEditor.getDocumentJSON())');
    await run('qijianEditor.redo();true');
    checks.languageChangePreservesRedo = afterTyping === await run('JSON.stringify(qijianEditor.getDocumentJSON())');
    checks.reenabled = ses.isSpellCheckerEnabled() && await run('document.querySelector("#editor").spellcheck');

    // On Windows Electron's word/context-menu APIs can return empty results even
    // when Chromium paints an underline (upstream spellchecker-spec skips them).
    // Check the actual native spelling markers in captured word rectangles.
    const auditDir = path.join(__dirname,'../dist/writing-preferences');
    fs.mkdirSync(auditDir,{recursive:true});
    async function typeText(languages) {
      await run('saveSpellcheckPreferences(true,'+JSON.stringify(languages)+')');
      await run('window.qijianEditor.setContent("<p></p>");window.qijianEditor.setTextSelection(1);true');
      win.show();win.focus();
      await run('qijianEditor.view.focus();true');
      await win.webContents.insertText('hello große ist zzzzspellingwrong ');
      await pause(1600);
    }
    async function spellingAt(word, label) {
      const rect = await run('(()=>{const node=document.querySelector("#editor p").firstChild,start=node.textContent.indexOf('+JSON.stringify(word)+');const range=document.createRange();range.setStart(node,start);range.setEnd(node,start+'+word.length+');const r=range.getBoundingClientRect();return{x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)+6}})()');
      const shot=await win.webContents.capturePage(rect),bitmap=shot.toBitmap();
      let redPixels=0;
      for(let i=0;i<bitmap.length;i+=4)if(bitmap[i+2]>170&&bitmap[i+1]<125&&bitmap[i]<125)redPixels++;
      fs.writeFileSync(path.join(auditDir,label+'-'+word+'.png'),shot.toPNG());
      return {redPixels,underlined:redPixels>=20};
    }
    await typeText(['en-US','de']);
    details.initialMixedGerman=await spellingAt('große','initial-mixed');
    await typeText(['en-US']);
    details.englishOnlyGerman = await spellingAt('große','english');
    await run('saveSpellcheckPreferences(true,["en-US","de"])');
    await pause(1600);
    details.mixed = {};
    for (const word of ['hello','große','ist','zzzzspellingwrong']) details.mixed[word] = await spellingAt(word,'mixed');
    checks.defaultGermanRecognized = !details.initialMixedGerman.underlined;
    checks.germanRecognized = details.englishOnlyGerman.underlined && !details.mixed.große.underlined && !details.mixed.ist.underlined;
    checks.mixedLanguagesAndTypo = !details.mixed.hello.underlined && details.mixed.zzzzspellingwrong.underlined;
    await run('saveSpellcheckPreferences(false,["en-US","de"])');
    await pause(500);
    details.disabledTypo = await spellingAt('zzzzspellingwrong','disabled');
    checks.disableClearsMarkers = !details.disabledTypo.underlined;
    checks.noTemporaryDictionaryWords = !(await ses.listWordsInSpellCheckerDictionary()).some(word=>word.startsWith('qijianrefresh'));

    await run('library.settings.latinFont="garamond";settings();persist();flushSave()');
    checks.editorFont = await run('getComputedStyle(document.querySelector("#editor")).fontFamily.includes("Garamond")');
    checks.exportFont = documentFontStack({settings:{latinFont:'garamond',chineseFont:'yahei'}}).includes('Garamond') && buildImageHtml({html:'<p>Test</p>',settings:{latinFont:'garamond',chineseFont:'yahei'}}).includes('Garamond');
    await run('openSpellcheckLanguages();true');
    await pause(150);
    fs.mkdirSync(path.join(__dirname,'../dist/writing-preferences'),{recursive:true});
    fs.writeFileSync(path.join(__dirname,'../dist/writing-preferences/languages.png'),(await win.capturePage()).toPNG());
    await run('closeSpellcheckLanguages();flushSave()');
    const beforeReload = await run('JSON.stringify(window.qijianEditor.getDocumentJSON())');
    win.reload();
    for(let i=0;i<100;i++){await pause(100);if(await run('typeof spellcheckState!=="undefined" && !!spellcheckState && !!activeDoc').catch(()=>false))break;}
    checks.reloadPreferences = await run('!spellcheckState.enabled && spellcheckState.languages.includes("de") && library.settings.latinFont === "garamond" && !document.querySelector("#editor").spellcheck');
    checks.reloadContent = beforeReload === await run('JSON.stringify(window.qijianEditor.getDocumentJSON())');
    console.log(JSON.stringify({checks,details},null,2));
    fs.writeFileSync(path.join(__dirname,'../dist/writing-preferences/report.json'),JSON.stringify({checks,details},null,2));
    app.exit(Object.values(checks).every(Boolean)?0:1);
  } catch(error) {console.error(error);console.log(JSON.stringify({checks,details},null,2));app.exit(1);}
});
