-- =====================================================================
-- Archivo: 10_historial_de_edicion.sql — la edición de contenido deja rastro
--
-- Problema que corrige:
--   El sistema controla con rigor el ESTADO de una iniciativa —transiciones
--   permitidas, responsable por estado, motivo obligatorio, y un asiento en
--   historial_iniciativa con el valor anterior y el nuevo— y no controla
--   nada del CONTENIDO: cualquiera con permiso de edición reescribe el
--   título, el objeto, el número de proyecto o la fecha con un doble clic
--   en la celda, sin motivo y sin dejar rastro.
--
--   El control está al revés del riesgo: mover de «Radicado» a «En comisión»
--   es reversible; reescribir el objeto de una iniciativa de consulta previa
--   no lo es, porque el texto anterior no queda en ninguna parte.
--
--   Ley 1712 de 2014 exige trazabilidad de la información pública.
--
-- Qué hace falta, y por qué es más que «conectar» lo que ya existe:
--   1. `historial_iniciativa.tipo` es un ENUM sin el valor 'edicion': un
--      INSERT con ese tipo falla, o se guarda vacío sin modo estricto.
--   2. No hay ninguna columna que diga QUÉ campo cambió. Con solo
--      valor_anterior y valor_nuevo, un asiento no dice si el texto viejo
--      era el título o el objeto.
--
-- Idempotente. Ejecutar SIEMPRE con charset utf8mb4:
--   mysql --default-character-set=utf8mb4 -u root -p < db/10_historial_de_edicion.sql
-- =====================================================================
SET NAMES utf8mb4;
USE iniciativas_legislativas;

-- ---------------------------------------------------------------------
-- 1. Ampliar el catálogo de tipos y añadir el campo afectado.
--
-- Los ALTER van dentro de un procedimiento desechable porque MySQL no
-- admite `ADD COLUMN IF NOT EXISTS`, y la migración tiene que poder
-- ejecutarse dos veces sin fallar.
-- ---------------------------------------------------------------------
ALTER TABLE historial_iniciativa
  MODIFY tipo ENUM('avanzar','devolver','rechazar','cerrar','acotar','creacion','edicion') NOT NULL;

DROP PROCEDURE IF EXISTS sp_tmp_agregar_columna_campo;
DELIMITER $$
CREATE PROCEDURE sp_tmp_agregar_columna_campo()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name   = 'historial_iniciativa'
       AND column_name  = 'campo'
  ) THEN
    ALTER TABLE historial_iniciativa
      ADD COLUMN campo VARCHAR(40) NULL COMMENT 'Columna editada, solo para tipo=edicion'
      AFTER tipo;
  END IF;
END$$
DELIMITER ;
CALL sp_tmp_agregar_columna_campo();
DROP PROCEDURE sp_tmp_agregar_columna_campo;

