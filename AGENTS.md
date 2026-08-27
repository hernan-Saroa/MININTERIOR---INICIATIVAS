# AGENTS.md

Sistema de seguimiento de iniciativas legislativas del **Viceministerio para
el Diálogo Social y los Derechos Humanos**, Ministerio del Interior de
Colombia. Entidad pública: los datos incluyen trámites de consulta previa y
garantías para personas defensoras de derechos humanos.

## Idioma

**Todo el código, los comentarios, los nombres de variables, los mensajes de
error y la documentación van en español.** El proyecto ya está escrito así de
forma consistente; mantenerlo. Los mensajes de error que llegan al usuario se
escriben para una persona, no para un desarrollador: `El enlace debe empezar
por http:// o https://`, no `ERR_INVALID_PROTOCOL`.

## Estructura

```
db/       Migraciones SQL numeradas (01 → 15). Toda la lógica de datos.
          08 sin borrado al guardar · 09 estado_id al crear · 10 y 11
          historial de edición · 12 permiso ver_proponente · 13 tiempo en
          estado · 14 autorización por permisos y flujo vivo · 15 cuentas
          nuevas con rol dinámico y cierre de sesiones
api/      Express. NO arma SQL: solo llama procedimientos almacenados.
web/      React + Vite + TypeScript. Tablero y zona /admin.
docker/   Dockerfiles y Nginx.
referencia/ El frontend original sin React. Registro de dónde viene cada
          decisión de diseño; ya no congela nada.
docs/     Arquitectura, migraciones, despliegue y pendientes.
```

## Reglas que no se negocian

**1. El diseño se puede mejorar; lo que hay debajo, no se rompe.**
`web/src/tablero-aprobado.css` y `web/src/estilos.css` se pueden modificar
para elevar la estética. **No hay diseño bloqueado**, y la regla que lo
prohibía se retiró: ya había costado que el contraste incumpliera WCAG AA
en ocho combinaciones y quedara meses anotado como «pendiente de acordar»
porque los colores estaban congelados.

Lo obligatorio, en cambio, no se negocia:

- **Contraste WCAG 2.1 AA** — lo exige la Resolución 1519 de 2020 del
  MinTIC. `node scripts/verificar-contraste.js` comprueba 31 pares en las
  dos hojas y **falla** si alguno baja del mínimo. Ejecútelo siempre que
  toque un color.
- **Identidad institucional:** navy GOV.CO, azul de acción, logos.
- **Móvil primero y totalmente responsivo**, con 44 px de área tocable.
- **Accesibilidad de teclado y lector de pantalla**, que cubren
  `prueba-a11y.mjs` y `prueba-foco.mjs`.
- **Los nombres de clase que el JSX usa**: renombrar una clase sin
  renombrarla en el `.tsx` no rompe el build ni los tipos, solo la
  pantalla.

Detalle en `.agents/rules/02-diseno.md`.

**2. La API nunca arma SQL.** Todos los accesos son
`pool.query('CALL sp_x(?, ?)', [...])`. No hay concatenación de strings en
ninguna parte y no debe haberla: es lo que hace el sistema inmune a inyección
SQL por construcción, no por disciplina. Lógica nueva de datos → procedimiento
nuevo en una migración.

**3. Las migraciones son idempotentes y no se editan.** Una migración ya
aplicada en producción nunca se modifica: se escribe la siguiente. Cada una
declara `SET NAMES utf8mb4` en la primera línea útil y registra su versión en
`schema_version`. Ver `.agents/rules/03-base-de-datos.md`.

**4. Los permisos son catálogo del sistema, los roles son libres.** Un
permiso existe porque hay código que lo verifica. Para agregar un permiso hay
que agregarlo en una migración *y* verificarlo en el código. Los roles los
crea el administrador desde la pantalla.

**5. «Tener sesión» no es una autorización.** El autorregistro es
autoservicio, así que cualquiera se hace una cuenta en medio minuto: una
guarda que solo comprueba `req.usuario` no protege nada. Lo que decide el
acceso a datos sensibles es un permiso. Ejemplo vivo:
`iniciativas.ver_proponente` (migración 12) decide quién ve el nombre de la
persona que radicó una iniciativa ciudadana.

