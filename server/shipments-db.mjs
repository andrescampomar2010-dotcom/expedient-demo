// Almacén de envíos por registro (SQLite, node:sqlite). Sustituye al estado completo en un solo documento para los envíos:
// - lecturas paginadas y filtradas (nunca el histórico entero),
// - escrituras acotadas a los registros que cambian, con control de versión por envío (si otro proceso cambió el mismo envío, se reintenta),
// - la lógica de relación de correos es la misma (web/shipments.mjs) y se ejecuta sobre un conjunto de trabajo pequeño:
//   envíos abiertos + los que citan DUA/expediente/referencia/hilo del correo + pendientes implicados.
import {DatabaseSync} from 'node:sqlite';
import * as S from '../web/shipments.mjs';
const clean=t=>S.norm(t).replace(/[^a-z0-9ñ ]/g,' ');
const STOP=['de','del','la','el','los','las','un','una','que','en','con'];
export function openShipmentsDb(path,{ownDomains=[]}={}){
 const db=new DatabaseSync(path);
 db.exec('PRAGMA busy_timeout=5000;');
 if(db.prepare('PRAGMA journal_mode').get().journal_mode!=='wal')db.exec('PRAGMA journal_mode=WAL;');
 db.exec('PRAGMA synchronous=NORMAL;');
 db.exec(`CREATE TABLE IF NOT EXISTS ship(id TEXT PRIMARY KEY,ver INTEGER NOT NULL,status TEXT NOT NULL,open INTEGER NOT NULL,rej INTEGER NOT NULL,dua TEXT,exp TEXT,updated TEXT NOT NULL,sum TEXT NOT NULL,json TEXT NOT NULL,hay TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS ship_open ON ship(open,rej,id);CREATE INDEX IF NOT EXISTS ship_order ON ship(rej DESC,id);CREATE INDEX IF NOT EXISTS ship_dua ON ship(dua);CREATE INDEX IF NOT EXISTS ship_exp ON ship(exp);
 CREATE TABLE IF NOT EXISTS mail(id TEXT PRIMARY KEY,ship_id TEXT,thread_id TEXT,date TEXT,json TEXT NOT NULL,hay TEXT NOT NULL,hayc TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS mail_ship ON mail(ship_id,date);CREATE INDEX IF NOT EXISTS mail_thread ON mail(thread_id);
 CREATE TABLE IF NOT EXISTS pending(mail_id TEXT PRIMARY KEY,seq INTEGER NOT NULL,json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS seen(scope TEXT NOT NULL,id TEXT NOT NULL,ver TEXT NOT NULL,PRIMARY KEY(scope,id));`);
 const q=sql=>db.prepare(sql);
 const own=()=>{const r=q('SELECT v FROM meta WHERE k=?').get('ownDomains');return r?JSON.parse(r.v):ownDomains};
 if(ownDomains.length)q('INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run('ownDomains',JSON.stringify(ownDomains));
 const shipRow=s=>{const m=S.summarize(s);const last=s.events.length?s.events[s.events.length-1].date:s.created;
  return{status:s.status,open:s.status!=='Entregado'?1:0,rej:m.rejectionOpen?1:0,dua:s.dua||'',exp:s.exp||'',updated:last||s.created||'',sum:JSON.stringify(m),hay:clean([s.id,s.exp,s.dua,s.client,s.provider].join(' '))}};
 const mailHay=m=>clean([m.subject,m.body,m.from,(m.attachments||[]).join(' '),m.attachmentText||''].join(' '));
 const parse=r=>JSON.parse(r.json);
 // ---- conjunto de trabajo ----
 function load({shipIds=[],mailIds=[],threads=[],pendingAll=false}={}){
  const st={shipments:S.blankShipments()};const W=st.shipments;W.ownDomains=own();
  const snap={ship:new Map(),mail:new Map(),pending:new Map()};
  const seenS=new Set(),seenM=new Set();
  const addShip=r=>{if(!r||seenS.has(r.id))return;seenS.add(r.id);W.items.push(parse(r));snap.ship.set(r.id,{ver:r.ver,json:r.json})};
  const addMail=r=>{if(!r||seenM.has(r.id))return;seenM.add(r.id);W.mails.push(parse(r));snap.mail.set(r.id,r.json)};
  for(const r of q('SELECT id,ver,json FROM ship WHERE open=1').all())addShip(r);
  for(const id of shipIds)addShip(q('SELECT id,ver,json FROM ship WHERE id=?').get(id));
  if(pendingAll)for(const r of q('SELECT mail_id,seq,json FROM pending ORDER BY seq').all()){const p=JSON.parse(r.json);W.pending.push(p);snap.pending.set(r.mail_id,{seq:r.seq,json:r.json});mailIds=[...mailIds,r.mail_id]}
  for(const id of mailIds)addMail(q('SELECT id,json FROM mail WHERE id=?').get(id));
  for(const t of threads)for(const r of q('SELECT id,json FROM mail WHERE thread_id=?').all(t))addMail(r);
  // envíos de los hilos y de los correos cargados (pueden estar entregados)
  for(const m of W.mails)if(m.shipmentId&&!seenS.has(m.shipmentId))addShip(q('SELECT id,ver,json FROM ship WHERE id=?').get(m.shipmentId));
  return{st,W,snap};
 }
 function save({W,snap}){
  const now=new Date().toISOString();
  const upS=q('INSERT INTO ship(id,ver,status,open,rej,dua,exp,updated,sum,json,hay) VALUES(?,1,?,?,?,?,?,?,?,?,?)'),
   upd=q('UPDATE ship SET ver=ver+1,status=?,open=?,rej=?,dua=?,exp=?,updated=?,sum=?,json=?,hay=? WHERE id=? AND ver=?');
  for(const s of W.items){const js=JSON.stringify(s),o=snap.ship.get(s.id);
   if(!o){const r=shipRow(s);upS.run(s.id,r.status,r.open,r.rej,r.dua,r.exp,r.updated,r.sum,js,r.hay);continue}
   if(o.json===js)continue;const r=shipRow(s);
   if(upd.run(r.status,r.open,r.rej,r.dua,r.exp,r.updated,r.sum,js,r.hay,s.id,o.ver).changes!==1)throw Object.assign(new Error('STALE_SHIPMENT'),{code:'STALE_SHIPMENT'});}
  const insM=q('INSERT INTO mail(id,ship_id,thread_id,date,json,hay,hayc) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET ship_id=excluded.ship_id,json=excluded.json,hay=excluded.hay,hayc=excluded.hayc');
  for(const m of W.mails){const js=JSON.stringify(m);if(snap.mail.get(m.id)===js)continue;const h=mailHay(m);insM.run(m.id,m.shipmentId||null,m.threadId||null,m.date,js,h,h.replace(/ /g,''))}
  const have=new Set(W.pending.map(p=>p.mailId));
  for(const id of snap.pending.keys())if(!have.has(id))q('DELETE FROM pending WHERE mail_id=?').run(id);
  let seq=(q('SELECT COALESCE(MAX(seq),0) AS m FROM pending').get().m)+1;
  for(const p of W.pending){const js=JSON.stringify(p),o=snap.pending.get(p.mailId);if(o){if(o.json!==js)q('UPDATE pending SET json=? WHERE mail_id=?').run(js,p.mailId);}else q('INSERT INTO pending(mail_id,seq,json) VALUES(?,?,?)').run(p.mailId,seq++,js)}
 }
 // Ejecuta fn sobre un conjunto de trabajo y guarda solo lo cambiado.
 // El escritor toma el bloqueo ANTES de leer el conjunto de trabajo: así dos escritores nunca parten de datos viejos (las lecturas no se bloquean: WAL).
 // La versión por envío queda como comprobación de seguridad adicional.
 function run(spec,fn){
  db.exec('BEGIN IMMEDIATE');
  try{const ws=load(spec);const out=fn(ws.st,ws.W);save(ws);db.exec('COMMIT');return out}
  catch(e){try{db.exec('ROLLBACK')}catch{}throw e}
 }
 const api={
  getRec(key){const r=q('SELECT v FROM meta WHERE k=?').get('rcv:'+key);return r?{...JSON.parse(r.v),seen:{}}:null},
  putRec(key,rec,seen){const {seen:_,...rest}=rec;db.exec('BEGIN IMMEDIATE');try{q('INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run('rcv:'+key,JSON.stringify(rest));const st=q('INSERT INTO seen(scope,id,ver) VALUES(?,?,?) ON CONFLICT(scope,id) DO UPDATE SET ver=excluded.ver');for(const [id,v] of Object.entries(seen||{}))st.run(key,id,String(v));db.exec('COMMIT')}catch(e){try{db.exec('ROLLBACK')}catch{}throw e}},
  seenGet(key,id){const r=q('SELECT ver FROM seen WHERE scope=? AND id=?').get(key,id);return r?r.ver:undefined},
  seenCount(key){return q('SELECT count(*) n FROM seen WHERE scope=?').get(key).n},
  setOwnDomains(d){q('INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run('ownDomains',JSON.stringify(d))},
  ingest(mailIn){
   const x=S.extract({...mailIn,attachments:mailIn.attachments||[]});
   const ids=[...x.refs];
   for(const d of x.duas)for(const r of q('SELECT id FROM ship WHERE dua=?').all(d))ids.push(r.id);
   for(const e of x.exps)for(const r of q('SELECT id FROM ship WHERE exp=?').all(e))ids.push(r.id);
   return run({shipIds:ids,threads:mailIn.threadId?[mailIn.threadId]:[]},(st)=>q('SELECT 1 FROM mail WHERE id=?').get(mailIn.id)?{status:'duplicate',why:'Este correo ya estaba registrado.'}:S.ingestMail(st,mailIn));
  },
  createShipment(d){return run({pendingAll:true,shipIds:[String(d?.id||'').trim()].filter(Boolean)},(st)=>S.addShipment(st,d))},
  confirm(mailId,shipmentId,via=''){return run({pendingAll:true,shipIds:shipmentId?[shipmentId]:[],mailIds:[mailId]},(st)=>S.confirmPending(st,mailId,shipmentId,via))},
  attachProposal(mailId,prop){return run({pendingAll:true},(st)=>S.attachProposal(st,mailId,prop))},
  addTask(id,t){return run({shipIds:[String(id||'')]},(st)=>S.addTask(st,String(id||''),t))},
  completeTask(id,tid){return run({shipIds:[String(id||'')]},(st)=>S.completeTask(st,String(id||''),String(tid||'')))},
  assignTask(id,tid,who){return run({shipIds:[String(id||'')]},(st)=>S.assignTask(st,String(id||''),String(tid||''),String(who||'')))},
  assignShipment(id,who){return run({shipIds:[String(id||'')]},(st)=>S.assignShipment(st,String(id||''),String(who||'')))},
  // ---- lecturas acotadas ----
  list({limit=50,after='',onlyOpen=false,onlyRejections=false}={}){
   limit=Math.min(Math.max(1,Number(limit)||50),200);const [ar,ai]=after?after.split('|'):['',''];
   const where=[];const args=[];if(onlyOpen)where.push('open=1');if(onlyRejections)where.push('rej=1');
   if(after){where.push('(rej<? OR (rej=? AND id>?))');args.push(Number(ar),Number(ar),ai)}
   const rows=q(`SELECT id,ver,rej,sum,json FROM ship ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY rej DESC,id ASC LIMIT ?`).all(...args,limit+1);
   const more=rows.length>limit;const page=rows.slice(0,limit).map(r=>{const s=parse(r);const {events,mailIds,plates,...head}=s;return{...head,ver:r.ver,summary:JSON.parse(r.sum),events:undefined,mailCount:(mailIds||[]).length}});
   return{items:page,next:more?`${rows[limit-1].rej}|${rows[limit-1].id}`:null};
  },
  get(id){const r=q('SELECT ver,json FROM ship WHERE id=?').get(id);if(!r)return null;const s=parse(r);
   const mails=q('SELECT json FROM mail WHERE ship_id=? ORDER BY date DESC LIMIT 200').all(id).map(parse);return{shipment:s,ver:r.ver,mails,summary:S.summarize(s)}},
  pending(limit=100){const rows=q('SELECT mail_id,json FROM pending ORDER BY seq LIMIT ?').all(Math.min(limit,500));
   return rows.map(r=>({...JSON.parse(r.json),mail:parse(q('SELECT json FROM mail WHERE id=?').get(r.mail_id)||{json:'null'})}))},
  stats(){return{shipments:q('SELECT COUNT(*) c FROM ship').get().c,mails:q('SELECT COUNT(*) c FROM mail').get().c,pending:q('SELECT COUNT(*) c FROM pending').get().c,openRejections:q('SELECT COUNT(*) c FROM ship WHERE rej=1').get().c}},
  mail(id){const r=q('SELECT json FROM mail WHERE id=?').get(id);return r?parse(r):null},
  search(text,limit=100){
   const raw=String(text||'').trim();if(!raw)return null;
   const x=S.extract({subject:raw,body:''});
   const words=S.norm(raw).replace(/[^a-z0-9ñ ]/g,' ').split(/\s+/).filter(w=>w.length>1&&!STOP.includes(w));
   const out=new Map();
   const idQuery=x.duas.length||x.exps.length||x.refs.length;
   for(const d of x.duas)for(const r of q('SELECT id,json FROM ship WHERE dua=?').all(d)){const s=parse(r);out.set(s.id,{shipmentId:s.id,exact:['DUA'],hits:s.mailIds,onlyIdentifier:true})}
   for(const e of x.exps)for(const r of q('SELECT id,json FROM ship WHERE exp=?').all(e)){const s=parse(r);const o=out.get(s.id)||{shipmentId:s.id,exact:[],hits:s.mailIds,onlyIdentifier:true};if(!o.exact.includes('expediente'))o.exact.push('expediente');out.set(s.id,o)}
   for(const r of x.refs){const row=q('SELECT json FROM ship WHERE id=?').get(r);if(row){const s=parse(row);const o=out.get(s.id)||{shipmentId:s.id,exact:[],hits:s.mailIds,onlyIdentifier:true};if(!o.exact.includes('referencia'))o.exact.push('referencia');out.set(s.id,o)}}
   if(!idQuery){
    const plates=x.plates.concat(x.trailers);const plateParts=new Set(plates.flatMap(p=>[p.slice(0,4).toLowerCase(),p.slice(-3).toLowerCase(),p.toLowerCase()]));
    const rest=words.filter(w=>!plateParts.has(w)&&!/^r$/.test(w)).map(w=>w.length>4?w.replace(/(es|s)$/,''):w);
    const conds=[],args=[];for(const p of plates){conds.push('hayc LIKE ?');args.push('%'+S.norm(p)+'%')}for(const w of rest){conds.push('hay LIKE ?');args.push('%'+w+'%')}
    if(conds.length){
     for(const r of q(`SELECT id,ship_id FROM mail WHERE ship_id IS NOT NULL AND ${conds.join(' AND ')} LIMIT 2000`).all(...args)){
      const o=out.get(r.ship_id)||{shipmentId:r.ship_id,exact:[],hits:[],onlyIdentifier:false};if(!o.onlyIdentifier)o.hits.push(r.id);out.set(r.ship_id,o)}}
   }
   const res=[...out.values()].slice(0,limit);
   for(const r of res){const row=q('SELECT ver,sum,json FROM ship WHERE id=?').get(r.shipmentId);if(row){const sh=parse(row);const {events,mailIds,plates,...head}=sh;r.head={...head,ver:row.ver,summary:JSON.parse(row.sum),mailCount:(mailIds||[]).length}}}
   return res;
  },
  // ---- migración desde el estado completo antiguo (state.shipments) ----
  importLegacy(legacy,{append=false}={}){
   if(!legacy||!Array.isArray(legacy.items))return{imported:false,reason:'sin datos'};
   if(!append&&q('SELECT 1 FROM meta WHERE k=?').get('migrated'))return{imported:false,reason:'ya migrado'};
   db.exec('BEGIN IMMEDIATE');
   try{
    const ins=q('INSERT OR IGNORE INTO ship(id,ver,status,open,rej,dua,exp,updated,sum,json,hay) VALUES(?,1,?,?,?,?,?,?,?,?,?)');
    for(const s of legacy.items){const r=shipRow(s);ins.run(s.id,r.status,r.open,r.rej,r.dua,r.exp,r.updated,r.sum,JSON.stringify(s),r.hay)}
    const im=q('INSERT OR IGNORE INTO mail(id,ship_id,thread_id,date,json,hay,hayc) VALUES(?,?,?,?,?,?,?)');
    for(const m of legacy.mails||[]){const h=mailHay(m);im.run(m.id,m.shipmentId||null,m.threadId||null,m.date,JSON.stringify(m),h,h.replace(/ /g,''))}
    let seq=1;for(const p of legacy.pending||[])q('INSERT OR IGNORE INTO pending(mail_id,seq,json) VALUES(?,?,?)').run(p.mailId,seq++,JSON.stringify(p));
    if(legacy.ownDomains?.length)api.setOwnDomains(legacy.ownDomains);
    const counts={shipments:legacy.items.length,mails:(legacy.mails||[]).length,pending:(legacy.pending||[]).length};
    q('INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run('migrated',JSON.stringify({at:new Date().toISOString(),...counts}));
    db.exec('COMMIT');return{imported:true,...counts};
   }catch(e){db.exec('ROLLBACK');throw e}
  },
  close(){db.close()}
 };
 return api;
}
