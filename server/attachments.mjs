// Lectura de adjuntos recibidos: PDF digital (pdfjs-dist, Apache-2.0) y XLSX (exceljs). Con límites de tamaño, páginas y tiempo.
// Un documento sin texto (escaneo) NO se lee con OCR: se marca "sin texto" para que nadie crea que se leyó.
export const LIMITS={maxBytes:5_000_000,maxPages:30,maxChars:60_000,timeoutMs:8000};
const withTimeout=(p,ms)=>Promise.race([p,new Promise((_,ko)=>setTimeout(()=>ko(new Error('TIMEOUT')),ms))]);
async function pdfText(bytes,L){
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,verbosity:0,stopAtErrors:false});
 try{
  const doc=await task.promise;const n=Math.min(doc.numPages,L.maxPages);let out='';
  for(let i=1;i<=n&&out.length<L.maxChars;i++){const pg=await doc.getPage(i);const c=await pg.getTextContent();out+=c.items.map(x=>x.str).join(' ')+'\n'}
  return{text:out.slice(0,L.maxChars),pages:doc.numPages,truncated:doc.numPages>n||out.length>=L.maxChars};
 }finally{try{await task.destroy()}catch{}}
}
async function xlsxText(bytes,L){
 const {default:Excel}=await import('exceljs');const wb=new Excel.Workbook();await wb.xlsx.load(Buffer.from(bytes));
 let out='';wb.eachSheet(ws=>{ws.eachRow({includeEmpty:false},r=>{if(out.length<L.maxChars)out+=r.values.slice(1).map(v=>v&&v.text!==undefined?v.text:v&&v.result!==undefined?v.result:v??'').join(' ')+'\n'})});
 return{text:out.slice(0,L.maxChars),truncated:out.length>=L.maxChars};
}
// Devuelve {name,status,text?,note}. status: leido | sin_texto | demasiado_grande | no_soportado | error
export async function readAttachment({name,size,bytes},L=LIMITS){
 const low=String(name||'').toLowerCase(),kind=low.endsWith('.pdf')?'pdf':low.endsWith('.xlsx')?'xlsx':null;
 if(!kind)return{name,status:'no_soportado',note:'Tipo de archivo sin lectura de contenido'};
 if((size||bytes?.length||0)>L.maxBytes||(bytes&&bytes.length>L.maxBytes))return{name,status:'demasiado_grande',note:`Supera ${L.maxBytes/1e6} MB: no se leyó`};
 if(!bytes)return{name,status:'error',note:'Contenido no disponible'};
 try{
  const r=await withTimeout(kind==='pdf'?pdfText(bytes,L):xlsxText(bytes,L),L.timeoutMs);
  if(r.text.replace(/\s/g,'').length<20)return{name,status:'sin_texto',note:kind==='pdf'?'PDF sin texto (posible escaneo): no se leyó, no hay OCR':'Hoja sin contenido'};
  return{name,status:'leido',text:r.text,note:r.truncated?'Leído parcialmente por límite de tamaño':'Leído'};
 }catch(e){return{name,status:'error',note:e.message==='TIMEOUT'?'Tiempo de lectura agotado':'No se pudo leer el archivo'}}
}
