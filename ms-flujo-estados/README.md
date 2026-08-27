# ms-flujo-estados — Microservicio del flujo de estados

## Rutas
- GET /flujo/estados
- GET /flujo/transiciones/:id
- POST /flujo/mover
- GET /flujo/historial/:id

## Origen del código
api/rutas/admin.js (parte de flujo)

## Desarrollo
```bash
npm install
npm run dev     # http://localhost:3004
```

## Variables de entorno
```bash
cp .env.example .env
```
