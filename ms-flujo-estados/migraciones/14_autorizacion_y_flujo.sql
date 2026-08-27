-- =====================================================================
-- Archivo: 14_autorizacion_y_flujo.sql — que la autorización sea la que
--          la pantalla dice, y que el flujo se pueda usar
--
-- Una auditoría de seis frentes con refutación independiente encontró
-- que tres cosas que la interfaz ofrece no funcionaban contra la base.
-- Esta migración las cierra. Cada bloque explica el defecto que corrige.
--
-- Idempotente. Ejecutar SIEMPRE con charset utf8mb4:
--   mysql --default-character-set=utf8mb4 -u root -p < db/14_autorizacion_y_flujo.sql
-- =====================================================================
SET NAMES utf8mb4;
USE iniciativas_legislativas;

-- ---------------------------------------------------------------------
-- 1. fn_tiene_permiso — el permiso, resuelto dentro de la base
--
-- Los procedimientos de flujo decidían quién puede mover un trámite
-- mirando SOLO `estado_responsables`. La API ya resuelve permisos con
-- `sp_permisos_de_usuario`, pero los procedimientos no tenían forma de
-- consultarlos, así que la regla vivía en dos sitios con criterios
-- distintos. Esta función es la que faltaba.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_tiene_permiso;
DELIMITER $$
CREATE FUNCTION fn_tiene_permiso(p_usuario_id INT, p_clave VARCHAR(60))
RETURNS BOOLEAN
READS SQL DATA
DETERMINISTIC
BEGIN
  DECLARE v_n INT DEFAULT 0;
  SELECT COUNT(*) INTO v_n
  FROM usuarios u
  JOIN rol_permisos rp ON rp.rol_id = u.rol_id
  JOIN permisos p      ON p.id = rp.permiso_id
  WHERE u.id = p_usuario_id AND u.activo = TRUE AND p.clave = p_clave;
  RETURN v_n > 0;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- 2. El flujo estaba muerto
--
-- El defecto: `sp_transiciones_disponibles` hacía JOIN —interno— contra
-- `estado_responsables`, y esa tabla está VACÍA en la base viva y en
-- cualquier instalación nueva, porque ninguna migración la siembra y
-- configurarla es un paso manual que nadie documentó. Resultado medido:
-- cero transiciones para los cinco usuarios probados, superadministrador
-- incluido. Las diecisiete iniciativas activas no se podían mover, y
-- ninguna pantalla decía por qué: el panel simplemente no ofrecía nada.
--
-- La regla nueva conserva la intención de la tabla sin dejar el trámite
-- encerrado:
--
--   · Habilita el PERMISO (`flujo.mover`, `flujo.acotar`).
--   · Si el estado TIENE responsables configurados, solo ellos actúan,
--     y con las casillas que se les hayan marcado. La tabla sigue
--     acotando, que es para lo que se creó.
--   · Si NO tiene ninguno, basta el permiso. Un estado sin responsable
--     es una configuración incompleta, no una orden de detener el
--     trámite. `sp_estados_sin_responsable()` ya lista esos estados;
--     ahora hay una ruta que lo expone.
--
-- Se prefirió esto a sembrar responsables de oficio: quién responde por
-- cada etapa lo decide el Viceministerio, no una migración.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_transiciones_disponibles;
DELIMITER $$
CREATE PROCEDURE sp_transiciones_disponibles(IN p_iniciativa_id INT, IN p_usuario_id INT)
BEGIN
  DECLARE v_estado INT;
  DECLARE v_hay_responsables INT DEFAULT 0;

  SELECT estado_id INTO v_estado
  FROM iniciativas WHERE id = p_iniciativa_id AND activo = TRUE;

  IF NOT fn_tiene_permiso(p_usuario_id, 'flujo.mover') THEN
    -- Sin permiso no hay acciones. Se devuelve vacío, no un error: la
    -- pantalla consulta esto para decidir qué dibujar.
    SELECT NULL AS id WHERE FALSE;
  ELSE
    SELECT COUNT(*) INTO v_hay_responsables
    FROM estado_responsables er
    JOIN usuarios u ON u.id = er.usuario_id AND u.activo = TRUE
    WHERE er.estado_id = v_estado;

    SELECT t.id, t.tipo, t.etiqueta, t.requiere_motivo,
           d.id AS destino_id, d.nombre AS destino_nombre, d.color AS destino_color
    FROM transiciones t
    JOIN estados d ON d.id = t.estado_destino AND d.activo = TRUE
    LEFT JOIN estado_responsables er
           ON er.estado_id = t.estado_origen AND er.usuario_id = p_usuario_id
    WHERE t.estado_origen = v_estado AND t.activo = TRUE
      AND (
        v_hay_responsables = 0
        OR ((t.tipo = 'avanzar'  AND er.puede_avanzar)
         OR (t.tipo = 'devolver' AND er.puede_devolver)
         OR (t.tipo = 'rechazar' AND er.puede_rechazar)
         OR (t.tipo = 'cerrar'   AND er.puede_cerrar))
      )
    ORDER BY FIELD(t.tipo,'avanzar','devolver','rechazar','cerrar'), t.etiqueta;
  END IF;
