// Copia de seguridad y restauración del archivo de datos (JSON). Uso:
//   node scripts/backup.mjs backup [origen] [carpeta]   -> copia con sello de hora y suma sha256
//   node scripts/backup.mjs restore <copia> [destino]   -> verifica sha256 y JSON antes de restaurar
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,basename} from 'node:path';
const [cmd,a,b]=process.argv.slice(2);
const sha=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
if(cmd==='backup'){
 const src=a||process.env.APP_DATA_PATH||'data/local.json',dir=b||'backups';
 if(!existsSync(src)){console.error('No existe '+src);process.exit(1)}
 JSON.parse(readFileSync(src,'utf8'));mkdirSync(dir,{recursive:true});
 const dst=join(dir,basename(src,'.json')+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
 copyFileSync(src,dst);writeFileSync(dst+'.sha256',sha(dst)+'\n');
 const old=readdirSync(dir).filter(f=>f.endsWith('.json')).sort();
 console.log('Copia: '+dst+' ('+old.length+' en '+dir+'; la rotación es decisión vuestra)');
}else if(cmd==='restore'){
 if(!a||!existsSync(a)){console.error('Indica la copia');process.exit(1)}
 const want=existsSync(a+'.sha256')?readFileSync(a+'.sha256','utf8').trim():null;
 if(want&&want!==sha(a)){console.error('La suma sha256 no coincide: copia dañada');process.exit(1)}
 JSON.parse(readFileSync(a,'utf8'));
 const dst=b||process.env.APP_DATA_PATH||'data/local.json';
 if(existsSync(dst))copyFileSync(dst,dst+'.antes-de-restaurar');
 copyFileSync(a,dst);console.log('Restaurado en '+dst+(want?' (sha256 verificado)':' (sin sha256 que verificar)'));
}else{console.error('Uso: backup | restore');process.exit(1)}
