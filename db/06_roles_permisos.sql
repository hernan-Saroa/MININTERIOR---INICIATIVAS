-- =====================================================================
-- Archivo: 06_roles_permisos.sql — roles dinámicos y permisos
--
-- Los PERMISOS son catálogo del sistema: cada uno existe porque hay
-- código que lo verifica, así que se agregan por migración, no desde
-- la pantalla. Los ROLES sí son libres: el administrador los crea, les
-- pone nombre y les compone el conjunto de permisos que quiera.
--
-- Idempotente. Ejecutar SIEMPRE con charset utf8mb4:
--   mysql --default-character-set=utf8mb4 -u root -p < db/06_roles_permisos.sql
-- =====================================================================
SET NAMES utf8mb4;
USE iniciativas_legislativas;

-- ---------------------------------------------------------------------
-- Catálogo de permisos
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permisos (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  clave       VARCHAR(60)  NOT NULL UNIQUE,
  nombre      VARCHAR(120) NOT NULL,
  descripcion VARCHAR(255) NULL,
  grupo       VARCHAR(40)  NOT NULL,
  orden       INT          NOT NULL DEFAULT 0
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Roles. es_sistema protege los cuatro originales de ser borrados.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  clave       VARCHAR(40)  NOT NULL UNIQUE,
  nombre      VARCHAR(120) NOT NULL,
  descripcion VARCHAR(255) NULL,
  es_sistema  BOOLEAN      NOT NULL DEFAULT FALSE,
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rol_permisos (
  rol_id     INT NOT NULL,
  permiso_id INT NOT NULL,
  PRIMARY KEY (rol_id, permiso_id),
  CONSTRAINT fk_rp_rol     FOREIGN KEY (rol_id)     REFERENCES roles(id)    ON DELETE CASCADE,
  CONSTRAINT fk_rp_permiso FOREIGN KEY (permiso_id) REFERENCES permisos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- usuarios.rol_id. La columna ENUM 'rol' se conserva por ahora: permite
-- volver atrás si algo sale mal. Se retira en una migración posterior,
-- una vez verificado en producción.
-- ---------------------------------------------------------------------
SET @existe := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema='iniciativas_legislativas' AND table_name='usuarios' AND column_name='rol_id');
SET @sql := IF(@existe = 0,
  'ALTER TABLE usuarios ADD COLUMN rol_id INT NULL AFTER rol, ADD INDEX idx_usuarios_rol (rol_id)',
  'SELECT "usuarios.rol_id ya existe" AS aviso');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- Catálogo: cada permiso corresponde a una verificación real en el código
-- ---------------------------------------------------------------------
INSERT INTO permisos (clave, nombre, descripcion, grupo, orden) VALUES
  ('iniciativas.ver',        'Ver iniciativas',          'Consultar el tablero de su dirección',              'Iniciativas', 1),
  ('iniciativas.ver_todas',  'Ver todas las direcciones','Consultar el tablero completo, no solo el suyo',    'Iniciativas', 2),
  ('iniciativas.crear',      'Crear iniciativas',        'Registrar nuevas iniciativas',                      'Iniciativas', 3),
  ('iniciativas.editar',     'Editar iniciativas',       'Modificar nombre, objeto, número y prioridad',      'Iniciativas', 4),
  ('iniciativas.eliminar',   'Eliminar iniciativas',     'Dar de baja una iniciativa',                        'Iniciativas', 5),
  ('iniciativas.exportar',   'Exportar a CSV',           'Descargar el listado completo',                     'Iniciativas', 6),
  ('documentos.gestionar',   'Gestionar documentos',     'Agregar y quitar enlaces a documentos',             'Iniciativas', 7),

  ('flujo.mover',            'Mover de estado',          'Avanzar, devolver, rechazar o cerrar iniciativas',  'Flujo', 1),
  ('flujo.acotar',           'Acotar el alcance',        'Modificar el objeto dejando constancia del motivo', 'Flujo', 2),
  ('flujo.ver_historial',    'Ver historial',            'Consultar la trazabilidad de cada iniciativa',      'Flujo', 3),
  ('flujo.configurar',       'Configurar el flujo',      'Definir estados, transiciones y visibilidad',       'Flujo', 4),

  ('usuarios.ver',           'Ver usuarios',             'Consultar el directorio de usuarios',               'Administración', 1),
  ('usuarios.administrar',   'Administrar usuarios',     'Crear, editar y desactivar cuentas',                'Administración', 2),
  ('usuarios.aprobar',       'Aprobar registros',        'Habilitar cuentas que se autorregistraron',         'Administración', 3),
  ('roles.administrar',      'Administrar roles',        'Crear roles y asignarles permisos',                 'Administración', 4),
  ('estadisticas.ver',       'Ver estadísticas',         'Acceder al panel de indicadores',                   'Administración', 5)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre), descripcion = VALUES(descripcion),
  grupo = VALUES(grupo), orden = VALUES(orden);

