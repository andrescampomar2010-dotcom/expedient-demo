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
test('gestión de usuarios: solo admin, sin hashes, no se borra el último admin, borrar cierra sus sesiones',async()=>{
 const d=mkdtempSync(join(tmpdir(),'adm-')),up=join(d,'users.json');
 for(const [n,r] of [['jefa','admin'],['ana','operador']])assert.equal(spawnSync(process.execPath,['scripts/adduser.mjs',n,r],{env:{...process.env,APP_USERS_PATH:up,ADDUSER_PASSWORD:'una-clave-larga-1'}}).status,0);
 const p=await start({APP_AUTH:'local',APP_USERS_PATH:up,APP_DATA_PATH:join(d,'t.db'),INTEGRATION_MOCK:'true'});
 try{
  const base=`http://localhost:${PORT}`;const ck=async n=>(await post('/api/login',{name:n,password:'una-clave-larga-1'})).headers.get('set-cookie').split(';')[0];
  const adm=await ck('jefa'),op=await ck('ana');
  assert.equal((await fetch(base+'/api/users',{headers:{cookie:op}})).status,403);
  assert.equal((await post('/api/users',{name:'x',password:'una-clave-larga-1',role:'lector'},op)).status,403);
  const l=await (await fetch(base+'/api/users',{headers:{cookie:adm}})).json();assert.equal(l.users.length,2);assert.ok(!JSON.stringify(l).includes('hash')&&!JSON.stringify(l).includes('salt'));
  assert.equal((await post('/api/users',{name:'eva',password:'una-clave-larga-1',role:'lector'},adm)).status,200);
  assert.equal((await post('/api/users',{name:'corta',password:'x',role:'lector'},adm)).status,400);
  const del=(name,c)=>fetch(base+'/api/users',{method:'DELETE',headers:{'content-type':'application/json',origin:base,cookie:c},body:JSON.stringify({name})});
  assert.equal((await del('jefa',adm)).status,400,'no se puede borrar el último admin');
  assert.equal((await del('ana',adm)).status,200);
  assert.equal((await fetch(base+'/api/status',{headers:{cookie:op}})).status,401,'la sesión de un usuario borrado deja de valer');
 }finally{p.kill()}
});
test('HTTP: cambio de clave propio y administración de rol/restablecimiento',async()=>{
 const d=mkdtempSync(join(tmpdir(),'pw-')),up=join(d,'users.json');
 for(const [n,r] of [['jefa','admin'],['ana','operador']])assert.equal(spawnSync(process.execPath,['scripts/adduser.mjs',n,r],{env:{...process.env,APP_USERS_PATH:up,ADDUSER_PASSWORD:'una-clave-larga-1'}}).status,0);
 const p=await start({APP_AUTH:'local',APP_USERS_PATH:up,APP_DATA_PATH:join(d,'t.db'),INTEGRATION_MOCK:'true'});
 try{
  const base=`http://localhost:${PORT}`;const ck=async(n,pw='una-clave-larga-1')=>{const r=await post('/api/login',{name:n,password:pw});return r.status===200?r.headers.get('set-cookie').split(';')[0]:null};
  const adm=await ck('jefa'),op=await ck('ana'),op2=await ck('ana');
  assert.equal((await post('/api/me/password',{current:'mala',next:'nueva-clave-larga-9'},op)).status,400);
  assert.equal((await post('/api/me/password',{current:'una-clave-larga-1',next:'nueva-clave-larga-9'},op)).status,200);
  assert.equal((await fetch(base+'/api/status',{headers:{cookie:op}})).status,200);assert.equal((await fetch(base+'/api/status',{headers:{cookie:op2}})).status,401);
  assert.equal(await ck('ana'),null);assert.ok(await ck('ana','nueva-clave-larga-9'));
  assert.equal((await post('/api/users',{action:'role',name:'ana',role:'lector'},op)).status,403,'un operador no cambia roles');
  assert.equal((await post('/api/users',{action:'role',name:'ana',role:'lector'},adm)).status,200);
  assert.equal((await fetch(base+'/api/status',{headers:{cookie:op}})).status,401,'cambio de rol revoca sus sesiones');
  assert.equal((await post('/api/users',{action:'role',name:'jefa',role:'lector'},adm)).status,400,'último admin protegido');
  assert.equal((await post('/api/users',{action:'reset',name:'ana',password:'reinicio-largo-33'},adm)).status,200);
  assert.ok(await ck('ana','reinicio-largo-33'));
  const l=await (await fetch(base+'/api/users',{headers:{cookie:adm}})).json();assert.equal(l.users.length,2,'ninguna cuenta se borró');
 }finally{p.kill()}
});
