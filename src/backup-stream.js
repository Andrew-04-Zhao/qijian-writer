const fs=require('fs'),zlib=require('zlib');
const {Readable}=require('stream');const {pipeline}=require('stream/promises');const {createHash}=require('crypto');
// Preserve the existing gzip JSON v1 format, streaming only attachment payloads.
async function writeBackup(file,{snapshot,images,missingImages}){
 const createdAt=new Date().toISOString(),temporary=file+'.tmp';
 async function* chunks(){
  yield JSON.stringify({format:'qijian-complete-backup',version:1,createdAt,historyIncluded:false,library:snapshot}).slice(0,-1)+',"attachments":[';
  for(let i=0;i<images.length;i++){
   const image=images[i];if(i)yield ',';
   yield JSON.stringify({source:image.source,name:image.name}).slice(0,-1)+',"data":"';
   const hash=createHash('sha256');let bytes=0,remainder=Buffer.alloc(0);
   for await(const chunk of fs.createReadStream(image.file,{highWaterMark:65535})){
    hash.update(chunk);bytes+=chunk.length;
    const data=remainder.length?Buffer.concat([remainder,chunk]):chunk,length=data.length-data.length%3;
    if(length)yield data.subarray(0,length).toString('base64');remainder=Buffer.from(data.subarray(length));
   }
   if(remainder.length)yield remainder.toString('base64');
   if(!bytes)throw new Error('备份图片为空，未覆盖原备份');
   yield '","bytes":'+bytes+',"sha256":'+JSON.stringify(hash.digest('hex'))+'}';
  }
  yield '],"missingImages":'+JSON.stringify(missingImages)+'}';
 }
 try{await pipeline(Readable.from(chunks(),{objectMode:false,highWaterMark:65536}),zlib.createGzip({level:9}),fs.createWriteStream(temporary,{flags:'w'}));await fs.promises.rename(temporary,file)}
 catch(error){await fs.promises.rm(temporary,{force:true}).catch(()=>{});throw error}
 return {createdAt,imageCount:images.length,bytes:(await fs.promises.stat(file)).size,missingImages};
}
async function hashFile(file){const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex')}
async function readHeader(file){
 const input=fs.createReadStream(file),unzip=zlib.createGunzip();input.on('error',error=>unzip.destroy(error));input.pipe(unzip);let text='';
 try{unzip.setEncoding('utf8');for await(const chunk of unzip){text+=chunk;const match=text.match(/,\s*"library"\s*:/);if(match){const header=JSON.parse(text.slice(0,match.index)+'}');return header.format==='qijian-complete-backup'&&header.version===1&&header.createdAt?header:null}if(text.length>65536)return null}return null}
 finally{input.destroy();unzip.destroy()}
}
async function readBackupInfo(file,fallback){
 try{const before=await fs.promises.stat(file);const [header,backupId]=await Promise.all([readHeader(file),hashFile(file)]);const after=await fs.promises.stat(file);
  if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ino!==after.ino)throw new Error('备份已更新，请重新点击恢复');
  if(!header){const legacy=fallback();return {createdAt:legacy.bundle.createdAt||null,bytes:legacy.bytes,backupId:legacy.backupId}}
  return {createdAt:header.createdAt,bytes:after.size,backupId};
 }catch(error){if(error.code==='ENOENT')throw new Error('没有可恢复的备份');throw new Error('备份文件已损坏或无法读取：'+error.message)}
}
module.exports={writeBackup,readBackupInfo};
