-- =====================================================================
-- Archivo: 09_flujo_al_crear.sql — toda iniciativa nace dentro del flujo
--
-- Problema que corrige:
--   La migración 07 convirtió el estado en un catálogo (`estados`) con
--   transiciones, y rellenó `iniciativas.estado_id` una sola vez, para lo
--   que ya existía:
--
--     UPDATE iniciativas i JOIN estados e ON e.nombre = i.estado
--        SET i.estado_id = e.id;
--
--   Pero `sp_crear_iniciativa` (migración 02) y `sp_crear_propuesta`
--   (migración 05) siguieron insertando solo la columna de compatibilidad
--   `estado`, nunca `estado_id`. Así que TODO lo creado después de la 07
--   queda con `estado_id` NULL.
--
--   El síntoma no se ve en el tablero, y eso es lo peor: `sp_listar_iniciativas`
--   devuelve `COALESCE(e.nombre, i.estado)`, así que la píldora dice
--   «En formulación» como cualquier otra. Pero:
--     · sp_transiciones_disponibles hace `WHERE t.estado_origen = v_estado`
--       y con NULL no devuelve ninguna fila: el panel informa «No es
--       responsable de En formulación» y la iniciativa NO SE PUEDE MOVER.
--     · sp_acotar_iniciativa responde «La iniciativa no existe».
--
--   Es decir: cada iniciativa nueva y cada propuesta ciudadana entraba al
--   sistema sin poder tramitarse, y nada lo indicaba.
--
-- Qué hace este archivo:
--   1. Repara las filas que ya quedaron con estado_id NULL.
--   2. Redefine los dos procedimientos de creación para que resuelvan el
--      estado inicial del catálogo y lo escriban.
--
-- Idempotente. Ejecutar SIEMPRE con charset utf8mb4:
--   mysql --default-character-set=utf8mb4 -u root -p < db/09_flujo_al_crear.sql
-- =====================================================================
SET NAMES utf8mb4;
USE iniciativas_legislativas;

-- ---------------------------------------------------------------------
-- 1. Reparar el histórico.
--
-- Primero por nombre, que es la correspondencia exacta y respeta el
-- estado en que cada una quedó. Lo que no cuadre por nombre —un estado
-- renombrado desde administración, por ejemplo— cae al estado inicial del
-- catálogo, que es el único destino seguro: deja la iniciativa al principio
-- del trámite en vez de dejarla fuera de él.
-- ---------------------------------------------------------------------
UPDATE iniciativas i
   JOIN estados e ON e.nombre = i.estado AND e.activo = TRUE
    SET i.estado_id = e.id
  WHERE i.estado_id IS NULL;

UPDATE iniciativas
   SET estado_id = (
         SELECT id FROM estados
          WHERE es_inicial = TRUE AND activo = TRUE
          ORDER BY orden LIMIT 1
       )
 WHERE estado_id IS NULL;

-- ---------------------------------------------------------------------
-- 2. sp_crear_iniciativa — resuelve y escribe estado_id
--
-- `p_estado` sigue llegando como nombre, porque la API y la columna de
-- compatibilidad lo usan así. Se busca en el catálogo; si no aparece
-- —nombre viejo, o NULL— se usa el estado inicial.
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
  DECLARE v_estado_id INT DEFAULT NULL;
  DECLARE v_estado_nombre VARCHAR(30);

  SET v_estado_nombre = COALESCE(NULLIF(p_estado, ''), 'En formulación');

  SELECT id INTO v_estado_id
    FROM estados
   WHERE nombre = v_estado_nombre AND activo = TRUE
   LIMIT 1;

  IF v_estado_id IS NULL THEN
    SELECT id INTO v_estado_id
      FROM estados
     WHERE es_inicial = TRUE AND activo = TRUE
     ORDER BY orden LIMIT 1;
    -- Se alinea el nombre con el estado que realmente se asignó, para que
    -- la columna de compatibilidad no contradiga a estado_id.
    SELECT nombre INTO v_estado_nombre FROM estados WHERE id = v_estado_id;
  END IF;

  INSERT INTO iniciativas
    (direccion_id, nombre, objeto, numero_proyecto, estado, estado_id, prioridad,
     fecha_actualizacion, fuente_publica)
  VALUES
    (p_direccion_id, p_nombre, p_objeto, p_numero_proyecto,
     v_estado_nombre, v_estado_id, COALESCE(p_prioridad,'Media'),
     p_fecha_actualizacion, COALESCE(p_fuente_publica, FALSE));

  SELECT LAST_INSERT_ID() AS id;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- 3. sp_crear_propuesta — igual, para la radicación ciudadana
--
-- Es la más importante de las dos: una propuesta que no se puede mover es
-- una radicación ciudadana que nadie puede tramitar.
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
  DECLARE v_estado_id INT DEFAULT NULL;
  DECLARE v_estado_nombre VARCHAR(30) DEFAULT 'En formulación';

  SELECT id, nombre INTO v_estado_id, v_estado_nombre
    FROM estados
   WHERE es_inicial = TRUE AND activo = TRUE
   ORDER BY orden LIMIT 1;

  INSERT INTO iniciativas
    (direccion_id, nombre, objeto, numero_proyecto, estado, estado_id, prioridad,
     fecha_actualizacion, fuente_publica,
     origen, propuesta_por, propuesta_nombre, propuesta_correo, propuesta_en)
  VALUES
    (p_direccion_id, p_nombre, NULLIF(p_objeto,''), NULLIF(p_numero,''),
     v_estado_nombre, v_estado_id, 'Media', CURDATE(), FALSE,
     'propuesta', p_usuario_id, NULLIF(p_contacto,''), NULLIF(p_correo,''), NOW());

  SELECT LAST_INSERT_ID() AS id;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- Diagnóstico: iniciativas fuera del flujo.
--
-- Debe devolver 0. Si alguna vez devuelve otra cosa, hay un camino de
-- creación que no pasa por estos dos procedimientos.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_diagnostico_fuera_de_flujo;

DELIMITER $$
CREATE PROCEDURE sp_diagnostico_fuera_de_flujo()
BEGIN
  SELECT COUNT(*) AS sin_estado_id
    FROM iniciativas
   WHERE activo = TRUE AND estado_id IS NULL;
END$$
DELIMITER ;

INSERT INTO schema_version (version, descripcion) VALUES
  (9, 'Las iniciativas y propuestas nuevas nacen con estado_id del catálogo')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);
