const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const {writeBackup,readBackupInfo}=require('../src/backup-stream');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qijian-stream-backup-')),file=path.join(root,'backup.gz');
 const images=[1,2,3,65534,65535,65536,3*1024*1024+1].map((length,i)=>{const file=path.join(root,i+'.png');fs.writeFileSync(file,crypto.randomBytes(length));return {source:'file:///test/'+i,name:i+'.png',file}});
 const snapshot={nodes:[{id:'test',content:'<h1>标题</h1><p>text</p>',versions:[]}]};const report={};
 await writeBackup(file,{snapshot,images,missingImages:[]});const packed=fs.readFileSync(file),bundle=JSON.parse(zlib.gunzipSync(packed));assert.deepEqual(bundle.library,snapshot);
 images.forEach((im,i)=>{const bytes=fs.readFileSync(im.file),out=bundle.attachments[i];assert.equal(out.bytes,bytes.length);assert.deepEqual(Buffer.from(out.data,'base64'),bytes);assert.equal(out.sha256,crypto.createHash('sha256').update(bytes).digest('hex'))});report.existingReaderAndAllBase64Boundaries=true;
 const info=await readBackupInfo(file,()=>{throw Error('Unexpected full unzip')});assert.equal(info.createdAt,bundle.createdAt);assert.equal(info.backupId,crypto.createHash('sha256').update(packed).digest('hex'));report.metadataWithoutFullRead=true;
 const old=path.join(root,'old.gz');fs.writeFileSync(old,zlib.gzipSync(JSON.stringify(bundle)));assert.equal((await readBackupInfo(old,()=>{throw Error('Unexpected fallback')})).createdAt,bundle.createdAt);report.oldBackupMetadataCompatible=true;
 await assert.rejects(writeBackup(file,{snapshot,images:[...images,{source:'missing',name:'missing.png',file:path.join(root,'missing')}],missingImages:[]}));assert.deepEqual(fs.readFileSync(file),packed);assert.equal(fs.existsSync(file+'.tmp'),false);report.failedImageReadKeepsPreviousBackup=true;
 const renamed=fs.promises.rename;fs.promises.rename=async()=>{throw Error('simulated rename failure')};await assert.rejects(writeBackup(file,{snapshot,images:[],missingImages:[]}));fs.promises.rename=renamed;assert.deepEqual(fs.readFileSync(file),packed);report.failedCommitKeepsPreviousBackup=true;
 await writeBackup(file,{snapshot,images:[],missingImages:[]});assert.equal(JSON.parse(zlib.gunzipSync(fs.readFileSync(file))).attachments.length,0);report.replaceNotAppend=true;
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