-- ---------------------------------------------------------------------
-- Roles del sistema, equivalentes a los cuatro del ENUM, más el nuevo
-- rol de administrador.
-- ---------------------------------------------------------------------
INSERT INTO roles (clave, nombre, descripcion, es_sistema) VALUES
  ('lector',       'Lector',        'Consulta el tablero, sin modificar nada',                       TRUE),
  ('editor',       'Editor',        'Registra y actualiza las iniciativas de su dirección',          TRUE),
  ('director',     'Director',      'Su dirección, más consulta de todas y estadísticas',            TRUE),
  ('viceministro', 'Viceministro',  'Acceso completo a iniciativas y flujo',                         TRUE),
  ('administrador','Administrador', 'Gestiona usuarios, roles y configuración del flujo',            TRUE)
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), descripcion = VALUES(descripcion);

-- Asignación de permisos por rol
DROP PROCEDURE IF EXISTS tmp_dar_permiso;
DELIMITER $$
CREATE PROCEDURE tmp_dar_permiso(IN p_rol VARCHAR(40), IN p_permiso VARCHAR(60))
BEGIN
  INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
  SELECT r.id, p.id FROM roles r, permisos p
  WHERE r.clave = p_rol AND p.clave = p_permiso;
END$$
DELIMITER ;

CALL tmp_dar_permiso('lector','iniciativas.ver');

CALL tmp_dar_permiso('editor','iniciativas.ver');
CALL tmp_dar_permiso('editor','iniciativas.crear');
CALL tmp_dar_permiso('editor','iniciativas.editar');
CALL tmp_dar_permiso('editor','iniciativas.eliminar');
CALL tmp_dar_permiso('editor','iniciativas.exportar');
CALL tmp_dar_permiso('editor','documentos.gestionar');
CALL tmp_dar_permiso('editor','flujo.mover');
CALL tmp_dar_permiso('editor','flujo.ver_historial');

CALL tmp_dar_permiso('director','iniciativas.ver');
CALL tmp_dar_permiso('director','iniciativas.ver_todas');
CALL tmp_dar_permiso('director','iniciativas.crear');
CALL tmp_dar_permiso('director','iniciativas.editar');
CALL tmp_dar_permiso('director','iniciativas.eliminar');
CALL tmp_dar_permiso('director','iniciativas.exportar');
CALL tmp_dar_permiso('director','documentos.gestionar');
CALL tmp_dar_permiso('director','flujo.mover');
CALL tmp_dar_permiso('director','flujo.acotar');
CALL tmp_dar_permiso('director','flujo.ver_historial');
CALL tmp_dar_permiso('director','usuarios.ver');
CALL tmp_dar_permiso('director','estadisticas.ver');

INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE r.clave = 'viceministro' AND p.clave <> 'roles.administrar';

