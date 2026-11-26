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
test('cambio de clave propio, restablecimiento y rol: sesiones revocadas, cuenta conservada, último admin protegido',()=>{
 const u=createUsers();u.add('jefa','una-clave-larga-1','admin');u.add('ana','una-clave-larga-1','operador');
 const a1=u.login('ana','una-clave-larga-1'),a2=u.login('ana','una-clave-larga-1');
 assert.throws(()=>u.changeOwnPassword(a1.token,'mala','otra-clave-larga-2'),/WRONG_PASSWORD/);
 assert.throws(()=>u.changeOwnPassword(a1.token,'una-clave-larga-1','corta'),/PASSWORD_TOO_SHORT/);
 u.changeOwnPassword(a1.token,'una-clave-larga-1','otra-clave-larga-2');
 assert.ok(u.check(a1.token),'la sesión actual sigue');assert.equal(u.check(a2.token),null,'las demás se cierran');
 assert.equal(u.login('ana','una-clave-larga-1'),null);assert.ok(u.login('ana','otra-clave-larga-2'));
 const a3=u.login('ana','otra-clave-larga-2');u.adminResetPassword('ana','reinicio-largo-33');assert.equal(u.check(a3.token),null);assert.ok(u.login('ana','reinicio-largo-33'));
 const a4=u.login('ana','reinicio-largo-33');u.setRole('ana','lector');assert.equal(u.check(a4.token),null);assert.equal(u.list().find(x=>x.name==='ana').role,'lector');
 assert.throws(()=>u.setRole('jefa','lector'),/LAST_ADMIN/);u.setRole('ana','admin');u.setRole('jefa','lector');assert.throws(()=>u.setRole('ana','operador'),/LAST_ADMIN/);
});
