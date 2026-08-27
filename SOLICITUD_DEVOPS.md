# Solicitud de Creación de Repositorios — Sistema de Iniciativas Legislativas

**Solicitante:** Viceministerio para el Diálogo Social y los Derechos Humanos  
**Entidad:** Ministerio del Interior de Colombia  
**Fecha de actualización:** 27 de agosto de 2026  
**Estado:** Código fuente listo para subir — 12 repositorios locales con commit inicial  

---

## 1. Descripción del Proyecto

Sistema web de seguimiento de iniciativas legislativas de las direcciones
vinculadas al Viceministerio para el Diálogo Social y los Derechos Humanos.
Registra el estado del trámite, prioridad, documentación soporte y flujo de
aprobación. Incluye un canal público para radicación ciudadana y un panel
administrativo de usuarios, roles y permisos.

> [!IMPORTANT]
> Los datos incluyen trámites de **consulta previa** y **garantías para
> personas defensoras de derechos humanos**. Los repositorios deben ser
> **privados** y el acceso restringido al equipo autorizado.

---

## 2. Arquitectura — 12 Repositorios Independientes

```
                         ┌─────────────────────────────┐
                         │        INTERNET              │
                         └────────────┬────────────────┘
                                      │
                              ┌───────▼───────┐
                              │    CDN         │
                              │  (assets)      │
                              └───────┬───────┘
                                      │
                         ┌────────────▼────────────────┐
                         │       BALANCEADOR            │
                         └────┬───────────────┬────────┘
                              │               │
                    ┌─────────▼─────┐  ┌──────▼────────┐
                    │  front-tablero│  │front-radicacio│
                    │  front-admin  │  │(Nginx Docker) │
                    └─────────┬─────┘  └──────┬────────┘
                              │               │
                         ┌────▼───────────────▼────┐
                         │      API GATEWAY         │
                         │   (enrutamiento, CORS,   │
                         │    rate limit, JWT)       │
                         └──┬──┬──┬──┬──┬──┬───────┘
                            │  │  │  │  │  │
              ┌─────────────┘  │  │  │  │  └────────────┐
              │      ┌─────────┘  │  │  └─────────┐     │
              │      │      ┌─────┘  └─────┐      │     │
              ▼      ▼      ▼              ▼      ▼     ▼
         ┌────────┐┌────────┐┌──────────┐┌──────┐┌─────┐┌──────┐
         │  AUTH  ││INICIAT.││RADICACIÓN││FLUJO ││NOTI.││ADMIN │
         │  :3001 ││  :3002 ││   :3003  ││:3004 ││:3005││:3006 │
         │  DB 1  ││  DB 2  ││   DB 3   ││ DB 4 ││Redis││ DB 6 │
         └────────┘└────────┘└──────────┘└──────┘└─────┘└──────┘
```

---

## 3. Repositorios a Crear en GitHub

Todos deben ser **privados** y crearse **vacíos** (sin README, sin
.gitignore, sin licencia). El código fuente ya está versionado localmente
y se subirá con `git push`.

---

### 3.1 Frontends (acceso para el equipo de Diseño)

| # | Nombre del repositorio | Descripción para GitHub | Stack | Archivos |
|---|---|---|---|---|
| 1 | `front-tablero` | Interfaz principal de seguimiento de iniciativas legislativas — Viceministerio para el Diálogo Social, Ministerio del Interior | React 19 · Vite 6 · TypeScript · CSS | 28 |
| 2 | `front-radicacion` | Portal ciudadano de radicación de propuestas legislativas y consulta pública — Ministerio del Interior | React 19 · Vite 6 · TypeScript · CSS | 28 |
| 3 | `front-admin` | Panel administrativo de usuarios, roles, permisos y métricas del sistema de iniciativas legislativas | React 19 · Vite 6 · TypeScript · CSS | 32 |

---

### 3.2 Microservicios Backend (sin acceso para Diseño)

