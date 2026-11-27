# Chat con asistente integrado

Pestaña **Chat** de la app servidor. Un asistente responde sobre los datos de la app (envíos, correos, histórico, conocimiento), propone acciones y, si la administración lo autoriza expresamente, envía respuestas. Todo lo demás sigue igual: la revisión es humana y nada se presenta ni declara.

## Qué puede hacer

- Responder «¿cómo van los envíos?» con el resumen de reglas (envíos, correos, pendientes, rechazos abiertos).
- «Acciones recomendadas de TR-0412»: ficha del envío, última gestión/información, rechazos abiertos, matrículas y acciones sugeridas por reglas.
- «Correos e hilos de TR-0412»: los correos registrados del envío con fecha, remitente y adjuntos.
- «Prepárame un expediente de TR-0412»: propone crear un expediente en borrador desde el correo más reciente con adjuntos. **Qué conserva de los adjuntos: lo que el receptor ya descargó y leyó** — nombres, estado de lectura por adjunto y el texto extraído (tope del receptor, 8000 caracteres). **Los archivos binarios no se guardan en la app y el chat no descarga nada nuevo del buzón.** El expediente queda en borrador, sin revisión.
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
4. Confirmación explícita del envío concreto en el chat.
5. Idempotencia: cada propuesta se ejecuta una sola vez; reintentos responden "ya resuelta" sin duplicar.
6. Auditoría de cada intento (SENT/DENIED, persona, destinatario, asunto, motivo) consultable por admin en `/api/chat/audit`.

Un botón de admin y una cuota no bastan: sin política por persona no hay ni propuesta de envío; un destinatario fuera de la lista se rechaza antes de proponer.

## Límites y no validado

- Topes: 100 mensajes/persona/día, 30 llamadas IA/persona/día, historial de 200 mensajes/persona, 50 personas.
- Persistencia del chat: `APP_DATA_PATH + '.chat.json'` (documento aparte, escritura atómica).
- Los adaptadores de IA están probados solo con transportes ficticios en tests; ninguna prueba llama a una API real. Graph sendMail está escrito pero no validado con cuenta real (igual que el receptor).
- En la demo sin auth, el "actor" es un filtro ficticio compartido, no un control de acceso.
