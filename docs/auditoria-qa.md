# Auditoría de calidad — Plataforma de Iniciativas Legislativas

**Fecha:** 27 de agosto de 2026
**Alcance:** los 12 repositorios (3 frontends, API Gateway, 6 microservicios, infraestructura, tipos compartidos)
**Tipo:** auditoría estática completa + sondas dinámicas OWASP + pruebas de carga/estrés, sobre un entorno reconstruido
**Método:** cada hallazgo se reprodujo en ejecución contra una copia funcional de la plataforma (MySQL 8.4 aislada, los 7 backends y el gateway corriendo). La capacidad se midió con `autocannon` sobre 5.000 iniciativas sembradas (ver F-04).

---

## Resumen ejecutivo

La plataforma **no arrancaba en ninguna de sus formas de despliegue**. La causa de fondo es que la división en microservicios se hizo moviendo archivos, sin adaptar tres capas transversales: datos, sesión y enrutamiento. Sobre eso, hay defectos de seguridad concentrados en las costuras entre servicios (un microservicio sin autenticación, una API de administración duplicada y alcanzable, evasión del anti-spam), no dentro de ellos.

El **código de aplicación es de buena calidad**: acceso a datos exclusivamente por procedimientos almacenados con parámetros ligados (sin inyección SQL), scrypt con comparación en tiempo constante, defensa contra fijación de sesión y contra enumeración por tiempo, neutralización de inyección CSV, y aislamiento por dirección correcto. El problema no es cómo está escrito cada servicio, sino cómo encajan entre sí.

**Se corrigieron los 7 bloqueantes y prácticamente todos los hallazgos de seguridad y funcionamiento** (verificados en ejecución). Queda una decisión organizativa (F-02, frontend duplicado) y la parte de paginación de F-04, que requiere cambio coordinado con el frontend.

| Severidad | Cantidad | Estado |
|---|---|---|
| 🔴 Crítica (arranque) | 7 | **Corregidos** |
| 🔴 Crítica (seguridad) | 3 | **Corregidos** (S-01, S-02, S-03) |
| 🟠 Alta (seguridad) | 4 | **Corregidos** (S-04, S-05, S-06, S-07) |
| 🟠 Alta (funcional) | 2 | **Corregidos** (F-01, F-03) |
| 🟡 Media (seguridad) | 3 | **Corregidos** (S-08, S-09, S-10) |
| 🟡 Media (funcional) | 2 | F-04 **parcial** (rate-limit corregido; paginación pendiente); F-02 decisión |
| 🔵 Baja / calidad | 2 | **Corregidos** (S-11 backends, S-12) |

---

## Parte 1 — Bloqueantes de arranque (CORREGIDOS)

Todos verificados: tras la corrección, los 7 backends arrancan, `npm ci` funciona, las 15 migraciones aplican en limpio, y el recorrido completo (registro ciudadano → radicar → login funcionario → tablero → mover de estado → exportar CSV) funciona **a través del gateway**.

### B-01 · Dependencias de sesión ausentes — los 6 microservicios no arrancaban 🔴
Los 6 MS cargan `src/auth/sesion.js`, que requiere `express-session` y `express-mysql-session`; **ninguno los declaraba**. Verificado: `node src/server.js` moría con `Cannot find module 'express-session'`.
**Corrección:** añadidas ambas a los 6 `package.json`. En `ms-autenticacion` se retiraron `bcryptjs` y `jsonwebtoken`, declaradas pero no usadas (el cifrado usa `node:crypto`).

### B-02 · Sin `package-lock.json` — `npm ci` falla en los 7 backends 🔴
Los 7 Dockerfiles empiezan con `npm ci`, que **exige** lockfile. No existía en ninguno. Verificado: `npm ci` → `EUSAGE`. Ninguna imagen de backend se construía.
**Corrección:** generado `package-lock.json` en los 7 repos. Verificado: `npm ci` completa en los 7.

