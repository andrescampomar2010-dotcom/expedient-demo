import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,existsSync,readFileSync,readdirSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {openStore} from '../server/store.mjs';import {createChat} from '../server/chat.mjs';import {llmService} from '../server/llm.mjs';
import {blank} from '../web/core.mjs';import * as S from '../web/shipments.mjs';

// Verificación funcional del adaptador real con transportes de API FICTICIOS (ninguna llamada real ni pagada):
// respuesta multiturno con herramientas de investigación, pregunta libre, detalle de fuentes/histórico
// y selección de modelo aislada por persona.
async function fixture(env={},opts={}){
 const d=mkdtempSync(join(tmpdir(),'chatag-'));
 const store=await openStore(join(d,'w.json'));
 const st=blank();st.shipments=S.demoState().shipments;
 if(opts.mutate)opts.mutate(st);
 await store.write(0,st);
 const envAll={INTEGRATION_MOCK:'true',CHAT_DATA_APPROVED:'true',ANTHROPIC_API_KEY:'clave-ficticia',CHAT_MODELS:'anthropic:claude-ficticio-1',...env};
 const transport=opts.transport||(async()=>{throw Error('no se esperaba red')});
 const llm=llmService(envAll,transport);
 const chat=createChat({store,shipDb:null,chatPath:join(d,'chat.json'),env:envAll,llm,...opts.chatOpts});
 return {store,chat,d,llm};
}
const W={canWrite:true};
const anthResp=(text)=>({ok:true,json:async()=>({model:'claude-ficticio-1',content:[{type:'text',text}]})});

test('adaptador real multiturno: el modelo pide detalle de fuente con herramienta y el servidor la ejecuta',async()=>{
 const calls=[];
 const transport=async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});
  if(calls.length===1)return anthResp('{"tool":"detalle_envio","id":"TR-0412"}');
  return anthResp('TR-0412 va abierto con matrícula 4321 KLM según el correo del 26/11. Fuente: detalle_envio TR-0412.');};
 const {chat}=await fixture({}, {transport});
 await chat.setModel('actor:Coordinador','anthropic:claude-ficticio-1');
 const r=await chat.message('actor:Coordinador','¿cómo va TR-0412?',W);
 assert.equal(calls.length,2,'dos rondas de API: petición de herramienta y respuesta final');
 assert.match(String(calls[1].body.messages.at(-1).content),/resultado_herramienta/);
 assert.match(String(calls[1].body.messages.at(-1).content),/4321 ?KLM/,'la herramienta devuelve datos reales de las reglas');
 assert.match(r.reply,/matrícula 4321 KLM/);
 assert.match(r.label,/IA externa/);assert.match(r.label,/1 consulta\(s\) de investigación/);
});

test('pregunta libre sin intención de reglas: el modelo investiga con buscar_envios e histórico de hilo',async()=>{
 const seen=[];
 const transport=async(url,init)=>{seen.push(JSON.parse(init.body));
  const n=seen.length;
  if(n===1)return anthResp('{"tool":"buscar_envios","query":"matriculas camión"}');
  if(n===2)return anthResp('{"tool":"hilo_envio","id":"TR-0412"}');
  return anthResp('Del histórico del hilo: la carga fue el martes y la matrícula cambió a 4321 KLM (correos d1-d4).');};
 const {chat}=await fixture({}, {transport});
 await chat.setModel('actor:Coordinador','anthropic:claude-ficticio-1');
 const r=await chat.message('actor:Coordinador','¿qué pasó con el camión de la ruta de Valencia a Zaragoza?',W);
 assert.equal(seen.length,3,'tres rondas: búsqueda, hilo y respuesta');
 assert.match(String(seen[1].messages.at(-1).content),/TR-0412/,'buscar_envios encuentra el envío');
 assert.match(String(seen[2].messages.at(-1).content),/d1|matriculas_TR-0412/,'hilo_envio devuelve el histórico con IDs navegables');
 assert.match(r.reply,/4321 KLM/);assert.match(r.label,/2 consulta\(s\) de investigación/);
});

test('selección de modelo aislada por persona: solo la persona con modelo real llama a la API',async()=>{
 let calls=0;
 const transport=async()=>{calls++;return anthResp('Respuesta redactada por el modelo.');};
 const {chat}=await fixture({}, {transport});
 await chat.setModel('actor:Coordinador','anthropic:claude-ficticio-1');
 const r1=await chat.message('actor:Coordinador','¿Cómo van los envíos?',W);
 assert.equal(calls,1);assert.match(r1.label,/IA externa/);
 const r2=await chat.message('actor:Operador A','¿Cómo van los envíos?',W);
 assert.equal(calls,1,'la persona con sim:reglas no genera llamadas');
 assert.match(r2.label,/SIMULACIÓN/);
 await assert.rejects(()=>chat.setModel('actor:Operador A','anthropic:modelo-no-listado'),/AI_UNKNOWN_MODEL/);
 const st=chat.state('actor:Coordinador');assert.equal(st.model,'anthropic:claude-ficticio-1');
 assert.equal(chat.state('actor:Operador A').model,'sim:reglas','aislamiento: la elección no se contagia');
});

