import {parentPort,workerData} from 'node:worker_threads';
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

try{
 const {kind,bytes,L}=workerData;
 parentPort.postMessage({result:kind==='pdf'?await pdfText(bytes,L):await xlsxText(bytes,L)});
}catch(e){parentPort.postMessage({error:e?.name==='PasswordException'?'PASSWORD':'PARSE'})}