### B-03 · Migraciones apuntando a una base inexistente 🔴
Las 17 migraciones hacen `USE iniciativas_legislativas` (la base del monolito retirado), mientras la infraestructura levantaba seis bases `ms_*_db`. Además, auth/radicación/flujo hacen `ALTER TABLE` sobre `usuarios` e `iniciativas`, que solo crea la migración 01 — imposible con bases separadas.
**Corrección:** consolidación a una base única (ver B-06).

### B-04 · El API Gateway devolvía 404 en todo el tráfico de negocio 🔴
`app.use(ruta, proxy)` hace que Express **retire el prefijo** de `req.url` antes de que el proxy lo vea; el `pathRewrite` intentaba reponerlo sobre una ruta ya recortada y no coincidía. Resultado: el microservicio recibía `/` en vez de `/api/iniciativas`. Verificado: `GET /api/iniciativas/salud` a través del gateway devolvía el health de `/salud` — prueba de que el prefijo desaparecía. **Como todo el frontend pasa por el gateway, la plataforma era inoperante aunque los servicios arrancaran.**
Bug secundario: en http-proxy-middleware v3 la opción `onError` de nivel superior **se ignora** (debe ir en `on.error`), así que el 502 con JSON nunca se emitía.
**Corrección:** se usa `pathFilter` (preserva la ruta íntegra) y el manejador de error se movió a `on.error`. Verificado: todas las rutas de negocio responden 200 vía gateway.

### B-05 · El autorregistro ciudadano devolvía 500 siempre 🔴
`ms-radicacion/src/server.js` no montaba `sesion` ni `identifica`, pero `rutas/publico.js` llama `req.session.regenerate(...)` en `/registrar`. Verificado: 500 con `Cannot read properties of undefined (reading 'regenerate')`, y la cuenta quedaba a medias (creada en BD, sin sesión).
**Corrección:** se montan `sesion` e `identifica`. Verificado: registro → 201.

### B-06 · `SESSION_SECRET` y topología de base (decisión de consolidación) 🔴
El compose solo pasaba `SESSION_SECRET` a `ms-autenticacion`; los otros cinco cargan el mismo `sesion.js`, que lanza excepción en producción sin esa variable. Y con seis bases separadas, la sesión de un servicio no valía en otro.
**Corrección (decisión de arquitectura):** se consolidó en **una base MySQL única** (`iniciativas_legislativas`), que es lo que las migraciones ya piden, y se propaga el mismo `SESSION_SECRET` a los seis. Es también el único modo de tener un almacén de sesión compartido. El aislamiento «una base por servicio» nunca existió en el esquema, así que no se pierde nada real. Camino futuro si se quiere separar de verdad: mover sesiones a Redis (ya previsto en el compose) y desacoplar el esquema por dominios. Se añadió además un **servicio migrador** que aplica las migraciones en orden numérico (deduplicando la 06, idéntica en dos repos). Verificado: sesión iniciada en el gateway válida en los seis servicios; `docker compose config` válido.

### B-07 · `/api/estadisticas` con prefijo duplicado → 404 🔴
`ms-administracion` montaba `reportes.js` bajo `/estadisticas`, y ese router **ya** define `/estadisticas`: la ruta efectiva era `/estadisticas/estadisticas`. El gateway enruta `/api/estadisticas` aquí, así que quedaba muerta.
**Corrección:** montaje en la raíz, como en `ms-iniciativas` (patrón para el que `reportes.js` está diseñado). Verificado: `/api/estadisticas` → 200.

---

## Parte 2 — Seguridad

Los tres críticos (S-01, S-02, S-03) quedaron **corregidos y verificados**. El resto (S-04 en adelante) queda reportado para decisión del equipo.

