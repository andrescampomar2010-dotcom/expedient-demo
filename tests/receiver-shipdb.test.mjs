import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {openStore} from '../server/store.mjs';import {openShipmentsDb} from '../server/shipments-db.mjs';import {createReceiver} from '../server/receiver.mjs';
const msg=(id,from,subject,body)=>({id,changeKey:id,conversationId:'c-'+id,subject,receivedDateTime:'2026-11-26T10:00:00Z',lastModifiedDateTime:'2026-11-26T10:00:00Z',hasAttachments:false,from:{emailAddress:{address:from}},body:{contentType:'html',content:body}});
const all={m1:msg('m1','aduana@x.example','Rechazo','<p>Rechazada 26ES0000999999</p>'),m2:msg('m2','ops@mia.example','Subsanación','<p>Subsanación de 26ES0000999999</p>')};
const mk=(fail)=>{let round=0;return async path=>{if(path.includes('/delta')||path.includes('deltaLink')){round++;return round===1?{value:[],'@odata.deltaLink':'https://graph.microsoft.com/v1.0/me/mailFolders/f/messages/delta?token=1'}:{value:[{id:'m1',changeKey:'m1'},{id:'m2',changeKey:'m2'}],'@odata.deltaLink':'https://graph.microsoft.com/v1.0/me/mailFolders/f/messages/delta?token=2'};}const m=path.match(/\/me\/messages\/(m\d)\?/);if(m){if(fail&&m[1]==='m2'&&fail.on){fail.on=false;throw Error('GRAPH_DOWN')}return all[m[1]]}return {value:[]};}};
test('receptor con almacén por registro: estado y "seen" fuera del documento, reintento tras fallo y reinicio sin duplicar',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rcv-sdb-'));try{
  const p=join(dir,'x.db');const store=await openStore(p);let sdb=openShipmentsDb(p,{ownDomains:['mia.example']});sdb.createShipment({id:'TR-1',dua:'26ES0000999999',bultos:5,kg:100});
  const fail={on:true};let get=mk(fail);let r=createReceiver({store,shipments:sdb,folder:'f',scopeKey:'u',since:'2026-01-01T00:00:00Z',get,ownDomains:['mia.example']});
  await r.tick();                                   // línea base
  await assert.rejects(()=>r.tick(),/GRAPH_DOWN/);  // m1 procesado, m2 falla
  assert.equal(sdb.getRec('receiver').cursor.includes('token=1'),true,'el cursor no avanza si falla');
  await r.tick();                                   // reintento: m1 ya visto, m2 entra
  assert.equal(sdb.get('TR-1').mails.length,2);
  assert.equal(sdb.seenCount('receiver'),2);
  assert.equal(store.read().state.receiver,undefined,'el documento compartido no guarda el estado del receptor');
  // reinicio: se cierra y se reabre todo, el mismo delta llega otra vez
  sdb.close();sdb=openShipmentsDb(p,{ownDomains:['mia.example']});
  const store2=await openStore(p);const rec=sdb.getRec('receiver');assert.ok(rec&&rec.baseline);
  const rev0=store2.read().revision;
  const get2=async path=>path.includes('delta')?{value:[{id:'m1',changeKey:'m1'},{id:'m2',changeKey:'m2'}],'@odata.deltaLink':'https://graph.microsoft.com/v1.0/me/mailFolders/f/messages/delta?token=3'}:all[(path.match(/\/me\/messages\/(m\d)\?/)||[])[1]]||{value:[]};
  const r2=createReceiver({store:store2,shipments:sdb,folder:'f',scopeKey:'u',since:'2026-01-01T00:00:00Z',get:get2,ownDomains:['mia.example']});
  const out=await r2.tick();assert.equal(out.events,0);
  assert.equal(sdb.get('TR-1').mails.length,2);assert.equal(sdb.seenCount('receiver'),2);
  assert.equal(store2.read().revision,rev0,'sin cambios en expedientes no se reescribe el documento compartido (no provoca 409)');
  sdb.close();
 }finally{await rm(dir,{recursive:true,force:true});}});
import {mkdtempSync} from 'node:fs';import {spawnSync} from 'node:child_process';
test('backup y restauración con base abierta incluyen envíos, correos, pendientes, seen y estado del receptor',()=>{
 const d=mkdtempSync(join(tmpdir(),'bks2-')),src=join(d,'e.db');
 const db=openShipmentsDb(src,{ownDomains:['mia.example']});db.createShipment({id:'TR-7',dua:'26ES0000000007'});
 db.ingest({id:'a1',threadId:'t1',from:'x@y.example',subject:'TR-7 en tránsito',date:'2026-11-01T10:00:00Z',body:'TR-7 en tránsito'});
 db.ingest({id:'a2',threadId:'t2',from:'z@y.example',subject:'sin referencia',date:'2026-11-01T11:00:00Z',body:'3 bultos 100 kg'});
 db.putRec('receiver',{scope:'s',baseline:true,cursor:'c1'},{a1:'v1',a2:'v1'});
 const snap=()=>JSON.stringify({s:db.stats(),r:db.getRec('receiver'),n:db.seenCount('receiver')});const before=snap();
 const run=(...a)=>spawnSync(process.execPath,['scripts/backup.mjs',...a],{encoding:'utf8'});
 const b=run('backup',src,join(d,'b'));assert.equal(b.status,0,b.stderr);const f=b.stdout.match(/Copia: (\S+)/)[1];
 db.createShipment({id:'TR-8'});db.putRec('receiver',{scope:'s',baseline:true,cursor:'c2'},{a3:'v1'});db.close();
 const x=run('restore',f,src);assert.equal(x.status,0,x.stderr);
 const back=openShipmentsDb(src,{ownDomains:['mia.example']});
 const after=JSON.stringify({s:back.stats(),r:back.getRec('receiver'),n:back.seenCount('receiver')});
 assert.equal(after,before);assert.equal(back.get('TR-8'),null);back.close();
});
