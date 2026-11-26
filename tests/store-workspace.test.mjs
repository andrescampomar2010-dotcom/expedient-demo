import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {openStore} from '../server/store.mjs';
test('almacén .db: guarda, conserva tras reabrir, rechaza revisión vieja y hace copia',async()=>{
 const p=join(mkdtempSync(join(tmpdir(),'ws-')),'x.db');const a=await openStore(p),b=await openStore(p);
 const c=a.read();c.state.cases=[];const w=await a.write(c.revision,c.state);assert.equal(w.revision,1);
 {const st=b.read().state;st.history.push({x:1});await assert.rejects(()=>b.write(0,st),/REVISION_CONFLICT/);}
 await b.write(0,b.read().state);   // revisión vieja pero contenido idéntico: no hay nada que pisar
 const r=await openStore(p);assert.equal(r.read().revision,1);
 const d=p.replace(/\.db$/,'-copia.db');a.backupTo(d);assert.equal((await openStore(d)).read().revision,1);
 await assert.rejects(()=>a.write(1,{version:'x'}),/INVALID_STATE/);
});
