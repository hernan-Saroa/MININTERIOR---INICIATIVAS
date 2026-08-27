-- =====================================================================
-- Archivo: 15_cuentas_y_sesiones.sql — que una cuenta nueva sirva, y que
--          retirar el acceso a alguien lo retire de verdad
--
-- Tres defectos, todos comprobados contra la base viva.
--
-- Idempotente. Ejecutar SIEMPRE con charset utf8mb4:
--   mysql --default-character-set=utf8mb4 -u root -p < db/15_cuentas_y_sesiones.sql
-- =====================================================================
SET NAMES utf8mb4;
USE iniciativas_legislativas;

-- ---------------------------------------------------------------------
-- 1. Toda cuenta creada por el camino documentado nacía sin permisos
--
-- `sp_crear_usuario` escribía únicamente `usuarios.rol`, el ENUM de la
-- fase 2, y dejaba `rol_id` en NULL. Mientras la autorización se resolvía
-- con el ENUM eso funcionaba por accidente. Al pasar a permisos —
-- migración 14, que es lo correcto— quedó a la vista: `fn_tiene_permiso`
-- une por `rol_id`, así que con NULL la cuenta no tiene ni un permiso.
--
-- Comprobado: se creó una cuenta con `npm run crear-usuario` (rol
-- 'editor'), cambió su contraseña provisional y al intentar escribir
-- recibió «Su rol no permite modificar información». Es decir: el único
-- camino documentado para crear la primera cuenta producía una cuenta
-- inservible.
--
-- El ENUM se sigue escribiendo para no romper la compatibilidad, pero
-- ahora se resuelve el `rol_id` que le corresponde.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_crear_usuario;
DELIMITER $$
CREATE PROCEDURE sp_crear_usuario(
  IN p_nombre       VARCHAR(120),
  IN p_correo       VARCHAR(160),
  IN p_direccion_id VARCHAR(30),
  IN p_rol          VARCHAR(30)
)
BEGIN
  DECLARE v_clave VARCHAR(40);
  DECLARE v_rol_id INT;

  SET v_clave = COALESCE(NULLIF(TRIM(p_rol), ''), 'lector');

  SELECT id INTO v_rol_id FROM roles WHERE clave = v_clave AND activo = TRUE LIMIT 1;
  IF v_rol_id IS NULL THEN
    -- Un rol que no está en el catálogo no puede convertirse en «sin
    -- permisos en silencio»: se avisa. Antes ni se miraba.
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Ese rol no existe en el catálogo. Consulte los roles activos.';
  END IF;

  INSERT INTO usuarios (nombre, correo, direccion_id, rol, rol_id)
  VALUES (p_nombre, p_correo, p_direccion_id, v_clave, v_rol_id)
  ON DUPLICATE KEY UPDATE
    nombre       = VALUES(nombre),
    direccion_id = VALUES(direccion_id),
    rol          = VALUES(rol),
    rol_id       = VALUES(rol_id),
    -- Reactivar al repetir el correo es deliberado y está documentado:
    -- es la forma de devolverle el acceso a alguien. No se toca.
    activo       = TRUE;

  SELECT id FROM usuarios WHERE correo = p_correo;
END$$
DELIMITER ;

-- Reparación: cuentas que ya nacieron sin rol dinámico.
UPDATE usuarios u
JOIN roles r ON r.clave = u.rol AND r.activo = TRUE
SET u.rol_id = r.id
WHERE u.rol_id IS NULL;

-- Si alguna queda sin rol —porque su ENUM no coincide con ningún
-- catálogo—, se le pone Lector: sin rol no puede ni consultar, y una
-- cuenta que no puede hacer nada es indistinguible de un fallo.
UPDATE usuarios
SET rol_id = (SELECT id FROM roles WHERE clave = 'lector' LIMIT 1)
WHERE rol_id IS NULL;

-- ---------------------------------------------------------------------
-- 2. Retirar el acceso a alguien no lo retiraba
--
-- `usuarios.activo` se consultaba EXCLUSIVAMENTE al ingresar. La cookie
-- es `rolling` con ocho horas, así que se renueva en cada petición: una
-- sesión en uso no caduca. Consecuencia medida: poner `activo = 0` a
-- alguien que deja el Ministerio no lo expulsa —sigue escribiendo y
-- exportando el CSV— y lo mismo vale para bajarle el rol o cambiarle la
-- dirección, porque el middleware leía la copia congelada en la sesión.
--
-- `sp_estado_de_usuario` es lo que faltaba para poder revalidar en cada
-- petición sin arrastrar la sesión entera.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_estado_de_usuario;
DELIMITER $$
CREATE PROCEDURE sp_estado_de_usuario(IN p_id INT)
BEGIN
  SELECT u.id, u.activo, u.debe_cambiar, u.pendiente_aprobacion,
         u.direccion_id, u.rol_id, u.rol,
         r.clave AS rol_clave, r.nombre AS rol_nombre
  FROM usuarios u
  LEFT JOIN roles r ON r.id = u.rol_id
  WHERE u.id = p_id;
END$$
DELIMITER ;

