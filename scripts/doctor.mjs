// Comprobación local de la configuración. No imprime secretos.
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv, validateConfig } from './config.mjs';
const tag = { ok: '  OK    ', warn: '  AVISO ', fail: '  FALLA ' };
let fails = 0; const say = (l, m) => { if (l === 'fail') fails++; console.log(tag[l] + m); };
Number(process.versions.node.split('.')[0]) >= 22 ? say('ok', 'Node ' + process.versions.node) : say('fail', 'Se necesita Node 22 o superior');
existsSync('node_modules/@azure/msal-node') && existsSync('node_modules/exceljs') ? say('ok', 'Dependencias instaladas') : say('fail', 'Ejecuta npm ci');
if (!existsSync('.env')) say('fail', 'No hay .env: ejecuta npm run setup');
else {
  const env = parseEnv(readFileSync('.env', 'utf8'));
  for (const x of validateConfig(env)) say(x.level, x.msg);
  if (env.GRAPH_ENABLED === 'true' && /^[a-zA-Z0-9.-]+$/.test(env.MS_TENANT_ID || '')) {
    try {
      const r = await fetch(`https://login.microsoftonline.com/${env.MS_TENANT_ID}/v2.0/.well-known/openid-configuration`, { signal: AbortSignal.timeout(8000) });
      r.ok ? say('ok', 'Microsoft reconoce ese tenant (no valida cliente ni permisos)') : say('fail', 'Microsoft no reconoce el tenant (HTTP ' + r.status + ')');
    } catch { say('warn', 'Sin red para comprobar el tenant'); }
  }
}
console.log(fails ? `\n${fails} problema(s). Corrige antes de arrancar.` : '\nConfiguración coherente. La prueba real es iniciar sesión en Conexiones.');
process.exit(fails ? 1 : 0);