### S-01 · Microservicio de notificaciones sin autenticación — relay de correo abierto 🔴 (OWASP A01/A04) — CORREGIDO
`ms-notificaciones/src/server.js` no montaba sesión ni ninguna guarda. El gateway publicaba `/api/notificaciones`, así que `POST /api/notificaciones/radicacion` y `/avance` **quedaban abiertos a internet**. Con SMTP configurado, cualquiera enviaba correo con remitente `iniciativas@mininterior.gov.co` a destinatarios arbitrarios.
**Evidencia:** petición anónima → 200, correo entregado con `From: ...@mininterior.gov.co` (capturado en un SMTP de laboratorio).
**Corrección aplicada:** (1) se retiró `/api/notificaciones` de la tabla de enrutamiento del gateway —no lo consume ni el frontend ni otro servicio—, así que deja de ser alcanzable desde internet; (2) se añadió una guarda de token servicio-a-servicio (`x-servicio-token` contra `SERVICIO_TOKEN`, comparación en tiempo constante) que **falla cerrado en producción** (el servicio no arranca sin el token). Los microservicios que deban notificar llaman por la red interna con el token.
**Verificado:** vía gateway → 404; directo sin token → 401; con token incorrecto → 401; con token válido → 200.

### S-02 · API de administración paralela y alcanzable en `ms-flujo-estados` 🔴 (OWASP A01) — CORREGIDO
`ms-flujo-estados/src/rutas/flujo.js` es **idéntico byte a byte** a `ms-administracion/src/rutas/admin.js`: reimplementa `/usuarios`, `/roles`, `/permisos`, `/estados`, `/configuracion`. El gateway enrutaba `/api/flujo` → este servicio, exponiendo una **segunda API de administración** en `/api/flujo/usuarios`, `/api/flujo/roles/:id`, etc.
**Evidencia:** `PUT /api/flujo/usuarios/1 {"rol_id":4}` con sesión de administrador → 200, y el usuario quedó con rol Viceministro. Superficie de ataque duplicada contra la misma base; toda futura corrección de autorización habría que aplicarla en dos sitios.
**Corrección aplicada:** se retiró `/api/flujo` de la tabla de enrutamiento del gateway. El frontend administra estados y roles por `/api/admin` (ms-administracion) y el movimiento de estado lo resuelve ms-iniciativas en `/api/iniciativas/:id/mover`; nada usa `/api/flujo`. `ms-flujo-estados` queda sin consumidor y es **candidato a eliminación** (decisión de arquitectura, no de seguridad).
**Verificado:** `/api/flujo/{usuarios,roles,permisos,estados,configuracion}` vía gateway → 404; la administración legítima por `/api/admin` sigue en 200.

### S-03 · Inyección HTML en el correo institucional 🟠 (OWASP A03) — CORREGIDO
`ms-notificaciones/src/controladores/notificaciones.js` interpolaba en crudo `${nombre}`, `${tituloIniciativa}`, `${motivo}`, `${codigo}` en el HTML del correo. Ese contenido llega del formulario público **sin credenciales** (S-01 lo hacía alcanzable, pero también entra por el flujo legítimo de radicación).
**Evidencia:** un `motivo` con `<a href="https://portal-falso...">…</a><style>*{display:none}</style>` se entregaba tal cual en el cuerpo del correo (capturado).
**Corrección aplicada:** se añadió `escapar()` (entidades HTML) y se pasan por ella todas las variables antes de interponerlas en las dos plantillas. Además, en el asunto se eliminan los saltos de línea para prevenir inyección de cabecera.
**Verificado:** la misma carga sale ahora como `&lt;a href=…` — sin `<a>` ni `<style>` literales en el correo entregado.

