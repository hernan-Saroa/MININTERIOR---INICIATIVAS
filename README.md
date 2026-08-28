# Iniciativas Legislativas

Sistema de seguimiento del trámite de iniciativas legislativas del
Viceministerio para el Diálogo Social y los Derechos Humanos, Ministerio del
Interior de Colombia.

Seis direcciones registran sus iniciativas, las mueven por un flujo de estados
configurable y adjuntan la documentación soporte como enlaces al repositorio
institucional. El despacho del Viceministro consulta el estado consolidado.
Un canal público permite a la ciudadanía radicar propuestas y consultar el
avance de su trámite por código.

> **Clasificación: uso institucional restringido.** Los datos incluyen trámites
> de consulta previa y de garantías para personas defensoras de derechos
> humanos. Los repositorios son privados.

## Arquitectura

Plataforma de microservicios repartida en **12 repositorios** (submódulos de
este repositorio agregador):

| Grupo | Repositorios |
|---|---|
| Frontends (React + Vite) | `front-tablero`, `front-radicacion`, `front-admin` |
| Puerta de entrada | `api-gateway` |
| Microservicios (Node/Express) | `ms-autenticacion`, `ms-iniciativas`, `ms-radicacion`, `ms-flujo-estados`, `ms-notificaciones`, `ms-administracion` |
| Infraestructura y compartidos | `infra-iniciativas` (orquestación), `tipos-compartidos` |

Los seis microservicios comparten **una sola base MySQL**
(`iniciativas_legislativas`) y el almacén de sesión. El API Gateway es el único
punto de entrada: valida CORS, limita tráfico y enruta a cada microservicio.

```
Navegador ─▶ Nginx (frontend) ─▶ API Gateway ─▶ ms-* ─▶ MySQL
                                                   └────▶ (Redis, reservado)
```

## Cómo levantarlo

**Producción / demostración (todo en Docker):**

```bash
cp .env.example .env         # completar contraseñas, SESSION_SECRET, SERVICIO_TOKEN
docker compose up -d --build
```

El `docker compose.yml` de la raíz incluye la orquestación real de
`infra-iniciativas`. Al arrancar, un servicio `migrador` aplica solo las
migraciones en orden y la plataforma queda lista. Se publican los tres
frontends (8080 tablero, 8081 radicación, 8082 admin). Guía completa y para
servidores: **`docs/GUIA_DESPLIEGUE_CLOUD.md`**.

En Windows, el mismo resultado con:

```powershell
.\start_all.ps1              # plataforma completa;  -Dev = solo la base para desarrollo
```

**Desarrollo (base en contenedor, servicios en caliente):** ver
**`INSTALACION.md`**.

## Cómo está construido

**La API no arma SQL.** Cada endpoint hace `CALL sp_x(?, ?)` con parámetros
ligados; no hay concatenación de cadenas, así que el sistema es inmune a
inyección SQL por construcción, no por disciplina.

**El flujo de estados es configurable.** Estados, transiciones permitidas,
responsables y visibilidad se administran desde la pantalla, no desde el
código. Cada movimiento queda en `historial_iniciativa` con autor, fecha y
motivo.

**Los roles son dinámicos, los permisos no.** Un permiso existe porque hay
código que lo verifica, así que el catálogo se amplía por migración. Los roles
los crea el administrador combinando permisos libremente, y se resuelven contra
la base en cada petición.

**Autenticación robusta.** Sesión en cookie `httpOnly`, contraseñas con scrypt
y comparación en tiempo constante, bloqueo por intentos, límite por IP,
revocación de sesiones al cambiar la contraseña y defensa contra enumeración de
cuentas.

## Estado y calidad

El sistema está **completo y en funcionamiento**: los seis microservicios, el
gateway y los tres frontends arrancan y operan de extremo a extremo (registro
ciudadano → radicación → ingreso de funcionario → tablero → flujo de estados →
exportación).

Se realizó una **auditoría de calidad y seguridad** (seguridad, OWASP,
carga/estrés y funcionamiento), con **21 de 24 hallazgos corregidos y
verificados en ejecución**. Informe completo en **`docs/auditoria-qa.md`**.
Hay integración continua (`.github/workflows/ci.yml`) que levanta la plataforma
y corre una prueba extremo a extremo en cada cambio.

## Documentación

- **`docs/GUIA_DESPLIEGUE_CLOUD.md`** — despliegue en servidores, paso a paso. Para el equipo de operaciones.
- **`INSTALACION.md`** — puesta en marcha local para desarrollo.
- **`docs/auditoria-qa.md`** — informe de auditoría de calidad y seguridad.
- **`docs/migraciones.md`** — qué hace cada migración y cómo se aplican.
- Cada repositorio tiene su propio `README.md` con sus rutas y variables.

## Estructura del repositorio

```
front-tablero/ front-radicacion/ front-admin/   Frontends React
api-gateway/                                     Puerta de entrada
ms-*/                                            Microservicios (src/ + migraciones/)
infra-iniciativas/                               docker-compose de producción
tipos-compartidos/                               Tipos TypeScript comunes
docker-compose.yml                               Incluye la orquestación real
docker-compose.dev.yml                           Base única para desarrollo
scripts/                                          Pruebas y verificaciones (ver scripts/README.md)
docs/                                             Guías, auditoría, migraciones
```
