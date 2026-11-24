// Validación y construcción de .env, sin efectos secundarios. Usada por setup, doctor y tests.
export const REDIRECT = 'http://localhost:4875/auth/callback';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
export function parseEnv(text) {
  const env = {};
  for (const l of text.split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
  return env;
}
export function buildEnv(a) {
  const errors = [];
  const useMs = !!a.client;
  const tenant = a.tenant || 'consumers';
  if (useMs) {
    if (!/^[a-zA-Z0-9.-]+$/.test(tenant)) errors.push('tenant no válido');
    if (!/^[0-9a-fA-F-]{36}$/.test(a.client)) errors.push('client ID no es un UUID');
    if (a.secret && /\s/.test(a.secret)) errors.push('el secreto no puede contener espacios');
  }
  const on = useMs && a.intake === true && a.approved === true;
  if (on && !ISO.test(a.since || '')) errors.push('fecha ISO UTC no válida (2026-11-24T00:00:00Z)');
  if (on && !a.folder) errors.push('falta carpeta');
  const useClaude = !!a.claudeKey;
  const max = Number(a.claudeMax || 600);
  if (useClaude) {
    if (a.claudeAccept !== true) errors.push('para guardar una clave de Claude debes aceptar el gasto de la API y el envío del texto que confirmes');
    if (!/^[A-Za-z0-9._~+\/=-]{20,300}$/.test(a.claudeKey)) errors.push('la clave de Claude tiene formato no válido (sin espacios, 20-300 caracteres)');
    if (!/^[A-Za-z0-9._:-]{3,80}$/.test(a.claudeModel || '')) errors.push('indica el nombre exacto del modelo que tu cuenta tiene habilitado');
    if (!Number.isInteger(max) || max < 100 || max > 1000) errors.push('tokens máximos de salida: entre 100 y 1000');
  }
  if (!useMs && !useClaude) errors.push('no hay nada que guardar: indica Client ID de Microsoft y/o clave de Claude');
  if (errors.length) return { errors };
  const lines = [
    `GRAPH_ENABLED=${useMs}`, `MS_TENANT_ID=${useMs ? tenant : ''}`, `MS_CLIENT_ID=${useMs ? a.client : ''}`, `MS_CLIENT_SECRET=${useMs ? (a.secret || '') : ''}`,
    `MS_REDIRECT_URI=${REDIRECT}`, 'PORT=4875',
    `CLAUDE_ENABLED=${useClaude}`, `CLAUDE_DATA_APPROVED=${useClaude}`, `ANTHROPIC_API_KEY=${useClaude ? a.claudeKey : ''}`,
    `CLAUDE_MODEL=${useClaude ? a.claudeModel : ''}`, `CLAUDE_MAX_OUTPUT_TOKENS=${useClaude ? max : 600}`,
    'INTEGRATION_MOCK=false',
    `APP_DATA_PATH=${useMs ? 'data/real.json' : 'data/local.json'}`, `MAIL_INTAKE_ENABLED=${on}`, `MAIL_INTAKE_APPROVED=${on}`,
    `MAIL_FOLDER_ID=${on ? a.folder : ''}`, `MAIL_START_AFTER=${on ? a.since : ''}`, 'MAIL_POLL_MINUTES=60',
  ];
  return { errors, text: lines.join('\n') + '\n' };
}
// Devuelve [{level:'ok'|'warn'|'fail', msg}]. Nunca incluye valores secretos.
export function validateConfig(env) {
  const r = [], add = (level, msg) => r.push({ level, msg });
  if (env.GRAPH_ENABLED !== 'true') { add('warn', 'GRAPH_ENABLED no es true: arrancará sin Microsoft'); }
  else {
    env.INTEGRATION_MOCK === 'true' ? add('fail', 'INTEGRATION_MOCK=true es incompatible con Microsoft real') : add('ok', 'Modo real (sin simulación)');
    /^[a-zA-Z0-9.-]+$/.test(env.MS_TENANT_ID || '') ? add('ok', 'Tenant: ' + env.MS_TENANT_ID) : add('fail', 'MS_TENANT_ID vacío o no válido');
    /^[0-9a-fA-F-]{36}$/.test(env.MS_CLIENT_ID || '') ? add('ok', 'Client ID con formato UUID') : add('fail', 'MS_CLIENT_ID no es un UUID');
    env.MS_CLIENT_SECRET ? add('ok', `Cliente confidencial: secreto presente (${env.MS_CLIENT_SECRET.length} caracteres, no mostrado)`) : add('ok', 'Cliente público con PKCE: sin secreto');
    !env.MS_REDIRECT_URI || env.MS_REDIRECT_URI === REDIRECT ? add('ok', 'Callback ' + REDIRECT) : add('fail', 'El callback debe ser ' + REDIRECT);
    if (env.MAIL_INTAKE_ENABLED === 'true') {
      env.MAIL_INTAKE_APPROVED === 'true' && env.MAIL_FOLDER_ID && ISO.test(env.MAIL_START_AFTER || '')
        ? add('ok', `Receptor: carpeta ${env.MAIL_FOLDER_ID}, desde ${env.MAIL_START_AFTER}`) : add('fail', 'Receptor activado sin aprobación, carpeta o fecha ISO UTC');
    } else add('warn', 'Receptor automático apagado: solo consultas manuales desde Conexiones');
  }
  if (env.CLAUDE_ENABLED === 'true') {
    env.INTEGRATION_MOCK === 'true' ? add('fail', 'Claude no puede activarse en modo simulación') : 0;
    env.ANTHROPIC_API_KEY && env.CLAUDE_MODEL && env.CLAUDE_DATA_APPROVED === 'true'
      ? add('warn', `Claude activado (modelo ${env.CLAUDE_MODEL}, clave presente, no mostrada): cada análisis confirmado consume tu API de pago y envía ese texto a Anthropic`)
      : add('fail', 'Claude activado sin clave, modelo o aprobación de datos');
  } else add('ok', 'Claude apagado (no se envía nada a Anthropic)');
  return r;
}