### S-04 · Evasión del límite anti-spam por normalización de ruta 🟠 (OWASP A04)
El limitador de `ms-radicacion` resuelve el tope con `TOPES[req.path]`. `req.path` conserva la barra final y las mayúsculas, así que `/propuestas/` y `/PROPUESTAS` dan `tope = undefined` y el `return next()` **salta el límite por completo** — en los dos endpoints que escriben sin credenciales.
**Evidencia (instrumentada):** agotado el cupo (10 → 429), `POST /propuestas/` y `/PROPUESTAS` siguieron devolviendo 201 indefinidamente; el log mostró `tope=undefined`.
**Corrección aplicada:** la ruta se normaliza (sin barra final, minúsculas) antes de buscar el tope, y la misma ruta normalizada es la clave del registro por IP. Ahora `/propuestas/` y `/PROPUESTAS` comparten cupo con `/propuestas`.
**Verificado:** agotado el cupo por la ruta normal, `/propuestas/` y `/PROPUESTAS` → 429 (antes 201).

### S-05 · CORS refleja cualquier origen con credenciales 🟠 (OWASP A05) — CORREGIDO
Los 7 servicios usaban `cors({ origin: process.env.ORIGEN_PERMITIDO || true, credentials: true })`. Sin la variable, `origin: true` **reflejaba el origen del solicitante** y, con `credentials: true`, permitía que cualquier sitio hiciera peticiones autenticadas.
**Evidencia:** `Origin: https://sitio-atacante.example` → `Access-Control-Allow-Origin: https://sitio-atacante.example` + `Allow-Credentials: true` en los 5 servicios probados.
**Corrección aplicada:** en los 7 servicios, se permite solo la lista explícita de `ORIGEN_PERMITIDO` (separada por comas); nunca `|| true`. **Falla cerrado en producción** (no arranca si falta la variable); en desarrollo permite los frontends locales conocidos.
**Verificado:** con `Origin` atacante → sin cabecera `Access-Control-Allow-Origin`; con el origen legítimo → se refleja correctamente.

### S-06 · El cambio de contraseña no revoca las demás sesiones 🟠 (OWASP A07) — CORREGIDO
Verificado: con dos sesiones abiertas, tras cambiar la contraseña en una, la otra (abierta con la clave antigua) **seguía viva y podía escribir**. Tampoco rotaba el id de sesión de quien cambia.
**Corrección aplicada:** `cambiar-contrasena` cierra todas las sesiones del usuario (`sp_cerrar_sesiones_de_usuario`) y regenera una nueva para quien hace el cambio (su sid rota). `restablecer-contrasena` cierra todas las sesiones tras el restablecimiento (escenario de compromiso).
**Verificado:** tras cambiar en la sesión 1, la sesión 2 → 401 (revocada), la sesión 1 → 200 con sid rotado.

### S-07 · Enumeración de usuarios y fuerza bruta sin límite por IP 🟠 (OWASP A07) — CORREGIDO
El login era genérico (401) salvo que, tras varios fallos, una cuenta **existente** pasaba a 429 «Cuenta bloqueada» mientras una inexistente seguía en 401 — esa diferencia enumeraba correos. Además `/api/auth/ingresar` no tenía límite por IP: 20 intentos contra 20 correos distintos desde la misma IP pasaban sin freno.
**Corrección aplicada:** (1) la cuenta bloqueada responde ahora el **mismo 401 genérico** y gasta el mismo tiempo (`gastarTiempo()`) que las demás ramas, sin oráculo por estado ni por latencia; (2) límite por IP con `express-rate-limit` en `/ingresar` (20/15 min, sin contar ingresos exitosos) y en la recuperación (10/15 min).
**Verificado:** cuenta bloqueada e inexistente devuelven idéntico 401; 50 intentos desde una IP → 13 pasan y 37 se frenan con 429.

### S-08 · Tokens de recuperación sin cota en memoria 🟡 (OWASP A07/DoS) — CORREGIDO
`tokensRecuperacion` era un `Map` en memoria; las entradas caducadas solo se borraban si alguien intentaba usarlas, y el endpoint que las crea es anónimo.
**Evidencia:** 500 solicitudes anónimas → 500 tokens retenidos, ninguno liberado.
**Corrección aplicada:** `purgarTokens()` se ejecuta en cada solicitud, elimina los vencidos y acota el mapa a 5.000 (descarta los más antiguos si se excede). Sigue siendo en memoria; para varias réplicas, moverlo a la base/Redis es el paso siguiente (documentado en el código).
**Verificado:** el flujo de recuperación sigue funcionando; la purga se invoca en cada creación.

