// Adaptador de la pantalla «Envíos» al almacén por registro del servidor: pide solo la página, la ficha o los pendientes que se ven.
export function createRemote(S, fetchJson) {
  const r = { stats: { shipments: 0, mails: 0, pending: 0, openRejections: 0 }, next: null, results: null };
  let csrf = '';
  const get = path => fetch(path, { credentials: 'same-origin' }).then(async x => { const j = await x.json(); if (!x.ok) throw Error(j.error || 'ERROR'); return j; });
  const putItem = (cache, s) => { const i = cache.items.findIndex(x => x.id === s.id); if (i >= 0) cache.items[i] = s; else cache.items.push(s); };
  const putMail = (cache, m) => { if (m && !cache.mails.some(x => x.id === m.id)) cache.mails.push(m); };
  r.load = async ({ sub, sel, q, more }, cache) => {
    r.stats = await get('/api/shipments/stats');
    if (sub === 'list') {
      const j = await get('/api/shipments/list?limit=50' + (more && r.next ? '&after=' + encodeURIComponent(r.next) : ''));
      if (!more) cache.items = [];
      for (const s of j.items) putItem(cache, s);
      r.next = j.next;
    } else if (sub === 'detail' && sel) {
      const j = await get('/api/shipments/item?id=' + encodeURIComponent(sel));
      putItem(cache, j.shipment); for (const m of j.mails) putMail(cache, m);
    } else if (sub === 'pending') {
      const j = await get('/api/shipments/pending?limit=100');
      cache.pending = j.pending.map(({ mail, ...p }) => { putMail(cache, mail); return p; });
    } else if (sub === 'search') {
      if (!String(q || '').trim()) { r.results = null; return; }
      const j = await get('/api/shipments/search?q=' + encodeURIComponent(q));
      r.results = j.results; for (const x of j.results) if (x.head) putItem(cache, x.head);
    }
  };
  r.op = async body => {
    if (!csrf) csrf = (await get('/api/status')).csrf;
    const x = await fetch('/api/shipments/op', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(body) });
    const j = await x.json(); if (!x.ok) throw Error(j.error || 'ERROR'); return j;
  };
  r.openHeads = async () => (await get('/api/shipments/list?limit=200&open=1')).items;
  return r;
}
