// ---------------------------------------------------------------------
// Aplica las migraciones de db/ en orden.
//
// Antes aplicaba SIEMPRE los trece archivos, y eso tiene un efecto que
// nadie había medido: las migraciones 03, 06 y 07 siembran direcciones,
// roles, permisos, estados y transiciones con ON DUPLICATE KEY UPDATE.
// Reejecutarlas es inofensivo en una base recién instalada, pero en una
// que lleva meses en uso REVIERTE lo que se haya configurado desde
// /admin: si alguien renombró un estado o le cambió el color, vuelve al
// valor de fábrica sin avisar.
//
// Ahora se aplica solo lo que falta, según `schema_version`. Para
// reconstruir a propósito —una instalación nueva sobre una base sucia—
// está `--forzar`.
//
//   node scripts/aplicar-migraciones.js
//   node scripts/aplicar-migraciones.js --forzar
// ---------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const mysql = require('../api/node_modules/mysql2/promise');

const FORZAR = process.argv.includes('--forzar');

(async () => {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'desarrollo',
    multipleStatements: true,
    charset: 'utf8mb4'
  });

  console.log('Conectado a MySQL root. Aplicando SET NAMES utf8mb4...');
  await connection.query('SET NAMES utf8mb4');
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');

  // Hasta dónde está aplicada la base. Si la tabla no existe todavía es
  // una instalación nueva y hay que aplicarlo todo.
  let aplicadaHasta = 0;
  if (!FORZAR) {
    try {
      const [filas] = await connection.query(
        'SELECT MAX(version) AS v FROM iniciativas_legislativas.schema_version'
      );
      aplicadaHasta = filas[0].v || 0;
    } catch {
      aplicadaHasta = 0;
    }
  }

  const archivos = fs.readdirSync(path.join(__dirname, '../db'))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let aplicados = 0;
  let omitidos = 0;
  for (const f of archivos) {
    // El número del nombre es la versión: 09_flujo_al_crear.sql -> 9.
    const version = parseInt(f.slice(0, 2), 10);
    if (!FORZAR && Number.isInteger(version) && version <= aplicadaHasta) {
      omitidos++;
      continue;
    }
    console.log(' -> Aplicando:', f);
    const sql = fs.readFileSync(path.join(__dirname, '../db', f), 'utf8');
    await connection.query(sql);
    aplicados++;
  }

  await connection.query('SET FOREIGN_KEY_CHECKS = 1');

  // Asegurar permisos para iniciativas_app
  await connection.query(`
    GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE
      ON iniciativas_legislativas.* TO 'iniciativas_app'@'%';
    FLUSH PRIVILEGES;
  `);

  const [filas] = await connection.query(
    'SELECT MAX(version) AS v FROM iniciativas_legislativas.schema_version'
  );

  console.log('');
  if (omitidos) console.log(`  ${omitidos} ya estaban aplicadas y se omitieron.`);
  console.log(`  ${aplicados} aplicadas ahora.`);
  console.log(`\n✓ La base queda en la versión ${filas[0].v}.`);
  await connection.end();
})();