### S-09 · Inyección de origen en el enlace de recuperación 🟡 (OWASP A07) — CORREGIDO
El enlace se construía con `req.get('origin')`, controlado por el cliente.
**Evidencia:** con `Origin: https://mininterior-gov-co.sitio-falso.example`, el enlace apuntaba a ese dominio.
**Corrección aplicada:** el enlace se construye desde la primera entrada de `ORIGEN_PERMITIDO` (base de confianza del servidor), nunca desde la cabecera `Origin`.
**Verificado:** con `Origin` falso, el enlace generado apunta a `http://localhost:5173` (el configurado), no al dominio del atacante.

### S-10 · Sin cabeceras de seguridad 🟡 (OWASP A05) — CORREGIDO
Ningún servicio ni los tres `nginx.conf` emitían cabeceras de seguridad.
**Corrección aplicada:** los 7 backends (6 MS + gateway) fijan `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` y desactivan `X-Powered-By`. Los tres `nginx.conf` (superficie HTML) añaden además `Permissions-Policy` y dejan **listas pero comentadas** HSTS (exige HTTPS) y una CSP —esta última debe validarse en el navegador con el build real antes de activarla, porque una CSP mal ajustada rompe el SPA—.
**Verificado:** las respuestas de API (directas y vía gateway) traen las tres cabeceras y ya no exponen `X-Powered-By`.

### S-11 · Contenedores como root 🔵 (OWASP A05) — CORREGIDO (backends)
Ningún Dockerfile definía `USER`; los 10 contenedores corrían como root.
**Corrección aplicada:** los 7 Dockerfiles de backend añaden `USER node` (usuario sin privilegios de `node:20-alpine`; los puertos 3000-3006 no requieren root).
**Pendiente (documentado):** los 3 frontends nginx requieren la imagen `nginxinc/nginx-unprivileged` + cambiar `listen 80` a `8080` y el mapeo de puertos del compose. Se deja fuera de esta tanda por el riesgo de romper el mapeo; es un cambio mecánico acotado.

### S-12 · Dependencia con vulnerabilidad conocida 🔵 (OWASP A06) — CORREGIDO
`ms-notificaciones` declaraba `nodemailer ^6.9.0`; `npm audit` reportaba 1 vulnerabilidad alta (inyección de comandos SMTP / CRLF).
**Corrección aplicada:** actualizado a `nodemailer ^9.0.6` y lockfile regenerado.
**Verificado:** `npm audit` → 0 vulnerabilidades; el envío de correo sigue funcionando (nodemailer 9.0.6, correo capturado en el SMTP de laboratorio).

---

## Parte 3 — Funcionamiento, contrato y capacidad (REPORTADOS)

### F-01 · Cadena de arranque local rota (`start_all.ps1`, composes de la raíz) 🟠 — CORREGIDO
`start_all.ps1` sin `-Docker` solo arrancaba el Vite de `front-tablero`; ningún backend. Los dos composes de la raíz eran del monolito: `docker-compose.dev.yml` montaba `./db` (borrada) y `docker-compose.yml` construía `api`/`web` con `docker/api.Dockerfile` (inexistente). Un desarrollador que siguiera el flujo documentado no obtenía una plataforma funcional.
**Corrección aplicada:**
- `docker-compose.yml` (raíz) ahora hace `include` de `infra-iniciativas/docker-compose.yml`, así que `docker compose up` desde la raíz levanta la plataforma completa real. `.env.example` se alineó con las variables que esa orquestación consume.
- `docker-compose.dev.yml` (raíz) se reescribió a una base única de desarrollo con un servicio `migrador-dev` que aplica las migraciones en orden (sin el `./db` borrado).
- `start_all.ps1` por defecto levanta la plataforma completa en Docker (el camino probado) y valida que exista `.env`; `-Dev` levanta solo la base migrada para correr los servicios en caliente.
**Verificado:** `docker compose config` válido en ambos composes de la raíz (el `include` expone los 13 servicios y propaga las variables); los scripts PowerShell parsean sin error.

