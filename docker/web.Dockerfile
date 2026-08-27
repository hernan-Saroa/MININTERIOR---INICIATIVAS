# --- Etapa de compilación ---------------------------------------------
FROM node:22-alpine AS build

WORKDIR /build
COPY web/package*.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

# --- Imagen final: solo Nginx con los archivos estáticos --------------
FROM nginx:1.27-alpine

COPY --from=build /build/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=4s --start-period=8s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
