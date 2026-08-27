-- =====================================================================
-- Archivo: 02_procedimientos.sql — procedimientos almacenados
-- =====================================================================
USE iniciativas_legislativas;

-- ---------------------------------------------------------------------
-- sp_listar_direcciones
-- Devuelve las direcciones con el conteo de iniciativas de cada una
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_listar_direcciones;
DELIMITER $$
CREATE PROCEDURE sp_listar_direcciones()
BEGIN
  SELECT
    d.id, d.nombre, d.nombre_corto, d.descripcion, d.orden,
    COUNT(i.id) AS total_iniciativas
  FROM direcciones d
  LEFT JOIN iniciativas i ON i.direccion_id = d.id AND i.activo = TRUE
  GROUP BY d.id, d.nombre, d.nombre_corto, d.descripcion, d.orden
  ORDER BY d.orden;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_listar_iniciativas
-- Lista las iniciativas de una dirección (o todas si p_direccion_id es NULL)
-- junto con el número de documentos asociados
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_listar_iniciativas;
DELIMITER $$
CREATE PROCEDURE sp_listar_iniciativas(IN p_direccion_id VARCHAR(30))
BEGIN
  SELECT
    i.id, i.direccion_id, i.nombre, i.objeto, i.numero_proyecto,
    i.estado, i.prioridad, i.fecha_actualizacion, i.fuente_publica,
    i.creado_en, i.actualizado_en,
    (SELECT COUNT(*) FROM documentos doc WHERE doc.iniciativa_id = i.id) AS total_documentos
  FROM iniciativas i
  WHERE i.activo = TRUE
    AND (p_direccion_id IS NULL OR i.direccion_id = p_direccion_id)
  ORDER BY
    FIELD(i.prioridad,'Alta','Media','Baja'),
    i.actualizado_en DESC;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_crear_iniciativa
-- Inserta una nueva iniciativa y devuelve su id
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_crear_iniciativa;
DELIMITER $$
CREATE PROCEDURE sp_crear_iniciativa(
  IN p_direccion_id        VARCHAR(30),
  IN p_nombre              VARCHAR(500),
  IN p_objeto              TEXT,
  IN p_numero_proyecto     VARCHAR(150),
  IN p_estado              VARCHAR(30),
  IN p_prioridad           VARCHAR(20),
  IN p_fecha_actualizacion DATE,
  IN p_fuente_publica      BOOLEAN
)
BEGIN
  INSERT INTO iniciativas
    (direccion_id, nombre, objeto, numero_proyecto, estado, prioridad,
     fecha_actualizacion, fuente_publica)
  VALUES
    (p_direccion_id, p_nombre, p_objeto, p_numero_proyecto,
     COALESCE(p_estado,'En formulación'), COALESCE(p_prioridad,'Media'),
     p_fecha_actualizacion, COALESCE(p_fuente_publica, FALSE));

  SELECT LAST_INSERT_ID() AS id;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_actualizar_iniciativa
-- Actualiza los campos editables de una iniciativa existente
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
  IN p_fecha_actualizacion DATE
)
BEGIN
  UPDATE iniciativas
  SET nombre              = COALESCE(p_nombre, nombre),
      objeto              = p_objeto,
      numero_proyecto     = p_numero_proyecto,
      estado              = COALESCE(p_estado, estado),
      prioridad           = COALESCE(p_prioridad, prioridad),
      fecha_actualizacion = p_fecha_actualizacion
  WHERE id = p_id;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_eliminar_iniciativa
-- Baja lógica de una iniciativa (no se borra físicamente el registro)
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_eliminar_iniciativa;
DELIMITER $$
CREATE PROCEDURE sp_eliminar_iniciativa(IN p_id INT)
BEGIN
  UPDATE iniciativas SET activo = FALSE WHERE id = p_id;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_listar_documentos
-- Documentos asociados a una iniciativa
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_listar_documentos;
DELIMITER $$
CREATE PROCEDURE sp_listar_documentos(IN p_iniciativa_id INT)
BEGIN
  SELECT id, iniciativa_id, nombre, enlace, fecha, creado_en
  FROM documentos
  WHERE iniciativa_id = p_iniciativa_id
  ORDER BY creado_en DESC;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_agregar_documento
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_agregar_documento;
DELIMITER $$
CREATE PROCEDURE sp_agregar_documento(
  IN p_iniciativa_id INT,
  IN p_nombre        VARCHAR(500),
  IN p_enlace        VARCHAR(1000),
  IN p_fecha         DATE
)
BEGIN
  INSERT INTO documentos (iniciativa_id, nombre, enlace, fecha)
  VALUES (p_iniciativa_id, p_nombre, p_enlace, COALESCE(p_fecha, CURDATE()));

  SELECT LAST_INSERT_ID() AS id;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_eliminar_documento
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_eliminar_documento;
DELIMITER $$
CREATE PROCEDURE sp_eliminar_documento(IN p_id INT)
BEGIN
  DELETE FROM documentos WHERE id = p_id;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_resumen_estadisticas
-- Totales generales para las tarjetas del tablero
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_resumen_estadisticas;
DELIMITER $$
CREATE PROCEDURE sp_resumen_estadisticas()
BEGIN
  SELECT
    COUNT(*)                                                    AS total,
    SUM(CASE WHEN estado = 'Radicado'      THEN 1 ELSE 0 END)   AS radicadas,
    SUM(CASE WHEN estado = 'En comisión'   THEN 1 ELSE 0 END)   AS en_comision,
    SUM(CASE WHEN estado = 'Aprobado'      THEN 1 ELSE 0 END)   AS aprobadas,
    SUM(CASE WHEN estado = 'Archivado'     THEN 1 ELSE 0 END)   AS archivadas,
    SUM(CASE WHEN estado = 'En formulación' THEN 1 ELSE 0 END)  AS en_formulacion,
    SUM(CASE WHEN prioridad = 'Alta'       THEN 1 ELSE 0 END)   AS prioridad_alta
  FROM iniciativas
  WHERE activo = TRUE;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_exportar_csv
-- Vista plana lista para exportar/reportar (une iniciativas + documentos)
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_exportar_csv;
DELIMITER $$
CREATE PROCEDURE sp_exportar_csv()
BEGIN
  SELECT
    d.nombre                  AS direccion,
    i.nombre                  AS iniciativa,
    i.objeto                  AS objeto,
    i.numero_proyecto         AS numero_proyecto,
    i.estado                  AS estado,
    i.prioridad               AS prioridad,
    i.fecha_actualizacion     AS fecha_actualizacion,
    GROUP_CONCAT(doc.nombre SEPARATOR ' | ') AS documentos
  FROM iniciativas i
  JOIN direcciones d ON d.id = i.direccion_id
  LEFT JOIN documentos doc ON doc.iniciativa_id = i.id
  WHERE i.activo = TRUE
  GROUP BY i.id, d.nombre, i.nombre, i.objeto, i.numero_proyecto,
           i.estado, i.prioridad, i.fecha_actualizacion
  ORDER BY d.orden, i.actualizado_en DESC;
END$$
DELIMITER ;
