require('dotenv').config();
const pool = require('../db');

async function fix() {
  await pool.query('SET NAMES utf8mb4');
  await pool.query(`ALTER TABLE iniciativas MODIFY COLUMN estado ENUM('En formulación','Radicado','En comisión','Aprobado','Archivado') NOT NULL DEFAULT 'En formulación'`);
  console.log('✓ Columna estado corregida con UTF-8');
  await pool.end();
}

fix().catch(err => {
  console.error(err);
  process.exit(1);
});
