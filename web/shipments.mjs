// Envíos: agrupa correos por envío, mantiene una ficha viva y un resumen con fuente.
// Lógica pura (sin red): la usan el servidor, el navegador y las pruebas.
// Reglas deterministas. Una IA opcional solo podría PROPONER; esta lógica comprueba referencias.

export const SHIPMENTS_VERSION = 1;
const GESTION_KINDS = new Set(['dua_presentado', 'subsanacion', 'documentacion', 'pedido_matriculas', 'gestion']);

export const KIND_LABEL = {
  rechazo: 'Rechazo de aduana recibido',
  dua_presentado: 'DUA presentado',
  subsanacion: 'Subsanación enviada',
  levante: 'Levante / autorización recibida',
  matriculas: 'Matrículas recibidas',
  correccion: 'Corrección de datos recibida',
  entrega: 'Entrega confirmada',
  documentacion: 'Documentación',
  pedido_matriculas: 'Matrículas solicitadas',
  gestion: 'Gestión nuestra',
  info: 'Información recibida'
};

export function blankShipments() {
  return { version: SHIPMENTS_VERSION, items: [], mails: [], pending: [], ownDomains: [] };
}
export function ensure(state) {
  if (!state.shipments || state.shipments.version !== SHIPMENTS_VERSION) state.shipments = blankShipments();
  return state.shipments;
}

export const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const plateKey = s => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const num = s => Number(String(s).replace(/\./g, '').replace(',', '.'));
const domainOf = a => String(a || '').toLowerCase().split('@').pop().trim();
const ts = d => Date.parse(d) || 0;

export const ATT_LABEL = { leido: 'leído', sin_texto: 'sin texto: no leído, posible escaneo', demasiado_grande: 'demasiado grande: no leído', no_soportado: 'contenido no leído', protegido: 'PDF con clave: no leído', protegido: 'PDF con clave: no leído', error: 'no se pudo leer', leido_ocr: 'leído por OCR, NO verificado: confirma con el original', ocr_no_disponible: 'escaneo: OCR no disponible, no leído' };
export function extract(mail) {
  const text = `${mail.subject || ''}\n${mail.body || ''}\n${(mail.attachments || []).join(' ')}\n${String(mail.attachmentText || '').slice(0, 60000)}`;
  const duas = [...new Set((text.match(/\b\d{2}[A-Za-z]{2}\d{10,16}[A-Za-z]?\b/g) || []).map(x => x.toUpperCase()))];
  const exps = [...new Set([...text.matchAll(/\bEXP[-\s]?(\d{4})[-\s]?(\d{1,3})\b/gi)].map(m => `EXP-${m[1]}-${m[2].padStart(2, '0')}`))];
  const refs = [...new Set((text.match(/\bTR-\d{3,5}\b/gi) || []).map(x => x.toUpperCase()))];
  const plates = [...new Set([...text.matchAll(/(?<![A-Za-z]-?)\b(\d{4})[\s-]?([BCDFGHJKLMNPRSTVWXYZ]{3})\b/gi)].map(m => (m[1] + m[2]).toUpperCase()))];
  const trailers = [...new Set([...text.matchAll(/\bR-?(\d{4})-?([A-Z]{3})\b/gi)].map(m => ('R' + m[1] + m[2]).toUpperCase()))];
  const b = text.match(/(\d[\d.]*)\s*bultos/i), k = text.match(/(\d[\d.]*(?:,\d+)?)\s*kg\b/i);
  return { duas, exps, refs, plates, trailers, bultos: b ? num(b[1]) : null, kg: k ? num(k[1]) : null, kind: classify(mail) };
}

