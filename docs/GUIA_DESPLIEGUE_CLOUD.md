# Guía Técnica de Arquitectura y Despliegue en Cloud / Servidores

**Sistema de Seguimiento de Iniciativas Legislativas**  
**Viceministerio para el Diálogo Social y los Derechos Humanos — Ministerio del Interior de Colombia**  
**Fecha:** 27 de agosto de 2026  
**Clasificación de Seguridad:** Uso Institucional Restringido (Incluye trámites de consulta previa y garantías para personas defensoras de DDHH).

---

## 1. Resumen Ejecutivo y Arquitectura del Sistema

El sistema implementa una arquitectura desacoplada basada en **Microfrontends**, un **API Gateway centralizado** y **Microservicios Backend** con persistencia en **MySQL 8.4** y colas/sesiones en **Redis 7**.

### Diagrama de Flujo de Arquitectura

```
                        ┌─────────────────────────────────────────┐
                        │      INTERNET / RED INSTITUCIONAL       │
                        └────────────────────┬────────────────────┘
                                             │
                        ┌────────────────────▼────────────────────┐
                        │    BALANCEADOR DE CARGA / NGINX / WAF   │
                        │     (Terminación SSL/TLS - HTTPS 443)   │
                        └──────┬─────────────┬─────────────┬──────┘
                               │             │             │
                    ┌──────────▼──┐   ┌──────▼──────┐   ┌──▼──────────┐
                    │front-tablero│   │front-radica │   │ front-admin │
                    │ (Puerto 80) │   │ (Puerto 80) │   │ (Puerto 80) │
                    └──────────┬──┘   └──────┬──────┘   └──┬──────────┘
                               │             │             │
                        ┌──────▼─────────────▼─────────────▼──────┐
                        │               API GATEWAY               │
                        │         (Express - Puerto 3000)         │
                        │  Enrutamiento, CORS, Rate Limit y Auth  │
                        └──────┬───┬───┬───┬───┬───┬──────────────┘
                               │   │   │   │   │   │
           ┌───────────────────┘   │   │   │   │   └──────────────────┐
           │           ┌───────────┘   │   │   └──────────┐           │
           │           │       ┌───────┘   └───────┐      │           │
           ▼           ▼       ▼                   ▼      ▼           ▼
     ┌───────────┐┌───────────┐┌───────────┐┌───────────┐┌─────┐┌───────────┐
     │  MS-AUTH  ││MS-INICIAT.││MS-RADICAC.││ MS-FLUJO  ││MS-NOT││ MS-ADMIN  │
     │  (:3001)  ││  (:3002)  ││  (:3003)  ││  (:3004)  ││(:3005││  (:3006)  │
     └─────┬─────┘└─────┬─────┘└─────┬─────┘└─────┬─────┘└──┬───┘└─────┬─────┘
           │            │            │            │         │          │
           ▼            ▼            ▼            ▼         ▼          ▼
     ┌───────────┐┌───────────┐┌───────────┐┌───────────┐┌─────┐┌───────────┐
     │  DB-AUTH  ││  DB-INIC  ││  DB-RAD   ││ DB-FLUJO  ││REDIS││ DB-ADMIN  │
     │  (MySQL)  ││  (MySQL)  ││  (MySQL)  ││  (MySQL)  ││ (:6379) │ (MySQL)  │
     └───────────┘└───────────┘└───────────┘└───────────┘└─────┘└───────────┘
```

---

## 2. Mapa de los 12 Repositorios y Módulos

