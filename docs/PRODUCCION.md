# Qué falta para producción

Estado actual: app local para una persona, datos ficticios, sin autenticación. Esto es lo que habría que añadir para usarla con correo y equipo reales.

1. **Acceso y roles.** Inicio de sesión real (por ejemplo Microsoft Entra ID) y permisos por rol. Hoy el rol es un filtro ficticio.
2. **Alojamiento.** Servidor con HTTPS, base de datos (por ejemplo PostgreSQL) en lugar del archivo JSON, copias de seguridad y control de concurrencia. Hoy solo escucha en localhost.
3. **Correo real.** Registrar una aplicación en Microsoft Entra con consentimiento del administrador (Mail.Read, buzón compartido si aplica). Vigilar Bandeja de entrada **y Elementos enviados**, con notificaciones o consultas cada pocos minutos (hoy mínimo 60 min).
4. **Adjuntos.** Extraer texto de PDF y Excel y OCR para escaneos. Hoy no se lee el contenido de PDF ni escaneos.
5. **Calidad de las reglas.** Probarlas con unos cientos de correos reales históricos y medir cuántos se relacionan bien, cuántos van a Pendientes y cuántos fallan. Ajustar el formato de DUA/expediente/matrícula a los vuestros. Directorio de clientes y proveedores mantenido en la app.
6. **IA opcional.** Para correos sin referencias: proponer envío y resumir cambios, siempre con confirmación humana. Requiere clave de API, coste por uso, y revisar qué datos se envían al proveedor.
7. **Datos personales y retención.** RGPD: base legal, plazos de conservación, registro de accesos, borrado. Correos reales no deben salir del entorno aprobado por la empresa.
8. **Operación.** Alertas si falla la lectura de correo, monitorización, actualizaciones, pruebas en el entorno real (Windows y cuenta real aún sin probar).
9. **Integración con vuestros sistemas.** Hoy solo lectura y sin envíos. Conectar con el gestor aduanero requiere acordar interfaces y validar cada salida; ninguna salida actual es una declaración válida.


## Preparación técnica añadida (escenario de trabajo, no capacidad certificada)

Orientación genérica para dimensionar, **sin volumen real**: un equipo pequeño con muchos envíos al día; hay que fijar el volumen real antes de desplegar. Los correos por envío, los días operativos y la concurrencia no están fijados; las pruebas usan 5 correos por envío como supuesto.

**Implementado y con tests (58 en total):**
- Carpeta de enviados: `MAIL_SENT_FOLDER_ID` y `OWN_MAIL_DOMAINS`. Solo alimenta fichas. Sin identificador, un correo saliente va a Pendientes por dominio del destinatario.
- Propuesta de IA opcional, apagada por defecto (`AI_PROPOSER_ENABLED`, `AI_PROPOSER_MAX_PER_DAY`). No envía DUA, expediente, adjuntos ni direcciones completas. El resultado queda "sin verificar" hasta que una persona lo acepta. Requiere aprobación de coste y datos antes de activarla.
- Índices en memoria para ingesta, búsqueda y alta de envíos (eliminan un comportamiento cuadrático medido).
- `scripts/loadtest.mjs [días] [envíos/día]`: carga sintética sin red. `scripts/backup.mjs`: copia y restauración con sha256.

**Medición (un solo ordenador de desarrollo, un solo proceso, datos ficticios, sin red ni concurrencia):** con 10.000 envíos y 50.000 correos, la ingesta tarda unos 0,12 ms por correo (mediana), la búsqueda por DUA ~1 ms y por palabras ~60 ms. El estado completo ocupa ~32 MB de JSON, y guardar el archivo entero en cada cambio es el cuello de botella real que queda: por eso el siguiente hito es SQLite o PostgreSQL. Esto no demuestra que varias personas simultáneas funcionen bien.

**Sin implementar todavía:** base de datos transaccional, usuarios y roles reales (SSO o locales: decisión de la empresa), lectura de adjuntos, alertas. **Decisiones/permisos externos:** alojamiento, registro de app en Entra con consentimiento de admin, acceso a correo real, gasto y privacidad de la API de IA, retención RGPD.

## Módulos añadidos, aún sin conectar al servidor

- `server/store-sqlite.mjs` (SQLite con transacciones, control de versión y copia consistente) y `server/users.mjs` (contraseñas con scrypt, sesiones con caducidad, bloqueo por intentos, roles admin/operador/lector). Tienen tests (6 y 3), incluido un test con 4 hilos escribiendo a la vez sin perder escrituras.
- **Falta**: conectar ambos a `server/server.mjs` (variable `APP_DB_PATH`, pantalla de acceso, comprobación de rol en cada ruta que escribe) y probar contra el servidor completo. Hasta entonces la app sigue guardando JSON y sin acceso con usuario.
- Si la empresa elige SSO (Microsoft Entra ID), `users.mjs` se sustituye; los roles quedan igual.

## Qué NO prueban las mediciones

Un solo proceso en un ordenador de desarrollo, datos sintéticos de formato uniforme, 5 correos por envío (supuesto), sin red, sin Microsoft Graph, sin adjuntos, sin personas usando la interfaz a la vez y sin la escritura del JSON completo en cada cambio. Son útiles para detectar cuellos de botella, no para afirmar capacidad.

## Almacén SQLite conectado (probado) y defectos que quedan

- Si `APP_DATA_PATH` termina en `.db`, `server/store.mjs` usa SQLite (misma interfaz, transacción, rechazo de cambios concurrentes con `REVISION_CONFLICT`). Límites configurables: `APP_MAX_CASES` (50.000 por defecto) y `APP_MAX_KNOWLEDGE`. Con `.json` sigue el modo demo, con tope de 500 expedientes, que **no sirve** para un volumen diario alto de envíos.
- Defectos de implementación pendientes (no son decisiones del cliente): `server/server.mjs` solo acepta `localhost` (comprobación de Host y Origin, callback fijo), así que falta una opción `APP_PUBLIC_URL` con HTTPS detrás de proxy; falta conectar `users.mjs` (pantalla de acceso y rol por ruta) y el script de instalación/servicio. Requisitos de configuración en destino (no son defectos): dominio y certificado, registro de la app en Entra, buzón, clave de IA si se activa.

## Actualización: acceso y despliegue conectados

Resuelto en código y probado con servidor real y datos sintéticos (`tests/server-auth.test.mjs`): `APP_PUBLIC_URL` (HTTPS tras proxy), `APP_BIND`, acceso local con roles conectado a todas las rutas `/api`, `/api/health`, rechazo de arrancar público sin autenticación, `npm run adduser`. Quedan sin cambios los otros defectos: lectura de adjuntos, alertas y capturas de la sugerencia de IA. Ver `docs/INSTALACION.md` y `deploy/`. Esto sustituye la frase anterior de que `server.mjs` solo acepta localhost y de que `users.mjs` no está conectado.