export function classify(mail) {
  const t = norm(`${mail.subject || ''} ${mail.body || ''}`);
  const out = mail.direction === 'out';
  if (out && /subsan|reenvi/.test(t)) return 'subsanacion';
  if (/rechaz|denegad|error en (la )?(declaracion|partida|codigo)/.test(t)) return 'rechazo';
  if (/subsan|corregid[oa] y reenvi|reenviamos (la )?(declaracion|dua)/.test(t)) return out ? 'subsanacion' : 'info';
  if (/levante|autorizad[oa] (la )?(salida|declaracion)/.test(t)) return 'levante';
  if (/dua presentad|declaracion presentad|presentamos (el|la) (dua|declaracion)/.test(t)) return out ? 'dua_presentado' : 'info';
  if (/entregad[oa] en destino|(ha sido|fue|queda) entregad[oa]|entregad[oa],? gracias/.test(norm(mail.body || ''))) return 'entrega';
  if (/correccion|corrige|cambia el camion|nueva matricula/.test(t)) return 'correccion';
  if (/matricula|camion asignado|remolque/.test(t)) return out ? 'pedido_matriculas' : 'matriculas';
  if (/adjunt|documentacion|documento/.test(t)) return out ? 'documentacion' : 'info';
  return out ? 'gestion' : 'info';
}

function openShipments(S) { return S.items.filter(s => s.status !== 'Entregado'); }
const byNum = (a, b) => (a != null && b != null && a === b);

// Índices en memoria (se reconstruyen si cambia el nº de envíos o correos). Evitan recorrer todo el histórico por cada correo.
const IDX = new WeakMap();
function indexOf(S) {
  let c = IDX.get(S);
  const put = (m, k, s) => { if (k == null || k === '') return; const a = m.get(k); if (a) a.push(s); else m.set(k, [s]); };
  if (c && c.itemsRef === S.items && c.mailsRef === S.mails && S.items.length > c.ni) {
    for (; c.ni < S.items.length; c.ni++) { const s = S.items[c.ni]; c.id.set(s.id, s); put(c.dua, s.dua, s); put(c.exp, s.exp, s); }
  }
  if (!c || c.ni !== S.items.length || c.mailsRef !== S.mails || c.itemsRef !== S.items) {
    c = { ni: S.items.length, nm: 0, mailsRef: S.mails, itemsRef: S.items, id: new Map(), dua: new Map(), exp: new Map(), thread: new Map(), mailId: new Map() };
    for (const s of S.items) { c.id.set(s.id, s); put(c.dua, s.dua, s); put(c.exp, s.exp, s); }
    IDX.set(S, c);
  }
  for (; c.nm < S.mails.length; c.nm++) indexMail(c, S.mails[c.nm]);
  return c;
}
function indexMail(c, m) {
  c.mailId.set(m.id, m);
  if (m.threadId && m.shipmentId) { let t = c.thread.get(m.threadId); if (!t) c.thread.set(m.threadId, t = new Set()); t.add(m.shipmentId); }
}
function candidatesFor(S, x, mail) {
  const found = new Map();
  const add = (s, how, sure) => { const p = found.get(s.id); if (!p) found.set(s.id, { id: s.id, hows: [how], sure }); else { p.hows.push(how); p.sure = p.sure || sure; } };
  const ix = indexOf(S);
  const hit = new Set();
  for (const d of x.duas) for (const s of ix.dua.get(d) || []) hit.add(s);
  for (const e of x.exps) for (const s of ix.exp.get(e) || []) hit.add(s);
  for (const r of x.refs) { const s = ix.id.get(r); if (s) hit.add(s); }
  const thr = mail.threadId ? ix.thread.get(mail.threadId) : null;
  if (thr) for (const id of thr) { const s = ix.id.get(id); if (s) hit.add(s); }
  for (const s of S.items.length > 0 ? [...hit] : []) {
    if (x.duas.includes(s.dua)) add(s, `número de DUA ${s.dua}`, true);
    if (x.exps.includes(s.exp)) add(s, `expediente ${s.exp}`, true);
    if (x.refs.includes(s.id)) add(s, `referencia ${s.id}`, true);
    if (thr && thr.has(s.id)) add(s, 'misma conversación de correo', true);
  }
  if (found.size) return { sure: true, list: [...found.values()] };
  const weak = new Map();
  const addW = (s, how) => { const p = weak.get(s.id); if (!p) weak.set(s.id, { id: s.id, hows: [how], sure: false }); else p.hows.push(how); };
  const open = openShipments(S);
  if (x.bultos != null && x.kg != null) for (const s of open) if (byNum(x.bultos, s.bultos) && byNum(x.kg, s.kg)) addW(s, `bultos (${x.bultos}) y kilos (${x.kg}) coinciden`);
  const doms = mail.direction === 'out' ? [...new Set((mail.to || []).map(domainOf))] : [domainOf(mail.from)];
  for (const dom of doms) if (dom) for (const s of open) if (dom === s.clientDomain || dom === s.providerDomain) addW(s, `${mail.direction === 'out' ? 'destinatario' : 'remitente'} del dominio ${dom}`);
  for (const s of open) { const pl = [...x.plates, ...x.trailers]; if (pl.length && (s.plates || []).some(p => pl.includes(p.value))) addW(s, 'matrícula ya vista en este envío'); }
  return { sure: false, list: [...weak.values()] };
}

