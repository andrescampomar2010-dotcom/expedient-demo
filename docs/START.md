# Arrancar y probar, sin cuentas ni coste

1. Instala Node.js 22 o superior si no lo tienes.
2. Extrae el ZIP completo. Abre la carpeta `expedient-demo`.
3. Primero abre una terminal en la carpeta y ejecuta `npm ci`. Se descargan dependencias de software, no se conecta Microsoft o Claude. En Windows, ejecuta `iniciar_demo.bat`. En una terminal de cualquier sistema: `npm run demo:simulated`.
4. Abre `http://localhost:4875` en Chrome o Edge. El servidor se queda abierto; Ctrl+C lo detiene.
5. Ya habrá un expediente preparado desde el evento de correo sintético. Abre Automatización para verlo y probar otros casos. Para el recorrido manual adicional, pulsa Cargar ejemplo ficticio. Propón HS, revisa la línea, confirma revisión, elige Operador A y asigna.
6. Pulsa Guardar espacio en servidor. El espacio queda en `data/simulation.json`.
7. Abre otra ventana privada, entra en la misma URL, elige Operador A y abre Avisos y borradores. Puedes marcar leído y guardar.
8. En la primera ventana pulsa Recargar espacio. El cambio de lectura aparece allí. Si dos ventanas guardan una revisión antigua, se bloquea la segunda para evitar sobrescribir.
9. En Conexiones pulsa Comprobar servidor local, Consultar 10 correos y Consultar 20 archivos raíz. Se sirven datos inventados. Crear expediente desde vista previa crea un caso incompleto, sin clasificar ni revisar por ti.
10. En el texto para Claude escribe un ejemplo ficticio. Lee el texto exacto, marca la confirmación y pulsa Analizar texto revisado. En esta modalidad la respuesta es sintética y NO llama a Claude.

La selección de rol es un filtro para probar la experiencia, no autenticación ni restricción de acceso. Todos los usuarios locales del servidor pueden leer el espacio. No alojar en red ni introducir datos sensibles. El servidor solo escucha en 127.0.0.1; abrirlo en otro dispositivo o desplegarlo requiere antes autenticación, HTTPS y permisos reales.

Esta revisión necesita `npm ci` para el parser/exportador XLSX, incluso sin Graph. `npm run demo` lee tu `.env` local si existe. Nunca mezcles `INTEGRATION_MOCK=true` con flags reales, el servidor lo rechaza.

El HTML autónomo es un extra offline, no el producto principal: no tiene persistencia compartida ni conexiones.

## Conocimiento con fuentes

En Conexiones, después de consultar archivos, pulsa Leer TXT y añadir a conocimiento en el ejemplo sintético. En Conocimiento busca «totales», escribe una pregunta y pulsa Preparar consulta con fuentes. Vuelve a Conexiones con la pregunta y hasta tres extractos/fuentes en el texto exacto. Compruébalo antes de marcar la confirmación. Solo entonces se analiza, simulado en este arranque. No es recuperación semántica ni valida normativa. Guarda el espacio para conservar la biblioteca entre sesiones.

## Recorrido nuevo por evento

Al arrancar la revisión 0.3.0 se prepara automáticamente un expediente desde un correo ficticio con XLSX. En Expedientes, revisa el hilo y la conciliación; por cada línea lee los candidatos oficiales y pulsa Aceptar candidato. Marca las dos líneas revisadas y confirma revisión del expediente. Elige responsable, asigna y guarda espacio. El enlace Descargar XLSX genérico revisado descarga las cuatro hojas del caso guardado. No es un despacho declarable.

En Automatización, Entrada completa / repetir demuestra deduplicación. Las otras entradas generan casos con falta de composición, discrepancia de unidades o packing ausente. Deben quedar bloqueados, no se aprueban para que la demo parezca exitosa.

## Receptor Microsoft opcional

El inicio simulado no conecta ni sondea Microsoft. La configuración futura del receptor automático delta y sus límites está en RECEIVER.md. Mantener desactivado para la demostración. No es un servicio de producción.
