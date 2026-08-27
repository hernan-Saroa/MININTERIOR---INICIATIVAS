# front-admin — Panel de Administración

Panel de administración del sistema: gestión de usuarios, roles y permisos,
configuración del flujo de estados y estadísticas.

## Pantallas
- **Usuarios** — Lista, aprobación, asignación de roles
- **Roles y permisos** — Crear roles, asignar permisos
- **Flujo de estados** — Configurar máquina de estados, transiciones, responsables
- **Estadísticas** — Métricas de iniciativas por estado, tiempos promedio

## Desarrollo

```bash
npm install
npm run dev     # http://localhost:5175
```

## Variables de entorno

| Variable | Descripción |
|---|---|
| `VITE_API_GATEWAY_URL` | URL del API Gateway |