function makeEvent(mail, x, shipment) {
  const kind = x.kind;
  const side = mail.direction === 'out' && GESTION_KINDS.has(kind) ? 'gestion' : 'info';
  const label = KIND_LABEL[kind] || KIND_LABEL.info;
  return {
    id: 'ev-' + mail.id, date: mail.date, side, kind, rejection: kind === 'rechazo',
    text: side === 'info' && kind === 'info' ? mail.subject : label,
    mailId: mail.id,
    source: `Correo ${fmt(mail.date)} de ${mail.from}: «${mail.subject}»` + (mail.attachmentsInfo?.length ? ' · Adjuntos: ' + mail.attachmentsInfo.map(a => `${a.name} (${ATT_LABEL[a.status] || a.status}${a.ocr && Object.values(a.ocr.hints || {}).some(v => v.length) ? ' · pista OCR sin verificar: ' + Object.values(a.ocr.hints).flat().join(', ') : ''})`).join(', ') : '')
  };
}

function applyToShipment(S, mail, x, shipment, how, sure) {
  mail.shipmentId = shipment.id; mail.how = how; mail.sure = sure;
  { const c = IDX.get(S); if (c) indexMail(c, mail); }
  const ev = makeEvent(mail, x, shipment);
  if (!sure) { ev.text += ' (relación confirmada por ti)'; }
  // Datos nuevos: nunca se borran los anteriores; si contradicen, se marca corrección.
  const conflicts = [];
  for (const [field, val, label] of [['bultos', x.bultos, 'bultos'], ['kg', x.kg, 'kg']]) {
    if (val != null && shipment[field] != null && val !== shipment[field] && x.kind !== 'rechazo' ) conflicts.push(`${label}: ficha ${shipment[field]}, correo ${val}`);
  }
  if (conflicts.length) { shipment.conflicts = [...(shipment.conflicts || []), { mailId: mail.id, date: mail.date, text: conflicts.join('; ') }]; ev.text += ' · dato distinto al de la ficha'; }
  shipment.plates ||= [];
  for (const p of [...x.plates.map(v => ({ value: v, role: 'camión' })), ...x.trailers.map(v => ({ value: v, role: 'remolque' }))]) {
    const sameRole = shipment.plates.filter(q => q.role === p.role);
    const cur = sameRole.sort((a, b) => ts(b.date) - ts(a.date))[0];
    if (!cur || cur.value !== p.value) {
      shipment.plates.push({ ...p, date: mail.date, mailId: mail.id, replaces: cur?.value || null });
      if (cur) { ev.kind = 'correccion'; ev.text = `Corrección: ${p.role} ${cur.value} pasa a ${p.value}`; ev.corrects = cur.value; }
    }
  }
  shipment.events.push(ev); shipment.events.sort((a, b) => ts(a.date) - ts(b.date));
  shipment.mailIds = [...new Set([...(shipment.mailIds || []), mail.id])];
  if (ev.kind === 'entrega') shipment.status = 'Entregado';
  return ev;
}

