// OCR local de PDF escaneados: pdftoppm (poppler-utils) + tesseract. Sin servicio externo, sin red.
// El texto de OCR NUNCA se usa para vincular ni confirmar: es una pista "leída por OCR, no verificada".
// La confianza de tesseract no es exactitud medida: solo se usa para marcar palabras dudosas.
import {execFile} from 'node:child_process';import {mkdtemp,readdir,readFile,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
export const OCR_LIMITS={maxPages:5,dpi:200,timeoutMs:60000,maxChars:20000,lowConf:80};
const run=(cmd,args,o)=>new Promise((ok,ko)=>execFile(cmd,args,{timeout:o.timeoutMs,killSignal:'SIGKILL',maxBuffer:20e6,env:{...process.env,OMP_THREAD_LIMIT:'1'},...o.opts},(e,so,se)=>e?ko(Object.assign(e,{stderr:se})):ok(so)));
export async function ocrAvailable(env=process.env){
 const t=env.TESSERACT_BIN||'tesseract',p=env.PDFTOPPM_BIN||'pdftoppm';
 try{await run(t,['--version'],{timeoutMs:5000});await run(p,['-v'],{timeoutMs:5000});}catch{return{ok:false,missing:'tesseract y/o pdftoppm'}}
 const lang=env.OCR_LANG||'spa+eng';let langs='';try{langs=await run(t,['--list-langs'],{timeoutMs:5000,opts:{env:{...process.env,...(env.TESSDATA_PREFIX?{TESSDATA_PREFIX:env.TESSDATA_PREFIX}:{})}}})}catch{}
 const miss=lang.split('+').filter(l=>!langs.split(/\s+/).includes(l));
 return miss.length?{ok:false,missing:'datos de idioma: '+miss.join(', ')}:{ok:true,lang};
}
// Devuelve {text,pages,words,doubtful:[{page,word,conf}],hints:{dua,exp,kg,bultos}}
export async function ocrPdf(bytes,L=OCR_LIMITS,env=process.env){
 const av=await ocrAvailable(env);if(!av.ok)throw Object.assign(new Error('OCR_NO_DISPONIBLE'),{detail:av.missing});
 const dir=await mkdtemp(join(tmpdir(),'ocr-'));
 try{
  await writeFile(join(dir,'in.pdf'),bytes);
  await run(env.PDFTOPPM_BIN||'pdftoppm',['-r',String(L.dpi),'-f','1','-l',String(L.maxPages),'-gray','-png',join(dir,'in.pdf'),join(dir,'p')],{timeoutMs:L.timeoutMs});
  const imgs=(await readdir(dir)).filter(f=>f.endsWith('.png')).sort();
  let text='',words=0;const doubtful=[];const tenv={...process.env,OMP_THREAD_LIMIT:'1',...(env.TESSDATA_PREFIX?{TESSDATA_PREFIX:env.TESSDATA_PREFIX}:{})};
  const start=Date.now();
  for(let i=0;i<imgs.length;i++){
   const left=L.timeoutMs-(Date.now()-start);if(left<=0)throw Object.assign(new Error('TIMEOUT'),{});
   const base=join(dir,'o'+i);await run(env.TESSERACT_BIN||'tesseract',[join(dir,imgs[i]),base,'-l',av.lang,'--psm','6','-c','tessedit_create_tsv=1'],{timeoutMs:left,opts:{env:tenv}});const tsv=await readFile(base+'.tsv','utf8');
   let line=-1,cur='';const rows=tsv.split('\n').slice(1).map(r=>r.split('\t')).filter(c=>c.length>=12&&c[0]==='5'&&c[11].trim());
   for(const c of rows){const key=c[2]+'-'+c[3]+'-'+c[4],conf=Number(c[10]),w=c[11].trim();if(key!==line){if(cur)text+=cur+'\n';cur='';line=key}cur+=(cur?' ':'')+w;words++;
    if(conf<L.lowConf||/\d/.test(w)&&/[A-Za-z]/.test(w)&&conf<95)doubtful.push({page:i+1,word:w,conf:Math.round(conf)});}
   if(cur)text+=cur+'\n';text+=`\n`;
  }
  text=text.slice(0,L.maxChars);
  const hints={dua:[...new Set((text.match(/\b\d{2}[A-Za-z]{2}\d{10,16}[A-Za-z]?\b/g)||[]).map(x=>x.toUpperCase()))],exp:[...new Set((text.match(/\bEXP[-\s]?\d{4}[-\s]?\d{1,3}\b/gi)||[]).map(x=>x.toUpperCase()))],
   kg:[...new Set([...text.matchAll(/(\d[\d.,]*)\s*kg\b/gi)].map(m=>m[0]))],bultos:[...new Set([...text.matchAll(/\bbultos?[ \t:]*\d+\b|\b\d+[ \t]*bultos?\b/gi)].map(m=>m[0]))]};
  return{text,pages:imgs.length,words,doubtful:doubtful.slice(0,200),hints};
 }finally{await rm(dir,{recursive:true,force:true})}
}
