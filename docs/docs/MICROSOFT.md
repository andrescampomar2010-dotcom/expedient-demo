# Adaptador Microsoft Graph, desarrollo sin activar

Este adaptador no convierte OneDrive en una base de datos transaccional. Incluye rutas de lectura manual y receptor automático opcional de correo mediante delta, documentado en RECEIVER.md. Está apagado por defecto y no se ha conectado una cuenta real. La interfaz servida en localhost las llama por botones explícitos; el HTML autónomo mantiene la red bloqueada. Crear desde correo usa la vista previa seleccionada, no adjuntos ni correo completo.

## Requisitos antes de conectar

- Aprobación del propietario de los datos y del administrador según las normas de la organización.
- Registro de aplicación de un solo tenant. Configurar el redirect de desarrollo `http://localhost:4875/auth/callback`.
- Identificar cuenta, buzón y archivos exactos que se autoriza leer. No asumir permiso por tener acceso a la sesión.
- Proteger el secreto en un gestor de secretos o variables de proceso. Nunca en HTML, localStorage, repositorio, captura o conversación. `.env.example` solo muestra nombres vacíos.
- Instalar y revisar `@azure/msal-node` antes de habilitar la integración. El servidor se inicia sin esa dependencia cuando Graph está desactivado.
- El administrador decide consentimiento, políticas y licencias. Este proyecto no las modifica.

## Alcance inicial

Permisos delegados `Mail.Read` y `Files.Read`. El usuario debe tener acceso a los recursos. No se solicitan permisos de aplicación, `Mail.Send`, `Mail.ReadWrite` ni `Files.ReadWrite`. El inicio de sesión puede añadir scopes OIDC por MSAL.

`Mail.Read` es más amplio que los diez resultados que limita este adaptador: el permiso permite leer correo del usuario. La cuenta debe aceptar ese alcance explícitamente. Un buzón compartido puede requerir otro permiso y acceso al buzón. Bibliotecas SharePoint o archivos compartidos no están cubiertos por estas rutas de ejemplo sin revisión adicional.

Rutas implementadas, no probadas con cuenta real:
- `GET /api/status`: estado, sin datos de cuenta.
- `GET /auth/login`: inicia OAuth solo si `GRAPH_ENABLED=true` y configuración completa.
- `GET /auth/callback`: valida state y canjea código con PKCE.
- `GET /api/graph/messages`: diez asuntos, fechas y vistas previas de `/me/messages`.
- `GET /api/graph/files`: veinte entradas raíz de `/me/drive/root/children`, metadatos y selección manual.
- `GET /api/graph/text?id=...`: solo un ID listado en la sesión, TXT UTF-8 de hasta 200 KB. Lee metadatos y URL temporal en Graph y descarga desde dominios de archivo permitidos, sin bearer, sin redirecciones y con timeout. No expone la URL firmada al navegador. Un host no contemplado se bloquea y requiere revisión, no un bypass. Devuelve fuente, ID, fecha de modificación y recuperación.

No hay ruta de envío, escritura de tenant, descarga masiva o destino Graph arbitrario. Solo se permite POST para guardar espacio local o analizar texto revisado, con sesión y CSRF; esas rutas no escriben en Microsoft. Host y Origin limitados a localhost. Tokens y caché MSAL quedan en memoria del servidor. Reiniciar cierra sesiones locales. El ejemplo es de un solo proceso y un único desarrollo supervisado: cada sesión mantiene su caché MSAL en memoria y cada petición usa un cliente separado. Antes de múltiples usuarios hacen falta sesiones persistentes seguras y revisar concurrencia. No es apto para producción.

## Producción y conocimiento, pendientes

HTTPS, cookies Secure, gestor de sesión y secretos, identidad/roles del usuario, acceso por expediente, retención y borrado, auditoría sin cuerpos ni tokens, aislamiento por usuario, recuperación y reintentos avanzados (el receptor implementa paginación/delta con parada segura), verificación de conectores y límites, defensa ante instrucciones en documentos externos, pruebas de autorización y de recuperación.

Para conocimiento: elegir carpetas concretas, guardar fuente y fecha, extraer e indexar solo contenido autorizado, separar propuestas del modelo de datos confirmados y no dar instrucciones de documentos como órdenes del sistema. No enviar contenido a un proveedor de IA sin aprobación.

Enviar correo sería otra capacidad: requiere destinatarios y palabras aprobados, permiso específico, borrador revisado, confirmación e idempotencia. No añadir Mail.Send al alcance inicial por comodidad.

## Fuentes oficiales leídas al preparar el proyecto

- https://learn.microsoft.com/en-us/graph/permissions-overview
- https://learn.microsoft.com/en-us/graph/permissions-reference
- https://learn.microsoft.com/en-us/entra/msal/javascript/node/acquire-token-requests
- https://learn.microsoft.com/en-us/entra/identity-platform/tutorial-v2-nodejs-webapp-msal
- https://platform.claude.com/docs/en/manage-claude/authentication

Descarga documentada por Microsoft: https://learn.microsoft.com/en-us/graph/api/driveitem-get-content y https://learn.microsoft.com/en-us/graph/api/driveitem-get . No reenviar Authorization a la URL de descarga preautenticada.
