// Asistente local que crea .env (ignorado por Git, permisos 600). Nada se envía a ningún sitio.
// Interactivo, o con --from-env (SETUP_TENANT, SETUP_CLIENT, SETUP_SECRET opcional, SETUP_INTAKE, SETUP_APPROVED, SETUP_FOLDER, SETUP_SINCE, SETUP_FORCE).
import { createInterface } from 'node:readline/promises';
import { writeFileSync, existsSync, chmodSync } from 'node:fs';
import { Writable } from 'node:stream';
import { buildEnv } from './config.mjs';

let a;
if (process.argv.includes('--from-env')) {
  const e = process.env;
  if (existsSync('.env') && e.SETUP_FORCE !== 'true') { console.error('Ya existe .env. Usa SETUP_FORCE=true para sobrescribir.'); process.exit(1); }
  a = { tenant: e.SETUP_TENANT, client: e.SETUP_CLIENT, secret: e.SETUP_SECRET, folder: e.SETUP_FOLDER || 'inbox', since: e.SETUP_SINCE, intake: e.SETUP_INTAKE === 'true', approved: e.SETUP_APPROVED === 'true', claudeKey: e.SETUP_CLAUDE_KEY, claudeModel: e.SETUP_CLAUDE_MODEL, claudeMax: e.SETUP_CLAUDE_MAX, claudeAccept: e.SETUP_CLAUDE_ACCEPT === 'true' };
} else {
  let muted = false;
  const out = new Writable({ write(c, en, cb) { if (!muted) process.stdout.write(c, en); cb(); } });
  const rl = createInterface({ input: process.stdin, output: out, terminal: true });
  const ask = async (q, hidden = false) => { process.stdout.write(q); muted = hidden; const x = (await rl.question('')).trim(); muted = false; if (hidden) process.stdout.write('\n'); return x; };
  if (existsSync('.env') && (await ask('Ya existe .env. ¿Sobrescribir? (s/N) ')).toLowerCase() !== 's') { rl.close(); process.exit(0); }
  console.log('\nExpedient: conexión Microsoft de solo lectura (Mail.Read, Files.Read). Ver docs/CONECTAR.md.\n');
  const tenant = (await ask('Tenant (consumers para cuenta personal, o ID del directorio) [consumers]: ')) || 'consumers';
  const client = await ask('Application (client) ID (vacío = sin Microsoft): ');
  const secret = await ask('Secreto de cliente, déjalo vacío si registraste cliente público (no se mostrará): ', true);
  const today = new Date().toISOString().slice(0, 10) + 'T00:00:00Z';
  const intake = (await ask('¿Activar receptor automático de correo? Leerá una carpeta cada hora. (s/N) ')).toLowerCase() === 's';
  let folder = 'inbox', since = today, approved = false;
  if (intake) {
    folder = (await ask('Carpeta [inbox]: ')) || 'inbox';
    since = (await ask(`Desde (ISO UTC) [${today}]: `)) || today;
    approved = (await ask('Confirmas que la cuenta y carpeta son tuyas y autorizas su lectura (s/N): ')).toLowerCase() === 's';
  }
  let claudeKey = '', claudeModel = '', claudeAccept = false;
  if ((await ask('¿Configurar Claude (API de pago, la pagas tú)? (s/N) ')).toLowerCase() === 's') {
    claudeKey = await ask('Clave API de Anthropic (no se mostrará): ', true);
    claudeModel = await ask('Modelo exacto habilitado en tu cuenta: ');
    claudeAccept = (await ask('Aceptas el gasto por uso y el envío del texto que confirmes a Anthropic (s/N): ')).toLowerCase() === 's';
  }
  rl.close();
  a = { tenant, client, secret, folder, since, intake, approved, claudeKey, claudeModel, claudeAccept };
}
const r = buildEnv(a);
if (r.errors.length) { console.error('Datos no válidos: ' + r.errors.join('; ')); process.exit(1); }
writeFileSync('.env', r.text, { mode: 0o600 });
try { chmodSync('.env', 0o600); } catch {}
console.log('.env creado. Siguiente: npm run doctor y después npm run demo');
