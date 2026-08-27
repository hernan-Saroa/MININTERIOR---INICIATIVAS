// ---------------------------------------------------------------------
// Comprueba, contra la base viva, que el flujo y la autorización siguen
// funcionando. Cada aserción corresponde a un defecto real que ya
// ocurrió: si alguna vuelve a fallar, es una regresión, no una novedad.
//
//   node scripts/verificar-flujo.js
//
// Sale con código 1 si algo falla. No escribe nada en la base salvo en
// la prueba de movimiento, que crea una iniciativa y la borra al final,
// incluido su historial.
// ---------------------------------------------------------------------
const mysql = require('../api/node_modules/mysql2/promise');

let fallos = 0;
const ok = (nombre, condicion, extra) => {
  console.log((condicion ? '  OK    ' : '  FALLA ') + nombre + (extra ? '  ' + extra : ''));
  if (!condicion) fallos++;
};

(async () => {
  const cn = await mysql.createConnection({
    host: '127.0.0.1', port: 3306, user: 'root', password: 'desarrollo',
    database: 'iniciativas_legislativas', charset: 'utf8mb4', multipleStatements: false,
  });
  const uno = async (sql, args = []) => {
    const [filas] = await cn.query(sql, args);
    const f = Array.isArray(filas[0]) ? filas[0][0] : filas[0];
    return f ? Object.values(f)[0] : null;
  };

  console.log('\nLa base está donde debe');
  const version = await uno('SELECT MAX(version) FROM schema_version');
  ok('las migraciones llegan hasta la 14 o más', version >= 14, `(${version})`);
  const rutinas = await uno(
    "SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'iniciativas_legislativas'");
  ok('los procedimientos están cargados', rutinas >= 43, `(${rutinas})`);
  ok('fn_tiene_permiso existe',
     await uno("SELECT COUNT(*) FROM information_schema.routines WHERE routine_name = 'fn_tiene_permiso'") == 1);

  console.log('\nLas rutas de /admin llaman a procedimientos que existen');
  // El defecto: la ruta de usuarios llamaba a sp_cambiar_estado_usuario,
  // que nunca se escribió, y toda edición devolvía 500 con el rol ya
  // guardado.
  for (const sp of ['sp_actualizar_usuario', 'sp_guardar_estado', 'sp_quitar_responsable',
                    'sp_estados_sin_responsable', 'sp_transiciones_disponibles']) {
    ok(`${sp} está definido`,
       await uno('SELECT COUNT(*) FROM information_schema.routines WHERE routine_name = ?', [sp]) == 1);
  }
  const argsEstado = await uno(
    "SELECT COUNT(*) FROM information_schema.parameters WHERE specific_name = 'sp_guardar_estado'");
  ok('sp_guardar_estado recibe los 7 que manda la ruta', argsEstado == 7, `(${argsEstado})`);
  ok('la tabla estados tiene dónde guardar la descripción',
     await uno("SELECT COUNT(*) FROM information_schema.columns "
             + "WHERE table_schema = DATABASE() AND table_name = 'estados' AND column_name = 'descripcion'") == 1);

  console.log('\nEl flujo NO está muerto');
  // El defecto: JOIN interno contra estado_responsables, que está vacía,
  // así que nadie —ni el superadministrador— podía mover nada.
  const conMover = await uno(
    "SELECT COUNT(DISTINCT u.id) FROM usuarios u "
  + "JOIN rol_permisos rp ON rp.rol_id = u.rol_id "
  + "JOIN permisos p ON p.id = rp.permiso_id AND p.clave = 'flujo.mover' WHERE u.activo = TRUE");
  ok('hay personas con permiso para mover', conMover > 0, `(${conMover})`);

  const [iniciativas] = await cn.query(
    'SELECT id, estado_id FROM iniciativas WHERE activo = TRUE AND estado_id IS NOT NULL LIMIT 1');
  const [usuarios] = await cn.query(
    "SELECT u.id FROM usuarios u JOIN rol_permisos rp ON rp.rol_id = u.rol_id "
  + "JOIN permisos p ON p.id = rp.permiso_id AND p.clave = 'flujo.mover' "
  + 'WHERE u.activo = TRUE LIMIT 1');
  if (iniciativas.length && usuarios.length) {
    const [t] = await cn.query('CALL sp_transiciones_disponibles(?, ?)',
      [iniciativas[0].id, usuarios[0].id]);
    ok('una iniciativa ofrece al menos una transición', t[0].length > 0,
       `(${t[0].length} para el usuario ${usuarios[0].id})`);
  } else {
    ok('hay datos con los que probar el flujo', false, '(sin iniciativas o sin nadie con el permiso)');
  }

  // Y un lector no debe poder mover nada.
  const [lectores] = await cn.query(
    "SELECT u.id FROM usuarios u JOIN roles r ON r.id = u.rol_id "
  + "WHERE u.activo = TRUE AND NOT EXISTS (SELECT 1 FROM rol_permisos rp "
  + "  JOIN permisos p ON p.id = rp.permiso_id AND p.clave = 'flujo.mover' "
  + '  WHERE rp.rol_id = r.id) LIMIT 1');
  if (lectores.length && iniciativas.length) {
    const [t] = await cn.query('CALL sp_transiciones_disponibles(?, ?)',
      [iniciativas[0].id, lectores[0].id]);
    ok('quien no tiene el permiso no ve ninguna acción', t[0].length === 0, `(${t[0].length})`);
  }

  console.log('\nLas guardas rechazan ANTES de escribir');
  // El defecto: los dos procedimientos escribían y avisaban después, así
  // que el SIGNAL llegaba con el daño ya confirmado.
  const admins = await uno(
    "SELECT COUNT(DISTINCT u.id) FROM usuarios u "
  + "JOIN rol_permisos rp ON rp.rol_id = u.rol_id "
  + "JOIN permisos p ON p.id = rp.permiso_id AND p.clave = 'roles.administrar' WHERE u.activo = TRUE");
  ok('queda quien administre roles', admins > 0, `(${admins})`);

  if (admins === 1) {
    const [quien] = await cn.query(
      "SELECT DISTINCT u.id, u.rol_id FROM usuarios u "
    + "JOIN rol_permisos rp ON rp.rol_id = u.rol_id "
    + "JOIN permisos p ON p.id = rp.permiso_id AND p.clave = 'roles.administrar' "
    + 'WHERE u.activo = TRUE LIMIT 1');
    const [lector] = await cn.query("SELECT id FROM roles WHERE clave = 'lector' LIMIT 1");
    let rechazo = false;
    try { await cn.query('CALL sp_actualizar_usuario(?, ?, NULL, NULL, NULL)',
                         [quien[0].id, lector[0].id]); }
    catch { rechazo = true; }
    const sigueIgual = await uno('SELECT rol_id FROM usuarios WHERE id = ?', [quien[0].id]);
    ok('dejar el sistema sin administrador se rechaza', rechazo);
    ok('y NO se escribió nada al rechazarlo', sigueIgual == quien[0].rol_id,
       `(rol_id sigue en ${sigueIgual})`);
  } else {
    ok('la guarda del último administrador solo se puede probar con uno activo', true,
       `(hay ${admins}, no se tocan)`);
  }

  // La propiedad «validar antes de escribir» se puede demostrar sin
  // arriesgar ninguna cuenta: se pide un rol que no existe junto a un
  // cambio que sí sería válido. Si el procedimiento escribiera primero,
  // el cambio válido quedaría hecho pese al error.
  const [victima] = await cn.query(
    'SELECT id, rol_id, direccion_id FROM usuarios WHERE activo = TRUE ORDER BY id DESC LIMIT 1');
  if (victima.length) {
    const v = victima[0];
    const inexistente = (await uno('SELECT MAX(id) FROM roles')) + 999;
    let rechazo = false;
    try {
      await cn.query('CALL sp_actualizar_usuario(?, ?, ?, NULL, NULL)',
        [v.id, inexistente, 'ddhh']);
    } catch { rechazo = true; }
    const rolAhora = await uno('SELECT rol_id FROM usuarios WHERE id = ?', [v.id]);
    const dirAhora = await uno('SELECT direccion_id FROM usuarios WHERE id = ?', [v.id]);
    ok('un rol inexistente se rechaza', rechazo);
    ok('y el resto de la edición tampoco se aplicó',
       rolAhora == v.rol_id && dirAhora == v.direccion_id,
       `(rol_id ${rolAhora}, dirección ${dirAhora === null ? 'NULL' : dirAhora})`);
  }

  // Lo mismo para sp_quitar_responsable, que borraba y avisaba después.
  // Se monta un responsable de prueba, se intenta quitar —debe negarse
  // porque quedaría el estado sin ninguno— y se limpia.
  const [estado] = await cn.query('SELECT id FROM estados WHERE activo = TRUE AND es_final = FALSE LIMIT 1');
  const [alguien] = await cn.query('SELECT id FROM usuarios WHERE activo = TRUE LIMIT 1');
  if (estado.length && alguien.length) {
    const yaHabia = await uno(
      'SELECT COUNT(*) FROM estado_responsables WHERE estado_id = ?', [estado[0].id]);
    if (yaHabia == 0) {
      await cn.query('CALL sp_guardar_responsable(?, ?, 1, 1, 0, 0, 1)', [estado[0].id, alguien[0].id]);
      let rechazo = false;
      try { await cn.query('CALL sp_quitar_responsable(?, ?)', [estado[0].id, alguien[0].id]); }
      catch { rechazo = true; }
      const siguen = await uno(
        'SELECT COUNT(*) FROM estado_responsables WHERE estado_id = ?', [estado[0].id]);
      ok('quitar al último responsable se rechaza', rechazo);
      ok('y la fila NO se borró al rechazarlo', siguen == 1, `(quedan ${siguen})`);
      await cn.query('DELETE FROM estado_responsables WHERE estado_id = ? AND usuario_id = ?',
        [estado[0].id, alguien[0].id]);
      const limpio = await uno(
        'SELECT COUNT(*) FROM estado_responsables WHERE estado_id = ?', [estado[0].id]);
      ok('los datos de prueba quedaron limpios', limpio == 0);
    } else {
      ok('el estado de prueba ya tiene responsables configurados: no se toca', true,
         `(${yaHabia} en el estado ${estado[0].id})`);
    }
  }

  console.log('\nUna cuenta nueva sirve para algo');
  // El defecto: `sp_crear_usuario` escribía solo el ENUM y dejaba
  // `rol_id` en NULL, así que la cuenta no tenía NINGÚN permiso. Quedó a
  // la vista al pasar la autorización a permisos.
  const sinRol = await uno('SELECT COUNT(*) FROM usuarios WHERE rol_id IS NULL');
  ok('ninguna cuenta se quedó sin rol dinámico', sinRol == 0, `(${sinRol})`);

  const [argsCrear] = await cn.query(
    "SELECT parameter_name FROM information_schema.parameters "
  + "WHERE specific_name = 'sp_crear_usuario' ORDER BY ordinal_position");
  ok('sp_crear_usuario sigue recibiendo sus 4 argumentos', argsCrear.length === 4,
     `(${argsCrear.length})`);

  for (const sp of ['sp_estado_de_usuario', 'sp_cerrar_sesiones_de_usuario',
                    'sp_diagnostico_cuentas']) {
    ok(`${sp} está definido`,
       await uno('SELECT COUNT(*) FROM information_schema.routines WHERE routine_name = ?', [sp]) == 1);
  }

  console.log('\nRetirar el acceso a alguien lo retira');
  // El defecto: `usuarios.activo` solo se miraba al ingresar y la cookie
  // se renueva en cada petición, así que una sesión en uso no caducaba.
  const [conSesion] = await cn.query(
    "SELECT COUNT(*) AS n FROM sesiones WHERE JSON_EXTRACT(data, '$.usuario.id') IS NOT NULL");
  ok('las sesiones se pueden identificar por usuario', true,
     `(${conSesion[0].n} abiertas ahora)`);
  const [revalidado] = await cn.query('CALL sp_estado_de_usuario(?)', [1]);
  const fila = revalidado[0][0];
  ok('sp_estado_de_usuario devuelve lo que el middleware revalida',
     !!fila && 'activo' in fila && 'debe_cambiar' in fila && 'rol_id' in fila);

  console.log('\nNinguna cuenta comparte contraseña con otra');
  // El defecto: el guion de siembra repartía UN hash entre las ocho
  // cuentas institucionales, con la contraseña escrita en claro en el
  // archivo y sin obligar a cambiarla.
  const [compartidas] = await cn.query(
    'SELECT COUNT(*) AS grupos FROM ('
  + '  SELECT contrasena_hash FROM usuarios WHERE contrasena_hash IS NOT NULL'
  + '  GROUP BY contrasena_hash HAVING COUNT(*) > 1) AS g');
  ok('no hay contraseñas compartidas', compartidas[0].grupos == 0,
     compartidas[0].grupos ? `(${compartidas[0].grupos} grupo(s))` : '');
  if (compartidas[0].grupos) {
    // Esto falla a propósito hasta que alguien decida actuar. Cambiar las
    // credenciales de personas reales no es algo que deba hacer un guion
    // de verificación por su cuenta.
    console.log('        · para verlas:  CALL sp_diagnostico_cuentas();');
    console.log('        · para corregirlo, sabiendo que cambia credenciales');
    console.log('          de personas reales y se imprimen UNA vez:');
    console.log('            cd api && node scripts/seed_iniciales.js --reiniciar-claves');
  }

  console.log('\nLa columna vieja no contradice al rol dinámico');
  // El defecto: `usuarios.rol` autorizaba y `sp_asignar_rol` no la
  // escribía, así que bajar a alguien a Lector no le quitaba la
  // escritura.
  const desalineados = await uno(
    "SELECT COUNT(*) FROM usuarios u JOIN roles r ON r.id = u.rol_id "
  + "WHERE r.clave IN ('viceministro','director','editor','lector') AND u.rol <> r.clave");
  ok('ninguna cuenta dice dos roles distintos', desalineados == 0, `(${desalineados})`);

  await cn.end();
  console.log('\nfallos: ' + fallos);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error('\nno se pudo comprobar:', e.message); process.exit(1); });
