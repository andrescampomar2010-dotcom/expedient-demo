# Instalación en destino

Paquete sin datos, cuentas ni claves. Todo lo de abajo se rellena en el entorno de la empresa.

## Opción A: Docker
```
docker build -f deploy/Dockerfile -t expedient .
docker run -d --name expedient -p 127.0.0.1:4875:4875 -v expedient-data:/data \
  -e APP_PUBLIC_URL=https://expedient.empresa.example expedient
docker run --rm -i -v expedient-data:/data expedient node scripts/adduser.mjs ana admin   # la clave se lee por entrada estándar (mínimo 12 caracteres)
```
## Opción B: servidor Linux con systemd
Node 22.13.0 o superior (o 24). `npm ci --omit=dev`, copiar `deploy/expedient.env.example` a `/etc/expedient.env` (permisos 600) y `deploy/expedient.service` a `/etc/systemd/system/`. Crear usuarios con `npm run adduser -- ana admin`. Poner delante un proxy HTTPS (`deploy/nginx.conf.example`).

## Comprobaciones
- `GET /api/health` responde 200 sin datos (para monitorización).
- Con `APP_PUBLIC_URL` el servidor se niega a arrancar sin `APP_AUTH=local`.
- Roles: admin y operador escriben, lector solo lee. Las claves se guardan con scrypt. Cuenta bloqueada 15 min tras 5 fallos.
- Copia de seguridad SQLite: ver `docs/PRODUCCION.md` (`backupTo`, copia consistente con la base en uso) y probar la restauración en destino.

## Probado aquí (datos sintéticos) / se verifica al instalar
Probado: arranque con login, rutas cerradas sin sesión, rol lector sin escritura, rechazo de configuración pública sin autenticación, almacén SQLite. **No probado aquí:** construcción real de la imagen Docker, la unidad systemd, el proxy HTTPS, Microsoft Graph con correo real, rendimiento con usuarios simultáneos reales.

## Varias personas a la vez (qué se probó y qué no)
La base es compartida, no colaborativa en vivo. Cada guardado lleva la revisión que la persona cargó: si otra persona guardó antes, el servidor responde 409 y **no pisa** el cambio; hay que recargar y repetir. Probado por HTTP con 3 usuarios distintos y guardados simultáneos desde la misma revisión (gana exactamente uno) y con el estado intacto tras reiniciar el servidor (`tests/server-concurrency.test.mjs`). No hay actualización automática de pantalla ni fusión de cambios: queda como mejora. Los correos entrantes los escribe el receptor, que conserva su propio cursor.

## Copia de seguridad y restauración
`node scripts/backup.mjs backup data/x.db backups` (copia consistente aunque la app esté abierta, con sha256 y comprobación de integridad) y `node scripts/backup.mjs restore backups/<copia>.db data/x.db` (parar la app antes; rechaza copias alteradas, que no sean SQLite o de otro tipo). Probado de extremo a extremo (`tests/backup-sqlite.test.mjs`). La rotación y la frecuencia las decide la empresa.

## Docker y proxy
En el entorno de preparación no hay Docker ni nginx: la imagen no se ha construido y el proxy no se ha probado. Los ficheros de `deploy/` son plantillas sin validar en ejecución.

## Alertas de lectura de correo
Si el receptor se detiene, `/api/status` muestra `receiver.alert`, el código y la acción a seguir, se escribe una línea `ALERTA receptor de correo detenido: ...` en el registro del servicio (journald o `docker logs`) y `/api/health` devuelve 503 para que la monitorización de la empresa lo recoja. Los mensajes llevan solo códigos, nunca el texto del error original. Probado: la lógica (`tests/health.test.mjs`). **No probado:** el camino completo con un fallo real de Microsoft Graph (requiere cuenta real); la interfaz todavía no muestra un aviso visual de la alerta ni explica el error 409 de guardado con un mensaje propio.

