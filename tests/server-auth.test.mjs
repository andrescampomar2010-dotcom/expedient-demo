import test from 'node:test';import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const PORT=4990+Math.floor(Math.random()*500);
function start(env){const p=spawn(process.execPath,['server/server.mjs'],{env:{...process.env,PORT:String(PORT),...env},stdio:['ignore','pipe','pipe']});return new Promise((ok,ko)=>{let err='';p.stderr.on('data',d=>err+=d);p.stdout.on('data',d=>{if(String(d).includes('http'))ok(p)});p.on('exit',()=>ko(new Error(err)))})}
const post=(path,body,cookie,h={})=>fetch(`http://localhost:${PORT}${path}`,{method:'POST',headers:{'content-type':'application/json',origin:`http://localhost:${PORT}`,...(cookie?{cookie}:{}),...h},body:JSON.stringify(body)});
test('login local: health abierto, API cerrada sin sesión, lector no escribe, operador sí pasa el control de rol',async()=>{
 const d=mkdtempSync(join(tmpdir(),'auth-')),up=join(d,'users.json');
 for(const [n,r] of [['ana','operador'],['luis','lector']])assert.equal(spawnSync(process.execPath,['scripts/adduser.mjs',n,r],{env:{...process.env,APP_USERS_PATH:up,ADDUSER_PASSWORD:'una-clave-larga-1'}}).status,0);
 const p=await start({APP_AUTH:'local',APP_USERS_PATH:up,APP_DATA_PATH:join(d,'t.db'),INTEGRATION_MOCK:'true'});
 try{
  const base=`http://localhost:${PORT}`;
  assert.equal((await fetch(base+'/api/health')).status,200);
  assert.equal((await fetch(base+'/api/status')).status,401);
  assert.equal((await fetch(base+'/',{redirect:'manual'})).status,302);
  assert.equal((await post('/api/login',{name:'ana',password:'mala'})).status,401);
  const lec=await post('/api/login',{name:'luis',password:'una-clave-larga-1'});assert.equal(lec.status,200);
  const lc=lec.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base+'/api/status',{headers:{cookie:lc}})).status,200);
  assert.equal((await post('/api/workspace',{},lc)).status,403);
  const op=await post('/api/login',{name:'ana',password:'una-clave-larga-1'});const oc=op.headers.get('set-cookie').split(';')[0];
  assert.notEqual((await post('/api/workspace',{},oc)).status,403);
 }finally{p.kill()}
});
test('con APP_PUBLIC_URL sin autenticación el servidor se niega a arrancar',async()=>{
 await assert.rejects(()=>start({APP_PUBLIC_URL:'https://expedient.example',APP_DATA_PATH:join(mkdtempSync(join(tmpdir(),'a-')),'t.db'),INTEGRATION_MOCK:'true'}),/APP_AUTH=local/);
});
