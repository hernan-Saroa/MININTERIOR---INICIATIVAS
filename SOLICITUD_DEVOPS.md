# Solicitud de Creación de Repositorios — Sistema de Iniciativas Legislativas

**Solicitante:** Viceministerio para el Diálogo Social y los Derechos Humanos  
**Entidad:** Ministerio del Interior de Colombia  
**Fecha:** Agosto 2026  

---

## 1. Descripción del Proyecto

Sistema web de seguimiento de iniciativas legislativas de las direcciones vinculadas al Viceministerio. Registra el estado del trámite, prioridad, documentación soporte y flujo de aprobación. Incluye un canal público para radicación ciudadana.

> [!IMPORTANT]
> Los datos incluyen trámites de **consulta previa** y **garantías para personas defensoras de derechos humanos**. Los repositorios deben ser **privados** y el acceso restringido al equipo autorizado.

---

## 2. Arquitectura General de 12 Repositorios

El sistema se divide en **12 repositorios independientes**, organizados por capas para separar responsabilidades (diseño solo accede a frontends; backend e infraestructura quedan protegidos):

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
         │        ││        ││          ││      ││     ││      │
         │  DB 1  ││  DB 2  ││   DB 3   ││ DB 4 ││DB 5 ││ DB 6 │
         └────────┘└────────┘└──────────┘└──────┘└─────┘└──────┘
```

---

## 3. Lista de Repositorios a Crear

### Frontends (Equipo de Diseño)

| # | Repositorio | Stack | Descripción | Acceso Diseño |
|---|---|---|---|---|
| 1 | `front-tablero` | React 19 + Vite 6 + Tailwind | Tablero principal (público e interno) | ✅ Write |
| 2 | `front-radicacion` | React 19 + Vite 6 + Tailwind | Portal ciudadano de radicación | ✅ Write |
| 3 | `front-admin` | React 19 + Vite 6 + Tailwind | Panel de administración y estadísticas | ✅ Write |

### Microservicios Backend (Equipo Backend)

| # | Repositorio | Stack | Puerto | Descripción | Acceso Diseño |
|---|---|---|---|---|---|
| 4 | `ms-autenticacion` | Node.js + Express + MySQL | 3001 | Login, registro, sesiones, JWT | ❌ Sin acceso |
| 5 | `ms-iniciativas` | Node.js + Express + MySQL | 3002 | CRUD iniciativas, documentos, CSV | ❌ Sin acceso |
| 6 | `ms-radicacion` | Node.js + Express + MySQL | 3003 | Radicación ciudadana y consultas | ❌ Sin acceso |
| 7 | `ms-flujo-estados` | Node.js + Express + MySQL | 3004 | Máquina de estados e historial | ❌ Sin acceso |
| 8 | `ms-notificaciones` | Node.js + Express + Redis | 3005 | Colas y envío de correos | ❌ Sin acceso |
| 9 | `ms-administracion` | Node.js + Express + MySQL | 3006 | Roles, permisos, reportes | ❌ Sin acceso |

### Compartidos / Infraestructura

| # | Repositorio | Descripción | Acceso |
|---|---|---|---|
| 10 | `api-gateway` | Gateway de enrutamiento y rate limit | Backend + DevOps |
| 11 | `infra-iniciativas` | Docker Compose y manifiestos de despliegue | Solo DevOps |
| 12 | `tipos-compartidos` | Paquete npm `@mininterior/tipos` | Lectura todos |

---

## 4. Matriz de Permisos por Equipo

| Repositorio | Diseño | Backend | DevOps | Líder Técnico |
|---|---|---|---|---|
| `front-tablero` | **Write** | Read | Read | Admin |
| `front-radicacion` | **Write** | Read | Read | Admin |
| `front-admin` | **Write** | Read | Read | Admin |
| `ms-*` (todos) | ❌ Sin acceso | **Write** | Read | Admin |
| `api-gateway` | ❌ Sin acceso | **Write** | **Write** | Admin |
| `infra-iniciativas` | ❌ Sin acceso | Read | **Admin** | Admin |
| `tipos-compartidos` | Read | **Write** | Read | Admin |

---

## 5. Checklist para el Equipo DevOps

- [ ] Crear los 12 repositorios en modalidad **Privada**.
- [ ] Configurar ramas protegidas en cada uno (`main`, `staging`, `develop`).
- [ ] Subir los esqueletos de carpetas preparados en el espacio local.
- [ ] Configurar secretos de CI/CD para los despliegues de staging y producción.
- [ ] Habilitar pipelines de verificación de tipos y pruebas automáticas.