## Adjuntos recibidos
- Se leen PDF digitales (librería `pdfjs-dist` 6.5.438, licencia Apache-2.0, mantenida por Mozilla, `npm audit` sin avisos en la fecha de la prueba) y XLSX (`exceljs`). Límites: 5 MB, 30 páginas, 8.000 caracteres guardados por correo y 8 s de lectura. El texto leído se usa para encontrar DUA, expediente o referencia y para la búsqueda.
- Un PDF sin texto (escaneo) **no se lee** (no hay OCR): queda marcado "sin texto: no leído, posible escaneo" en la ficha y en la fuente del evento. Lo mismo para archivos demasiado grandes, ilegibles o de otro tipo.
- Probado con fixtures de Graph (`tests/receiver-attachments.test.mjs`): un DUA que solo está dentro de un PDF vincula el correo al envío, con el nombre del adjunto en la fuente; un PDF escaneado queda en Pendientes con aviso. 
- Corregido un defecto: la interfaz solo se activaba en `localhost`; ahora también funciona servida por HTTPS en un dominio (`tests/ui-served.test.mjs`). Sin esto, en destino se habría quedado en modo HTML autónomo.

### Adjuntos: pruebas negativas (añadidas)
La lectura corre en un hilo aparte (`server/attachment-worker.mjs`) con tope de memoria de 256 MB y se **cancela** (`terminate`) al pasar el tiempo, no solo se deja de esperar. Probado (`tests/attachments-limits.test.mjs`): PDF cifrado con clave (AES-256) queda "protegido" sin texto; 45 páginas se leen 30 y se avisa; más de 5 MB no se analiza; un hilo que no termina se corta en el límite y el proceso sigue leyendo después; un hilo que agota la memoria se corta sin tumbar el servidor. Inyección (`tests/attachments-injection.test.mjs`): nombres o textos con HTML o con órdenes dentro del adjunto se pintan escapados en la ficha, y el texto solo sirve para buscar DUA/expediente/referencia: no confirma envíos, no cambia estados y no toca permisos. pdfjs imprime un aviso por no encontrar `@napi-rs/canvas` (opcional, solo hace falta para dibujar páginas, no para leer texto).
No probado: PDF de cientos de páginas ni PDF malformados de forma maliciosa más allá de los casos anteriores; adjuntos reales de Graph.

## Versión de Node
Mínimo real: Node 22.13.0 (o 24). Lo pide `package.json` (`engines`), el servidor se niega a arrancar con una versión menor (`NODE_TOO_OLD`, `tests/runtime-check.test.mjs`) y el Dockerfile falla al construir si el tag resuelve a algo anterior (no validado: Docker no está disponible aquí).

## Gestión de usuarios y aviso de alerta en pantalla
Un administrador ve arriba el panel "Usuarios (administración)": lista, crear y borrar (`/api/users`, solo rol admin, comprobación de origen; nunca devuelve claves ni sales; no deja borrar el último administrador; borrar a alguien cierra sus sesiones). Si el receptor de correo se detiene, todos los usuarios ven un aviso rojo con el código y la acción. Probado por HTTP con sesiones admin y operador (`tests/server-auth.test.mjs`) y con captura de la interfaz real. En la captura el aviso rojo está forzado en el navegador (no hay Graph real aquí). Sin cambiar claves ni roles de usuarios existentes todavía: hay que borrar y crear de nuevo. El panel no se muestra en el HTML autónomo, solo servido por el servidor.

## Modo producción vacío y modo demostración
Con `APP_AUTH=local` (o `APP_MODE=production`) la app arranca en modo producción: sin cabecera "DEMO LOCAL", sin "Rol ficticio", sin botón de ejemplo y con el espacio vacío (hay una prueba automática: `tests/server-auth.test.mjs`). El modo demostración es el que se abre sin autenticación local y con datos ficticios. No los mezcles: una ruta de datos pertenece a un solo modo.

