import test from 'node:test';import assert from 'node:assert/strict';
import {createUsers,can} from '../server/users.mjs';
test('contraseña guardada con hash y sesión por rol',()=>{
 const u=createUsers();u.add('Ana','una-clave-larga-1','operador');
 assert.ok(!JSON.stringify(u.doc).includes('una-clave-larga-1'));
 const s=u.login('ana','una-clave-larga-1');assert.equal(u.check(s.token).role,'operador');
 assert.ok(can('operador','write'));assert.ok(!can('lector','write'));assert.ok(!can('operador','manage'));
 u.logout(s.token);assert.equal(u.check(s.token),null);
});
test('rechaza clave corta, rol inválido, usuario repetido y token falso',()=>{
 const u=createUsers();assert.throws(()=>u.add('a','corta','admin'),/PASSWORD_TOO_SHORT/);
 assert.throws(()=>u.add('a','una-clave-larga-1','jefe'),/ROLE_INVALID/);
 u.add('a','una-clave-larga-1','admin');assert.throws(()=>u.add('A','una-clave-larga-1','admin'),/USER_EXISTS/);
 assert.equal(u.check('inventado'),null);assert.equal(u.login('nadie','x'),null);
});
test('bloqueo tras fallos y caducidad de sesión',()=>{
 let t=0;const u=createUsers(undefined,{now:()=>t,maxFails:3,lockMs:1000,ttlMs:500});u.add('a','una-clave-larga-1','lector');
 for(let i=0;i<3;i++)assert.equal(u.login('a','mal'),null);
 assert.equal(u.login('a','una-clave-larga-1').locked,true);
 t=1500;const s=u.login('a','una-clave-larga-1');assert.ok(s.token);t=2100;assert.equal(u.check(s.token),null);
});
