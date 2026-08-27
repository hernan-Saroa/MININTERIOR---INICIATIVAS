#!/usr/bin/env node
// ---------------------------------------------------------------------
// Alta de la cuenta con la que se administra el sistema.
//
//   SUPERADMIN_CORREO=...  SUPERADMIN_NOMBRE=...  node scripts/crear_superadmin.js
//   node scripts/crear_superadmin.js --reiniciar-clave
//   node scripts/crear_superadmin.js --conceder-todos-los-permisos
//
// Tres cosas que traía y por qué se cambiaron:
//
// **La contraseña estaba escrita en claro aquí** —la misma que usaba el
// guion de siembra— y se reescribía en cada ejecución, así que volver a
// correrlo devolvía en silencio la clave publicada en el árbol de
// trabajo. Ahora se genera al azar, se muestra UNA vez y la cuenta nace
// obligada a cambiarla. Si existe, no se toca salvo `--reiniciar-clave`.
//
// **Concedía TODOS los permisos al rol Administrador.** De ahí viene que
// ese rol tenga hoy `iniciativas.ver_proponente`, que el diseño acordado
// con el Viceministerio le niega expresamente: administrar cuentas y
// roles no es atender casos, y no necesita saber quién radicó un trámite
// de consulta previa. Ahora solo concede lo que hace falta para
// administrar, y ampliarlo exige pedirlo: `--conceder-todos-los-permisos`.
//
// **Escribía `rol = 'viceministro'` junto a `rol_id = 5` (Administrador).**
// Dos verdades en la misma fila, y mientras la autorización se resolvía
// con la columna vieja, esta cuenta escribía con permisos de viceministro.
// El ENUM no admite 'administrador', así que las cuentas NUEVAS nacen con
// 'lector', el valor más restrictivo, por si algún día alguien vuelve a
// leer esa columna por descuido. En una cuenta que ya existe no se toca:
// reescribirla cambiaría un dato ajeno sin que nadie lo haya pedido.
// ---------------------------------------------------------------------
require('dotenv').config();
const crypto = require('node:crypto');
const pool = require('../db');
const { hashear } = require('../auth/contrasena');

const REINICIAR = process.argv.includes('--reiniciar-clave');
const TODOS_LOS_PERMISOS = process.argv.includes('--conceder-todos-los-permisos');

const CORREO = process.env.SUPERADMIN_CORREO;
const NOMBRE = process.env.SUPERADMIN_NOMBRE || 'Administrador del sistema';

// Lo que necesita quien administra el sistema. Deliberadamente NO incluye
// `iniciativas.ver_proponente` ni `flujo.mover`: administrar no es
// atender el trámite. Si el Viceministerio decide otra cosa, se cambia
// desde /admin/roles, que es donde corresponde.
const PERMISOS_DE_ADMINISTRACION = [
  'iniciativas.ver', 'iniciativas.ver_todas',
  'flujo.ver_historial', 'flujo.configurar',
  'usuarios.ver', 'usuarios.administrar', 'usuarios.aprobar',
  'roles.administrar', 'estadisticas.ver',
];

function claveNueva() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const digitos = '23456789';
  const letras = Array.from({ length: 12 },
    () => alfabeto[crypto.randomInt(alfabeto.length)]).join('');
  const numeros = Array.from({ length: 4 },
    () => digitos[crypto.randomInt(digitos.length)]).join('');
  return letras + numeros;
}

