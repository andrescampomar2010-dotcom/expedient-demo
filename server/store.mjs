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
 // Expedientes por registro: cada expediente es una fila con su propia versión; un conflicto solo afecta al mismo expediente.
 D.exec('CREATE TABLE IF NOT EXISTS casos(id TEXT PRIMARY KEY,seq INTEGER NOT NULL,ver INTEGER NOT NULL,hash TEXT NOT NULL,json TEXT NOT NULL);CREATE INDEX IF NOT EXISTS casos_seq ON casos(seq);CREATE TABLE IF NOT EXISTS casos_meta(k TEXT PRIMARY KEY,v TEXT NOT NULL)');
 const hashOf=t=>createHash('sha256').update(t).digest('hex').slice(0,16);
 const strip=c=>{const {_v,_h,...rest}=c;return rest};
 const q=sql=>D.prepare(sql);
 const docHash=st=>{const {cases,...rest}=st;return hashOf(JSON.stringify({...rest,cases:[]}))};
 const meta=k=>q('SELECT v FROM casos_meta WHERE k=?').get(k)?.v;
 const setMeta=(k,v)=>q('INSERT INTO casos_meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k,String(v));
 const bump=()=>setMeta('gen',(Number(meta('gen')||0)+1));
 function migrate(){
  if(!perRecord||meta('migrated'))return;
  const r=db.read(K);const cases=r.ver?r.value.state.cases:[];
  if(cases.length&&!existsSync(path+'.expedientes-anterior.json'))writeFileSync(path+'.expedientes-anterior.json',JSON.stringify(cases),{mode:0o600});
  D.exec('BEGIN IMMEDIATE');
  try{
   const ins=q('INSERT INTO casos(id,seq,ver,hash,json) VALUES(?,?,1,?,?)');let n=cases.length;
   for(const c of cases){const t=JSON.stringify(strip(c));ins.run(String(c.id),n--,hashOf(t),t)}
   setMeta('migrated',JSON.stringify({at:new Date().toISOString(),count:cases.length}));bump();D.exec('COMMIT');
  }catch(e){D.exec('ROLLBACK');throw e}
  if(r.ver&&cases.length){const st={...r.value.state,cases:[]};db.write(K,{state:st},r.ver)}
 }
 migrate();
 const rows=()=>q('SELECT id,ver,hash,json FROM casos ORDER BY seq DESC').all();
 const casesJson=()=>'['+rows().map(x=>x.json.slice(0,-1)+(x.json==='{}'?'':',')+'"_v":'+x.ver+',"_h":"'+x.hash+'"}').join(',')+']';
 let rawCache={key:'',v:''};
 return{
  readJson(){const r=db.readRaw(K);if(!r)return null;if(!perRecord)return `{"revision":${r.ver},"state":${r.v.slice(9,-1)}}`;const key=r.ver+':'+meta('gen');if(rawCache.key!==key){const doc=r.v.slice(9,-1);rawCache={key,v:`{"revision":${r.ver},"docH":"${docHash(JSON.parse(doc))}","state":${doc.slice(0,-1)},"cases":${casesJson()}}}`}}return rawCache.v},
  read(){const r=db.read(K);const base=r.ver?{revision:r.ver,state:r.value.state}:{revision:0,state:blank()};if(perRecord){base.docH=docHash(base.state);base.state.cases=JSON.parse(casesJson())}return base},
  async write(expected,state,docH){
   if(!state||state.version!=='0.1.0'||!['cases','notices','drafts','knowledge','history'].every(k=>Array.isArray(state[k])))throw Error('INVALID_STATE');
   if(state.cases.length>maxCases||state.knowledge.length>maxKnow)throw Error('LIMIT_EXCEEDED');
   if(!perRecord){try{const ver=db.write(K,{state},expected);return{revision:ver,state}}catch(e){if(e.code==='STALE_VERSION')throw Error('REVISION_CONFLICT');throw e}}
   const {cases,...doc}=state;const docT=JSON.stringify({state:{...doc,cases:[]}});
   D.exec('BEGIN IMMEDIATE');
   try{
    const cur=db.read(K);const curVer=cur.ver;const untouched=!!docH&&docHash(state)===docH;                 // la persona no modificó la parte común: se conserva lo que haya
    const same=untouched||(curVer&&JSON.stringify({state:{...cur.value.state,cases:[]}})===docT);
    if(!same&&curVer!==expected)throw Object.assign(new Error('REVISION_CONFLICT'),{scope:'documento'});
    const get=q('SELECT ver,hash FROM casos WHERE id=?'),upd=q('UPDATE casos SET ver=ver+1,hash=?,json=? WHERE id=?'),ins=q('INSERT INTO casos(id,seq,ver,hash,json) VALUES(?,?,1,?,?)');
    let maxSeq=q('SELECT COALESCE(MAX(seq),0) m FROM casos').get().m,changed=0;const fresh=[];
    for(const c of cases){if(!c||c.id==null)throw Error('INVALID_STATE');const id=String(c.id),t=JSON.stringify(strip(c)),h=hashOf(t),row=get.get(id);
     if(row&&c._h===h&&c._v===row.ver)continue;            // sin cambios desde que se leyó
     if(row&&c._h===h)continue;                              // contenido igual al que había: nada que guardar
     if(row){if(c._v!==row.ver)throw Object.assign(new Error('CASE_CONFLICT'),{caseId:id});upd.run(h,t,id);changed++}
     else{if(c._v!==undefined)throw Object.assign(new Error('CASE_CONFLICT'),{caseId:id});fresh.push([id,h,t])}}
    for(let i=fresh.length-1;i>=0;i--){ins.run(fresh[i][0],++maxSeq,fresh[i][1],fresh[i][2]);changed++}
    let rev=curVer;if(!same){const now=new Date().toISOString();if(curVer)D.prepare('UPDATE kv SET v=?,ver=ver+1,ts=? WHERE k=? AND ver=?').run(docT,now,K,curVer);else D.prepare('INSERT INTO kv(k,v,ver,ts) VALUES(?,?,1,?)').run(K,docT,now);rev=curVer+1}
    D.exec('COMMIT');
    if(changed)bump();
    const fresh2=this.read();return{revision:rev,docH:fresh2.docH,state:fresh2.state};
   }catch(e){try{D.exec('ROLLBACK')}catch{}throw e}
  },
  backupTo:d=>db.backupTo(d),close:()=>db.close()
 };
}
