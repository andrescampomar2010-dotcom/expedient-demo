// Barra de personas (equipo ficticio) y tareas por envío con vencimiento.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../web/core.mjs';
import * as S from '../web/shipments.mjs';

test('equipo ficticio: siembra, ausencia y bloqueo de asignación', () => {
  const s = C.blank();
  const team = C.ensureTeam(s);
  assert.equal(team.length, 3);
  assert.equal(team[0].role, 'Coordinador');
  assert.equal(team.find(p => p.id === 'lucia').absent, true);
  C.setAbsent(s, 'lucia', false);
  assert.equal(C.personById(s, 'lucia').absent, false);
  C.setAbsent(s, 'lucia', true);
  assert.throws(() => C.setAbsent(s, 'nadie', true), /PERSONA_DESCONOCIDA/);
  const c = C.newCase('Expediente de prueba', 'Proveedor ficticio');
  c.expectedValue = 1; c.expectedNet = 1;
  c.lines = [{ id: 'l1', ref: 'R', description: 'd', material: 'm', hs: '96091010', value: 1, net: 1, source: 'ficticio', confirmed: true }];
  s.cases.push(c);
  C.review(c);
  assert.throws(() => C.assign(s, c, 'Lucía Prats'), /PERSONA_AUSENTE/);
  assert.throws(() => C.assign(s, c, 'Persona Que No Existe'), /PERSONA_DESCONOCIDA/);
  C.assign(s, c, 'Iker Sala');
  assert.equal(c.agent, 'Iker Sala');
  assert.equal(C.openCasesOf(s, 'Iker Sala'), 1);
});

test('tareas por envío: alta, validación, completado y reasignación', () => {
  const st = S.demoState();
  const before = st.shipments.pending.length;
  const t = S.addTask(st, 'TR-0412', { txt: 'Llamar al proveedor', dir: 'ext', who: 'Iker Sala', due: '2026-11-29' });
  assert.equal(t.done, '');
  assert.throws(() => S.addTask(st, 'TR-0412', { txt: '' }), /INVALID_TASK/);
  assert.throws(() => S.addTask(st, 'TR-0412', { txt: 'x', dir: 'otra' }), /INVALID_TASK_DIR/);
  assert.throws(() => S.addTask(st, 'TR-0412', { txt: 'x', due: '29/11/2026' }), /INVALID_TASK_DUE/);
  assert.throws(() => S.addTask(st, 'TR-9999', { txt: 'x' }), /UNKNOWN_SHIPMENT/);
  S.assignTask(st, 'TR-0412', t.id, 'Marta Vela');
  assert.equal(t.who, 'Marta Vela');
  S.completeTask(st, 'TR-0412', t.id);
  assert.ok(t.done);
  assert.throws(() => S.completeTask(st, 'TR-0412', 'T-inexistente'), /UNKNOWN_TASK/);
  // Las tareas no tocan los correos por clasificar: siguen aparte, en Pendientes.
  assert.equal(st.shipments.pending.length, before);
});

test('etiquetas de vencimiento', () => {
  const ref = new Date('2026-11-27T12:00:00+01:00');
  assert.equal(S.dueLabel('2026-11-25', ref), 'vencida 2d');
  assert.equal(S.dueLabel('2026-11-27', ref), 'HOY');
  assert.equal(S.dueLabel('2026-11-28', ref), 'mañana');
  assert.equal(S.dueLabel('2026-12-01', ref), 'en 4d');
  assert.equal(S.dueLabel('', ref), '');
});

test('avisos: inactividad (>=4 días) y ETA próxima sin borrador, solo con datos explícitos', () => {
  const ref = new Date('2026-11-27T12:00:00+01:00');
  const stale = { status: 'En tránsito', created: '2026-11-20T08:00:00+01:00', events: [{ date: '2026-11-20T09:00:00+01:00', kind: 'info', text: 'x' }] };
  assert.deepEqual(S.riskFlags(stale, ref), ['Sin movimiento desde hace 7 días']);
  const eta = { status: 'En tránsito', created: '2026-11-26T08:00:00+01:00', eta: '2026-11-30', events: [{ date: '2026-11-26T08:00:00+01:00', kind: 'info', text: 'x' }] };
  assert.deepEqual(S.riskFlags(eta, ref), ['ETA en 3d sin borrador registrado']);
  const conBorrador = { ...eta, events: [...eta.events, { date: '2026-11-26T09:00:00+01:00', kind: 'info', text: 'Borrador DUA preparado' }] };
  assert.deepEqual(S.riskFlags(conBorrador, ref), []);
  const entregado = { ...eta, status: 'Entregado' };
  assert.deepEqual(S.riskFlags(entregado, ref), []);
  const sinEta = { status: 'En tránsito', created: '2026-11-26T08:00:00+01:00', events: [{ date: '2026-11-26T08:00:00+01:00', kind: 'info', text: 'x' }] };
  assert.deepEqual(S.riskFlags(sinEta, ref), []);
});

test('demo: personas asignadas, tareas sembradas y pendientes por correo intactos', () => {
  const st = S.demoState();
  const byId = Object.fromEntries(st.shipments.items.map(x => [x.id, x]));
  assert.equal(byId['TR-0412'].assignee, 'Iker Sala');
  assert.equal(byId['TR-0421'].assignee, 'Lucía Prats');
  assert.ok(byId['TR-0421'].tasks.some(t => t.dir === 'int' && !t.done));
  assert.ok(byId['TR-0398'].tasks.every(t => t.done));
  const open = S.openTasks(st);
  assert.equal(open.filter(o => o.task.who === 'Lucía Prats').length, 2);
  assert.ok(st.shipments.pending.length >= 0);
  S.assignShipment(st, 'TR-0421', 'Marta Vela');
  assert.equal(byId['TR-0421'].assignee, 'Marta Vela');
});

test('recuento por encima del tamaño de página: openTasksFromItems y aviso de alcance', () => {
  const items = [];
  for (let i = 1; i <= 60; i++) items.push({ id: 'TR-' + String(i).padStart(4, '0'), route: 'A → B', client: 'C', assignee: i % 2 ? 'Iker Sala' : 'Marta Vela', tasks: [{ id: 'T-' + i, txt: 'tarea ' + i, dir: 'int', who: i % 2 ? 'Iker Sala' : 'Marta Vela', due: '', ts: '', done: i === 60 ? 'x' : '', src: 'test' }] });
  const open = S.openTasksFromItems(items);
  assert.equal(open.length, 59); // 60 envíos (más que la página de 50), una tarea hecha
  assert.equal(open.filter(o => o.task.who === 'Iker Sala').length, 30);
  assert.equal(S.taskScopeNote(60, 73), 'Recuento sobre 60 envíos abiertos de 73 en total. Los entregados no se incluyen.');
  assert.match(S.taskScopeNote(200, 500), /primeros 200/);
  assert.match(S.taskScopeNote(60, 60), /los 60 envíos abiertos/);
});
