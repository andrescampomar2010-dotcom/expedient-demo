// Usuarios locales opcionales: contraseñas con scrypt, sesiones con caducidad y roles.
// Si la empresa elige SSO (Entra ID), este módulo se sustituye; los roles y permisos son los mismos.
import {scryptSync,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
export const ROLES={admin:['read','write','manage'],operador:['read','write'],lector:['read']};
export const can=(role,perm)=>!!ROLES[role]?.includes(perm);
const hash=(pw,salt)=>scryptSync(pw,salt,64,{N:16384,r:8,p:1}).toString('hex');
export function createUsers(doc={users:{},sessions:{}},{ttlMs=8*3600e3,maxFails=5,lockMs=15*60e3,now=()=>Date.now()}={}){
 doc.users||={};doc.sessions||={};
 const tok=t=>createHash('sha256').update(t).digest('hex');
 return{doc,
  add(name,password,role){
   if(!ROLES[role])throw Error('ROLE_INVALID');if(String(password||'').length<12)throw Error('PASSWORD_TOO_SHORT');
   name=String(name).trim().toLowerCase();if(!name)throw Error('NAME_REQUIRED');if(doc.users[name])throw Error('USER_EXISTS');
   const salt=randomBytes(16).toString('hex');doc.users[name]={salt,hash:hash(password,salt),role,fails:0,lockedUntil:0};
  },
  login(name,password){
   name=String(name).trim().toLowerCase();const u=doc.users[name];
   if(!u){hash(String(password),'0'.repeat(32));return null}
   if(u.lockedUntil>now())return {locked:true};
   const ok=timingSafeEqual(Buffer.from(hash(String(password),u.salt),'hex'),Buffer.from(u.hash,'hex'));
   if(!ok){if(++u.fails>=maxFails){u.lockedUntil=now()+lockMs;u.fails=0}return null}
   u.fails=0;const t=randomBytes(32).toString('hex');doc.sessions[tok(t)]={name,exp:now()+ttlMs};return{token:t,role:u.role,name};
  },
  check(t){const s=doc.sessions[tok(String(t||''))];if(!s)return null;if(s.exp<now()){delete doc.sessions[tok(t)];return null}const u=doc.users[s.name];return u?{name:s.name,role:u.role}:null},
  list(){return Object.entries(doc.users).map(([name,u])=>({name,role:u.role,locked:u.lockedUntil>now()}))},
  remove(name){name=String(name).trim().toLowerCase();const u=doc.users[name];if(!u)throw Error('USER_NOT_FOUND');
   if(u.role==='admin'&&Object.values(doc.users).filter(x=>x.role==='admin').length<=1)throw Error('LAST_ADMIN');
   delete doc.users[name];for(const [k,v] of Object.entries(doc.sessions))if(v.name===name)delete doc.sessions[k]},
  logout(t){delete doc.sessions[tok(String(t||''))]}
 };
}
