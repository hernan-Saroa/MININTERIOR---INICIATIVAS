# ms-iniciativas — Microservicio de iniciativas

## Rutas
- GET /iniciativas
- POST /iniciativas
- PATCH /iniciativas/:id
- DELETE /iniciativas/:id
- GET /direcciones
- POST /documentos
- DELETE /documentos/:id
- GET /exportar-csv

## Origen del código
api/rutas/iniciativas.js + documentos.js + direcciones.js

## Desarrollo
```bash
npm install
npm run dev     # http://localhost:3002
```

## Variables de entorno
```bash
cp .env.example .env
```
