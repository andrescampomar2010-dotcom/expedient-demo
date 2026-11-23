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
