-- =====================================================================
-- Archivo: 04_autenticacion.sql — capa de autenticación
-- Migración idempotente: se puede ejecutar sobre una base que ya tiene datos.
-- Ejecutar SIEMPRE con charset utf8mb4:
--   mysql --default-character-set=utf8mb4 -u root -p < db/04_autenticacion.sql
-- =====================================================================
SET NAMES utf8mb4;
USE iniciativas_legislativas;

-- ---------------------------------------------------------------------
-- Control de versión del esquema
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_version (
  version     INT           NOT NULL PRIMARY KEY,
  descripcion VARCHAR(255)  NOT NULL,
  aplicada_en TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Campos de autenticación sobre la tabla usuarios ya existente
-- ---------------------------------------------------------------------
SET @existe := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = 'iniciativas_legislativas'
    AND table_name = 'usuarios' AND column_name = 'contrasena_hash');
SET @sql := IF(@existe = 0,
  'ALTER TABLE usuarios
     ADD COLUMN contrasena_hash   VARCHAR(255) NULL AFTER correo,
     ADD COLUMN debe_cambiar      BOOLEAN      NOT NULL DEFAULT TRUE AFTER contrasena_hash,
     ADD COLUMN intentos_fallidos INT          NOT NULL DEFAULT 0    AFTER debe_cambiar,
     ADD COLUMN bloqueado_hasta   DATETIME     NULL                  AFTER intentos_fallidos,
     ADD COLUMN ultimo_ingreso    DATETIME     NULL                  AFTER bloqueado_hasta',
  'SELECT "columnas de autenticación ya existen" AS aviso');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- Almacén de sesiones (lo administra express-mysql-session)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sesiones (
  session_id VARCHAR(128) NOT NULL PRIMARY KEY,
  expires    INT UNSIGNED NOT NULL,
  data       MEDIUMTEXT   NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- sp_usuario_por_correo — datos necesarios para validar el ingreso
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_usuario_por_correo;
DELIMITER $$
CREATE PROCEDURE sp_usuario_por_correo(IN p_correo VARCHAR(255))
BEGIN
  SELECT id, nombre, correo, contrasena_hash, direccion_id, rol, activo,
         debe_cambiar, intentos_fallidos, bloqueado_hasta
  FROM usuarios
  WHERE correo = p_correo;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_registrar_ingreso — éxito: limpia contadores y marca la fecha
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_registrar_ingreso;
DELIMITER $$
CREATE PROCEDURE sp_registrar_ingreso(IN p_id INT)
BEGIN
  UPDATE usuarios
  SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_ingreso = NOW()
  WHERE id = p_id;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_registrar_fallo — bloquea 15 minutos al quinto intento fallido
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_registrar_fallo;
DELIMITER $$
CREATE PROCEDURE sp_registrar_fallo(IN p_correo VARCHAR(255))
BEGIN
  UPDATE usuarios
  SET intentos_fallidos = intentos_fallidos + 1,
      bloqueado_hasta = IF(intentos_fallidos + 1 >= 5,
                           DATE_ADD(NOW(), INTERVAL 15 MINUTE), bloqueado_hasta)
  WHERE correo = p_correo;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_guardar_contrasena — alta de usuario y cambio de clave
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_guardar_contrasena;
DELIMITER $$
CREATE PROCEDURE sp_guardar_contrasena(
  IN p_correo        VARCHAR(255),
  IN p_hash          VARCHAR(255),
  IN p_debe_cambiar  BOOLEAN
)
BEGIN
  UPDATE usuarios
  SET contrasena_hash = p_hash,
      debe_cambiar = COALESCE(p_debe_cambiar, FALSE),
      intentos_fallidos = 0,
      bloqueado_hasta = NULL
  WHERE correo = p_correo;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_crear_usuario — alta (sin contraseña; se asigna aparte)
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_crear_usuario;
DELIMITER $$
CREATE PROCEDURE sp_crear_usuario(
  IN p_nombre       VARCHAR(255),
  IN p_correo       VARCHAR(255),
  IN p_direccion_id VARCHAR(30),
  IN p_rol          VARCHAR(20)
)
BEGIN
  INSERT INTO usuarios (nombre, correo, direccion_id, rol)
  VALUES (p_nombre, p_correo, p_direccion_id, COALESCE(p_rol, 'lector'))
  ON DUPLICATE KEY UPDATE
    nombre = VALUES(nombre),
    direccion_id = VALUES(direccion_id),
    rol = VALUES(rol),
    activo = TRUE;

  SELECT id FROM usuarios WHERE correo = p_correo;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_direccion_de_iniciativa — para el control de acceso por dirección
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_direccion_de_iniciativa;
DELIMITER $$
CREATE PROCEDURE sp_direccion_de_iniciativa(IN p_id INT)
BEGIN
  SELECT direccion_id FROM iniciativas WHERE id = p_id AND activo = TRUE;
END$$
DELIMITER ;

INSERT INTO schema_version (version, descripcion) VALUES
  (4, 'Autenticación: contraseñas, sesiones y bloqueo por intentos')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);
