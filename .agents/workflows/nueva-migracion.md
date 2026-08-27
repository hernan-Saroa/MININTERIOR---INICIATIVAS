Crear una migración de base de datos nueva.

1. Determinar el número siguiente mirando `db/` y la tabla `schema_version`.
   Nunca reusar ni editar un número existente.
2. Crear `db/NN_nombre_descriptivo.sql` con esta cabecera:
   - Comentario de bloque explicando qué hace y por qué.
   - `SET NAMES utf8mb4;`
   - `USE iniciativas_legislativas;`
3. Escribir los cambios de forma idempotente:
   - Tablas con `CREATE TABLE IF NOT EXISTS`.
   - Columnas consultando `information_schema.columns` y armando el `ALTER`
     con `PREPARE`/`EXECUTE`.
   - Datos con `INSERT … ON DUPLICATE KEY UPDATE` o `INSERT IGNORE`.
   - Procedimientos con `DROP PROCEDURE IF EXISTS` antes de `CREATE`.
4. Registrar la versión al final con `INSERT INTO schema_version … ON
   DUPLICATE KEY UPDATE`.
5. Probar sobre una base limpia y luego ejecutar la migración **dos veces**
   para confirmar la idempotencia.
6. Si el cambio afecta datos existentes, verificar el relleno con un `SELECT`
   comparativo antes y después.
7. Actualizar la tabla de migraciones en `.agents/rules/03-base-de-datos.md`
   y anotar en `docs/pendientes.md` lo que quede por hacer del lado de la API.
