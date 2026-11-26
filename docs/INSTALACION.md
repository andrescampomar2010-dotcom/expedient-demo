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
