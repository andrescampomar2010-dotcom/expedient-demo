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
