const {app,BrowserWindow}=require('electron'),fs=require('fs'),os=require('os'),path=require('path');
process.env.QIJIAN_TEST_LIBRARY_ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'qijian-floating-'));
require('../src/main.js');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 try{
  const win=BrowserWindow.getAllWindows()[0];
  await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));await pause(3600);
  const checks=await win.webContents.executeJavaScript('('+function(){
   $('#editor').innerHTML='<ul><li>甲大纲<ul><li>甲子项</li></ul></li></ul><p>两处大纲之间的正文</p><ol><li>乙大纲<ol><li>乙子项</li></ol></li></ol>';
   persist();numbers();
   const result={};
   result.twoEntrances=$$('#mindmapButtons button').length===2;
   $$('#mindmapButtons button')[0].click();$$('#mindmapButtons button')[1].click();
   const windows=$$('#mindmapWindows .mindmap-window');
   result.twoWindows=windows.length===2;
   result.firstScoped=windows[0].textContent.includes('甲大纲')&&windows[0].textContent.includes('甲子项')&&!windows[0].textContent.includes('乙大纲');
   result.secondScoped=windows[1].textContent.includes('乙大纲')&&windows[1].textContent.includes('乙子项')&&!windows[1].textContent.includes('甲大纲');
   result.mapReadOnly=!windows.some(panel=>panel.querySelector('[contenteditable],input,textarea'));
   const list=$$('#editor > ul > li')[0];list.firstChild.textContent='甲大纲更新';persist();
   result.liveUpdate=windows[0].textContent.includes('甲大纲更新')&&!windows[1].textContent.includes('甲大纲更新');
   openSettings();const settings=$('#settingsDialog'),rect=settings.getBoundingClientRect();
   result.settingsFloating=rect.width<innerWidth-30&&rect.height<innerHeight-30&&getComputedStyle(settings).position==='fixed';
   result.settingsHandle=!!$('#settingsDragHandle');
   menu('file',$('[data-menu="file"]'));const menuButton=$('#menuPopup button'),rail=$('.folders nav>button');
   result.uiFonts=Math.abs(parseFloat(getComputedStyle(menuButton).fontSize)-parseFloat(getComputedStyle(rail).fontSize))<.1&&Math.abs(parseFloat(getComputedStyle(settings.querySelector('.settings-fields label')).fontSize)-parseFloat(getComputedStyle(rail).fontSize))<.1;
   result.menuRows=Math.abs(menuButton.getBoundingClientRect().height-rail.getBoundingClientRect().height)<3;
   return result
  }.toString()+')()');
  const settingsBefore=await win.webContents.executeJavaScript('('+function(){const r=$('#settingsDialog').getBoundingClientRect();return {x:r.x,y:r.y}}.toString()+')()');
  const sx=Math.round(settingsBefore.x+55),sy=Math.round(settingsBefore.y+15);
  win.webContents.sendInputEvent({type:'mouseMove',x:sx,y:sy});
  win.webContents.sendInputEvent({type:'mouseDown',x:sx,y:sy,button:'left',clickCount:1});
  win.webContents.sendInputEvent({type:'mouseMove',x:sx+78,y:sy+42,button:'left'});
  win.webContents.sendInputEvent({type:'mouseUp',x:sx+78,y:sy+42,button:'left',clickCount:1});
  await pause(150);
  const settingsAfter=await win.webContents.executeJavaScript('('+function(){const r=$('#settingsDialog').getBoundingClientRect();return {x:r.x,y:r.y}}.toString()+')()');
  checks.settingsDrags=settingsAfter.x>settingsBefore.x+30&&settingsAfter.y>settingsBefore.y+15;
  await win.webContents.executeJavaScript("$('#settingsDialog').classList.add('hidden')");
  const mapBefore=await win.webContents.executeJavaScript('('+function(){const r=$('#mindmapWindows .mindmap-window').getBoundingClientRect();return {x:r.x,y:r.y}}.toString()+')()');
  const mx=Math.round(mapBefore.x+70),my=Math.round(mapBefore.y+16);
  win.webContents.sendInputEvent({type:'mouseMove',x:mx,y:my});
  win.webContents.sendInputEvent({type:'mouseDown',x:mx,y:my,button:'left',clickCount:1});
  win.webContents.sendInputEvent({type:'mouseMove',x:mx-75,y:my+44,button:'left'});
  win.webContents.sendInputEvent({type:'mouseUp',x:mx-75,y:my+44,button:'left',clickCount:1});
  await pause(150);
  const mapAfter=await win.webContents.executeJavaScript('('+function(){const r=$('#mindmapWindows .mindmap-window').getBoundingClientRect();return {x:r.x,y:r.y}}.toString()+')()');
  checks.mapDrags=mapAfter.x<mapBefore.x-25&&mapAfter.y>mapBefore.y+15;
  console.log(checks);app.exit(Object.values(checks).every(Boolean)?0:1)
 }catch(error){console.error(error);app.exit(1)}
}).catch(error=>{console.error(error);app.exit(1)});