// Entra un correo. Devuelve {status, shipmentId?, candidates?, why}.
export function ingestMail(state, mailIn) {
  const S = ensure(state);
  const mail = { attachments: [], ...mailIn };
  if (!mail.id || !mail.date) throw Error('MAIL_NEEDS_ID_AND_DATE');
  if (indexOf(S).mailId.has(mail.id)) return { status: 'duplicate', why: 'Este correo ya estaba registrado.' };
  mail.direction ||= (S.ownDomains || []).includes(domainOf(mail.from)) ? 'out' : 'in';
  const x = extract(mail);
  mail.body = String(mail.body || '').slice(0, 20000);
  mail.facts = { duas: x.duas, exps: x.exps, bultos: x.bultos, kg: x.kg, kind: x.kind };
  const c = candidatesFor(S, x, mail);
  const sure = c.list.filter(l => l.sure);
  const record = () => { S.mails.push(mail); };
  if (sure.length === 1) {
    const s = S.items.find(i => i.id === sure[0].id);
    const how = 'Identificado por ' + sure[0].hows.join(' y ') + (x.bultos != null && byNum(x.bultos, s.bultos) && byNum(x.kg, s.kg) ? '; bultos y kilos también coinciden' : '') + '.';
    record(); applyToShipment(S, mail, x, s, how, true);
    return { status: 'linked', shipmentId: s.id, why: how, sure: true };
  }
  if (sure.length > 1) {
    mail.shipmentId = null; record();
    const p = { mailId: mail.id, candidates: sure.map(l => l.id), why: 'Referencias contradictorias: apuntan a ' + sure.map(l => l.id).join(' y ') + '. Elige tú.' };
    S.pending.push(p); return { status: 'pending', ...p };
  }
  mail.shipmentId = null; record();
  if (!c.list.length) {
    if (!x.duas.length && !x.exps.length && !x.refs.length && !x.plates.length) { mail.ignored = true; return { status: 'ignored', why: 'No coincide con ningún envío, cliente ni proveedor.' }; }
    const p = { mailId: mail.id, candidates: [], why: 'Trae referencias, pero ningún envío conocido las tiene. Revísalo o crea el envío.' };
    S.pending.push(p); return { status: 'pending', ...p };
  }
  const p = { mailId: mail.id, candidates: c.list.map(l => l.id), hints: Object.fromEntries(c.list.map(l => [l.id, l.hows])),
    why: (x.kind === 'rechazo' ? 'Rechazo sin DUA ni expediente. ' : 'Sin referencia exacta. ') + 'Posible coincidencia, no es segura (' + c.list.map(l => l.id + ': ' + l.hows.join(', ')).join(' | ') + '). Otros envíos podrían compartir esos datos.' };
  S.pending.push(p); return { status: 'pending', ...p };
}

export function confirmPending(state, mailId, shipmentId, via = '') {
  const S = ensure(state);
  const i = S.pending.findIndex(p => p.mailId === mailId);
  if (i < 0) throw Error('NOT_PENDING');
  const mail = S.mails.find(m => m.id === mailId);
  if (shipmentId === null) { S.pending.splice(i, 1); mail.ignored = true; mail.how = 'Descartado por ti.'; return { discarded: true }; }
  const s = S.items.find(s => s.id === shipmentId);
  if (!s) throw Error('UNKNOWN_SHIPMENT');
  const x = extract(mail);
  S.pending.splice(i, 1);
  applyToShipment(S, mail, x, s, via === 'ai' ? 'Confirmado por ti a partir de una sugerencia de IA (no verificada).' : 'Confirmado por ti.', false);
  return { shipmentId };
}