**6. El rol que autoriza es `rol_id`, nunca la columna `usuarios.rol`.** Esa
columna es el ENUM de la fase 2 y solo sigue existiendo para poder volver
atrás. Autorizar con ella tiene una consecuencia concreta: `sp_asignar_rol`
escribe `rol_id`, así que bajar a alguien a Lector desde /admin no le quitaba
la escritura —la columna seguía diciendo «editor»—. Una revocación que no
revoca. `puedeEscribir` y `mismaDireccion` resuelven permisos con
`permisosDe()`; en la base, `fn_tiene_permiso()` hace lo mismo desde un
procedimiento. Si escribe una guarda nueva, use una de las dos.

**7. Una guarda que avisa después de escribir no guarda nada.** MySQL
confirma cada sentencia por su cuenta, así que un `SIGNAL` posterior al
`UPDATE` deja el daño hecho y además muestra un error: lo peor de los dos
mundos. `sp_quitar_responsable` arrastraba ese defecto y esta misma
advertencia se escribió después de repetirlo por descuido en
`sp_actualizar_usuario`, que dejó las dos cuentas administradoras
convertidas en lector. Compruebe **antes** de tocar la tabla.

## Comandos

```bash
# Instalación completa de la base (crea, migra y crea el usuario)
./scripts/instalar-base-de-datos.sh
./scripts/verificar-instalacion.sh

# Migraciones: aplica solo lo que falta según schema_version.
# --forzar reaplica las quince, y eso REVIERTE lo configurado en /admin.
node scripts/aplicar-migraciones.js

# El flujo y la autorización, contra la base viva. Cada aserción
# corresponde a un defecto que ya ocurrió: si falla es una regresión.
node scripts/verificar-flujo.js

# Contraste WCAG AA en las dos hojas de estilo. Falla si algún par baja.
node scripts/verificar-contraste.js

# Diferencias entre el tablero y la referencia original. Solo informa.
node referencia/comparar-diseno.mjs

# Cuentas. Ninguno de estos guiones estaba documentado, y son los que
# dejan la base en un estado usable: las migraciones solo siembran
# catálogo. Ver INSTALACION.md.
cd api && npm run crear-usuario                      # alta interactiva
SUPERADMIN_CORREO=... node scripts/crear_superadmin.js   # primera administradora
node scripts/seed_iniciales.js                       # datos de demostración

# Inicio rápido en Windows (levanta base, API, web y abre navegador):
.\start_all.ps1
.\stop_all.ps1

# Solo la base, en contenedor, para desarrollo
docker compose -f docker-compose.dev.yml up -d

# API
cd api && npm install && npm run dev

# Web
cd web && npm install && npm run dev     # http://localhost:5173
cd web && npm run check                  # tipos
cd web && npm run build

# Producción completa
cp .env.example .env    # completar antes
docker compose up -d --build
```

## Pruebas

```bash
cd web
npm run prueba            # contraste, genera dist-test/ y corre las siete pruebas
npm run contraste         # solo el contraste: no necesita build ni base
# o por separado:
npm run build:pruebas     # paquete IIFE en dist-test/app.js
node prueba-humo.mjs
node prueba-a11y.mjs
node prueba-foco.mjs
node prueba-url.mjs
node prueba-tiempo.mjs
node prueba-filtros.mjs
node prueba-entorno.mjs
```

`npm run prueba` empieza por el contraste, antes del build: es barato, no
necesita nada levantado, y es una obligación legal —Resolución 1519 de 2020
del MinTIC—, así que si falla no tiene sentido seguir.

Las siete corren en jsdom contra el simulador, así que **no comprueban la
base ni la API**. Eso lo cubre un guion aparte, que sí necesita MySQL
levantado:

