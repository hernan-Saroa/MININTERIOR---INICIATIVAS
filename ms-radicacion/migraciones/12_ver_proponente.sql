-- =====================================================================
-- Archivo: 12_ver_proponente.sql — ver quién radicó es un permiso
--
-- El problema:
--   La migración anterior de la interfaz dejó de publicar el nombre del
--   proponente a quien consulta sin sesión. Pero «tener sesión» no es una
--   autorización: el autorregistro es autoservicio —POST /api/publico/registrar,
--   sin aprobación previa— así que cualquiera se hace una cuenta en medio
--   minuto y vuelve a ver el nombre de todas las personas que han radicado.
--
--   En una entidad que atiende trámites de consulta previa y de garantías
--   para personas defensoras de derechos humanos, saber quién pidió qué es
--   un dato de seguridad. La barrera no puede ser «tener cuenta».
--
-- La decisión:
--   Un permiso propio, y no reutilizar `iniciativas.editar`. Atarlo a la
--   edición confundiría dos cosas distintas —«puede trabajar el expediente»
--   y «puede ver quién lo radicó»— y dejaría al Viceministerio sin forma de
--   separarlas sin tocar código. Con un permiso propio, quién lo tiene se
--   decide desde la pantalla de roles, que es donde corresponde.
--
--   Reparto inicial, que el administrador puede cambiar:
--     editor, director, viceministro   SÍ — atienden el trámite y pueden
--                                      necesitar contactar a quien radicó
--     secretaría jurídica              NO — revisa el concepto, no el remitente
--     administrador                    NO — administra roles y cuentas, no casos
--     lector                           NO — es el rol con el que nacen las
--                                      cuentas autorregistradas
--
-- Idempotente. Ejecutar SIEMPRE con charset utf8mb4:
--   mysql --default-character-set=utf8mb4 -u root -p < db/12_ver_proponente.sql
-- =====================================================================
SET NAMES utf8mb4;
USE iniciativas_legislativas;

-- ---------------------------------------------------------------------
-- 1. El permiso entra al catálogo.
--
-- Se verifica en api/rutas/iniciativas.js: sin él, el GET del listado
-- retira propuesta_nombre y propuesta_por de la respuesta.
-- ---------------------------------------------------------------------
INSERT INTO permisos (clave, nombre, descripcion, grupo, orden) VALUES
  ('iniciativas.ver_proponente',
   'Ver quién radicó',
   'Consultar el nombre de la persona u organización que presentó una iniciativa ciudadana',
   'Iniciativas', 8)
ON DUPLICATE KEY UPDATE
  nombre      = VALUES(nombre),
  descripcion = VALUES(descripcion),
  grupo       = VALUES(grupo),
  orden       = VALUES(orden);

-- ---------------------------------------------------------------------
-- 2. Reparto inicial.
--
-- No se usa el atajo de la migración 06 —«al viceministro, todo menos
-- roles.administrar»— porque aquel INSERT corrió una sola vez y no alcanza
-- a los permisos nuevos. Se conceden uno a uno, a propósito: un permiso
-- sobre datos personales no debería heredarse por una regla general.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS tmp_dar_permiso_12;
DELIMITER $$
CREATE PROCEDURE tmp_dar_permiso_12(IN p_rol VARCHAR(40), IN p_permiso VARCHAR(60))
BEGIN
  INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
  SELECT r.id, p.id FROM roles r, permisos p
  WHERE r.clave = p_rol AND p.clave = p_permiso;
END$$
DELIMITER ;

CALL tmp_dar_permiso_12('editor',       'iniciativas.ver_proponente');
CALL tmp_dar_permiso_12('director',     'iniciativas.ver_proponente');
CALL tmp_dar_permiso_12('viceministro', 'iniciativas.ver_proponente');

DROP PROCEDURE tmp_dar_permiso_12;

-- ---------------------------------------------------------------------
-- Diagnóstico: quién puede ver la identidad de los proponentes.
--
-- Conviene revisarlo después de cualquier cambio de roles. Si aparece un
-- rol que no debería, se quita desde /admin/roles.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_diagnostico_ver_proponente;

DELIMITER $$
CREATE PROCEDURE sp_diagnostico_ver_proponente()
BEGIN
  SELECT r.clave AS rol, r.nombre,
         (SELECT COUNT(*) FROM usuarios u WHERE u.rol_id = r.id AND u.activo = TRUE) AS personas
  FROM roles r
  JOIN rol_permisos rp ON rp.rol_id = r.id
  JOIN permisos p      ON p.id = rp.permiso_id
  WHERE p.clave = 'iniciativas.ver_proponente' AND r.activo = TRUE
  ORDER BY r.clave;
END$$
DELIMITER ;

INSERT INTO schema_version (version, descripcion) VALUES
  (12, 'Ver la identidad de quien radicó exige el permiso iniciativas.ver_proponente')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);
