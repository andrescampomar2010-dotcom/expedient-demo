FROM node:22-slim
# Se exige Node >= 22.13.0: la imagen falla al construir si el tag 22 resolviera a algo anterior.
RUN node -e "const [a,b]=process.versions.node.split('.').map(Number);if(!(a>=24||(a===22&&b>=13)))process.exit(1)"
# OCR local de PDF escaneados (sin servicio externo). Sin estos paquetes la app arranca y marca los escaneos como "OCR no disponible".
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng poppler-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN useradd -r -u 10001 expedient && mkdir -p /data && chown expedient /data
USER expedient
ENV PORT=4875 APP_BIND=0.0.0.0 APP_DATA_PATH=/data/expedient.db APP_USERS_PATH=/data/users.json APP_AUTH=local
VOLUME /data
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health',{headers:{host:new URL(process.env.APP_PUBLIC_URL||'http://localhost:'+process.env.PORT).host}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server/server.mjs"]
