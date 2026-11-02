const {app,BrowserWindow}=require('electron'),fs=require('fs'),os=require('os'),path=require('path');
process.env.QIJIAN_TEST_LIBRARY_ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'qijian-settings-history-'));
app.setPath('userData',path.join(process.env.QIJIAN_TEST_LIBRARY_ROOT,'profile'));
require('../src/main.js');
app.whenReady().then(async()=>{
 try{
  await new Promise(resolve=>setTimeout(resolve,2500));
  const win=BrowserWindow.getAllWindows().find(item=>item.webContents.getURL().includes('index.html'));
  const checks=await win.webContents.executeJavaScript('('+async function(){
   const checks={};
   $('#settingsDialog').classList.remove('hidden');settingsTab('theme');
   const grid=getComputedStyle($('.theme-choices')).gridTemplateColumns.split(' ').filter(Boolean);
   checks.themeTwoColumns=grid.length===2;
   checks.themeUsesTimes=getComputedStyle($('.theme-preview-line')).fontFamily.includes('Times New Roman');
   const themeModes=Object.fromEntries($$('[data-theme-choice]').map(button=>[button.title,button.querySelector('.theme-preview-mode')?.textContent]));
   checks.darkThemeIcons=['Dark','Solarized Dark','Dracula','Ayu Dark','Nord'].every(name=>themeModes[name]==='☾');
   checks.lightThemeIcons=['Light','Solarized Light','Summer Rain','Ayu Light','Deep Sea','暖纸'].every(name=>themeModes[name]==='☀');
   const originalTheme=library.settings.theme;library.settings.theme='dracula';settings();
   const colorProbe=document.createElement('i');colorProbe.style.color='var(--nav)';document.body.appendChild(colorProbe);
   const expectedToolbarColor=getComputedStyle(colorProbe).color;colorProbe.remove();
   checks.darkToolbar=getComputedStyle($('#edgebar')).backgroundColor===expectedToolbarColor&&getComputedStyle($('#edgebar')).color!=='rgb(53, 59, 67)';
   const paperProbe=document.createElement('i');paperProbe.style.color='var(--paper)';document.body.appendChild(paperProbe);
   const expectedContextColor=getComputedStyle(paperProbe).color;paperProbe.remove();
   checks.darkContextMenu=getComputedStyle($('#itemContext')).backgroundColor===expectedContextColor;
   library.settings.theme=originalTheme;settings();
   settingsTab('advanced');
   const sizes=['#settingsAdvanced .advanced-fields label','#readingSpeed','#settingsAdvanced .advanced-fields span','#settingsAdvanced .library-location-head label','#chooseLibraryLocation'].map(selector=>parseFloat(getComputedStyle($(selector)).fontSize));
   checks.advancedControlScale=sizes.every(size=>Math.abs(size-12)<.1);
   checks.advancedHelperScale=Math.abs(parseFloat(getComputedStyle($('#settingsAdvanced>p')).fontSize)-11)<.1;
   const stamp=Date.now().toString(),current='<h1>当前标题</h1><p>当前正文内容</p>',oldA='<h1>旧标题甲</h1><p>旧版本甲内容</p>',oldB='<h1>旧标题乙</h1><p>旧版本乙内容</p>';
   const doc={id:'history-'+stamp,type:'document',title:'历史测试',content:current,parentId:null,order:Date.now(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),deletedAt:null,versions:[{id:'old-a-'+stamp,at:new Date(Date.now()-3600000).toISOString(),content:oldA},{id:'old-b-'+stamp,at:new Date(Date.now()-7200000).toISOString(),content:oldB}]};
   library.nodes.push(doc);select(doc.id);openTool("versions");
   checks.historyList=$$('#versionList .history-version').length===3&&$('#versionList .history-version').classList.contains('selected');
   checks.currentButtonsDisabled=$('#saveVersionAsNew').disabled&&$('#restoreHistoryVersion').disabled;
   $$('#versionList .history-version')[1].click();
   checks.historyPreview=$('#versionPreviewContent').textContent.includes('旧版本甲内容');
   checks.historyButtonsEnabled=!$('#saveVersionAsNew').disabled&&!$('#restoreHistoryVersion').disabled;
   openItemContext({clientX:80,clientY:80},doc);
   checks.contextHasHistory=$('#itemContext').textContent.includes('历史版本');
   const before=library.nodes.length;await saveHistoryVersionAsDocument();
   checks.saveAsNew=library.nodes.length===before+1&&activeDoc.content===oldA&&activeDoc.title.includes('历史版本');
   select(doc.id);openTool('versions');historySelection='old-b-'+stamp;renderVersions();selectHistoryVersion(historySelection);window.confirm=()=>true;restoreSelectedHistoryVersion();
   checks.restoreVersion=$('#editor').textContent.includes('旧版本乙内容')&&doc.versions.some(version=>version.content===current);
   return checks
  }.toString()+')()');
  await win.webContents.executeJavaScript("history.replaceState(null,'',location.pathname);settingsTab('theme');$('#settingsDialog').classList.remove('hidden');openDetachedDialog('settingsDialog',{title:'设置',width:760,height:560,closeSelector:'#closeSettings'});true");
  await new Promise(resolve=>setTimeout(resolve,500));
  const settingsWindow=BrowserWindow.getAllWindows().find(item=>item.id!==win.id&&!item.isDestroyed());
  checks.detachedSettingsOpened=Boolean(settingsWindow);
  if(settingsWindow){
   const before=await settingsWindow.webContents.executeJavaScript("(()=>{const page=document.querySelector('#settingsTheme');page.scrollTop=Math.min(180,page.scrollHeight-page.clientHeight);const top=page.scrollTop;document.querySelector('[data-theme-choice=\"nord\"]')?.click();return top})()");
   await new Promise(resolve=>setTimeout(resolve,500));
   const after=await settingsWindow.webContents.executeJavaScript("document.querySelector('#settingsTheme')?.scrollTop||0");
   checks.themeScrollPreserved=before>0&&Math.abs(after-before)<1;
   settingsWindow.close();
  }else checks.themeScrollPreserved=false;
  console.log(checks);app.exit(Object.values(checks).every(Boolean)?0:1)
 }catch(error){console.error(error);app.exit(1)}
}).catch(error=>{console.error(error);app.exit(1)});
