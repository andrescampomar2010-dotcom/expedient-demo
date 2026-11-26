// Carga HTTP reproducible contra el servidor real (SQLite, APP_AUTH=local). Datos sintéticos.
// Uso: node scripts/loadhttp.mjs [--sessions 30] [--shipments 100] [--mails 5] [--seconds 30] [--write 0.1]
// 30 sesiones = 30 hilos, cada uno con su login. Mezcla por sesión (sin tiempo de pensar entre acciones, peor caso que un uso humano):
//   lista paginada 35% · ficha de un envío 25% · búsqueda por DUA 12% · pendientes 5% · estadísticas 5%
//   alta de envío (escritura por registro) 10% · espacio compartido 8%: lectura 20%, edición de expediente 20%, aviso nuevo 15%, edición de aviso 15%, borrador nuevo 15% (todos por registro: 409 solo si dos sesiones tocan el mismo registro) y escritura del historial (documento común, 409 de revisión) 15%.
// El generador y el servidor comparten la máquina: los números incluyen esa competencia. No es una prueba de capacidad certificada.
import {Worker,isMainThread,workerData,parentPort} from 'node:worker_threads';
import {spawn,spawnSync,execFileSync} from 'node:child_process';import {mkdtempSync,statSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i>0?Number(process.argv[i+1]):d};
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!isMainThread){
 const {base,user,pass,seconds,writeRatio,seed}=workerData;
 let rnd=seed;const R=()=>(rnd=(rnd*1664525+1013904223)>>>0)/2**32;
 const origin=base,H=c=>({cookie:c,origin});
 const lr=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({name:user,password:pass})});
 if(!lr.ok){parentPort.postMessage({fatal:'login '+lr.status});process.exit(0)}
 let cookie=lr.headers.get('set-cookie').split(';')[0];
 const sr=await fetch(base+'/api/status',{headers:H(cookie)});const st=await sr.json();const sid=(sr.headers.get('set-cookie')||'').split(';')[0];if(sid)cookie+='; '+sid;const csrf=st.csrf;
 const lat={};const codes={};let bytesIn=0,bytesOut=0,n=0;const end=Date.now()+seconds*1000;
 const rec=(k,t,c)=>{(lat[k]||=[]).push(performance.now()-t);codes[k+' '+c]=(codes[k+' '+c]||0)+1};
 const nsh=workerData.shipments;
 const opPost=async body=>{const t=performance.now();const r=await fetch(base+'/api/shipments/op',{method:'POST',headers:{...H(cookie),'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)});await r.arrayBuffer();return[t,r.status]};
 while(Date.now()<end){
  const x=R();let t=performance.now();
  if(x<.35){const r=await fetch(base+'/api/shipments/list?limit=50'+(R()<.3?'&open=1':''),{headers:H(cookie)});const b=await r.arrayBuffer();bytesIn+=b.byteLength;rec('lista',t,r.status)}
  else if(x<.60){const id='TR-'+String(1+Math.floor(R()*nsh)).padStart(6,'0');const r=await fetch(base+'/api/shipments/item?id='+id,{headers:H(cookie)});const b=await r.arrayBuffer();bytesIn+=b.byteLength;rec('ficha',t,r.status)}
  else if(x<.72){const id=1+Math.floor(R()*nsh);const r=await fetch(base+'/api/shipments/search?q='+encodeURIComponent('26ES'+String(id).padStart(10,'0')),{headers:H(cookie)});const b=await r.arrayBuffer();bytesIn+=b.byteLength;rec('busqueda',t,r.status)}
  else if(x<.77){const r=await fetch(base+'/api/shipments/pending?limit=50',{headers:H(cookie)});const b=await r.arrayBuffer();bytesIn+=b.byteLength;rec('pendientes',t,r.status)}
  else if(x<.82){const r=await fetch(base+'/api/shipments/stats',{headers:H(cookie)});await r.arrayBuffer();rec('stats',t,r.status)}
  else if(x<.92){const [t0,c]=await opPost({op:'create',data:{id:`TR-L${seed}-${n++}`,dua:`26ES9${seed}${n}`.padEnd(14,'0'),exp:`EXP-2699-${seed}`}});rec('alta',t0,c)}
  else{const r0=await fetch(base+'/api/workspace',{headers:H(cookie)});const w=await r0.json();
   const y=R();const post=async(name)=>{const body=JSON.stringify({revision:w.revision,docH:w.docH,state:w.state});bytesOut+=body.length;t=performance.now();const r=await fetch(base+'/api/workspace',{method:'POST',headers:{...H(cookie),'content-type':'application/json','x-csrf-token':csrf},body});const j=await r.json().catch(()=>({}));rec(name,t,r.status+(r.status===409?' '+(j.error||'').split('_')[0]:''))};
   const pick=a=>a[Math.floor(R()*a.length)];
   if(y<.2){rec('espacio-lee',t,r0.status)}
   else if(y<.4){const c=pick(w.state.cases||[]);if(c){c.n=(c.n||0)+1;await post('caso-edita')}}
   else if(y<.55){w.state.notices.push({id:'N'+seed+'-'+n++,caseId:'C-0',text:'aviso'});await post('aviso-nuevo')}
   else if(y<.7){const x=pick(w.state.notices||[]);if(x){x.read=!x.read;await post('aviso-edita')}}
   else if(y<.85){w.state.drafts.push({id:'D'+seed+'-'+n++,caseId:'C-0',to:'x@ejemplo.test',subject:'s'});await post('borrador-nuevo')}
   else{w.state.history.push({id:'H'+seed+'-'+n++,t:Date.now()});await post('historial-documento')}}
 }
 parentPort.postMessage({lat,codes,bytesIn,bytesOut});
}else{
 const sessions=arg('sessions',30),shipments=arg('shipments',100),mails=arg('mails',5),seconds=arg('seconds',30),writeRatio=arg('write',0.1);
 const {blank}=await import(ROOT+'/web/core.mjs');const sh=await import(ROOT+'/web/shipments.mjs');
 const dir=mkdtempSync(join(tmpdir(),'lh-')),db=join(dir,'w.db'),users=join(dir,'users.json');
 const state=blank();state.shipments=sh.blankShipments();state.shipments.ownDomains=['empresa.example'];
 const tpl=[['in','c1.example','Carga','Confirmamos carga.'],['in','p1.example','RE: Carga','Camión 1234 BCD'],['out','empresa.example','DUA','DUA presentado'],['in','aviso.example','Rechazo','Rechazada error'],['in','p1.example','Entrega','Entregado en destino, gracias.']];
 const t0=performance.now();
 for(let id=1;id<=shipments;id++){const n=String(id).padStart(6,'0'),dua='26ES'+String(id).padStart(10,'0');
  sh.addShipment(state,{id:'TR-'+n,exp:`EXP-2601-${id}`,dua,bultos:(id%40)+1,kg:100+id%900});
  for(let k=0;k<mails;k++){const [dir,dom,sub,body]=tpl[k%tpl.length];sh.ingestMail(state,{id:`m${id}-${k}`,threadId:'th'+id,from:(dir==='out'?'ops@':'x@')+dom,subject:`${sub} TR-${n}`,date:new Date(Date.UTC(2026,0,1,8,0)+(id*mails+k)*60000).toISOString(),body:`${body} ${dua} ${'texto de relleno de un correo habitual. '.repeat(3)}`});}}
 const preloadS=(performance.now()-t0)/1000;
 {const {openShipmentsDb}=await import(ROOT+'/server/shipments-db.mjs');const sdb=openShipmentsDb(db,{ownDomains:['empresa.example']});sdb.importLegacy(state.shipments);sdb.close();}
 {const {openStore}=await import(ROOT+'/server/store.mjs');const ws=await openStore(db);const cur=ws.read();cur.state.cases=Array.from({length:arg('cases',300)},(_,i)=>({id:'C-'+i,title:'Expediente sintético '+i,n:0,audit:[]}));cur.state.notices=Array.from({length:arg('avisos',600)},(_,i)=>({id:'N-'+i,caseId:'C-'+(i%300),text:'aviso',read:false}));cur.state.drafts=Array.from({length:100},(_,i)=>({id:'D-'+i,caseId:'C-'+i,to:'x@ejemplo.test',subject:'borrador'}));await ws.write(cur.revision,cur.state);ws.close();}
 const stateMB=JSON.stringify(state.shipments).length/1e6;
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
 const ws=Array.from({length:sessions},(_,i)=>new Promise(ok=>{const w=new Worker(fileURLToPath(import.meta.url),{workerData:{base,user:'carga',pass:pw,seconds,writeRatio,seed:i+1,shipments}});w.on('message',ok);w.on('error',e=>ok({fatal:String(e.message)}));}));
 const res=await Promise.all(ws);const wall=(Date.now()-wall0)/1000;const c1=pcpu0();clearInterval(tm);
 const pct=(a,p)=>a.length?+a.sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))].toFixed(1):null;
 const all={},codes={};let bin=0,bout=0,fatal=[];
 for(const r of res){if(r.fatal){fatal.push(r.fatal);continue}for(const k in r.lat)(all[k]||=[]).push(...r.lat[k]);for(const k in r.codes)codes[k]=(codes[k]||0)+r.codes[k];bin+=r.bytesIn;bout+=r.bytesOut}
 const ops={};let total=0;for(const k in all){total+=all[k].length;ops[k]={n:all[k].length,p50ms:pct(all[k],.5),p95ms:pct(all[k],.95),p99ms:pct(all[k],.99)}}
 const dbSize=['','-wal'].reduce((a,x)=>a+(existsSync(db+x)?statSync(db+x).size:0),0)/1e6;
 const out={sessions,shipments,mailsPerShipment:mails,seconds,datosEnviosMB:+stateMB.toFixed(2),preloadS:+preloadS.toFixed(1),peticionesPorS:+(total/wall).toFixed(1),ops,codigos:codes,MBleidos:+(bin/1e6).toFixed(0),
  servidor:{rssMaxMB:+Math.max(0,...samples).toFixed(0),cpuMediaPct:c0&&c1?+((cpuSec(c1[1])-cpuSec(c0[1]))/wall*100).toFixed(0):null},bdMB:+dbSize.toFixed(1),errores:fatal,stderrServidor:serr.includes('Error')?serr.slice(0,300):''};
 console.log(JSON.stringify(out));srv.kill();
  }
