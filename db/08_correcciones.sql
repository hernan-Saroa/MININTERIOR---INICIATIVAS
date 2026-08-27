-- =====================================================================
-- Archivo: 08_correcciones.sql — el guardado por campo deja de borrar
--
-- Problema que corrige:
--   sp_actualizar_iniciativa (migración 02) protegía nombre, estado y
--   prioridad con COALESCE, pero asignaba objeto, numero_proyecto y
--   fecha_actualizacion directamente. El tablero guarda campo por campo:
--   cada celda editable manda un solo campo y la API rellenaba el resto
--   con NULL, así que corregir el título borraba el objeto, el número de
--   proyecto y la fecha, sin aviso y sin forma de recuperarlo.
--
-- El contrato nuevo, que la API respeta al armar la llamada:
--   NULL  → el campo no viene en la petición: la columna no se toca.
--   ''    → el campo viene vacío a propósito: la columna se vacía.
--   valor → se escribe.
--
-- Por eso la fecha entra como VARCHAR(10) y no como DATE: hace falta
-- poder distinguir «no me la mandaron» (NULL) de «bórrela» (''), y una
-- cadena vacía no es una fecha válida. La conversión se hace aquí.
--
-- nombre es NOT NULL, así que nunca se vacía: '' se trata como ausente
-- y la API además lo rechaza con un 400 antes de llegar hasta aquí.
--
-- Idempotente. Ejecutar SIEMPRE con charset utf8mb4:
--   mysql --default-character-set=utf8mb4 -u root -p < db/08_correcciones.sql
-- =====================================================================
SET NAMES utf8mb4;
USE iniciativas_legislativas;

-- ---------------------------------------------------------------------
-- sp_actualizar_iniciativa — actualización parcial sin pérdida
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_actualizar_iniciativa;

DELIMITER $$
CREATE PROCEDURE sp_actualizar_iniciativa(
  IN p_id                  INT,
  IN p_nombre              VARCHAR(500),
  IN p_objeto              TEXT,
  IN p_numero_proyecto     VARCHAR(150),
  IN p_estado              VARCHAR(30),
  IN p_prioridad           VARCHAR(20),
  IN p_fecha_actualizacion VARCHAR(10)
)
BEGIN
  UPDATE iniciativas
  SET
      -- NOT NULL: solo se reemplaza si llega con contenido.
      nombre = CASE
                 WHEN p_nombre IS NULL OR p_nombre = '' THEN nombre
                 ELSE p_nombre
               END,

      objeto = CASE
                 WHEN p_objeto IS NULL THEN objeto
                 WHEN p_objeto = ''    THEN NULL
                 ELSE p_objeto
               END,

      numero_proyecto = CASE
                          WHEN p_numero_proyecto IS NULL THEN numero_proyecto
                          WHEN p_numero_proyecto = ''    THEN NULL
                          ELSE p_numero_proyecto
                        END,

      -- ENUM con valor por defecto: no se puede vaciar, solo cambiar.
      estado    = COALESCE(p_estado, estado),
      prioridad = COALESCE(p_prioridad, prioridad),

      fecha_actualizacion = CASE
                              WHEN p_fecha_actualizacion IS NULL THEN fecha_actualizacion
                              WHEN p_fecha_actualizacion = ''    THEN NULL
                              ELSE STR_TO_DATE(p_fecha_actualizacion, '%Y-%m-%d')
                            END
  WHERE id = p_id
    AND activo = TRUE;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- Diagnóstico: cuántos registros quedaron sin objeto o sin número.
--
-- Antes de dar por buena la corrección conviene comparar este conteo
-- con la última copia de seguridad. Si el error ya alcanzó a producción,
-- estas son las filas que hay que restituir a mano: el procedimiento
-- viejo no dejaba historial, así que el dato no está en ninguna otra
-- tabla de este esquema.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_diagnostico_campos_vacios;

DELIMITER $$
CREATE PROCEDURE sp_diagnostico_campos_vacios()
BEGIN
  SELECT
    COUNT(*)                                                     AS total_activas,
    SUM(objeto IS NULL OR objeto = '')                           AS sin_objeto,
    SUM(numero_proyecto IS NULL OR numero_proyecto = '')         AS sin_numero_proyecto,
    SUM(fecha_actualizacion IS NULL)                             AS sin_fecha
  FROM iniciativas
  WHERE activo = TRUE;
END$$
DELIMITER ;

INSERT INTO schema_version (version, descripcion) VALUES
  (8, 'sp_actualizar_iniciativa: actualización parcial sin borrar campos ausentes')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);
