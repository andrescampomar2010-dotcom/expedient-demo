FROM node:22-slim
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
