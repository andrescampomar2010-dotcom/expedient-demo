# Revisión 0.4.0, 23 noviembre 2026

Mismo proyecto Expedient; esquema de almacenamiento 0.1.0 conservado. `npm ci`, `npm run demo:simulated`, localhost:4875. Las revisiones locales estables 0.2.0 y 0.3.0 se han conservado fuera del paquete.

La v0.3 añadió preparación automática desde evento sintético: hilo, XLSX con parser público existente, conciliación, asignación, candidatos oficiales acotados, revisión humana y XLSX genérico revisado.

La v0.4 añade receptor Microsoft delta de una carpeta que, si se configura y autentica, alimenta ese mismo circuito automáticamente cada hora. Primer baseline sin importar históricos, cursor persistido, idempotencia por mensaje/versión, actualización de un expediente por hilo con invalidación de revisión y versiones anteriores conservadas. Errores paran el receptor sin avanzar la página fallida. No depende de pulsar un botón por correo. Ver docs/RECEIVER.md antes de activar.

Comprobado mediante simulaciones, no con una cuenta real. Esta entrega no conecta ninguna cuenta, no sondea Microsoft, no publica repositorio ni despliega servicio, no envía correo y no gasta en IA. Los adaptadores reales permanecen desactivados.

## Cierre de portfolio

El núcleo local es demostrable, con datos ficticios, pantallas, pruebas y conectores configurables. No se presenta como producto de producción ni como despacho completo. Quedan huecos concretos:

- Prueba controlada del receptor con cuenta/carpeta de ensayo y consentimiento propio. No datos reales por defecto.
- Motores exactos de otros perfiles, no sustituidos por suposiciones. Se integra solo el subconjunto de parser público identificado en PREPARATION.md.
- PDF/OCR, extracción técnica y contexto de adjuntos entre mensajes, recuperación de totales/origen con evidencia. Correo ordinario queda bloqueado si no tiene datos suficientes.
- Cobertura arancelaria general, TARIC actual y formato de un sistema aduanero. Las propuestas NC de ejemplo no son clasificación legal.
- Identidad, roles, retención/cifrado, base de datos, análisis de ficheros hostiles y operación continua. Localhost es un desarrollo supervisado, no multiusuario seguro.
- Avisos externos, envíos e integraciones adicionales solo con su propio alcance aprobado.
- Decidir licencia global antes de publicar código abierto. La licencia MIT del subconjunto reutilizado y su atribución se conservan.

No se necesita abrir estas líneas para demostrar el núcleo ni se da ninguna por terminada por tener un conector.

# Revisión 0.5.0, 27 noviembre 2026

Chat con asistente integrado (pestaña Chat de la app servidor): preguntas sobre envíos, correos e histórico con respuestas de reglas o redactadas por un modelo de IA configurado y elegido por cada persona (adaptadores Anthropic, OpenAI compatible y Gemini, verificados contra la documentación oficial; reglas locales siempre disponibles y rotuladas SIMULACIÓN). Acciones propuestas y confirmadas en el chat: preparar expediente conservando los adjuntos ya leídos (nombres, estado y texto extraído, sin binarios) y preparar borradores de plantilla (no IA, no enviados). Envío autónomo de respuestas apagado por defecto: exige flags de administrador, cuenta autorizada (scope Mail.Send solo entonces), política por persona con dominios/propósito/tope diario revocable, confirmación por envío, idempotencia y auditoría. Historial y propuestas aislados por persona derivada de la sesión; el texto de correos nunca concede permisos. 18 pruebas nuevas (129 en total), todas con transportes ficticios: ninguna llama a una API real. Ver docs/CHAT.md.

# Revisión 0.6.0, 27 noviembre 2026

Lote adicional del chat: el modelo de IA real investiga con herramientas que ejecutan las reglas (buscar envíos, detalle, hilo, correo; multiturno, máx. 3 rondas), verificado con transportes ficticios (pregunta libre, detalle de fuentes/histórico, selección de modelo aislada por persona); las respuestas citan fuentes navegables (botones que abren la búsqueda de Envíos); los resúmenes de hilo referenciam cada correo por ID; autonomía real de envío cuando la política por persona lleva auto:true (sin confirmación individual dentro del alcance, apagada por defecto, revocable y auditada); conservación opcional de binarios de adjuntos (CHAT_ATTACH_STORE + fuente autorizada, topes 5 MB/40 MB/200 archivos) destacando los que no existen. 7 pruebas nuevas (136 en total), ninguna llama a una API real.
