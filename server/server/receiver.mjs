import {createHash} from 'node:crypto';
import {processMail} from './automation.mjs';
import {invalidate,audit} from '../web/core.mjs';
export function safeGraphPath(url){const u=new URL(url,'https://graph.microsoft.com/v1.0/');if(u.origin!=='https://graph.microsoft.com'||!u.pathname.startsWith('/v1.0/me/')||u.username||u.password)throw Error('UNSAFE_GRAPH_CURSOR');return u.pathname.slice('/v1.0'.length)+u.search;}
export function createReceiver({store,get,folder,scopeKey,since,transform=graphEvent}){
 let busy=false;
 return {async tick(){if(busy)return {busy:true};busy=true;try{
  const initial=store.read();const previous=initial.state.receiver;const key=scopeKey+'|'+folder+'|'+since;
  if(previous&&previous.scope!==key)throw Error('RECEIVER_SCOPE_CHANGED_USE_NEW_WORKSPACE');
  const rec=previous||{scope:key,folder,baseline:false,cursor:'',seen:{},lastRun:'',lastResult:''};
  let path=rec.cursor?safeGraphPath(rec.cursor):'/me/mailFolders/'+encodeURIComponent(folder)+'/messages/delta?$select=id,conversationId,subject,receivedDateTime,lastModifiedDateTime,changeKey,hasAttachments,from&$filter='+encodeURIComponent('receivedDateTime ge '+since)+'&$top=20';
  let pages=0,events=0;while(path){if(++pages>20)throw Error('DELTA_PAGE_LIMIT_RESUME_NEXT_CYCLE');const page=await get(path);if(!Array.isArray(page.value))throw Error('INVALID_DELTA_RESPONSE');
   const working=store.read();const current=structuredClone(rec);
   for(const m of page.value){if(!m.id)continue;if(m['@removed']){const c=working.state.cases.find(c=>c.mail?.messageIds?.includes(m.id));if(c){invalidate(c);audit(c,'Correo movido/eliminado de carpeta monitorizada; requiere revisión');c.mail.removed=true;c.preparation.issues.push('Correo fuente movido o eliminado de carpeta monitorizada. Comprobar vigencia antes de preparar de nuevo.');}continue;}
    const version=m.changeKey||m.lastModifiedDateTime||'';if(current.seen[m.id]===version)continue;
    if(!current.baseline){current.seen[m.id]=version;continue;}
    const message=await get('/me/messages/'+encodeURIComponent(m.id)+'?$select=id,conversationId,subject,from,receivedDateTime,lastModifiedDateTime,changeKey,body,hasAttachments');
    const thread=await get('/me/messages?$filter='+encodeURIComponent("conversationId eq '"+String(message.conversationId||'').replaceAll("'","''")+"'")+'&$select=id,from,receivedDateTime,subject,bodyPreview&$top=50');
    const attachments=message.hasAttachments?await get('/me/messages/'+encodeURIComponent(m.id)+'/attachments?$select=id,name,size,contentType,isInline&$top=10'): {value:[]};
    for(let ai=0;ai<(attachments.value||[]).length;ai++){const a=attachments.value[ai];if(a['@odata.type']==='#microsoft.graph.fileAttachment'&&a.name?.toLowerCase().endsWith('.xlsx')&&!a.isInline&&a.size<=1000000)attachments.value[ai]=await get('/me/messages/'+encodeURIComponent(m.id)+'/attachments/'+encodeURIComponent(a.id));}

    const event=await transform(message,thread,attachments);const existing=working.state.cases.find(c=>c.mail?.threadId===event.threadId);const result=await processMail(working.state,event);const fresh=working.state.cases.find(c=>c.id===result.caseId);
    if(fresh&&!result.duplicate){fresh.mail.messageIds=[...new Set([...(existing?.mail?.messageIds||[]),message.id])];fresh.mail.threadTruncated=!!thread['@odata.nextLink'];fresh.mail.attachmentsTruncated=!!attachments['@odata.nextLink'];if(existing){const freshId=fresh.id;fresh.id=existing.id;fresh.previousVersions=[...(existing.previousVersions||[]),{...existing,previousVersions:undefined}].slice(-10);fresh.audit=[...existing.audit,...fresh.audit];audit(fresh,'Hilo actualizado: nueva preparación invalida revisión anterior');working.state.cases=working.state.cases.filter(c=>c!==existing);for(const p of working.state.automation.processed)if(p.caseId===freshId)p.caseId=fresh.id;for(const p of working.state.automation.events)if(p.caseId===freshId)p.caseId=fresh.id;for(const n of working.state.notices)if(n.caseId===freshId)n.caseId=fresh.id;}events++;}
    current.seen[m.id]=version;
   }
   const next=page['@odata.nextLink'],delta=page['@odata.deltaLink'];if(!next&&!delta)throw Error('DELTA_CURSOR_REQUIRED');safeGraphPath(next||delta);current.cursor=next||delta;if(!next)current.baseline=true;current.lastRun=new Date().toISOString();current.lastResult=!rec.baseline?'Baseline: existing mail skipped':'Processed '+events+' changed messages';working.state.receiver=current;await store.write(working.revision,working.state);Object.assign(rec,current);path=next?safeGraphPath(next):null;
  }return {events,baseline:rec.baseline};
 }finally{busy=false;}}};
}
export async function graphEvent(message,thread,attachments){
 const supported=(attachments.value||[]).filter(a=>a['@odata.type']==='#microsoft.graph.fileAttachment'&&a.name?.toLowerCase().endsWith('.xlsx')&&!a.isInline&&a.size<=1000000&&a.contentBytes);
 const version=message.changeKey||message.lastModifiedDateTime||'';
 return {eventId:'graph-'+createHash('sha256').update(message.id+'|'+version).digest('hex'),threadId:message.conversationId||message.id,received:message.receivedDateTime,subject:message.subject||'Sin asunto',from:message.from?.emailAddress?.address||'unverified',body:String(message.body?.content||'').slice(0,20000),thread:(thread.value||[]).map(m=>({id:m.id,from:m.from?.emailAddress?.address||'unverified',date:m.receivedDateTime,body:m.bodyPreview||''})),attachments:supported.map(a=>({name:a.name,type:'xlsx',contentBase64:a.contentBytes})),facts:{},expected:{},territory:'',declarationDate:'',intakeWarnings:['Fuente Microsoft pendiente de datos técnicos, totales declarados y territorio/fecha, no se infieren del correo.',...(thread['@odata.nextLink']?['Hilo limitado a 50 mensajes, contexto incompleto.']:[]),...(attachments['@odata.nextLink']?['Más de 10 adjuntos, lista incompleta.']:[]),...((attachments.value||[]).length!==supported.length?['Adjuntos no XLSX/embebidos/grandes omitidos.']:[])]};
}
