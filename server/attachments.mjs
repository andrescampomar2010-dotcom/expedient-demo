// Lectura de adjuntos recibidos: PDF digital (pdfjs-dist, Apache-2.0) y XLSX (exceljs). Con límites de tamaño, páginas y tiempo.
// Un documento sin texto (escaneo) NO se lee con OCR: se marca "sin texto" para que nadie crea que se leyó.
export const LIMITS={maxBytes:5_000_000,maxPages:30,maxChars:60_000,timeoutMs:8000};
import {Worker} from 'node:worker_threads';
const WORKER=new URL('./attachment-worker.mjs',import.meta.url);
// El análisis corre en un hilo aparte con tope de memoria y se CANCELA (terminate) al agotar el tiempo: no sigue gastando CPU.
function parseInWorker(kind,bytes,L,workerFile=WORKER){
 return new Promise((ok,ko)=>{
  const w=new Worker(workerFile,{workerData:{kind,bytes,L},resourceLimits:{maxOldGenerationSizeMb:256,maxYoungGenerationSizeMb:32}});
  let done=false;const end=(f,v)=>{if(done)return;done=true;clearTimeout(t);w.terminate();f(v)};
  const t=setTimeout(()=>end(ko,new Error('TIMEOUT')),L.timeoutMs);
  w.on('message',m=>m.error?end(ko,new Error(m.error)):end(ok,m.result));
  w.on('error',e=>end(ko,new Error(e.code==='ERR_WORKER_OUT_OF_MEMORY'?'MEMORY':'WORKER')));
  w.on('exit',()=>end(ko,new Error('WORKER_EXIT')));
 });
}
// Devuelve {name,status,text?,note}. status: leido | sin_texto | demasiado_grande | no_soportado | error
export async function readAttachment({name,size,bytes},L=LIMITS,workerFile){
 const low=String(name||'').toLowerCase(),kind=low.endsWith('.pdf')?'pdf':low.endsWith('.xlsx')?'xlsx':null;
 if(!kind)return{name,status:'no_soportado',note:'Tipo de archivo sin lectura de contenido'};
 if((size||bytes?.length||0)>L.maxBytes||(bytes&&bytes.length>L.maxBytes))return{name,status:'demasiado_grande',note:`Supera ${L.maxBytes/1e6} MB: no se leyó`};
 if(!bytes)return{name,status:'error',note:'Contenido no disponible'};
 try{
  const r=await parseInWorker(kind,bytes,L,workerFile);
  if(r.text.replace(/\s/g,'').length<20)return{name,status:'sin_texto',note:kind==='pdf'?'PDF sin texto (posible escaneo): no se leyó, no hay OCR':'Hoja sin contenido'};
  return{name,status:'leido',text:r.text,note:r.truncated?'Leído parcialmente por límite de tamaño':'Leído'};
 }catch(e){return e.message==='PASSWORD'?{name,status:'protegido',note:'PDF protegido con clave: no se leyó'}:{name,status:'error',note:e.message==='TIMEOUT'?'Tiempo de lectura agotado: se canceló la lectura':e.message==='MEMORY'?'Archivo demasiado pesado de procesar: no se leyó':'No se pudo leer el archivo'}}
}
