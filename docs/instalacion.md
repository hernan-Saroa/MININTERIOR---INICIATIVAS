# Instalación

Tres caminos. Elija uno según lo que vaya a hacer.

| Camino | Cuándo |
|---|---|
| **A · Docker** | Poner el sistema en producción. Un comando, todo incluido. |
| **B · Manual** | Trabajar en el código con la base en el servidor de siempre. |
| **C · Antigravity** | Editar el proyecto con el agente. |

---

## A · Con Docker (recomendado para el servidor)

Requisitos: Docker y el plugin Compose.

```bash
unzip iniciativas-legislativas-monorepo.zip -d iniciativas
cd iniciativas
cp .env.example .env
```

Edite `.env` y complete tres cosas:

```bash
MYSQL_ROOT_PASSWORD=<una contraseña larga>
DB_PASSWORD=<otra contraseña larga, la que usará la aplicación>

# Genere este valor, no lo invente:
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
SESSION_SECRET=<la cadena generada>

ORIGEN_PERMITIDO=https://mininterior.taildcdd19.ts.net
PUERTO_PUBLICO=8080
```

Luego:

```bash
docker compose up -d --build
```

Eso levanta MySQL, aplica **las quince migraciones solas** (el compose monta
`./db` en `/docker-entrypoint-initdb.d`, y MySQL las ejecuta en orden
alfabético al crear el volumen), construye la API y compila la web dentro de
una imagen de Nginx.

Cree el primer administrador:

```bash
docker compose exec api npm run crear-usuario
```

Pregunta nombre, correo, dirección y rol, y pide una contraseña provisional
que no se muestra en pantalla. **Elija el rol `administrador`** para el
primero: es el único que puede gestionar usuarios y roles después.

Compruebe:

```bash
./scripts/verificar-instalacion.sh
```

Solo sale al host el puerto de Nginx. MySQL y la API quedan en la red interna
de Docker, sin puertos publicados.

### Reaplicar migraciones en un volumen que ya existe

Los scripts de `/docker-entrypoint-initdb.d` corren **solo la primera vez**.
Si el volumen ya existía y agrega una migración nueva:

```bash
docker compose exec -T mysql \
  mysql --default-character-set=utf8mb4 -u root -p"$MYSQL_ROOT_PASSWORD" \
  < db/08_lo_que_sea.sql
```

---

## B · Manual, con MySQL ya instalado

Requisitos: Node.js 22 o superior, y MySQL 8 o MariaDB 10.5 o superior.

```bash
unzip iniciativas-legislativas-monorepo.zip -d iniciativas
cd iniciativas
cp .env.example .env       # complete DB_PASSWORD y SESSION_SECRET
```

### 1. Base de datos

```bash
./scripts/instalar-base-de-datos.sh
```

Un solo comando hace todo: crea la base con `utf8mb4`, aplica las siete
migraciones en orden, crea el usuario `iniciativas_app` con exactamente los
permisos que la API necesita —`SELECT`, `INSERT`, `UPDATE`, `DELETE` y
`EXECUTE`, sin `ALTER` ni `DROP`— y verifica el resultado, incluida una
prueba de que las tildes quedaron bien guardadas.

Es idempotente: puede volver a correrlo sobre una base con datos sin perder
nada. Pide las contraseñas por teclado en vez de recibirlas por argumento,
para que no queden en el historial del shell ni en la lista de procesos.

Si prefiere hacerlo a mano:

```bash
for f in db/[0-9][0-9]_*.sql; do
  mysql --default-character-set=utf8mb4 -u root -p < "$f"
done
```

```sql
CREATE USER 'iniciativas_app'@'localhost' IDENTIFIED BY '<la contraseña>';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE
  ON iniciativas_legislativas.* TO 'iniciativas_app'@'localhost';
FLUSH PRIVILEGES;
```

