import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const run=(...a)=>spawnSync(process.execPath,['scripts/backup.mjs',...a],{encoding:'utf8'});
test('backup y restore verifican integridad',()=>{
 const d=mkdtempSync(join(tmpdir(),'bk-')),src=join(d,'x.json');writeFileSync(src,'{"a":1}');
 const r=run('backup',src,join(d,'b'));assert.equal(r.status,0);
 const f=r.stdout.match(/Copia: (\S+)/)[1];
 writeFileSync(f,'{"a":2}');assert.equal(run('restore',f,src).status,1,'copia alterada debe rechazarse');
 writeFileSync(f,'{"a":1}');assert.equal(run('restore',f,src).status,0);assert.equal(readFileSync(src,'utf8'),'{"a":1}');
});
