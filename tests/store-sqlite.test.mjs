import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Worker} from 'node:worker_threads';
import {openStore} from '../server/store-sqlite.mjs';
const d=mkdtempSync(join(tmpdir(),'sq-'));
test('lee, escribe y detecta versión vieja',()=>{
 const s=openStore(join(d,'a.db'));assert.equal(s.read('x').ver,0);
 assert.equal(s.write('x',{a:1},0),1);assert.equal(s.write('x',{a:2},1),2);
 assert.throws(()=>s.write('x',{a:3},1),/STALE_VERSION/);assert.deepEqual(s.read('x').value,{a:2});s.close();
});
test('varios procesos escribiendo a la vez: ninguna escritura se pierde en silencio',async()=>{
 const p=join(d,'c.db');openStore(p).write('n',{n:0},0);
 const code=`const {workerData:w}=require('node:worker_threads');import(w.mod).then(({openStore})=>{const s=openStore(w.p);let ok=0;for(let i=0;i<50;){const r=s.read('n');try{s.write('n',{n:r.value.n+1},r.ver);ok++;i++}catch(e){if(e.code!=='STALE_VERSION')throw e}}s.close();require('node:worker_threads').parentPort.postMessage(ok)})`;
 const mod=new URL('../server/store-sqlite.mjs',import.meta.url).href;
 const res=await Promise.all([1,2,3,4].map(()=>new Promise((ok,ko)=>{const w=new Worker(code,{eval:true,workerData:{p,mod}});w.on('message',ok);w.on('error',ko)})));
 assert.deepEqual(res,[50,50,50,50]);assert.equal(openStore(p).read('n').value.n,200);
});
test('backup consistente se puede abrir',()=>{
 const s=openStore(join(d,'b.db'));s.write('k',{z:1},0);const dest=join(d,'copy.db');s.backupTo(dest);s.close();
 assert.deepEqual(openStore(dest).read('k').value,{z:1});
});
test('apertura simultánea desde muchos procesos: no falla con "database is locked" (regresión: journal_mode sin busy_timeout)',async()=>{
 const p=join(d,'open.db');openStore(p).write('n',{n:0},0);
 const code=`const {workerData:w}=require('node:worker_threads');import(w.mod).then(({openStore})=>{const s=openStore(w.p);let i=0;while(i<20){const r=s.read('n');try{s.write('n',{n:r.value.n+1},r.ver);i++}catch(e){if(e.code!=='STALE_VERSION')throw e}}s.close();require('node:worker_threads').parentPort.postMessage(i)})`;
 const mod=new URL('../server/store-sqlite.mjs',import.meta.url).href;
 const res=await Promise.all(Array.from({length:30},()=>new Promise((ok,ko)=>{const w=new Worker(code,{eval:true,workerData:{p,mod}});w.on('message',ok);w.on('error',ko)})));
 assert.equal(res.length,30);assert.equal(openStore(p).read('n').value.n,600);
});
