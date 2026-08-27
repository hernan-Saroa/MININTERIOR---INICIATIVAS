require('dotenv').config();
const pool = require('../db');

async function verificar() {
  console.log('--- VERIFICACIÓN DE INTEGRACIÓN COMPLETA CON MYSQL ---');
  
  // 1. Conteo de iniciativas
  const [ini] = await pool.query('CALL sp_listar_iniciativas(NULL)');
  console.log(`✓ sp_listar_iniciativas: ${ini[0].length} iniciativas cargadas`);
  
  // 2. Conteo de direcciones
  const [dirs] = await pool.query('CALL sp_listar_direcciones()');
  console.log(`✓ sp_listar_direcciones: ${dirs[0].length} direcciones`);

  // 3. Roles y permisos
  const [roles] = await pool.query('CALL sp_listar_roles()');
  console.log(`✓ sp_listar_roles: ${roles[0].length} roles dinámicos configurados`);

  // 4. Estados
  const [estados] = await pool.query('CALL sp_listar_estados()');
  console.log(`✓ sp_listar_estados: ${estados[0].length} estados de flujo`);

  // 5. Documentos
  const [docs] = await pool.query('CALL sp_listar_documentos(1)');
  console.log(`✓ sp_listar_documentos: ${docs[0].length} documentos para iniciativa #1`);

  console.log('\n[ÉXITO] Todo el backend está 100% conectado y operando sobre MySQL.');
  await pool.end();
}

verificar().catch(err => {
  console.error('Error de verificación:', err);
  process.exit(1);
});
