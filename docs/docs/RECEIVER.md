# Receptor automático Microsoft, v0.4.0

## Qué está terminado y qué no

Adaptador Node de lectura delegada, una cuenta y una carpeta, integrado en el mismo `processMail` que prepara expedientes de la demo. No es un botón de consultar: una vez configurado y autenticado arranca por sí solo, establece baseline y consulta cambios cada hora. Esta entrega no conecta una cuenta, no inicia sondeo externo y no despliega servicios. Se ha probado con transportes simulados, no contra un tenant.

Los datos de correo son fuentes no verificadas, nunca instrucciones ejecutables. No deciden herramientas, destinatarios ni permisos. No hay Mail.Send ni escritura en Microsoft. Asuntos y cuerpos se muestran escapados. El contenido no se manda a Claude automáticamente.

## Activación futura, solo por el propietario autorizado

1. Revisar docs/MICROSOFT.md y obtener permiso para la cuenta y carpeta. Los permisos delegados existentes son Mail.Read y Files.Read, más amplios que una carpeta: el filtro de esta app no reduce el consentimiento de Microsoft. Para esta demo no activar con datos reales.
2. Copiar `.env.example` a `.env` y completar registro de aplicación, tenant, cliente, secreto y callback de localhost. Secretos solo en el servidor. Usar un `APP_DATA_PATH` nuevo, separado de la simulación, fuera del repositorio.
3. `GRAPH_ENABLED=true`, `INTEGRATION_MOCK=false`, `MAIL_INTAKE_ENABLED=true` y `MAIL_INTAKE_APPROVED=true` son necesarios. Esta última variable es un freno técnico, no sustituye permiso humano.
4. `MAIL_FOLDER_ID=inbox` o ID de carpeta obtenido en Microsoft, sin adivinarlo; `MAIL_START_AFTER=2026-11-23T00:00:00Z` como ejemplo de fecha ISO UTC estricta. Elegir la fecha real del proyecto. `MAIL_POLL_MINUTES=60` es el mínimo de esta app. No se admite una frecuencia mayor.
5. `npm ci`, `npm run demo`, abrir localhost:4875, Conexiones, Comprobar servidor e Iniciar sesión Microsoft autorizada. El callback arranca receptor automáticamente, no exige otro clic por correo.
6. Primer recorrido: guarda cursor y versiones pero omite todos los mensajes existentes en ese baseline, incluso posteriores a la fecha configurada. No importa históricos. Los cambios posteriores sí generan o actualizan expedientes. El baseline usa máximo veinte páginas por ejecución y para si se supera, sin borrar cursor guardado. Comprobar estado en Conexiones o `/api/status`.
7. Recargar el espacio para ver nuevas entradas antes de editar. Una edición con revisión de servidor antigua es rechazada, no sobrescribe entradas nuevas.
8. Para parar, cerrar proceso. Para desactivar de forma duradera, poner `MAIL_INTAKE_ENABLED=false` y reiniciar. No basta cerrar pestaña. El receptor tiene un límite de ocho horas por autenticación y para después; no es un servicio permanente. Reiniciar exige nueva autenticación, no pierde cursor.

No se debe activar en esta entrega sin decidir primero cuenta, carpeta, alcance, retención y consentimiento. No se ha realizado ninguno de estos pasos con un proveedor real.

## Transacciones, relectura e hilo

