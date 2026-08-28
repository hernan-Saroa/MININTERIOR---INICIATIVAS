# scripts

Utilidades de verificación y operación de la plataforma.

| Script | Qué hace |
|--------|----------|
| `aplicar-migraciones.sh` | Aplica **todas** las migraciones (`ms-*/migraciones/*.sql`) a una base MySQL, en orden global y sin duplicar. Misma lógica que el servicio `migrador` de Docker, pero suelto, para aplicarlas a mano en cualquier entorno. Idempotente. |
| `prueba-e2e.mjs` | Prueba de humo + contrato del gateway + flujo ciudadano, contra la plataforma ya levantada. La misma que corre la integración continua. |
| `verificar-contraste.js` | Comprueba el contraste de color (WCAG 2.1 AA) sobre las hojas de estilo reales de `front-tablero`. Exigido por la Resolución 1519 de 2020 del MinTIC. |

## Aplicar migraciones en cualquier entorno

En **Docker** no hace falta este script: el servicio `migrador` de
`infra-iniciativas` aplica las migraciones solo con `docker compose up`. Úsalo
cuando la base **no** la gestiona ese `migrador` (p. ej. el backend corre por
Node contra un MySQL suelto, o hay que reparar un entorno).

```bash
# Contra una base en un contenedor Docker (no requiere cliente mysql local):
DB_CONTAINER=iniciativas-mysql-1 DB_USER=root DB_PASSWORD=desarrollo \
  ./scripts/aplicar-migraciones.sh

# Contra una base accesible por red (requiere el cliente mysql):
DB_HOST=10.0.0.5 DB_PORT=3306 DB_USER=app DB_PASSWORD=... \
  DB_NAME=iniciativas_legislativas ./scripts/aplicar-migraciones.sh
```

Variables (con sus valores por defecto): `DB_NAME=iniciativas_legislativas`,
`DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_USER=root`, `DB_PASSWORD=` (vacío),
`DB_CONTAINER=` (si se define, usa `docker exec` en vez del cliente `mysql`).

Se corre desde la raíz del repositorio (donde están las carpetas `ms-*`). Es
idempotente: volver a ejecutarlo no rompe nada.

## Verificación

```bash
# Prueba end-to-end (con la plataforma corriendo)
node scripts/prueba-e2e.mjs
BASE_URL=http://localhost:8080 node scripts/prueba-e2e.mjs

# Contraste de color
node scripts/verificar-contraste.js
```

Ambos salen con código distinto de cero si algo falla, de modo que sirven en CI.
