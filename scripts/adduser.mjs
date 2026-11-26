// Crea un usuario local: node scripts/adduser.mjs <nombre> <rol: admin|operador|lector>  (la clave se pide por entrada estándar o ADDUSER_PASSWORD)
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {dirname,resolve} from 'node:path';import {createUsers} from '../server/users.mjs';
const [name,role]=process.argv.slice(2);const path=resolve(process.env.APP_USERS_PATH||'data/users.json');
if(!name||!role){console.error('Uso: node scripts/adduser.mjs <nombre> <admin|operador|lector>');process.exit(1)}
let pw=process.env.ADDUSER_PASSWORD;if(!pw){pw=readFileSync(0,'utf8').trim()}
const u=createUsers(existsSync(path)?JSON.parse(readFileSync(path,'utf8')):undefined);
try{u.add(name,pw,role)}catch(e){console.error('No se creó: '+e.message);process.exit(1)}
mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(u.doc),{mode:0o600});console.log('Usuario creado: '+name+' ('+role+')');
