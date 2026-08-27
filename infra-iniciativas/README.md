# infra-iniciativas — Orquestación de Infraestructura

Repositorio de infraestructura que orquesta los 12 servicios del sistema
de iniciativas legislativas.

## Servicios

| Servicio | Puerto interno | Puerto público |
|---|---|---|
| front-tablero | 80 | 8080 |
| front-radicacion | 80 | 8081 |
| front-admin | 80 | 8082 |
| api-gateway | 3000 | — (red interna) |
| ms-autenticacion | 3001 | — |
| ms-iniciativas | 3002 | — |
| ms-radicacion | 3003 | — |
| ms-flujo-estados | 3004 | — |
| ms-notificaciones | 3005 | — |
| ms-administracion | 3006 | — |
| 6 × MySQL | 3306 | — |
| Redis | 6379 | — |

## Uso

```bash
cp .env.example .env    # Completar con valores reales
docker compose up -d --build
```

## Estructura

```
infra-iniciativas/
├── docker-compose.yml       # Producción (todo)
├── docker-compose.dev.yml   # Desarrollo local
├── .env.example             # Variables unificadas
└── README.md
```
