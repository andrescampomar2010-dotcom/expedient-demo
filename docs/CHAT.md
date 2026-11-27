# Chat con asistente integrado

Pestaña **Chat** de la app servidor. Un asistente responde sobre los datos de la app (envíos, correos, histórico, conocimiento), propone acciones y, si la administración lo autoriza expresamente, envía respuestas. Todo lo demás sigue igual: la revisión es humana y nada se presenta ni declara.

## Qué puede hacer

- Responder «¿cómo van los envíos?» con el resumen de reglas (envíos, correos, pendientes, rechazos abiertos).
- «Acciones recomendadas de TR-0412»: ficha del envío, última gestión/información, rechazos abiertos, matrículas y acciones sugeridas por reglas.
- «Correos e hilos de TR-0412»: los correos registrados del envío con fecha, remitente y adjuntos.
- «Prepárame un expediente de TR-0412»: propone crear un expediente en borrador desde el correo más reciente con adjuntos. **Qué conserva de los adjuntos: lo que el receptor ya descargó y leyó** (nombres, estado de lectura por adjunto y el texto extraído, tope del receptor de 8000 caracteres) **y, si la conservación de binarios está activada y autorizada, los archivos originales** descargados por la ruta autorizada de Graph con la sesión de la persona que confirma (ver «Conservación de binarios de adjuntos»). Lo que no se pueda conservar queda destacado en su documento como SIN BINARIO DISPONIBLE. El expediente queda en borrador, sin revisión.
- «Prepárame un borrador»: plantilla local de reglas en Avisos y borradores. **No es texto generado por IA** y no se envía.
- «Envía una respuesta»: solo con la cadena de autoridad completa (ver abajo).

Las acciones se proponen en el chat y solo se ejecutan al pulsar **Confirmar y ejecutar**. La propuesta queda ligada a la persona que la pidió: otra persona no puede confirmarla ni verla.

## Modelo elegible por persona

Cada persona elige el modelo de su chat (selector en la pestaña). La elección se guarda en el servidor por usuario local (con `APP_AUTH=local`) o por actor ficticio (demo sin auth, que no es autenticación).

**Cobertura exacta: no es "cualquier modelo".** Solo los proveedores con adaptador escrito y los modelos que el administrador liste:

