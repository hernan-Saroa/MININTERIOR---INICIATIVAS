-- =====================================================================
-- Archivo: 11_historial_fiel.sql — corrige tres defectos de la 10
--
-- La migración 10 conectó el registro de ediciones. Una revisión posterior
-- encontró tres cosas mal, todas reproducidas contra una base de pruebas.
-- La 10 no se edita —ya está aplicada— así que se corrige aquí.
--
-- 1. LOS ASIENTOS DE EDICIÓN FALSEABAN LAS ESTADÍSTICAS.
--    Se escribían con estado_anterior = estado_nuevo = estado actual, y
--    sp_estadisticas_flujo cuenta las entradas a un estado como
--    COUNT(*) WHERE h.estado_nuevo = e.id, excluyendo solo el tipo
--    'acotar'. Resultado medido: una sola llamada que corrige tres celdas
--    llevaba «En formulación» de 1 entrada y 30 días de permanencia media
--    a 4 entradas y 7,5 días. Ese número es justo el que /admin/estadisticas
--    presenta como «El paso más lento del trámite», bajo un texto que
--    promete reflejar «lo que realmente pasó».
--    Se arregla por los dos lados: los asientos de edición van con estado
--    NULL, y el procedimiento de estadísticas excluye también 'edicion'.
--
-- 2. CORREGIR TILDES O MAYÚSCULAS NO DEJABA RASTRO.
--    La base es utf8mb4_unicode_ci, que iguala mayúsculas, tildes y hasta
--    ñ con n. Así que `NOT (i.nombre <=> v_nombre)` daba «igual» al pasar
--    de «Ley de garantias» a «LEY DE GARANTÍAS»: el dato cambiaba y no se
--    registraba nada. Se comparan los cuatro campos de texto en binario.
--
-- 3. EL HISTORIAL PODÍA ATRIBUIR A UNA PERSONA LA EDICIÓN DE OTRA.
--    Los INSERT releían `iniciativas` después del UPDATE, sin transacción.
--    Si otra sesión modificaba la fila entremedias, la comparación se
--    cumplía por el cambio ajeno y se escribía un asiento con el usuario
--    de esta llamada. Ahora el procedimiento no vuelve a leer la tabla:
--    calcula el valor nuevo con el mismo CASE del UPDATE, así que registra
--    exactamente lo que él escribió.
--
-- El contrato de la migración 08 sigue intacto:
--   NULL → no tocar · '' → vaciar · valor → escribir
--
-- Idempotente. Ejecutar SIEMPRE con charset utf8mb4:
--   mysql --default-character-set=utf8mb4 -u root -p < db/11_historial_fiel.sql
-- =====================================================================
SET NAMES utf8mb4;
USE iniciativas_legislativas;

