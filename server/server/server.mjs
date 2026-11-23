import {createReceiver} from './receiver.mjs';
import {dossierWorkbook} from './dossier.mjs';
import {processMail,syntheticEvent} from './automation.mjs';
import {readDriveText} from './drive-text.mjs';
import {openStore} from './store.mjs';
import {resolve} from 'node:path';
import {claudeService,mockData} from './adapters.mjs';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
const port=Number(process.env.PORT||4875),origin=`http://localhost:${port}`;
const enabled=process.env.GRAPH_ENABLED==='true';
const mock=process.env.INTEGRATION_MOCK==='true';
const intakeEnabled=process.env.MAIL_INTAKE_ENABLED==='true';
if(intakeEnabled&&(!enabled||mock||process.env.MAIL_INTAKE_APPROVED!=='true'||!process.env.MAIL_FOLDER_ID||!process.env.MAIL_START_AFTER||(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(process.env.MAIL_START_AFTER)||Number.isNaN(Date.parse(process.env.MAIL_START_AFTER)))))throw Error('Mail intake requires enabled Graph, explicit approval, folder and start date');
const intakeMinutes=Number(process.env.MAIL_POLL_MINUTES||60);if(!Number.isFinite(intakeMinutes)||intakeMinutes<60)throw Error('Receiver cadence must be at least hourly in this development app');
let intakeOwner=null,intakeStatus={enabled:intakeEnabled,running:false,state:'disabled',lastRun:null};
if(mock&&(enabled||process.env.CLAUDE_ENABLED==='true'))throw Error('Mock mode cannot enable live providers');
const claude=claudeService();
const env={tenant:process.env.MS_TENANT_ID,client:process.env.MS_CLIENT_ID,secret:process.env.MS_CLIENT_SECRET,redirect:process.env.MS_REDIRECT_URI||origin+'/auth/callback'};
const scopes=['Mail.Read','Files.Read']; // Deliberately no write or send scopes.
const store=await openStore(resolve(process.env.APP_DATA_PATH||'data/workspace.json'));
if(mock&&process.env.DEMO_EVENT_ON_START==='true'){const current=store.read();const out=await processMail(current.state,await syntheticEvent('complete'));if(!out.duplicate)await store.write(current.revision,current.state);console.log('Synthetic mail event processed automatically on start; external providers disabled.');}
const sessions=new Map();const idleMs=30*60*1000;
let MsalClient;
const makeClient=()=>new MsalClient({auth:{clientId:env.client,authority:`https://login.microsoftonline.com/${env.tenant}`,clientSecret:env.secret}});
if(enabled){if(!env.tenant||!env.client||!env.secret)throw Error('Graph enabled but configuration incomplete');if(env.redirect!==origin+'/auth/callback')throw Error('This development sample accepts only its localhost callback');if(!/^[a-zA-Z0-9.-]+$/.test(env.tenant))throw Error('Invalid tenant identifier');const sdk=await import('@azure/msal-node');MsalClient=sdk.ConfidentialClientApplication;}
const json=(res,code,value)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
const token=()=>randomBytes(32).toString('base64url');
function session(req){const id=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sid='))?.slice(4);const s=id&&sessions.get(id);if(s&&s.expires>Date.now()){s.expires=Date.now()+idleMs;return s;}if(id)sessions.delete(id);return null;}
function makeSession(res){const id=token(),s={expires:Date.now()+idleMs};sessions.set(id,s);res.setHeader('set-cookie',`sid=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1800`);return s;}
function same(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
async function graph(s,path){if(!s.account)throw Error('AUTH_REQUIRED');const msal=makeClient();msal.getTokenCache().deserialize(s.cache);const auth=await msal.acquireTokenSilent({account:s.account,scopes});s.cache=msal.getTokenCache().serialize();const r=await fetch('https://graph.microsoft.com/v1.0'+path,{headers:{Authorization:'Bearer '+auth.accessToken,Prefer:'IdType="ImmutableId", outlook.body-content-type="text"'},redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok){const e=Error(r.status===429?'GRAPH_THROTTLED_STOPPED':r.status===410?'DELTA_EXPIRED_MANUAL_RESET_REQUIRED':'GRAPH_READ_FAILED');e.status=r.status;throw e;}const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>3000000){await r.body?.cancel?.().catch(()=>{});throw Error('GRAPH_RESPONSE_TOO_LARGE');}chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
let receiverTimer;
function startReceiver(s){
 if(receiverTimer)clearInterval(receiverTimer);
 intakeStatus={enabled:true,running:true,state:'starting_baseline',lastRun:null};
 const stopAt=Date.now()+8*60*60*1000;
 const receiver=createReceiver({store,folder:process.env.MAIL_FOLDER_ID,scopeKey:s.account.homeAccountId,since:process.env.MAIL_START_AFTER,get:path=>graph(s,path)});
 const run=async()=>{try{if(Date.now()>stopAt)throw Error('LOCAL_SESSION_EXPIRED');const out=await receiver.tick();intakeStatus={enabled:true,running:true,state:out.busy?'busy':out.baseline?'waiting_for_changes':'baseline',lastRun:new Date().toISOString()};}catch(e){clearInterval(receiverTimer);receiverTimer=null;intakeStatus={enabled:true,running:false,state:['GRAPH_THROTTLED_STOPPED','DELTA_EXPIRED_MANUAL_RESET_REQUIRED','LOCAL_SESSION_EXPIRED','RECEIVER_SCOPE_CHANGED_USE_NEW_WORKSPACE'].includes(e.message)?e.message:'STOPPED_REVIEW_CONFIGURATION_OR_REAUTHENTICATE',lastRun:new Date().toISOString()};}};
 run();receiverTimer=setInterval(run,intakeMinutes*60000);receiverTimer.unref();
}
const assets={'/':'index.html','/index.html':'index.html','/app.mjs':'app.mjs','/core.mjs':'core.mjs','/integration.mjs':'integration.mjs','/catalog.mjs':'catalog.mjs','/style.css':'style.css'};
const server=http.createServer(async(req,res)=>{
 try{
 if(req.headers.host!==`localhost:${port}`&&req.headers.host!==`127.0.0.1:${port}`)return json(res,403,{error:'Invalid host'});
 if(req.headers.origin&&req.headers.origin!==origin)return json(res,403,{error:'Origin not allowed'});
 if(req.method!=='GET'&&!(req.method==='POST'&&['/api/claude/analyze','/api/workspace','/api/events/synthetic'].includes(req.url)))return json(res,405,{error:'No send or tenant write endpoint.'});
 const u=new URL(req.url,origin),s=session(req);
 if(u.pathname==='/api/status'){const ss=s||makeSession(res);ss.csrf||=token();return json(res,200,{graphConfigured:enabled,authenticated:!!s?.account,mock,mode:mock?'simulation-no-network':'read-only-development',permissions:scopes,send:false,write:false,csrf:ss.csrf,workspace:true,receiver:{...intakeStatus,intervalMinutes:intakeMinutes},claude:mock?{ready:true,model:'simulation'}:claude.status});}
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
 if(u.pathname==='/api/workspace'){
  if(!s)return json(res,401,{error:'LOCAL_SESSION_REQUIRED'});
  if(req.method==='GET')return json(res,200,store.read());
  if(req.headers.origin!==origin||!same(s.csrf,req.headers['x-csrf-token']))return json(res,403,{error:'LOCAL_CONFIRMATION_REQUIRED'});
  let body='';for await(const chunk of req){body+=chunk;if(body.length>2000000)return json(res,413,{error:'WORKSPACE_TOO_LARGE'});}
  try{const input=JSON.parse(body);const authoritative=store.read().state;if(authoritative.receiver)input.state.receiver=authoritative.receiver;return json(res,200,await store.write(input.revision,input.state));}catch(err){return json(res,err.message==='REVISION_CONFLICT'?409:400,{error:err.message==='REVISION_CONFLICT'?'REVISION_CONFLICT_RELOAD_BEFORE_EDITING':'INVALID_WORKSPACE'});}
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
 if(assets[u.pathname]){const file=assets[u.pathname];let body=await readFile(new URL('../web/'+file,import.meta.url));if(file==='index.html')body=Buffer.from(body.toString().replace("connect-src 'none'","connect-src 'self'"));res.writeHead(200,{'content-type':file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/html','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});return res.end(body);}
 json(res,404,{error:'Not found'});
 }catch(err){json(res,500,{error:err.message==='AUTH_REQUIRED'?'SIGN_IN_REQUIRED':'Request failed. Review server configuration without logging tokens.'});}
});
server.listen(port,'127.0.0.1',()=>console.log(`Development demo: ${origin}; Graph ${enabled?'configured, sign-in required':'disabled'}`));
setInterval(()=>{for(const [id,s] of sessions)if(s.expires<Date.now())sessions.delete(id);},60000).unref();