| Proveedor | Endpoint | Clave | Base configurable |
|---|---|---|---|
| Reglas locales (SIMULACIÓN) | sin red, siempre disponible | — | — |
| `anthropic` | `POST https://api.anthropic.com/v1/messages` | `ANTHROPIC_API_KEY` | no |
| `openai` | `POST {base}/chat/completions` | `OPENAI_API_KEY` | `OPENAI_BASE_URL` (def. `https://api.openai.com/v1`; vale un servidor compatible local, p. ej. http://localhost:11434/v1) |
| `gemini` | `POST {base}/v1beta/models/{model}:generateContent` | `GEMINI_API_KEY` | `GEMINI_BASE_URL` (def. `https://generativelanguage.googleapis.com`) |

Formas de petición verificadas contra la documentación oficial el 27/11/2026 (platform.claude.com/docs/en/api/http/messages, github.com/openai/openai-openapi, ai.google.dev/api/generate-content).

Configuración (`CHAT_MODELS=anthropic:claude-x,openai:gpt-y,gemini:gemini-z`) + `CHAT_DATA_APPROVED=true` + la clave del proveedor. Sin clave o sin aprobación, el modelo aparece deshabilitado. Las llamadas reales consumen la API de pago correspondiente: tope de 30 llamadas de redacción por persona y día.

**Con modelo real, el modelo solo redacta.** La recuperación de datos y las acciones las hacen las reglas del servidor; el modelo recibe el contexto marcado como `untrusted_context` con instrucciones de ignorar cualquier orden dentro de los datos. Si el modelo falla, responde el asistente de reglas con aviso.

**Rotulado honesto:** las respuestas de reglas llevan la etiqueta «SIMULACIÓN · asistente de reglas locales, sin IA externa»; las redactadas por un modelo, «Redactado por {modelo} (IA externa) sobre datos y acciones verificados por las reglas del servidor». Los borradores de plantilla nunca se presentan como generados por IA.

## Seguridad (backend, no solo prompt)

- Historial y propuestas aislados por persona; la persona se deriva de la sesión autenticada, nunca de una cabecera manipulable. IDs de propuesta ajenos responden 404.
- Rol `lector`: puede preguntar (lecturas autorizadas) pero no ejecutar acciones (confirmación 403) ni conceder políticas.
- El texto de correos y documentos es dato no confiable: no concede permisos, no cambia destinatarios y no envía (hay prueba negativa de esto).
- CSRF + origen en todos los POST, como el resto de la app.

## Envío autónomo de respuestas

Apagado por defecto. Para que un envío ocurra deben cumplirse TODAS:

1. `MAIL_SEND_ENABLED=true` y `MAIL_SEND_APPROVED=true` (administrador del sistema, en `.env`).
2. Cuenta configurada y autorizada: con Graph real, el scope `Mail.Send` solo se pide cuando (1) está activo; sin cuenta autenticada, el envío falla cerrado. En modo simulación, la salida es una bandeja simulada marcada SIMULACIÓN.
3. Política por persona concedida por un `admin` (endpoint `/api/chat/policy`): dominios de destinatario permitidos, propósito declarado, tope diario (1–50). Revocable con efecto inmediato; concesiones y revocaciones quedan auditadas.
4. Confirmación: por defecto, confirmación explícita de cada envío en el chat. Si la política por persona lleva `auto:true` (lo concede el admin, revocable y auditado), el asistente ejecuta las respuestas que caen dentro del alcance concedido SIN confirmación individual: autonomía real, apagada por defecto, con la misma cadena de comprobaciones (dominio, tope diario, idempotencia) y cada ejecución auditada.
5. Idempotencia: cada propuesta se ejecuta una sola vez; reintentos responden "ya resuelta" sin duplicar.
6. Auditoría de cada intento (SENT/DENIED, persona, destinatario, asunto, motivo) consultable por admin en `/api/chat/audit`.

Un botón de admin y una cuota no bastan: sin política por persona no hay ni propuesta de envío; un destinatario fuera de la lista se rechaza antes de proponer; con `auto` revocado o fuera de alcance no se ejecuta nada.

## Cómo trabaja el modelo de IA real

No es un chat libre contra el buzón: la RECUPERACIÓN y las ACCIONES las ejecutan siempre las reglas del servidor. El modelo (1) recibe la pregunta con el contexto ya recuperado (marcado como datos no confiables), (2) puede investigar más con 4 herramientas que ejecutan las reglas (`buscar_envios`, `detalle_envio`, `hilo_envio`, `correo`; protocolo JSON de una línea, máx. 3 rondas, cada ronda es una llamada real al proveedor) y (3) redacta la respuesta citando fuentes. Las acciones (expediente, borrador, envío) las proponen las reglas y las confirma la persona o la política `auto`. Verificado con transportes ficticios en tests/chat-agents.test.mjs: multiturno, pregunta libre, detalle de fuentes/histórico y selección de modelo aislada por persona. Ninguna prueba llama a una API real.

## Fuentes navegables

Las respuestas van en lenguaje natural primero y las fuentes después, como botones separados bajo el mensaje. Una fuente de correo abre la ficha del envío y resalta el correo exacto dentro de ella (la UI marca cada bloque de correo con `data-mail-id`); si el correo o el envío ya no están indexados, la interfaz lo dice en lugar de abrir otra cosa. Una fuente de ficha abre la ficha del envío.

## Conservación de binarios de adjuntos

Desactivada por defecto (`CHAT_ATTACH_STORE=false`). Activada exige además una fuente autorizada configurada en el servidor; el chat nunca descarga nada nuevo del buzón por su cuenta. La fuente implementada es `server/attachment-source.mjs`: descarga bajo demanda desde Microsoft Graph con **la sesión de la misma persona que confirma la propuesta** (la autorización `Mail.Read` ya concedida a la app; nunca otra cuenta), validando identificadores de correo y adjunto antes de construir cada ruta, con coincidencia exacta de nombre de archivo y tope de tamaño comprobado **antes** (metadatos) y **después** (bytes reales) de descargar. El transporte `graph()` del servidor limita la respuesta JSON a 3 MB, así que el tope efectivo por archivo es 2 MB, por debajo del tope de 5 MB del almacén. Solo se conservan adjuntos de tipo archivo (no inline ni adjuntos de elemento). Topes duros del almacén: 5 MB por archivo, 40 MB y 200 archivos en total. Cada documento del expediente declara su estado: binario conservado (archivo, bytes, sha256), SIN BINARIO DISPONIBLE (la fuente no lo tiene o falló la descarga), no conservado por límite, o conservación desactivada. Probado con transportes Graph ficticios en tests/attachment-source.test.mjs: descarga correcta y cada fallo (correo desconocido, nombre ausente, no archivo, Graph caído, id inválido, sobrepasar el tope antes y después); ninguna prueba toca una cuenta real.

## Ámbito histórico de la búsqueda

La búsqueda del chat cubre **abiertos y cerrados** por igual: un envío entregado (p. ej. TR-0398) se resume, lista sus correos y da acciones como cualquier otro, y todos los correos ingeridos por el receptor quedan indexados y consultables aunque el envío esté archivado. No hace falta la referencia exacta: el buscador encuentra envíos por texto de correo (asunto, cuerpo, remitente, nombres de adjunto, texto extraído) y por DUA, expediente, matrícula, cliente o proveedor. Límites declarados (no es una búsqueda universal): la **ruta** (ciudades de origen/destino) **no está indexada**; el contenido binario de los adjuntos no se busca, solo el texto que el receptor extrajo al ingerir; y el histórico es el de los correos ingeridos en la app, no todo el buzón.

## Límites y no validado

- Topes: 100 mensajes/persona/día, 30 llamadas IA/persona/día, historial de 200 mensajes/persona, 50 personas.
- Persistencia del chat: `APP_DATA_PATH + '.chat.json'` (documento aparte, escritura atómica).
- Los adaptadores de IA están probados solo con transportes ficticios en tests (incluido el bucle multiturno con herramientas); ninguna prueba llama a una API real. Graph sendMail está escrito pero no validado con cuenta real (igual que el receptor).
- En la demo sin auth, el "actor" es un filtro ficticio compartido, no un control de acceso.