END$$
DELIMITER ;

-- sp_mover_iniciativa — misma regla, y con el mensaje de error distinto
-- según la causa. Antes decía siempre «No está autorizado», que es lo
-- que se leía también cuando el problema era que nadie había configurado
-- responsables: un mensaje que culpa a la persona de un vacío de
-- configuración.
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
  DECLARE v_hay_responsables INT DEFAULT 0;
  DECLARE v_nombre_destino VARCHAR(80);

  SELECT estado_id INTO v_estado_actual
  FROM iniciativas WHERE id = p_iniciativa_id AND activo = TRUE;
  IF v_estado_actual IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La iniciativa no existe';
  END IF;

  IF NOT fn_tiene_permiso(p_usuario_id, 'flujo.mover') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Su rol no permite mover iniciativas de estado';
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

  SELECT COUNT(*) INTO v_hay_responsables
  FROM estado_responsables er
  JOIN usuarios u ON u.id = er.usuario_id AND u.activo = TRUE
  WHERE er.estado_id = v_origen;

  IF v_hay_responsables > 0 THEN
    SELECT COUNT(*) INTO v_permitido
    FROM estado_responsables er
    WHERE er.estado_id = v_origen AND er.usuario_id = p_usuario_id
      AND ((v_tipo = 'avanzar'  AND er.puede_avanzar)
        OR (v_tipo = 'devolver' AND er.puede_devolver)
        OR (v_tipo = 'rechazar' AND er.puede_rechazar)
        OR (v_tipo = 'cerrar'   AND er.puede_cerrar));
    IF v_permitido = 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Este estado tiene responsables asignados y usted no es uno de ellos';
    END IF;
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

