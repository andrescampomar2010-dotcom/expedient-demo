import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('la interfaz funciona también servida por HTTPS en un dominio (no solo localhost)',()=>{
 for(const f of ['web/app.mjs','web/integration.mjs']){const s=readFileSync(f,'utf8');
  const m=s.match(/const (served|hosted)=([^;]+);/);assert.ok(m,f);
  const run=(protocol,hostname)=>new Function('location','return '+m[2])({protocol,hostname});
  assert.equal(run('https:','expedient.empresa.example'),true);assert.equal(run('http:','localhost'),true);
  assert.equal(run('file:',''),false);assert.equal(run('http:','otro.example'),false);}
});
