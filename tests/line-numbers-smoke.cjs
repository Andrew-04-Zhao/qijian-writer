const {app,BrowserWindow}=require('electron'),fs=require('fs'),os=require('os'),path=require('path');
process.env.QIJIAN_TEST_LIBRARY_ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'qijian-lines-'));
require('../src/main.js');
app.whenReady().then(async()=>{
 await new Promise(r=>setTimeout(r,2400));
 const win=BrowserWindow.getAllWindows().find(item=>item.webContents.getURL().includes('index.html'));
 const result=await win.webContents.executeJavaScript(`(async()=>{
  const d={id:'line-test',type:'document',title:'',parentId:null,order:1,deletedAt:null,versions:[],content:'<h1>标题</h1><ul><li>'+ '长段落测试自动换行。'.repeat(20)+'</li><li>下一项</li></ul><p>末段</p>'};
  library.nodes.push(d);select(d.id);$('#editor').style.width='340px';library.settings.lineHeight=1.5;settings();
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));numbers();
  const blocks=[...$('#editor').querySelectorAll('h1,li,p')],spans=$$('#lineNumbers span'),old=spans[2].getBoundingClientRect().top;
  const checks={count:spans.length===4,wrapped:blocks[1].getBoundingClientRect().height>parseFloat(getComputedStyle(blocks[1]).lineHeight)*1.5,font:getComputedStyle($('#lineNumbers')).fontFamily.includes('Times New Roman'),centered:blocks.every((b,i)=>{const r=b.getBoundingClientRect(),n=spans[i].getBoundingClientRect();return Math.abs((n.top+n.height/2)-(r.top+parseFloat(getComputedStyle(b).lineHeight)/2))<1.5})};
  checks.mapButtonVisible=$$('#mindmapButtons button').length===1;
  $('#mindmapButtons button').click();
  checks.mapFloating=$$('#mindmapWindows .mindmap-window').length===1;checks.mapNodes=$$('#mindmapWindows .map-node').length===3;
  $('#mindmapWindows').replaceChildren();
  library.settings.lineHeight=2.2;settings();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));numbers();
  checks.spacing=$('#lineNumbers').children[2].getBoundingClientRect().top>old+3;
  $('#editor').innerHTML='<h1><br></h1><h1><br></h1><h1><br></h1><h2><div><br></div><div><br></div><div><br></div><div>中华</div></h2><div><br></div>';
  numbers();
  const nested=$$('#lineNumbers span'),textLine=$$('#editor h2 div')[3];
  checks.nestedCount=nested.length===1;
  checks.noOverlap=nested.every((span,i)=>i===0||span.getBoundingClientRect().top-nested[i-1].getBoundingClientRect().top>8);
  checks.headingMatchesLine=Math.abs((nested[0].getBoundingClientRect().top+nested[0].getBoundingClientRect().height/2)-(textLine.getBoundingClientRect().top+parseFloat(getComputedStyle(textLine).lineHeight)/2))<1.5;
  const table=makeTableBlock([['列一','列二'],['内容','内容']]);$('#editor').appendChild(table);numbers();const tableNumber=$$('#lineNumbers span').at(-1),tableRect=table.getBoundingClientRect();checks.tableHasOneLineNumber=$$('#lineNumbers span').length===2&&Math.abs((tableNumber.getBoundingClientRect().top+tableNumber.getBoundingClientRect().height/2)-(tableRect.top+parseFloat(getComputedStyle($('#editor')).lineHeight)/2))<2;
  return checks;
 })()`);
 console.log(result);const screenshot=path.join(process.env.QIJIAN_TEST_LIBRARY_ROOT,'lines.png');fs.writeFileSync(screenshot,(await win.capturePage()).toPNG());console.log('SCREENSHOT='+screenshot);app.quit();if(Object.values(result).some(x=>!x))process.exitCode=1;
}).catch(e=>{console.error(e);app.quit();process.exitCode=1});

