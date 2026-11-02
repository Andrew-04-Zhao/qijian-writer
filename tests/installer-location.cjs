const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const source=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
const functions=source.slice(source.indexOf('function defaultLibraryRoot()'),source.indexOf('function dataPaths()'));
let files=new Map(),savedWrites=0;
const ctx={sessionLibraryRoot:null,process:{env:{},execPath:'E:\\Programs\\Qijian\\栖简.exe'},path,Date,JSON,
 app:{getPath:key=>key==='documents'?'C:\\Documents':'C:\\Profile\\Qijian'},
 fs:{readFileSync:file=>{if(!files.has(file))throw Error('missing');return files.get(file)},mkdirSync(){}},
 atomicWrite:(file,text)=>{files.set(file,text);savedWrites++}};
vm.createContext(ctx);vm.runInContext(functions,ctx);
const config=ctx.libraryLocationFile(),seed=path.join(path.dirname(ctx.process.execPath),'library-selection.json');
files.set(config,JSON.stringify({root:'C:\\Old'}));
files.set(seed,JSON.stringify({root:'E:\\MyWriting',installedAt:'2026-10-09T00:00:00.000Z'}));
assert.equal(ctx.configuredLibraryRoot(),'E:\\MyWriting');assert.equal(savedWrites,1);
assert.equal(ctx.configuredLibraryRoot(),'E:\\MyWriting');assert.equal(savedWrites,1);
ctx.saveLibraryLocation('D:\\LaterChoice');assert.equal(ctx.configuredLibraryRoot(),'D:\\LaterChoice');
console.log('Installer selection adopted once; later library changes preserved.');
