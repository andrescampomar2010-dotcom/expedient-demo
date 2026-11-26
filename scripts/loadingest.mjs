// Latencia de recepción (ingesta de un correo en el almacén por registro) con un histórico ya cargado. Datos sintéticos.
// Uso: node scripts/loadingest.mjs [--shipments 2200] [--mails 5] [--n 500]
import {mkdtempSync,statSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
import * as S from '../web/shipments.mjs';import {openShipmentsDb} from '../server/shipments-db.mjs';
const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i>0?Number(process.argv[i+1]):d};
const ns=arg('shipments',2200),nm=arg('mails',5),N=arg('n',500);
const st={shipments:S.blankShipments()};st.shipments.ownDomains=['empresa.example'];
const tpl=[['in','c1.example','Carga','Confirmamos carga.'],['in','p1.example','RE: Carga','Camión 1234 BCD'],['out','empresa.example','DUA','DUA presentado'],['in','aviso.example','Rechazo','Rechazada error'],['in','p1.example','Entrega','Entregado en destino, gracias.']];
for(let id=1;id<=ns;id++){const n=String(id).padStart(6,'0'),dua='26ES'+String(id).padStart(10,'0');S.addShipment(st,{id:'TR-'+n,exp:`EXP-2601-${id}`,dua,bultos:(id%40)+1,kg:100+id%900});
 for(let k=0;k<nm;k++){const [dir,dom,sub,body]=tpl[k%5];S.ingestMail(st,{id:`m${id}-${k}`,threadId:'th'+id,from:(dir==='out'?'ops@':'x@')+dom,subject:`${sub} TR-${n}`,date:new Date(Date.UTC(2026,0,1,8,0)+(id*nm+k)*60000).toISOString(),body:`${body} ${dua}`})}}
const p=join(mkdtempSync(join(tmpdir(),'li-')),'w.db');const db=openShipmentsDb(p,{ownDomains:['empresa.example']});db.importLegacy(st.shipments);
// 100 envíos nuevos abiertos (el día en curso) y luego N correos que llegan: la mitad con DUA, un cuarto por hilo/referencia, un cuarto sin referencia
const t0=performance.now();for(let i=1;i<=100;i++)db.createShipment({id:'TR-9'+String(i).padStart(5,'0'),dua:'26ES88'+String(i).padStart(8,'0')});
const create=(performance.now()-t0)/100;
const lat=[],stt={};
for(let i=0;i<N;i++){const sid=1+((i*7919)%100);const dua='26ES88'+String(sid).padStart(8,'0');const kind=i%4;
 const m={id:'new'+i,threadId:'nt'+(i%50),from:'x@c1.example',subject:kind===3?'Sin referencia':'Actualización',date:new Date(Date.UTC(2026,5,1)+i*1000).toISOString(),body:kind<2?`Aviso ${dua}`:kind===2?`Aviso TR-9${String(sid).padStart(5,'0')}`:'Papeles de la carga'};
 const t=performance.now();const r=db.ingest(m);lat.push(performance.now()-t);stt[r.status]=(stt[r.status]||0)+1}
lat.sort((a,b)=>a-b);const pc=q=>+lat[Math.min(lat.length-1,Math.floor(lat.length*q))].toFixed(1);
console.log(JSON.stringify({enviosHistoricos:ns,correosPorEnvio:nm,correosHistoricos:ns*nm,altaMs:+create.toFixed(1),ingesta:{n:N,p50ms:pc(.5),p95ms:pc(.95),p99ms:pc(.99),estados:stt},bdMB:+((statSync(p).size+(()=>{try{return statSync(p+'-wal').size}catch{return 0}})())/1e6).toFixed(1)}));
