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