### F-02 · Frontend duplicado (`front-tablero` = `front-admin`) 🟡 — DECISIÓN PENDIENTE
`front-tablero/src` y `front-admin/src` son **idénticos byte a byte**: dos repositorios y dos contenedores para la misma aplicación (mismo `<title>`). Duplica mantenimiento y superficie de despliegue.
**Por qué no se corrige aquí:** eliminar un submódulo/repositorio o hacer divergir una aplicación es una decisión de producto irreversible, no un arreglo de auditoría. Requiere saber si `front-admin` debe ser una app distinta (y entonces recortarla a lo suyo) o desaparecer (y servir la misma app en otra ruta/puerto). Queda para decisión del equipo.

### F-03 · Sin pruebas automatizadas ni CI 🟠 — CORREGIDO (mínimo viable)
Ningún `package.json` definía script `test`; no había `.github/`, `.gitlab-ci.yml` ni `Jenkinsfile`. Nada impedía que una regresión como B-04 (gateway) o B-05 (registro) llegara a producción.
**Corrección aplicada:**
- `scripts/prueba-e2e.mjs` — prueba de humo + contrato + flujo, sin dependencias (`fetch` nativo). Cubre: gateway vivo, ninguna ruta de negocio en 404 (regresión B-04), `/api/admin` enruta al MS con guarda 401, autorregistro ciudadano → 201 (regresión B-05) y sesión válida.
- `.github/workflows/ci.yml` — en cada push/PR a `main`/`develop` levanta toda la plataforma con `docker compose up --build`, espera al gateway y corre la prueba; vuelca logs si falla.
**Verificado:** contra la plataforma corregida, 8/8 comprobaciones pasan (exit 0). Contra un gateway con el bug original de B-04, la prueba **falla** el contrato (6/8, exit 1) — confirma que detecta la regresión.
**Siguiente paso (no bloqueante):** pruebas unitarias por servicio y un flujo autenticado con roles sembrados; hoy la suite cubre el camino público y de contrato, que es donde estaban las regresiones caras.

### F-04 · Capacidad — medida con carga real 🟡 — CORREGIDA en parte
Prueba con `autocannon` sobre el entorno reconstruido (20 núcleos, MySQL en contenedor, 5.000 iniciativas sembradas), atacando los microservicios directamente para medir su capacidad real (el rate-limit del gateway tapa cualquier medición a través de él).

| Prueba | Endpoint | Conc. | req/s | p50 | p99 | Observación |
|---|---|---|---|---|---|---|
| 1 · Público ligero | `GET /api/publico/direcciones` | 50 | **392** | 125 ms | 155 ms | Techo por `connectionLimit: 10` (50 conex. / 10 del pool → colas) |
| 2 · Pesado sin paginar | `GET /api/iniciativas` (3,2 MB) | 20 | **31** | 592 ms | 1 132 ms | Consume **94,8 MB/s** de ancho de banda; endpoint **público** |
| 5 · Pesado, 1 conexión | `GET /api/iniciativas` | 1 | 21,6 | 41 ms | 98 ms | El throughput apenas sube de 21,6 → 31 con 20× la carga: **cuello de botella duro** en el pool/DB |
| 3 · Login (scrypt) | `POST /api/auth/ingresar` | 20 | **99** | 198 ms | 262 ms | scrypt N=16384; en un servidor de 2-4 núcleos cae a ~10-20/s |
| 4 · Techo del gateway | `GET /api/salud` vía gateway | 50 | — | — | — | **997 atendidas, 48.935 con 429**; una petición legítima posterior también → 429 |

