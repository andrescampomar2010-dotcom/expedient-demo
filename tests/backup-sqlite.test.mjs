import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
import {openStore} from '../server/store-sqlite.mjs';
const run=(...a)=>spawnSync(process.execPath,['scripts/backup.mjs',...a],{encoding:'utf8'});
test('backup y restore de SQLite de extremo a extremo, con base abierta y alterada después',()=>{
 const d=mkdtempSync(join(tmpdir(),'bks-')),src=join(d,'e.db');
 const live=openStore(src);live.write('workspace',{n:1},0);          // base abierta (WAL activo) durante la copia
 const r=run('backup',src,join(d,'b'));assert.equal(r.status,0,r.stderr);const f=r.stdout.match(/Copia: (\S+)/)[1];
 live.write('workspace',{n:2},1);live.close();                         // cambio posterior a la copia
 const x=run('restore',f,src);assert.equal(x.status,0,x.stderr);
 const back=openStore(src);assert.deepEqual(back.read('workspace').value,{n:1});back.close();
 writeFileSync(f+'.sha256','0'.repeat(64)+'\n');assert.equal(run('restore',f,src).status,1,'suma alterada se rechaza');
 const bad=join(d,'malo.db');writeFileSync(bad,'no es una base');assert.equal(run('restore',bad,src).status,1,'fichero que no es SQLite se rechaza');
 const r2=run('backup',src,join(d,'b2'));const g=r2.stdout.match(/Copia: (\S+)/)[1];assert.equal(run('restore',g,join(d,'x.json')).status,1,'tipo distinto se rechaza');
});
