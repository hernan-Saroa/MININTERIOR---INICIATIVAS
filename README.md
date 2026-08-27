# Iniciativas Legislativas

Sistema de seguimiento del trámite de iniciativas legislativas del
Viceministerio para el Diálogo Social y los Derechos Humanos, Ministerio del
Interior de Colombia.

Seis direcciones registran sus iniciativas, las mueven por un flujo de estados
configurable y adjuntan la documentación soporte como enlaces al repositorio
institucional. El despacho del Viceministro consulta el estado consolidado.

## Levantarlo

Guía completa en **`docs/instalacion.md`** — tres caminos: Docker, manual y
Antigravity. Lo esencial:

**Con Docker**, todo incluido:

```bash
cp .env.example .env              # completar contraseñas y SESSION_SECRET
docker compose up -d --build
docker compose exec api npm run crear-usuario     # primer administrador
./scripts/verificar-instalacion.sh
```

Las quince migraciones se aplican solas al crear el volumen. Solo sale al host
el puerto de Nginx (`PUERTO_PUBLICO`, 8080 por omisión).

**Con MySQL ya instalado**, un comando hace la base completa:

```bash
./scripts/instalar-base-de-datos.sh    # crea base, migra y crea el usuario
cd api && npm install && npm run crear-usuario && npm start
cd web && npm install && npm run dev
```

**Para desarrollo**, solo la base en contenedor:

```bash
docker compose -f docker-compose.dev.yml up -d
```

## Estructura

```
db/           Migraciones SQL numeradas. Toda la lógica de datos.
api/          Express. Solo llama procedimientos almacenados.
web/          React + Vite + TypeScript.
docker/       Dockerfiles y configuración de Nginx.
scripts/      Instalador de la base de datos y verificador.
referencia/   El frontend original sin React. Registro, no autoridad.
docs/         Migraciones, despliegue, pendientes y scripts de prueba.
.agents/      Reglas y flujos de trabajo para agentes.
AGENTS.md     Instrucciones permanentes. Empezar por aquí.
```

## Cómo está construido

**La API no arma SQL.** Cada endpoint hace `CALL sp_x(?, ?)` con parámetros
ligados. No hay concatenación de cadenas en ninguna parte, así que el sistema
es inmune a inyección SQL por construcción y no por disciplina.

**El flujo de estados es configurable.** Los estados, las transiciones
permitidas, quién puede ejecutar cada una y quién alcanza a ver una iniciativa
en cada estado se administran desde la pantalla, no desde el código. Cada
movimiento queda en `historial_iniciativa` con autor, fecha y motivo.

**Los roles son dinámicos, los permisos no.** Un permiso existe porque hay
código que lo verifica, así que el catálogo se amplía por migración. Los roles
los crea el administrador combinando permisos libremente.

**El diseño del tablero está bloqueado.** `web/src/tablero-aprobado.css` es el
CSS de `referencia/tablero-aprobado.html` portado literalmente. Es el aspecto
aprobado por el Viceministerio y no se modifica desde el código.

## Estado actual

Funciona y está probado:

- Las quince migraciones, idempotentes, con las guardas de flujo y roles.
- Autenticación con sesión en cookie, contraseñas con scrypt, bloqueo por
  intentos fallidos.
- Propuestas sin sesión y autorregistro, con adopción de las propuestas
  previas al crear la cuenta.
- El tablero en React reproduciendo el diseño aprobado, con panel de flujo e
  historial.
- Las cuatro pantallas de administración: usuarios, roles, flujo y
  estadísticas.

**Lo que falta:** `web/src/api/cliente.ts` tiene `USAR_SIMULADO = true`. La
interfaz corre contra un backend simulado en memoria porque los endpoints
`/api/admin/*` que exponen las migraciones 06 y 07 todavía no están escritos.
Ver `docs/pendientes.md`.

## Documentación

- `docs/instalacion.md` — **empezar por aquí** para poner el sistema a andar.
- `AGENTS.md` — instrucciones permanentes para agentes y personas nuevas.
- `.agents/rules/` — arquitectura, diseño y accesibilidad, base de datos.
- `docs/migraciones.md` — qué hace cada migración y cómo aplicarlas.
- `docs/despliegue.md` — puesta en producción y verificación.
- `docs/pendientes.md` — trabajo pendiente, en orden de dependencia.
