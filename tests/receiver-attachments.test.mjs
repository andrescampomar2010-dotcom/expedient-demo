process.env.OCR_ENABLED='false';
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {openStore} from '../server/store.mjs';import {createReceiver} from '../server/receiver.mjs';import {pdf} from './fixtures/mkpdf.mjs';
test('camino completo Graph: el DUA solo en un PDF adjunto vincula el correo; un PDF escaneado queda pendiente y avisado',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rcv-att-'));
 try{
  const store=await openStore(join(dir,'db'));const {addShipment,ensure,summarize}=await import('../web/shipments.mjs');
  const cur=store.read();addShipment(cur.state,{id:'TR-7',dua:'26ES0000777777',bultos:5,kg:100,clientDomain:'x.example'});await store.write(cur.revision,cur.state);
  const mk=(id,subject)=>({id,changeKey:id,conversationId:'c-'+id,subject,receivedDateTime:'2026-11-26T10:00:00Z',lastModifiedDateTime:'2026-11-26T10:00:00Z',hasAttachments:true,from:{emailAddress:{address:'aduana@x.example'}},body:{contentType:'text',content:'Os mandamos el documento adjunto.'}});
  const all={a1:mk('a1','Documento de aduana'),a2:mk('a2','Otro documento')};
  const files={a1:{name:'dua.pdf',bytes:pdf('Declaracion DUA 26ES0000777777 aceptada por la aduana')},a2:{name:'escaneo.pdf',bytes:pdf('')}};
  let round=0;
  const get=async path=>{
   if(path.includes('/delta')){round++;return round===1?{value:[],'@odata.deltaLink':'https://graph.microsoft.com/v1.0/me/mailFolders/f/messages/delta?t=1'}:{value:[{id:'a1',changeKey:'a1'},{id:'a2',changeKey:'a2'}],'@odata.deltaLink':'https://graph.microsoft.com/v1.0/me/mailFolders/f/messages/delta?t=2'}}
   let m=path.match(/\/me\/messages\/(a\d)\/attachments\/att/);if(m){const f=files[m[1]];return{'@odata.type':'#microsoft.graph.fileAttachment',id:'att',name:f.name,size:f.bytes.length,contentBytes:f.bytes.toString('base64')}}
   m=path.match(/\/me\/messages\/(a\d)\/attachments\?/);if(m){const f=files[m[1]];return{value:[{'@odata.type':'#microsoft.graph.fileAttachment',id:'att',name:f.name,size:f.bytes.length,isInline:false}]}}
   m=path.match(/\/me\/messages\/(a\d)\?/);if(m)return all[m[1]];
   return{value:[]};
  };
  const r=createReceiver({store,folder:'f',scopeKey:'u',since:'2026-01-01T00:00:00Z',get});await r.tick();await r.tick();
  const sh=ensure(store.read().state),s=sh.items[0];
  assert.deepEqual(s.mailIds,['a1'],'a1 vinculado por el DUA del PDF');
  assert.match(sh.mails.find(m=>m.id==='a1').attachmentsInfo[0].status,/leido/);
  assert.match(s.events[0].source,/dua\.pdf \(leído\)/);
  assert.equal(sh.pending.length,1);assert.equal(sh.pending[0].mailId,'a2');
  const m2=sh.mails.find(m=>m.id==='a2');assert.equal(m2.attachmentsInfo[0].status,'sin_texto');
 }finally{await rm(dir,{recursive:true,force:true})}
});