| # | Nombre del repositorio | Descripción para GitHub | Puerto | Stack | Archivos |
|---|---|---|---|---|---|
| 4 | `ms-autenticacion` | Microservicio de autenticación, registro de usuarios, sesiones y recuperación de contraseñas | 3001 | Node.js · Express · MySQL · bcrypt | 14 |
| 5 | `ms-iniciativas` | Microservicio de gestión de iniciativas legislativas, documentos y exportación de datos | 3002 | Node.js · Express · MySQL | 21 |
| 6 | `ms-radicacion` | Microservicio de recepción de propuestas ciudadanas y consulta previa | 3003 | Node.js · Express · MySQL | 13 |
| 7 | `ms-flujo-estados` | Microservicio de máquina de estados, transiciones de trámite y auditoría | 3004 | Node.js · Express · MySQL | 14 |
| 8 | `ms-notificaciones` | Microservicio de envío de correos institucionales automatizados con cola de mensajes | 3005 | Node.js · Express · Redis · Nodemailer | 12 |
| 9 | `ms-administracion` | Microservicio de administración de usuarios, roles, permisos y reportes institucionales | 3006 | Node.js · Express · MySQL | 13 |

---

### 3.3 Infraestructura y Compartidos

| # | Nombre del repositorio | Descripción para GitHub | Stack | Archivos |
|---|---|---|---|---|
| 10 | `api-gateway` | Punto de entrada único (API Gateway) — enrutamiento, CORS, rate limit y JWT para microservicios | Node.js · Express · http-proxy-middleware | 4 |
| 11 | `infra-iniciativas` | Configuración de infraestructura, Docker Compose y manifiestos de despliegue en contenedores | Docker · Nginx · YAML | 3 |
| 12 | `tipos-compartidos` | Paquete npm @mininterior/tipos — contratos TypeScript compartidos entre frontends y microservicios | TypeScript | 3 |

---

## 4. Descripción Corta por Repositorio (copiar y pegar en GitHub)

Use estas descripciones al crear cada repositorio en
**Settings → Description** o al momento de la creación:

```
front-tablero
  → Interfaz principal de seguimiento de iniciativas legislativas — Viceministerio para el Diálogo Social, Ministerio del Interior

front-radicacion
  → Portal ciudadano de radicación de propuestas legislativas y consulta pública — Ministerio del Interior

front-admin
  → Panel administrativo de usuarios, roles, permisos y métricas del sistema de iniciativas legislativas

ms-autenticacion
  → Microservicio de autenticación, registro de usuarios, sesiones y recuperación de contraseñas

ms-iniciativas
  → Microservicio de gestión de iniciativas legislativas, documentos y exportación de datos

ms-radicacion
  → Microservicio de recepción de propuestas ciudadanas y consulta previa

ms-flujo-estados
  → Microservicio de máquina de estados, transiciones de trámite y auditoría

ms-notificaciones
  → Microservicio de envío de correos institucionales automatizados con cola de mensajes

ms-administracion
  → Microservicio de administración de usuarios, roles, permisos y reportes institucionales

api-gateway
  → Punto de entrada único (API Gateway) — enrutamiento, CORS, rate limit y JWT para microservicios

infra-iniciativas
  → Configuración de infraestructura, Docker Compose y manifiestos de despliegue en contenedores

tipos-compartidos
  → Paquete npm @mininterior/tipos — contratos TypeScript compartidos entre frontends y microservicios
```

---

## 5. Topics / Etiquetas sugeridos (GitHub Topics)

Aplique estos topics a todos los repositorios para facilitar la búsqueda interna:

```
mininterior, iniciativas-legislativas, viceministerio-dialogo-social,
derechos-humanos, consulta-previa, gobierno-colombia
```

Adicionales por tipo:

| Tipo | Topics adicionales |
|---|---|
| Frontends | `react`, `vite`, `typescript`, `frontend` |
| Microservicios | `nodejs`, `express`, `mysql`, `microservicio`, `backend` |
| Gateway | `api-gateway`, `proxy`, `cors` |
| Infraestructura | `docker`, `nginx`, `devops` |
| Tipos | `typescript`, `npm-package`, `contratos` |

---

## 6. Matriz de Permisos por Equipo

