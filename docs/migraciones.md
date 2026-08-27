# Migraciones

## Aplicar en una base nueva

```bash
for f in db/[0-9][0-9]_*.sql; do
  mysql --default-character-set=utf8mb4 -u root -p < "$f"
done
```

> El comodín era `db/0*.sql`, que solo alcanza del `01` al `09`: desde que
> existe la migración 10 este bucle aplicaba nueve de catorce y no decía
> nada. Al terminar, compruebe que la base quedó en la última versión:
>
> ```bash
> mysql -u root -p -e "SELECT MAX(version) FROM iniciativas_legislativas.schema_version;"
> ```
>
> Tiene que coincidir con el número del último archivo de `db/`.

Con Docker se aplican solas: `docker-compose.yml` monta `./db` en
`/docker-entrypoint-initdb.d`, y MySQL ejecuta los archivos en orden
alfabético la primera vez que crea el volumen.

## Aplicar sobre una base con datos

Respaldar primero:

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

Luego aplicar solo las que falten, consultando `schema_version`:

```sql
SELECT version, descripcion, aplicada_en FROM schema_version ORDER BY version;
```

Todas son idempotentes: reejecutar una ya aplicada no rompe nada.

## El charset no es opcional

`--default-character-set=utf8mb4` en cada ejecución. Sin eso, un cliente que
se conecte en latin1 produce dos daños a la vez:

1. Las direcciones quedan con las tildes doble-codificadas: se ve
   `DiÃ¡logo Social` en las pestañas.
2. Los parámetros de los procedimientos se crean en latin1, lo que hace
   fallar la asignación a cualquier `ENUM` con acento. «En comisión» y «En
   formulación» dejan de guardarse; los estados sin tilde sí funcionan, así
   que el síntoma parece aleatorio.

Los archivos traen `SET NAMES utf8mb4` en la primera línea útil, que cubre el
caso, pero conviene pasar la bandera de todos modos.

## Qué hace cada una

**01 · Esquema.** `direcciones`, `iniciativas`, `documentos`, `usuarios`.
Los ids de dirección son texto legible (`ddhh`, `consulta`) y no
autoincrementales: son un catálogo estable de seis filas.

**02 · Procedimientos.** Los diez originales de consulta y edición.

**03 · Datos iniciales.** Las seis direcciones del Viceministerio.

**04 · Autenticación.** Contraseñas con scrypt, tabla `sesiones`, bloqueo de
quince minutos al quinto intento fallido, y `schema_version`.

**05 · Propuestas.** Iniciativas registradas sin sesión, autorregistro de
usuarios como `lector` pendiente de aprobación, y `sp_adoptar_propuestas`,
que al crear cuenta atribuye las propuestas enviadas antes con ese correo.

**06 · Roles y permisos.** Catálogo de dieciséis permisos, cinco roles del
sistema y roles libres. Añade `usuarios.rol_id`; conserva el `ENUM` viejo.
Incluye la guarda de no dejar el sistema sin administrador, que compara antes
y después para no bloquear una instalación nueva.

**07 · Flujo de estados.** Convierte el `ENUM` de estados en catálogo:
`estados`, `transiciones`, `estado_responsables`, `estado_visibilidad`,
`historial_iniciativa` y `configuracion_historial`. Añade
`iniciativas.estado_id` poblado desde el texto anterior.

Distinción central del modelo: las **transiciones** cambian el estado
(avanzar, devolver, rechazar, cerrar); las **acciones** no lo cambian pero
quedan registradas (acotar el alcance, que guarda el texto anterior junto al
motivo).

## Probar

```bash
bash docs/pruebas-sql/autenticacion.sh
bash docs/pruebas-sql/propuestas.sh
bash docs/pruebas-sql/flujo-y-roles.sh
```

Cada script levanta MariaDB, aplica todo desde cero y verifica las guardas.
Están escritos para el entorno de desarrollo: revisar las rutas antes de
correrlos en otra máquina.
