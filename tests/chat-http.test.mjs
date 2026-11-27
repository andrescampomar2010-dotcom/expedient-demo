import test from 'node:test';import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {openStore} from '../server/store.mjs';import {blank} from '../web/core.mjs';import * as S from '../web/shipments.mjs';
const PORT=5600+Math.floor(Math.random()*300);
function start(env){const p=spawn(process.execPath,['server/server.mjs'],{env:{...process.env,PORT:String(PORT),...env},stdio:['ignore','pipe','pipe']});return new Promise((ok,ko)=>{let err='';p.stderr.on('data',d=>err+=d);p.stdout.on('data',d=>{if(String(d).includes('http://'))ok(p)});p.on('exit',c=>ko(new Error(err||'exit '+c)));setTimeout(()=>ok(p),4000)})}
const base=`http://localhost:${PORT}`;
async function session(actor,env){
 const sr=await fetch(base+'/api/status',{headers:{'x-actor':actor}});const st=await sr.json();
 const c=sr.headers.get('set-cookie').split(';')[0];
 const H=actor=>{const h={cookie:c,origin:base,'x-actor':actor};return h};
 return {c,csrf:st.csrf,H};
}
async function seed(){
 const d=mkdtempSync(join(tmpdir(),'chathttp-'));const w=join(d,'w.json');
 const store=await openStore(w);const st=blank();st.shipments=S.demoState().shipments;await store.write(0,st);
 return {d,w};
}