```bash
node scripts/verificar-flujo.js      # 30 aserciones sobre flujo, permisos y cuentas
node referencia/comparar-diseno.mjs  # diferencias con la referencia (informativo)
```

Las siete pruebas leen `dist-test/app.js`, que produce
`vite.test.config.mjs` (formato IIFE, porque jsdom no ejecuta módulos ES).
Sin ese paso previo terminan en ENOENT, y por eso `npm run prueba` lo
encadena. Ese build activa el simulador, así que la suite no necesita ni API
ni base de datos levantadas.

Qué cubre cada una:

| Archivo | Qué comprueba |
|---|---|
| `prueba-humo.mjs`   | 22 comprobaciones: monta, navega y dibuja el diseño aprobado |
| `prueba-a11y.mjs`   | 31 sobre el DOM renderizado: puntos de referencia, región viva, tabla y sus roles explícitos, nombres accesibles, jerarquía y las dos trampas del CSS |
| `prueba-foco.mjs`   | 14 sobre el comportamiento de los diálogos: `inert`, trampa de foco, Escape |
| `prueba-url.mjs`    | 10 sobre el estado en la URL: pestaña, consulta y estado vacío |
| `prueba-tiempo.mjs` | 13 sobre el tiempo visible y la jerarquía de la fila |
| `prueba-filtros.mjs`| 23 sobre las tarjetas del resumen como filtros, esperando la condición y no el reloj |
| `prueba-entorno.mjs`| monta con y sin URL navegable (el caso del visor sin origen) |

Las tres últimas cierran el jsdom y salen con código de proceso.

**Dos trampas conocidas** al escribir aserciones nuevas:

- El bundle se inyecta dentro del `<body>`, así que `body.textContent`
  incluye el código fuente completo y cualquier comprobación de texto pasa
  por accidente. Leer siempre `#raiz`.
- Con un diálogo abierto, los campos del formulario de fondo siguen en el
  DOM y los índices se corren. Acotar las consultas a `[role="dialog"]`.

Para la base de datos, los scripts de `docs/pruebas-sql/` levantan MariaDB,
aplican todas las migraciones y verifican las guardas de flujo y roles.

## Lo que falta

`web/src/api/cliente.ts` corre contra la API real. El interruptor
`USAR_SIMULADO` **no se edita a mano**: lo fija el build, con
`import.meta.env.VITE_SIMULADO`.

- `vite.config.ts` (producción) no define nada → API real.
- `vite.test.config.mjs` (pruebas) define `VITE_SIMULADO` y
  `VITE_SESION_PRUEBA` → simulador en memoria y sesión sembrada, porque
  jsdom no tiene servidor detrás y sin datos media suite falla por falta de
  contenido y no por un defecto.

Se hizo así porque cambiarlo a mano y olvidar restaurarlo publica una
interfaz que no habla con la base, y eso no se nota hasta que alguien
intenta guardar.

`api/rutas/admin.js` expone las diecisiete rutas de las migraciones 06 y 07,
y **ya exigen sesión y permiso**: la sesión en el montaje (`server.js`) y el
permiso ruta por ruta con `tienePermiso(...)`. Los permisos se resuelven
contra la base en cada petición, con caché corta, para que revocar surta
efecto sin cerrar sesión. Ver `docs/pendientes.md`.

Otros pendientes con consecuencia: la API no envía correo (por eso el enlace
de recuperación solo va al registro del servidor, ver
`RECUPERACION_ENLACE_EN_RESPUESTA`), la edición de contenido no deja
historial, y `estado_visibilidad` está en la base pero ninguna consulta la
aplica.

## Cuidados de contexto público

Antes de cambiar algo que afecte quién ve qué, considerar que este sistema
registra trámites relacionados con la protección de líderes sociales. La
tabla `estado_visibilidad` controla el alcance por estado y puede exponer
información sin tocar una línea de código. Cualquier cambio ahí se confirma
con la persona, no se decide en el agente.

No inventar datos de contacto, nombres de funcionarios ni números de proyecto
de ley en ejemplos o pruebas: usar los que ya están en los datos simulados.
