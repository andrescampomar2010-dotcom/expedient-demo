// Almacenamiento transaccional opcional (node:sqlite, Node >= 22). Guarda el estado como documentos por clave
// con control de versión: dos escritores no pisan cambios sin darse cuenta (error STALE_VERSION).
import {DatabaseSync} from 'node:sqlite';
export function openStore(path){
 const db=new DatabaseSync(path);
 db.exec('PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;PRAGMA synchronous=NORMAL;');
 db.exec('CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY,v TEXT NOT NULL,ver INTEGER NOT NULL DEFAULT 1,ts TEXT NOT NULL)');
 const get=db.prepare('SELECT v,ver FROM kv WHERE k=?'),ins=db.prepare('INSERT INTO kv(k,v,ver,ts) VALUES(?,?,1,?)'),
  upd=db.prepare('UPDATE kv SET v=?,ver=ver+1,ts=? WHERE k=? AND ver=?');
 return{
  read(k){const r=get.get(k);return r?{value:JSON.parse(r.v),ver:r.ver}:{value:null,ver:0}},
  write(k,value,expectedVer){
   const now=new Date().toISOString(),s=JSON.stringify(value);
   db.exec('BEGIN IMMEDIATE');
   try{
    const r=get.get(k);
    if((r?r.ver:0)!==expectedVer)throw Object.assign(new Error('STALE_VERSION'),{code:'STALE_VERSION'});
    if(r)upd.run(s,now,k,expectedVer);else ins.run(k,s,now);
    db.exec('COMMIT');return expectedVer+1;
   }catch(e){db.exec('ROLLBACK');throw e}
  },
  backupTo(dest){db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.exec(`VACUUM INTO '${String(dest).replace(/'/g,"''")}'`)},
  close(){db.close()}
 };
}