-- sp_acotar_iniciativa — misma regla con `flujo.acotar`.
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
  DECLARE v_hay_responsables INT DEFAULT 0;

  IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Debe indicar por qué se acota el alcance';
  END IF;

  SELECT estado_id, objeto INTO v_estado, v_anterior
  FROM iniciativas WHERE id = p_iniciativa_id AND activo = TRUE;
  IF v_estado IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La iniciativa no existe';
  END IF;

  IF NOT fn_tiene_permiso(p_usuario_id, 'flujo.acotar') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Su rol no permite acotar el alcance de una iniciativa';
  END IF;

  SELECT COUNT(*) INTO v_hay_responsables
  FROM estado_responsables er
  JOIN usuarios u ON u.id = er.usuario_id AND u.activo = TRUE
  WHERE er.estado_id = v_estado AND er.puede_acotar;

  IF v_hay_responsables > 0 THEN
    SELECT COUNT(*) INTO v_permitido FROM estado_responsables
    WHERE estado_id = v_estado AND usuario_id = p_usuario_id AND puede_acotar;
    IF v_permitido = 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Este estado tiene responsables asignados y usted no es uno de ellos';
    END IF;
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
-- 3. Editar un usuario devolvía 500 y guardaba a medias
--
-- El defecto: `PUT /api/admin/usuarios/:id` llamaba a
-- `sp_cambiar_estado_usuario`, que NO EXISTE —comprobado: ERROR 1305—.
-- Y la interfaz manda `activo` siempre, así que toda edición de usuario
-- reventaba. Peor que fallar limpio: `sp_asignar_rol` ya se había
-- ejecutado en la línea anterior, de modo que el rol SÍ quedaba
-- guardado, pero el operador veía «Error interno del servidor», la
-- caché de permisos no se invalidaba y no quedaba constancia en
-- `configuracion_historial`. Además la ruta descartaba `direccion_id`,
-- que la pantalla envía: cambiar de dirección a alguien no hacía nada.
--
-- Se resuelve con UN procedimiento que hace las cuatro cosas o ninguna.
-- Contrato igual al de la migración 08: NULL = no tocar ese campo.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_actualizar_usuario;
DELIMITER $$
CREATE PROCEDURE sp_actualizar_usuario(
  IN p_id           INT,
  IN p_rol_id       INT,
  IN p_direccion_id VARCHAR(30),
  IN p_activo       BOOLEAN,
  IN p_pendiente    BOOLEAN
)
BEGIN
  DECLARE v_existe INT DEFAULT 0;
  DECLARE v_admins_antes INT DEFAULT 0;
  DECLARE v_admins_despues INT DEFAULT 0;
  DECLARE v_clave VARCHAR(40);

  SELECT COUNT(*) INTO v_existe FROM usuarios WHERE id = p_id;
  IF v_existe = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El usuario no existe';
  END IF;

  IF p_rol_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM roles WHERE id = p_rol_id AND activo = TRUE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El rol indicado no existe o está inactivo';
  END IF;

  IF p_direccion_id IS NOT NULL AND p_direccion_id <> ''
     AND NOT EXISTS (SELECT 1 FROM direcciones WHERE id = p_direccion_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La dirección indicada no existe';
  END IF;

  -- Cuántas personas pueden administrar roles ANTES del cambio. La
  -- guarda debe saltar solo si esta edición deja al sistema sin
  -- ninguna, no si nunca la hubo (instalación nueva).
  SELECT COUNT(DISTINCT u.id) INTO v_admins_antes
  FROM usuarios u
  JOIN rol_permisos rp ON rp.rol_id = u.rol_id
  JOIN permisos p      ON p.id = rp.permiso_id AND p.clave = 'roles.administrar'
  WHERE u.activo = TRUE;

  -- Cuántas quedarían DESPUÉS, calculado sin escribir: las demás cuentas
  -- activas que administran roles, más esta misma si el rol y el estado
  -- que se le van a dejar siguen habilitándola.
  --
  -- Esto se comprueba ANTES del UPDATE a propósito. La primera versión
  -- escribía y avisaba después, y como MySQL confirma cada sentencia por
  -- separado, la guarda saltaba con el daño ya hecho: en la prueba dejó
  -- las dos cuentas administradoras convertidas en lector. Es el mismo
  -- defecto que arrastra `sp_quitar_responsable`, que también borra
  -- primero y avisa después.
  SELECT
    (SELECT COUNT(DISTINCT u.id)
       FROM usuarios u
       JOIN rol_permisos rp ON rp.rol_id = u.rol_id
       JOIN permisos p      ON p.id = rp.permiso_id AND p.clave = 'roles.administrar'
      WHERE u.activo = TRUE AND u.id <> p_id)
    + IF(COALESCE(p_activo, (SELECT activo FROM usuarios WHERE id = p_id))
         AND EXISTS (SELECT 1
                       FROM rol_permisos rp
                       JOIN permisos p ON p.id = rp.permiso_id AND p.clave = 'roles.administrar'
                      WHERE rp.rol_id = COALESCE(p_rol_id, (SELECT rol_id FROM usuarios WHERE id = p_id))),
         1, 0)
  INTO v_admins_despues;

  IF v_admins_antes > 0 AND v_admins_despues = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No puede dejar el sistema sin ninguna persona que administre roles';
  END IF;

  UPDATE usuarios
  SET rol_id              = COALESCE(p_rol_id, rol_id),
      direccion_id        = CASE
                              WHEN p_direccion_id IS NULL  THEN direccion_id
                              WHEN p_direccion_id = ''     THEN NULL
                              ELSE p_direccion_id
                            END,
      activo              = COALESCE(p_activo, activo),
      pendiente_aprobacion= COALESCE(p_pendiente, pendiente_aprobacion)
  WHERE id = p_id;

  -- `usuarios.rol` es la columna de compatibilidad de la fase 2. Ya no
  -- autoriza nada —el middleware pasó a resolver permisos—, pero se
  -- mantiene alineada mientras exista, para que un vistazo a la tabla no
  -- diga una cosa y la aplicación otra. Los roles creados desde pantalla
  -- que no coincidan con el ENUM viejo la dejan como está.
  SELECT r.clave INTO v_clave FROM roles r JOIN usuarios u ON u.rol_id = r.id WHERE u.id = p_id;
  IF v_clave IN ('viceministro','director','editor','lector') THEN
    UPDATE usuarios SET rol = v_clave WHERE id = p_id;
  END IF;

  SELECT p_id AS id;
END$$
DELIMITER ;

-- `sp_asignar_rol` sigue existiendo —lo usan otros caminos— pero ahora
-- mantiene la columna de compatibilidad alineada, que era el motivo por
-- el que cambiar el rol desde /admin no cambiaba quién podía escribir.
DROP PROCEDURE IF EXISTS sp_sincronizar_rol_compat;
DELIMITER $$
CREATE PROCEDURE sp_sincronizar_rol_compat(IN p_usuario_id INT)
BEGIN
  UPDATE usuarios u
  JOIN roles r ON r.id = u.rol_id
  SET u.rol = r.clave
  WHERE u.id = p_usuario_id
    AND r.clave IN ('viceministro','director','editor','lector');
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- 4. No se podía crear ni editar un estado del flujo
--
-- El defecto: la ruta llamaba `sp_guardar_estado` con SIETE argumentos y
-- el procedimiento declara SEIS —comprobado: ERROR 1318—, porque la
-- pantalla pide una descripción que la tabla `estados` no tiene dónde
-- guardar. Los dos extremos son razonables: describir para qué sirve un
-- estado ayuda a quien configura el flujo. Se añade la columna en vez de
-- quitar el campo de la pantalla.
--
-- Ojo al corregir esto a mano: no basta con quitar un argumento. El
-- orden también estaba cruzado (`es_final` iba antes que `orden`), así
-- que una corrección ingenua guardaría el color en la columna del orden.
-- ---------------------------------------------------------------------
SET @hay := (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'estados'
               AND column_name = 'descripcion');
SET @sql := IF(@hay = 0,
  'ALTER TABLE estados ADD COLUMN descripcion VARCHAR(300) NULL AFTER nombre',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP PROCEDURE IF EXISTS sp_guardar_estado;
DELIMITER $$
CREATE PROCEDURE sp_guardar_estado(
  IN p_id          INT,
  IN p_nombre      VARCHAR(80),
  IN p_descripcion VARCHAR(300),
  IN p_color       VARCHAR(20),
  IN p_orden       INT,
  IN p_final       BOOLEAN,
  IN p_visibilidad VARCHAR(20)
)
BEGIN
  DECLARE v_id INT;
  DECLARE v_clave VARCHAR(40);

  IF p_nombre IS NULL OR TRIM(p_nombre) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El estado necesita un nombre';
  END IF;

  IF p_id IS NULL THEN
    -- La clave se deriva del nombre: minúsculas, sin tildes ni espacios.
    SET v_clave = LOWER(TRIM(p_nombre));
    SET v_clave = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(v_clave,
      'á','a'),'é','e'),'í','i'),'ó','o'),'ú','u');
    SET v_clave = REPLACE(REPLACE(v_clave, 'ñ','n'), ' ', '_');

    IF EXISTS (SELECT 1 FROM estados WHERE clave = v_clave) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ya existe un estado con ese nombre';
    END IF;

    INSERT INTO estados (clave, nombre, descripcion, color, orden, es_inicial, es_final, activo)
    VALUES (v_clave, TRIM(p_nombre), NULLIF(TRIM(COALESCE(p_descripcion,'')),''),
            COALESCE(p_color,'azul'), COALESCE(p_orden,0), FALSE,
            COALESCE(p_final,FALSE), TRUE);
    SET v_id = LAST_INSERT_ID();
  ELSE
    IF NOT EXISTS (SELECT 1 FROM estados WHERE id = p_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El estado no existe';
    END IF;
    UPDATE estados
    SET nombre      = TRIM(p_nombre),
        descripcion = NULLIF(TRIM(COALESCE(p_descripcion,'')),''),
        color       = COALESCE(p_color, color),
        orden       = COALESCE(p_orden, orden),
        es_final    = COALESCE(p_final, es_final)
    WHERE id = p_id;
    SET v_id = p_id;
  END IF;

  -- La visibilidad decide quién ve el trámite: se guarda junto al estado.
  IF p_visibilidad IS NOT NULL AND p_visibilidad <> '' THEN
    INSERT INTO estado_visibilidad (estado_id, alcance)
    VALUES (v_id, p_visibilidad)
    ON DUPLICATE KEY UPDATE alcance = VALUES(alcance);
  END IF;

  SELECT v_id AS id;
END$$
DELIMITER ;

-- `sp_listar_estados` tiene que devolver la descripción nueva, o la
-- pantalla la guardaría y no la volvería a ver.
--
-- Lo demás se deja EXACTO al original: mismos nombres de columna
-- —`responsables_activos`, no `responsables`— y sin filtrar por
-- `activo`, porque /admin/flujo necesita mostrar también los estados
-- desactivados para poder reactivarlos. Cambiar cualquiera de las dos
-- cosas rompería la pantalla en silencio.
DROP PROCEDURE IF EXISTS sp_listar_estados;
DELIMITER $$
CREATE PROCEDURE sp_listar_estados()
BEGIN
  SELECT e.id, e.clave, e.nombre, e.descripcion, e.color, e.orden,
         e.es_inicial, e.es_final, e.activo,
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

-- ---------------------------------------------------------------------
-- 5. `sp_quitar_responsable` avisaba con el daño hecho
--
-- Borraba la fila y DESPUÉS comprobaba si el estado quedaba sin
-- responsables activos, con un SIGNAL. Como MySQL confirma cada
-- sentencia por su cuenta, el borrado ya estaba en firme cuando saltaba
-- el aviso: la pantalla mostraba un error y el responsable había
-- desaparecido igual. La guarda no guardaba nada.
--
-- Ahora se decide antes de tocar la tabla.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_quitar_responsable;
DELIMITER $$
CREATE PROCEDURE sp_quitar_responsable(IN p_estado_id INT, IN p_usuario_id INT)
BEGIN
  DECLARE v_quedan INT DEFAULT 0;

  SELECT COUNT(*) INTO v_quedan
  FROM estado_responsables er
  JOIN usuarios u ON u.id = er.usuario_id AND u.activo = TRUE
  WHERE er.estado_id = p_estado_id AND er.usuario_id <> p_usuario_id;

  IF v_quedan = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Ese estado quedaría sin responsables activos. Asigne otro antes de quitarlo.';
  END IF;

  DELETE FROM estado_responsables
  WHERE estado_id = p_estado_id AND usuario_id = p_usuario_id;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- 6. Reparación de lo que ya está desalineado
--
-- Las cuentas 1 y 20 tienen `rol = 'viceministro'` y rol dinámico
-- `administrador`. Como el middleware autorizaba por la columna vieja,
-- estaban escribiendo con permisos de viceministro. No se cambia el rol
-- dinámico de nadie —eso lo decide quien administra—: solo se alinea la
-- columna de compatibilidad donde el nombre coincide con el ENUM.
-- ---------------------------------------------------------------------
UPDATE usuarios u
JOIN roles r ON r.id = u.rol_id
SET u.rol = r.clave
WHERE r.clave IN ('viceministro','director','editor','lector')
  AND u.rol <> r.clave;

-- ---------------------------------------------------------------------
-- 7. Diagnóstico — para revisar esto sin abrir el código
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_diagnostico_autorizacion;
DELIMITER $$
CREATE PROCEDURE sp_diagnostico_autorizacion()
BEGIN
  SELECT 'Cuentas cuyo rol dinámico no coincide con la columna vieja' AS revision;
  SELECT u.id, u.correo, u.rol AS columna_vieja, r.clave AS rol_dinamico
  FROM usuarios u JOIN roles r ON r.id = u.rol_id
  WHERE r.clave IN ('viceministro','director','editor','lector') AND u.rol <> r.clave;

  SELECT 'Estados sin responsable: cualquiera con flujo.mover puede actuar' AS revision;
  SELECT e.id, e.nombre,
         (SELECT COUNT(*) FROM iniciativas i WHERE i.estado_id = e.id AND i.activo = TRUE) AS iniciativas
  FROM estados e
  WHERE e.activo = TRUE AND e.es_final = FALSE
    AND NOT EXISTS (SELECT 1 FROM estado_responsables er
                    JOIN usuarios u ON u.id = er.usuario_id AND u.activo = TRUE
                    WHERE er.estado_id = e.id);

  SELECT 'Quién puede mover trámites hoy' AS revision;
  SELECT r.clave AS rol, COUNT(u.id) AS personas
  FROM roles r
  JOIN rol_permisos rp ON rp.rol_id = r.id
  JOIN permisos p      ON p.id = rp.permiso_id AND p.clave = 'flujo.mover'
  LEFT JOIN usuarios u ON u.rol_id = r.id AND u.activo = TRUE
  GROUP BY r.id ORDER BY r.id;
END$$
DELIMITER ;

INSERT INTO schema_version (version, descripcion) VALUES
  (14, 'El flujo vuelve a funcionar, editar usuarios y estados deja de dar 500, y la autorización se resuelve por permisos')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);
