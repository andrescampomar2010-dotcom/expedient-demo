// Almacenamiento transaccional opcional (node:sqlite, Node >= 22). Guarda el estado como documentos por clave
// con control de versión: dos escritores no pisan cambios sin darse cuenta (error STALE_VERSION).
import {DatabaseSync} from 'node:sqlite';
export function openStore(path){
 const db=new DatabaseSync(path);
 // busy_timeout va PRIMERO: cambiar journal_mode necesita un bloqueo y, sin espera, abrir muchos procesos a la vez fallaba con "database is locked" (reproducido y corregido).
 db.exec('PRAGMA busy_timeout=5000;');
 if(db.prepare('PRAGMA journal_mode').get().journal_mode!=='wal')db.exec('PRAGMA journal_mode=WAL;');
 db.exec('PRAGMA synchronous=NORMAL;');
 db.exec('CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY,v TEXT NOT NULL,ver INTEGER NOT NULL DEFAULT 1,ts TEXT NOT NULL)');
 const get=db.prepare('SELECT v,ver FROM kv WHERE k=?'),ins=db.prepare('INSERT INTO kv(k,v,ver,ts) VALUES(?,?,1,?)'),
  upd=db.prepare('UPDATE kv SET v=?,ver=ver+1,ts=? WHERE k=? AND ver=?'),getVer=db.prepare('SELECT ver FROM kv WHERE k=?');
 let raw={k:null,ver:-1,v:null};
 return{
  // Lectura sin parsear: devuelve el texto guardado y lo conserva en memoria mientras la versión no cambie (consulta de versión barata).
  readRaw(k){const g=getVer.get(k);const ver=g?g.ver:0;if(!ver)return null;if(raw.k===k&&raw.ver===ver)return{v:raw.v,ver};const r=get.get(k);raw={k,ver:r.ver,v:r.v};return{v:r.v,ver:r.ver}},
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
  sql:db,
  backupTo(dest){db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.exec(`VACUUM INTO '${String(dest).replace(/'/g,"''")}'`)},
  close(){db.close()}
 };
}
