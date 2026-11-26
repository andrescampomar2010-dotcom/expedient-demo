import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {Worker} from 'node:worker_threads';
import {openShipmentsDb} from '../server/shipments-db.mjs';
import * as S from '../web/shipments.mjs';
const d=mkdtempSync(join(tmpdir(),'sdb-'));
function synth(n,mails){const out=[];for(let id=1;id<=n;id++){const k=String(id).padStart(4,'0'),dua='26ES'+String(id).padStart(10,'0');
 const ship={created:'2026-01-01T00:00:00.000Z',id:'TR-'+k,exp:`EXP-2601-${id}`,dua,bultos:(id%9)+1,kg:100+id,client:'Cliente '+id%5,provider:'Prov '+id%3,clientDomain:`c${id%5}.example`,providerDomain:`p${id%3}.example`};
 const tpl=[['in',`c${id%5}.example`,`Carga TR-${k}`,'Confirmamos carga.'],['in',`p${id%3}.example`,`RE: Carga TR-${k}`,`Camión ${1000+id} BCD`],['out','empresa.example',`DUA ${k}`,`DUA presentado ${dua}`],['in','aviso.example','Rechazo',`Rechazada ${dua} error`],['in',`p${id%3}.example`,`Entrega TR-${k}`,'Entregado en destino, gracias.']];
 const ms=[];for(let j=0;j<mails;j++){const [dir,dom,sub,body]=tpl[j%5];ms.push({id:`m${id}-${j}`,threadId:'th'+id,from:(dir==='out'?'ops@':'x@')+dom,subject:sub,date:new Date(Date.UTC(2026,0,1,8,0)+(id*10+j)*60000).toISOString(),body})}
 out.push({ship,ms})}return out}
test('el almacén por registro da el mismo resultado que la lógica en memoria (diferencial, incluye pendientes y rechazos)',()=>{
 const db=openShipmentsDb(join(d,'a.db'),{ownDomains:['empresa.example']});const mem={shipments:S.blankShipments()};mem.shipments.ownDomains=['empresa.example'];
 const data=synth(40,5);
 for(const {ship} of data){S.addShipment(mem,ship);db.createShipment(ship)}
 const all=data.flatMap(x=>x.ms).sort((a,b)=>a.date.localeCompare(b.date));
 all.push({id:'orph',threadId:'tx',from:'x@a.example',subject:'Papeles',date:'2026-02-01T00:00:00Z',body:'¿Tenéis los papeles?'},{id:'amb',threadId:'ty',from:'x@a.example',subject:'Rechazo',date:'2026-02-01T01:00:00Z',body:'Rechazo sin DUA, 5 bultos 105 kg'});
 for(const m of all){const a=S.ingestMail(mem,structuredClone(m)),b=db.ingest(structuredClone(m));assert.equal(b.status,a.status,m.id);assert.equal(b.shipmentId,a.shipmentId,m.id)}
 const st=S.stats(mem),sb=db.stats();assert.deepEqual(sb,st);
 for(const s of mem.shipments.items){const g=db.get(s.id);assert.deepEqual(g.shipment,s,s.id);assert.deepEqual(g.summary,S.summarize(s))}
 assert.deepEqual(db.pending(500).map(p=>p.mailId),mem.shipments.pending.map(p=>p.mailId));
 assert.equal(db.ingest(all[0]).status,'duplicate');
 for(const qq of ['26ES0000000007','EXP-2601-9','TR-0012','camión 1010','entregado destino','rechazada']){
  const a=(S.search(mem,qq)||[]).map(r=>r.shipmentId).sort(),b=(db.search(qq,1000)||[]).map(r=>r.shipmentId).sort();assert.deepEqual(b,a,qq)}
 db.close();
});
test('migración desde el estado completo antiguo: sin pérdida y una sola vez',()=>{
 const legacy=S.demoState().shipments;const db=openShipmentsDb(join(d,'m.db'));
 const r=db.importLegacy(legacy);assert.equal(r.imported,true);assert.equal(r.shipments,legacy.items.length);
 assert.deepEqual(db.stats(),{shipments:legacy.items.length,mails:legacy.mails.length,pending:legacy.pending.length,openRejections:legacy.items.filter(s=>S.summarize(s).rejectionOpen).length});
 for(const s of legacy.items)assert.deepEqual(db.get(s.id).shipment,s);
 assert.equal(db.importLegacy(legacy).imported,false);db.close();
});
test('lista paginada: cubre todo una vez, sin duplicados, rechazos primero',()=>{
 const db=openShipmentsDb(join(d,'p.db'),{ownDomains:['empresa.example']});const data=synth(120,5);
 for(const {ship,ms} of data){db.createShipment(ship);for(const m of ms.slice(0,4))db.ingest(m)}
 const seen=[];let after='',pages=0;do{const p=db.list({limit:50,after});seen.push(...p.items.map(i=>i.id));after=p.next;pages++}while(after);
 assert.equal(seen.length,120);assert.equal(new Set(seen).size,120);assert.equal(pages,3);
 const rej=db.list({limit:200,onlyRejections:true}).items;assert.ok(rej.length>0&&rej.every(i=>i.summary.rejectionOpen));
 assert.equal(db.list({limit:10}).items.every(i=>i.events===undefined),true);db.close();
});
test('escrituras concurrentes de 8 procesos sobre los mismos envíos: ninguna se pierde',async()=>{
 const p=join(d,'c.db');const db=openShipmentsDb(p,{ownDomains:['empresa.example']});for(let i=1;i<=3;i++)db.createShipment({id:'TR-010'+i,dua:'26ES000000000'+i});db.close();
 const code=`const {workerData:w}=require('node:worker_threads');import(w.mod).then(({openShipmentsDb})=>{const db=openShipmentsDb(w.p);for(let i=0;i<15;i++){const sid='TR-010'+(1+i%3);const r=db.ingest({id:'w'+w.n+'-'+i,threadId:'t'+w.n+i,from:'x@a.example',subject:'RE '+sid,date:new Date(Date.UTC(2026,0,1)+(w.n*100+i)*1000).toISOString(),body:'Actualización '+sid});if(r.status!=='linked')throw Error(r.status)}db.close();require('node:worker_threads').parentPort.postMessage(1)})`;
 const mod=new URL('../server/shipments-db.mjs',import.meta.url).href;
 await Promise.all(Array.from({length:8},(_,n)=>new Promise((ok,ko)=>{const w=new Worker(code,{eval:true,workerData:{p,mod,n}});w.on('message',ok);w.on('error',ko)})));
 const r=openShipmentsDb(p);let ev=0;for(let i=1;i<=3;i++)ev+=r.get('TR-010'+i).shipment.events.length;assert.equal(ev,120);assert.equal(r.stats().mails,120);r.close();
});
test('alta de un envío con la referencia de uno ya entregado: se rechaza (no depende de que esté en el conjunto abierto)',()=>{
 const db=openShipmentsDb(join(d,'dup.db'),{ownDomains:['empresa.example']});db.createShipment({id:'TR-0500',dua:'26ES0000000500'});
 db.ingest({id:'e1',threadId:'t',from:'x@a.example',subject:'Entrega TR-0500',date:'2026-01-01T10:00:00Z',body:'Entregado en destino, gracias.'});
 assert.equal(db.get('TR-0500').shipment.status,'Entregado');assert.throws(()=>db.createShipment({id:'TR-0500'}),/SHIPMENT_EXISTS/);db.close();
});