test('las respuestas de reglas citan fuentes navegables (correo/ficha) en acciones y resúmenes',async()=>{
 const {chat}=await fixture();
 const a=await chat.message('actor:Coordinador','acciones recomendadas de TR-0412',W);
 assert.ok(a.sources.length>=1);assert.ok(a.sources.every(s=>s.id&&s.kind));
 assert.match(a.reply,/Debajo tienes las fuentes/);
 const m=await chat.message('actor:Coordinador','resúmeme los correos de TR-0412',W);
 assert.ok(m.sources.some(s=>s.kind==='mail'&&s.id==='d4'),'fuente del correo de corrección de matrícula');
 assert.ok(m.sources.every(s=>s.shipmentId==='TR-0412'));
 assert.match(m.reply,/Lo importante:/);assert.match(m.reply,/Siguiente paso:/);assert.match(m.reply,/4321 ?KLM/,'síntesis de hechos y cambios, no volcado');assert.ok(!m.reply.includes('[d4]'),'las referencias van después, como fuentes');
});

test('autonomía real: política auto ejecuta sin confirmación; sin auto exige confirmación; revocada no ejecuta',async()=>{
 const env={MAIL_SEND_ENABLED:'true',MAIL_SEND_APPROVED:'true'};
 const {chat}=await fixture(env);
 const P='actor:Coordinador';
 await chat.setPolicy('actor:admin',P,{allow:['ejemplosur.example'],purpose:'avisos de documentación',perDay:3,auto:true},'admin');
 const r=await chat.message(P,'envía una respuesta sobre TR-0412',W);
 assert.equal(r.proposals.length,0,'con auto no queda propuesta pendiente de confirmación');
 assert.match(r.reply,/Ejecutado/);assert.match(r.reply,/SIMULACIÓN: respuesta registrada/);
 const doc=chat.read();
 assert.equal(doc.outbox.length,1,'un envío simulado registrado, ninguno real');
 assert.ok(Object.values(doc.proposals).find(p=>p.kind==='send_reply'&&p.status==='done'&&p.auto),'propuesta auto cerrada e idempotente');
 assert.ok(doc.audit.some(a=>a.kind==='send_reply'&&a.result==='SENT'));
 // sin auto: propuesta pendiente, nada enviado hasta confirmar
 await chat.setPolicy('actor:admin',P,{allow:['ejemplosur.example'],purpose:'avisos de documentación',perDay:3,auto:false},'admin');
 const r2=await chat.message(P,'envía una respuesta sobre TR-0412',W);
 assert.equal(r2.proposals.length,1);assert.equal(chat.read().outbox.length,1,'sin auto no se envía sin confirmación');
 await chat.confirm(P,r2.proposals[0].id,true,W);
 assert.equal(chat.read().outbox.length,2);
 // revocada: ni auto ni confirmación ejecutan
 await chat.setPolicy('actor:admin',P,{allow:['ejemplosur.example'],purpose:'x',revoked:true},'admin');
 const r3=await chat.message(P,'envía una respuesta sobre TR-0412',W);
 assert.match(r3.reply,/política/);assert.equal(chat.read().outbox.length,2,'revocada: nada se envía');
 assert.equal(r3.proposals.length,0);
});

