import {existsSync,readFileSync,writeFileSync,chmodSync,mkdirSync} from 'node:fs';
import {buildEnv,validateConfig,parseEnv} from '../scripts/config.mjs';
import {createReceiver} from './receiver.mjs';
import {dossierWorkbook} from './dossier.mjs';
import {processMail,syntheticEvent} from './automation.mjs';
import {readDriveText} from './drive-text.mjs';
import {openStore} from './store.mjs';
import {openShipmentsDb} from './shipments-db.mjs';
import {resolve,dirname} from 'node:path';
import {claudeService,mockData} from './adapters.mjs';
import {aiProposerService} from './ai-proposer.mjs';
import {createChat} from './chat.mjs';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {createUsers,can} from './users.mjs';
import {assertNode} from './runtime-check.mjs';
assertNode();
import {failedStatus,alertLine,healthOf} from './health.mjs';
const port=Number(process.env.PORT||4875);
// Despliegue en destino: APP_PUBLIC_URL=https://expedient.empresa.example (HTTPS lo termina el proxy inverso) y APP_BIND=0.0.0.0 si el proxy está en otra máquina.
const publicUrl=(process.env.APP_PUBLIC_URL||'').replace(/\/+$/,'');
if(publicUrl&&!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(publicUrl))throw Error('APP_PUBLIC_URL debe ser https://dominio[:puerto] sin ruta');
const origin=publicUrl||`http://localhost:${port}`,bindHost=process.env.APP_BIND||'127.0.0.1';
const allowedHosts=publicUrl?[new URL(publicUrl).host]:[`localhost:${port}`,`127.0.0.1:${port}`];
const authLocal=process.env.APP_AUTH==='local';
const maxBodyBytes=Number(process.env.APP_MAX_BODY_MB||2)*1e6;
const production=authLocal||process.env.APP_MODE==='production';
const usersPath=resolve(process.env.APP_USERS_PATH||'data/users.json');
const users=createUsers(authLocal&&existsSync(usersPath)?JSON.parse(readFileSync(usersPath,'utf8')):undefined);
const saveUsers=()=>{mkdirSync(dirname(usersPath),{recursive:true});writeFileSync(usersPath,JSON.stringify(users.doc),{mode:0o600});};
if(authLocal&&!Object.keys(users.doc.users).length)throw Error('APP_AUTH=local sin usuarios: ejecuta npm run adduser');
if(publicUrl&&!authLocal&&process.env.APP_ALLOW_NO_AUTH!=='true')throw Error('Con APP_PUBLIC_URL hace falta APP_AUTH=local (o un proxy con SSO y APP_ALLOW_NO_AUTH=true)');
const uidOf=req=>(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('uid='))?.slice(4);
const enabled=process.env.GRAPH_ENABLED==='true';
const mock=process.env.INTEGRATION_MOCK==='true';
const intakeEnabled=process.env.MAIL_INTAKE_ENABLED==='true';
if(intakeEnabled&&(!enabled||mock||process.env.MAIL_INTAKE_APPROVED!=='true'||!process.env.MAIL_FOLDER_ID||!process.env.MAIL_START_AFTER||(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(process.env.MAIL_START_AFTER)||Number.isNaN(Date.parse(process.env.MAIL_START_AFTER)))))throw Error('Mail intake requires enabled Graph, explicit approval, folder and start date');
const intakeMinutes=Number(process.env.MAIL_POLL_MINUTES||60);if(!Number.isFinite(intakeMinutes)||intakeMinutes<60)throw Error('Receiver cadence must be at least hourly in this development app');
let intakeOwner=null,intakeStatus={enabled:intakeEnabled,running:false,state:'disabled',lastRun:null};
if(mock&&(enabled||process.env.CLAUDE_ENABLED==='true'))throw Error('Mock mode cannot enable live providers');
const claude=claudeService();
const aiProposer=aiProposerService();
const ownDomains=(process.env.OWN_MAIL_DOMAINS||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
const sentFolder=process.env.MAIL_SENT_FOLDER_ID||'';
const env={tenant:process.env.MS_TENANT_ID,client:process.env.MS_CLIENT_ID,secret:process.env.MS_CLIENT_SECRET,redirect:process.env.MS_REDIRECT_URI||origin+'/auth/callback'};
// Sin scopes de escritura salvo envío autónomo del chat: Mail.Send solo si el administrador lo activa (MAIL_SEND_ENABLED).
const scopes=['Mail.Read','Files.Read',...(process.env.MAIL_SEND_ENABLED==='true'?['Mail.Send']:[])];
const dataMode=mock?'simulation':enabled?'real':'local';
const dataPath=resolve(process.env.APP_DATA_PATH||`data/${dataMode==='simulation'?'simulation':dataMode==='real'?'real':'local'}.json`);
{const marker=dataPath+'.mode';let prev='';try{prev=readFileSync(marker,'utf8').trim();}catch{}
 if(prev&&prev!==dataMode)throw Error(`DATA_MODE_MISMATCH: ${dataPath} belongs to mode "${prev}". Use another APP_DATA_PATH so simulated, local and real data never mix.`);
 if(!prev){mkdirSync(dirname(dataPath),{recursive:true});writeFileSync(marker,dataMode);}}
const store=await openStore(dataPath);
// Chat con asistente: historial y permisos por persona en un documento aparte (ver server/chat.mjs).
// Envío autónomo solo tras la cadena completa de autoridad; sendGraphMail exige sesión Graph autenticada.
async function sendGraphMail(s,{to,subject,body}){
 if(!s?.account)throw Error('SEND_TRANSPORT_UNAVAILABLE');
 const msal=makeClient();msal.getTokenCache().deserialize(s.cache);
 const auth=await msal.acquireTokenSilent({account:s.account,scopes});s.cache=msal.getTokenCache().serialize();
 const r=await fetch('https://graph.microsoft.com/v1.0/me/sendMail',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+auth.accessToken,'content-type':'application/json'},body:JSON.stringify({message:{subject:String(subject).slice(0,200),body:{contentType:'text',content:String(body).slice(0,20000)},toRecipients:[{emailAddress:{address:String(to).toLowerCase()}}]},saveToSentItems:true})});
 if(!r.ok)throw Error('SEND_FAILED');
}
let chat;
// La persona del chat se deriva en el servidor: usuario autenticado, o actor ficticio de la demo (no es autenticación).
const personOf=(req,who)=>authLocal?'u:'+who.name:'actor:'+String(req.headers['x-actor']||'Coordinador').replace(/[^A-Za-z0-9 áéíóúñü-]/gi,'').slice(0,40)||'actor:Coordinador';
// Envíos por registro (solo con SQLite). Migra una vez el estado completo antiguo (state.shipments) sin perder nada; la copia antigua queda en un fichero aparte.
let shipDb=null;
if(String(dataPath).endsWith('.db')&&process.env.APP_SHIPMENTS_STORE!=='document'){
 shipDb=openShipmentsDb(dataPath,{ownDomains});
 const cur=store.read(),legacy=cur.state.shipments;
 {const c2=store.read();let ch=false;for(const k of ['receiver','receiverSent']){const r0=c2.state[k];if(r0&&typeof r0==='object'&&!shipDb.getRec(k)){shipDb.putRec(k,r0,r0.seen||{});console.log('Estado del receptor',k,'migrado:',Object.keys(r0.seen||{}).length,'correos vistos');}if(r0&&shipDb.getRec(k)){const bk=dataPath+'.receptor-'+k+'-anterior.json';if(!existsSync(bk))writeFileSync(bk,JSON.stringify(r0),{mode:0o600});delete c2.state[k];ch=true}}if(ch)await store.write(c2.revision,c2.state);}
 if(legacy?.items?.length||legacy?.mails?.length){const r=shipDb.importLegacy(legacy);
  if(r.imported||r.reason==='ya migrado'){const bk=dataPath+'.envios-anterior.json';if(!existsSync(bk))writeFileSync(bk,JSON.stringify(legacy),{mode:0o600});delete cur.state.shipments;await store.write(cur.revision,cur.state);console.log('Envíos migrados al almacén por registro:',JSON.stringify(r),'copia anterior en',bk);}}
}
if(mock&&process.env.DEMO_EVENT_ON_START==='true'){const current=store.read();const out=await processMail(current.state,await syntheticEvent('complete'));if(!out.duplicate)await store.write(current.revision,current.state);console.log('Synthetic mail event processed automatically on start; external providers disabled.');}
chat=createChat({store,shipDb,chatPath:dataPath+'.chat.json',sendGraphMail});
const sessions=new Map();const idleMs=30*60*1000;
let MsalClient;
const makeClient=()=>new MsalClient({auth:{clientId:env.client,authority:`https://login.microsoftonline.com/${env.tenant}`,...(env.secret?{clientSecret:env.secret}:{})}});
if(enabled){if(!env.tenant||!env.client)throw Error('Graph enabled but configuration incomplete');if(env.redirect!==origin+'/auth/callback')throw Error('This development sample accepts only its localhost callback');if(!/^[a-zA-Z0-9.-]+$/.test(env.tenant))throw Error('Invalid tenant identifier');const sdk=await import('@azure/msal-node');MsalClient=env.secret?sdk.ConfidentialClientApplication:sdk.PublicClientApplication;}
const json=(res,code,value)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
const token=()=>randomBytes(32).toString('base64url');
function session(req){const id=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sid='))?.slice(4);const s=id&&sessions.get(id);if(s&&s.expires>Date.now()){s.expires=Date.now()+idleMs;return s;}if(id)sessions.delete(id);return null;}
function makeSession(res){const id=token(),s={expires:Date.now()+idleMs};sessions.set(id,s);res.setHeader('set-cookie',`sid=${id}; HttpOnly; SameSite=Lax; Path=/;${publicUrl?' Secure;':''} Max-Age=1800`);return s;}
function same(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
async function graph(s,path){if(!s.account)throw Error('AUTH_REQUIRED');const msal=makeClient();msal.getTokenCache().deserialize(s.cache);const auth=await msal.acquireTokenSilent({account:s.account,scopes});s.cache=msal.getTokenCache().serialize();const r=await fetch('https://graph.microsoft.com/v1.0'+path,{headers:{Authorization:'Bearer '+auth.accessToken,Prefer:'IdType="ImmutableId", outlook.body-content-type="text"'},redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok){const e=Error(r.status===429?'GRAPH_THROTTLED_STOPPED':r.status===410?'DELTA_EXPIRED_MANUAL_RESET_REQUIRED':'GRAPH_READ_FAILED');e.status=r.status;throw e;}const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>3000000){await r.body?.cancel?.().catch(()=>{});throw Error('GRAPH_RESPONSE_TOO_LARGE');}chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
let receiverTimer;
function startReceiver(s){
 if(receiverTimer)clearInterval(receiverTimer);
 intakeStatus={enabled:true,running:true,state:'starting_baseline',lastRun:null};
 const stopAt=Date.now()+8*60*60*1000;
 const receiver=createReceiver({store,shipments:shipDb,folder:process.env.MAIL_FOLDER_ID,scopeKey:s.account.homeAccountId,since:process.env.MAIL_START_AFTER,ownDomains,proposer:aiProposer,get:path=>graph(s,path)});
 const sent=sentFolder?createReceiver({store,shipments:shipDb,folder:sentFolder,scopeKey:s.account.homeAccountId,since:process.env.MAIL_START_AFTER,ownDomains,stateKey:'receiverSent',kind:'sent',get:path=>graph(s,path)}):null;
 const run=async()=>{try{if(Date.now()>stopAt)throw Error('LOCAL_SESSION_EXPIRED');const out=await receiver.tick();if(sent)await sent.tick();intakeStatus={enabled:true,running:true,state:out.busy?'busy':out.baseline?'waiting_for_changes':'baseline',lastRun:new Date().toISOString()};}catch(e){clearInterval(receiverTimer);receiverTimer=null;intakeStatus=failedStatus(e);console.error(alertLine(intakeStatus));}};
 run();receiverTimer=setInterval(run,intakeMinutes*60000);receiverTimer.unref();
}
const assets={'/':'index.html','/index.html':'index.html','/app.mjs':'app.mjs','/core.mjs':'core.mjs','/integration.mjs':'integration.mjs','/shipments.mjs':'shipments.mjs','/shipments-ui.mjs':'shipments-ui.mjs','/shipments-remote.mjs':'shipments-remote.mjs','/admin-ui.mjs':'admin-ui.mjs','/catalog.mjs':'catalog.mjs','/chat-ui.mjs':'chat-ui.mjs','/style.css':'style.css','/setup':'setup.html','/setup.mjs':'setup.mjs'};
const u0=x=>x.split('?')[0];
const LOGIN_HTML='<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><title>Acceso</title><style>body{font:16px system-ui;max-width:320px;margin:20vh auto;padding:0 16px}input,button{width:100%;padding:10px;margin:6px 0;box-sizing:border-box}</style><h1>Expedient</h1><form id=f><input name=name placeholder=Usuario autocomplete=username required><input name=password type=password placeholder=Clave autocomplete=current-password required><button>Entrar</button><p id=m></p></form><script>f.onsubmit=async e=>{e.preventDefault();const r=await fetch("/api/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:f.name.value,password:f.password.value})});if(r.ok)location="/";else m.textContent=r.status===429?"Cuenta bloqueada unos minutos":"Usuario o clave incorrectos"}</script>';
const server=http.createServer(async(req,res)=>{
 try{
 if(!allowedHosts.includes(req.headers.host))return json(res,403,{error:'Invalid host'});
 if(req.method==='GET'&&req.url==='/api/health'){const h=healthOf(intakeStatus);return json(res,h.code,{...h.body,auth:authLocal?'local':'none'});}
 if(req.headers.origin&&req.headers.origin!==origin)return json(res,403,{error:'Origin not allowed'});
 if(req.method==='POST'&&req.url==='/api/login'){let b='';for await(const c of req){b+=c;if(b.length>4000)return json(res,413,{error:'BODY_TOO_LARGE'});}let i;try{i=JSON.parse(b)}catch{return json(res,400,{error:'INVALID_JSON'})}if(!authLocal)return json(res,404,{error:'AUTH_NOT_ENABLED'});if(req.headers.origin!==origin)return json(res,403,{error:'Origin not allowed'});const r=users.login(i.name,i.password);saveUsers();if(!r||r.locked)return json(res,r?.locked?429:401,{error:r?.locked?'ACCOUNT_LOCKED_TRY_LATER':'INVALID_CREDENTIALS'});res.setHeader('set-cookie',`uid=${r.token}; HttpOnly; SameSite=Strict; Path=/;${publicUrl?' Secure;':''} Max-Age=28800`);return json(res,200,{name:r.name,role:r.role});}
 if(req.method==='POST'&&req.url==='/api/logout'){users.logout(uidOf(req));saveUsers();res.setHeader('set-cookie','uid=; Max-Age=0; Path=/');return json(res,200,{ok:true});}
 if(authLocal&&req.method==='GET'&&u0(req.url)==='/login'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'"});return res.end(LOGIN_HTML);}
 if(authLocal&&req.method==='GET'&&!req.url.startsWith('/api/')&&!users.check(uidOf(req))){res.writeHead(302,{location:'/login'});return res.end();}
 if(authLocal&&req.url.startsWith('/api/')){const who=users.check(uidOf(req));if(!who)return json(res,401,{error:'LOGIN_REQUIRED'});const lectorChat=['/api/chat/message','/api/chat/model'].includes(u0(req.url));if(req.method!=='GET'&&!can(who.role,'write')&&!lectorChat)return json(res,403,{error:'ROLE_CANNOT_WRITE'});}
 if(authLocal&&req.method==='POST'&&req.url==='/api/me/password'){
  if(req.headers.origin!==origin)return json(res,403,{error:'Origin not allowed'});
  let b='';for await(const c of req){b+=c;if(b.length>4000)return json(res,413,{error:'BODY_TOO_LARGE'});}let i;try{i=JSON.parse(b)}catch{return json(res,400,{error:'INVALID_JSON'})}
  try{users.changeOwnPassword(uidOf(req),i.current,i.next);saveUsers();return json(res,200,{ok:true});}catch(e){return json(res,e.message==='LOGIN_REQUIRED'?401:400,{error:String(e.message).replace(/[^A-Z_]/g,'')||'INVALID'});}
 }
 if(authLocal&&u0(req.url)==='/api/users'){
  const who=users.check(uidOf(req));if(!who||who.role!=='admin')return json(res,403,{error:'ADMIN_REQUIRED'});
  if(req.method==='GET')return json(res,200,{users:users.list()});
  if(req.method!=='POST'&&req.method!=='DELETE')return json(res,405,{error:'Method not allowed'});
  if(req.headers.origin!==origin)return json(res,403,{error:'Origin not allowed'});
  let b='';for await(const c of req){b+=c;if(b.length>4000)return json(res,413,{error:'BODY_TOO_LARGE'});}let i;try{i=JSON.parse(b)}catch{return json(res,400,{error:'INVALID_JSON'})}
  try{if(req.method==='POST'&&i.action==='reset')users.adminResetPassword(i.name,i.password);else if(req.method==='POST'&&i.action==='role')users.setRole(i.name,i.role);else if(req.method==='POST')users.add(i.name,i.password,i.role);else users.remove(i.name);saveUsers();return json(res,200,{users:users.list()});}catch(e){return json(res,400,{error:String(e.message).replace(/[^A-Z_]/g,'')||'INVALID'});}
 }
 if(req.method!=='GET'&&!(req.method==='POST'&&['/api/claude/analyze','/api/workspace','/api/events/synthetic','/api/setup','/api/shipments/propose','/api/shipments/op','/api/chat/message','/api/chat/model','/api/chat/confirm','/api/chat/policy'].includes(req.url)))return json(res,405,{error:'No send or tenant write endpoint.'});
 const u=new URL(req.url,origin),s=session(req);
 if(u.pathname.startsWith('/api/chat/')){
  const who=authLocal?users.check(uidOf(req)):null;
  const role=who?.role||null;
  const canWrite=!authLocal||can(role,'write');
  const isAdmin=!authLocal||role==='admin';
  const person=personOf(req,who);
  if(u.pathname==='/api/chat/state'&&req.method==='GET')return json(res,200,{...chat.state(person),canWrite,isAdmin,auth:authLocal});
  if(u.pathname==='/api/chat/audit'&&req.method==='GET'){if(!isAdmin)return json(res,403,{error:'ADMIN_REQUIRED'});return json(res,200,{audit:chat.auditTrail()});}
  if(req.headers.origin!==origin||!s||!same(s.csrf,req.headers['x-csrf-token']))return json(res,403,{error:'LOCAL_CONFIRMATION_REQUIRED'});
  const lim=u.pathname==='/api/chat/message'?10000:5000;
  let b='';for await(const c of req){b+=c;if(b.length>lim)return json(res,413,{error:'BODY_TOO_LARGE'});}
  let i;try{i=JSON.parse(b)}catch{return json(res,400,{error:'INVALID_JSON'});}
  try{
   if(u.pathname==='/api/chat/message'){const out=await chat.message(person,i.text,{canWrite,session:s});return json(res,200,{reply:out.reply,label:out.label,model:out.model,aiError:out.aiError,proposals:out.proposals.map(p=>({id:p.id,kind:p.kind,describe:p.describe})),sources:out.sources||[]});}
   if(u.pathname==='/api/chat/model'){return json(res,200,await chat.setModel(person,String(i.model||'')));}
   if(u.pathname==='/api/chat/confirm'){const out=await chat.confirm(person,String(i.proposalId||''),i.accept===true,{canWrite,session:s});return json(res,200,out);}
   if(u.pathname==='/api/chat/policy'){
    if(!isAdmin)return json(res,403,{error:'ADMIN_REQUIRED'});
    const target=authLocal?'u:'+String(i.person||'').trim().toLowerCase():'actor:'+String(i.person||'').replace(/[^A-Za-z0-9 áéíóúñü-]/gi,'').slice(0,40);
    if(authLocal&&!users.list().some(x=>target==='u:'+x.name))return json(res,400,{error:'UNKNOWN_USER'});
    await chat.setPolicy(person,target,{allow:i.allow,purpose:i.purpose,perDay:i.perDay,auto:i.auto===true,revoked:i.revoked===true},who?.name||'demo');
    return json(res,200,chat.state(target));
   }
   return json(res,404,{error:'Not found'});
  }catch(e){const m=String(e.code||e.message||'');const map={ROLE_CANNOT_WRITE:403,PROPOSAL_NOT_FOUND:404,CHAT_DAILY_LIMIT:429,CHAT_LIMIT:429,AI_UNKNOWN_MODEL:400,INVALID_MESSAGE:400,POLICY_INCOMPLETE:400,SEND_DISABLED_BY_ADMIN:403,SEND_NO_POLICY:403,SEND_INVALID_RECIPIENT:400,SEND_DOMAIN_NOT_ALLOWED:403,SEND_DAILY_LIMIT:429,SEND_TRANSPORT_UNAVAILABLE:503,SEND_FAILED:502,CHAT_SOURCE_GONE:404};
   return json(res,map[m]||500,{error:/^[A-Z_]+$/.test(m)?m:'ERROR'});}
 }
 if(u.pathname==='/api/status'){const ss=s||makeSession(res);ss.csrf||=token();return json(res,200,{production,shipmentsApi:!!shipDb,graphConfigured:enabled,authenticated:!!s?.account,mock,mode:mock?'simulation-no-network':'read-only-development',permissions:scopes,clientType:env.secret?'confidential':'public',send:false,write:false,csrf:ss.csrf,workspace:true,receiver:{...intakeStatus,intervalMinutes:intakeMinutes},claude:mock?{ready:true,model:'simulation'}:claude.status,aiProposer:{ready:aiProposer.ready||aiProposer.simulated,simulated:aiProposer.simulated,auto:aiProposer.auto,maxPerDay:aiProposer.maxPerDay},sentFolder:!!sentFolder,chat:{models:chat.catalog.map(m=>({ref:m.ref,label:m.label,provider:m.provider,simulated:m.simulated,ready:m.ready})),sendEnabled:chat.sendEnabled}});}

 if(u.pathname==='/api/setup'){
  if(req.method==='GET'){const cur=existsSync('.env')?parseEnv(readFileSync('.env','utf8')):{};return json(res,200,{envExists:existsSync('.env'),checks:validateConfig(cur),running:{graph:enabled,mock},note:'Los cambios se aplican al reiniciar el servidor.'});}
  if(req.headers.origin!==origin||!s||!same(s.csrf,req.headers['x-csrf-token']))return json(res,403,{error:'LOCAL_CONFIRMATION_REQUIRED'});
  let body='';for await(const chunk of req){body+=chunk;if(body.length>6000)return json(res,413,{error:'LIMIT'});}
  let i;try{i=JSON.parse(body);}catch{return json(res,400,{error:'INVALID_JSON'});}
  if(existsSync('.env')&&i.overwrite!==true)return json(res,409,{error:'ENV_EXISTS_CONFIRM_OVERWRITE'});
  const r=buildEnv({tenant:i.tenant,client:i.client,secret:i.secret,folder:i.folder||'inbox',since:i.since,intake:i.intake===true,approved:i.approved===true,claudeKey:i.claudeKey,claudeModel:i.claudeModel,claudeMax:i.claudeMax,claudeAccept:i.claudeAccept===true});
  if(r.errors.length)return json(res,400,{error:'INVALID_CONFIG',details:r.errors});
  writeFileSync('.env',r.text,{mode:0o600});try{chmodSync('.env',0o600);}catch{}
  return json(res,200,{saved:true,restartRequired:true,checks:validateConfig(parseEnv(r.text))});
 }
 if(u.pathname==='/api/shipments/propose'){
  if(req.method!=='POST'||req.headers.origin!==origin||!s||!same(s.csrf,req.headers['x-csrf-token']))return json(res,403,{error:'LOCAL_CONFIRMATION_REQUIRED'});
  if(!aiProposer.ready&&!aiProposer.simulated)return json(res,503,{error:'AI_PROPOSER_NOT_CONFIGURED'});
  let body='';for await(const chunk of req){body+=chunk;if(body.length>40000)return json(res,413,{error:'BODY_TOO_LARGE'});}
  let i;try{i=JSON.parse(body);}catch{return json(res,400,{error:'INVALID_JSON'});}
  if(i.confirm!==true||!i.mail||typeof i.mail.subject!=='string'||!Array.isArray(i.shipments))return json(res,400,{error:'INVALID_REQUEST'});
  const r=await aiProposer.propose({mail:{subject:i.mail.subject,body:i.mail.body,from:i.mail.from},shipments:i.shipments.map(x=>({id:x.id,client:x.client,provider:x.provider,route:x.route,cargo:x.cargo,bultos:x.bultos,kg:x.kg}))});
  return json(res,r.error?502:200,r);
 }
 if(u.pathname==='/api/dossier'){
  if(!s)return json(res,401,{error:'LOCAL_SESSION_REQUIRED'});const c=store.read().state.cases.find(c=>c.id===u.searchParams.get('id'));if(!c)return json(res,404,{error:'CASE_NOT_FOUND'});
  try{const buffer=await dossierWorkbook(c);res.writeHead(200,{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':'attachment; filename=generic-reviewed-dossier.xlsx','cache-control':'no-store'});return res.end(Buffer.from(buffer));}catch{return json(res,409,{error:'SAVE_REVIEWED_CASE_BEFORE_EXPORT'});}
 }
 if(u.pathname==='/api/events/synthetic'){
  if(!mock)return json(res,503,{error:'SYNTHETIC_EVENT_MODE_REQUIRED'});
  if(req.method!=='POST'||req.headers.origin!==origin||!s||!same(s.csrf,req.headers['x-csrf-token']))return json(res,403,{error:'LOCAL_CONFIRMATION_REQUIRED'});
  let body='';for await(const chunk of req){body+=chunk;if(body.length>1000)return json(res,413,{error:'LIMIT'});}
  let input;try{input=JSON.parse(body);}catch{return json(res,400,{error:'INVALID_JSON'});}
  if(!['complete','ambiguous','discrepancy','missing'].includes(input.scenario))return json(res,400,{error:'UNKNOWN_SCENARIO'});
  const current=store.read(),out=await processMail(current.state,await syntheticEvent(input.scenario));if(!out.duplicate){try{await store.write(current.revision,current.state);}catch{return json(res,409,{error:'REVISION_CONFLICT'});}}return json(res,200,out);
 }
 if(shipDb&&u.pathname.startsWith('/api/shipments/')&&u.pathname!=='/api/shipments/propose'){
  if(!s)return json(res,401,{error:'LOCAL_SESSION_REQUIRED'});
  const P=u.pathname,qs=u.searchParams;
  try{
   if(req.method==='GET'){
    if(P==='/api/shipments/list')return json(res,200,shipDb.list({limit:qs.get('limit')||50,after:qs.get('after')||'',onlyOpen:qs.get('open')==='1',onlyRejections:qs.get('rej')==='1'}));
    if(P==='/api/shipments/stats')return json(res,200,shipDb.stats());
    if(P==='/api/shipments/pending')return json(res,200,{pending:shipDb.pending(Number(qs.get('limit')||100))});
    if(P==='/api/shipments/search')return json(res,200,{results:shipDb.search(qs.get('q')||'',100)||[]});
    if(P==='/api/shipments/item'){const g=shipDb.get(qs.get('id')||'');return g?json(res,200,g):json(res,404,{error:'UNKNOWN_SHIPMENT'});}
    return json(res,404,{error:'Unknown'});
   }
   if(req.method==='POST'&&P==='/api/shipments/op'){
    if(req.headers.origin!==origin||!same(s.csrf,req.headers['x-csrf-token']))return json(res,403,{error:'LOCAL_CONFIRMATION_REQUIRED'});
    let b='';for await(const c of req){b+=c;if(b.length>200000)return json(res,413,{error:'BODY_TOO_LARGE'});}const i=JSON.parse(b);
    if(i.op==='create')return json(res,200,{shipment:shipDb.createShipment(i.data||{})});
    if(i.op==='confirm')return json(res,200,shipDb.confirm(String(i.mailId),String(i.shipmentId),i.via||''));
    if(i.op==='proposal')return json(res,200,{attached:shipDb.attachProposal(String(i.mailId),i.proposal)});
    if(i.op==='discard')return json(res,200,shipDb.confirm(String(i.mailId),null));
    return json(res,400,{error:'UNKNOWN_OP'});
   }
   return json(res,405,{error:'Method not allowed'});
  }catch(e){const m=String(e.message||'');return json(res,/^(NOT_PENDING|UNKNOWN_SHIPMENT|SHIPMENT_ID_REQUIRED|SHIPMENT_EXISTS)$/.test(m)?400:500,{error:/^[A-Z_]+$/.test(m)?m:'ERROR'});}
 }
 if(u.pathname==='/api/workspace'){
  if(!s)return json(res,401,{error:'LOCAL_SESSION_REQUIRED'});
  if(req.method==='GET'){const raw=store.readJson?.();if(raw){res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});return res.end(raw);}return json(res,200,store.read());}
  if(req.headers.origin!==origin||!same(s.csrf,req.headers['x-csrf-token']))return json(res,403,{error:'LOCAL_CONFIRMATION_REQUIRED'});
  let body='';for await(const chunk of req){body+=chunk;if(body.length>maxBodyBytes)return json(res,413,{error:'WORKSPACE_TOO_LARGE'});}
  try{const input=JSON.parse(body);if(shipDb){delete input.state.receiver;delete input.state.receiverSent;}else{const authoritative=store.read().state;if(authoritative.receiver)input.state.receiver=authoritative.receiver;if(authoritative.receiverSent)input.state.receiverSent=authoritative.receiverSent;}return json(res,200,await store.write(input.revision,input.state,input.docH));}catch(err){const conflict=['REVISION_CONFLICT','CASE_CONFLICT','RECORD_CONFLICT'].includes(err.message);return json(res,conflict?409:400,{error:err.message==='REVISION_CONFLICT'?'REVISION_CONFLICT_RELOAD_BEFORE_EDITING':err.message==='CASE_CONFLICT'?'CASE_CONFLICT_RELOAD_BEFORE_EDITING':err.message==='RECORD_CONFLICT'?'RECORD_CONFLICT_RELOAD_BEFORE_EDITING':'INVALID_WORKSPACE',...(err.caseId?{caseId:err.caseId}:{}),...(err.coll?{coll:err.coll}:{})});}
 }
 if(u.pathname==='/api/claude/analyze'){
  if(req.headers.origin!==origin||!s||!same(s.csrf,req.headers['x-csrf-token']))return json(res,403,{error:'LOCAL_CONFIRMATION_REQUIRED'});
  if(s.busy)return json(res,409,{error:'ANALYSIS_ALREADY_RUNNING'});
  if(!mock&&!claude.status.ready)return json(res,503,{error:'CLAUDE_NOT_CONFIGURED_OR_APPROVED'});
  if(s.lastAnalysis&&Date.now()-s.lastAnalysis<60000)return json(res,429,{error:'WAIT_ONE_MINUTE_NO_AUTO_RETRY'});
  let body='';for await(const chunk of req){body+=chunk;if(body.length>16000)return json(res,413,{error:'BODY_TOO_LARGE'});}
  let input;try{input=JSON.parse(body);}catch{return json(res,400,{error:'INVALID_JSON'});}
  if(input.confirm!==true||typeof input.text!=='string'||!input.text.trim()||input.text.length>12000)return json(res,400,{error:'INVALID_ANALYSIS_REQUEST'});
  s.busy=true;s.lastAnalysis=Date.now();try{return json(res,200,mock?{text:'SIMULACIÓN: documento sintético recibido. Revisar fuente, totales y líneas antes de continuar. No se ha llamado a Claude.',model:'simulation',reviewRequired:true}:await claude.analyze(input));}finally{s.busy=false;}
 }

 if(u.pathname==='/auth/login'){
  if(!enabled)return json(res,503,{error:'GRAPH_NOT_CONFIGURED'});
  const ss=s||makeSession(res);ss.state=token();ss.verifier=token();const challenge=createHash('sha256').update(ss.verifier).digest('base64url');ss.authStarted=Date.now();
  const login=await makeClient().getAuthCodeUrl({scopes,redirectUri:env.redirect,state:ss.state,codeChallenge:challenge,codeChallengeMethod:'S256',prompt:'select_account'});
  res.writeHead(302,{location:login,'cache-control':'no-store'});return res.end();
 }
 if(u.pathname==='/auth/callback'){
  if(!enabled||!s||!same(s.state,u.searchParams.get('state'))||Date.now()-s.authStarted>10*60*1000)return json(res,400,{error:'Invalid or expired authentication state'});
  delete s.state;const code=u.searchParams.get('code');if(!code)return json(res,400,{error:'Authentication not completed'});
  const msal=makeClient();const a=await msal.acquireTokenByCode({code,scopes,redirectUri:env.redirect,codeVerifier:s.verifier});delete s.verifier;
  s.account=a.account;s.cache=msal.getTokenCache().serialize();if(intakeEnabled){if(intakeOwner&&intakeOwner!==a.account.homeAccountId)throw Error('Another intake account owns this process');intakeOwner=a.account.homeAccountId;startReceiver(s);}res.writeHead(302,{location:'/api/status','cache-control':'no-store'});return res.end();
 }
 if(u.pathname.startsWith('/api/graph/')){
  if(mock){if(!s)return json(res,401,{error:'LOCAL_SESSION_REQUIRED'});const data=mockData();if(u.pathname==='/api/graph/text'){if(!s.listedFiles?.includes(u.searchParams.get('id')))return json(res,403,{error:'SELECT_A_LISTED_FILE'});return json(res,200,{id:'mock-file-1',name:'procedimiento-ficticio.txt',text:'Procedimiento inventado: revisar la fuente y los totales antes de asignar. No es normativa ni un procedimiento aduanero.',modified:'2026-11-23T10:00:00Z',source:'SIMULACIÓN OneDrive TXT',retrieved:new Date().toISOString()});}if(u.pathname==='/api/graph/messages')return json(res,200,{source:'SIMULATION, no Microsoft request',items:data.messages});if(u.pathname==='/api/graph/files'){s.listedFiles=data.files.map(f=>f.id);return json(res,200,{source:'SIMULATION, select TXT to import',items:data.files});}return json(res,404,{error:'Not found'});}
  if(!enabled)return json(res,503,{error:'GRAPH_NOT_CONFIGURED'});if(!s?.account)return json(res,401,{error:'SIGN_IN_REQUIRED'});
  if(u.pathname==='/api/graph/text'){const id=u.searchParams.get('id');if(!s.listedFiles?.includes(id))return json(res,403,{error:'SELECT_A_LISTED_FILE'});const meta=await graph(s,'/me/drive/items/'+encodeURIComponent(id)+'?$select=id,name,size,file,lastModifiedDateTime,@microsoft.graph.downloadUrl');return json(res,200,await readDriveText(meta));}
  if(u.pathname==='/api/graph/messages'){const r=await graph(s,'/me/messages?$top=10&$select=id,subject,receivedDateTime,bodyPreview&$orderby=receivedDateTime%20desc');return json(res,200,{source:'Microsoft Graph, live',items:r.value});}
  if(u.pathname==='/api/graph/files'){const r=await graph(s,'/me/drive/root/children?$top=20&$select=id,name,file,folder,lastModifiedDateTime');s.listedFiles=r.value.filter(f=>f.file).map(f=>f.id);return json(res,200,{source:'Microsoft Graph, live',items:r.value});}
  return json(res,404,{error:'Read route not implemented'});
 }
 if(assets[u.pathname]){const file=assets[u.pathname];let body=await readFile(new URL('../web/'+file,import.meta.url));if(file==='index.html'){let h=body.toString().replace("connect-src 'none'","connect-src 'self'");if(production)h=h.replace('DEMO LOCAL · DATOS FICTICIOS','PRODUCCIÓN').replace('Expedient · Demo documental','Expedient').replace(/<label>Rol ficticio.*?<\/select><\/label>/,'').replace(/<p>Servidor de demostración solo localhost.*?<\/p>/,'').replace('Sin conexión externa','Sin datos de demostración').replace(/<footer>.*?<\/footer>/,'<footer>Expedient. Los datos extraídos automáticamente o por OCR son propuestas: confirma siempre con la fuente.</footer>');body=Buffer.from(h);}res.writeHead(200,{'content-type':file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/html','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});return res.end(body);}
 json(res,404,{error:'Not found'});
 }catch(err){json(res,500,{error:err.message==='AUTH_REQUIRED'?'SIGN_IN_REQUIRED':'Request failed. Review server configuration without logging tokens.'});}
});
server.listen(port,bindHost,()=>console.log(`Development demo: ${origin}; Graph ${enabled?'configured, sign-in required':'disabled'}`));
setInterval(()=>{for(const [id,s] of sessions)if(s.expires<Date.now())sessions.delete(id);},60000).unref();
