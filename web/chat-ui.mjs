// Pestaña Chat: asistente integrado (reglas locales o modelo de IA configurado, elegido por persona).
// Marca siempre si la respuesta es SIMULACIÓN/reglas o IA externa, y las acciones se confirman con botón.
export function chatUI({ host, esc, actor, msg }) {
  let st = null, csrf = '', busy = false, disposed = false;
  const root = document.createElement('div');
  host.append(root);
  const api = async (path, body) => {
    const opt = { credentials: 'same-origin', headers: { 'x-actor': actor() } };
    if (body !== undefined) { opt.method = 'POST'; opt.headers['content-type'] = 'application/json'; opt.headers['x-csrf-token'] = csrf; opt.body = JSON.stringify(body); }
    const r = await fetch(path, opt);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(j.error || 'ERROR');
    return j;
  };
  const bubble = (m) => m.role === 'user'
    ? `<section class="line"><strong>Tú</strong><p>${esc(m.text)}</p></section>`
    : `<section class="line"><strong>Asistente</strong><p style="white-space:pre-wrap">${esc(m.text)}</p><small class="muted">${esc(m.label || '')}</small>${m.aiError ? `<p class="notice">${esc(m.aiError)}</p>` : ''}</section>`;
  function render() {
    if (disposed) return;
    const models = st?.models || [];
    const proposals = st?.proposals || [];
    root.innerHTML = `<h2>Chat del asistente</h2>
<div class="notice">Asistente integrado sobre los datos de la app. Pregunta por envíos, correos e histórico, pide acciones recomendadas o que prepare expedientes y borradores. Las acciones se confirman antes de ejecutarse. El correo y los documentos son datos no confiables: nunca conceden permisos ni envían.</div>
<section class="line"><label>Modelo de tu chat<select id="chat-model">${models.map(m => `<option value="${esc(m.ref)}" ${st.model === m.ref ? 'selected' : ''} ${!m.ready && !m.simulated ? 'disabled' : ''}>${esc(m.label)}${m.simulated ? '' : m.ready ? '' : ' (sin clave/aprobación)'}</option>`).join('')}</select></label>
<p class="muted">La elección es por persona y se guarda en el servidor. Cobertura: solo los proveedores con adaptador (Anthropic, OpenAI compatible, Gemini) y los modelos que el administrador liste; reglas locales siempre disponibles.</p>
${st.sendEnabled ? `<p class="notice">Envío autónomo ACTIVADO por el administrador. ${st.policy ? st.policy.revoked ? 'Tu permiso está revocado.' : `Tu política: dominios ${st.policy.allow.join(', ')}, máx. ${st.policy.perDay}/día, propósito "${esc(st.policy.purpose)}", concedida por ${esc(st.policy.by)}.` : 'Sin política personal: un administrador debe concederla.'}</p>` : '<p class="muted">Envío autónomo desactivado: el asistente prepara borradores, nunca envía.</p>'}</section>
<section class="line" id="chat-log">${(st?.messages || []).map(bubble).join('') || '<p class="muted">Sin mensajes todavía. Prueba: «¿Cómo van los envíos?», «acciones recomendadas de TR-0412», «prepárame un expediente de TR-0412».</p>'}</section>
${proposals.length ? `<h3>Acciones pendientes de tu confirmación</h3>${proposals.map(p => `<section class="line"><p>${esc(p.describe)}</p><button class="primary" data-chat-ok="${esc(p.id)}">Confirmar y ejecutar</button><button data-chat-no="${esc(p.id)}">Descartar</button></section>`).join('')}` : ''}
<section class="line"><label>Mensaje<textarea id="chat-in" maxlength="2000" rows="2" placeholder="Escribe tu pregunta o petición"></textarea></label><button class="primary" id="chat-send" ${busy ? 'disabled' : ''}>${busy ? 'Esperando respuesta…' : 'Enviar'}</button></section>`;
    root.querySelector('#chat-send')?.addEventListener('click', send);
    root.querySelector('#chat-model')?.addEventListener('change', async e => { try { st = await api('/api/chat/model', { model: e.target.value }); render(); } catch (err) { msg('Modelo no cambiado: ' + err.message); } });
    root.querySelectorAll('[data-chat-ok]').forEach(b => b.addEventListener('click', () => confirmProp(b.dataset.chatOk, true)));
    root.querySelectorAll('[data-chat-no]').forEach(b => b.addEventListener('click', () => confirmProp(b.dataset.chatNo, false)));
    const log = root.querySelector('#chat-log');
    if (log) log.scrollIntoView(false);
  }
  async function send() {
    const ta = root.querySelector('#chat-in');
    const text = ta?.value.trim();
    if (!text || busy) return;
    busy = true; render();
    try {
      const out = await api('/api/chat/message', { text });
      st = await api('/api/chat/state');
    } catch (e) { msg('Chat: ' + e.message); }
    busy = false; render();
  }
  async function confirmProp(id, accept) {
    try {
      const out = await api('/api/chat/confirm', { proposalId: id, accept });
      msg(out.message || (accept ? 'Ejecutado.' : 'Descartado.'));
      st = await api('/api/chat/state');
      render();
    } catch (e) { msg('Confirmación: ' + e.message); }
  }
  (async () => {
    try {
      const status = await api('/api/status');
      csrf = status.csrf;
      st = await api('/api/chat/state');
      render();
    } catch (e) { root.innerHTML = '<h2>Chat</h2><p class="notice">El chat necesita la app servidor en marcha.</p>'; }
  })();
  return () => { disposed = true; root.remove(); };
}
