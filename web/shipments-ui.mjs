import * as S from './shipments.mjs';
// Pantalla «Envíos»: ficha viva por envío, pendientes de relacionar, búsqueda y alta manual.
export function shipmentsUI({ host, getState, save, esc, msg, demo }) {
  const st = () => getState();
  let sub = 'list', sel = '', q = '';
  const tag = (t, c = '') => `<span class="tag ${c}">${esc(t)}</span>`;
  const sh = id => S.ensure(st()).items.find(s => s.id === id);
  const mailById = id => S.ensure(st()).mails.find(m => m.id === id);
  const num = n => (n == null ? '–' : String(Number(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
  const demoLeft = () => { const x = S.ensure(st()); return x.demo ? S.DEMO_INBOX.length - (x.demoCursor || 0) : 0; };

  function head() {
    const x = S.ensure(st()), k = S.stats(st());
    const btn = (v, label) => `<button class="${sub === v ? 'on' : ''}" data-sh="sub" data-v="${v}">${label}</button>`;
    return `<h2>Envíos</h2><div class="notice">Cada correo nuevo se suma a la ficha de su envío y actualiza el resumen. Si no se puede relacionar con seguridad, queda en Pendientes para que lo decidas.${x.demo ? ' <strong>Datos ficticios.</strong>' : ''}</div>
<div class="line">${btn('list', `Envíos (${k.shipments})`)}${btn('pending', `Pendientes (${k.pending})`)}${btn('search', 'Buscar')}${btn('new', 'Nuevo envío')}</div>`;
  }

  function summary(s) {
    const m = S.summarize(s);
    const line = (label, e) => `<p><strong>${label}:</strong> ${e ? `${esc(S.fmt(e.date))} · ${esc(e.text)}<br><small>Fuente: ${esc(e.source)}</small>` : 'ninguna registrada'}</p>`;
    return `<section class="line" id="summary"><h3>Resumen del envío</h3><p><small>Expediente ${esc(s.exp || '–')} · DUA ${esc(s.dua || '–')} · ${num(s.bultos)} bultos · ${num(s.kg)} kg</small></p>
${line('Última gestión hecha', m.lastGestion)}${line('Última información recibida', m.lastInfo)}
${m.rejectionOpen ? tag('Rechazo recibido y sin gestión posterior registrada', 'warn') + '<p><small>Dice «sin gestión registrada», no que nadie lo haya gestionado: solo conoce los correos que han llegado a la app.</small></p>' : ''}</section>`;
  }

  function card(s) {
    const m = S.summarize(s);
    return `<section class="line click" data-sh="open" data-id="${esc(s.id)}"><h3>${esc(s.id)} · ${esc(s.route || '')}</h3>
<small>${esc(s.client)} · ${esc(s.provider)} · Exp. ${esc(s.exp || '–')} · DUA ${esc(s.dua || '–')} · ${num(s.bultos)} bultos · ${num(s.kg)} kg</small><br>
${tag(s.status)}${m.rejectionOpen ? tag('Rechazo sin gestión posterior', 'warn') : ''}${m.plateNow.map(p => tag(p.role + ' ' + p.value)).join('')}
<p><small>Última información: ${m.lastInfo ? esc(S.fmt(m.lastInfo.date) + ' · ' + m.lastInfo.text) : 'ninguna'}${m.lastGestion ? '<br>Última gestión: ' + esc(S.fmt(m.lastGestion.date) + ' · ' + m.lastGestion.text) : ''}</small></p></section>`;
  }

  function list() {
    const items = S.ensure(st()).items.slice().sort((a, b) => (S.summarize(b).rejectionOpen - S.summarize(a).rejectionOpen) || a.id.localeCompare(b.id));
    const sim = S.ensure(st()).demo ? `<button data-sh="simulate" ${demoLeft() ? '' : 'disabled'}>Simular llegada del siguiente correo (${demoLeft()} por llegar)</button>` : '';
    if (!items.length) return `<p>Aún no hay envíos. Crea uno en «Nuevo envío»${demo ? ' o carga el ejemplo ficticio' : ''}. Los correos que lleguen se relacionarán con ellos.</p>${demo ? '<button data-sh="demo">Cargar ejemplo ficticio</button>' : ''}`;
    return sim + items.map(card).join('');
  }

  function mailBlock(m, mark) {
    const ev = (S.ensure(st()).items.find(s => s.id === m.shipmentId)?.events || []).find(e => e.mailId === m.id);
    return `<div class="line ${mark ? 'hit' : ''}"><small>${esc(S.fmt(m.date))} · ${esc(m.from)} · ${m.direction === 'out' ? 'enviado por nosotros' : 'recibido'}</small><br><strong>${esc(m.subject)}</strong><p>${esc(m.body)}</p>${(m.attachments || []).map(a => tag('Adjunto: ' + a)).join('')}${ev?.corrects ? tag('Corrige un dato anterior (' + ev.corrects + ')', 'warn') : ''}${m.how ? `<p><small>${esc(m.how)}</small></p>` : ''}</div>`;
  }

  function detail(id, hits = []) {
    const s = sh(id); if (!s) return '<p>Envío no encontrado.</p>';
    const m = S.summarize(s);
    const plates = (s.plates || []).slice().sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    return `<button data-sh="back">← Volver</button><section class="line"><h3>${esc(s.id)} · ${esc(s.route || '')}</h3><small>${esc(s.cargo || '')}</small><br>${tag('Cliente: ' + s.client)}${tag('Proveedor: ' + s.provider)}${tag(s.status)}</section>
${summary(s)}
<h3>Matrículas</h3>${plates.length ? `<section class="line">${m.plateNow.map(p => `<p><strong>${esc(p.role)} ${esc(p.value)}</strong> <small>desde ${esc(S.fmt(p.date))}${p.replaces ? ', sustituye a ' + esc(p.replaces) : ''}</small></p>`).join('')}${plates.some(p => p.replaces) ? '<p><small>Hay una corrección: el historial conserva los valores anteriores.</small></p>' : ''}</section>` : '<div class="notice">Ningún correo de este envío trae matrículas todavía.</div>'}
${(s.conflicts || []).length ? `<h3>Datos que no coinciden con la ficha</h3>${s.conflicts.map(c => `<div class="notice">${esc(S.fmt(c.date))} · ${esc(c.text)}. No se ha cambiado la ficha: revisa cuál vale.</div>`).join('')}` : ''}
<h3>Historial (${s.events.length})</h3>${s.events.slice().reverse().map(e => `<p><strong>${esc(S.fmt(e.date))}</strong> · ${e.side === 'gestion' ? tag('Gestión nuestra') : tag('Información')}${e.rejection ? tag('Rechazo', 'warn') : ''} ${esc(e.text)}<br><small>${esc(e.source)}</small></p>`).join('') || '<p>Sin historial.</p>'}
<h3>Correos del envío (${s.mailIds.length})</h3>${s.mailIds.map(mailById).filter(Boolean).sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).map(mm => mailBlock(mm, hits.includes(mm.id))).join('')}`;
  }

  function pending() {
    const P = S.ensure(st()).pending;
    if (!P.length) return '<p>No hay correos pendientes de relacionar.</p>';
    return P.map(p => { const m = mailById(p.mailId); return `<section class="line">${mailBlock(m)}${m.facts?.kind === 'rechazo' ? tag('Rechazo sin relacionar con seguridad', 'warn') : ''}<p><small>${esc(p.why)}</small></p>
${p.candidates.map(c => `<button data-sh="confirm" data-mail="${esc(p.mailId)}" data-id="${esc(c)}">Es de ${esc(c)}</button>`).join('')}<button data-sh="discard" data-mail="${esc(p.mailId)}">Descartar</button></section>`; }).join('');
  }

  function results() {
    const r = S.search(st(), q);
    if (r === null) return '<div class="notice">Escribe un DUA, expediente, matrícula o palabras del correo. Prueba con un número de DUA o «matrícula camión».</div>';
    if (!r.length) return '<div class="notice"><strong>No he encontrado nada.</strong> Eso no significa que no haya llegado: puede estar en otro buzón, ser aún un correo pendiente, venir en un adjunto escaneado (la app no lee su texto) o usar otras palabras. La búsqueda es literal, no por significado.</div>';
    return `<div class="notice">${r.length} envío(s).</div>` + r.map(x => `<div>${x.exact.length ? tag('Coincide por ' + x.exact.join(', '), 'ok') : ''}${card(sh(x.shipmentId))}</div>`).join('');
  }

  function form() {
    const f = (id, label, ph = '') => `<label>${label}<input id="ns-${id}" placeholder="${esc(ph)}"></label>`;
    return `<section class="line"><h3>Nuevo envío</h3>${f('id', 'Referencia del envío', 'TR-0500')}${f('route', 'Ruta')}${f('client', 'Cliente')}${f('clientDomain', 'Dominio de correo del cliente', 'cliente.example')}${f('provider', 'Proveedor de transporte')}${f('providerDomain', 'Dominio de correo del proveedor')}${f('exp', 'Expediente', 'EXP-2611-12')}${f('dua', 'Número de DUA')}${f('bultos', 'Bultos')}${f('kg', 'Kilos')}<button data-sh="create">Crear envío</button><p><small>Los dominios solo sirven para proponer, nunca para asignar solos.</small></p></section>`;
  }

  function paint() {
    const body = sub === 'detail' ? detail(sel, hitsSel) : sub === 'pending' ? pending() : sub === 'search' ? `<label>Buscar<input id="sh-q" value="${esc(q)}" placeholder="DUA, expediente, matrícula o palabras"></label><div id="sh-results">${results()}</div>` : sub === 'new' ? form() : list();
    host.innerHTML = (sub === 'detail' ? '' : head()) + `<div id="sh-body">${body}</div>`;
  }
  let hitsSel = [];

  async function click(e) {
    const b = e.target.closest('[data-sh]'); if (!b || b.disabled) return;
    const a = b.dataset.sh, d = b.dataset;
    try {
      if (a === 'sub') { sub = d.v; sel = ''; }
      else if (a === 'open') { sub = 'detail'; sel = d.id; hitsSel = []; }
      else if (a === 'back') { sub = q && S.search(st(), q)?.length ? 'search' : 'list'; sel = ''; }
      else if (a === 'demo') { const x = S.demoState().shipments; x.demo = true; x.demoCursor = 0; st().shipments = x; save(); msg('Ejemplo ficticio cargado.'); }
      else if (a === 'simulate') { const x = S.ensure(st()); const m = S.DEMO_INBOX[x.demoCursor || 0]; if (!m) return; x.demoCursor = (x.demoCursor || 0) + 1; const r = S.ingestMail(st(), m); save(); msg(r.status === 'linked' ? `Correo añadido a ${r.shipmentId}. ${r.why}` : r.status === 'pending' ? 'Correo pendiente: ' + r.why : r.status === 'ignored' ? 'Correo sin relación con ningún envío.' : r.why); }
      else if (a === 'confirm') { S.confirmPending(st(), d.mail, d.id); save(); msg(`Correo añadido a ${d.id} con su fuente.`); }
      else if (a === 'discard') { S.confirmPending(st(), d.mail, null); save(); msg('Correo descartado.'); }
      else if (a === 'create') { const v = k => host.querySelector('#ns-' + k)?.value.trim() || ''; S.addShipment(st(), { id: v('id'), route: v('route'), client: v('client'), clientDomain: v('clientDomain'), provider: v('provider'), providerDomain: v('providerDomain'), exp: v('exp'), dua: v('dua'), bultos: v('bultos'), kg: v('kg') }); save(); sub = 'list'; msg('Envío creado.'); }
      paint();
    } catch (err) { msg({ SHIPMENT_ID_REQUIRED: 'Falta la referencia del envío.', SHIPMENT_EXISTS: 'Ya existe un envío con esa referencia.', NOT_PENDING: 'Ese correo ya se había resuelto.' }[err.message] || err.message); paint(); }
  }
  function input(e) {
    if (e.target.id !== 'sh-q') return;
    q = e.target.value; host.querySelector('#sh-results').innerHTML = results();
  }
  host.addEventListener('click', click); host.addEventListener('input', input);
  paint();
  return () => { host.removeEventListener('click', click); host.removeEventListener('input', input); };
}
