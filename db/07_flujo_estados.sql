-- =====================================================================
-- Archivo: 07_flujo_estados.sql — flujo de trabajo configurable
--
-- Convierte el ENUM de estados en un catálogo administrable, con
-- transiciones permitidas, responsables por persona, reglas de
-- visibilidad y trazabilidad completa.
--
-- Distinción central del modelo:
--   TRANSICIONES cambian el estado (avanzar, devolver, rechazar, cerrar).
--   ACCIONES no lo cambian pero quedan registradas (acotar el alcance).
--
-- Idempotente. Ejecutar SIEMPRE con charset utf8mb4:
--   mysql --default-character-set=utf8mb4 -u root -p < db/07_flujo_estados.sql
-- =====================================================================
SET NAMES utf8mb4;
USE iniciativas_legislativas;

-- ---------------------------------------------------------------------
-- Catálogo de estados
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estados (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  clave      VARCHAR(40)  NOT NULL UNIQUE,
  nombre     VARCHAR(80)  NOT NULL,
  color      VARCHAR(20)  NOT NULL DEFAULT 'azul',
  orden      INT          NOT NULL DEFAULT 0,
  es_inicial BOOLEAN      NOT NULL DEFAULT FALSE,
  es_final   BOOLEAN      NOT NULL DEFAULT FALSE,
  activo     BOOLEAN      NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Transiciones permitidas entre estados
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transiciones (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  estado_origen   INT NOT NULL,
  estado_destino  INT NOT NULL,
  tipo            ENUM('avanzar','devolver','rechazar','cerrar') NOT NULL,
  etiqueta        VARCHAR(80)  NOT NULL,
  requiere_motivo BOOLEAN      NOT NULL DEFAULT FALSE,
  activo          BOOLEAN      NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_transicion (estado_origen, estado_destino, tipo),
  CONSTRAINT fk_tr_origen  FOREIGN KEY (estado_origen)  REFERENCES estados(id) ON DELETE CASCADE,
  CONSTRAINT fk_tr_destino FOREIGN KEY (estado_destino) REFERENCES estados(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Responsables por estado, con una casilla por acción
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estado_responsables (
  estado_id      INT NOT NULL,
  usuario_id     INT NOT NULL,
  puede_avanzar  BOOLEAN NOT NULL DEFAULT TRUE,
  puede_devolver BOOLEAN NOT NULL DEFAULT TRUE,
  puede_rechazar BOOLEAN NOT NULL DEFAULT FALSE,
  puede_cerrar   BOOLEAN NOT NULL DEFAULT FALSE,
  puede_acotar   BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (estado_id, usuario_id),
  CONSTRAINT fk_er_estado  FOREIGN KEY (estado_id)  REFERENCES estados(id)  ON DELETE CASCADE,
  CONSTRAINT fk_er_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Visibilidad: quién ve una iniciativa mientras está en cada estado.
--   publico       — cualquiera, sin sesión
--   autenticado   — cualquier usuario con cuenta
--   direccion     — solo la dirección dueña (más quien vea todas)
--   responsables  — solo los responsables del estado
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estado_visibilidad (
  estado_id INT NOT NULL PRIMARY KEY,
  alcance   ENUM('publico','autenticado','direccion','responsables') NOT NULL DEFAULT 'autenticado',
  CONSTRAINT fk_ev_estado FOREIGN KEY (estado_id) REFERENCES estados(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Trazabilidad de cada iniciativa
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historial_iniciativa (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  iniciativa_id   INT NOT NULL,
  usuario_id      INT NULL,
  tipo            ENUM('avanzar','devolver','rechazar','cerrar','acotar','creacion') NOT NULL,
  estado_anterior INT NULL,
  estado_nuevo    INT NULL,
  motivo          TEXT NULL,
  valor_anterior  TEXT NULL,
  valor_nuevo     TEXT NULL,
  creado_en       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hist_iniciativa (iniciativa_id, creado_en),
  INDEX idx_hist_estado (estado_nuevo, creado_en),
  CONSTRAINT fk_hi_iniciativa FOREIGN KEY (iniciativa_id) REFERENCES iniciativas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Auditoría de la configuración. Cambiar la visibilidad de un estado es
-- más sensible que editar una iniciativa: queda su propio registro.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracion_historial (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NULL,
  entidad    VARCHAR(40)  NOT NULL,
  accion     VARCHAR(40)  NOT NULL,
  detalle    TEXT NULL,
  creado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_conf_fecha (creado_en)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Siembra: los cinco estados actuales, con el flujo que ya se usaba
-- ---------------------------------------------------------------------
INSERT INTO estados (clave, nombre, color, orden, es_inicial, es_final) VALUES
  ('formulacion', 'En formulación', 'gris',   1, TRUE,  FALSE),
  ('radicado',    'Radicado',       'azul',   2, FALSE, FALSE),
  ('comision',    'En comisión',    'ambar',  3, FALSE, FALSE),
  ('aprobado',    'Aprobado',       'verde',  4, FALSE, TRUE),
  ('archivado',   'Archivado',      'rojo',   5, FALSE, TRUE)
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), color = VALUES(color), orden = VALUES(orden);

INSERT IGNORE INTO estado_visibilidad (estado_id, alcance)
SELECT id, 'autenticado' FROM estados;

-- Transiciones por omisión: avance secuencial, devolución al anterior,
-- y archivo desde cualquier punto.
DROP PROCEDURE IF EXISTS tmp_transicion;
DELIMITER $$
CREATE PROCEDURE tmp_transicion(
  IN p_origen VARCHAR(40), IN p_destino VARCHAR(40),
  IN p_tipo VARCHAR(20), IN p_etiqueta VARCHAR(80), IN p_motivo BOOLEAN)
BEGIN
  INSERT IGNORE INTO transiciones (estado_origen, estado_destino, tipo, etiqueta, requiere_motivo)
  SELECT o.id, d.id, p_tipo, p_etiqueta, p_motivo
  FROM estados o, estados d WHERE o.clave = p_origen AND d.clave = p_destino;
END$$
DELIMITER ;

CALL tmp_transicion('formulacion','radicado', 'avanzar',  'Radicar',              FALSE);
CALL tmp_transicion('radicado',   'comision', 'avanzar',  'Enviar a comisión',    FALSE);
CALL tmp_transicion('comision',   'aprobado', 'avanzar',  'Aprobar',              FALSE);
CALL tmp_transicion('radicado',   'formulacion','devolver','Devolver a formulación', TRUE);
CALL tmp_transicion('comision',   'radicado', 'devolver', 'Devolver a radicación', TRUE);
CALL tmp_transicion('formulacion','archivado','rechazar', 'Rechazar',             TRUE);
CALL tmp_transicion('radicado',   'archivado','rechazar', 'Rechazar',             TRUE);
CALL tmp_transicion('comision',   'archivado','rechazar', 'Rechazar',             TRUE);
CALL tmp_transicion('aprobado',   'archivado','cerrar',   'Cerrar y archivar',    FALSE);
DROP PROCEDURE IF EXISTS tmp_transicion;

-- ---------------------------------------------------------------------
-- iniciativas.estado_id, poblado desde el texto del ENUM.
-- La columna 'estado' se conserva por ahora para poder volver atrás.
-- ---------------------------------------------------------------------
SET @existe := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema='iniciativas_legislativas' AND table_name='iniciativas' AND column_name='estado_id');
SET @sql := IF(@existe = 0,
  'ALTER TABLE iniciativas ADD COLUMN estado_id INT NULL AFTER estado, ADD INDEX idx_ini_estado (estado_id)',
  'SELECT "iniciativas.estado_id ya existe" AS aviso');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

UPDATE iniciativas i JOIN estados e ON e.nombre = i.estado
SET i.estado_id = e.id
WHERE i.estado_id IS NULL;

-- ---------------------------------------------------------------------
-- sp_listar_estados / sp_guardar_estado
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_listar_estados;
DELIMITER $$
CREATE PROCEDURE sp_listar_estados()
BEGIN
  SELECT e.id, e.clave, e.nombre, e.color, e.orden, e.es_inicial, e.es_final, e.activo,
         COALESCE(v.alcance,'autenticado') AS visibilidad,
         (SELECT COUNT(*) FROM iniciativas i WHERE i.estado_id = e.id AND i.activo = TRUE) AS iniciativas,
         (SELECT COUNT(*) FROM estado_responsables er
            JOIN usuarios u ON u.id = er.usuario_id AND u.activo = TRUE
           WHERE er.estado_id = e.id) AS responsables_activos
  FROM estados e
  LEFT JOIN estado_visibilidad v ON v.estado_id = e.id
  ORDER BY e.orden, e.id;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_guardar_estado;
DELIMITER $$
CREATE PROCEDURE sp_guardar_estado(
  IN p_id     INT,     IN p_nombre VARCHAR(80),
  IN p_color  VARCHAR(20), IN p_orden INT,
  IN p_final  BOOLEAN, IN p_visibilidad VARCHAR(20)
)
BEGIN
  DECLARE v_id INT;
  IF p_id IS NULL THEN
    INSERT INTO estados (clave, nombre, color, orden, es_final)
    VALUES (LOWER(REPLACE(TRIM(p_nombre),' ','_')), p_nombre, p_color, p_orden, p_final);
    SET v_id = LAST_INSERT_ID();
  ELSE
    SET v_id = p_id;
    UPDATE estados SET nombre = p_nombre, color = p_color, orden = p_orden, es_final = p_final
    WHERE id = v_id;
  END IF;

  INSERT INTO estado_visibilidad (estado_id, alcance) VALUES (v_id, COALESCE(p_visibilidad,'autenticado'))
  ON DUPLICATE KEY UPDATE alcance = VALUES(alcance);

  SELECT v_id AS id;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_desactivar_estado — no se borra si tiene iniciativas dentro
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_desactivar_estado;
DELIMITER $$
CREATE PROCEDURE sp_desactivar_estado(IN p_id INT)
BEGIN
  DECLARE v_cuantas INT;
  SELECT COUNT(*) INTO v_cuantas FROM iniciativas WHERE estado_id = p_id AND activo = TRUE;
  IF v_cuantas > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El estado tiene iniciativas. Muévalas a otro estado antes de desactivarlo.';
  END IF;
  UPDATE estados SET activo = FALSE WHERE id = p_id;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_transiciones_disponibles — qué puede hacer ESTE usuario con ESTA
-- iniciativa, según el estado en que se encuentra y sus permisos.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_transiciones_disponibles;
DELIMITER $$
CREATE PROCEDURE sp_transiciones_disponibles(IN p_iniciativa_id INT, IN p_usuario_id INT)
BEGIN
  DECLARE v_estado INT;
  SELECT estado_id INTO v_estado FROM iniciativas WHERE id = p_iniciativa_id AND activo = TRUE;

  SELECT t.id, t.tipo, t.etiqueta, t.requiere_motivo,
         d.id AS destino_id, d.nombre AS destino_nombre, d.color AS destino_color
  FROM transiciones t
  JOIN estados d ON d.id = t.estado_destino AND d.activo = TRUE
  JOIN estado_responsables er ON er.estado_id = t.estado_origen AND er.usuario_id = p_usuario_id
  WHERE t.estado_origen = v_estado AND t.activo = TRUE
    AND ((t.tipo = 'avanzar'  AND er.puede_avanzar)
      OR (t.tipo = 'devolver' AND er.puede_devolver)
      OR (t.tipo = 'rechazar' AND er.puede_rechazar)
      OR (t.tipo = 'cerrar'   AND er.puede_cerrar))
  ORDER BY FIELD(t.tipo,'avanzar','devolver','rechazar','cerrar'), t.etiqueta;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_mover_iniciativa — ejecuta una transición validando todo:
-- que exista, que el usuario sea responsable, y que traiga motivo si
-- la transición lo exige.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_mover_iniciativa;
DELIMITER $$
CREATE PROCEDURE sp_mover_iniciativa(
  IN p_iniciativa_id INT,
  IN p_transicion_id INT,
  IN p_usuario_id    INT,
  IN p_motivo        TEXT
)
BEGIN
  DECLARE v_estado_actual INT;
  DECLARE v_origen INT; DECLARE v_destino INT;
  DECLARE v_tipo VARCHAR(20); DECLARE v_requiere BOOLEAN;
  DECLARE v_permitido INT DEFAULT 0;
  DECLARE v_nombre_destino VARCHAR(80);

  SELECT estado_id INTO v_estado_actual
  FROM iniciativas WHERE id = p_iniciativa_id AND activo = TRUE;
  IF v_estado_actual IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La iniciativa no existe';
  END IF;

  SELECT estado_origen, estado_destino, tipo, requiere_motivo
    INTO v_origen, v_destino, v_tipo, v_requiere
  FROM transiciones WHERE id = p_transicion_id AND activo = TRUE;
  IF v_origen IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La transición no existe';
  END IF;
  IF v_origen <> v_estado_actual THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Esa acción no aplica al estado actual de la iniciativa';
  END IF;
  IF v_requiere AND (p_motivo IS NULL OR TRIM(p_motivo) = '') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Esta acción exige indicar el motivo';
  END IF;

  SELECT COUNT(*) INTO v_permitido
  FROM estado_responsables er
  WHERE er.estado_id = v_origen AND er.usuario_id = p_usuario_id
    AND ((v_tipo = 'avanzar'  AND er.puede_avanzar)
      OR (v_tipo = 'devolver' AND er.puede_devolver)
      OR (v_tipo = 'rechazar' AND er.puede_rechazar)
      OR (v_tipo = 'cerrar'   AND er.puede_cerrar));
  IF v_permitido = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No está autorizado para ejecutar esta acción en este estado';
  END IF;

  SELECT nombre INTO v_nombre_destino FROM estados WHERE id = v_destino;

  UPDATE iniciativas
  SET estado_id = v_destino, estado = v_nombre_destino, fecha_actualizacion = CURDATE()
  WHERE id = p_iniciativa_id;

  INSERT INTO historial_iniciativa
    (iniciativa_id, usuario_id, tipo, estado_anterior, estado_nuevo, motivo)
  VALUES (p_iniciativa_id, p_usuario_id, v_tipo, v_origen, v_destino, NULLIF(TRIM(p_motivo),''));

  SELECT v_destino AS estado_id, v_nombre_destino AS estado;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_acotar_iniciativa — acción sin cambio de estado. Guarda el texto
-- anterior junto al motivo, para poder reconstruir qué se recortó.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_acotar_iniciativa;
DELIMITER $$
CREATE PROCEDURE sp_acotar_iniciativa(
  IN p_iniciativa_id INT,
  IN p_usuario_id    INT,
  IN p_nuevo_objeto  TEXT,
  IN p_motivo        TEXT
)
BEGIN
  DECLARE v_estado INT;
  DECLARE v_anterior TEXT;
  DECLARE v_permitido INT DEFAULT 0;

  IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Debe indicar por qué se acota el alcance';
  END IF;

  SELECT estado_id, objeto INTO v_estado, v_anterior
  FROM iniciativas WHERE id = p_iniciativa_id AND activo = TRUE;
  IF v_estado IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La iniciativa no existe';
  END IF;

  SELECT COUNT(*) INTO v_permitido FROM estado_responsables
  WHERE estado_id = v_estado AND usuario_id = p_usuario_id AND puede_acotar;
  IF v_permitido = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No está autorizado para acotar iniciativas en este estado';
  END IF;

  UPDATE iniciativas SET objeto = p_nuevo_objeto, fecha_actualizacion = CURDATE()
  WHERE id = p_iniciativa_id;

  INSERT INTO historial_iniciativa
    (iniciativa_id, usuario_id, tipo, estado_anterior, estado_nuevo,
     motivo, valor_anterior, valor_nuevo)
  VALUES (p_iniciativa_id, p_usuario_id, 'acotar', v_estado, v_estado,
          p_motivo, v_anterior, p_nuevo_objeto);
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_historial_iniciativa
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_historial_iniciativa;
DELIMITER $$
CREATE PROCEDURE sp_historial_iniciativa(IN p_iniciativa_id INT)
BEGIN
  SELECT h.id, h.tipo, h.motivo, h.valor_anterior, h.valor_nuevo, h.creado_en,
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

-- ---------------------------------------------------------------------
-- sp_guardar_responsable / sp_quitar_responsable
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_guardar_responsable;
DELIMITER $$
CREATE PROCEDURE sp_guardar_responsable(
  IN p_estado_id INT, IN p_usuario_id INT,
  IN p_avanzar BOOLEAN, IN p_devolver BOOLEAN, IN p_rechazar BOOLEAN,
  IN p_cerrar BOOLEAN,  IN p_acotar BOOLEAN)
BEGIN
  INSERT INTO estado_responsables
    (estado_id, usuario_id, puede_avanzar, puede_devolver, puede_rechazar, puede_cerrar, puede_acotar)
  VALUES (p_estado_id, p_usuario_id, p_avanzar, p_devolver, p_rechazar, p_cerrar, p_acotar)
  ON DUPLICATE KEY UPDATE
    puede_avanzar = VALUES(puede_avanzar), puede_devolver = VALUES(puede_devolver),
    puede_rechazar = VALUES(puede_rechazar), puede_cerrar = VALUES(puede_cerrar),
    puede_acotar = VALUES(puede_acotar);
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_quitar_responsable;
DELIMITER $$
CREATE PROCEDURE sp_quitar_responsable(IN p_estado_id INT, IN p_usuario_id INT)
BEGIN
  DECLARE v_quedan INT;
  DELETE FROM estado_responsables WHERE estado_id = p_estado_id AND usuario_id = p_usuario_id;

  SELECT COUNT(*) INTO v_quedan
  FROM estado_responsables er JOIN usuarios u ON u.id = er.usuario_id AND u.activo = TRUE
  WHERE er.estado_id = p_estado_id;

  IF v_quedan = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Ese estado quedaría sin responsables activos. Asigne otro antes de quitarlo.';
  END IF;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_estados_sin_responsable — alimenta la alerta del panel: un estado
-- sin responsable activo detiene el trámite en silencio.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_estados_sin_responsable;
DELIMITER $$
CREATE PROCEDURE sp_estados_sin_responsable()
BEGIN
  SELECT e.id, e.nombre,
         (SELECT COUNT(*) FROM iniciativas i WHERE i.estado_id = e.id AND i.activo = TRUE) AS detenidas
  FROM estados e
  WHERE e.activo = TRUE AND e.es_final = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM estado_responsables er
      JOIN usuarios u ON u.id = er.usuario_id AND u.activo = TRUE
      WHERE er.estado_id = e.id)
  ORDER BY detenidas DESC, e.orden;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_estadisticas_flujo — ya no cuenta estados fijos: recorre el
-- catálogo. Incluye el tiempo promedio de permanencia, que es lo que
-- el historial hace posible.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_estadisticas_flujo;
DELIMITER $$
CREATE PROCEDURE sp_estadisticas_flujo()
BEGIN
  SELECT e.id, e.clave, e.nombre, e.color, e.orden,
         (SELECT COUNT(*) FROM iniciativas i
           WHERE i.estado_id = e.id AND i.activo = TRUE) AS actuales,
         (SELECT COUNT(*) FROM historial_iniciativa h
           WHERE h.estado_nuevo = e.id) AS entradas,
         (SELECT ROUND(AVG(DATEDIFF(COALESCE(sig.creado_en, NOW()), h.creado_en)), 1)
            FROM historial_iniciativa h
            LEFT JOIN historial_iniciativa sig
              ON sig.iniciativa_id = h.iniciativa_id
             AND sig.creado_en > h.creado_en
             AND sig.tipo <> 'acotar'
             AND sig.id = (SELECT MIN(s2.id) FROM historial_iniciativa s2
                            WHERE s2.iniciativa_id = h.iniciativa_id
                              AND s2.creado_en > h.creado_en AND s2.tipo <> 'acotar')
           WHERE h.estado_nuevo = e.id AND h.tipo <> 'acotar') AS dias_promedio
  FROM estados e
  WHERE e.activo = TRUE
  ORDER BY e.orden;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_registrar_configuracion — deja constancia de cada cambio de
-- configuración del flujo o de los roles.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_registrar_configuracion;
DELIMITER $$
CREATE PROCEDURE sp_registrar_configuracion(
  IN p_usuario_id INT, IN p_entidad VARCHAR(40),
  IN p_accion VARCHAR(40), IN p_detalle TEXT)
BEGIN
  INSERT INTO configuracion_historial (usuario_id, entidad, accion, detalle)
  VALUES (p_usuario_id, p_entidad, p_accion, p_detalle);
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- sp_listar_iniciativas — ahora resuelve el estado desde el catálogo
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_listar_iniciativas;
DELIMITER $$
CREATE PROCEDURE sp_listar_iniciativas(IN p_direccion_id VARCHAR(30))
BEGIN
  SELECT
    i.id, i.direccion_id, i.nombre, i.objeto, i.numero_proyecto,
    COALESCE(e.nombre, i.estado) AS estado,
    i.estado_id, e.clave AS estado_clave, e.color AS estado_color,
    COALESCE(v.alcance,'autenticado') AS visibilidad,
    i.prioridad, i.fecha_actualizacion, i.fuente_publica,
    i.creado_en, i.actualizado_en,
    i.origen, i.propuesta_por, i.propuesta_nombre,
    (SELECT COUNT(*) FROM documentos doc WHERE doc.iniciativa_id = i.id) AS total_documentos,
    (SELECT COUNT(*) FROM historial_iniciativa h WHERE h.iniciativa_id = i.id) AS total_movimientos
  FROM iniciativas i
  LEFT JOIN estados e            ON e.id = i.estado_id
  LEFT JOIN estado_visibilidad v ON v.estado_id = i.estado_id
      WHERE i.activo = TRUE
        AND (p_direccion_id IS NULL OR i.direccion_id = p_direccion_id)
      ORDER BY
        i.id DESC;
    END$$
DELIMITER ;

INSERT INTO schema_version (version, descripcion) VALUES
  (7, 'Flujo de estados configurable, responsables, visibilidad e historial')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);