| # | Repositorio / Módulo | Tipo | Puerto Interno | Stack Tecnológico | Responsabilidad |
|---|---|---|---|---|---|
| 1 | **`front-tablero`** | Microfrontend | `80` (Host: 8080) | React 19, Vite 6, TS, CSS puro | Tablero de control y seguimiento de iniciativas legislativas. |
| 2 | **`front-radicacion`** | Microfrontend | `80` (Host: 8081) | React 19, Vite 6, TS, CSS puro | Portal público ciudadano para radicar y consultar propuestas. |
| 3 | **`front-admin`** | Microfrontend | `80` (Host: 8082) | React 19, Vite 6, TS, Tailwind 4 | Panel administrativo para gestión de usuarios, roles y flujo. |
| 4 | **`api-gateway`** | Gateway | `3000` | Node.js 22 LTS, Express | Enrutador inverso, validación de sesiones, CORS y rate limit. |
| 5 | **`ms-autenticacion`** | Microservicio | `3001` | Node.js 22 LTS, Express, scrypt | Autenticación, sesiones en BD/Redis y recuperación de clave. |
| 6 | **`ms-iniciativas`** | Microservicio | `3002` | Node.js 22 LTS, Express, MySQL | Gestión de trámites, documentos soporte y exportación CSV. |
| 7 | **`ms-radicacion`** | Microservicio | `3003` | Node.js 22 LTS, Express, MySQL | Recepción de propuestas ciudadanas y consultas públicas. |
| 8 | **`ms-flujo-estados`** | Microservicio | `3004` | Node.js 22 LTS, Express, MySQL | Máquina de estados, transiciones dinámicas y auditoría. |
| 9 | **`ms-notificaciones`** | Microservicio | `3005` | Node.js 22, Redis, Nodemailer | Cola de correos institucionales y plantillas HTML. |
| 10 | **`ms-administracion`** | Microservicio | `3006` | Node.js 22 LTS, Express, MySQL | Administración de cuentas, catálogo de roles y reportes. |
| 11 | **`infra-iniciativas`** | Infraestructura | — | Docker Compose, Nginx, Alpine | Orquestación completa de contenedores para producción. |
| 12 | **`tipos-compartidos`** | Paquete | — | TypeScript NPM Package | Definición de tipos y contratos compartidos (`@mininterior/tipos`). |

---

## 3. Requisitos de Infraestructura y Servidor

### Especificaciones Mínimas de Hardware
- **CPU:** 4 vCPU (Arquitectura x86_64).
- **Memoria RAM:** 8 GB (Recomendado 16 GB para producción con alta concurrencia).
- **Almacenamiento:** 50 GB SSD o NVMe (con política de crecimiento para backups y logs).

### Software Requerido en el Host
- **Sistema Operativo:** Linux (Ubuntu Server 22.04/24.04 LTS, Red Hat Enterprise Linux 9, o Rocky Linux 9).
- **Docker Engine:** Versión 26.0 o superior.
- **Docker Compose:** Versión 2.24 o superior (plugin `docker compose`).
- **Git:** 2.40 o superior.
- **Conectividad:** Acceso a repositorios oficiales de imágenes Docker (Docker Hub) y salida SMTP para notificaciones.

### Políticas de Red y Firewall
- **Público / DMZ:** Solo el balanceador Nginx expone los puertos HTTP (80) y HTTPS (443).
- **Red Interna Docker (`interna`):** Los microservicios (`ms-*`), el `api-gateway` y las bases de datos MySQL se comunican a través de una red bridge interna sin publicar puertos de base de datos al host.

---

## 4. Reglas Críticas de Base de Datos y Codificación

> [!CAUTION]
> **REGLA OBLIGATORIA DE CHARSET (Resolución 1519 de 2020 de MinTIC):**  
> Todo servidor MySQL debe configurarse estrictamente con:
> - `character-set-server = utf8mb4`
> - `collation-server = utf8mb4_unicode_ci`  
> Sin esta configuración, los caracteres acentuados (*«En comisión»*, *«En formulación»*, *«Diálogo Social»*) se corrompen y bloquean los procedimientos almacenados.

> [!IMPORTANT]
> **SEGURIDAD SQL — SIN SENTENCIAS DINÁMICAS:**  
> La API **nunca** concatena sentencias SQL. Todas las operaciones se ejecutan mediante procedimientos almacenados con parámetros tipados (`CALL sp_x(?, ?)`).
> 
> **AL HACER BACKUP DE BASE DE DATOS:**  
> Es obligatorio incluir el parámetro `--routines`. De lo contrario, el volcado no incluirá los procedimientos almacenados y la aplicación responderá error `500`:
> ```bash
> mysqldump -u root -p --default-character-set=utf8mb4 \
>   --routines --triggers --events --single-transaction \
>   ms_iniciativas_db > respaldo_$(date +%Y%m%d_%H%M).sql
> ```

---

## 5. Variables de Entorno (`.env`) para Producción

En la carpeta `infra-iniciativas/` (o en el gestor de secretos de Cloud como AWS Secrets Manager / Azure Key Vault / Vault), configure el archivo `.env`:

