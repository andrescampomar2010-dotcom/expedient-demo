import test from 'node:test';import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,statSync,existsSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {buildEnv,validateConfig,parseEnv} from '../scripts/config.mjs';
const root=resolve(import.meta.dirname,'..');
const UUID='11111111-2222-3333-4444-555555555555';
const SECRET='SUPER-SECRET-VALUE-123';
const sandbox=()=>{const d=mkdtempSync(join(tmpdir(),'exp-'));cpSync(join(root,'scripts'),join(d,'scripts'),{recursive:true});return d;};
test('buildEnv validates tenant, client and dates',()=>{
  assert.ok(buildEnv({tenant:'bad tenant!',client:UUID}).errors.length);
  assert.ok(buildEnv({client:'nope'}).errors.length);
  assert.ok(buildEnv({client:UUID,secret:'a b'}).errors.length);
  assert.ok(buildEnv({client:UUID,intake:true,approved:true,since:'ayer',folder:'inbox'}).errors.length);
  const ok=buildEnv({client:UUID});assert.equal(ok.errors.length,0);
  const e=parseEnv(ok.text);assert.equal(e.MS_TENANT_ID,'consumers');assert.equal(e.MS_CLIENT_SECRET,'');assert.equal(e.CLAUDE_ENABLED,'false');assert.equal(e.MAIL_INTAKE_ENABLED,'false');
});
test('intake needs both intake and approval',()=>{
  const e=parseEnv(buildEnv({client:UUID,intake:true,approved:false,since:'2026-11-24T00:00:00Z',folder:'inbox'}).text);
  assert.equal(e.MAIL_INTAKE_ENABLED,'false');assert.equal(e.MAIL_INTAKE_APPROVED,'false');
  const f=parseEnv(buildEnv({client:UUID,intake:true,approved:true,since:'2026-11-24T00:00:00Z',folder:'inbox'}).text);
  assert.equal(f.MAIL_INTAKE_ENABLED,'true');assert.equal(f.MAIL_INTAKE_APPROVED,'true');
});
test('validateConfig flags contradictions and never echoes the secret',()=>{
  const bad=validateConfig({GRAPH_ENABLED:'true',INTEGRATION_MOCK:'true',MS_TENANT_ID:'x',MS_CLIENT_ID:'z',MS_CLIENT_SECRET:SECRET,MAIL_INTAKE_ENABLED:'true'});
  assert.ok(bad.filter(x=>x.level==='fail').length>=3);
  assert.ok(!JSON.stringify(bad).includes(SECRET));
  const pub=validateConfig({GRAPH_ENABLED:'true',MS_TENANT_ID:'consumers',MS_CLIENT_ID:UUID});
  assert.ok(pub.some(x=>x.msg.includes('público')));assert.ok(!pub.some(x=>x.level==='fail'));
});
test('setup --from-env writes a private .env, refuses overwrite, no secret in output',()=>{
  const d=sandbox();const env={...process.env,SETUP_CLIENT:UUID,SETUP_SECRET:SECRET};
  const r=spawnSync(process.execPath,['scripts/setup.mjs','--from-env'],{cwd:d,env,encoding:'utf8'});
  assert.equal(r.status,0);assert.ok(!(r.stdout+r.stderr).includes(SECRET));
  if(process.platform!=='win32')assert.equal(statSync(join(d,'.env')).mode&0o777,0o600);
  assert.ok(readFileSync(join(d,'.env'),'utf8').includes(SECRET));
  const again=spawnSync(process.execPath,['scripts/setup.mjs','--from-env'],{cwd:d,env,encoding:'utf8'});
  assert.notEqual(again.status,0);
  const bad=spawnSync(process.execPath,['scripts/setup.mjs','--from-env'],{cwd:sandbox(),env:{...process.env,SETUP_CLIENT:'x'},encoding:'utf8'});
  assert.notEqual(bad.status,0);
});
test('.gitignore keeps .env and data out of Git',()=>{
  const g=readFileSync(join(root,'.gitignore'),'utf8');assert.ok(g.includes('.env')&&g.includes('data/'));
});
const start=(env,port)=>{const p=spawn(process.execPath,['server/server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),APP_DATA_PATH:join(tmpdir(),`s${port}.json`),...env}});let log='';p.stdout.on('data',d=>log+=d);p.stderr.on('data',d=>log+=d);return {p,log:()=>log};};
const wait=async(fn)=>{for(let i=0;i<50;i++){try{return await fn();}catch{await new Promise(r=>setTimeout(r,100));}}throw Error('timeout');};
test('server refuses incomplete or contradictory configuration',async()=>{
  for(const [env,port] of [[{GRAPH_ENABLED:'true',MS_TENANT_ID:'consumers',MS_CLIENT_ID:'',INTEGRATION_MOCK:'false'},4890],[{GRAPH_ENABLED:'true',INTEGRATION_MOCK:'true',MS_TENANT_ID:'consumers',MS_CLIENT_ID:UUID},4891]]){
    const s=start(env,port);const code=await new Promise(r=>s.p.on('exit',r));assert.notEqual(code,0);}
});
test('public client mode (no secret) starts and redirects to Microsoft login with PKCE',async()=>{
  const s=start({GRAPH_ENABLED:'true',INTEGRATION_MOCK:'false',MS_TENANT_ID:'consumers',MS_CLIENT_ID:UUID,MS_CLIENT_SECRET:'',MS_REDIRECT_URI:'http://localhost:4892/auth/callback',MAIL_INTAKE_ENABLED:'false'},4892);
  try{
    const st=await wait(async()=>(await fetch('http://localhost:4892/api/status')).json());
    assert.equal(st.clientType,'public');assert.equal(st.send,false);assert.equal(st.write,false);
    const r=await fetch('http://localhost:4892/auth/login',{redirect:'manual'});assert.equal(r.status,302);
    const loc=r.headers.get('location');assert.match(loc,/^https:\/\/login\.microsoftonline\.com\/consumers\//);assert.match(loc,/code_challenge_method=S256/);assert.match(loc,/Mail\.Read/);assert.ok(!/Send|ReadWrite/.test(loc));
  }finally{s.p.kill();}
});
test('in-app setup page: needs CSRF+origin, rejects bad input, saves nothing without them',async()=>{
  const cwd=sandbox();cpSync(join(root,'server'),join(cwd,'server'),{recursive:true});cpSync(join(root,'web'),join(cwd,'web'),{recursive:true});cpSync(join(root,'node_modules'),join(cwd,'node_modules'),{recursive:true});
  const p=spawn(process.execPath,['server/server.mjs'],{cwd,env:{...process.env,PORT:'4893',GRAPH_ENABLED:'false',INTEGRATION_MOCK:'false',APP_DATA_PATH:join(cwd,'data.json')}});
  try{
    const base='http://localhost:4893';
    const st=await wait(async()=>{const r=await fetch(base+'/api/status');return {j:await r.json(),c:r.headers.get('set-cookie').split(';')[0]};});
    const page=await fetch(base+'/setup');assert.equal(page.status,200);assert.match(await page.text(),/Conectar tus cuentas/);
    const post=(h,b)=>fetch(base+'/api/setup',{method:'POST',headers:{'content-type':'application/json',...h},body:JSON.stringify(b)});
    const good={tenant:'consumers',client:UUID,secret:SECRET};
    assert.equal((await post({},good)).status,403);
    assert.equal((await post({origin:base,cookie:st.c},good)).status,403);
    const bad=await post({origin:base,cookie:st.c,'x-csrf-token':st.j.csrf},{tenant:'consumers',client:'x'});assert.equal(bad.status,400);
    assert.ok(!existsSync(join(cwd,'.env')));
    const ok=await post({origin:base,cookie:st.c,'x-csrf-token':st.j.csrf},good);const body=await ok.text();assert.equal(ok.status,200);assert.ok(!body.includes(SECRET));
    assert.ok(readFileSync(join(cwd,'.env'),'utf8').includes(SECRET));
    if(process.platform!=='win32')assert.equal(statSync(join(cwd,'.env')).mode&0o777,0o600);
    assert.equal((await post({origin:base,cookie:st.c,'x-csrf-token':st.j.csrf},good)).status,409);
    const get=await (await fetch(base+'/api/setup')).text();assert.ok(!get.includes(SECRET));
    assert.equal((await fetch(base+'/api/setup',{method:'POST',headers:{host:'evil.test'}})).status,403);
  }finally{p.kill();}
});
const CKEY='FAKE-TEST-KEY-0123456789abcdefghij';
test('Claude config: needs key, model, acceptance; off by default; key never echoed',()=>{
  assert.ok(buildEnv({client:UUID,claudeKey:CKEY,claudeModel:'m-1'}).errors.length);            // sin aceptación
  assert.ok(buildEnv({client:UUID,claudeKey:CKEY,claudeAccept:true,claudeModel:''}).errors.length); // sin modelo
  assert.ok(buildEnv({client:UUID,claudeKey:'a b',claudeAccept:true,claudeModel:'m-1'}).errors.length);
  assert.ok(buildEnv({client:UUID,claudeKey:CKEY,claudeAccept:true,claudeModel:'m-1',claudeMax:5000}).errors.length);
  assert.ok(buildEnv({}).errors.length);
  assert.equal(parseEnv(buildEnv({client:UUID}).text).CLAUDE_ENABLED,'false');
  const ok=buildEnv({claudeKey:CKEY,claudeAccept:true,claudeModel:'m-1'});assert.equal(ok.errors.length,0);
  const e=parseEnv(ok.text);assert.equal(e.CLAUDE_ENABLED,'true');assert.equal(e.GRAPH_ENABLED,'false');assert.equal(e.APP_DATA_PATH,'data/local.json');
  const v=validateConfig(e);assert.ok(!JSON.stringify(v).includes(CKEY));assert.ok(v.some(x=>x.level==='warn'&&/de pago/.test(x.msg)));
  assert.ok(validateConfig({CLAUDE_ENABLED:'true'}).some(x=>x.level==='fail'));
});
test('Microsoft real mode uses its own data file, separate from simulation',()=>{
  assert.equal(parseEnv(buildEnv({client:UUID}).text).APP_DATA_PATH,'data/real.json');
});
test('data file of one mode cannot be reused in another',async()=>{
  const f=join(mkdtempSync(join(tmpdir(),'dm-')),'ws.json');
  const run=(env)=>new Promise(res=>{const p=spawn(process.execPath,['server/server.mjs'],{cwd:root,env:{...process.env,APP_DATA_PATH:f,...env}});let log='';p.stderr.on('data',d=>log+=d);p.stdout.on('data',d=>{if(/Development demo/.test(d)){p.kill();res({code:0,log});}});p.on('exit',c=>res({code:c,log}));});
  const a=await run({PORT:'4894',INTEGRATION_MOCK:'true',GRAPH_ENABLED:'false',CLAUDE_ENABLED:'false'});assert.equal(a.code,0);
  const b=await run({PORT:'4895',INTEGRATION_MOCK:'false',GRAPH_ENABLED:'true',MS_TENANT_ID:'consumers',MS_CLIENT_ID:UUID,MS_REDIRECT_URI:'http://localhost:4895/auth/callback'});
  assert.notEqual(b.code,0);assert.match(b.log,/DATA_MODE_MISMATCH/);
});
test('Claude save through the in-app endpoint',async()=>{
  const cwd=sandbox();for(const d of ['server','web','node_modules'])cpSync(join(root,d),join(cwd,d),{recursive:true});
  const p=spawn(process.execPath,['server/server.mjs'],{cwd,env:{...process.env,PORT:'4896',GRAPH_ENABLED:'false',INTEGRATION_MOCK:'false',CLAUDE_ENABLED:'false',APP_DATA_PATH:join(cwd,'d.json')}});
  try{
    const base='http://localhost:4896';
    const st=await wait(async()=>{const r=await fetch(base+'/api/status');return {j:await r.json(),c:r.headers.get('set-cookie').split(';')[0]};});
    const h={'content-type':'application/json',origin:base,cookie:st.c,'x-csrf-token':st.j.csrf};
    const noAccept=await fetch(base+'/api/setup',{method:'POST',headers:h,body:JSON.stringify({claudeKey:CKEY,claudeModel:'m-1'})});assert.equal(noAccept.status,400);assert.ok(!existsSync(join(cwd,'.env')));
    const ok=await fetch(base+'/api/setup',{method:'POST',headers:h,body:JSON.stringify({claudeKey:CKEY,claudeModel:'m-1',claudeAccept:true})});const t=await ok.text();
    assert.equal(ok.status,200);assert.ok(!t.includes(CKEY));assert.ok(readFileSync(join(cwd,'.env'),'utf8').includes(CKEY));
    assert.ok(!(await (await fetch(base+'/api/setup')).text()).includes(CKEY));
    assert.equal((await fetch(base+'/.env')).status===200&&(await fetch(base+'/.env')).headers.get('content-type').includes('text/html'),false);
  }finally{p.kill();}
});
test('offline HTML builds without a working /setup link and server HTML keeps it conditional',()=>{
  const r=spawnSync(process.execPath,['build.mjs'],{cwd:root,encoding:'utf8'});assert.equal(r.status,0);
  const html=readFileSync(join(root,'Expedient_demo.html'),'utf8');
  assert.match(html,/versión offline no se conecta a cuentas/);
  assert.match(html,/location\.protocol==='http:'/);
  assert.ok(!/ANTHROPIC_API_KEY=|MS_CLIENT_SECRET=/.test(html));
});
