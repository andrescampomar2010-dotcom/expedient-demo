import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {blank} from '../web/core.mjs';
export async function openStore(path){
 if(String(path).endsWith('.db'))return openSqliteWorkspace(path);
 let current={revision:0,state:blank()};try{current=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 let queue=Promise.resolve();
 return {read(){return structuredClone(current)},async write(expected,state){const work=queue.then(async()=>{
  if(expected!==current.revision)throw Error('REVISION_CONFLICT');
  if(!state||state.version!=='0.1.0'||!['cases','notices','drafts','knowledge','history'].every(k=>Array.isArray(state[k])))throw Error('INVALID_STATE');
  if(state.cases.length>500||state.knowledge.length>1000)throw Error('DEMO_LIMIT');
  const next={revision:current.revision+1,state};await mkdir(dirname(path),{recursive:true});await writeFile(path+'.tmp',JSON.stringify(next),{mode:0o600});await rename(path+'.tmp',path);current=structuredClone(next);return this.read();});queue=work.catch(()=>{});return work;}};
}

// Variante SQLite (APP_DATA_PATH terminado en .db): misma interfaz read()/write(revision,estado), con transacción y
// detección de cambios concurrentes entre procesos. Límites por APP_MAX_CASES / APP_MAX_KNOWLEDGE (por defecto altos).
async function openSqliteWorkspace(path){
 const {openStore:open}=await import('./store-sqlite.mjs');
 const {createHash}=await import('node:crypto');
 const {existsSync,writeFileSync}=await import('node:fs');
 await mkdir(dirname(path),{recursive:true});
 const db=open(path),K='workspace',D=db.sql;
 const maxCases=Number(process.env.APP_MAX_CASES||50000),maxKnow=Number(process.env.APP_MAX_KNOWLEDGE||100000);
 const perRecord=process.env.APP_CASES_STORE!=='document';
 // Expedientes, avisos y borradores por registro: cada elemento es una fila con su propia versión; un conflicto solo afecta al mismo elemento.
 D.exec('CREATE TABLE IF NOT EXISTS casos(id TEXT PRIMARY KEY,seq INTEGER NOT NULL,ver INTEGER NOT NULL,hash TEXT NOT NULL,json TEXT NOT NULL);CREATE INDEX IF NOT EXISTS casos_seq ON casos(seq);CREATE TABLE IF NOT EXISTS casos_meta(k TEXT PRIMARY KEY,v TEXT NOT NULL);CREATE TABLE IF NOT EXISTS reg(coll TEXT NOT NULL,id TEXT NOT NULL,seq INTEGER NOT NULL,ver INTEGER NOT NULL,hash TEXT NOT NULL,json TEXT NOT NULL,PRIMARY KEY(coll,id));CREATE INDEX IF NOT EXISTS reg_seq ON reg(coll,seq)');
 const hashOf=t=>createHash('sha256').update(t).digest('hex').slice(0,16);
 const COLS=['cases','notices','drafts'];
 const docHash=st=>{const rest={...st};for(const k of COLS)delete rest[k];return hashOf(JSON.stringify({...rest,cases:[],notices:[],drafts:[]}))};
 const docText=st=>{const rest={...st};for(const k of COLS)delete rest[k];return JSON.stringify({state:{...rest,cases:[],notices:[],drafts:[]}})};
 const strip=c=>{const {_v,_h,...rest}=c;return rest};
 const q=sql=>D.prepare(sql);
 const meta=k=>q('SELECT v FROM casos_meta WHERE k=?').get(k)?.v;
 const setMeta=(k,v)=>q('INSERT INTO casos_meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k,String(v));
 const bump=()=>setMeta('gen',(Number(meta('gen')||0)+1));
 // acceso uniforme: expedientes en `casos` (más reciente primero), avisos y borradores en `reg` (orden de inserción)
 const A={
  cases:{sel:()=>q('SELECT id,ver,hash,json FROM casos ORDER BY seq DESC'),get:q('SELECT ver,hash FROM casos WHERE id=?'),upd:q('UPDATE casos SET ver=ver+1,hash=?,json=? WHERE id=?'),ins:q('INSERT INTO casos(id,seq,ver,hash,json) VALUES(?,?,1,?,?)'),max:()=>q('SELECT COALESCE(MAX(seq),0) m FROM casos').get().m,desc:true,err:'CASE_CONFLICT'},
  };
 const reg=c=>({sel:()=>q('SELECT id,ver,hash,json FROM reg WHERE coll=\''+c+'\' ORDER BY seq'),get:{get:id=>q('SELECT ver,hash FROM reg WHERE coll=? AND id=?').get(c,id)},upd:{run:(h,t,id)=>q('UPDATE reg SET ver=ver+1,hash=?,json=? WHERE coll=? AND id=?').run(h,t,c,id)},ins:{run:(id,seq,h,t)=>q('INSERT INTO reg(coll,id,seq,ver,hash,json) VALUES(?,?,?,1,?,?)').run(c,id,seq,h,t)},max:()=>q('SELECT COALESCE(MAX(seq),0) m FROM reg WHERE coll=?').get(c).m,desc:false,err:'RECORD_CONFLICT'});
 A.notices=reg('notices');A.drafts=reg('drafts');
 const rowsOf=c=>A[c].sel().all();
 const colJson=c=>'['+rowsOf(c).map(x=>x.json.slice(0,-1)+(x.json==='{}'?'':',')+'"_v":'+x.ver+',"_h":"'+x.hash+'"}').join(',')+']';
 function migrate(){
  if(!perRecord)return;
  const r=db.read(K);const st=r.ver?r.value.state:null;
  const todo=COLS.filter(c=>!meta('migrated_'+c)&&!(c==='cases'&&meta('migrated')));
  if(!todo.length)return;
  for(const c of todo){const items=st?.[c]||[];if(items.length&&!existsSync(path+'.'+({cases:'expedientes',notices:'avisos',drafts:'borradores'})[c]+'-anterior.json'))writeFileSync(path+'.'+({cases:'expedientes',notices:'avisos',drafts:'borradores'})[c]+'-anterior.json',JSON.stringify(items),{mode:0o600})}
  D.exec('BEGIN IMMEDIATE');
  try{
   for(const c of todo){const items=st?.[c]||[];let n=items.length;
    for(const x of items){const t=JSON.stringify(strip(x)),h=hashOf(t),id=String(x.id);if(c==='cases')A.cases.ins.run(id,n--,h,t);else A[c].ins.run(id,items.length-n--+1,h,t)}
    setMeta(c==='cases'?'migrated':'migrated_'+c,JSON.stringify({at:new Date().toISOString(),count:items.length}))}
   bump();D.exec('COMMIT');
  }catch(e){D.exec('ROLLBACK');throw e}
  if(st){const ns={...st};for(const c of todo)ns[c]=[];db.write(K,{state:ns},r.ver)}
 }
 migrate();
 let rawCache={key:'',v:''};
 const assemble=()=>{const r=db.read(K);const base=r.ver?{revision:r.ver,state:r.value.state}:{revision:0,state:blank()};base.docH=docHash(base.state);for(const c of COLS)base.state[c]=JSON.parse(colJson(c));return base};
 return{
  readJson(){const r=db.readRaw(K);if(!r)return null;if(!perRecord)return `{"revision":${r.ver},"state":${r.v.slice(9,-1)}}`;const key=r.ver+':'+meta('gen');if(rawCache.key!==key){const doc=r.v.slice(9,-1);rawCache={key,v:`{"revision":${r.ver},"docH":"${docHash(JSON.parse(doc))}","state":${doc.slice(0,-1)},"cases":${colJson('cases')},"notices":${colJson('notices')},"drafts":${colJson('drafts')}}}`}}return rawCache.v},
  read(){if(!perRecord){const r=db.read(K);return r.ver?{revision:r.ver,state:r.value.state}:{revision:0,state:blank()}}return assemble()},
  async write(expected,state,docH){
   if(!state||state.version!=='0.1.0'||!['cases','notices','drafts','knowledge','history'].every(k=>Array.isArray(state[k])))throw Error('INVALID_STATE');
   if(state.cases.length>maxCases||state.knowledge.length>maxKnow)throw Error('LIMIT_EXCEEDED');
   if(!perRecord){try{const ver=db.write(K,{state},expected);return{revision:ver,state}}catch(e){if(e.code==='STALE_VERSION')throw Error('REVISION_CONFLICT');throw e}}
   const docT=docText(state);
   D.exec('BEGIN IMMEDIATE');
   try{
    const cur=db.read(K);const curVer=cur.ver;const untouched=!!docH&&docHash(state)===docH;
    const same=untouched||(curVer&&docText(cur.value.state)===docT);
    if(!same&&curVer!==expected)throw Object.assign(new Error('REVISION_CONFLICT'),{scope:'documento'});
    let changed=0;
    for(const c of COLS){const a=A[c];let maxSeq=a.max();const fresh=[];
     for(const x of state[c]){if(!x||x.id==null)throw Error('INVALID_STATE');const id=String(x.id),t=JSON.stringify(strip(x)),h=hashOf(t),row=a.get.get(id);
      if(row&&x._h===h)continue;
      if(row){if(x._v!==row.ver)throw Object.assign(new Error(a.err),{caseId:id,coll:c});a.upd.run(h,t,id);changed++}
      else{if(x._v!==undefined)throw Object.assign(new Error(a.err),{caseId:id,coll:c});fresh.push([id,h,t])}}
     if(a.desc){for(let i=fresh.length-1;i>=0;i--){a.ins.run(fresh[i][0],++maxSeq,fresh[i][1],fresh[i][2]);changed++}}
     else{for(const f of fresh){a.ins.run(f[0],++maxSeq,f[1],f[2]);changed++}}}
    let rev=curVer;if(!same){const now=new Date().toISOString();if(curVer)D.prepare('UPDATE kv SET v=?,ver=ver+1,ts=? WHERE k=? AND ver=?').run(docT,now,K,curVer);else D.prepare('INSERT INTO kv(k,v,ver,ts) VALUES(?,?,1,?)').run(K,docT,now);rev=curVer+1;changed++}
    D.exec('COMMIT');
    if(changed)bump();
    const f2=assemble();return{revision:rev,docH:f2.docH,state:f2.state};
   }catch(e){try{D.exec('ROLLBACK')}catch{}throw e}
  },
  backupTo:d=>db.backupTo(d),close:()=>db.close()
 };
}