-- ---------------------------------------------------------------------
-- 2. sp_actualizar_iniciativa — mismo contrato, y ahora deja rastro.
--
-- El contrato de la migración 08 NO cambia, porque es lo que impide que
-- guardar un campo borre los otros:
--   NULL  → el campo no viene: la columna no se toca
--   ''    → viene vacío a propósito: la columna se vacía
--   valor → se escribe
--
-- Lo que se añade es un octavo parámetro con el autor, la lectura de los
-- valores viejos ANTES del UPDATE, y un asiento por cada campo que de
-- verdad cambió. Sin autor no se registra: un asiento sin responsable no
-- sirve de trazabilidad, y es mejor no escribirlo que escribir uno falso.
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
  IN p_fecha_actualizacion VARCHAR(10),
  IN p_usuario_id          INT
)
BEGIN
  DECLARE v_nombre    VARCHAR(500);
  DECLARE v_objeto    TEXT;
  DECLARE v_numero    VARCHAR(150);
  DECLARE v_prioridad VARCHAR(20);
  DECLARE v_fecha     DATE;
  DECLARE v_estado_id INT;

  -- Los valores de antes. Si la iniciativa no existe o está de baja, no se
  -- toca nada: el UPDATE de abajo tampoco encontraría fila.
  SELECT nombre, objeto, numero_proyecto, prioridad, fecha_actualizacion, estado_id
    INTO v_nombre, v_objeto, v_numero, v_prioridad, v_fecha, v_estado_id
    FROM iniciativas
   WHERE id = p_id AND activo = TRUE;

  UPDATE iniciativas
  SET
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

      estado    = COALESCE(p_estado, estado),
      prioridad = COALESCE(p_prioridad, prioridad),

      fecha_actualizacion = CASE
                              WHEN p_fecha_actualizacion IS NULL THEN fecha_actualizacion
                              WHEN p_fecha_actualizacion = ''    THEN NULL
                              ELSE STR_TO_DATE(p_fecha_actualizacion, '%Y-%m-%d')
                            END
  WHERE id = p_id
    AND activo = TRUE;

  -- Un asiento por campo que cambió de verdad. `<=>` compara con NULL sin
  -- sorpresas: `NULL = NULL` da NULL, y entonces nada se registraría al
  -- vaciar o al rellenar un campo que estaba vacío.
  IF p_usuario_id IS NOT NULL AND ROW_COUNT() > 0 THEN

    INSERT INTO historial_iniciativa
      (iniciativa_id, usuario_id, tipo, campo, estado_anterior, estado_nuevo, valor_anterior, valor_nuevo)
    SELECT p_id, p_usuario_id, 'edicion', 'nombre', v_estado_id, v_estado_id, v_nombre, i.nombre
      FROM iniciativas i
     WHERE i.id = p_id AND NOT (i.nombre <=> v_nombre);

    INSERT INTO historial_iniciativa
      (iniciativa_id, usuario_id, tipo, campo, estado_anterior, estado_nuevo, valor_anterior, valor_nuevo)
    SELECT p_id, p_usuario_id, 'edicion', 'objeto', v_estado_id, v_estado_id, v_objeto, i.objeto
      FROM iniciativas i
     WHERE i.id = p_id AND NOT (i.objeto <=> v_objeto);

    INSERT INTO historial_iniciativa
      (iniciativa_id, usuario_id, tipo, campo, estado_anterior, estado_nuevo, valor_anterior, valor_nuevo)
    SELECT p_id, p_usuario_id, 'edicion', 'numero_proyecto', v_estado_id, v_estado_id, v_numero, i.numero_proyecto
      FROM iniciativas i
     WHERE i.id = p_id AND NOT (i.numero_proyecto <=> v_numero);

    INSERT INTO historial_iniciativa
      (iniciativa_id, usuario_id, tipo, campo, estado_anterior, estado_nuevo, valor_anterior, valor_nuevo)
    SELECT p_id, p_usuario_id, 'edicion', 'prioridad', v_estado_id, v_estado_id, v_prioridad, i.prioridad
      FROM iniciativas i
     WHERE i.id = p_id AND NOT (i.prioridad <=> v_prioridad);

    INSERT INTO historial_iniciativa
      (iniciativa_id, usuario_id, tipo, campo, estado_anterior, estado_nuevo, valor_anterior, valor_nuevo)
    SELECT p_id, p_usuario_id, 'edicion', 'fecha_actualizacion', v_estado_id, v_estado_id,
           DATE_FORMAT(v_fecha, '%Y-%m-%d'), DATE_FORMAT(i.fecha_actualizacion, '%Y-%m-%d')
      FROM iniciativas i
     WHERE i.id = p_id AND NOT (i.fecha_actualizacion <=> v_fecha);

  END IF;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- 3. sp_historial_iniciativa — devuelve también el campo editado.
--
-- Sin esto el dato queda en la tabla y no llega a la pantalla.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_historial_iniciativa;

DELIMITER $$
CREATE PROCEDURE sp_historial_iniciativa(IN p_iniciativa_id INT)
BEGIN
  SELECT h.id, h.tipo, h.campo, h.motivo, h.valor_anterior, h.valor_nuevo, h.creado_en,
         u.nombre AS usuario,
         ea.nombre AS estado_anterior, en.nombre AS estado_nuevo
  FROM historial_iniciativa h
  LEFT JOIN usuarios u  ON u.id = h.usuario_id
  LEFT JOIN estados  ea ON ea.id = h.estado_anterior
  LEFT JOIN estados  en ON en.id = h.estado_nuevo
  WHERE h.iniciativa_id = p_iniciativa_id
  ORDER BY h.creado_en DESC, h.id DESC;
END$$
DELIMITER ;

INSERT INTO schema_version (version, descripcion) VALUES
  (10, 'La edición de contenido queda registrada en el historial, por campo')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);
