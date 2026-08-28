# Instalación para desarrollo

Puesta en marcha local de la plataforma para trabajar el código. Para
despliegue en servidores, ver **`docs/GUIA_DESPLIEGUE_CLOUD.md`**.

## Requisitos

- Docker Desktop (para la base de datos)
- Node.js 20+ y npm 10+
- Git (los 12 repositorios son submódulos)

Clonar con submódulos:

```bash
git clone --recurse-submodules <url-del-agregador>
# o, si ya está clonado:
git submodule update --init --recursive
```

## Opción A — Todo en Docker (la más simple)

```bash
cp .env.example .env          # completar contraseñas, SESSION_SECRET, SERVICIO_TOKEN
docker compose up -d --build
```

Levanta la base (con las migraciones aplicadas por el servicio `migrador`), los
seis microservicios, el gateway y los tres frontends. Abrir el tablero en
`http://localhost:8080`.

En Windows: `.\start_all.ps1`.

## Opción B — Servicios en caliente (recarga al guardar)

Solo la base en contenedor, y cada servicio corriendo con `npm run dev`:

```bash
docker compose -f docker-compose.dev.yml up -d      # MySQL + migraciones (dev)
```

En Windows, lo mismo con `.\start_all.ps1 -Dev`.

Luego, en terminales separadas, cada microservicio y el gateway:

```bash
cd ms-autenticacion  && npm install && npm run dev     # y cada ms-*
cd api-gateway       && npm install && npm run dev
cd front-tablero     && npm install && npm run dev      # http://localhost:5173
```

Cada servicio necesita su `.env` (copiar el `.env.example` de cada repositorio y
completar `DB_*`, `SESSION_SECRET` y `ORIGEN_PERMITIDO`). El
`SESSION_SECRET` debe ser **el mismo** en los seis microservicios: es lo que
permite que la sesión iniciada en uno la validen los demás.

Puertos locales de los frontends: tablero `5173`, radicación `5174`, admin
`5175`. Los microservicios usan `3001`–`3006` y el gateway `3000`.

## Base de datos

Una sola base, `iniciativas_legislativas`, compartida por los seis
microservicios. Las migraciones viven en `ms-*/migraciones/` y se aplican en
orden numérico global (el servicio `migrador` de Docker lo hace solo). Detalle
en **`docs/migraciones.md`**.

## Verificar que quedó bien

Con la plataforma levantada:

```bash
node scripts/prueba-e2e.mjs                 # humo + contrato del gateway + flujo
BASE_URL=http://localhost:8080 node scripts/prueba-e2e.mjs
```

Debe terminar con «pasadas» y sin fallidas. Es la misma prueba que corre la
integración continua.

## Primer usuario administrador

El autorregistro público crea cuentas de rol `lector` pendientes de aprobación.
Para tener un administrador inicial, sembrar la cuenta directamente en la base y
asignarle el rol `administrador` (`rol_id` correspondiente en la tabla `roles`),
o promover una cuenta existente desde otra ya administradora. El procedimiento
para servidores está en `docs/GUIA_DESPLIEGUE_CLOUD.md`.

## Problemas frecuentes

- **`npm ci` falla:** los backends traen `package-lock.json`; asegúrese de estar
  en la raíz de cada repositorio.
- **«Inicie sesión» tras autenticarse:** revise que `SESSION_SECRET` sea idéntico
  en los seis microservicios y que la base tenga la tabla `sesiones`.
- **CORS bloquea el navegador:** defina `ORIGEN_PERMITIDO` con el origen del
  frontend; en producción es obligatorio.
