# Preparación por evento, revisión 0.3.0

## Qué ejecuta de verdad

`npm run demo:simulated` ingiere un evento de correo al arrancar. No hay que abrir Outlook ni pulsar crear expediente. El receptor sintético ejecuta el mismo servicio interno: deduplicar ID, reunir correo e hilo aportado por el evento, asignar la preparación por reglas explícitas, abrir adjunto XLSX, detectar hojas/columnas con el parser integrado, conciliar por referencia y totales, consultar el catálogo acotado con la ficha técnica, crear secciones, avisos internos, incidencias y pasos siguientes, persistir en servidor.

La simulación incluye casos completo, composición desconocida, unidades distintas y packing ausente. Se inyectan desde Automatización. Repetir ID no crea caso o aviso adicional. No se ejecutan herramientas ni instrucciones contenidas en correos. Las reglas sintéticas son del programa, no del remitente. La recepción Microsoft real mediante delta/webhook sigue sin implementar, aunque existen las rutas manuales Graph de la revisión anterior.

## Preparador existente integrado

Se recuperó el código público de:
https://github.com/andrescampomar2010-dotcom/customs-clearance-processor
Commit inspeccionado: `1e16e96609a0716b4836248da8b0566c0d2f497e`.

Se extrajeron funciones reales del parser de hojas del proyecto a `server/vendor/processor-parser.mjs`: detección de columnas y hojas, lectura de filas, celdas combinadas y dependencias. Los adjuntos XLSX sintéticos se procesan con ese código en el recorrido automático. No es un enlace que dice integrar sin ejecutar. Se retiene su licencia MIT en `server/vendor/LICENSE-processor`, incluida su atribución pública al autor. No se copia su base histórica, proveedores, reglas operativas, capturas o workbook de ejemplo.

El código extraído conserva sus heurísticas y tiene un contrato acotado probado. No afirma reproducir todo el preparador ni generar sus formatos específicos. Se usa ExcelJS 4.4.0 con override uuid 11.1.1, probado con carga/exportación y auditoría de dependencias. Instalar con `npm ci`.

## Evidencia HS y NC

Ejemplo territorio UE, fecha 2026-11-23. Catálogo pequeño de la edición NC 2026, anexo I, parte II, sección XX, capítulo 96 del Reglamento de Ejecución (UE) 2025/1926. Consultado el 23/11/2026. Fuente oficial:
https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202501926

La página oficial enlaza al texto íntegro también en:
http://publications.europa.eu/resource/cellar/c3c0d050-b5fa-11f0-b37f-01aa75ed71a1.0006.03/DOC_1

El anexo completo se leyó para confirmar: 9609 10 10, minas de grafito enfundadas; 9609 10 90, demás del mismo nivel; 9608 40 00, portaminas. El artículo 2 aplica el anexo desde 01/01/2026. Se muestra HS6 y candidato NC8, sin añadir ceros TARIC10 o tasas. La ficción está en las mercancías y documentos, no en los códigos. Los textos ingleses en UI son síntesis del encabezado/subpartida oficial, no una traducción legal autenticada.

La ficha técnica sintética acredita función de escritura, objeto suelto/no juego, mecanismo fijo o mecánico, composición y origen. Si no hay datos técnicos, fecha/territorio no cubiertos o producto distinto, se deja HS vacío. Los descartes y datos que faltan se muestran. Aun con candidato único, HS queda vacío hasta aceptación humana; aceptar tampoco confirma la línea ni el expediente.

No se verifica TARIC vigente al día de declaración, medidas comerciales, restricciones, clasificación de sets o mercancía compuesta ni una IAV aplicable. Un catálogo oficial prueba el texto de la subpartida, no la correcta clasificación de una mercancía real. Esta app no emite un dictamen vinculante.

## Conciliación y salida

Se contrastan unidades factura/packing por referencia; valor, neto, bruto, bultos y unidades contra totales declarados del fixture; origen y fuentes por fila. Packing faltante, duplicado o sin pareja, falta de datos, neto mayor que bruto, cantidades inválidas y ambigüedad clasificatoria bloquean revisión. Editar datos de un caso automático marca la conciliación como obsoleta; no se puede mantener como válida sin reingesta corregida. En esta revisión la corrección de fixtures es de desarrollo, no hay editor/reproceso con revisiones del evento en UI.

Después de aceptar candidatos, confirmar líneas, revisar y guardar, se exporta un XLSX genérico con aviso no declarable, líneas, agrupación por NC/origen y auditoría. No es DUA ni formato certificado para un software de despacho. JSON incluye hilo, evidencias, adjunto sintético con hash y decisiones. No hay envío externo.
