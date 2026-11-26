import test from 'node:test';import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';import {mkdtempSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {openStore} from '../server/store.mjs';import {blank} from '../web/core.mjs';import * as S from '../web/shipments.mjs';
const PORT=5200+Math.floor(Math.random()*400);
function start(env){const p=spawn(process.execPath,['server/server.mjs'],{env:{...process.env,PORT:String(PORT),...env},stdio:['ignore','pipe','pipe']});return new Promise((ok,ko)=>{let err='';p.stderr.on('data',d=>err+=d);p.stdout.on('data',d=>{if(String(d).includes('listening')||String(d).includes('http://'))ok(p)});p.on('exit',c=>ko(new Error(err||'exit '+c)));setTimeout(()=>ok(p),4000)})}
const base=`http://localhost:${PORT}`;
async function login(name){const l=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({name,password:'una-clave-larga-1'})});let c=l.headers.get('set-cookie').split(';')[0];const sr=await fetch(base+'/api/status',{headers:{cookie:c,origin:base}});const st=await sr.json();c+='; '+sr.headers.get('set-cookie').split(';')[0];return{c,csrf:st.csrf,st}}
test('API de envíos por registro: migración del estado antiguo sin pérdida, páginas, ficha, pendientes, búsqueda, escritura acotada y roles',async()=>{
 const d=mkdtempSync(join(tmpdir(),'ss-')),up=join(d,'users.json'),db=join(d,'w.db');
 for(const [n,r] of [['ana','operador'],['luis','lector']])assert.equal(spawnSync(process.execPath,['scripts/adduser.mjs',n,r],{env:{...process.env,APP_USERS_PATH:up,ADDUSER_PASSWORD:'una-clave-larga-1'}}).status,0);
 const legacy=S.demoState().shipments;const st0=blank();st0.shipments=legacy;const store=await openStore(db);await store.write(0,st0);store.close?.();
 const p=await start({APP_AUTH:'local',APP_USERS_PATH:up,APP_DATA_PATH:db,INTEGRATION_MOCK:'false'});
 try{
  const a=await login('ana');assert.equal(a.st.shipmentsApi,true);
  const H={cookie:a.c,origin:base},get=async u=>(await fetch(base+u,{headers:H})).json();
  const stats=await get('/api/shipments/stats');assert.equal(stats.shipments,legacy.items.length);assert.equal(stats.mails,legacy.mails.length);assert.equal(stats.pending,legacy.pending.length);
  assert.ok(existsSync(db+'.envios-anterior.json'),'copia del estado anterior');
  const w=await get('/api/workspace');assert.equal(w.state.shipments,undefined,'el espacio ya no arrastra los envíos');
  const list=await get('/api/shipments/list?limit=2');assert.equal(list.items.length,2);assert.ok(list.next);assert.ok(list.items[0].summary);assert.equal(list.items[0].events,undefined);
  const item=await get('/api/shipments/item?id='+legacy.items[0].id);assert.deepEqual(item.shipment,legacy.items[0]);
  assert.equal((await fetch(base+'/api/shipments/item?id=NOEXISTE',{headers:H})).status,404);
  const pend=await get('/api/shipments/pending');assert.equal(pend.pending.length,legacy.pending.length);assert.ok(pend.pending.every(x=>x.mail&&x.mail.id===x.mailId));
  const se=await get('/api/shipments/search?q='+encodeURIComponent(legacy.items[0].dua));assert.ok(se.results.some(r=>r.shipmentId===legacy.items[0].id&&r.head));
  const op=body=>fetch(base+'/api/shipments/op',{method:'POST',headers:{...H,'content-type':'application/json','x-csrf-token':a.csrf},body:JSON.stringify(body)});
  assert.equal((await fetch(base+'/api/shipments/op',{method:'POST',headers:{...H,'content-type':'application/json'},body:'{}'})).status,403);
  const c=await op({op:'create',data:{id:'TR-0777',dua:'26ES0000000777'}});assert.equal(c.status,200);assert.equal((await op({op:'create',data:{id:'TR-0777'}})).status,400);
  if(pend.pending[0]){const pm=pend.pending[0];const r=await op({op:'confirm',mailId:pm.mailId,shipmentId:'TR-0777'});assert.equal(r.status,200);assert.equal((await get('/api/shipments/stats')).pending,legacy.pending.length-1);assert.equal((await op({op:'confirm',mailId:pm.mailId,shipmentId:'TR-0777'})).status,400)}
  const l=await login('luis');const lr=await fetch(base+'/api/shipments/op',{method:'POST',headers:{cookie:l.c,origin:base,'content-type':'application/json','x-csrf-token':l.csrf},body:JSON.stringify({op:'create',data:{id:'TR-0888'}})});assert.equal(lr.status,403);
 }finally{p.kill()}
});
