# Conectar tus cuentas

Expedient se usa sin cuentas (`npm run demo:simulated`). Conectar Microsoft es opcional y solo lectura. Nada de tu configuración va a Git: `.env` y `data/` están ignorados.

## Qué NO puede hacer esta distribución por ti
Para leer correo de Microsoft, una app debe estar registrada en Microsoft Entra. Esta distribución no incluye ninguna app registrada por su autor (no hay Client ID compartido ni intermediario), así que cada persona registra la suya (una vez) y pega su Client ID. Es una limitación de cómo se publica este código, no una regla universal de OAuth: quien publique una app registrada podría ahorrar este paso a sus usuarios.

No necesitas Microsoft para probar: `npm start` o `npm run demo:simulated` funcionan sin cuentas.

Requisitos según la documentación oficial de Microsoft (https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app): una cuenta de Azure con suscripción activa (se puede crear gratis) y al menos el rol Application Developer en un directorio de Microsoft Entra. Para cuentas personales, Microsoft dice que se puede usar un directorio existente o crear uno nuevo (https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-create-new-tenant). Hay usuarios con cuenta personal sin directorio que no consiguen registrar apps (ejemplo: https://learn.microsoft.com/en-us/answers/questions/5678268/register-an-application-to-access-my-personal-oned). No se ha comprobado que funcione para tu cuenta concreta. Con una cuenta de empresa, el administrador puede bloquear el consentimiento o el registro: pide permiso, no uses correo de trabajo sin autorización.

## Pasos
1. Registra una aplicación en https://entra.microsoft.com (Aplicaciones, Registros de aplicaciones). Tipo de cuenta: según el correo que vayas a leer (personal o de tu directorio).
2. Cliente público (recomendado, sin secreto): plataforma «Aplicaciones móviles y de escritorio», URI `http://localhost:4875/auth/callback`, y activa «Permitir flujos de cliente público». La app usa código de autorización con PKCE, que no necesita secreto en un programa que corre en tu equipo (https://learn.microsoft.com/en-us/entra/identity-platform/reply-url describe las excepciones de localhost). Si tu registro es de tipo «Web», crea un secreto de cliente y pégalo en la pantalla de configuración.
3. Permisos delegados de Microsoft Graph: `Mail.Read`, `Files.Read`. Nada más.
4. Arranca la app (`npm ci`, `npm start`), abre http://localhost:4875/setup, pega tenant y Client ID y guarda. Reinicia el servidor.
5. En Conexiones, inicia sesión con Microsoft.

Alternativa sin navegador: `npm run setup` y `npm run doctor`.

## Estado de la verificación
Probado con tests automáticos y simulaciones: configuración, guardado privado, arranque en modo cliente público y confidencial, redirección a Microsoft con PKCE. NO probado con una cuenta real: registro, consentimiento, lectura de correo/OneDrive. Tu primer inicio de sesión es esa prueba.

## Claude (opcional, con coste)
Necesita una clave de API de Anthropic con saldo, que es un gasto tuyo (una suscripción de chat no la incluye). Se configura en la misma pantalla /setup (clave oculta, modelo exacto, casilla de aceptación del gasto y del envío de texto); no se activa sin esas tres cosas. La clave solo se guarda en tu `.env` local, nunca se muestra de vuelta. No hay tope monetario en la app: fija un límite en la consola de Anthropic. Ver docs/CLAUDE.md.

## Datos reales y datos de ejemplo
Cada modo usa su propio fichero (`data/simulation.json`, `data/local.json`, `data/real.json`) y la app rechaza arrancar si un fichero se usó en otro modo. Con Microsoft conectado se oculta «Cargar ejemplo ficticio» para no mezclar datos. El token de Microsoft vive solo en la memoria del servidor (se pierde al reiniciar) y el servidor solo escucha en 127.0.0.1. `data/` contiene tus expedientes: no lo subas.

## Requisitos
Node.js 22 o superior instalado (nodejs.org). Windows: `iniciar_conectado.bat` no se ha ejecutado en Windows en esta revisión.

## Límites
Solo localhost, un usuario, sin envío de correo. No cargues documentos de terceros o de tu empresa sin autorización.