// La IA solo PROPONE. Se valida contra los envíos abiertos; nunca asigna ni cambia el estado del envío.
export function attachProposal(state, mailId, prop) {
  const S = ensure(state);
  const p = S.pending.find(p => p.mailId === mailId);
  if (!p || !prop || prop.error) return false;
  const ids = S.items.filter(s => s.status !== 'Entregado').map(s => s.id);
  const id = prop.shipmentId === null ? null : String(prop.shipmentId);
  if (id !== null && !ids.includes(id)) return false;
  p.ai = { shipmentId: id, confidence: ['alta', 'media', 'baja'].includes(prop.confidence) ? prop.confidence : 'baja', reason: String(prop.reason || '').slice(0, 300), model: String(prop.model || '').slice(0, 80), simulated: !!prop.simulated, outsideRules: id !== null && !p.candidates.includes(id), unverified: true };
  return true;
}

export function addShipment(state, d) {
  const S = ensure(state);
  const id = String(d.id || '').trim();
  if (!id) throw Error('SHIPMENT_ID_REQUIRED');
  if (indexOf(S).id.has(id)) throw Error('SHIPMENT_EXISTS');
  const s = { id, route: d.route || '', cargo: d.cargo || '', client: d.client || '', provider: d.provider || '', clientDomain: String(d.clientDomain || '').toLowerCase(), providerDomain: String(d.providerDomain || '').toLowerCase(),
    exp: d.exp ? extract({ subject: d.exp }).exps[0] || d.exp : '', dua: String(d.dua || '').toUpperCase(), bultos: d.bultos != null && d.bultos !== '' ? Number(d.bultos) : null, kg: d.kg != null && d.kg !== '' ? Number(d.kg) : null,
    status: 'Abierto', events: [], mailIds: [], plates: [], created: d.created || new Date().toISOString() };
  S.items.push(s);
  // Reevalúa correos pendientes que ahora puedan ser identificables con certeza.
  for (const p of [...S.pending]) {
    const m = indexOf(S).mailId.get(p.mailId); if (!m) continue;
    const txt = (m.subject + ' ' + m.body).toUpperCase();
    if (!((s.dua && txt.includes(s.dua)) || (s.exp && txt.includes(String(s.exp).toUpperCase())) || txt.includes(s.id.toUpperCase()))) continue;
    const x = extract(m), cand = candidatesFor(S, x, m);
    const sure = cand.list.filter(l => l.sure);
    if (sure.length === 1) { S.pending = S.pending.filter(q => q !== p); applyToShipment(S, m, x, indexOf(S).id.get(sure[0].id), 'Identificado por ' + sure[0].hows.join(' y ') + ' al crear el envío.', true); }
  }
  return s;
}

export function summarize(s) {
  const last = side => s.events.filter(e => e.side === side).sort((a, b) => ts(b.date) - ts(a.date))[0] || null;
  const lastGestion = last('gestion'), lastInfo = last('info');
  const rej = s.events.filter(e => e.rejection).sort((a, b) => ts(b.date) - ts(a.date))[0] || null;
  const resolved = rej && s.events.some(e => ts(e.date) > ts(rej.date) && (e.side === 'gestion' || e.kind === 'levante'));
  return { lastGestion, lastInfo, rejectionOpen: !!rej && !resolved, rejection: rej,
    plateNow: ['camión', 'remolque'].map(r => (s.plates || []).filter(p => p.role === r).sort((a, b) => ts(b.date) - ts(a.date))[0]).filter(Boolean) };
}

export function fmt(d) { try { return new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ''); } catch { return d; } }