## OCR de PDF escaneados (local)
Qué hace: si un PDF adjunto no tiene texto, se renderiza con `pdftoppm` y se lee con `tesseract` en el propio servidor. Nada sale de la máquina. Máximo 5 páginas, 200 ppp, 60 s por documento (el proceso se mata al agotarse).
Qué NO hace: el texto de OCR nunca vincula un correo ni confirma un DUA, kilos o bultos. Se muestra como "leído por OCR, no verificado" con las pistas encontradas y las palabras dudosas, para que una persona confirme contra el original. La confianza de tesseract sirve solo para marcar lo dudoso; no es una exactitud medida.
Dependencias (se instalan aparte, no van en `npm ci`): `tesseract-ocr` (Apache-2.0), `tesseract-ocr-spa` y `tesseract-ocr-eng` (modelos tessdata_fast, Apache-2.0), `poppler-utils` (GPL, solo como programa externo que se ejecuta, no se enlaza). Recursos: unos 0,5 a 2 s por página sintética limpia o ruidosa en la máquina de pruebas, un proceso por documento, memoria moderada; no se midió con escaneos reales ni con carga.
Comprobar antes de arrancar: `npm run ocr:check` avisa de lo que falte. Si el paquete de idioma no existe: `node scripts/ocr-setup.mjs --fetch data/tessdata`, copia también `eng.traineddata` y exporta `TESSDATA_PREFIX=data/tessdata`. La descarga se hace una vez en la instalación y se verifica con SHA-256 (spa.traineddata, 2294433 bytes, 6f2e04d0…b464). Si falta algo, la app sigue funcionando y marca el escaneo "OCR no disponible". `OCR_ENABLED=false` lo desactiva.
Probado aquí (sintético, tesseract 4.1.1): escaneo limpio y borroso leen el DUA de ejemplo (todos los identificadores quedan como dudosos); escaneo ruidoso y girado no produce DUA; hoja en blanco queda "sin texto"; sin tesseract queda "OCR no disponible". Sin probar: escaneos reales, manuscritos, sellos, tablas, otras versiones de tesseract, tiempo bajo carga. Con una sola muestra por caso no hay tasa de acierto.

## Envíos incrementales (cambia el almacén de envíos)
Con una base `.db` (`APP_DATA_PATH=...db`) los envíos viven en tablas por registro (`server/shipments-db.mjs`), no dentro del documento del espacio. La interfaz pide páginas (`GET /api/shipments/list|stats|pending|search|item`) y escribe altas, confirmaciones, descartes y propuestas con `POST /api/shipments/op` (CSRF y origen obligatorios; el rol lector recibe 403). Cada escritura toma el bloqueo de escritura de SQLite, carga solo los envíos abiertos o referenciados por el correo y guarda solo las filas cambiadas. `APP_SHIPMENTS_STORE=document` conserva el modo antiguo.
**Migración:** en el primer arranque con datos antiguos se importan los envíos, se guarda una copia íntegra en `<base>.envios-anterior.json` y se quitan del documento del espacio. Conserva esa copia hasta validar la migración en destino.
**Tamaño de petición:** `APP_MAX_BODY_MB` (por defecto 2).

### Medido aquí (datos sintéticos, 30 sesiones en bucle cerrado sin pausa, generador y servidor en las mismas 2 CPU)
| Histórico | Peticiones/s | p50 | p99 | Errores | RSS | Base |
|---|---|---|---|---|---|---|
| 2200 envíos × 5 correos (volumen sintético de ~22 días) | ~700 | ~35 ms | ~60 ms | 0 | ~142 MB | 26 MB |
| 2200 × 15 correos | ~710 | ~35 ms | ~65 ms | 0 | ~139 MB | 52 MB |
| 10000 × 5 (~100 días) | ~366 | ~60 ms | ~105 ms | 0 | ~134 MB | 102 MB |
Recepción de correo (un proceso, `scripts/loadingest.mjs`): 2200×5 p50/p95/p99 0,8/2,7/3,8 ms; 10000×5 0,9/3,2/4,1 ms.
**No demuestra:** horizonte de 12 meses (no medido), Microsoft Graph real, adjuntos en el bucle, navegador real, hardware del destino. Las escrituras se serializan en el único escritor de SQLite. El **espacio compartido (casos)** sigue siendo un documento completo y devuelve 409 ante conflicto (en la mezcla, ~50 % de sus escrituras simultáneas).
Repetir: `node scripts/loadhttp.mjs --shipments 2200 --mails 5 --seconds 15 [--cases 300]` y `node scripts/loadingest.mjs --shipments 2200 --mails 5 --n 400`.

