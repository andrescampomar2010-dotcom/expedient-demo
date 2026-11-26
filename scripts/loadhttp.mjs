// Carga HTTP reproducible contra el servidor real (SQLite, APP_AUTH=local). Datos sintéticos.
// Uso: node scripts/loadhttp.mjs [--sessions 30] [--shipments 100] [--mails 5] [--seconds 30] [--write 0.1]
// 30 sesiones = 30 hilos, cada uno con su login. Lectura = GET /api/workspace (estado completo). Escritura = POST /api/workspace
// del estado completo con la revisión leída (como hace el navegador): si otra sesión escribió antes, 409.
// El generador y el servidor comparten la máquina: los números incluyen esa competencia. No es una prueba de capacidad certificada.
import {Worker,isMainThread,workerData,parentPort} from 'node:worker_threads';
import {spawn,spawnSync,execFileSync} from 'node:child_process';import {mkdtempSync,statSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i>0?Number(process.argv[i+1]):d};
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!isMainThread){
 const {base,user,pass,seconds,writeRatio,seed}=workerData;const {ingestMail}=await import(ROOT+'/web/shipments.mjs');
 let rnd=seed;const R=()=>(rnd=(rnd*1664525+1013904223)>>>0)/2**32;
 const origin=base,H=c=>({cookie:c,origin});
 const lr=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({name:user,password:pass})});
 if(!lr.ok){parentPort.postMessage({fatal:'login '+lr.status});process.exit(0)}
 let cookie=lr.headers.get('set-cookie').split(';')[0];
 const sr=await fetch(base+'/api/status',{headers:H(cookie)});const st=await sr.json();const sid=(sr.headers.get('set-cookie')||'').split(';')[0];if(sid)cookie+='; '+sid;const csrf=st.csrf;
 const lat={read:[],write:[]},codes={};let bytesIn=0,bytesOut=0,n=0;const end=Date.now()+seconds*1000;
 const count=(k,c)=>codes[k+c]=(codes[k+c]||0)+1;
 while(Date.now()<end){
  if(R()<writeRatio){
   // lectura previa (como el navegador antes de editar) y escritura con la revisión leída
   const r0=await fetch(base+'/api/workspace',{headers:H(cookie)});const txt=await r0.text();const w=JSON.parse(txt);if(!w.state){parentPort.postMessage({fatal:"GET "+r0.status+" "+txt.slice(0,80)});process.exit(0)}
   const S=w.state.shipments,items=S.items||[];if(!items.length)continue;const sh=items[Math.floor(R()*items.length)];
   ingestMail(w.state,{id:`L${seed}-${n++}`,threadId:'th-'+sh.id,from:'x@c1.example',subject:'RE: Carga '+sh.id,date:new Date().toISOString(),body:'Actualización de carga '+sh.id});
   const body=JSON.stringify({revision:w.revision,state:w.state});bytesOut+=body.length;
   const t=performance.now();const r=await fetch(base+'/api/workspace',{method:'POST',headers:{...H(cookie),'content-type':'application/json','x-csrf-token':csrf},body});await r.arrayBuffer();
   lat.write.push(performance.now()-t);count('w',r.status);
  }else{
   const t=performance.now();const r=await fetch(base+'/api/workspace',{headers:H(cookie)});const b=await r.arrayBuffer();lat.read.push(performance.now()-t);bytesIn+=b.byteLength;count('r',r.status);
  }
 }
 parentPort.postMessage({lat,codes,bytesIn,bytesOut});
}else{
 const sessions=arg('sessions',30),shipments=arg('shipments',100),mails=arg('mails',5),seconds=arg('seconds',30),writeRatio=arg('write',0.1);
 const {blank}=await import(ROOT+'/web/core.mjs');const sh=await import(ROOT+'/web/shipments.mjs');const {openStore}=await import(ROOT+'/server/store.mjs');
 const dir=mkdtempSync(join(tmpdir(),'lh-')),db=join(dir,'w.db'),users=join(dir,'users.json');
 const state=blank();state.shipments=sh.blankShipments();state.shipments.ownDomains=['empresa.example'];
 const tpl=[['in','c1.example','Carga','Confirmamos carga.'],['in','p1.example','RE: Carga','Camión 1234 BCD'],['out','empresa.example','DUA','DUA presentado'],['in','aviso.example','Rechazo','Rechazada error'],['in','p1.example','Entrega','Entregado en destino, gracias.']];
 const t0=performance.now();
 for(let id=1;id<=shipments;id++){const n=String(id).padStart(6,'0'),dua='26ES'+String(id).padStart(10,'0');
  sh.addShipment(state,{id:'TR-'+n,exp:`EXP-2601-${id}`,dua,bultos:(id%40)+1,kg:100+id%900});
  for(let k=0;k<mails;k++){const [dir,dom,sub,body]=tpl[k%tpl.length];sh.ingestMail(state,{id:`m${id}-${k}`,threadId:'th'+id,from:(dir==='out'?'ops@':'x@')+dom,subject:`${sub} TR-${n}`,date:new Date(Date.UTC(2026,0,1,8,0)+(id*mails+k)*60000).toISOString(),body:`${body} ${dua} ${'texto de relleno de un correo habitual. '.repeat(3)}`});}}
 const preloadS=(performance.now()-t0)/1000;
 const store=await openStore(db);await store.write(0,state);
 const stateMB=JSON.stringify(state).length/1e6;
 const pw='una-clave-larga-1';
 spawnSync(process.execPath,[ROOT+'/scripts/adduser.mjs','carga','operador'],{env:{...process.env,APP_USERS_PATH:users,ADDUSER_PASSWORD:pw}});
 const PORT=5600+Math.floor(Math.random()*300);
 const srv=spawn(process.execPath,[ROOT+'/server/server.mjs'],{cwd:ROOT,env:{...process.env,PORT:String(PORT),APP_AUTH:'local',APP_USERS_PATH:users,APP_DATA_PATH:db,INTEGRATION_MOCK:'false'},stdio:['ignore','pipe','pipe']});
 let serr='';srv.stderr.on('data',d=>serr+=d);
 const base=`http://localhost:${PORT}`;
 for(let i=0;i<50;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,200))}
 const samples=[];const pcpu0=()=>{try{return execFileSync('ps',['-o','rss=,cputime=','-p',String(srv.pid)]).toString().trim().split(/\s+/)}catch{return null}};
 const tm=setInterval(()=>{const s=pcpu0();if(s)samples.push(Number(s[0])/1024)},1000);
 const cpuSec=s=>{const p=s.split(':').map(Number).reverse();return p[0]+(p[1]||0)*60+(p[2]||0)*3600};
 const c0=pcpu0();const wall0=Date.now();
 const ws=Array.from({length:sessions},(_,i)=>new Promise(ok=>{const w=new Worker(fileURLToPath(import.meta.url),{workerData:{base,user:'carga',pass:pw,seconds,writeRatio,seed:i+1}});w.on('message',ok);w.on('error',e=>ok({fatal:String(e.message)}));}));
 const res=await Promise.all(ws);const wall=(Date.now()-wall0)/1000;const c1=pcpu0();clearInterval(tm);
 const pct=(a,p)=>a.length?+a.sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))].toFixed(1):null;
 const all={read:[],write:[]},codes={};let bin=0,bout=0,fatal=[];
 for(const r of res){if(r.fatal){fatal.push(r.fatal);continue}all.read.push(...r.lat.read);all.write.push(...r.lat.write);for(const k in r.codes)codes[k]=(codes[k]||0)+r.codes[k];bin+=r.bytesIn;bout+=r.bytesOut}
 const dbSize=['','-wal'].reduce((a,x)=>a+(existsSync(db+x)?statSync(db+x).size:0),0)/1e6;
 const out={sessions,shipments,mailsPerShipment:mails,seconds,writeRatio,stateMB:+stateMB.toFixed(2),preloadS:+preloadS.toFixed(1),
  lecturas:{n:all.read.length,p50ms:pct(all.read,.5),p95ms:pct(all.read,.95),p99ms:pct(all.read,.99),rps:+(all.read.length/wall).toFixed(1)},
  escrituras:{n:all.write.length,p50ms:pct(all.write,.5),p95ms:pct(all.write,.95),p99ms:pct(all.write,.99)},
  codigos:codes,MBleidos:+(bin/1e6).toFixed(0),MBenviados:+(bout/1e6).toFixed(0),
  servidor:{rssMaxMB:+Math.max(0,...samples).toFixed(0),cpuMediaPct:c0&&c1?+((cpuSec(c1[1])-cpuSec(c0[1]))/wall*100).toFixed(0):null},bdMB:+dbSize.toFixed(1),errores:fatal,stderrServidor:serr.slice(0,300)};
 console.log(JSON.stringify(out));srv.kill();
}