// Búsqueda: coincidencia exacta (DUA, expediente, matrícula, referencia) y por palabras.
const HAY = new WeakMap();
const clean = t => norm(t).replace(/[^a-z0-9ñ ]/g, ' ');
function hayOf(s, m) {
  let mh = HAY.get(m);
  if (mh === undefined) { mh = clean([m.subject, m.body, m.from, (m.attachments || []).join(' '), m.attachmentText || ''].join(' ')); HAY.set(m, mh); }
  let sh = HAY.get(s); const key = [s.id, s.exp, s.dua, s.client, s.provider].join(' ');
  if (!sh || sh.key !== key) { sh = { key, h: clean(key) }; HAY.set(s, sh); }
  return sh.h + ' ' + mh;
}
export function search(state, q) {
  const S = ensure(state);
  const raw = String(q || '').trim();
  if (!raw) return null;
  const x = extract({ subject: raw, body: '' });
  const words = norm(raw).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'que', 'en', 'con'].includes(w));
  const out = [];
  for (const s of S.items) {
    const exact = [];
    if (x.duas.includes(s.dua)) exact.push('DUA');
    if (x.exps.includes(s.exp)) exact.push('expediente');
    if (x.refs.includes(s.id)) exact.push('referencia');
    const hits = [];
    const idQuery = x.duas.length || x.exps.length || x.refs.length;
    for (const id of idQuery ? [] : s.mailIds) {
      const m = indexOf(S).mailId.get(id);
      if (!m) continue;
      const hay = hayOf(s, m);
      const hayCompact = hay.replace(/ /g, '');
      const plates = x.plates.concat(x.trailers);
      const okPlates = plates.every(p => hayCompact.includes(norm(p)));
      const plateParts = new Set(plates.flatMap(p => [p.slice(0, 4).toLowerCase(), p.slice(-3).toLowerCase(), p.toLowerCase()]));
      const rest = words.filter(w => !plateParts.has(w) && !/^r$/.test(w));
      if (okPlates && rest.every(w => hay.includes(w.length > 4 ? w.replace(/(es|s)$/, '') : w))) hits.push(m.id);
    }
    const exactHit = exact.length > 0;
    if (exactHit || hits.length) out.push({ shipmentId: s.id, exact, hits: exactHit ? s.mailIds : hits, onlyIdentifier: exactHit });
  }
  return out;
}

export function stats(state) {
  const S = ensure(state);
  return { shipments: S.items.length, mails: S.mails.length, pending: S.pending.length,
    openRejections: S.items.filter(s => summarize(s).rejectionOpen).length };
}

