FROM node:22-alpine

WORKDIR /app

# Las dependencias se instalan antes de copiar el código, para que la capa
# se reutilice mientras package.json no cambie.
COPY api/package*.json ./
RUN npm ci --omit=dev

COPY api/ ./

# No correr como root
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=4s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