**La bandera `--default-character-set=utf8mb4` no es opcional.** Sin ella, un
cliente que se conecte en latin1 hace dos daños a la vez: guarda las tildes
doble-codificadas —se ve `DiÃ¡logo Social` en las pestañas— y crea los
parámetros de los procedimientos en latin1, con lo que deja de poder guardar
los estados con acento. «En comisión» falla y «Radicado» funciona, así que el
síntoma parece aleatorio. Los archivos traen `SET NAMES utf8mb4` como red de
seguridad, pero pase la bandera igual.

### 2. API

```bash
cd api
npm install
cp .env.example .env       # complete DB_PASSWORD y SESSION_SECRET
npm run crear-usuario      # primer administrador
npm start                  # o npm run dev con recarga
```

### 3. Web

```bash
cd web
npm install
npm run dev                # http://localhost:5173
```

Para producción sin Docker:

```bash
npm run build              # genera web/dist
```

Sirva `web/dist` con Nginx y haga proxy de `/api` al puerto 3000. Hay una
configuración lista en `docker/nginx.conf`. Si no quiere Nginx, la API puede
servir los estáticos: apunte `RUTA_ESTATICOS=../web/dist` en `api/.env`.

---

## C · Abrirlo en Antigravity

```bash
unzip iniciativas-legislativas-monorepo.zip -d iniciativas
cd iniciativas
git init && git add -A && git commit -m "Estructura inicial"
```

Abra la carpeta en Antigravity. El agente lee automáticamente:

- `AGENTS.md` — instrucciones permanentes: idioma, estructura y las cuatro
  reglas que no se negocian.
- `.agents/rules/` — arquitectura, diseño y accesibilidad, y base de datos.
- `.agents/workflows/` — invocables con `/`: `nueva-migracion` y
  `probar-todo`.

Para trabajar necesita la base andando. Lo más simple:

```bash
docker compose -f docker-compose.dev.yml up -d
cd api && npm install && npm run dev
cd web && npm install && npm run dev
```

**Primer encargo sugerido:** `docs/pendientes.md` abre con la tabla de los
veinte endpoints `/api/admin/*` que faltan, cada uno con el procedimiento que
debe llamar y el permiso que debe exigir. Es lo que desbloquea todo lo demás:
la interfaz ya está construida y las firmas del cliente coinciden, así que al
terminarlos basta cambiar `USAR_SIMULADO` a `false` en
`web/src/api/cliente.ts`.

---

## Verificación

```bash
./scripts/verificar-instalacion.sh
```

Comprueba que la API puede conectarse, que las quince migraciones están
aplicadas, que las tildes se guardaron bien, que el usuario de aplicación no
puede alterar el esquema, que existe al menos un administrador y que la API
responde `200` en `/api/salud` y `401` en `/api/iniciativas` sin sesión.

Pruebas del código:

```bash
cd web && npm run build && node prueba-humo.mjs && node prueba-entorno.mjs
bash docs/pruebas-sql/flujo-y-roles.sh
```

---

## Problemas frecuentes

**Nadie puede iniciar sesión y las credenciales son correctas.** Con
`NODE_ENV=production` la cookie de sesión exige HTTPS. Si el sitio se sirve
por HTTP plano, la cookie no viaja. Deje `NODE_ENV` sin definir mientras
resuelve el certificado.

**Las pestañas dicen `DiÃ¡logo Social`.** El catálogo se cargó con el charset
equivocado. Recárguelo:

```bash
mysql --default-character-set=utf8mb4 -u root -p < db/03_datos_iniciales.sql
```

**No se puede cambiar el estado de una iniciativa a «En comisión».** Mismo
origen que el anterior: los parámetros de los procedimientos quedaron en
latin1. Reaplique `db/02_procedimientos.sql` y de la 04 en adelante con la
bandera de charset.

**Nadie puede entrar a administrar usuarios.** Si se le quitó el permiso al
último administrador, el procedimiento lo impide. Si de todos modos ocurrió,
desde SQL:

```sql
UPDATE usuarios SET rol_id = (SELECT id FROM roles WHERE clave='administrador')
WHERE correo = 'su.correo@mininterior.gov.co';
```

**Antes de cualquier migración, respalde.**