// ---- Datos ficticios para la demo ----
const own = 'operaciones@empresa.example';
export const DEMO_OWN_DOMAIN = 'empresa.example';
export function demoState() {
  const state = { shipments: blankShipments() };
  state.shipments.ownDomains = [DEMO_OWN_DOMAIN];
  const base = [
    { id: 'TR-0412', route: 'Depósito Valencia → Depósito Zaragoza', cargo: 'Camión, 18 palés', client: 'Cliente Norte S.L.', provider: 'Transportes Ejemplo Sur', clientDomain: 'clientenorte.example', providerDomain: 'ejemplosur.example', exp: 'EXP-2611-07', dua: '26ES0000123456', bultos: 18, kg: 9450 },
    { id: 'TR-0415', route: 'Depósito Valencia → Depósito Madrid', cargo: 'Camión, 12 palés', client: 'Cliente Norte S.L.', provider: 'Fletes Demo Centro', clientDomain: 'clientenorte.example', providerDomain: 'fletesdemo.example', exp: 'EXP-2611-09', dua: '26ES0000234567', bultos: 12, kg: 7800 },
    { id: 'TR-0398', route: 'Depósito Bilbao → Depósito Sevilla', cargo: "Contenedor 40'", client: 'Importaciones Modelo S.A.', provider: 'Transportes Ejemplo Sur', clientDomain: 'modelo.example', providerDomain: 'ejemplosur.example', exp: 'EXP-2611-03', dua: '26ES0000345678', bultos: 240, kg: 21300 },
    { id: 'TR-0421', route: 'Depósito Valencia → Depósito Barcelona', cargo: 'Camión, 12 palés', client: 'Importaciones Modelo S.A.', provider: 'Fletes Demo Centro', clientDomain: 'modelo.example', providerDomain: 'fletesdemo.example', exp: 'EXP-2611-11', dua: '26ES0000456789', bultos: 12, kg: 7800 }
  ];
  for (const d of base) addShipment(state, { ...d, created: '2026-11-19T08:00:00+01:00' });
  DEMO_HISTORY.forEach(m => ingestMail(state, m));
  return state;
}
const DEMO_HISTORY = [
  { id: 'd1', threadId: 'th-412', from: 'ana@clientenorte.example', subject: 'Carga TR-0412 martes', date: '2026-11-24T09:12:00+01:00', body: 'Confirmamos carga el martes a las 8:00. Os mandamos matrículas en cuanto las tengamos.' },
  { id: 'd2', threadId: 'th-412', from: 'luis@ejemplosur.example', subject: 'RE: Carga TR-0412 martes', date: '2026-11-25T17:30:00+01:00', body: 'Matrículas del camión: 1234 BCD. Remolque: R-5678-BBC.', attachments: ['matriculas_TR-0412.xlsx'] },
  { id: 'd3', threadId: 'th-412', from: own, subject: 'DUA presentado TR-0412', date: '2026-11-25T12:00:00+01:00', body: 'DUA presentado a aduana: 26ES0000123456.', attachments: ['DUA_presentado.pdf'] },
  { id: 'd4', threadId: 'th-412', from: 'luis@ejemplosur.example', subject: 'RE: Carga TR-0412 martes', date: '2026-11-26T08:05:00+01:00', body: 'CORRECCIÓN: el camión cambia. Nueva matrícula del camión: 4321 KLM. El remolque sigue igual.' },
  { id: 'd5', threadId: 'th-415', from: 'ana@clientenorte.example', subject: 'TR-0415 salida jueves', date: '2026-11-25T10:00:00+01:00', body: 'Necesitamos las matrículas antes del jueves a mediodía.' },
  { id: 'd6', threadId: 'th-398', from: 'luis@ejemplosur.example', subject: 'Matrículas contenedor TR-0398', date: '2026-11-19T14:15:00+01:00', body: 'Adjunto escaneo con matrículas y albarán.', attachments: ['escaneo_001.pdf'] },
  { id: 'd7', threadId: 'th-398', from: 'pedro@modelo.example', subject: 'RE: Matrículas contenedor TR-0398', date: '2026-11-21T12:00:00+01:00', body: 'Entregado en destino, gracias.' },
  { id: 'd8', threadId: 'th-421', from: own, subject: 'Documentación TR-0421', date: '2026-11-26T10:30:00+01:00', body: 'Enviada la documentación del envío TR-0421 a aduana.', attachments: ['documentacion_TR-0421.pdf'] }
];
// Correos que "llegan" durante la demostración (ficticios).
export const DEMO_INBOX = [
  { id: 'n1', threadId: 'th-415', from: 'marta@fletesdemo.example', subject: 'TR-0415 matrículas', date: '2026-11-26T17:02:00+01:00', body: 'Camión asignado: 9876 PQR. Remolque: R-1122-CDD.' },
  { id: 'n2', threadId: 'th-x1', from: 'ana@clientenorte.example', subject: 'Papeles de la carga del jueves', date: '2026-11-26T17:10:00+01:00', body: '¿Tenéis ya los papeles de la carga del jueves?' },
  { id: 'n3', threadId: 'th-x2', from: 'aduana@aviso.example', subject: 'Rechazo de declaración', date: '2026-11-26T17:20:00+01:00', body: 'Rechazada la declaración 26ES0000123456: error en el código de la partida. 18 bultos, 9.450 kg.' },
  { id: 'n4', threadId: 'th-x3', from: 'aduana@aviso.example', subject: 'Rechazo de declaración', date: '2026-11-26T17:25:00+01:00', body: 'Rechazada una declaración por falta de documento de acompañamiento. 12 bultos, 7.800 kg.' },
  { id: 'n5', threadId: 'th-x2', from: own, subject: 'RE: Rechazo de declaración 26ES0000123456', date: '2026-11-26T17:40:00+01:00', body: 'Subsanación: corregido el código de partida y reenviamos la declaración 26ES0000123456.' },
  { id: 'n6', threadId: 'th-x4', from: 'curso@formacion.example', subject: 'Curso de verano', date: '2026-11-26T17:15:00+01:00', body: 'Descubre nuestros cursos.' }
];
