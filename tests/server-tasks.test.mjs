// Operaciones de tareas/persona a través del almacén por registro (servidor demo).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openShipmentsDb } from '../server/shipments-db.mjs';
import * as S from '../web/shipments.mjs';

const d = mkdtempSync(join(tmpdir(), 'sdb-tasks-'));

test('tareas y asignación persisten en el almacén por registro', () => {
  const db = openShipmentsDb(join(d, 't.db'));
  db.createShipment({ id: 'TR-9001', route: 'A → B', client: 'Cliente X', provider: 'Proveedor Y', created: '2026-11-20T08:00:00+01:00' });
  const t = db.addTask('TR-9001', { txt: 'Pedir albarán final', dir: 'ext', who: 'Iker Sala', due: '2026-11-29' });
  assert.ok(t.id);
  assert.throws(() => db.addTask('TR-9001', { txt: '' }), /INVALID_TASK/);
  assert.throws(() => db.addTask('TR-9999', { txt: 'x' }), /UNKNOWN_SHIPMENT/);
  db.assignTask('TR-9001', t.id, 'Marta Vela');
  db.assignShipment('TR-9001', 'Marta Vela');
  let g = db.get('TR-9001');
  assert.equal(g.shipment.assignee, 'Marta Vela');
  assert.equal(g.shipment.tasks[0].who, 'Marta Vela');
  db.completeTask('TR-9001', t.id);
  g = db.get('TR-9001');
  assert.ok(g.shipment.tasks[0].done);
  db.close();
  const db2 = openShipmentsDb(join(d, 't.db'));
  const g2 = db2.get('TR-9001');
  assert.equal(g2.shipment.assignee, 'Marta Vela');
  assert.ok(g2.shipment.tasks[0].done);
  assert.throws(() => db2.completeTask('TR-9001', 'T-x'), /UNKNOWN_TASK/);
  db2.close();
});
