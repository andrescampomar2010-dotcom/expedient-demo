# Envíos: ficha viva por envío

Pantalla **Envíos**. Cada correo que entra se relaciona con un envío y se suma a su ficha sin perder el historial.

## Qué hace

- **Ficha viva**: historial con fecha y fuente (el correo que lo demuestra), matrículas con su histórico y todos los correos del envío.
- **Resumen** arriba de cada envío: expediente, DUA, bultos, kg, **última gestión hecha** (acciones nuestras: DUA presentado, subsanación, documentación enviada) y **última información recibida**, ambas con fecha y fuente.
- **Rechazos**: se marcan en rojo «Rechazo recibido y sin gestión posterior registrada» hasta que hay una gestión nuestra posterior (o un levante). Dice «sin gestión registrada», no «nadie lo ha gestionado»: solo conoce los correos que han llegado a la app.
- **Cruce de rechazos**: primero por número de DUA, luego expediente y referencia (`TR-xxxx`), luego misma conversación de correo. Esas coincidencias se asignan solas y explican por qué. Si solo coinciden bultos y kilos, o solo el remitente, **nunca se asigna solo**: queda en Pendientes con un botón por candidato («posible coincidencia, no es segura»). Referencias que apuntan a envíos distintos también van a Pendientes.
- **Correcciones**: un dato nuevo que contradice a otro (matrícula distinta, kg distintos) no borra el anterior. Matrícula: se registra la sustitución y se conserva la anterior. Bultos/kg: se avisa en la ficha, sin cambiar la ficha.
- **Búsqueda** por DUA, expediente (acepta «exp 2611 03», mayúsculas o minúsculas), matrícula (1234 BCD, 1234-BCD) y palabras del correo.
- **Nuevo envío**: al crearlo se reevalúan los correos pendientes que ahora puedan identificarse por referencia exacta.

## Cómo decide (reglas, sin IA)

Código en `web/shipments.mjs`, probado en `tests/shipments.test.mjs`. La IA no es necesaria para estas reglas. Una IA opcional (Claude, desactivada por defecto) podría **proponer** a qué envío pertenece un correo sin referencias, pero el sistema comprobaría las referencias y la confirmación seguiría siendo humana. Esa parte NO está implementada.

## Cómo entran los correos

- **Modo simulado/local**: botón «Simular llegada» con correos ficticios.
- **Con Outlook conectado** (`MAIL_INTAKE_ENABLED=true`, ver CONECTAR.md): el receptor existente pasa cada mensaje nuevo de la carpeta vigilada por la misma lógica. Indica tus dominios de correo en `OWN_MAIL_DOMAINS=empresa.example,otra.example` para que los correos enviados por vosotros cuenten como «gestión». Los dominios de cliente/proveedor se declaran en cada envío y solo sirven para proponer.

## Límites conocidos

- Solo se vigila **una** carpeta; para ver vuestras gestiones enviadas hace falta vigilar también Elementos enviados (receptor adicional, no hecho).
- El receptor de desarrollo consulta como mínimo cada 60 minutos.
- No lee el texto de adjuntos escaneados (sin OCR). Los nombres de adjuntos sí se buscan.
- Probado con correos ficticios y simulaciones de Graph. No probado con una cuenta real de Outlook.