test('chat HTTP en modo simulación: estado, mensaje con CSRF, aislamiento por actor y propuestas',async()=>{
 const {d,w}=await seed();
 const p=await start({INTEGRATION_MOCK:'true',APP_DATA_PATH:w});
 try{
  const s=await session('Coordinador');
  const st=await (await fetch(base+'/api/chat/state',{headers:s.H('Coordinador')})).json();
  assert.equal(st.person,'actor:Coordinador');assert.equal(st.model,'sim:reglas');
  assert.ok(st.models.some(m=>m.ref==='sim:reglas'));assert.equal(st.sendEnabled,false);
  // sin CSRF: prohibido
  const noCsrf=await fetch(base+'/api/chat/message',{method:'POST',headers:{cookie:s.c,origin:base,'x-actor':'Coordinador','content-type':'application/json'},body:JSON.stringify({text:'hola'})});
  assert.equal(noCsrf.status,403);
  // origen cruzado: prohibido
  const badOrigin=await fetch(base+'/api/chat/message',{method:'POST',headers:{cookie:s.c,origin:'https://evil.example','x-actor':'Coordinador','content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({text:'hola'})});
  assert.equal(badOrigin.status,403);
  const send=(actor,body)=>fetch(base+'/api/chat/message',{method:'POST',headers:{cookie:s.c,origin:base,'x-actor':actor,'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify(body)});
  const r=await (await send('Coordinador',{text:'¿Cómo van los envíos?'})).json();
  assert.match(r.reply,/4 envíos/);assert.match(r.label,/SIMULACIÓN/);
  const pr=await (await send('Coordinador',{text:'prepárame un borrador de TR-0412'})).json();
  assert.equal(pr.proposals.length,1);
  // otro actor no ve ni historial ni propuestas ajenas
  const stB=await (await fetch(base+'/api/chat/state',{headers:s.H('Operador A')})).json();
  assert.equal(stB.messages.length,0);assert.equal(stB.proposals.length,0);
  const cf=(actor,body)=>fetch(base+'/api/chat/confirm',{method:'POST',headers:{cookie:s.c,origin:base,'x-actor':actor,'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify(body)});
  assert.equal((await cf('Operador A',{proposalId:pr.proposals[0].id,accept:true})).status,404,'una propuesta ajena no existe para otro actor');
  const ok=await (await cf('Coordinador',{proposalId:pr.proposals[0].id,accept:true})).json();
  assert.match(ok.message,/Borrador/);
  // política de envío en demo: el envío sigue desactivado por defecto del sistema
  const pol=await fetch(base+'/api/chat/policy',{method:'POST',headers:{cookie:s.c,origin:base,'x-actor':'Coordinador','content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({person:'Coordinador',allow:['ejemplosur.example'],purpose:'prueba',perDay:3})});
  assert.equal(pol.status,200);
  const r2=await (await send('Coordinador',{text:'envía una respuesta sobre TR-0412'})).json();
  assert.equal(r2.proposals.length,0,'MAIL_SEND_ENABLED=false: sin propuesta de envío aunque haya política');
 }finally{p.kill()}
});

test('chat HTTP con usuarios locales: lector pregunta pero no ejecuta; admin concede política; auditoría solo admin',async()=>{
 const {d,w}=await seed();const up=join(d,'users.json');
 for(const [n,r] of [['ana','admin'],['luis','lector']])assert.equal(spawnSync(process.execPath,['scripts/adduser.mjs',n,r],{env:{...process.env,APP_USERS_PATH:up,ADDUSER_PASSWORD:'una-clave-larga-1'}}).status,0);
 const p=await start({APP_AUTH:'local',APP_USERS_PATH:up,APP_DATA_PATH:w,INTEGRATION_MOCK:'true',MAIL_SEND_ENABLED:'true',MAIL_SEND_APPROVED:'true'});
 try{
  const login=async name=>{const l=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({name,password:'una-clave-larga-1'})});let c=l.headers.get('set-cookie').split(';')[0];const sr=await fetch(base+'/api/status',{headers:{cookie:c,origin:base}});const st=await sr.json();c+='; '+sr.headers.get('set-cookie').split(';')[0];return{c,csrf:st.csrf,st}};
  const ana=await login('ana'),luis=await login('luis');
  assert.ok(ana.st.chat.models.length>=1);assert.equal(ana.st.chat.sendEnabled,true);
  const post=(who,path,body)=>fetch(base+path,{method:'POST',headers:{cookie:who.c,origin:base,'content-type':'application/json','x-csrf-token':who.csrf},body:JSON.stringify(body)});
  // lector: pregunta (lectura) permitida por la excepción, confirmación y política denegadas
  const q=await post(luis,'/api/chat/message',{text:'acciones recomendadas de TR-0412'});
  assert.equal(q.status,200);assert.match((await q.json()).reply,/TR-0412/);
  const qp=await post(luis,'/api/chat/message',{text:'prepárame un borrador de TR-0412'});
  const propId=(await qp.json()).proposals[0].id;
  assert.equal((await post(luis,'/api/chat/confirm',{proposalId:propId,accept:true})).status,403);
  assert.equal((await post(luis,'/api/chat/policy',{person:'luis',allow:['x.example'],purpose:'p'})).status,403);
  assert.equal((await fetch(base+'/api/chat/audit',{headers:{cookie:luis.c,origin:base}})).status,403);
  // admin concede política a una operadora y ella envía en salida simulada (lector no puede confirmar envíos)
  const pol=await post(ana,'/api/chat/policy',{person:'ana',allow:['ejemplosur.example'],purpose:'respuestas documentación',perDay:5});
  assert.equal(pol.status,200);
  assert.equal((await post(ana,'/api/chat/policy',{person:'nadie',allow:['x.example'],purpose:'p'})).status,400,'usuario inexistente');
  const rs=await post(ana,'/api/chat/message',{text:'envía una respuesta sobre TR-0412'});
  const rsj=await rs.json();assert.equal(rsj.proposals.length,1);
  const sent=await (await post(ana,'/api/chat/confirm',{proposalId:rsj.proposals[0].id,accept:true})).json();
  assert.match(sent.message,/salida simulada/);
  const audit=await (await fetch(base+'/api/chat/audit',{headers:{cookie:ana.c,origin:base}})).json();
  assert.ok(audit.audit.some(a=>a.person==='u:ana'&&a.kind==='send_reply'&&a.result==='SENT'&&a.simulated));
  assert.ok(audit.audit.some(a=>a.kind==='policy'&&a.result==='GRANTED'));
  // historial por usuario autenticado, no por cabecera actor manipulable
  const stLuis=await (await fetch(base+'/api/chat/state',{headers:{cookie:luis.c,origin:base,'x-actor':'Coordinador'}})).json();
  assert.equal(stLuis.person,'u:luis','con auth la persona deriva de la sesión, no de la cabecera');
  assert.ok(stLuis.messages.length>0);
 }finally{p.kill()}
});
