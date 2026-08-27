#!/usr/bin/env node
// ---------------------------------------------------------------------
// Alta de usuarios desde la consola del servidor.
//   node scripts/crear-usuario.js
// Pide la contraseña sin mostrarla en pantalla y sin dejarla en el
// historial de bash (por eso no se pasa como argumento).
// ---------------------------------------------------------------------
require('dotenv').config();
const readline = require('node:readline');
const pool = require('../db');
const { hashear, validarFortaleza } = require('../auth/contrasena');

// Los roles se leen del CATÁLOGO, no de una lista escrita aquí. Estaba
// fija con los cuatro valores del ENUM viejo, así que no se podía dar de
// alta a nadie como Administrador ni con un rol creado desde /admin
// —«Secretaría Jurídica», por ejemplo—: el guion lo rechazaba como
// inválido. Desde la migración 15 `sp_crear_usuario` también valida
// contra el catálogo, así que las dos puntas coinciden.

function preguntar(rl, texto, oculto = false) {
  return new Promise((resolve) => {
    if (!oculto) return rl.question(texto, resolve);
    const alEscribir = (c) => {
      if (c.toString() !== '\r' && c.toString() !== '\n') rl.output.write('\x1B[2K\x1B[200D' + texto);
    };
    rl.input.on('data', alEscribir);
    rl.question(texto, (valor) => { rl.input.off('data', alEscribir); rl.output.write('\n'); resolve(valor); });
  });
}

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  try {
    const [dirs] = await pool.query('CALL sp_listar_direcciones()');
    const [filasRoles] = await pool.query(
      'SELECT clave FROM roles WHERE activo = TRUE ORDER BY id');
    const ROLES = filasRoles.map((r) => r.clave);

    console.log('\nDirecciones disponibles:');
    dirs[0].forEach(d => console.log(`  ${d.id.padEnd(12)} ${d.nombre_corto}`));
    console.log(`\nRoles: ${ROLES.join(', ')}\n`);

    const nombre = (await preguntar(rl, 'Nombre completo: ')).trim();
    const correo = (await preguntar(rl, 'Correo institucional: ')).trim().toLowerCase();
    const direccion = (await preguntar(rl, 'Id de dirección (vacío = ninguna): ')).trim();
    const rol = (await preguntar(rl, 'Rol [lector]: ')).trim() || 'lector';

    if (!nombre || !correo) throw new Error('Nombre y correo son obligatorios');
    if (!ROLES.includes(rol)) throw new Error(`Rol inválido. Use uno de: ${ROLES.join(', ')}`);
    if (direccion && !dirs[0].some(d => d.id === direccion)) throw new Error('Esa dirección no existe');

    const contrasena = await preguntar(rl, 'Contraseña provisional: ', true);
    const errores = validarFortaleza(contrasena);
    if (errores.length) throw new Error('La contraseña ' + errores.join('; '));

    await pool.query('CALL sp_crear_usuario(?, ?, ?, ?)', [nombre, correo, direccion || null, rol]);
    await pool.query('CALL sp_guardar_contrasena(?, ?, ?)', [correo, await hashear(contrasena), true]);

    console.log(`\n✓ Usuario ${correo} creado con rol ${rol}.`);
    console.log('  Deberá cambiar la contraseña en su primer ingreso.\n');
  } catch (err) {
    console.error('\n✗ ' + err.message + '\n');
    process.exitCode = 1;
  } finally {
    rl.close();
    await pool.end();
  }
})();
