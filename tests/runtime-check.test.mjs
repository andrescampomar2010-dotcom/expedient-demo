import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {nodeOk,assertNode} from '../server/runtime-check.mjs';
test('versiones de Node: 22.13.0 sí, 22.12.9 no, 24 sí, 20 no',()=>{
 for(const v of ['22.13.0','22.13.1','22.14.0','22.23.5','24.0.0','25.1.0'])assert.equal(nodeOk(v),true,v);
 for(const v of ['22.12.9','22.0.0','20.18.0','23.5.0','18.0.0'])assert.equal(nodeOk(v),false,v);
 assert.throws(()=>assertNode('22.12.0'),/NODE_TOO_OLD/);
});
test('package.json, lock y Dockerfile piden Node >= 22.13',()=>{
 assert.equal(JSON.parse(readFileSync('package.json','utf8')).engines.node,'>=22.13.0');
 assert.equal(JSON.parse(readFileSync('package-lock.json','utf8')).packages[''].engines.node,'>=22.13.0');
 assert.match(readFileSync('deploy/Dockerfile','utf8'),/a===22&&b>=13/);
});
