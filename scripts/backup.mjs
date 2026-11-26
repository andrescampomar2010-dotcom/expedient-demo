// Copia de seguridad y restauración del archivo de datos (JSON). Uso:
//   node scripts/backup.mjs backup [origen] [carpeta]   -> copia con sello de hora y suma sha256
//   node scripts/backup.mjs restore <copia> [destino]   -> verifica sha256 y JSON antes de restaurar
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync,readdirSync,unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,basename} from 'node:path';
import {openStore} from '../server/store-sqlite.mjs';
import {DatabaseSync} from 'node:sqlite';
const isDb=f=>String(f).endsWith('.db');
function checkDb(f){const d=new DatabaseSync(f);try{const r=d.prepare('PRAGMA integrity_check').get();if(r.integrity_check!=='ok')throw Error('integrity '+r.integrity_check)}finally{d.close()}}
const [cmd,a,b]=process.argv.slice(2);
const sha=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
if(cmd==='backup'){
 const src=a||process.env.APP_DATA_PATH||'data/local.json',dir=b||'backups';
 if(!existsSync(src)){console.error('No existe '+src);process.exit(1)}
 mkdirSync(dir,{recursive:true});const ext=isDb(src)?'.db':'.json';
 const dst=join(dir,basename(src,ext)+'-'+new Date().toISOString().replace(/[:.]/g,'-')+ext);
 if(isDb(src)){const st=openStore(src);try{st.backupTo(dst)}finally{st.close()}checkDb(dst)}else{JSON.parse(readFileSync(src,'utf8'));copyFileSync(src,dst)}writeFileSync(dst+'.sha256',sha(dst)+'\n');
 const old=readdirSync(dir).filter(f=>f.endsWith('.json')||f.endsWith('.db')).sort();
 console.log('Copia: '+dst+' ('+old.length+' en '+dir+'; la rotación es decisión vuestra)');
}else if(cmd==='restore'){
 if(!a||!existsSync(a)){console.error('Indica la copia');process.exit(1)}
 const want=existsSync(a+'.sha256')?readFileSync(a+'.sha256','utf8').trim():null;
 if(want&&want!==sha(a)){console.error('La suma sha256 no coincide: copia dañada');process.exit(1)}
 if(isDb(a))checkDb(a);else JSON.parse(readFileSync(a,'utf8'));
 const dst=b||process.env.APP_DATA_PATH||'data/local.json';
 if(isDb(a)!==isDb(dst)){console.error('Tipo distinto: copia .db con destino .json o al revés');process.exit(1)}
 for(const x of [dst+'-wal',dst+'-shm'])if(existsSync(x))unlinkSync(x);
 if(existsSync(dst))copyFileSync(dst,dst+'.antes-de-restaurar');
 copyFileSync(a,dst);console.log('Restaurado en '+dst+(want?' (sha256 verificado)':' (sin sha256 que verificar)'));
}else{console.error('Uso: backup | restore');process.exit(1)}