- Delta de una carpeta, con `$select`, filtro inicial por fecha y páginas de hasta 20 resultados solicitados. Microsoft puede variar tamaño/orden o repetir un elemento. Se siguen los nextLink completos y se guarda deltaLink completo, no se reconstruyen tokens.
- IDs inmutables solicitados con Prefer. Identidad de ámbito guardada: cuenta MSAL, carpeta y fecha inicial. Cambiar ámbito requiere espacio de datos nuevo, no mezcla buzones.
- Cada página se prepara sobre copia de estado, con cursor, versiones y expedientes en la misma escritura atómica. Fallo de red/extracción/almacenamiento antes del commit deja esa página pendiente. Un conflicto de edición para el receptor y exige revisión, no descarta trabajo humano.
- Dedupe por ID y changeKey, con lastModified como respaldo, más eventId SHA256. Una relectura idéntica no crea otro expediente ni otro aviso. No se confía en el orden de delta. Si Microsoft trae una versión anterior, se relee el mensaje actual, no se aplican campos antiguos del delta.
- Coincidencia de hilo por conversationId: se conserva el ID del expediente, se vuelve a preparar, se pierden intencionadamente las confirmaciones anteriores y se conservan auditoría y hasta diez instantáneas previas con documentos. Los borradores previos no se envían y deben revisarse, no se actualizan automáticamente.
- Se recopilan hasta 50 vistas previas del mismo hilo en el buzón, incluida otra carpeta si Graph las devuelve. Esto supone un alcance de lectura mayor que la carpeta monitorizada; debe autorizarse. Se señala paginación incompleta. No es reconstrucción exhaustiva ni ordenación cronológica garantizada.
- La preparación actual usa los adjuntos del mensaje cambiado, no fusiona automáticamente facturas de mensajes anteriores. Las fuentes previas se conservan en instantáneas para revisión, pero no se mezclan para evitar usar documentos sustituidos. Un cambio sin documentos puede dejar el expediente bloqueado.
- Elementos movidos o eliminados no borran expedientes: invalidan revisión y añaden incidencia. Esta app no sincroniza todos los movimientos entre carpetas.

## Límites documentales y técnicos

- Lista metadatos de diez adjuntos como máximo. Solo descarga fileAttachment no embebidos, `.xlsx`, tamaño declarado <=1 MB. PDF, imágenes/OCR, ZIP, item/reference attachments, formatos particulares y resto de adjuntos quedan señalados como omitidos, no inventados. Respuesta HTTP limitada a 3 MB, sin redirects, timeout de 20 segundos. Una hoja malformada queda como incidencia del parser. No es un antivirus ni un sandbox de ficheros hostiles: solo uso local supervisado con documentos de prueba conocidos.
- El parser integrado es el subconjunto público real descrito en PREPARATION.md, no todos los motores ni todos los formatos. Factura y packing deben ajustarse a sus encabezados y hojas compatibles.
- Nunca se infieren origen, territorio, fecha de declaración, totales esperados o ficha técnica del texto libre. Un correo ordinario crea expediente preparado o bloqueado con preguntas, no un despacho válido ni una clasificación fiable. Los candidatos oficiales limitados de la demo siguen sujetos a revisión humana.
- Reglas de reparto son las dos reglas de demostración stationery/fallback, no el organigrama de ninguna empresa. Los avisos son internos locales.
- 429: parada sin reintentar, hay que respetar Retry-After antes de reautenticar. 410: parada, revisión manual y baseline nuevo en otro espacio. No se resetea el cursor automáticamente. Autenticación/consentimiento fallidos y otros errores también paran. No hay trabajador durable, webhooks, recuperación desatendida ni pruebas reales de licencias/permisos.
- Estado y cursor en JSON privado local sin cifrado de disco implementado, tokens solo en memoria. No publicar ni subir el JSON de trabajo. Máximo 500 expedientes/1000 entradas de conocimiento de la demo. Historial de eventos y mapa de IDs crecen, sin limpieza automática. No es una base de datos multiusuario; producción necesita identidad, roles, retención, cifrado, cuotas, antivirus y observabilidad sin datos sensibles.

## Pruebas y fuentes

`npm test`: baseline sin importar antiguos, paginación, relectura idéntica, actualización del mismo hilo sin duplicar expediente, persistencia del cursor al reiniciar, rechazo de enlaces externos y fallo sin avance; además del flujo de preparación y revisión existente. Todo mediante fixtures, sin tráfico Microsoft.

Fuentes oficiales consultadas el 23-11-2026:
- https://learn.microsoft.com/en-us/graph/api/message-delta
- https://learn.microsoft.com/en-us/graph/delta-query-messages
- https://learn.microsoft.com/en-us/graph/delta-query-overview
- https://learn.microsoft.com/en-us/graph/outlook-immutable-id
- https://learn.microsoft.com/en-us/graph/api/message-list-attachments
- https://learn.microsoft.com/en-us/graph/api/resources/fileattachment
- https://learn.microsoft.com/en-us/graph/throttling
