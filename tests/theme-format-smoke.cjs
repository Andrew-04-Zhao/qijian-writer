const {app,BrowserWindow}=require('electron'),fs=require('fs'),os=require('os'),path=require('path');
process.env.QIJIAN_TEST_LIBRARY_ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'qijian-theme-'));
require('../src/main.js');
app.whenReady().then(async()=>{
 try{
  await new Promise(resolve=>setTimeout(resolve,2400));
  const win=BrowserWindow.getAllWindows().find(item=>item.webContents.getURL().includes('index.html'));
  const checks=await win.webContents.executeJavaScript('('+async function(){
   const checks={},editor=$('#editor'),selection=getSelection();
   checks.themes=$$('.theme-choices [data-theme-choice]').length>=10;
   checks.themeNames=['paper','solarized-light','summer-rain','ayu-light','deep-sea','dark','solarized-dark','dracula','ayu-dark','nord'].every(id=>!!$('.theme-choices [data-theme-choice="'+id+'"]'));
   editor.innerHTML='<p>**粗体**</p>';
   const raw=editor.querySelector('p').firstChild,range=document.createRange();range.setStart(raw,raw.length);range.collapse(true);selection.removeAllRanges();selection.addRange(range);
   inlineMarkdown();editor.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:'正文',bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,60));
   const token=editor.querySelector('strong'),paragraph=editor.querySelector('p');
   document.execCommand('insertText',false,'继续');await new Promise(resolve=>setTimeout(resolve,60));
   checks.markerHidden=token?.textContent==='粗体'&&!paragraph.textContent.includes('**');
   checks.outsidePlain=paragraph.textContent==='粗体正文继续'&&token.nextSibling?.textContent.includes('正文继续')&&!token.contains(token.nextSibling);
   library.settings.theme='paper';settings();const lightBackground=getComputedStyle($('.writing')).backgroundColor,lightBold=getComputedStyle(token).color;
   checks.markColorDistinct=lightBold!==getComputedStyle(paragraph).color;
   library.settings.theme='nord';settings();const darkBackground=getComputedStyle($('.writing')).backgroundColor,darkBold=getComputedStyle(token).color;
   checks.themeBackgroundChanges=lightBackground!==darkBackground;
   checks.themeMarkChanges=lightBold!==darkBold&&darkBold!==getComputedStyle(paragraph).color;
   editor.innerHTML='<p>-</p>';const dash=editor.querySelector('p').firstChild,r=document.createRange();r.setStart(dash,1);r.collapse(true);selection.removeAllRanges();selection.addRange(r);editor.focus();
   editor.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));
   await new Promise(resolve=>setTimeout(resolve,80));await new Promise(resolve=>requestAnimationFrame(resolve));
   checks.outlineCreated=!!editor.querySelector('ul > li');
   checks.outlineButtonImmediate=$$('#mindmapButtons button').length===1;
   const railFont=parseFloat(getComputedStyle($('.folders nav>button')).fontSize),stats=$('#wordStatsPanel'),statsFont=parseFloat(getComputedStyle($('#wordStatWords')).fontSize);
   checks.statsNarrow=getComputedStyle(stats).width==='126px';
   checks.statsLarger=statsFont>railFont&&parseFloat(getComputedStyle($('#wordStatChars').nextElementSibling).fontSize)>=railFont;
   return checks
  }.toString()+')()');
  console.log(checks);app.exit(Object.values(checks).every(Boolean)?0:1)
 }catch(error){console.error(error);app.exit(1)}
}).catch(error=>{console.error(error);app.exit(1)});