CALL tmp_dar_permiso('administrador','iniciativas.ver');
CALL tmp_dar_permiso('administrador','iniciativas.ver_todas');
CALL tmp_dar_permiso('administrador','flujo.ver_historial');
CALL tmp_dar_permiso('administrador','flujo.configurar');
CALL tmp_dar_permiso('administrador','usuarios.ver');
CALL tmp_dar_permiso('administrador','usuarios.administrar');
CALL tmp_dar_permiso('administrador','usuarios.aprobar');
CALL tmp_dar_permiso('administrador','roles.administrar');
CALL tmp_dar_permiso('administrador','estadisticas.ver');

DROP PROCEDURE IF EXISTS tmp_dar_permiso;

-- Cada usuario queda apuntando al rol equivalente al que ya tenía
UPDATE usuarios u JOIN roles r ON r.clave = u.rol
SET u.rol_id = r.id
WHERE u.rol_id IS NULL;

-- ---------------------------------------------------------------------
-- sp_permisos_de_usuario
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_permisos_de_usuario;
DELIMITER $$
CREATE PROCEDURE sp_permisos_de_usuario(IN p_usuario_id INT)
BEGIN
  SELECT p.clave
  FROM usuarios u
  JOIN roles r        ON r.id = u.rol_id AND r.activo = TRUE
  JOIN rol_permisos rp ON rp.rol_id = r.id
  JOIN permisos p      ON p.id = rp.permiso_id
  WHERE u.id = p_usuario_id AND u.activo = TRUE;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_usuario_por_correo — se redefine para devolver también el rol_id
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_usuario_por_correo;
DELIMITER $$
CREATE PROCEDURE sp_usuario_por_correo(IN p_correo VARCHAR(255))
BEGIN
  SELECT u.id, u.nombre, u.correo, u.contrasena_hash, u.direccion_id,
         u.rol, u.rol_id, r.clave AS rol_clave, r.nombre AS rol_nombre,
         u.activo, u.debe_cambiar, u.intentos_fallidos, u.bloqueado_hasta,
         u.pendiente_aprobacion
  FROM usuarios u
  LEFT JOIN roles r ON r.id = u.rol_id
  WHERE u.correo = p_correo;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_listar_roles — con el conteo de usuarios, para saber si se puede borrar
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_listar_roles;
DELIMITER $$
CREATE PROCEDURE sp_listar_roles()
BEGIN
  SELECT r.id, r.clave, r.nombre, r.descripcion, r.es_sistema, r.activo,
         (SELECT COUNT(*) FROM usuarios u WHERE u.rol_id = r.id AND u.activo = TRUE) AS usuarios,
         (SELECT GROUP_CONCAT(p.clave ORDER BY p.grupo, p.orden)
            FROM rol_permisos rp JOIN permisos p ON p.id = rp.permiso_id
           WHERE rp.rol_id = r.id) AS permisos
  FROM roles r
  ORDER BY r.es_sistema DESC, r.nombre;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_listar_permisos;
DELIMITER $$
CREATE PROCEDURE sp_listar_permisos()
BEGIN
  SELECT id, clave, nombre, descripcion, grupo, orden
  FROM permisos ORDER BY grupo, orden;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_guardar_rol — crea o actualiza. p_permisos es una lista separada