-- Cerrar las sesiones abiertas de una persona. La tabla `sesiones` la
-- administra express-mysql-session y nada del proyecto la tocaba: el
-- único remedio documentado para expulsar a alguien era entrar al
-- contenedor y borrar filas a mano, y eso no estaba escrito en ninguna
-- parte.
DROP PROCEDURE IF EXISTS sp_cerrar_sesiones_de_usuario;
DELIMITER $$
CREATE PROCEDURE sp_cerrar_sesiones_de_usuario(IN p_id INT)
BEGIN
  DECLARE v_borradas INT DEFAULT 0;

  -- El identificador viaja dentro del JSON que guarda express-session.
  -- Se busca por el par exacto para no arrastrar a los usuarios 1 y 12
  -- cuando se cierra la sesión del 2 (LIKE '%"id":2%' haría eso).
  DELETE FROM sesiones
  WHERE JSON_EXTRACT(data, '$.usuario.id') = p_id;

  SET v_borradas = ROW_COUNT();
  SELECT v_borradas AS sesiones_cerradas;
END$$
DELIMITER ;

-- Y desactivar a alguien cierra sus sesiones en la misma operación. Si
-- hay que acordarse de hacerlo aparte, tarde o temprano no se hace.
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
  DECLARE v_activo_antes TINYINT(1);

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

  SELECT COUNT(DISTINCT u.id) INTO v_admins_antes
  FROM usuarios u
  JOIN rol_permisos rp ON rp.rol_id = u.rol_id
  JOIN permisos p      ON p.id = rp.permiso_id AND p.clave = 'roles.administrar'
  WHERE u.activo = TRUE;

  -- Cuántas quedarían DESPUÉS, calculado sin escribir. La primera versión
  -- escribía y avisaba después, y como MySQL confirma cada sentencia por
  -- separado la guarda saltaba con el daño hecho: en la prueba dejó las
  -- dos cuentas administradoras convertidas en lector.
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

  SELECT activo INTO v_activo_antes FROM usuarios WHERE id = p_id;

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

  -- Desactivar cierra las sesiones abiertas. La revalidación por petición
  -- que hace el middleware ya bastaría, pero borrar la fila deja el
  -- efecto inmediato y visible en la tabla, que es lo que puede
  -- comprobar quien administra.
  IF v_activo_antes = 1 AND p_activo IS NOT NULL AND p_activo = 0 THEN
    DELETE FROM sesiones WHERE JSON_EXTRACT(data, '$.usuario.id') = p_id;
  END IF;

  -- `usuarios.rol` es la columna de compatibilidad. Ya no autoriza nada,
  -- pero se mantiene alineada mientras exista, para que un vistazo a la
  -- tabla no diga una cosa y la aplicación otra. Los roles creados desde
  -- pantalla que no coincidan con el ENUM viejo la dejan como está.
  SELECT r.clave INTO v_clave FROM roles r JOIN usuarios u ON u.rol_id = r.id WHERE u.id = p_id;
  IF v_clave IN ('viceministro','director','editor','lector') THEN
    UPDATE usuarios SET rol = v_clave WHERE id = p_id;
  END IF;

  SELECT p_id AS id;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- 3. Diagnóstico
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_diagnostico_cuentas;
DELIMITER $$
CREATE PROCEDURE sp_diagnostico_cuentas()
BEGIN
  SELECT 'Cuentas sin rol dinámico: no tienen NINGÚN permiso' AS revision;
  SELECT id, correo, rol AS columna_vieja FROM usuarios WHERE rol_id IS NULL;

  SELECT 'Cuentas con contraseña provisional: pueden consultar, no escribir' AS revision;
  SELECT u.id, u.correo, r.clave AS rol
  FROM usuarios u LEFT JOIN roles r ON r.id = u.rol_id
  WHERE u.debe_cambiar = TRUE;

  SELECT 'Cuentas que comparten el hash de contraseña con otra' AS revision;
  SELECT contrasena_hash IS NOT NULL AS tiene_clave, COUNT(*) AS cuentas,
         GROUP_CONCAT(correo ORDER BY id SEPARATOR ', ') AS correos
  FROM usuarios
  WHERE contrasena_hash IS NOT NULL
  GROUP BY contrasena_hash
  HAVING COUNT(*) > 1;

  SELECT 'Sesiones abiertas' AS revision;
  SELECT JSON_UNQUOTE(JSON_EXTRACT(data, '$.usuario.correo')) AS correo,
         FROM_UNIXTIME(expires) AS expira
  FROM sesiones
  WHERE JSON_EXTRACT(data, '$.usuario.id') IS NOT NULL
  ORDER BY expires DESC;

  SELECT 'Cuentas activas sin ninguna sesión ni ingreso registrado' AS revision;
  SELECT id, correo FROM usuarios WHERE activo = TRUE AND ultimo_ingreso IS NULL;
END$$
DELIMITER ;

INSERT INTO schema_version (version, descripcion) VALUES
  (15, 'Las cuentas nuevas nacen con rol dinámico, y desactivar a alguien cierra sus sesiones')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);
