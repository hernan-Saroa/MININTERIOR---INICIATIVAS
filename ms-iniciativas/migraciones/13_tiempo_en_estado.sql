-- =====================================================================
-- Archivo: 13_tiempo_en_estado.sql — desde cuándo está donde está
--
-- Por qué:
--   Esto es un rastreador de trámites, y de un trámite lo que importa es si
--   se está moviendo. El listado devolvía la fecha de actualización como un
--   dato crudo —«2026-08-05»— y nada decía cuánto lleva una iniciativa
--   parada en el mismo estado. Con esa información ya en la tabla de
--   historial, no mostrarla era desperdiciar el producto.
--
-- Qué añade:
--   `desde_estado`: la fecha del último movimiento que CAMBIÓ el estado.
--   Se excluyen 'acotar' y 'edicion' porque no mueven el trámite: corregir
--   una tilde no debe reiniciar el contador de cuánto lleva en comisión.
--
--   Es NULL para las iniciativas que todavía no tienen historial —hoy,
--   todas—. La interfaz cae entonces a `fecha_actualizacion` y lo dice con
--   otras palabras: «actualizada hace N días» en vez de «N días en X». La
--   distinción importa: una es un hecho del sistema y la otra una fecha que
--   escribió una persona.
--
-- Idempotente. Ejecutar SIEMPRE con charset utf8mb4:
--   mysql --default-character-set=utf8mb4 -u root -p < db/13_tiempo_en_estado.sql
-- =====================================================================
SET NAMES utf8mb4;
USE iniciativas_legislativas;

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
    (SELECT COUNT(*) FROM historial_iniciativa h WHERE h.iniciativa_id = i.id) AS total_movimientos,
    -- Desde cuándo está en el estado actual. Solo cuentan los movimientos
    -- que cambian el estado: 'acotar' y 'edicion' no mueven el trámite.
    (SELECT MAX(h2.creado_en)
       FROM historial_iniciativa h2
      WHERE h2.iniciativa_id = i.id
        AND h2.tipo NOT IN ('acotar','edicion')) AS desde_estado
  FROM iniciativas i
  LEFT JOIN estados e            ON e.id = i.estado_id
  LEFT JOIN estado_visibilidad v ON v.estado_id = i.estado_id
  WHERE i.activo = TRUE
    AND (p_direccion_id IS NULL OR i.direccion_id = p_direccion_id)
  ORDER BY i.id DESC;
END$$
DELIMITER ;

INSERT INTO schema_version (version, descripcion) VALUES
  (13, 'El listado informa desde cuándo cada iniciativa está en su estado actual')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);
