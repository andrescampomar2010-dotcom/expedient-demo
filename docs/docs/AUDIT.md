# Revisión del paquete, 23 noviembre 2026

## Alcance

Proyecto genérico nuevo, datos inventados. Se ha comprobado el árbol distribuido, HTML compilado, ejemplos, pruebas y documentación. Sin documentos adjuntos, registros, carpetas de sesión, tokens, `.env` real, dependencias instaladas o historial Git.

Controles de contenido: búsqueda de identificadores privados, marcas, rutas, referencias operativas, dominios. Cero coincidencias en el paquete. Búsqueda de patrones de claves privadas, claves API y JWT: cero coincidencias. Los identificadores visibles de la demo son genéricos, con correo `.test` y referencias ficticias.

El paquete se crea con una lista explícita de archivos y se abre después para comprobar sus entradas. Las capturas de comprobación se mantienen fuera del paquete de fuentes. El HTML entregado no contiene estado de una sesión de prueba, solo el ejemplo sintético incorporado en el código.

## Pruebas

- Doce pruebas automatizadas de dominio y servidor: evidencia inexistente/conflictiva, revisión incompleta, recorrido revisado/asignado, descuadre de totales, CSV ambiguo, Graph desactivado sin ruta de envío/escritura y rechazo de origen ajeno.
- Navegador de escritorio y móvil, HTML autónomo: propuesta sintética, revisión, asignación, aviso y borrador local, exportación JSON, búsqueda literal, invalidación de revisión al editar y anchura de pantalla.
- En esa ejecución: cero peticiones de red y cero errores JavaScript.
- Inspección visual directa de capturas de escritorio y móvil: formularios, revisión, avisos, borradores y conexiones.
- Dependencia MSAL 7.2.3 instalada, importada y cliente construido. Auditoría npm del lockfile: cero avisos conocidos en esa ejecución. No se ha iniciado OAuth ni consultado una cuenta Microsoft real.

## Límites

Esto no certifica la clasificación aduanera ni la seguridad de producción. Tampoco garantiza anonimato universal o ausencia de cualquier vulnerabilidad. Los datos que un usuario cargue en el futuro pueden ser personales. Las exportaciones reflejan los datos que ese usuario haya añadido y deben revisarse antes de compartirse.

Antes de publicar: revisar `git status`, archivos ignorados y adjuntos, escanear secretos, confirmar que no se ha añadido un historial previo, elegir licencia y revisar documentación. Antes de activar Graph o una IA: revisión de seguridad, alcance, cuenta, destinatarios, retención y autoridad específica. Las pruebas actuales no sustituyen esas revisiones.

## Revisión de app servidor

Pruebas adicionales: persistencia tras reinicio, revisión concurrente bloqueada, Claude desactivado sin red, transporte fijo inyectado, CSRF y contrato simulado UI/API. Navegador: correo y archivos simulados, vista previa a expediente incompleto, confirmación antes de analizar, propuesta sin modificar HS, anchura 320/390/1280. Dos contextos de navegador aislados: asignar/guardar, ver aviso como responsable, marcar leído/guardar, recargar en el primero; sobrescritura de versión antigua bloqueada. No peticiones externas ni errores JS en el recorrido simulado. Capturas de integración y bandeja compartida inspeccionadas directamente.

Persistencia de prueba y datos runtime excluidos. No se incluyen archivos data/ ni variables de entorno reales. Roles ficticios son filtros, no controles de acceso.

Revisión 0.2.0: descarga de TXT por URL suministrada por Graph, host HTTPS permitido, sin credencial bearer en descarga, tamaño y formato limitados; pruebas con transporte ficticio. UI importación elegida con fuente y fecha, búsqueda literal y preparación de pregunta con hasta tres extractos, probadas sin proveedor externo. Corregido footer para distinguir datos en navegador de datos guardados en servidor. Revisión de avisos/borradores obsoletos después de editar expediente.

## Revisión 0.3.0

Diecisiete pruebas Node aprobadas. Añadidas: recepción automática sintética, parser XLSX existente, ruta de preparación, evidencia HS6/NC8 sin aplicación automática, idempotencia, casos ambiguo/descuadre/documento faltante, territorio/fecha y exportación XLSX bloqueada sin revisión. Cuatro recorridos Chrome aprobados, incluido evento al arrancar, duplicado, descuadre bloqueante y aceptación/revisión/guardado/exportación. Cero peticiones externas y errores JS en el recorrido automático.

El XLSX exportado se abrió con ExcelJS para verificar contenido y se convirtió a PDF con LibreOffice para revisar visualmente aviso, líneas y agrupación. Se corrigió el recorte de textos del aviso antes de terminar. Las capturas UI de 320/390/1280 y los extractos móviles fueron inspeccionados directamente. Auditoría npm final sin avisos conocidos, aunque ExcelJS arrastra dependencias con avisos de obsolescencia. Override uuid 11.1.1 probado con parser y exportación.

No se copiaron bases históricas o reglas de proveedores del preparador público. El subconjunto de parser se extrajo por funciones y conserva licencia MIT. La atribución al autor público y enlaces a sus repositorios se mantienen intencionalmente; anonimización aquí significa sin datos de empresa, clientes, contactos operativos o documentos reales, no borrar al dueño de su portfolio. El fixture XLSX se genera nuevo con autor sintético y fecha fija, sin rutas ni propiedades de documentos reales.

## Receptor v0.4

Microsoft apagado por defecto. Se añadió código de delta, no conexión real. Pruebas de replay/paginación/actualización/persistencia/fallo usan transportes simulados. Snapshot de versión anterior se conserva antes de reemplazar preparación. Ningún cuerpo de correo se usa como instrucción de herramienta. Cuenta, carpeta y fecha quedan vinculadas al cursor. No se envían correos ni se escribe en tenant. La interfaz informa de la necesidad de recargar estado. Límites y huecos de seguridad para producción en RECEIVER.md.