-- ---------------------------------------------------------------------
-- 1. sp_actualizar_iniciativa — fiel a lo que escribe
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
  -- Valores de antes.
  DECLARE v_nombre    VARCHAR(500);
  DECLARE v_objeto    TEXT;
  DECLARE v_numero    VARCHAR(150);
  DECLARE v_prioridad VARCHAR(20);
  DECLARE v_fecha     DATE;
  -- Valores que este procedimiento va a escribir. Se calculan aquí, con la
  -- misma regla del UPDATE, para no tener que releer la tabla después.
  DECLARE n_nombre    VARCHAR(500);
  DECLARE n_objeto    TEXT;
  DECLARE n_numero    VARCHAR(150);
  DECLARE n_prioridad VARCHAR(20);
  DECLARE n_fecha     DATE;
  DECLARE v_existe    INT DEFAULT 0;

  SELECT COUNT(*), MAX(nombre), MAX(objeto), MAX(numero_proyecto),
         MAX(prioridad), MAX(fecha_actualizacion)
    INTO v_existe, v_nombre, v_objeto, v_numero, v_prioridad, v_fecha
    FROM iniciativas
   WHERE id = p_id AND activo = TRUE;

  IF v_existe = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La iniciativa no existe';
  END IF;

  -- El valor resultante de cada campo, con la regla del contrato 08.
  SET n_nombre    = CASE WHEN p_nombre IS NULL OR p_nombre = '' THEN v_nombre ELSE p_nombre END;
  SET n_objeto    = CASE WHEN p_objeto IS NULL THEN v_objeto
                         WHEN p_objeto = ''    THEN NULL
                         ELSE p_objeto END;
  SET n_numero    = CASE WHEN p_numero_proyecto IS NULL THEN v_numero
                         WHEN p_numero_proyecto = ''    THEN NULL
                         ELSE p_numero_proyecto END;
  SET n_prioridad = COALESCE(p_prioridad, v_prioridad);
  SET n_fecha     = CASE WHEN p_fecha_actualizacion IS NULL THEN v_fecha
                         WHEN p_fecha_actualizacion = ''    THEN NULL
                         ELSE STR_TO_DATE(p_fecha_actualizacion, '%Y-%m-%d') END;

  UPDATE iniciativas
     SET nombre              = n_nombre,
         objeto              = n_objeto,
         numero_proyecto     = n_numero,
         estado              = COALESCE(p_estado, estado),
         prioridad           = n_prioridad,
         fecha_actualizacion = n_fecha
   WHERE id = p_id
     AND activo = TRUE;

  -- Un asiento por campo que de verdad cambió.
  --
  -- La comparación fuerza utf8mb4_bin: con la colación de la base, cambiar
  -- una tilde o una mayúscula se consideraba «igual» y no dejaba rastro.
  -- El estado va en NULL: una edición no mueve el trámite, y rellenarlo
  -- hacía que las estadísticas de flujo lo contaran como una entrada.
  IF p_usuario_id IS NOT NULL THEN

    IF NOT (n_nombre COLLATE utf8mb4_bin <=> v_nombre COLLATE utf8mb4_bin) THEN
      INSERT INTO historial_iniciativa
        (iniciativa_id, usuario_id, tipo, campo, estado_anterior, estado_nuevo, valor_anterior, valor_nuevo)
      VALUES (p_id, p_usuario_id, 'edicion', 'nombre', NULL, NULL, v_nombre, n_nombre);
    END IF;

    IF NOT (n_objeto COLLATE utf8mb4_bin <=> v_objeto COLLATE utf8mb4_bin) THEN
      INSERT INTO historial_iniciativa
        (iniciativa_id, usuario_id, tipo, campo, estado_anterior, estado_nuevo, valor_anterior, valor_nuevo)
      VALUES (p_id, p_usuario_id, 'edicion', 'objeto', NULL, NULL, v_objeto, n_objeto);
    END IF;

    IF NOT (n_numero COLLATE utf8mb4_bin <=> v_numero COLLATE utf8mb4_bin) THEN
      INSERT INTO historial_iniciativa
        (iniciativa_id, usuario_id, tipo, campo, estado_anterior, estado_nuevo, valor_anterior, valor_nuevo)
      VALUES (p_id, p_usuario_id, 'edicion', 'numero_proyecto', NULL, NULL, v_numero, n_numero);
    END IF;

    IF NOT (n_prioridad COLLATE utf8mb4_bin <=> v_prioridad COLLATE utf8mb4_bin) THEN
      INSERT INTO historial_iniciativa
        (iniciativa_id, usuario_id, tipo, campo, estado_anterior, estado_nuevo, valor_anterior, valor_nuevo)
      VALUES (p_id, p_usuario_id, 'edicion', 'prioridad', NULL, NULL, v_prioridad, n_prioridad);
    END IF;

    -- La fecha es DATE: se compara como DATE y se guarda como texto legible.
    IF NOT (n_fecha <=> v_fecha) THEN
      INSERT INTO historial_iniciativa
        (iniciativa_id, usuario_id, tipo, campo, estado_anterior, estado_nuevo, valor_anterior, valor_nuevo)
      VALUES (p_id, p_usuario_id, 'edicion', 'fecha_actualizacion', NULL, NULL,
              DATE_FORMAT(v_fecha, '%Y-%m-%d'), DATE_FORMAT(n_fecha, '%Y-%m-%d'));
    END IF;

  END IF;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- 2. sp_estadisticas_flujo — cuenta solo movimientos de estado
--
-- Se excluyen los tipos que NO son transiciones. Antes se excluía solo
-- 'acotar'; ahora la lista es explícita, así que un tipo nuevo que tampoco
-- mueva el trámite no vuelve a colarse en el cálculo.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_estadisticas_flujo;

DELIMITER $$
CREATE PROCEDURE sp_estadisticas_flujo()
BEGIN
  SELECT
    e.id, e.clave, e.nombre, e.color, e.orden,
    (SELECT COUNT(*) FROM iniciativas i
      WHERE i.estado_id = e.id AND i.activo = TRUE) AS iniciativas,
    (SELECT COUNT(*) FROM historial_iniciativa h
      WHERE h.estado_nuevo = e.id
        AND h.tipo NOT IN ('acotar','edicion')) AS entradas,
    (SELECT ROUND(AVG(DATEDIFF(sig.creado_en, h2.creado_en)), 1)
       FROM historial_iniciativa h2
       JOIN historial_iniciativa sig
         ON sig.iniciativa_id = h2.iniciativa_id
        AND sig.creado_en > h2.creado_en
        AND sig.tipo NOT IN ('acotar','edicion')
        AND sig.id = (
              SELECT MIN(s2.id) FROM historial_iniciativa s2
               WHERE s2.iniciativa_id = h2.iniciativa_id
                 AND s2.creado_en > h2.creado_en
                 AND s2.tipo NOT IN ('acotar','edicion'))
      WHERE h2.estado_nuevo = e.id
        AND h2.tipo NOT IN ('acotar','edicion')) AS dias_promedio
  FROM estados e
  WHERE e.activo = TRUE
  ORDER BY e.orden;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- 3. sp_eliminar_documento — el documento tiene que ser de esa iniciativa
--
-- La ruta que lo llama valida que quien borra pueda editar LA INICIATIVA
-- del path, pero el procedimiento borraba por id de documento a secas: con
-- un id de otra dirección en el segundo parámetro de la URL, la guarda
-- pasaba y el borrado ocurría igual. Se ata aquí, que es donde no se puede
-- olvidar.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_eliminar_documento;

DELIMITER $$
CREATE PROCEDURE sp_eliminar_documento(IN p_id INT, IN p_iniciativa_id INT)
BEGIN
  DELETE FROM documentos
   WHERE id = p_id
     AND (p_iniciativa_id IS NULL OR iniciativa_id = p_iniciativa_id);

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El documento no existe o no pertenece a esa iniciativa';
  END IF;
END$$
DELIMITER ;

INSERT INTO schema_version (version, descripcion) VALUES
  (11, 'Historial de edición fiel: estado nulo, comparación binaria y sin relectura')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);
