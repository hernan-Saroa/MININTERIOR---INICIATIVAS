# 🏛️ Guía de Despliegue en Servidores — Sistema de Iniciativas Legislativas

**Ministerio del Interior de Colombia**  
**Viceministerio para el Diálogo Social y los Derechos Humanos**  
**Fecha:** 27 de agosto de 2026  
**Versión:** 1.0  
**Rama de referencia:** `develop`

> **⚠️ CLASIFICACIÓN:** Uso Institucional Restringido.  
> Los datos incluyen trámites de **consulta previa** y **garantías para personas defensoras de derechos humanos**. Los repositorios son **privados** y el acceso está restringido al equipo autorizado.

---

## Tabla de Contenido

1. [Descripción del Sistema](#1-descripción-del-sistema)
2. [Diagrama de Arquitectura](#2-diagrama-de-arquitectura)
3. [Inventario de los 12 Repositorios](#3-inventario-de-los-12-repositorios)
4. [Requisitos del Servidor](#4-requisitos-del-servidor)
5. [Variables de Entorno](#5-variables-de-entorno)
6. [Procedimiento de Despliegue Paso a Paso](#6-procedimiento-de-despliegue-paso-a-paso)
7. [Base de Datos y Migraciones](#7-base-de-datos-y-migraciones)
8. [Creación de la Primera Cuenta Administradora](#8-creación-de-la-primera-cuenta-administradora)
9. [Verificación Post-Despliegue](#9-verificación-post-despliegue)
10. [Respaldos y Mantenimiento](#10-respaldos-y-mantenimiento)
11. [Políticas de Red y Seguridad](#11-políticas-de-red-y-seguridad)
12. [Solución de Problemas Frecuentes](#12-solución-de-problemas-frecuentes)

---

## 1. Descripción del Sistema

Sistema web de seguimiento de iniciativas legislativas de las direcciones vinculadas al Viceministerio para el Diálogo Social y los Derechos Humanos. Registra el estado del trámite, prioridad, documentación soporte y flujo de aprobación. Incluye un canal público para radicación ciudadana y un panel administrativo de usuarios, roles y permisos.

**Arquitectura:** Microfrontends + API Gateway + 6 Microservicios + 1 Base de Datos MySQL compartida + Redis.

---

## 2. Diagrama de Arquitectura

```
                         ┌──────────────────────────────────────────┐
                         │       INTERNET / RED INSTITUCIONAL       │
                         └─────────────────────┬────────────────────┘
                                               │
                         ┌─────────────────────▼────────────────────┐
                         │    BALANCEADOR DE CARGA / REVERSE PROXY  │
                         │      (Terminación SSL/TLS · HTTPS 443)   │
                         └───────┬─────────────┬─────────────┬──────┘
                                 │             │             │
                      ┌──────────▼───┐  ┌──────▼──────┐  ┌──▼──────────┐
                      │front-tablero │  │  front-     │  │ front-admin │
                      │  Nginx :80   │  │ radicacion  │  │  Nginx :80  │
                      │ Host: 8080   │  │  Nginx :80  │  │ Host: 8082  │
                      └──────────┬───┘  │ Host: 8081  │  └──┬──────────┘
                                 │      └──────┬──────┘     │
                         ┌───────▼─────────────▼────────────▼───────┐
                         │              API GATEWAY                 │
                         │         Express · Puerto 3000            │
                         │   Enrutamiento · CORS · Rate Limit       │
                         └───┬────┬────┬────┬────┬────┬─────────────┘
                             │    │    │    │    │    │
          ┌──────────────────┘    │    │    │    │    └──────────────────┐
          │          ┌────────────┘    │    │    └──────────┐           │
          │          │        ┌────────┘    └────────┐      │           │
          ▼          ▼        ▼                      ▼      ▼           ▼
    ┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────┐┌──────────┐
    │ ms-auth  ││ms-iniciat││ms-radica ││ ms-flujo ││ms-not││ms-admin  │
    │  :3001   ││  :3002   ││  :3003   ││  :3004   ││:3005 ││  :3006   │
    └────┬─────┘└────┬─────┘└────┬─────┘└────┬─────┘└──┬───┘└────┬─────┘
         │           │           │           │         │         │
         └───────────┴───────────┴─────┬─────┴─────────┘         │
                                       │                         │
                                 ┌─────▼──────┐            ┌─────▼─────┐
                                 │   MySQL    │            │   Redis   │
                                 │    8.4     │            │  7-alpine │
                                 │   :3306    │            │   :6379   │
                                 │ (interna)  │            │ (interna) │
                                 └────────────┘            └───────────┘
```

### Nota de Consolidación de Base de Datos

La orquestación usa **UNA sola base MySQL** llamada `iniciativas_legislativas`, compartida por los seis microservicios. Las 17 migraciones hacen `USE iniciativas_legislativas` y alteran tablas entre sí (autenticación, radicación y flujo hacen `ALTER` sobre `usuarios` e `iniciativas`). Además, el almacén de sesiones (`express-mysql-session`, tabla `sesiones`) debe ser el **MISMO** para todos los servicios, o la sesión iniciada en un servicio no vale en los demás.

---

## 3. Inventario de los 12 Repositorios

### 3.1 Frontends

| # | Repositorio | Puerto Host | Stack | Descripción |
|---|---|---|---|---|
| 1 | `front-tablero` | **8080** | React 19 · Vite 6 · TypeScript · CSS | Tablero principal de seguimiento de iniciativas legislativas |
| 2 | `front-radicacion` | **8081** | React 19 · Vite 6 · TypeScript · CSS | Portal público ciudadano para radicar y consultar propuestas |
| 3 | `front-admin` | **8082** | React 19 · Vite 6 · TypeScript · CSS | Panel administrativo de usuarios, roles, permisos y métricas |

### 3.2 Microservicios Backend

| # | Repositorio | Puerto Interno | Stack | Descripción |
|---|---|---|---|---|
| 4 | `ms-autenticacion` | 3001 | Node.js 22 · Express · MySQL · scrypt | Autenticación, sesiones y recuperación de contraseñas |
| 5 | `ms-iniciativas` | 3002 | Node.js 22 · Express · MySQL | Gestión de trámites, documentos y exportación CSV |
| 6 | `ms-radicacion` | 3003 | Node.js 22 · Express · MySQL | Recepción de propuestas ciudadanas y consulta pública |
| 7 | `ms-flujo-estados` | 3004 | Node.js 22 · Express · MySQL | Máquina de estados, transiciones y auditoría de trazabilidad |
| 8 | `ms-notificaciones` | 3005 | Node.js 22 · Redis · Nodemailer | Cola de correos institucionales y plantillas HTML |
| 9 | `ms-administracion` | 3006 | Node.js 22 · Express · MySQL | Gestión de cuentas, catálogo de roles y reportes |

### 3.3 Infraestructura y Compartidos

| # | Repositorio | Stack | Descripción |
|---|---|---|---|
| 10 | `api-gateway` | Node.js 22 · Express · http-proxy-middleware | Punto de entrada único: enrutamiento, CORS y rate limit |
| 11 | `infra-iniciativas` | Docker Compose · Nginx · Alpine | Orquestación de contenedores y manifiestos de producción |
| 12 | `tipos-compartidos` | TypeScript NPM Package | Contratos y tipos compartidos entre frontends y microservicios |

### URLs de los Repositorios en GitHub

| Repositorio | URL |
|---|---|
| `front-tablero` | `https://github.com/hernan-Saroa/front-tablero.git` |
| `front-radicacion` | `https://github.com/hernan-Saroa/front-radicacion.git` |
| `front-admin` | `https://github.com/hernan-Saroa/front-admin.git` |
| `ms-autenticacion` | `https://github.com/hernan-Saroa/ms-autenticacion.git` |
| `ms-iniciativas` | `https://github.com/hernan-Saroa/ms-iniciativas.git` |
| `ms-radicacion` | `https://github.com/hernan-Saroa/ms-radicacion.git` |
| `ms-flujo-estados` | `https://github.com/hernan-Saroa/ms-flujo-estados.git` |
| `ms-notificaciones` | `https://github.com/hernan-Saroa/ms-notificaciones.git` |
| `ms-administracion` | `https://github.com/hernan-Saroa/ms-administracion.git` |
| `api-gateway` | `https://github.com/hernan-Saroa/api-gateway.git` |
| `infra-iniciativas` | `https://github.com/hernan-Saroa/infra-iniciativas.git` |
| `tipos-compartidos` | `https://github.com/hernan-Saroa/tipos-compartidos.git` |

---

## 4. Requisitos del Servidor

### Hardware Mínimo

| Recurso | Mínimo | Recomendado |
|---|---|---|
| CPU | 4 vCPU (x86_64) | 8 vCPU |
| RAM | 8 GB | 16 GB |
| Almacenamiento | 50 GB SSD | 100 GB NVMe (backups y logs) |

### Software Requerido

| Software | Versión Mínima | Comando de Verificación |
|---|---|---|
| Sistema Operativo | Ubuntu 22.04/24.04 LTS, RHEL 9, Rocky 9 | `cat /etc/os-release` |
| Docker Engine | 26.0+ | `docker --version` |
| Docker Compose | 2.24+ (plugin `docker compose`) | `docker compose version` |
| Git | 2.40+ | `git --version` |

### Conectividad Requerida

- Acceso saliente a Docker Hub para descargar imágenes base (`mysql:8.4`, `redis:7-alpine`, `node:22-alpine`).
- Acceso saliente SMTP para envío de notificaciones por correo institucional (si se activa `ms-notificaciones`).
- Acceso entrante en los puertos 80/443 para el balanceador/reverse proxy.

---

## 5. Variables de Entorno

Crear el archivo `.env` en la carpeta `infra-iniciativas/` a partir de la plantilla:

```bash
cd /opt/iniciativas/infra-iniciativas
cp .env.example .env
```

### Variables obligatorias

```bash
# =====================================================================
# CONFIGURACIÓN DE PRODUCCIÓN — MINISTERIO DEL INTERIOR
# Archivo: infra-iniciativas/.env
# =====================================================================

# ----- Contraseñas de Base de Datos -----
# Generar cadenas seguras de 32+ caracteres. Ejemplo:
# openssl rand -base64 32
DB_ROOT_PASSWORD=<contraseña_root_segura_32_caracteres>
DB_PASSWORD=<contraseña_aplicación_segura_32_caracteres>
DB_USER=iniciativas_app

# ----- Clave Secreta de Sesión -----
# OBLIGATORIO: genera la firma de las cookies de sesión.
# Si se cambia, se cierran TODAS las sesiones activas.
# Generar con:
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
SESSION_SECRET=<cadena_generada_64_caracteres>

# ----- Token de Servicio (envío de correo) -----
# OBLIGATORIO en producción: sin él, ms-notificaciones NO ARRANCA (falla
# cerrado). Solo quien lo envíe en la cabecera x-servicio-token puede pedir
# el envío de un correo, de modo que el servicio no es un relay abierto.
# Generar con:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
SERVICIO_TOKEN=<cadena_generada_43_caracteres>

# ----- Dominio Oficial y CORS -----
# Sin ORIGEN_PERMITIDO, los servicios no arrancan en producción (no se
# permite reflejar cualquier origen). Acepta varios separados por comas.
ORIGEN_PERMITIDO=https://iniciativas.mininterior.gov.co

# ----- Puertos Públicos -----
PUERTO_TABLERO=8080
PUERTO_RADICACION=8081
PUERTO_ADMIN=8082

# ----- Entorno -----
# En production la cookie de sesión EXIGE HTTPS.
# Si el servidor aún no tiene certificado SSL, dejar en blanco temporalmente.
NODE_ENV=production
```

> **⚠️ IMPORTANTE:** El `SESSION_SECRET` debe ser **idéntico** en los 6 microservicios. El `docker-compose.yml` ya lo distribuye automáticamente a todos. **No subir el archivo `.env` al repositorio.**

---

## 6. Procedimiento de Despliegue Paso a Paso

### Paso 1 — Clonar el repositorio con todos los submódulos

```bash
git clone --recurse-submodules https://github.com/hernan-Saroa/Iniciativas.git /opt/iniciativas
cd /opt/iniciativas

# Cambiar a la rama de producción (o develop según corresponda)
git checkout develop
git submodule update --init --recursive
```

### Paso 2 — Verificar que los 12 submódulos están presentes

```bash
git submodule status
```

Debe mostrar 12 líneas, una por cada repositorio. Si alguna muestra un `-` al inicio, ejecutar:

```bash
git submodule update --init --recursive
```

### Paso 3 — Configurar variables de entorno

```bash
cd /opt/iniciativas/infra-iniciativas
cp .env.example .env
nano .env
# Completar TODAS las variables según la sección 5
```

### Paso 4 — Construir y levantar los contenedores

```bash
cd /opt/iniciativas/infra-iniciativas
docker compose up -d --build
```

**¿Qué hace este comando?**

1. Construye las imágenes Docker de los 6 microservicios, el API Gateway y los 3 frontends.
2. Levanta el contenedor MySQL 8.4 con charset `utf8mb4` y collation `utf8mb4_unicode_ci`.
3. Ejecuta automáticamente el contenedor `migrador`, que aplica las 17 migraciones SQL en orden numérico (es un one-shot que termina al completar).
4. Levanta Redis 7 para colas y caché.
5. Levanta los 6 microservicios Node.js conectados a la base compartida.
6. Levanta el API Gateway que enruta las peticiones a los microservicios.
7. Levanta los 3 frontends compilados servidos por Nginx.

### Paso 5 — Verificar que todos los contenedores están corriendo

```bash
docker compose ps
```

Todos deben mostrar estado `Up` o `running`. El contenedor `migrador` mostrará `Exited (0)` porque es un job que termina al aplicar las migraciones.

---

## 7. Base de Datos y Migraciones

### Reglas Críticas de Charset

> **🚨 OBLIGATORIO (Resolución 1519 de 2020 de MinTIC):**
>
> MySQL debe operar con `utf8mb4` y `utf8mb4_unicode_ci`. Sin esta configuración, los caracteres acentuados se corrompen:
> - Las direcciones muestran `DiÃ¡logo Social` en lugar de `Diálogo Social`.
> - Los estados con tilde (*«En comisión»*, *«En formulación»*) dejan de guardarse.
>
> El `docker-compose.yml` ya incluye:
> ```yaml
> command: [--character-set-server=utf8mb4, --collation-server=utf8mb4_unicode_ci]
> ```

### Arquitectura de Migraciones

Las migraciones SQL están distribuidas en los repositorios de cada microservicio:

| Microservicio | Directorio de Migraciones | Archivos |
|---|---|---|
| `ms-iniciativas` | `ms-iniciativas/migraciones/` | `01_schema.sql`, `02_procedimientos.sql`, `03_datos_iniciales.sql`, `08_correcciones.sql`, `10_historial_de_edicion.sql`, `11_historial_fiel.sql`, `13_tiempo_en_estado.sql` |
| `ms-autenticacion` | `ms-autenticacion/migraciones/` | `04_autenticacion.sql`, `06_roles_permisos.sql`, `15_cuentas_y_sesiones.sql` |
| `ms-radicacion` | `ms-radicacion/migraciones/` | `05_propuestas.sql` |
| `ms-flujo-estados` | `ms-flujo-estados/migraciones/` | `07_flujo_estados.sql`, `09_flujo_al_crear.sql`, `12_ver_proponente.sql`, `14_autorizacion_y_flujo.sql` |
| `ms-administracion` | `ms-administracion/migraciones/` | `06_roles_permisos.sql` (duplicada, el migrador la deduplica) |

### Ejecución Automática

El contenedor `migrador` del `docker-compose.yml` aplica **todas** las migraciones automáticamente en orden numérico al levantar por primera vez. No requiere intervención manual.

### Ejecución Manual (si es necesario)

Si necesita reaplicar o aplicar una migración nueva sobre una base existente:

```bash
docker compose exec -T db \
  mysql --default-character-set=utf8mb4 -u root -p"$DB_ROOT_PASSWORD" \
  iniciativas_legislativas < ms-iniciativas/migraciones/XX_nombre.sql
```

Todas las migraciones son **idempotentes**: reejecutar una ya aplicada no rompe nada ni pierde datos.

### Verificar versión actual de la base

```bash
docker compose exec db \
  mysql -u root -p"$DB_ROOT_PASSWORD" -e \
  "SELECT version, descripcion, aplicada_en FROM iniciativas_legislativas.schema_version ORDER BY version;"
```

### Qué hace cada migración

| # | Archivo | Descripción |
|---|---|---|
| 01 | `schema.sql` | Tablas `direcciones`, `iniciativas`, `documentos`, `usuarios` |
| 02 | `procedimientos.sql` | Los 10 procedimientos almacenados originales de consulta y edición |
| 03 | `datos_iniciales.sql` | Las 6 direcciones del Viceministerio |
| 04 | `autenticacion.sql` | Contraseñas con scrypt, tabla `sesiones`, bloqueo temporal, `schema_version` |
| 05 | `propuestas.sql` | Radicación sin sesión, autorregistro de usuarios como `lector` |
| 06 | `roles_permisos.sql` | Catálogo de 16 permisos, 5 roles del sistema, roles libres |
| 07 | `flujo_estados.sql` | Máquina de estados dinámica: `estados`, `transiciones`, `historial_iniciativa` |
| 08 | `correcciones.sql` | Correcciones de charset y procedimientos |
| 09 | `flujo_al_crear.sql` | Asignación automática del estado inicial al crear iniciativa |
| 10 | `historial_de_edicion.sql` | Registro de cambios en campos editables |
| 11 | `historial_fiel.sql` | Historial completo de edición con campos anteriores |
| 12 | `ver_proponente.sql` | Permiso `iniciativas.ver_proponente` |
| 13 | `tiempo_en_estado.sql` | Cálculo de días promedio por estado |
| 14 | `autorizacion_y_flujo.sql` | Autorización basada en permisos, no en ENUM de rol |
| 15 | `cuentas_y_sesiones.sql` | Rol dinámico al registrarse, cierre de sesiones al revocar |

---

## 8. Creación de la Primera Cuenta Administradora

Una vez que los contenedores estén corriendo:

```bash
cd /opt/iniciativas/infra-iniciativas

docker compose exec ms-autenticacion \
  SUPERADMIN_CORREO="admin@mininterior.gov.co" \
  SUPERADMIN_NOMBRE="Administrador del Sistema" \
  node scripts/crear_superadmin.js
```

El comando imprimirá una **contraseña temporal segura** en la terminal. El usuario deberá cambiarla en su primer ingreso.

### Creación interactiva de usuarios adicionales

```bash
docker compose exec -it ms-autenticacion npm run crear-usuario
```

Pregunta nombre, correo, dirección y rol. Recomendación:
- Primero crear una cuenta con rol **Administrador** (puede gestionar usuarios y roles).
- Después crear cuentas por cada dirección con rol **Editor** o **Director**.

---

## 9. Verificación Post-Despliegue

### Comprobaciones automáticas

```bash
# 1. Estado de todos los contenedores
docker compose ps

# 2. Salud del API Gateway
curl -s http://localhost:3000/api/salud
# Esperado: {"estado":"ok"}

# 3. Frontends sirviendo correctamente
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/   # Tablero → 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/   # Radicación → 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:8082/   # Admin → 200

# 4. API exige sesión (debe responder 401)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/direcciones
# Esperado: 401

# 5. Verificar que la base tiene las 17 migraciones
docker compose exec db mysql -u root -p"$DB_ROOT_PASSWORD" -e \
  "SELECT COUNT(*) AS total_migraciones FROM iniciativas_legislativas.schema_version;"
# Esperado: 15 (la migración 06 se comparte entre dos servicios)
```

### Comprobación visual

1. Abrir `http://<IP_SERVIDOR>:8080` → Debe mostrar el tablero de seguimiento con las 6 direcciones del Viceministerio.
2. Abrir `http://<IP_SERVIDOR>:8081` → Debe mostrar el portal de radicación ciudadana.
3. Abrir `http://<IP_SERVIDOR>:8082` → Debe redirigir al login del panel administrativo.

### Verificar logs en caso de error

```bash
# Logs de un servicio específico
docker compose logs ms-autenticacion --tail=50

# Logs del API Gateway
docker compose logs api-gateway --tail=50

# Logs del migrador (para ver si las migraciones se aplicaron)
docker compose logs migrador
```

---

## 10. Respaldos y Mantenimiento

### Respaldo de la Base de Datos

> **🚨 REGLA: Siempre incluir `--routines`.**
> Sin esta bandera, el volcado no incluirá los 43 procedimientos almacenados y la aplicación completa dejará de funcionar al restaurar.

```bash
# Respaldo completo (incluye procedimientos, triggers y eventos)
docker compose exec db mysqldump \
  -u root -p"$DB_ROOT_PASSWORD" \
  --default-character-set=utf8mb4 \
  --routines --triggers --events \
  --single-transaction \
  iniciativas_legislativas > /opt/backups/respaldo_$(date +%Y%m%d_%H%M).sql
```

### Restauración desde respaldo

```bash
docker compose exec -T db mysql \
  --default-character-set=utf8mb4 \
  -u root -p"$DB_ROOT_PASSWORD" \
  iniciativas_legislativas < /opt/backups/respaldo_YYYYMMDD_HHMM.sql
```

### Respaldo automatizado (cron)

```bash
# Agregar a /etc/crontab o crontab -e:
0 2 * * * cd /opt/iniciativas/infra-iniciativas && docker compose exec -T db mysqldump -u root -p"$DB_ROOT_PASSWORD" --default-character-set=utf8mb4 --routines --triggers --events --single-transaction iniciativas_legislativas | gzip > /opt/backups/respaldo_$(date +\%Y\%m\%d).sql.gz
```

### Actualización del sistema

```bash
cd /opt/iniciativas
git pull --recurse-submodules
git submodule update --init --recursive

cd infra-iniciativas
docker compose up -d --build
```

---

## 11. Políticas de Red y Seguridad

### Puertos expuestos al host

| Puerto | Servicio | Acceso |
|---|---|---|
| 8080 | `front-tablero` (Nginx) | Público (a través de reverse proxy/balanceador) |
| 8081 | `front-radicacion` (Nginx) | Público (a través de reverse proxy/balanceador) |
| 8082 | `front-admin` (Nginx) | Restringido (red interna institucional) |

### Puertos internos (NO expuestos al host)

| Puerto | Servicio | Red |
|---|---|---|
| 3000 | `api-gateway` | Red Docker `interna` |
| 3001–3006 | Microservicios `ms-*` | Red Docker `interna` |
| 3306 | MySQL 8.4 | Red Docker `interna` |
| 6379 | Redis 7 | Red Docker `interna` |

### Seguridad de la API

- **Toda la API exige sesión.** Las únicas rutas públicas son `/api/salud`, `/api/auth/*` y `/api/publico/*`.
- **Contraseñas con scrypt**, salt aleatorio por usuario. En la base solo queda el hash.
- **Sin filtración de usuarios:** correo inexistente y contraseña incorrecta devuelven el mismo mensaje y tardan lo mismo.
- **Bloqueo temporal** de 15 minutos al quinto intento fallido.
- **Cookie de sesión `httpOnly`**, no accesible desde JavaScript.
- **CORS restringido** al `ORIGEN_PERMITIDO` configurado en `.env`.
- **La API nunca arma SQL dinámico.** Todos los accesos son `CALL sp_x(?, ?)` (procedimientos almacenados con parámetros tipados).

### Reverse Proxy / Nginx (Ejemplo para el servidor exterior)

Si utilizan un Nginx externo como balanceador/terminador SSL:

```nginx
server {
    listen 443 ssl http2;
    server_name iniciativas.mininterior.gov.co;

    ssl_certificate     /etc/ssl/certs/mininterior.pem;
    ssl_certificate_key /etc/ssl/private/mininterior.key;

    # Tablero principal
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Portal de radicación
    location /radicacion/ {
        proxy_pass http://127.0.0.1:8081/;
    }

    # Panel administrativo (restringir por IP si es posible)
    location /admin/ {
        # allow 10.0.0.0/8;  # Solo red interna
        # deny all;
        proxy_pass http://127.0.0.1:8082/;
    }
}
```

---

## 12. Solución de Problemas Frecuentes

### Las tildes aparecen como `DiÃ¡logo Social`

**Causa:** La base de datos no se creó con charset `utf8mb4`.

**Solución:** Verificar que el `docker-compose.yml` tiene la directiva:
```yaml
command: [--character-set-server=utf8mb4, --collation-server=utf8mb4_unicode_ci]
```

Y que las migraciones se aplicaron con `--default-character-set=utf8mb4`.

### La aplicación responde «Error interno del servidor» en todas las rutas

**Causa probable:** El respaldo se restauró sin `--routines` y la base no tiene procedimientos almacenados.

**Verificación:**
```bash
docker compose exec db mysql -u root -p"$DB_ROOT_PASSWORD" -e \
  "SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='iniciativas_legislativas';"
```

Si el conteo es 0, restaurar con un respaldo que incluya `--routines` o reaplicar las migraciones.

### Un contenedor no arranca o se reinicia constantemente

```bash
# Ver los logs del contenedor problemático
docker compose logs <nombre-servicio> --tail=100

# Forzar reconstrucción
docker compose up -d --build --force-recreate <nombre-servicio>
```

### El migrador falla con «Access denied»

Verificar que `DB_ROOT_PASSWORD` en `.env` coincide con la contraseña real del contenedor MySQL. Si el volumen ya existía con otra contraseña:

```bash
docker compose down -v    # ⚠️ BORRA LOS DATOS
docker compose up -d --build
```

### La sesión no funciona entre servicios

Verificar que **todos** los microservicios comparten el mismo `SESSION_SECRET` en `.env`. El `docker-compose.yml` lo propaga automáticamente, pero si algún servicio tiene un `.env` propio con un valor diferente, la cookie firmada en un servicio no se valida en los demás.

---

## Resumen de Comandos Rápidos

```bash
# Clonar con submódulos
git clone --recurse-submodules https://github.com/hernan-Saroa/Iniciativas.git /opt/iniciativas

# Configurar
cd /opt/iniciativas/infra-iniciativas
cp .env.example .env && nano .env

# Levantar todo
docker compose up -d --build

# Verificar estado
docker compose ps

# Ver logs
docker compose logs -f

# Crear administrador
docker compose exec ms-autenticacion node scripts/crear_superadmin.js

# Respaldo
docker compose exec db mysqldump -u root -p"$DB_ROOT_PASSWORD" \
  --default-character-set=utf8mb4 --routines --triggers --events \
  --single-transaction iniciativas_legislativas > respaldo.sql

# Actualizar
cd /opt/iniciativas && git pull --recurse-submodules
cd infra-iniciativas && docker compose up -d --build

# Apagar
docker compose down

# Apagar y borrar datos (⚠️ destructivo)
docker compose down -v
```

---

**Documento preparado por el equipo de desarrollo del Sistema de Iniciativas Legislativas.**  
**Ministerio del Interior de Colombia — 2026.**
