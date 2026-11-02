const {protocol,net}=require('electron');
const {randomUUID,createHash}=require('crypto');
const {pathToFileURL}=require('url');
const fs=require('fs');
protocol.registerSchemesAsPrivileged([{scheme:'qijian-image',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
const files=new Map(),sessionKey=randomUUID();
function registerImageProtocol(){protocol.handle('qijian-image',request=>{
 const url=new URL(request.url),entry=url.hostname==='asset'&&files.get(url.pathname.slice(1));
 if(!entry||!['GET','HEAD'].includes(request.method))return new Response(null,{status:404});
 return net.fetch(pathToFileURL(entry.file).href,{method:request.method});
})}
function createImageScope(){
 const tokens=new Map();
 return {urlFor(file){
  let token=tokens.get(file);if(!token){
   const stat=fs.statSync(file);
   // Stable per file revision within this launch. This is a render cache key,
   // not image deduplication: different document files always have distinct URLs.
   token=createHash('sha256').update(sessionKey+'\0'+file+'\0'+stat.size+'\0'+stat.mtimeMs+'\0'+stat.ctimeMs).digest('hex');
   const entry=files.get(token)||{file,references:0};entry.references++;files.set(token,entry);tokens.set(file,token);
  }
  return 'qijian-image://asset/'+token;
 },dispose(){for(const token of tokens.values()){const entry=files.get(token);if(entry&&!--entry.references)files.delete(token)}tokens.clear()}};
}
module.exports={registerImageProtocol,createImageScope};