## Instalación desde cero sin Docker: secuencia validada
Validada el 26/11/2026 en una copia nueva (`git clone`, `npm ci --omit=dev`, Linux, Node 22+), sin systemd ni proxy:
1. `ADDUSER_PASSWORD=<clave de 12+ caracteres> APP_USERS_PATH=/ruta/users.json node scripts/adduser.mjs ana admin`
2. `PORT=4876 APP_AUTH=local APP_MODE=production APP_USERS_PATH=/ruta/users.json APP_DATA_PATH=/ruta/x.db node server/server.mjs`
3. `curl localhost:4876/api/health` devuelve `{"ok":true,"auth":"local"}`.
4. Login: `POST /api/login` con cabecera `origin` y `{"name","password"}` (200). La sesión se crea con `GET /api/status` (devuelve el token CSRF); sin ella la API responde `LOCAL_SESSION_REQUIRED`.
5. `GET /api/shipments/stats` y alta con `POST /api/shipments/op` (cabeceras `origin` y `x-csrf-token`).
6. Parar la app, `node scripts/backup.mjs backup /ruta/x.db /ruta/bk`, borrar la base, `node scripts/backup.mjs restore <copia>.db /ruta/x.db`, volver a arrancar y comprobar `/api/health`.
`npm test` en la copia nueva: 100 pruebas, 97 pasan y 3 (OCR) se omiten sin `TESSDATA_PREFIX`; 0 fallos. Con el modelo de OCR instalado pasan las 100 (probado en el entorno de desarrollo). Sin validar aquí: Docker, systemd, nginx, Graph.

## Expedientes y estado del receptor por registro (ampliación)
- **Expedientes**: con base `.db` cada expediente es una fila (`casos`, con su versión). Guardar el espacio solo escribe los expedientes que la persona cambió; el conflicto (409 `CASE_CONFLICT_RELOAD_BEFORE_EDITING`, con `caseId`) solo salta si otra persona cambió **ese mismo** expediente. `APP_CASES_STORE=document` conserva el modo antiguo. Migración al primer arranque con copia íntegra `<base>.expedientes-anterior.json`. Orden: más reciente primero; un guardado no borra expedientes (no hay borrado por esta vía).
- **Parte común** (avisos, borradores, conocimiento, historial): sigue siendo un único documento con revisión. Si la persona no la modificó, su guardado no choca con cambios de otros; si la modificó sobre una base vieja, 409 (`REVISION_CONFLICT_RELOAD_BEFORE_EDITING`). **Sigue siendo un defecto de escala pendiente.**
- **Receptor de correo**: cursor y correos ya vistos (`seen`) viven en tablas propias (`meta`, `seen`), fuera del documento compartido; un reintento tras fallo o un reinicio no duplica correos ni reescribe el documento si no hubo cambios en expedientes. Migración de `receiver`/`receiverSent` con copias `<base>.receptor-*-anterior.json`.
- Pestaña Envíos: la barra de guardado global se sustituye por un aviso (los envíos se guardan solos); en Expedientes aparece "Guardar espacio".

### Medición ampliada (mismas condiciones y salvedades; "0 errores" excluye los 409 esperados, que se cuentan aparte)
| Histórico | req/s | p50 | p99 | 409 esperados | RSS | Base |
|---|---|---|---|---|---|---|
| 26000 envíos × 5 correos (volumen sintético de ~12 meses; 130 000 correos; 108 MB) | ~668 | ~35 ms | ~62 ms | edición de expediente: 1 de 304 (mismo expediente); escritura de la parte común: 141 de 325 | ~142 MB | 259 MB |
Defecto real hallado y corregido al medir 12 meses: la lista sin filtro ordenaba toda la tabla (sin índice): 148 req/s y p50 ~140 ms; con el índice `ship_order` 668 req/s (regresión cubierta por prueba del plan de consulta). La instalación no se certifica por esta cifra: bucle cerrado sintético, mismas 2 CPU para generador y servidor, sin Graph, adjuntos ni navegador reales.