async function crearSuperadmin() {
  if (!CORREO) {
    console.error('\nFalta el correo. Este guion ya no trae ninguno escrito dentro:');
    console.error('  SUPERADMIN_CORREO=persona@mininterior.gov.co node scripts/crear_superadmin.js\n');
    process.exitCode = 1;
    return;
  }

  await pool.query('SET NAMES utf8mb4');

  const [rolesAdmin] = await pool.query(
    "SELECT id FROM roles WHERE clave = 'administrador' AND activo = TRUE LIMIT 1");
  if (!rolesAdmin.length) {
    console.error('\nNo existe el rol «administrador». Aplique las migraciones primero.\n');
    process.exitCode = 1;
    return;
  }
  const rolId = rolesAdmin[0].id;

  // 1. Permisos del rol
  const claves = TODOS_LOS_PERMISOS ? null : PERMISOS_DE_ADMINISTRACION;
  const [permisos] = claves
    ? await pool.query(
        `SELECT id, clave FROM permisos WHERE clave IN (${claves.map(() => '?').join(',')})`,
        claves)
    : await pool.query('SELECT id, clave FROM permisos');

  for (const p of permisos) {
    await pool.query('INSERT IGNORE INTO rol_permisos (rol_id, permiso_id) VALUES (?, ?)',
      [rolId, p.id]);
  }
  console.log(`✓ Rol Administrador (id ${rolId}): ${permisos.length} permisos asegurados.`);
  if (TODOS_LOS_PERMISOS) {
    console.log('  ATENCIÓN: se concedieron TODOS los permisos del catálogo, incluido');
    console.log('  iniciativas.ver_proponente. El diseño acordado se lo niega a este rol.');
  }

  // 2. La cuenta
  const [existe] = await pool.query(
    'SELECT id, contrasena_hash FROM usuarios WHERE correo = ?', [CORREO]);
  const sinClave = existe.length > 0 && existe[0].contrasena_hash === null;
  const aplicaClave = existe.length === 0 || sinClave || REINICIAR;
  const clave = claveNueva();

  if (existe.length > 0) {
    await pool.query(
      // `rol`, la columna vieja, NO se toca en una cuenta que ya existe.
      // Ya no autoriza nada, así que reescribirla solo cambiaría un dato
      // ajeno sin pedirlo. Para las cuentas nuevas se pone en 'lector',
      // que es el valor más restrictivo, porque el ENUM no admite
      // 'administrador' y dejarlo en 'viceministro' —lo que hacía antes—
      // es lo que producía filas diciendo dos cosas distintas.
      `UPDATE usuarios SET
         nombre = ?,
         rol_id = ?,
         activo = TRUE,
         pendiente_aprobacion = FALSE,
         debe_cambiar = IF(?, TRUE, debe_cambiar),
         contrasena_hash = IF(?, ?, contrasena_hash)
       WHERE correo = ?`,
      [NOMBRE, rolId, aplicaClave, aplicaClave, await hashear(clave), CORREO]
    );
    console.log(`✓ Cuenta existente actualizada como administradora: ${CORREO}`);
  } else {
    await pool.query(
      `INSERT INTO usuarios
         (nombre, correo, contrasena_hash, direccion_id, rol, rol_id, activo, debe_cambiar, pendiente_aprobacion)
       VALUES (?, ?, ?, NULL, 'lector', ?, TRUE, TRUE, FALSE)`,
      [NOMBRE, CORREO, await hashear(clave), rolId]
    );
    console.log(`✓ Cuenta administradora creada: ${CORREO}`);
  }

  if (aplicaClave) {
    console.log('');
    console.log('  CONTRASEÑA PROVISIONAL — se muestra UNA sola vez:');
    console.log('    ' + clave);
    console.log('');
    console.log('  Cámbiela en el primer ingreso. Hasta entonces la cuenta puede');
    console.log('  consultar pero no modificar información.');
    console.log('');
  } else {
    console.log('  La contraseña existente NO se tocó. Para reiniciarla: --reiniciar-clave');
  }

  // 3. Qué quedó
  const [usuario] = await pool.query('SELECT id FROM usuarios WHERE correo = ?', [CORREO]);
  const [efectivos] = await pool.query('CALL sp_permisos_de_usuario(?)', [usuario[0].id]);
  console.log(`✓ Permisos efectivos (${efectivos[0].length}): `
    + efectivos[0].map((p) => p.clave).join(', '));

  await pool.end();
}

crearSuperadmin().catch((err) => {
  console.error('Error al crear la cuenta administradora:', err.message);
  process.exit(1);
});
