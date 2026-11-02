const assert=require('assert');
const fs=require('fs'),os=require('os'),path=require('path');
const {pathToFileURL,fileURLToPath}=require('url');
const {documentImageDirectory,adoptLibraryImageSources,adoptRemoteLibraryImageSources,removeUnreferencedAttachments,libraryImageIssues}=require('../src/library-images');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qijian-image-ownership-'));
 try{
  const attachments=path.join(root,'attachments');
  const external=path.join(root,'original image.png');fs.writeFileSync(external,'image data');
  const standard=pathToFileURL(external).href,legacy='file://'+external.replace(/\\/g,'/');
  const missing=pathToFileURL(path.join(root,'gone.png')).href;
  const doc=(id)=>({id,type:'document',content:'<img src="'+legacy+'">',contentJson:{src:standard},versions:[{content:'<img src="'+standard+'">'}]});
  const library={nodes:[doc('a'),doc('b')]};
  const result=adoptLibraryImageSources(library,attachments);
  const a=library.nodes[0].contentJson.src,b=library.nodes[1].contentJson.src;
  assert.notStrictEqual(a,b,'different documents must have independent files');
  assert.equal(path.dirname(fileURLToPath(a)),documentImageDirectory(attachments,'a'));
  assert(library.nodes[0].content.includes(a)&&library.nodes[0].versions[0].content.includes(a),'current and history share own image');
  assert.equal(fs.readdirSync(documentImageDirectory(attachments,'a')).length,1);
  assert.equal(result.documentReplacements.length,2);
  assert.equal(adoptLibraryImageSources(library,attachments).changed,0,'repeat save preserves paths');
  fs.unlinkSync(external);
  assert(fs.existsSync(fileURLToPath(a))&&fs.existsSync(fileURLToPath(b)),'source removal cannot lose copies');

  const relative=path.join(root,'relative.png');fs.writeFileSync(relative,'same');
  const second=path.join(root,'second.png');fs.writeFileSync(second,'same');
  const imported={nodes:[{id:'import',type:'document',contentJson:{one:{src:'relative.png'},two:{src:second},empty:{src:''},missing:{src:missing}}}]};
  adoptLibraryImageSources(imported,attachments,root);
  assert.notEqual(imported.nodes[0].contentJson.one.src,imported.nodes[0].contentJson.two.src,'no content deduplication');
  assert.deepEqual(libraryImageIssues(imported,attachments).map(x=>x.reason),['missing'],'blank placeholders are not missing files');
  const embedded={nodes:[{id:'embedded',type:'document',contentJson:{src:'data:image/png;base64,'+Buffer.from('embedded').toString('base64')}}]};
  adoptLibraryImageSources(embedded,attachments);
  assert(fs.existsSync(fileURLToPath(embedded.nodes[0].contentJson.src)));
  const source='https://example.test/p.png';
  const remote={nodes:['r1','r2'].map(id=>({id,type:'document',content:'<img src="'+source+'">',versions:[{content:'<img src="'+source+'">'}]}))};
  const downloaded=await adoptRemoteLibraryImageSources(remote,attachments,async()=>({data:Buffer.from('remote'),contentType:'image/png'}));
  assert.equal(downloaded.failures.length,0);assert.equal(downloaded.documentReplacements.length,2);
  assert.notEqual(remote.nodes[0].content,remote.nodes[1].content);
  assert.equal(remote.nodes[0].content,remote.nodes[0].versions[0].content);

  const orphan=path.join(documentImageDirectory(attachments,'a'),'unused.png');fs.writeFileSync(orphan,'unused');
  const other=path.join(documentImageDirectory(attachments,'b'),'unused.png');fs.writeFileSync(other,'unused');
  assert.equal(removeUnreferencedAttachments(library,attachments,0,[documentImageDirectory(attachments,'a')]).length,1);
  assert(!fs.existsSync(orphan));assert(fs.existsSync(other),'cleanup must stay within requested document');
  library.nodes[0].content='';library.nodes[0].contentJson=null;
  removeUnreferencedAttachments(library,attachments,0,[documentImageDirectory(attachments,'a')]);
  assert(fs.existsSync(fileURLToPath(a)),'history protects images');
  library.nodes[0].versions=[];
  removeUnreferencedAttachments({library,undo:{src:a}},attachments,0,[documentImageDirectory(attachments,'a')]);
  assert(fs.existsSync(fileURLToPath(a)),'undo protects images');
  removeUnreferencedAttachments(library,attachments,0,[documentImageDirectory(attachments,'a')]);
  assert(!fs.existsSync(fileURLToPath(a)));assert(fs.existsSync(fileURLToPath(b)));
  console.log('PASS: image ownership, current/history sharing, independent copies, imports, missing diagnostics and scoped cleanup');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
