# Instalación en destino

Paquete sin datos, cuentas ni claves. Todo lo de abajo se rellena en el entorno de la empresa.

## Opción A: Docker
```
docker build -f deploy/Dockerfile -t expedient .
docker run -d --name expedient -p 127.0.0.1:4875:4875 -v expedient-data:/data \
  -e APP_PUBLIC_URL=https://expedient.empresa.example expedient
docker run --rm -i -v expedient-data:/data expedient node scripts/adduser.mjs ana admin   # la clave se lee por entrada estándar (mínimo 12 caracteres)
```
## Opción B: servidor Linux con systemd
Node 22 o superior. `npm ci --omit=dev`, copiar `deploy/expedient.env.example` a `/etc/expedient.env` (permisos 600) y `deploy/expedient.service` a `/etc/systemd/system/`. Crear usuarios con `npm run adduser -- ana admin`. Poner delante un proxy HTTPS (`deploy/nginx.conf.example`).

## Comprobaciones
- `GET /api/health` responde 200 sin datos (para monitorización).
- Con `APP_PUBLIC_URL` el servidor se niega a arrancar sin `APP_AUTH=local`.
- Roles: admin y operador escriben, lector solo lee. Las claves se guardan con scrypt. Cuenta bloqueada 15 min tras 5 fallos.
- Copia de seguridad SQLite: ver `docs/PRODUCCION.md` (`backupTo`, copia consistente con la base en uso) y probar la restauración en destino.

## Probado aquí (datos sintéticos) / se verifica al instalar
Probado: arranque con login, rutas cerradas sin sesión, rol lector sin escritura, rechazo de configuración pública sin autenticación, almacén SQLite. **No probado aquí:** construcción real de la imagen Docker, la unidad systemd, el proxy HTTPS, Microsoft Graph con correo real, rendimiento con usuarios simultáneos reales.
