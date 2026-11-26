import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn,spawnSync} from 'node:child_process';
const PORT=4990+Math.floor(Math.random()*500);
test('HTTP: dos personas guardan expedientes distintos sin 409; el mismo expediente da 409 por registro; la sesión guarda la versión nueva',async()=>{
 const d=mkdtempSync(join(tmpdir(),'sc-')),users=join(d,'u.json'),db=join(d,'x.db');
 for(const n of ['ana','luis'])spawnSync(process.execPath,['scripts/adduser.mjs',n,'operador'],{env:{...process.env,APP_USERS_PATH:users,ADDUSER_PASSWORD:'una-clave-larga-1'}});
 const srv=spawn(process.execPath,['server/server.mjs'],{env:{...process.env,PORT:String(PORT),APP_AUTH:'local',APP_MODE:'production',APP_USERS_PATH:users,APP_DATA_PATH:db},stdio:'ignore'});
 try{
  const base='http://localhost:'+PORT;for(let i=0;i<50;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
  const sess=async name=>{const jar={};const ck=r=>{for(const c of r.headers.getSetCookie())jar[c.split('=')[0]]=c.split(';')[0]};
   let r=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({name,password:'una-clave-larga-1'})});ck(r);
   const H=()=>({cookie:Object.values(jar).join('; ')});r=await fetch(base+'/api/status',{headers:H()});ck(r);const csrf=(await r.json()).csrf;
   return {get:async()=>{const j=await(await fetch(base+'/api/workspace',{headers:H()})).json();j.state.__docH=j.docH;return j},save:async(revision,state)=>{const r=await fetch(base+'/api/workspace',{method:'POST',headers:{...H(),'content-type':'application/json','x-csrf-token':csrf,origin:base},body:JSON.stringify({revision,docH:state.__docH,state:(({__docH,...x})=>x)(state)})});return {status:r.status,body:await r.json()}}}};
  const A=await sess('ana'),B=await sess('luis');
  let w=await A.get();w.state.cases=[{id:'X',n:0},{id:'Y',n:0}];let r=await A.save(w.revision,w.state);assert.equal(r.status,200);
  const wa=await A.get(),wb=await B.get();
  wa.state.cases.find(c=>c.id==='X').n=1;wb.state.cases.find(c=>c.id==='Y').n=1;
  assert.equal((await A.save(wa.revision,wa.state)).status,200);
  assert.equal((await B.save(wb.revision,wb.state)).status,200,'otro expediente: sin conflicto');
  const fin=(await A.get()).state.cases;assert.equal(fin.find(c=>c.id==='X').n,1);assert.equal(fin.find(c=>c.id==='Y').n,1);
  const wc=await B.get();wc.state.cases.find(c=>c.id==='X').n=7;const wd=await A.get();wd.state.cases.find(c=>c.id==='X').n=8;
  assert.equal((await A.save(wd.revision,wd.state)).status,200);
  const bad=await B.save(wc.revision,wc.state);assert.equal(bad.status,409);assert.equal(bad.body.error,'CASE_CONFLICT_RELOAD_BEFORE_EDITING');assert.equal(bad.body.caseId,'X');
  assert.equal((await A.get()).state.cases.find(c=>c.id==='X').n,8);
  // parte común (avisos): quien edita un expediente sin tocarla no choca con quien añadió un aviso
  const we=await A.get(),wf=await B.get();we.state.notices.push({id:'n1',text:'aviso'});assert.equal((await A.save(we.revision,we.state)).status,200);
  wf.state.cases.find(c=>c.id==='Y').n=42;assert.equal((await B.save(wf.revision,wf.state)).status,200,'cambio de expediente con la parte común intacta: sin 409');
  const g=await A.get();assert.equal(g.state.notices.length,1,'el aviso de la otra persona se conserva');assert.equal(g.state.cases.find(c=>c.id==='Y').n,42);
  // pero si cambia la parte común desde una base vieja, sí se rechaza
  const wg=await A.get(),wh=await B.get();wg.state.notices.push({id:'n2'});assert.equal((await A.save(wg.revision,wg.state)).status,200);wh.state.notices.push({id:'n3'});
  const bad2=await B.save(wh.revision,wh.state);assert.equal(bad2.status,409);assert.equal(bad2.body.error,'REVISION_CONFLICT_RELOAD_BEFORE_EDITING');
 }finally{srv.kill()}
});
