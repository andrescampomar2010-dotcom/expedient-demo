// Prueba de carga de la lógica de envíos (sin red). Uso: node scripts/loadtest.mjs [dias] [envios_por_dia]
import {blankShipments,ingestMail,addShipment,search,ensure} from '../web/shipments.mjs';
const days=Number(process.argv[2]||30),perDay=Number(process.argv[3]||100);
const st={shipments:blankShipments()};st.shipments.ownDomains=['empresa.example'];
const t0=performance.now();let id=0,mails=0,pend=0,lat=[];
for(let d=0;d<days;d++){
 for(let i=0;i<perDay;i++){id++;const n=String(id).padStart(6,'0');addShipment(st,{id:'TR-'+n,exp:`EXP-26${String(d%12+1).padStart(2,'0')}-${i}`,dua:'26ES'+String(id).padStart(10,'0'),bultos:(id%40)+1,kg:1000+(id%90)*10,client:'Cliente '+(id%30),clientDomain:`c${id%30}.example`,provider:'Prov '+(id%12),providerDomain:`p${id%12}.example`});
  const base=Date.UTC(2026,0,1+d,8,i%60);
  const msgs=[['in',`c${id%30}.example`,`Carga TR-${n}`,'Confirmamos carga.'],['in',`p${id%12}.example`,`RE: Carga TR-${n}`,`Camión ${1000+(id%9000)} BCD`],['out','empresa.example',`DUA ${n}`,`DUA presentado 26ES${String(id).padStart(10,'0')}`],['in','aviso.example','Rechazo',`Rechazada 26ES${String(id).padStart(10,'0')} error`],['in',`p${id%12}.example`,`Entrega TR-${n}`,'Entregado en destino, gracias.']];
  msgs.forEach(([dir,dom,sub,body],k)=>{const t=performance.now();const r=ingestMail(st,{id:`m${id}-${k}`,threadId:'th'+id,from:(dir==='out'?'ops@':'x@')+dom,subject:sub,date:new Date(base+k*600000).toISOString(),body});lat.push(performance.now()-t);mails++;if(r.status==='pending')pend++;});
 }}
const total=performance.now()-t0;lat.sort((a,b)=>a-b);
const s0=performance.now();for(let i=0;i<50;i++)search(st,'26ES'+String(1+i*7).padStart(10,'0'));const sd=(performance.now()-s0)/50;
const s1=performance.now();for(let i=0;i<20;i++)search(st,'camión entregado');const sw=(performance.now()-s1)/20;
console.log(JSON.stringify({dias:days,enviosPorDia:perDay,envios:ensure(st).items.length,correos:mails,pendientes:pend,totalSeg:+(total/1000).toFixed(2),ingestaMsMediana:+lat[lat.length>>1].toFixed(3),ingestaMsP99:+lat[Math.floor(lat.length*.99)].toFixed(3),busquedaDUAms:+sd.toFixed(2),busquedaPalabrasMs:+sw.toFixed(1),estadoJSON_MB:+(JSON.stringify(st).length/1e6).toFixed(1)}));
