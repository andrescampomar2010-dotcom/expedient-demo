# Revisión 0.7.0, 27 noviembre 2026

Mismo proyecto Expedient. `npm ci`, `npm run demo:simulated`, localhost:4875. Suite 147 pruebas, 144 superadas, 3 omitidas, 0 fallos.

La v0.7 añade dos piezas:

- Barra de personas ficticias (nombre, rol, carga abierta, ausencia) en Expedientes, Tareas, Envíos y Avisos; la coordinadora lo ve todo, el resto filtra lo suyo. Filtro ficticio, no autenticación.
- Asignación por persona: expedientes (con bloqueo a personas ausentes, también en servidor) y envíos.
- Tareas internas/externas por envío con vencimiento explícito, etiquetas («vencida Xd», «HOY», «mañana», «en Xd»), pantalla «Tareas» agrupada por persona con completado y reasignación.
- Avisos: inactividad (4+ días sin movimiento) y ETA explícita a 7 días o menos sin borrador registrado. Sin ETA no hay aviso.
- Los correos por clasificar siguen aparte en Envíos → Pendientes; no son tareas.

Límites declarados en docs/EQUIPO.md: no hay tabla de agentes configurable, la disposición de la barra es sencilla y la reasignación por ausencia es manual. En modo servidor, los recuentos usan los envíos cargados en pantalla. Sin cuentas reales, sin coste, sin envíos: como siempre.

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

Lote adicional del chat: el modelo de IA real investiga con herramientas que ejecutan las reglas (buscar envíos, detalle, hilo, correo; multiturno, máx. 3 rondas), verificado con transportes ficticios (pregunta libre, detalle de fuentes/histórico, selección de modelo aislada por persona); las respuestas citan fuentes navegables (botones que abren la búsqueda de Envíos); los resúmenes de hilo referencian cada correo por ID; autonomía real de envío cuando la política por persona lleva auto:true (sin confirmación individual dentro del alcance, apagada por defecto, revocable y auditada); conservación opcional de binarios de adjuntos (CHAT_ATTACH_STORE + fuente autorizada, topes 5 MB/40 MB/200 archivos) destacando los que no existen. 7 pruebas nuevas (136 en total), ninguna llama a una API real.

# Revisión 0.6.1, 27 noviembre 2026

- Conservación de binarios conectada a Graph: `server/attachment-source.mjs` descarga el adjunto original bajo demanda con la sesión Graph de la persona que confirma el expediente (autorización `Mail.Read` ya concedida; nunca otra cuenta), validación de identificadores, coincidencia exacta de nombre y tope antes y después de descargar (2 MB efectivos por el límite de 3 MB del transporte `graph()`). Lo no conservado queda destacado como SIN BINARIO DISPONIBLE. Probado con transportes Graph ficticios (descarga real y cada fallo); sin cuenta real.
- Fuentes al correo exacto: la fuente de un correo abre la ficha del envío y resalta ese correo dentro de ella; si ya no está indexado, la interfaz lo declara.
- Respuestas del chat en lenguaje natural: la contestación primero y las fuentes después, en botones separados bajo el mensaje. El resumen de hilos es síntesis de hechos, cambios y siguiente paso (no volcado de correos); el modelo real recibe la misma instrucción.
- Ámbito histórico verificado y declarado: búsqueda en abiertos y cerrados, correos ingeridos indexados, consulta sin referencia exacta; límites declarados (la ruta no se indexa, el contenido binario no se busca, el histórico es el de correos ingeridos).
- 141 pruebas (138 pasan, 3 omitidas de base, 0 fallos).
