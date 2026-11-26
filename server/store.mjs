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
 await mkdir(dirname(path),{recursive:true});
 const db=open(path),K='workspace';
 const maxCases=Number(process.env.APP_MAX_CASES||50000),maxKnow=Number(process.env.APP_MAX_KNOWLEDGE||100000);
 return{
  readJson(){const r=db.readRaw(K);return r?`{"revision":${r.ver},"state":${r.v.slice(9,-1)}}`:null},
  read(){const r=db.read(K);return r.ver?{revision:r.ver,state:r.value.state}:{revision:0,state:blank()}},
  async write(expected,state){
   if(!state||state.version!=='0.1.0'||!['cases','notices','drafts','knowledge','history'].every(k=>Array.isArray(state[k])))throw Error('INVALID_STATE');
   if(state.cases.length>maxCases||state.knowledge.length>maxKnow)throw Error('LIMIT_EXCEEDED');
   try{const ver=db.write(K,{state},expected);return{revision:ver,state}}catch(e){if(e.code==='STALE_VERSION')throw Error('REVISION_CONFLICT');throw e}
  },
  backupTo:d=>db.backupTo(d),close:()=>db.close()
 };
}
