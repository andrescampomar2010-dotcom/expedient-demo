# Expedient

Demo local de preparación, revisión y asignación de expedientes documentales. Construida con datos sintéticos, sin relación operativa con empresas, clientes ni personas reales.

## Recorrido automático principal

Instala dependencias con `npm ci`, ejecuta `npm run demo:simulated` y abre `http://localhost:4875`. Al arrancar se recibe un correo sintético y se prepara un expediente automáticamente: hilo, adjunto XLSX, conciliación, regla de asignación, candidatos oficiales, incidencias y pasos. Abre Automatización para probar repetición, composición desconocida, descuadres y falta de packing. Ver [preparación y fuentes](docs/PREPARATION.md). La primera revisión sigue siendo humana antes de cualquier entrega.

## Envíos y ficha viva

Pantalla «Envíos»: cada correo se suma a la ficha de su envío, con resumen de última gestión y última información, rechazos cruzados por DUA y correcciones sin perder historial. Ver [docs/ENVIOS.md](docs/ENVIOS.md) y [qué falta para producción](docs/PRODUCCION.md).

## Conectar tu cuenta (solo lectura)

Ver [docs/CONECTAR.md](docs/CONECTAR.md). Microsoft exige que registres tu propia aplicación (paso externo, no hay conector listo). Después, `npm start` y http://localhost:4875/setup guardan tu configuración solo en tu equipo. No probado aún con cuenta real.

## Arrancar la aplicación

El producto principal es la app Node local con persistencia de servidor. Ver [inicio paso a paso](docs/START.md). Con Node.js 22+, descarga o clona el repositorio, ejecuta `npm ci` y después `npm run demo:simulated`, o `iniciar_demo.bat` en Windows. Abre `http://localhost:4875`. No necesita cuentas ni consumo para el modo simulado.

Guarda y recarga el espacio para compartir expedientes/avisos entre ventanas. Incluye control de revisión para bloquear sobrescrituras de otra sesión. El rol ficticio filtra la bandeja, NO es autenticación. Solo localhost, no producción.

## Extra offline, abrir sin instalar

Abre `Expedient_demo.html` en Chrome o Edge. En un envío por mensajería puede aparecer como `Expedient_demo.html.txt`: quita solo el último `.txt`.

Este HTML extra no necesita API, cuenta, servidor ni conexión de red. Los datos que añadas se guardan en este navegador. No cargues documentos reales en una demo destinada a compartirse.

## Flujo para probar

1. Carga el ejemplo ficticio.
2. Pulsa «Proponer HS desde referencias locales». El ejemplo offline usa un candidato NC8 con referencia oficial, pendiente de revisión y NO suficiente para una declaración.
3. Revisa la línea y marca su casilla.
4. Confirma la revisión del expediente. Los totales y las líneas incompletas bloquean esta revisión.
5. Elige Operador A o B y pulsa «Asignar y crear aviso local».
6. Abre Avisos y borradores. En el HTML, el aviso solo existe en este navegador. En la app servidor, guarda el espacio y abre otra ventana para verlo como el responsable ficticio.
7. Prepara un borrador y descárgalo como texto, sin enviarlo.
8. Descarga el expediente JSON o las líneas CSV. Ambos son salidas genéricas NO declarables, no un formato validado para un programa aduanero.
9. Cambia un dato: la revisión y la asignación quedan invalidadas y debe revisarse de nuevo.

## Implementado

- Creador de expedientes, líneas manuales e importación CSV con cabeceras explícitas.
- Propuestas de código por coincidencia exacta de descripción y material en referencias locales sintéticas. Sin evidencia o con conflicto, no propone código.
- Comprobaciones de datos, totales y revisión manual, trazabilidad de cambios.
- Asignación y bandeja local de avisos, borradores editables y exportación.
- Documentos TXT locales y seleccionados de OneDrive, búsqueda literal con fuente/fecha y preparación de consulta sobre hasta tres fuentes para revisar antes del análisis opcional.
- Demo adaptable a móvil, con bloqueo de red mediante Content Security Policy.
- Persistencia de servidor con escritura atómica, revisión concurrente y filtro de bandeja por responsable ficticio.
- UI conectada al backend Microsoft y Claude. Modo de simulación explícito, sin peticiones a proveedores. Desde la vista previa de correo se puede crear un expediente incompleto con su fuente.
- Adaptador Claude configurable, texto revisado y confirmación por petición, propuestas sin aplicar, desactivado por defecto. Ver `docs/CLAUDE.md`.
- Servidor Microsoft Graph de desarrollo, desactivado por defecto: OAuth con state y PKCE, sesiones en memoria, lectura de diez resúmenes de correo y veinte entradas raíz de OneDrive. Sin escritura o envío.

- Receptor automático Microsoft delta, con cursor, dedupe, actualización de hilo y parada segura. Apagado por defecto, sin prueba de tenant real. Ver [configuración exacta y limitaciones](docs/RECEIVER.md).

## No implementado / no validado

- Motores específicos de proveedores, OCR/PDF, reglas de un despacho real, validación TARIC actual, importación en sistemas aduaneros y presentación de declaraciones. Sí se integra un subconjunto real del parser XLSX de un preparador público existente y se genera un XLSX genérico revisado.
- Autenticación multiusuario y permisos de producción, correo enviado o avisos externos. Sí hay espacio compartido entre sesiones locales, persistido en disco.
- Indexación masiva/semántica y sincronización general de documentos. El correo tiene receptor delta opcional de una carpeta, apagado y solo probado con simulaciones, ver docs/RECEIVER.md. Sí se importa manualmente TXT pequeño de OneDrive con fuente y fecha; hay recuperación literal de hasta tres fuentes para una consulta revisada a Claude.
- MCP. Se ha elegido una API Graph de lectura para el adaptador, no se ofrece un servidor MCP.
- Validación con credencial Claude real o cuenta Microsoft real. Adaptadores escritos y probados solo con transportes ficticios. Activarlos requiere aprobación independiente de datos y gasto.
- Autenticación Graph con cuenta real. Las rutas están escritas pero solo se han probado en modo desactivado.

## Desarrollo

Node.js 22 o superior. Instala primero las dependencias:

```sh
npm ci
npm test
npm run build:html
npm start
```

`npm start` abre un servidor de desarrollo en `http://localhost:4875`, Graph desactivado. Las consultas manuales de la UI requieren pulsar sus botones. El receptor delta opcional consulta cada hora solo tras configuración explícita y autenticación; no arranca en la demo. La variante HTML autónoma bloquea red. No expongas este servidor a internet.

Para habilitar el adaptador autenticado se requiere revisar `docs/MICROSOFT.md` con el administrador. No actives Graph solo para ver la demo.

## Privacidad y publicación

Este proyecto usa solo datos inventados. No incluye correos históricos, clientes, rutas internas, documentos reales, secretos ni configuración de una organización.

La auditoría del paquete es un control acotado, no una garantía de anonimato universal. No añadas datos reales a fixtures, capturas, commits o incidencias. Revisa el árbol completo antes de publicar. Esta copia está preparada para publicación como repositorio independiente. Los conectores siguen desactivados; publicar fuentes no despliega ni activa el servidor.

El subconjunto del preparador existente retiene su licencia MIT y atribución pública al autor. No se ha añadido una licencia global al proyecto. La publicación permite consultar el código, pero no debe interpretarse como una concesión de licencia de código abierto para el conjunto. La licencia MIT del subconjunto reutilizado se conserva en `server/vendor/LICENSE-processor`.
