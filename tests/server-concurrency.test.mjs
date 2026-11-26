import test from 'node:test';import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const PORT=5600+Math.floor(Math.random()*300),base=`http://localhost:${PORT}`;
function start(env){const p=spawn(process.execPath,['server/server.mjs'],{env:{...process.env,PORT:String(PORT),...env},stdio:['ignore','pipe','pipe']});return new Promise((ok,ko)=>{let err='';p.stderr.on('data',d=>err+=d);p.stdout.on('data',d=>{if(String(d).includes('http'))ok(p)});p.on('exit',()=>ko(new Error(err)))})}
// Un "navegador": cookies propias (uid de usuario y sid de sesión) y su token csrf.
async function browser(name){
 const jar={};const keep=r=>{for(const c of r.headers.getSetCookie())jar[c.split('=')[0]]=c.split(';')[0]};
 const ck=()=>Object.values(jar).join('; ');
 const L=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({name,password:'una-clave-larga-1'})});keep(L);
 const st=await fetch(base+'/api/status',{headers:{cookie:ck()}});keep(st);const csrf=(await st.json()).csrf;
 return{
  async load(){const r=await fetch(base+'/api/workspace',{headers:{cookie:ck()}});return r.json()},
  async save(revision,state){const r=await fetch(base+'/api/workspace',{method:'POST',headers:{'content-type':'application/json',origin:base,cookie:ck(),'x-csrf-token':csrf},body:JSON.stringify({revision,state})});return{status:r.status,body:await r.json()}}
 };
}
test('dos navegadores: el segundo guardado con revisión vieja se rechaza, recargar permite continuar, y el estado sobrevive al reinicio',async()=>{
 const d=mkdtempSync(join(tmpdir(),'conc-')),up=join(d,'users.json'),db=join(d,'t.db');
 for(const n of ['ana','luis','eva'])assert.equal(spawnSync(process.execPath,['scripts/adduser.mjs',n,'operador'],{env:{...process.env,APP_USERS_PATH:up,ADDUSER_PASSWORD:'una-clave-larga-1'}}).status,0);
 const env={APP_AUTH:'local',APP_USERS_PATH:up,APP_DATA_PATH:db,INTEGRATION_MOCK:'true'};
 let p=await start(env);
 try{
  const A=await browser('ana'),B=await browser('luis'),C=await browser('eva');
  const a0=await A.load(),b0=await B.load();assert.equal(a0.revision,b0.revision);
  const sa=structuredClone(a0.state);sa.history.push({marca:'ana'});
  const ra=await A.save(a0.revision,sa);assert.equal(ra.status,200);
  const sb=structuredClone(b0.state);sb.history.push({marca:'luis'});
  const rb=await B.save(b0.revision,sb);assert.equal(rb.status,409,'guardar sobre una revisión vieja nunca pisa el cambio de Ana');
  const b1=await B.load();assert.ok(JSON.stringify(b1.state.history).includes('ana'));
  const sb2=structuredClone(b1.state);sb2.history.push({marca:'luis'});assert.equal((await B.save(b1.revision,sb2)).status,200);
  // 3 navegadores a la vez desde la misma revisión: exactamente uno gana
  const base0=await A.load();
  const res=await Promise.all([A,B,C].map((x,i)=>{const s=structuredClone(base0.state);s.history.push({carrera:i});return x.save(base0.revision,s)}));
  assert.equal(res.filter(r=>r.status===200).length,1);assert.equal(res.filter(r=>r.status===409).length,2);
  const fin=await C.load();assert.equal(fin.state.history.filter(h=>'carrera' in h).length,1);
  p.kill();await new Promise(r=>setTimeout(r,300));p=await start(env);
  const E=await browser('ana');const rec=await E.load();assert.equal(rec.revision,fin.revision);assert.deepEqual(rec.state.history,fin.state.history);
 }finally{p.kill()}
});