| Repositorio | Diseño | Backend | DevOps | Líder Técnico |
|---|---|---|---|---|
| `front-tablero` | **Write** | Read | Read | Admin |
| `front-radicacion` | **Write** | Read | Read | Admin |
| `front-admin` | **Write** | Read | Read | Admin |
| `ms-autenticacion` | ❌ Sin acceso | **Write** | Read | Admin |
| `ms-iniciativas` | ❌ Sin acceso | **Write** | Read | Admin |
| `ms-radicacion` | ❌ Sin acceso | **Write** | Read | Admin |
| `ms-flujo-estados` | ❌ Sin acceso | **Write** | Read | Admin |
| `ms-notificaciones` | ❌ Sin acceso | **Write** | Read | Admin |
| `ms-administracion` | ❌ Sin acceso | **Write** | Read | Admin |
| `api-gateway` | ❌ Sin acceso | **Write** | **Write** | Admin |
| `infra-iniciativas` | ❌ Sin acceso | Read | **Admin** | Admin |
| `tipos-compartidos` | Read | **Write** | Read | Admin |

---

## 7. Configuración de Ramas Requerida

Para cada repositorio, crear las siguientes ramas y proteger `main`:

| Rama | Propósito | Protegida |
|---|---|---|
| `main` | Producción — solo merges con PR aprobado | ✅ Sí |
| `staging` | Pre-producción y pruebas integradas | Opcional |
| `develop` | Desarrollo activo del equipo | No |

Reglas de protección para `main`:
- ☑ Require a pull request before merging
- ☑ Require at least 1 approval
- ☑ Require status checks to pass before merging
- ☑ Do not allow bypassing the above settings

---

## 8. Secretos de CI/CD Requeridos

Estos valores deben configurarse en **Settings → Secrets and variables → Actions** de cada repositorio (o a nivel de organización):

| Secreto | Descripción | Aplica a |
|---|---|---|
| `MYSQL_HOST` | Dirección del servidor MySQL | Todos los `ms-*` |
| `MYSQL_PASSWORD` | Contraseña del usuario de la base de datos | Todos los `ms-*` |
| `JWT_SECRETO` | Clave para firmar tokens de sesión | `ms-autenticacion`, `api-gateway` |
| `REDIS_URL` | URL de conexión a Redis | `ms-notificaciones` |
| `SMTP_HOST` | Servidor de correo SMTP | `ms-notificaciones` |
| `SMTP_USUARIO` | Credencial SMTP | `ms-notificaciones` |
| `SMTP_CLAVE` | Contraseña SMTP | `ms-notificaciones` |
| `DOCKER_REGISTRY` | URL del registro de imágenes Docker | `infra-iniciativas` |
| `DEPLOY_SSH_KEY` | Llave SSH para despliegue en servidores | `infra-iniciativas` |

---

## 9. Checklist de Creación

- [ ] Crear organización en GitHub (sugerido: `mininterior-iniciativas`)
- [ ] Crear los 12 repositorios en modalidad **Privada** y **vacíos**
- [ ] Copiar la descripción de la sección 4 en cada repositorio
- [ ] Agregar topics de la sección 5
- [ ] Crear equipos: `diseno`, `backend`, `devops`, `lider-tecnico`
- [ ] Asignar permisos según la matriz de la sección 6
- [ ] Configurar ramas protegidas en cada repositorio (sección 7)
- [ ] Configurar secretos de CI/CD (sección 8)
- [ ] Entregar las URLs de los 12 repositorios al líder técnico para subir el código

---

## 10. URLs de los Repositorios Creados

> Complete esta tabla después de crear los repositorios:

| # | Repositorio | URL |
|---|---|---|
| 1 | `front-tablero` | `https://github.com/___/front-tablero` |
| 2 | `front-radicacion` | `https://github.com/___/front-radicacion` |
| 3 | `front-admin` | `https://github.com/___/front-admin` |
| 4 | `ms-autenticacion` | `https://github.com/___/ms-autenticacion` |
| 5 | `ms-iniciativas` | `https://github.com/___/ms-iniciativas` |
| 6 | `ms-radicacion` | `https://github.com/___/ms-radicacion` |
| 7 | `ms-flujo-estados` | `https://github.com/___/ms-flujo-estados` |
| 8 | `ms-notificaciones` | `https://github.com/___/ms-notificaciones` |
| 9 | `ms-administracion` | `https://github.com/___/ms-administracion` |
| 10 | `api-gateway` | `https://github.com/___/api-gateway` |
| 11 | `infra-iniciativas` | `https://github.com/___/infra-iniciativas` |
| 12 | `tipos-compartidos` | `https://github.com/___/tipos-compartidos` |