-- por comas con las claves de permiso.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_guardar_rol;
DELIMITER $$
CREATE PROCEDURE sp_guardar_rol(
  IN p_id          INT,
  IN p_nombre      VARCHAR(120),
  IN p_descripcion VARCHAR(255),
  IN p_permisos    TEXT
)
BEGIN
  DECLARE v_id INT;
  DECLARE v_clave VARCHAR(40);

  IF p_id IS NULL THEN
    SET v_clave = LOWER(REPLACE(TRIM(p_nombre), ' ', '_'));
    INSERT INTO roles (clave, nombre, descripcion, es_sistema)
    VALUES (v_clave, p_nombre, p_descripcion, FALSE);
    SET v_id = LAST_INSERT_ID();
  ELSE
    SET v_id = p_id;
    UPDATE roles SET nombre = p_nombre, descripcion = p_descripcion WHERE id = v_id;
  END IF;

  DELETE FROM rol_permisos WHERE rol_id = v_id;

  IF p_permisos IS NOT NULL AND p_permisos <> '' THEN
    INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
    SELECT v_id, p.id FROM permisos p
    WHERE FIND_IN_SET(p.clave, p_permisos) > 0;
  END IF;

  SELECT v_id AS id;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_eliminar_rol — bloquea si es del sistema o si tiene gente asignada
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_eliminar_rol;
DELIMITER $$
CREATE PROCEDURE sp_eliminar_rol(IN p_id INT)
BEGIN
  DECLARE v_sistema BOOLEAN;
  DECLARE v_usuarios INT;

  SELECT es_sistema INTO v_sistema FROM roles WHERE id = p_id;
  IF v_sistema IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El rol no existe';
  END IF;
  IF v_sistema THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Los roles del sistema no se pueden eliminar';
  END IF;

  SELECT COUNT(*) INTO v_usuarios FROM usuarios WHERE rol_id = p_id AND activo = TRUE;
  IF v_usuarios > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El rol tiene usuarios asignados. Reasígnelos antes de eliminarlo.';
  END IF;

  DELETE FROM roles WHERE id = p_id;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_asignar_rol — con el bloqueo por autolesión: el sistema no puede
-- quedarse sin nadie que administre usuarios y roles.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_asignar_rol;
DELIMITER $$
CREATE PROCEDURE sp_asignar_rol(IN p_usuario_id INT, IN p_rol_id INT)
BEGIN
  DECLARE v_antes INT;
  DECLARE v_despues INT;

  -- Se cuenta ANTES y DESPUÉS: la guarda debe dispararse solo cuando esta
  -- asignación deja sin administrador a un sistema que sí lo tenía, no
  -- cuando nunca hubo ninguno (por ejemplo en una instalación nueva).
  SELECT COUNT(DISTINCT u.id) INTO v_antes
  FROM usuarios u
  JOIN rol_permisos rp ON rp.rol_id = u.rol_id
  JOIN permisos p      ON p.id = rp.permiso_id
  WHERE u.activo = TRUE AND p.clave = 'roles.administrar';

  UPDATE usuarios SET rol_id = p_rol_id, pendiente_aprobacion = FALSE
  WHERE id = p_usuario_id;

  SELECT COUNT(DISTINCT u.id) INTO v_despues
  FROM usuarios u
  JOIN rol_permisos rp ON rp.rol_id = u.rol_id
  JOIN permisos p      ON p.id = rp.permiso_id
  WHERE u.activo = TRUE AND p.clave = 'roles.administrar';

  IF v_antes > 0 AND v_despues = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No puede dejar el sistema sin ningún administrador de roles';
  END IF;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_listar_usuarios — para la pantalla de administración
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_listar_usuarios;
DELIMITER $$
CREATE PROCEDURE sp_listar_usuarios()
BEGIN
  SELECT u.id, u.nombre, u.correo, u.direccion_id, u.activo,
         u.pendiente_aprobacion, u.ultimo_ingreso, u.registrado_en,
         u.rol_id, r.nombre AS rol_nombre, r.clave AS rol_clave,
         d.nombre_corto AS direccion_nombre
  FROM usuarios u
  LEFT JOIN roles r      ON r.id = u.rol_id
  LEFT JOIN direcciones d ON d.id = u.direccion_id
  ORDER BY u.pendiente_aprobacion DESC, u.nombre;
END$$
DELIMITER ;

INSERT INTO schema_version (version, descripcion) VALUES
  (6, 'Roles dinámicos y catálogo de permisos')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);
