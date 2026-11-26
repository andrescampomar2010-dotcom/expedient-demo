import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
import {openStore} from '../server/store.mjs';import {openStore as openKv} from '../server/store-sqlite.mjs';
const mk=()=>join(mkdtempSync(join(tmpdir(),'cs-')),'x.db');
const C=(id,n=0)=>({id,title:'Expediente '+id,n,audit:[]});
test('expedientes por registro: conflicto solo si dos personas tocan el MISMO expediente',async()=>{
 const p=mk();const a=await openStore(p),b=await openStore(p);
 let s=a.read();s.state.cases=[C('A'),C('B'),C('C')];await a.write(s.revision,s.state);
 const sa=a.read(),sb=b.read();
 assert.deepEqual(sa.state.cases.map(c=>c.id),['A','B','C']);
 sa.state.cases.find(c=>c.id==='A').n=1;await a.write(sa.revision,sa.state);                 // A cambia
 sb.state.cases.find(c=>c.id==='B').n=2;await b.write(sb.revision,sb.state);                 // B cambia desde una copia vieja: sin conflicto
 const fin=a.read().state.cases;assert.equal(fin.find(c=>c.id==='A').n,1);assert.equal(fin.find(c=>c.id==='B').n,2);
 const sc=b.read();sc.state.cases.find(c=>c.id==='A').n=9;                                    // b edita A sobre la versión que ya cambió a (se leyó después: ok)
 const sd=a.read();sd.state.cases.find(c=>c.id==='A').n=5;await a.write(sd.revision,sd.state);
 await assert.rejects(()=>b.write(sc.revision,sc.state),/CASE_CONFLICT/);                    // mismo expediente, base vieja: se rechaza
 assert.equal(a.read().state.cases.find(c=>c.id==='A').n,5,'no se pisó');
});
test('expedientes nuevos: orden más reciente primero y sin tocar los demás',async()=>{
 const p=mk();const a=await openStore(p);let s=a.read();s.state.cases=[C('A')];await a.write(s.revision,s.state);
 s=a.read();s.state.cases.unshift(C('B'));await a.write(s.revision,s.state);
 s=a.read();s.state.cases.unshift(C('C'));await a.write(s.revision,s.state);
 assert.deepEqual(a.read().state.cases.map(c=>c.id),['C','B','A']);
 assert.equal(JSON.parse(a.readJson()).state.cases.length,3);assert.deepEqual(JSON.parse(a.readJson()).state.cases.map(c=>c.id),['C','B','A']);
});
test('migración desde el documento antiguo: copia íntegra, orden y nada perdido; segunda apertura no repite',async()=>{
 const p=mk();const kv=openKv(p);const old={version:'0.1.0',cases:[C('N3'),C('N2'),C('N1')],notices:[],drafts:[],knowledge:[],history:[]};kv.write('workspace',{state:old},0);kv.close();
 process.env.APP_CASES_STORE='x';delete process.env.APP_CASES_STORE;
 const a=await openStore(p);assert.deepEqual(a.read().state.cases.map(c=>c.id),['N3','N2','N1']);
 assert.ok(existsSync(p+'.expedientes-anterior.json'));
 const kv2=openKv(p);assert.deepEqual(kv2.read('workspace').value.state.cases,[],'el documento ya no guarda expedientes');kv2.close();
 const b=await openStore(p);assert.equal(b.read().state.cases.length,3);
});
test('backup y restauración con base abierta incluyen la tabla de expedientes',async()=>{
 const p=mk();const a=await openStore(p);let s=a.read();s.state.cases=[C('A'),C('B')];await a.write(s.revision,s.state);
 const run=(...x)=>spawnSync(process.execPath,['scripts/backup.mjs',...x],{encoding:'utf8'});
 const d=join(mkdtempSync(join(tmpdir(),'bk-')),'b');const r=run('backup',p,d);assert.equal(r.status,0,r.stderr);const f=r.stdout.match(/Copia: (\S+)/)[1];
 s=a.read();s.state.cases.unshift(C('Z'));await a.write(s.revision,s.state);a.close();
 assert.equal(run('restore',f,p).status,0);const b=await openStore(p);assert.deepEqual(b.read().state.cases.map(c=>c.id),['A','B']);
});
test('avisos y borradores por registro: orden de inserción, conflicto solo en el mismo registro, backup/restauración los incluye',async()=>{
 const p=mk();const a=await openStore(p),b=await openStore(p);let s=a.read();s.state.notices=[{id:'n1',t:0}];s.state.drafts=[{id:'d1'}];await a.write(s.revision,s.state);
 const sa=a.read(),sb=b.read();sa.state.notices.push({id:'n2'});await a.write(sa.revision,sa.state);
 sb.state.notices.push({id:'n3'});await b.write(sb.revision,sb.state);                    // otro aviso, copia vieja: sin conflicto
 assert.deepEqual(a.read().state.notices.map(n=>n.id),['n1','n2','n3']);
 const x=a.read(),y=b.read();x.state.notices[0].t=1;await a.write(x.revision,x.state);y.state.notices[0].t=2;
 await assert.rejects(()=>b.write(y.revision,y.state),/RECORD_CONFLICT/);assert.equal(a.read().state.notices[0].t,1);
 const run=(...z)=>spawnSync(process.execPath,['scripts/backup.mjs',...z],{encoding:'utf8'});
 const d=join(mkdtempSync(join(tmpdir(),'bk3-')),'b');const r=run('backup',p,d);assert.equal(r.status,0,r.stderr);const f=r.stdout.match(/Copia: (\S+)/)[1];
 const z=a.read();z.state.notices.push({id:'n9'});z.state.drafts.push({id:'d9'});await a.write(z.revision,z.state);a.close();b.close();
 const rs=run('restore',f,p);assert.equal(rs.status,0,rs.stderr);const c=await openStore(p);const st=c.read().state;assert.deepEqual(st.notices.map(n=>n.id),['n1','n2','n3']);assert.deepEqual(st.drafts.map(n=>n.id),['d1']);
});
test('historial automático: un guardado que no tocó la parte común no pierde lo que escribió el receptor entre lectura y guardado; el receptor con revisión vieja falla sin escribir',async()=>{
 const p=mk();const user=await openStore(p),rcv=await openStore(p);let s=user.read();s.state.cases=[C('A')];await user.write(s.revision,s.state);
 const u=user.read(),r1=rcv.read();                                    // la persona lee
 r1.state.history.push({id:'h-auto',t:1});await rcv.write(r1.revision,r1.state);   // llega correo: el receptor escribe historial
 u.state.cases[0].n=5;await user.write(u.revision,u.state,u.docH);     // la persona guarda un expediente sin tocar la parte común
 const fin=user.read().state;assert.deepEqual(fin.history.map(h=>h.id),['h-auto'],'el historial automático se conserva');assert.equal(fin.cases[0].n,5);
 // el receptor con una lectura vieja y la parte común cambiada por otro: se rechaza (no pisa) y el llamador reintenta
 const old=rcv.read();const u2=user.read();u2.state.history.push({id:'h-user'});await user.write(u2.revision,u2.state,u2.docH);
 old.state.history.push({id:'h-auto2'});await assert.rejects(()=>rcv.write(old.revision,old.state),/REVISION_CONFLICT/);
 assert.deepEqual(user.read().state.history.map(h=>h.id),['h-auto','h-user']);
 // la persona que SÍ modificó la parte común sobre base vieja recibe 409 y su texto queda en su memoria (no se escribe nada)
 const mine=user.read();const other=rcv.read();other.state.history.push({id:'h-3'});await rcv.write(other.revision,other.state);
 mine.state.history.push({id:'mio'});await assert.rejects(()=>user.write(mine.revision,mine.state,mine.docH),/REVISION_CONFLICT/);
});
