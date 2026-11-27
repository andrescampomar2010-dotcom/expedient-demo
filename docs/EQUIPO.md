# Equipo ficticio y tareas por envío

Dos piezas de la demo:

- **Barra de personas**: aparece en Expedientes, Tareas, Envíos y Avisos. Cada persona ficticia tiene nombre, rol (Coordinador / Operador), recuento de trabajo abierto (tareas de envío + expedientes asignados) y marca de ausencia. Pulsar una persona muestra la bandeja como la vería ella: la persona coordinadora lo ve todo, las operadoras solo lo suyo. Es un filtro ficticio, no autenticación ni control de permisos.
- **Ausencia**: el botón ✋/↩ de cada persona la marca ausente o de regreso. Una persona ausente no recibe asignaciones nuevas (expedientes ni tareas: los desplegables la excluyen y el servidor rechaza asignarle un expediente), pero sus tareas abiertas siguen visibles en «Tareas» con el aviso de ausencia para reasignarlas a mano. La reasignación por ausencia es manual.
- **Tareas por envío**: cada envío tiene tareas internas (trabajo del equipo) y externas (espera de cliente/proveedor), con persona y vencimiento opcional y siempre explícito. La ficha del envío las lista, permite completarlas («Hecha») y crear nuevas. La pantalla «Tareas» las agrupa por persona y permite reasignarlas.
- **Etiquetas de vencimiento** : «vencida Xd», «HOY», «mañana», «en Xd», calculadas al mostrar.
- **Avisos de la ficha** : «Sin movimiento desde hace X días» cuando un envío lleva 4 o más días sin eventos, y «ETA … sin borrador registrado» cuando la ETA explícita de la ficha está a 7 días o menos (o vencida) y no hay ningún evento de borrador. Ninguno de los dos inventa datos: sin ETA explícita no hay aviso de ETA.
- **Separación**: los correos por clasificar NO son tareas. Siguen aparte en Envíos → Pendientes.

## Límites

- No hay tabla de agentes configurable (definición de personas y reglas de reparto).
- La disposición visual de la barra es sencilla y no configurable.
- No hay regla automática de reasignación por ausencia.

## Persistencia

Las personas viven en el espacio de trabajo (localStorage en el HTML; documento del espacio en el servidor). Las tareas viajan dentro de la ficha de cada envío, incluido el almacén por registro SQLite (`add-task`, `complete-task`, `assign-task`, `assign-shipment` en `/api/shipments/op`, con CSRF y origen como el resto). En modo servidor, los recuentos de la barra y la vista Tareas consultan TODOS los envíos abiertos (tope 200), no solo la página cargada, y la propia vista indica el alcance («Recuento sobre N envíos abiertos de M en total…») cuando hay paginación o tope. Los avisos de envíos (inactividad, ETA) se calculan sobre las fichas abiertas en pantalla y la vista lo indica.
