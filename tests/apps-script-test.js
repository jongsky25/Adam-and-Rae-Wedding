// Run: node tests/apps-script-test.js apps-script/Code.gs  (checks upload → claim → redeem with fake Google services)
// Minimal fakes for the Apps Script services Code.gs uses.
const fs = require('fs'); const vm = require('vm');
let idn = 0; const folders = {}, files = {}; const props = {};
function Folder(name){ this.id='F'+(++idn); this.name=name; this.files=[]; folders[this.id]=this; }
Folder.prototype = { getId(){return this.id}, createFolder(n){return new Folder(n)}, createFile(b){ const f={id:'f'+(++idn),blob:b,getId(){return this.id}}; this.files.push(f); return f; },
  getFiles(){ let i=0, a=this.files; return { hasNext:()=>i<a.length, next:()=>a[i++] }; } };
const rows=[]; const sheet={ appendRow(r){rows.push(r.slice())}, setName(){}, setFrozenRows(){}, getDataRange(){return {getValues:()=>rows.map(r=>r.slice())}}, getRange(r,c){return {setValue(v){rows[r-1][c-1]=v}}} };
const ctx = {
  DriveApp:{ createFolder:n=>new Folder(n), getFolderById:id=>folders[id], getFileById:()=>({moveTo(){}}) },
  SpreadsheetApp:{ create:()=>({getSheets:()=>[sheet],getId:()=>'S1'}), openById:()=>({getSheetByName:()=>sheet}) },
  PropertiesService:{ getScriptProperties:()=>({getProperty:k=>props[k]??null,setProperty:(k,v)=>{props[k]=v}}) },
  LockService:{ getScriptLock:()=>({waitLock(){},releaseLock(){}}) },
  Utilities:{ base64Decode:s=>Array.from(Buffer.from(s,'base64')), newBlob:(b,m,n)=>({b,m,n}), formatDate:()=> '120000' },
  Session:{ getScriptTimeZone:()=>'Asia/Manila' },
  ContentService:{ MimeType:{JSON:'json'}, createTextOutput:t=>({setMimeType(){return t}}) },
  Logger:{ log:m=>console.log('  log:',m) }, console,
};
vm.createContext(ctx); vm.runInContext(fs.readFileSync(process.argv[2],'utf8'), ctx);
const post = o => JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(o)}}));
const ok=(c,m)=>{ if(!c){console.log('FAIL',m);process.exitCode=1} else console.log('pass',m); };
ok(!post({action:'finish',guestId:'guest-aaaa1111',name:'A'}).ok, 'finish before setup fails');
ctx.setup();
const g='guest-aaaa1111', img=Buffer.from('fakejpeg').toString('base64');
ok(!post({action:'finish',guestId:g,name:'Tita'}).ok, 'no slip before any upload');
ok(!post({action:'upload',guestId:g,name:'Tita',filename:'a.pdf',mimeType:'application/pdf',data:img}).ok, 'non-photo rejected');
ok(post({action:'upload',guestId:g,name:'Tita',filename:'a.jpg',mimeType:'image/jpeg',data:img}).ok, 'photo upload');
ok(post({action:'upload',guestId:g,name:'Tita',filename:'b.mp4',mimeType:'video/mp4',data:img}).ok, 'video upload');
const s1=post({action:'finish',guestId:g,name:'Tita'}); ok(s1.ok && /^[A-Z0-9]{6}$/.test(s1.code) && s1.count===2, 'slip issued '+s1.code);
const s2=post({action:'finish',guestId:g,name:'Tita'}); ok(s2.code===s1.code, 'same guest keeps same code');
ok(Object.values(folders).length===2, 'one album folder + one guest folder');
ok(!post({action:'verify',code:s1.code,pin:'0000'}).ok, 'wrong PIN rejected');
const v=post({action:'verify',code:s1.code.slice(0,3)+' '+s1.code.slice(3).toLowerCase(),pin:'2468'}); ok(v.found && !v.redeemed, 'verify finds code (spaces/lowercase ok)');
const r1=post({action:'redeem',code:s1.code,pin:'2468'}); ok(r1.redeemed && !r1.alreadyRedeemed, 'first redeem gives charm');
const r2=post({action:'redeem',code:s1.code,pin:'2468'}); ok(r2.alreadyRedeemed, 'second redeem says already claimed');
ok(!post({action:'verify',code:'ZZZZZZ',pin:'2468'}).found, 'unknown code not found');
post({action:'upload',guestId:'guest-bbbb2222',name:'Lolo',filename:'c.jpg',mimeType:'image/jpeg',data:img});
const s3=post({action:'finish',guestId:'guest-bbbb2222',name:'Lolo'}); ok(s3.code!==s1.code && rows.length===3, 'second guest gets own code');
