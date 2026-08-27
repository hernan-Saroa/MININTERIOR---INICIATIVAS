-- =====================================================================
-- Archivo: 05_propuestas.sql — propuestas sin sesión y autorregistro
-- Migración idempotente: se puede ejecutar sobre una base con datos.
-- Ejecutar SIEMPRE con charset utf8mb4:
--   mysql --default-character-set=utf8mb4 -u root -p < db/05_propuestas.sql
-- =====================================================================
SET NAMES utf8mb4;
USE iniciativas_legislativas;

-- ---------------------------------------------------------------------
-- usuarios: marca de aprobación pendiente para los que se autorregistran
-- ---------------------------------------------------------------------
SET @existe := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = 'iniciativas_legislativas'
    AND table_name = 'usuarios' AND column_name = 'pendiente_aprobacion');
SET @sql := IF(@existe = 0,
  'ALTER TABLE usuarios
     ADD COLUMN pendiente_aprobacion BOOLEAN NOT NULL DEFAULT FALSE AFTER rol,
     ADD COLUMN registrado_en        DATETIME NULL                  AFTER pendiente_aprobacion',
  'SELECT "usuarios ya tiene las columnas de autorregistro" AS aviso');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- iniciativas: origen y datos de quien la propuso
-- ---------------------------------------------------------------------
SET @existe := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = 'iniciativas_legislativas'
    AND table_name = 'iniciativas' AND column_name = 'origen');
SET @sql := IF(@existe = 0,
  'ALTER TABLE iniciativas
     ADD COLUMN origen           ENUM("interna","propuesta") NOT NULL DEFAULT "interna",
     ADD COLUMN propuesta_por    INT          NULL,
     ADD COLUMN propuesta_nombre VARCHAR(255) NULL,
     ADD COLUMN propuesta_correo VARCHAR(255) NULL,
     ADD COLUMN propuesta_en     DATETIME     NULL,
     ADD INDEX idx_propuesta_por (propuesta_por),
     ADD INDEX idx_propuesta_correo (propuesta_correo)',
  'SELECT "iniciativas ya tiene las columnas de propuesta" AS aviso');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- sp_listar_iniciativas — se redefine para devolver el origen y el autor,
-- de modo que el tablero pueda marcar "propuesta" y "mía".
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_listar_iniciativas;
DELIMITER $$
CREATE PROCEDURE sp_listar_iniciativas(IN p_direccion_id VARCHAR(30))
BEGIN
  SELECT
    i.id, i.direccion_id, i.nombre, i.objeto, i.numero_proyecto,
    i.estado, i.prioridad, i.fecha_actualizacion, i.fuente_publica,
    i.creado_en, i.actualizado_en,
    i.origen, i.propuesta_por, i.propuesta_nombre,
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
-- sp_crear_propuesta — alta desde el formulario público.
-- p_usuario_id llega NULL cuando quien propone no quiso registrarse.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_crear_propuesta;
DELIMITER $$
CREATE PROCEDURE sp_crear_propuesta(
  IN p_direccion_id VARCHAR(30),
  IN p_nombre       VARCHAR(500),
  IN p_objeto       TEXT,
  IN p_numero       VARCHAR(60),
  IN p_usuario_id   INT,
  IN p_contacto     VARCHAR(255),
  IN p_correo       VARCHAR(255)
)
BEGIN
  INSERT INTO iniciativas
    (direccion_id, nombre, objeto, numero_proyecto, estado, prioridad,
     fecha_actualizacion, fuente_publica,
     origen, propuesta_por, propuesta_nombre, propuesta_correo, propuesta_en)
  VALUES
    (p_direccion_id, p_nombre, NULLIF(p_objeto,''), NULLIF(p_numero,''),
     'En formulación', 'Media', CURDATE(), FALSE,
     'propuesta', p_usuario_id, NULLIF(p_contacto,''), NULLIF(p_correo,''), NOW());

  SELECT LAST_INSERT_ID() AS id;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_registrar_usuario_publico — autorregistro.
-- Nace como 'lector' y pendiente de aprobación: ve el tablero, pero no
-- edita hasta que un administrador le asigne dirección y rol.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_registrar_usuario_publico;
DELIMITER $$
CREATE PROCEDURE sp_registrar_usuario_publico(
  IN p_nombre VARCHAR(255),
  IN p_correo VARCHAR(255),
  IN p_hash   VARCHAR(255)
)
BEGIN
  INSERT INTO usuarios
    (nombre, correo, contrasena_hash, direccion_id, rol,
     pendiente_aprobacion, registrado_en, debe_cambiar, activo)
  VALUES
    (p_nombre, p_correo, p_hash, NULL, 'lector', TRUE, NOW(), FALSE, TRUE);

  SELECT id, nombre, correo, direccion_id, rol, pendiente_aprobacion
  FROM usuarios WHERE id = LAST_INSERT_ID();
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_adoptar_propuestas — al registrarse, las propuestas que había
-- enviado antes con ese mismo correo quedan atribuidas a su cuenta.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_adoptar_propuestas;
DELIMITER $$
CREATE PROCEDURE sp_adoptar_propuestas(IN p_correo VARCHAR(255), IN p_usuario_id INT)
BEGIN
  UPDATE iniciativas
  SET propuesta_por = p_usuario_id
  WHERE propuesta_correo = p_correo AND propuesta_por IS NULL;

  SELECT ROW_COUNT() AS adoptadas;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_listar_mis_propuestas — las iniciativas que propuso el usuario
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_listar_mis_propuestas;
DELIMITER $$
CREATE PROCEDURE sp_listar_mis_propuestas(IN p_usuario_id INT)
BEGIN
  SELECT i.id, i.direccion_id, i.nombre, i.objeto, i.numero_proyecto,
         i.estado, i.prioridad, i.propuesta_en
  FROM iniciativas i
  WHERE i.activo = TRUE AND i.propuesta_por = p_usuario_id
  ORDER BY i.propuesta_en DESC;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_aprobar_usuario — el administrador le asigna dirección y rol
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_aprobar_usuario;
DELIMITER $$
CREATE PROCEDURE sp_aprobar_usuario(
  IN p_correo       VARCHAR(255),
  IN p_direccion_id VARCHAR(30),
  IN p_rol          VARCHAR(20)
)
BEGIN
  UPDATE usuarios
  SET direccion_id = p_direccion_id,
      rol = COALESCE(p_rol, 'lector'),
      pendiente_aprobacion = FALSE
  WHERE correo = p_correo;
END$$
DELIMITER ;

INSERT INTO schema_version (version, descripcion) VALUES
  (5, 'Propuestas sin sesión y autorregistro de usuarios')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);
