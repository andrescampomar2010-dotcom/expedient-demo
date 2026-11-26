// Estado y alertas del receptor de correo. Nunca incluye texto del error original (podría llevar datos o tokens): solo códigos.
const KNOWN=['GRAPH_THROTTLED_STOPPED','DELTA_EXPIRED_MANUAL_RESET_REQUIRED','LOCAL_SESSION_EXPIRED','RECEIVER_SCOPE_CHANGED_USE_NEW_WORKSPACE'];
export function failedStatus(err,now=new Date()){
 const code=KNOWN.includes(err?.message)?err.message:'STOPPED_REVIEW_CONFIGURATION_OR_REAUTHENTICATE';
 return{enabled:true,running:false,state:code,lastRun:now.toISOString(),alert:true,alertSince:now.toISOString(),
  action:code==='LOCAL_SESSION_EXPIRED'?'Volver a iniciar sesión con Microsoft para reanudar la lectura.':code==='GRAPH_THROTTLED_STOPPED'?'Microsoft limitó las peticiones. Esperar y reanudar manualmente.':code==='DELTA_EXPIRED_MANUAL_RESET_REQUIRED'?'El cursor caducó: hay que reiniciar la lectura de forma manual.':'Revisar la configuración y volver a iniciar sesión.'};
}
export const alertLine=s=>`ALERTA receptor de correo detenido: ${s.state} (${s.alertSince})`;
export function healthOf(intake){const bad=!!intake?.alert;return{code:bad?503:200,body:{ok:!bad,receiver:bad?{state:intake.state,since:intake.alertSince,action:intake.action}:undefined}}}
