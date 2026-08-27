require('dotenv').config();
const mysql = require('mysql2/promise');

async function actualizarOrden() {
  const rootPool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: 'root',
    password: process.env.DB_PASSWORD || 'desarrollo',
    database: process.env.DB_NAME || 'iniciativas_legislativas',
    charset: 'utf8mb4'
  });

  await rootPool.query('SET NAMES utf8mb4');
  await rootPool.query('DROP PROCEDURE IF EXISTS sp_listar_iniciativas');
  await rootPool.query(`
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
    END
  `);
  console.log('✓ sp_listar_iniciativas actualizado con root: orden cronológico descendente (último creado arriba)');
  await rootPool.end();
}

actualizarOrden().catch(err => {
  console.error(err);
  process.exit(1);
});
