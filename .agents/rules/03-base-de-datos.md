# Base de datos

MySQL 8.4 en producción; las pruebas corren en MariaDB 10.11 y ambos
funcionan.

## Migraciones

Numeradas y correlativas en `db/`. Estado actual:

| Archivo | Contenido |
|---|---|
| `01_schema.sql` | Tablas base: direcciones, iniciativas, documentos, usuarios |
| `02_procedimientos.sql` | Los 10 procedimientos originales |
| `03_datos_iniciales.sql` | Las 6 direcciones del Viceministerio |
| `04_autenticacion.sql` | Contraseñas, sesiones, bloqueo por intentos |
| `05_propuestas.sql` | Propuestas sin sesión y autorregistro |
| `06_roles_permisos.sql` | Roles dinámicos y catálogo de permisos |
| `07_flujo_estados.sql` | Estados configurables, responsables, visibilidad, historial |
| `08_correcciones.sql` | Actualización parcial: NULL = no tocar, `''` = vaciar |
| `09_flujo_al_crear.sql` | Lo nuevo nace con `estado_id`; repara lo anterior |
| `10_historial_de_edicion.sql` | El historial registra qué campo cambió |
| `11_historial_fiel.sql` | Comparación binaria, estado nulo en ediciones |
| `12_ver_proponente.sql` | `iniciativas.ver_proponente`: quién ve al remitente |
| `13_tiempo_en_estado.sql` | `desde_estado`: desde cuándo lleva ahí |
| `14_autorizacion_y_flujo.sql` | `fn_tiene_permiso`, el flujo deja de exigir responsables, `sp_actualizar_usuario` |
| `15_cuentas_y_sesiones.sql` | Las cuentas nuevas nacen con rol dinámico; desactivar cierra sesiones |

## Reglas

**Una migración aplicada no se edita.** Se escribe la siguiente. Editar la 04
no sirve de nada en un servidor donde ya corrió.

**Idempotencia obligatoria.** Ejecutar dos veces no debe fallar ni duplicar.
El patrón que se usa: consultar `information_schema.columns` y armar el
`ALTER` con `PREPARE`/`EXECUTE` solo si la columna no existe.

**`SET NAMES utf8mb4` en la primera línea útil, siempre.** Sin eso, un
cliente que se conecte en latin1 guarda las tildes dobles-codificadas *y*
crea los parámetros de los procedimientos en latin1, lo que hace fallar
cualquier `ENUM` con acento — «En comisión» deja de guardarse y el error
parece aleatorio. Ya pasó una vez.

**Registrar la versión** en `schema_version` al final del archivo.

## Compatibilidad hacia atrás

Las columnas `usuarios.rol` (ENUM) e `iniciativas.estado` (ENUM) siguen
existiendo aunque ya estén reemplazadas por `rol_id` y `estado_id`. Es
deliberado: permiten volver atrás. Se retiran en una migración posterior,
cuando esto lleve semanas en producción sin problemas.

Los procedimientos escriben en las dos: ver `sp_mover_iniciativa`, que
actualiza `estado_id` y `estado` a la vez.

## Guardas implementadas

Se lanzan con `SIGNAL SQLSTATE '45000'` y llegan al cliente como `409`:

- No borrar un rol del sistema ni uno con usuarios asignados.
- No dejar el sistema sin ningún administrador de roles. Compara antes y
  después: si nunca hubo administrador, no bloquea — una instalación nueva
  debe poder asignar el primero.
- No mover una iniciativa sin ser responsable del estado de origen.
- No ejecutar una transición que no corresponde al estado actual.
- No devolver ni rechazar sin motivo cuando la transición lo exige.
- No quitar al último responsable activo de un estado.
- No desactivar un estado que tiene iniciativas dentro.
