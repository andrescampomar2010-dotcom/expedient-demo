const $ = (s) => document.querySelector(s), state = $('#state'), f = $('#f');
const show = (checks, extra = '') => { state.textContent = ''; const ul = document.createElement('ul'); for (const c of checks || []) { const li = document.createElement('li'); li.textContent = ({ ok: 'OK: ', warn: 'Aviso: ', fail: 'Falla: ' })[c.level] + c.msg; ul.append(li); } state.append(ul); if (extra) { const p = document.createElement('p'); p.textContent = extra; state.append(p); } };
f.intake.addEventListener('change', () => { $('#intakeBox').hidden = !f.intake.checked; });
const status = await (await fetch('/api/status')).json();
const cur = await (await fetch('/api/setup')).json();
show(cur.checks, cur.envExists ? 'Ya hay una configuración local. Los cambios se aplican al reiniciar el servidor.' : 'Aún no hay configuración. Estás en modo sin cuentas.');
f.addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = Object.fromEntries(new FormData(f));
  const body = { tenant: v.tenant, client: v.client, secret: v.secret, folder: v.folder, since: v.since, intake: !!v.intake, approved: !!v.approved, overwrite: !!v.overwrite, claudeKey: v.claudeKey, claudeModel: v.claudeModel, claudeMax: v.claudeMax, claudeAccept: !!v.claudeAccept };
  const r = await fetch('/api/setup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': status.csrf }, body: JSON.stringify(body) });
  const j = await r.json(); f.secret.value = ''; f.claudeKey.value = '';
  if (r.ok) show(j.checks, 'Guardado. Detén el servidor (Ctrl+C), arráncalo de nuevo con npm start y abre la pestaña Conexiones para iniciar sesión.');
  else show([{ level: 'fail', msg: (j.error || 'Error') + (j.details ? ': ' + j.details.join('; ') : '') }]);
});