test('binarios: conservación autorizada con topes y destacado de los que no existen; desactivada por defecto',async()=>{
 // Fuente autorizada ficticia: devuelve bytes para un adjunto, nada para otro.
 const asked=[];
 const attachmentSource=async(mailId,name)=>{asked.push([mailId,name]);
  if(name==='matriculas_TR-0412.xlsx')return {bytes:Buffer.from('PK binario ficticio '+name),contentType:'application/octet-stream'};
  return null;};
 const d2=mkdtempSync(join(tmpdir(),'chatatt-'));
 const {chat,store}=await fixture({CHAT_ATTACH_STORE:'true',CHAT_ATTACH_DIR:join(d2,'adj')},{chatOpts:{attachmentSource},mutate:(st)=>{st.shipments.mails.find(x=>x.id==='d2').attachments.push('albaran_ficticio.pdf');}});
 const r=await chat.message('actor:Coordinador','prepárame un expediente de TR-0412',W);
 const ok=await chat.confirm('actor:Coordinador',r.proposals[0].id,true,W);
 assert.match(ok.message,/1 adjunto\(s\) con binario conservado/);
 const c=store.read().state.cases[0];
 const bin=c.documents.find(x=>x.type==='adjunto-binario');
 assert.ok(bin,'documento con binario conservado');assert.ok(bin.sha256&&bin.bytes>0);
 assert.ok(existsSync(join(d2,'adj',bin.file)),'el archivo existe en el almacén limitado');
 assert.equal(readFileSync(join(d2,'adj',bin.file)).toString(),'PK binario ficticio matriculas_TR-0412.xlsx');
 const miss=c.documents.find(x=>x.type==='adjunto-correo');
 assert.ok(miss&&/SIN BINARIO DISPONIBLE/.test(miss.text),'el adjunto sin binario queda destacado');
 assert.ok(asked.length>=1,'solo consulta la fuente autorizada; no descarga del buzón');
 // desactivada por defecto: no se llama a la fuente y se declara en el documento
 const {chat:chat2,store:store2}=await fixture({},{chatOpts:{attachmentSource}});
 const r2=await chat2.message('actor:Coordinador','prepárame un expediente de TR-0412',W);
 await chat2.confirm('actor:Coordinador',r2.proposals[0].id,true,W);
 const c2=store2.read().state.cases[0];
 assert.ok(c2.documents.every(x=>x.type!=='adjunto-binario'));
 assert.ok(c2.documents.some(x=>/desactivada \(CHAT_ATTACH_STORE\)/.test(x.text)));
});

test('tope de almacenamiento de binarios: archivo grande no se conserva y se destaca',async()=>{
 const attachmentSource=async()=>({bytes:Buffer.alloc(6e6,'x'),contentType:'application/octet-stream'});
 const d3=mkdtempSync(join(tmpdir(),'chatcap-'));
 const {chat,store}=await fixture({CHAT_ATTACH_STORE:'true',CHAT_ATTACH_DIR:join(d3,'adj')},{chatOpts:{attachmentSource}});
 const r=await chat.message('actor:Coordinador','prepárame un expediente de TR-0412',W);
 await chat.confirm('actor:Coordinador',r.proposals[0].id,true,W);
 const c=store.read().state.cases[0];
 assert.ok(c.documents.every(x=>x.type!=='adjunto-binario'),'nada por encima del tope se conserva');
 assert.ok(c.documents.some(x=>/límite de almacenamiento/.test(x.text)));
 assert.ok(!existsSync(join(d3,'adj'))||readdirSync(join(d3,'adj')).length===0,'nada escrito por encima del tope');
});

test('ámbito histórico: expedientes cerrados y consultas sin referencia exacta',async()=>{
 const d=mkdtempSync(join(tmpdir(),'hist-'));
 const store=await openStore(join(d,'w.json'));const st=blank();st.shipments=S.demoState().shipments;await store.write(0,st);
 const chat=createChat({store,shipDb:null,chatPath:join(d,'chat.json'),env:{INTEGRATION_MOCK:'true'}});
 // cerrado/entregado: TR-0398 está entregado y el asistente igualmente lo consulta (historial, no solo abiertos)
 const closed=await chat.message('a:Coordinador','acciones recomendadas de TR-0398',{canWrite:false});
 assert.match(closed.reply,/TR-0398/);assert.match(closed.reply,/está entregado/);
 const closedMails=await chat.message('a:Coordinador','correos de TR-0398',{canWrite:false});
 assert.match(closedMails.reply,/En el hilo de TR-0398 hay 2 correos/,'los correos de un envío entregado siguen indexados');
 assert.ok(closedMails.sources.some(s=>s.kind==='mail'&&s.id==='d7'),'fuente al correo del envío cerrado');
 // sin referencia exacta: el usuario no sabe el TR; busca por asunto de correo indexado
 const loose=await chat.message('a:Coordinador','DUA presentado',{canWrite:false});
 assert.match(loose.reply,/TR-0412/,'encuentra el envío por texto de correo (asunto DUA presentado) sin referencia exacta');
 // límites declarados: la ruta (ciudades) no forma parte del índice de búsqueda del chat
 const route=await chat.message('a:Coordinador','Bilbao Sevilla',{canWrite:false});
 assert.ok(!/TR-0398/.test(route.reply),'la ruta no está indexada: Bilbao y Sevilla solo aparecen en la ruta de TR-0398 y no encuentran nada');
});
