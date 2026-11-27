import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,existsSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {fetchGraphAttachment} from '../server/attachment-source.mjs';
import {openStore} from '../server/store.mjs';import {createChat} from '../server/chat.mjs';
import {blank} from '../web/core.mjs';import * as S from '../web/shipments.mjs';

// Ruta real de descarga de binarios con transportes Graph FICTICIOS: descarga correcta y cada fallo.
// Ninguna prueba toca una cuenta real: el "get" es un fixture con las respuestas de Graph.
const MAIL={id:'AAMkAGI2TGuLAAA=',threadId:'th-1',from:'luis@ejemplosur.example',subject:'Matrículas',date:'2026-11-26T09:00:00+01:00',body:'Matrículas.',attachments:['matriculas.xlsx','albaran.pdf']};
const BYTES=Buffer.from('contenido binario ficticio del adjunto');
function fixtureGet(over={}){
 const calls=[];
 const get=async(path)=>{calls.push(path);
  if(over.throwOn)throw Error(over.throwOn);
  if(path.includes('/attachments?'))return {value:over.list??[
   {'@odata.type':'#microsoft.graph.fileAttachment',id:'att-1',name:'matriculas.xlsx',size:BYTES.length,contentType:'application/vnd.ms-excel',isInline:false},
   {'@odata.type':'#microsoft.graph.fileAttachment',id:'att-2',name:'albaran.pdf',size:99,contentType:'application/pdf',isInline:false},
   {'@odata.type':'#microsoft.graph.itemAttachment',id:'att-3',name:'otro.msg',size:10,isInline:false},
  ]};
  if(/\/attachments\/att-1($|\?)/.test(path))return {contentBytes:(over.contentBytes??BYTES.toString('base64'))};
  if(/\/attachments\/att-2($|\?)/.test(path))return {contentBytes:Buffer.alloc(99,7).toString('base64')};
  throw Error('NOT_FOUND');};
 return {get,calls};
}
const findMail=id=>id===MAIL.id?MAIL:null;

test('descarga real por ruta autorizada: metadatos, coincidencia exacta de nombre y bytes',async()=>{
 const {get,calls}=fixtureGet();
 const r=await fetchGraphAttachment({findMail,mailId:MAIL.id,name:'matriculas.xlsx',get});
 assert.deepEqual(r.bytes,BYTES);assert.match(r.contentType,/excel/);
 assert.equal(calls.length,2);
 assert.ok(calls.every(p=>p.startsWith('/me/messages/')&&!p.includes('..')),'rutas Graph seguras');
});

test('fallos declarados: correo desconocido, nombre ausente, no archivo, Graph caído, id inválido',async()=>{
 const {get,calls}=fixtureGet();
 assert.equal(await fetchGraphAttachment({findMail,mailId:'no-existe',name:'matriculas.xlsx',get}),null);
 assert.equal(calls.length,0,'correo no indexado: ni se consulta Graph');
 assert.equal(await fetchGraphAttachment({findMail,mailId:MAIL.id,name:'inexistente.docx',get}),null);
 assert.equal(await fetchGraphAttachment({findMail,mailId:MAIL.id,name:'otro.msg',get}),null,'adjunto que no es archivo se ignora');
 assert.equal(await fetchGraphAttachment({findMail,mailId:MAIL.id,name:'matriculas.xlsx',get:async()=>{throw Error('GRAPH_READ_FAILED')}}),null);
 assert.equal(await fetchGraphAttachment({findMail,mailId:'../../admin',name:'x',get}),null,'id con caracteres de ruta rechazado sin llamar');
 assert.equal(await fetchGraphAttachment({findMail,mailId:MAIL.id,name:'',get}),null);
});

test('tope antes y después de descargar',async()=>{
 const {get:g1,calls:c1}=fixtureGet({list:[{'@odata.type':'#microsoft.graph.fileAttachment',id:'att-9',name:'grande.xlsx',size:5e6,isInline:false}]});
 assert.equal(await fetchGraphAttachment({findMail,mailId:MAIL.id,name:'grande.xlsx',get:g1,maxBytes:2e6}),null);
 assert.equal(c1.length,1,'size por encima del tope: no se descarga el contenido');
 const big=Buffer.alloc(3e6,1).toString('base64');
 const {get:g2}=fixtureGet({contentBytes:big});
 assert.equal(await fetchGraphAttachment({findMail,mailId:MAIL.id,name:'matriculas.xlsx',get:g2,maxBytes:2e6}),null,'bytes reales por encima del tope también se rechazan');
});

test('integración con el chat: la fuente con sesión autorizada conserva el binario en el expediente',async()=>{
 const d=mkdtempSync(join(tmpdir(),'chatsrc-'));
 const store=await openStore(join(d,'w.json'));
 const st=blank();st.shipments=S.demoState().shipments;
 st.shipments.mails.push({...MAIL,shipmentId:'TR-0412'});st.shipments.items.find(s=>s.id==='TR-0412').mailIds.push(MAIL.id);
 await store.write(0,st);
 const env={INTEGRATION_MOCK:'true',CHAT_ATTACH_STORE:'true',CHAT_ATTACH_DIR:join(d,'adj')};
 // albaran.pdf existe en metadatos pero Graph no devuelve contenido: debe quedar destacado como SIN BINARIO
 const get=async(path)=>{
  if(path.includes('/attachments?'))return {value:[
   {'@odata.type':'#microsoft.graph.fileAttachment',id:'att-1',name:'matriculas.xlsx',size:BYTES.length,contentType:'application/vnd.ms-excel',isInline:false},
   {'@odata.type':'#microsoft.graph.fileAttachment',id:'att-2',name:'albaran.pdf',size:99,contentType:'application/pdf',isInline:false},
  ]};
  if(/\/attachments\/att-1($|\?)/.test(path))return {contentBytes:BYTES.toString('base64')};
  return {};};
 // Cableado equivalente a server.mjs: fuente con la sesión del que confirma.
 let chat;
 const attachmentSource=(mailId,name,session)=>session?.account?fetchGraphAttachment({findMail:id=>chat.mailById(id),mailId,name,get}):null;
 chat=createChat({store,shipDb:null,chatPath:join(d,'chat.json'),env,attachmentSource});
 const r=await chat.message('actor:Coordinador','prepárame un expediente de TR-0412',{canWrite:true});
 const ok=await chat.confirm('actor:Coordinador',r.proposals[0].id,true,{canWrite:true,session:{account:{homeAccountId:'x'}}});
 assert.match(ok.message,/binario conservado/);
 const c=store.read().state.cases[0];
 const docs=c.documents.filter(x=>x.type==='adjunto-binario');
 assert.equal(docs.length,1);assert.deepEqual(readFileSync(join(d,'adj',docs[0].file)),BYTES);
 assert.ok(c.documents.some(x=>/SIN BINARIO DISPONIBLE/.test(x.text)&&x.name==='albaran.pdf'),'el que la fuente no sirve queda destacado');
 // sin sesión autorizada: ningún binario
 const r2=await chat.message('actor:Coordinador','prepárame un expediente de TR-0412',{canWrite:true});
 await chat.confirm('actor:Coordinador',r2.proposals[0].id,true,{canWrite:true,session:null});
 const c2=store.read().state.cases[0];
 assert.ok(c2.documents.every(x=>x.type!=='adjunto-binario'),'sin sesión autorizada no se conserva nada');
});