## Avisos y borradores por registro; medición final de esta versión
Con base `.db`, además de envíos y expedientes, los **avisos** y **borradores** son filas propias (`reg`): el conflicto (409 `RECORD_CONFLICT_RELOAD_BEFORE_EDITING`, con `coll` y `caseId`) solo salta si dos personas cambian el mismo registro; añadir avisos o borradores distintos no choca. Queda como documento único con revisión solo la parte restante (conocimiento, historial, configuración): 409 `REVISION_CONFLICT_...` si se modifica sobre una base vieja. Migración al primer arranque con copias `<base>.avisos-anterior.json` y `<base>.borradores-anterior.json` (probada con un espacio antiguo completo: receptor, expedientes, avisos, borradores; el segundo arranque no repite). Modo producción vacío: el texto de la bandeja ya no invita a cargar el ejemplo. Para restaurar una copia hay que parar la aplicación (con la base abierta por otro proceso la restauración puede fallar con "database is locked").

Mezcla de la medición (30 sesiones, bucle cerrado sin pausa, 2 CPU compartidas con el generador, sintético): envíos 92% (lista 35%, ficha 25%, búsqueda DUA 12%, pendientes 5%, stats 5%, altas 10%), espacio compartido 8% repartido en lectura 20%, edición de expediente 20%, aviso nuevo 15%, edición de aviso 15%, borrador nuevo 15% (todos por registro) e historial 15% (documento común).
| Histórico | req/s | p50 / p95 / p99 (lista) | 409 por registro | 409 de revisión (historial) | RSS | Base |
|---|---|---|---|---|---|---|
| 2200 × 5 (22 días) | ~477 | ~45 / 70 / 88 ms | 0 de ~380 | 20 de 81 | ~154 MB | ~26 MB |
| 26000 × 5 (12 meses, 130 000 correos) | ~462 | ~49 / 75 / 89 ms | 0 de ~420 | 24 de 101 | ~154 MB | ~259 MB |
| 13000 × 15 (6 meses, 195 000 correos, 153 MB) | ~423 | ~54 / 81 / 91 ms | 0 de ~400 | 20 de 92 | ~158 MB | ~287 MB |
"0 errores" significa sin errores de conexión ni 5xx; los 409 esperados se cuentan aparte. Las escrituras del espacio devuelven el estado completo y ya son más lentas (p99 ~95-140 ms). Sin medir: 12 meses con 15 correos por envío (el generador de datos no cabe en la prueba: 390 000 correos), Graph real, adjuntos, navegador real, hardware del destino. No es una certificación de capacidad.

### Medición 12 meses × 15 correos y recuperación ante 409
- 26000 envíos × 15 correos (volumen sintético de 12 meses, 390 000 correos, base de 564 MB), generada por lotes y reanudable: `node scripts/loadhttp.mjs --dir /ruta --prepare --mails 15 --from 1 --to 13000`, luego `--from 13001 --to 26000` (~45 s cada lote) y la carga con `--dir /ruta --reuse --shipments 26000 --mails 15`. Resultado (30 sesiones, mismas condiciones y mezcla): ~410 req/s; lista p50/p95/p99 ~55/84/99 ms (resto de lecturas y escrituras de 53 a 118 ms en p99); sin errores de conexión ni 5xx; 409 por registro 0; 409 de revisión (historial, documento común) 16 de 87; RSS ~160 MB; base ~569 MB. Sin medir: Graph real, adjuntos, navegador real, hardware del destino. No certifica capacidad.
- **409 y trabajo local.** Un 409 nunca escribe en el servidor. La pantalla conserva en memoria lo escrito, y la app descarga automáticamente `conflicto-local-<fecha>.json` con el estado local (probado en navegador: se dispara una descarga y contiene la edición). Después, recargar trae la versión del servidor y el trabajo local hay que reaplicarlo a mano desde esa copia (no hay fusión automática). La descarga automática depende de que el navegador permita descargas tras pulsar Guardar: en el entorno de prueba (navegador sin interfaz) se comprobó que se invoca, no el aviso de cada navegador real.
- **Historial automático y correo entre lectura y guardado** (prueba en tests/store-cases.test.mjs): si la persona guarda un expediente sin tocar la parte común, el historial que el receptor escribió entre medias se conserva; si el receptor escribe con una lectura vieja y otra persona cambió la parte común, falla con REVISION_CONFLICT sin escribir ni avanzar el cursor y reintenta en el siguiente ciclo; si la persona modifica la parte común sobre una base vieja, 409.