```bash
# =====================================================================
# CONFIGURACIÓN DE PRODUCCIÓN - MINISTERIO DEL INTERIOR
# =====================================================================

# 1. Contraseñas de Base de Datos (Generar cadenas seguras de 32+ caracteres)
DB_AUTH_ROOT_PASSWORD=P@ssw0rdRoot_Auth_2026_MinIntSecure!
DB_AUTH_PASSWORD=App_Auth_MinInt2026_SecureKey_#99
DB_INIC_ROOT_PASSWORD=P@ssw0rdRoot_Inic_2026_MinIntSecure!
DB_INIC_PASSWORD=App_Inic_MinInt2026_SecureKey_#99
DB_RAD_ROOT_PASSWORD=P@ssw0rdRoot_Rad_2026_MinIntSecure!
DB_RAD_PASSWORD=App_Rad_MinInt2026_SecureKey_#99
DB_FLUJO_ROOT_PASSWORD=P@ssw0rdRoot_Flujo_2026_MinIntSecure!
DB_FLUJO_PASSWORD=App_Flujo_MinInt2026_SecureKey_#99
DB_NOTI_ROOT_PASSWORD=P@ssw0rdRoot_Noti_2026_MinIntSecure!
DB_NOTI_PASSWORD=App_Noti_MinInt2026_SecureKey_#99
DB_ADMIN_ROOT_PASSWORD=P@ssw0rdRoot_Admin_2026_MinIntSecure!
DB_ADMIN_PASSWORD=App_Admin_MinInt2026_SecureKey_#99

# 2. Clave Secreta de Firma de Sesión (Generar con crypto)
# Comando para generar: node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
SESSION_SECRET=U2VjdXJlU2Vzc2lvblNlY3JldF9NaW5pbnRlcmlvcl8yMDI2X1ZpY2VNaW5pc3RlcmlvRGlhbG9nb1NvY2lhbF9EREhI

# 3. Dominio Oficial y CORS
ORIGEN_PERMITIDO=https://iniciativas.mininterior.gov.co

# 4. Puertos Públicos Expuestos
PUERTO_TABLERO=8080
PUERTO_RADICACION=8081
PUERTO_ADMIN=8082

# 5. Entorno
NODE_ENV=production
```

---

## 6. Procedimiento Paso a Paso para Despliegue en Servidores

### Paso 1: Clonar el Repositorio con Submódulos
En el servidor de producción:

```bash
git clone --recurse-submodules https://github.com/mininterior-iniciativas/Iniciativas.git /opt/iniciativas
cd /opt/iniciativas
git checkout develop   # O la rama de producción correspondiente (main)
git submodule update --init --recursive
```

### Paso 2: Configurar Variables de Entorno
```bash
cd /opt/iniciativas/infra-iniciativas
cp .env.example .env
nano .env   # Completar con las credenciales reales
```

### Paso 3: Construcción y Levantamiento con Docker Compose
```bash
cd /opt/iniciativas/infra-iniciativas
docker compose pull || true
docker compose up -d --build
```

Esto levantará automáticamente:
- Los 6 contenedores MySQL 8.4 con sus volúmenes persistentes (`datos_*`).
- El contenedor Redis para colas y caché.
- Los 6 microservicios Node.js (`ms-*`).
- El `api-gateway`.
- Los 3 microfrontends servidos en Nginx optimizado (`front-*`).

### Paso 4: Creación de la Cuenta Superadministradora Inicial
Para habilitar el primer acceso administrativo sin contraseña quemada en código:

```bash
docker compose exec ms-autenticacion \
  SUPERADMIN_CORREO="admin@mininterior.gov.co" \
  SUPERADMIN_NOMBRE="Administrador del Sistema" \
  node scripts/crear_superadmin.js
```
*El comando imprimirá en pantalla una contraseña segura temporal de un solo uso que deberá cambiarse en el primer ingreso.*

---

## 7. Verificación de Salud Post-Despliegue

Ejecutar las siguientes comprobaciones HTTP desde el servidor:

```bash
# 1. Comprobar salud del API Gateway
curl -I http://localhost:3000/api/salud

# 2. Comprobar frontends
curl -I http://localhost:8080/    # Tablero
curl -I http://localhost:8081/    # Radicación
curl -I http://localhost:8082/    # Administración

# 3. Comprobar estado de los contenedores
docker compose ps
```

---

## 8. Cumplimiento Normativo y Accesibilidad WCAG 2.1 AA

El frontend cumple con la **Resolución 1519 de 2020 de MinTIC** (Accesibilidad web para el Estado Colombiano):
- **Contraste de color:** Mínimo 4.5:1 para texto normal y 3:1 para componentes.
- **Navegación accesible:** Soporte para lectores de pantalla (`aria-*`, `role="radiogroup"`, `role="status"`), foco visible y atajos de teclado (`/`).
- **Prueba de contraste automatizada:**
  ```bash
  node scripts/verificar-contraste.js
  ```

---

## 9. Contacto y Soporte Técnico

- **Entidad:** Ministerio del Interior — Viceministerio para el Diálogo Social y los Derechos Humanos.
- **Soporte de Arquitectura:** Equipo de Desarrollo de Iniciativas Legislativas.
