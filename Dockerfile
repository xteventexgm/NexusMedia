# Monorepo: build del backend desde la raíz (Railway / GitHub sin Root Directory)
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV NEXUS_DATA_DIR=/app/data

RUN apk add --no-cache tini

COPY servidor/package.json servidor/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY servidor/server.js ./
COPY servidor/src ./src

RUN mkdir -p /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
