import test from 'node:test';import assert from 'node:assert/strict';
import {failedStatus,alertLine,healthOf} from '../server/health.mjs';
test('un fallo del receptor genera alerta con código y acción, sin texto del error original',()=>{
 const s=failedStatus(new Error('401 token=SECRETO abc'),new Date('2026-11-26T10:00:00Z'));
 assert.equal(s.alert,true);assert.equal(s.state,'STOPPED_REVIEW_CONFIGURATION_OR_REAUTHENTICATE');
 assert.ok(!JSON.stringify(s).includes('SECRETO'));assert.ok(!alertLine(s).includes('SECRETO'));
 assert.equal(failedStatus(new Error('GRAPH_THROTTLED_STOPPED')).state,'GRAPH_THROTTLED_STOPPED');
});
test('health devuelve 503 con alerta y 200 sin ella',()=>{
 assert.equal(healthOf({enabled:false}).code,200);
 const h=healthOf(failedStatus(new Error('LOCAL_SESSION_EXPIRED')));assert.equal(h.code,503);assert.equal(h.body.ok,false);assert.match(h.body.receiver.action,/iniciar sesión/);
});