```bash
mysqldump -u root -p --default-character-set=utf8mb4 \
  --routines --triggers --events --single-transaction \
  iniciativas_legislativas > respaldo_$(date +%Y%m%d_%H%M).sql
```

> **`--routines` no es opcional.** `mysqldump` no incluye los
> procedimientos almacenados si no se le pide, y esta API no construye
> SQL: cada endpoint hace `CALL sp_x(...)`. Un respaldo sin esa opción
> trae los datos y **cero** de los 43 procedimientos, así que al
> restaurarlo toda la aplicación responde «Error interno del servidor»,
> incluido el ingreso. Comprobado sobre la base viva: sin `--routines` el
> volcado no tiene ni un `CREATE PROCEDURE`; con él, los tiene todos.

## Los guiones de `api/scripts/`

Ninguno de estos aparecía en la documentación, y son los que dejan la base
en un estado usable. Se listan aquí porque quien recibe el proyecto no
tiene otra forma de descubrirlos.

| Guion | Para qué |
|---|---|
| `crear-usuario.js` | Alta interactiva. Es el camino recomendado. |
| `crear_superadmin.js` | La primera cuenta administradora, sin interacción. |
| `seed_iniciales.js` | Datos de demostración: 8 cuentas, 14 iniciativas y sus documentos. |
| `actualizar_orden_iniciativas.js` | Reordena el listado. |
| `fix_charset.js` | Repara tildes cargadas con el charset equivocado. |
| `probar_integracion.js` | Recorrido de humo contra la API. |

**`npm run crear-usuario`** pide nombre, correo, dirección y rol, y la
contraseña sin mostrarla en pantalla ni dejarla en el historial del
intérprete. Los roles se ofrecen leyéndolos del catálogo, así que incluye
los que se hayan creado desde `/admin/roles`.

**La cuenta administradora sin interacción:**

```bash
SUPERADMIN_CORREO=persona@mininterior.gov.co \
SUPERADMIN_NOMBRE="Nombre Apellido" \
node scripts/crear_superadmin.js
```

Genera una contraseña al azar y la muestra **una sola vez**. Si la cuenta
ya existe no le toca la contraseña; para reiniciarla, `--reiniciar-clave`.
Antes traía una contraseña escrita en claro dentro del archivo y la
reescribía en cada ejecución.

**Datos de demostración:**

```bash
node scripts/seed_iniciales.js
```

Cada cuenta recibe una contraseña distinta, generada al azar, que se
muestra una vez y nace obligada a cambiarse. Reejecutarlo **no** toca las
contraseñas ya establecidas; para reiniciarlas todas a propósito,
`--reiniciar-claves`.

> Antes calculaba un único hash de una contraseña escrita en el archivo y
> lo repartía entre las ocho cuentas con `debe_cambiar = FALSE`, y el
> `ON DUPLICATE KEY UPDATE` la reponía en cada ejecución: volver a correr
> el guion revertía en silencio cualquier contraseña que alguien hubiera
> cambiado.

### La contraseña provisional y la escritura

Una cuenta con contraseña provisional **puede consultar pero no
modificar**: toda escritura responde 403 con el código
`CAMBIO_REQUERIDO`. Eso es deliberado, pero durante un tiempo no había
pantalla para cambiarla, así que la primera cuenta —creada precisamente
así— quedaba en solo lectura permanente.

Ahora se cambia desde el tablero: el botón **Contraseña** de la barra
superior, que aparece resaltado y con un aviso mientras la contraseña sea
provisional.

### Si varias cuentas comparten contraseña

Para comprobarlo:

```sql
CALL sp_diagnostico_cuentas();
```

Su tercer bloque lista los grupos de cuentas que comparten hash. Si
aparece alguno, la corrección es reiniciar esas contraseñas —lo que
también las obliga a cambiarlas en el siguiente ingreso—:

```bash
node scripts/seed_iniciales.js --reiniciar-claves
```

Eso cambia credenciales de personas reales y las imprime una sola vez:
decídalo antes de ejecutarlo y tenga a mano cómo entregarlas.
