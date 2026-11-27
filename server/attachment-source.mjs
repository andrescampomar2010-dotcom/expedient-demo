// Fuente autorizada de binarios de adjuntos para el chat: descarga bajo demanda desde Microsoft
// Graph con la sesión del propio usuario que confirma la acción (nunca otra cuenta ni otra persona).
// El chat no descarga "del buzón" por su cuenta: usa esta ruta, con la autorización ya concedida
// a la app (scope Mail.Read), validación de identificadores y topes antes y después de descargar.
// El transporte graph() del servidor limita la respuesta JSON a 3 MB, así que el tope efectivo aquí
// es 2 MB por archivo (base64 ~2.7 MB), por debajo del tope de 5 MB del almacén del chat.
const ID_RE = /^[A-Za-z0-9._=-]{1,180}$/; // los id reales de Graph llevan base64 con relleno '='; '=' es inocuo tras encodeURIComponent

export async function fetchGraphAttachment({ findMail, mailId, name, get, maxBytes = 2e6 }) {
  if (!ID_RE.test(String(mailId || ''))) return null; // identificador no válido: ruta Graph nunca construida
  const mail = findMail(mailId);
  if (!mail) return null; // el correo ya no está indexado: nada que buscar
  const want = String(name || '');
  if (!want || want.length > 200) return null;
  let list;
  try {
    list = await get('/me/messages/' + encodeURIComponent(mailId) + '/attachments?$select=id,name,size,contentType,isInline&$top=50');
  } catch { return null; } // Graph inaccesible, sesión caída o correo borrado: se declara SIN BINARIO
  const atts = (list?.value || []).filter(a => a['@odata.type'] === '#microsoft.graph.fileAttachment' && !a.isInline);
  const att = atts.find(x => x.name === want) || atts.find(x => String(x.name || '').toLowerCase() === want.toLowerCase());
  if (!att || !ID_RE.test(String(att.id || ''))) return null;
  if (typeof att.size === 'number' && att.size > maxBytes) return null; // tope ANTES de descargar
  let full;
  try {
    full = await get('/me/messages/' + encodeURIComponent(mailId) + '/attachments/' + encodeURIComponent(att.id));
  } catch { return null; }
  if (typeof full?.contentBytes !== 'string' || !full.contentBytes) return null;
  const bytes = Buffer.from(full.contentBytes, 'base64');
  if (!bytes.length || bytes.length > maxBytes) return null; // y DESPUÉS de descargar
  return { bytes, contentType: att.contentType || 'application/octet-stream' };
}