Hallazgos concretos:
- **Amplificación (crítico para capacidad):** `GET /api/iniciativas` no pagina y es público. Con 5.000 filas, cada petición anónima devuelve 3,2 MB; 20 clientes consumen ~95 MB/s y llevan la latencia a 1,1 s. Un puñado de clientes satura ancho de banda y DB.
- **Techo del gateway:** el límite global de 1000 req/15 min equivale a **~1,1 req/s sostenidos para toda la plataforma**. Verificado: tras 997 aciertos, todo el tráfico —cualquier cliente, cualquier ruta— recibe 429 durante 15 minutos. Sin `trust proxy` y detrás de nginx, además, la clave del límite es la IP del contenedor, no la del cliente: un solo cliente puede dejar fuera a todos (DoS trivial).
- **Cuello de botella en datos:** el throughput del endpoint pesado no escala con la concurrencia (21,6 → 31 req/s), señal de que el `connectionLimit: 10` y la base única serializan la carga.
- **Costo de login:** sin límite por IP (ver S-07), cada intento cuesta un `scrypt` (~40-60 ms de CPU); es un vector de agotamiento de CPU además de fuerza bruta.
- **Estabilidad:** ningún servicio cayó ni registró errores bajo carga — degradan, no colapsan.

**Corrección aplicada:** se añadió `app.set('trust proxy', 1)` al gateway, así que el rate-limit pasa de ser efectivamente **global** (un cliente dejaba a todos en 429) a keyear por la IP real del cliente. El límite por IP del login ya se resolvió en S-07.
**Pendiente (requiere cambio coordinado con el frontend):** paginar `GET /api/iniciativas`. Hoy el frontend descarga la lista completa y filtra/exporta en cliente, así que paginar en el servidor exige tocar también el frontend; por eso no se aplica en esta tanda. También conviene revisar `connectionLimit` bajo la carga esperada.
**Verificado:** el gateway ya emite el keyeo por IP (cabeceras `RateLimit-*` con `trust proxy` activo).

---

## Lo que se verificó como correcto

Para acotar el riesgo real, estos controles se probaron y **funcionan**:

- **Sin inyección SQL:** cargas (`' OR '1'='1`, `'; DROP TABLE ...`) en parámetros y en `:id` → los procedimientos parametrizados aguantan; tablas intactas.
- **Aislamiento por dirección (IDOR):** un editor no puede editar/borrar iniciativas de otra dirección (403), ni un lector escribir (403).
- **Neutralización de inyección CSV:** una propuesta con nombre `=cmd|...` sale del CSV con apóstrofo de escape.
- **Privacidad del proponente:** la identidad de quien radica solo se expone con el permiso `iniciativas.ver_proponente`; anónimo no la ve. (Ley 1581 de 2012.)
- **`dangerouslySetInnerHTML` del tablero:** está envuelto en `escapar()` — no es XSS.
- **Contraseñas:** scrypt con `timingSafeEqual`; defensa contra enumeración por tiempo (`gastarTiempo`); regeneración de sesión al ingresar (anti-fijación).

---

## Anexo — Reproducción del entorno de pruebas

1. Una MySQL 8.4 con base `iniciativas_legislativas`.
2. Aplicar las migraciones en orden numérico por nombre de archivo (deduplicando la 06):
   `for f in $(for p in ms-*/migraciones/*.sql; do echo "$(basename $p)|$p"; done | sort | awk -F'|' '!v[$1]++{print $2}'); do mysql ... < "$f"; done`
3. `npm ci` en los 7 backends; arrancar con `DB_*`, `SESSION_SECRET` (igual en los seis) y `ORIGEN_PERMITIDO`.
4. Gateway apuntando a los seis por `MS_*_URL`.

Con la infraestructura corregida (`infra-iniciativas`), esto equivale a `docker compose up -d --build`: el servicio `migrador` automatiza el paso 2.
