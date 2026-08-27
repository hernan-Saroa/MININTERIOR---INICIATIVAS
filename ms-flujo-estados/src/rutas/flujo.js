// =====================================================================
// Rutas de Administración: usuarios, roles, permisos, estados y flujo
// =====================================================================
const express = require('express');
const pool = require('../db');
const { tienePermiso, invalidarPermisos } = require('../auth/middleware');

const router = express.Router();

// Constancia de cada cambio de configuración. No interrumpe la respuesta
// si falla: es una bitácora, no parte de la operación, y perder el registro
// es menos grave que dejar el cambio a medias. Pero se deja en el log del
// servidor para que no pase inadvertido.
async function dejarConstancia(req, entidad, accion, detalle) {
  try {
    await pool.query('CALL sp_registrar_configuracion(?, ?, ?, ?)',
      [req.usuario.id, entidad, accion, detalle ? JSON.stringify(detalle) : null]);
  } catch (err) {
    console.error('[configuracion] no se pudo registrar la constancia:', err.message);
  }
}

// Dos capas de guarda, y las dos hacen falta:
//
//   1. La SESIÓN se exige en el montaje, en server.js:
//      app.use('/api/admin', requiereSesion, …). No se repite aquí.
//   2. El PERMISO se exige ruta por ruta con tienePermiso(...), abajo.
//      Va en cada ruta y no con router.use porque no todas piden lo
//      mismo: consultar el directorio no es administrar cuentas, y
//      configurar el flujo no es administrar roles.
//
// Este archivo importaba un `tienePermiso` que nunca se escribió, así que
// las diecisiete rutas quedaron sin ninguna comprobación: cualquiera
// podía asignarse un rol o cambiar el alcance de visibilidad de un estado.
//
// Los permisos se resuelven contra la base en cada petición (con caché
// corta), no contra la lista que viaja en la sesión: si un administrador
// revoca un permiso, tiene que aplicarse sin esperar a que la persona
// cierre sesión. Ver auth/middleware.js.
//
// Todo cambio de roles, estados, responsables o visibilidad deja
// constancia con sp_registrar_configuracion: cambiar la visibilidad de un
// estado puede exponer información sin tocar una línea de código, así que
// tiene que quedar quién lo hizo.

// ---------------------------------------------------------------------
// 1. Usuarios
// ---------------------------------------------------------------------

// GET /api/admin/usuarios
router.get('/usuarios', tienePermiso('usuarios.ver'), async (req, res, next) => {
  try {
    const [filas] = await pool.query('CALL sp_listar_usuarios()');
    res.json(filas[0]);
  } catch (err) { next(err); }
});

// PUT /api/admin/usuarios/:id
router.put('/usuarios/:id', tienePermiso('usuarios.administrar'), async (req, res, next) => {
  try {
    const { rol_id, direccion_id, activo, pendiente_aprobacion } = req.body;
    const usuarioId = parseInt(req.params.id, 10);

    // Una sola llamada, no tres. Antes eran tres sentencias sueltas, y la
    // del medio invocaba `sp_cambiar_estado_usuario`, que no existe: toda
    // edición de usuario devolvía 500 con el rol ya guardado y sin
    // constancia. `direccion_id` ni siquiera se leía, así que cambiar de
    // dirección a alguien no hacía nada.
    //
    // Contrato del procedimiento: NULL = no tocar ese campo,
    // '' en direccion_id = dejarlo sin dirección.
    await pool.query('CALL sp_actualizar_usuario(?, ?, ?, ?, ?)', [
      usuarioId,
      rol_id === undefined ? null : parseInt(rol_id, 10),
      direccion_id === undefined ? null : String(direccion_id ?? ''),
      activo === undefined ? null : !!activo,
      pendiente_aprobacion === undefined ? null : !!pendiente_aprobacion,
    ]);

    invalidarPermisos();
    await dejarConstancia(req, 'usuario', 'asignar_rol',
      { usuario_id: usuarioId, rol_id, direccion_id, activo, pendiente_aprobacion });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/admin/usuarios/:id/cerrar-sesiones
//
// Retirar el acceso a alguien no lo retiraba: `usuarios.activo` solo se
// miraba al ingresar y la cookie se renueva en cada petición, así que una
// sesión en uso no caduca. El middleware ya revalida contra la base, pero
// hacía falta además poder cerrar la sesión de otra persona de forma
// explícita y con constancia: hasta ahora el único remedio era entrar al
// contenedor y borrar filas de `sesiones` a mano.
router.post('/usuarios/:id/cerrar-sesiones', tienePermiso('usuarios.administrar'), async (req, res, next) => {
  try {
    const usuarioId = parseInt(req.params.id, 10);
    const [filas] = await pool.query('CALL sp_cerrar_sesiones_de_usuario(?)', [usuarioId]);
    const cerradas = filas[0][0]?.sesiones_cerradas ?? 0;
    invalidarPermisos();
    await dejarConstancia(req, 'usuario', 'cerrar_sesiones',
      { usuario_id: usuarioId, sesiones_cerradas: cerradas });
    res.json({ ok: true, sesiones_cerradas: cerradas });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// 2. Roles y Permisos
// ---------------------------------------------------------------------

// GET /api/admin/permisos
router.get('/permisos', tienePermiso('roles.administrar'), async (req, res, next) => {
  try {
    const [filas] = await pool.query('CALL sp_listar_permisos()');
    res.json(filas[0]);
  } catch (err) { next(err); }
});

// GET /api/admin/roles
router.get('/roles', tienePermiso('roles.administrar'), async (req, res, next) => {
  try {
    const [filas] = await pool.query('CALL sp_listar_roles()');
    const roles = filas[0].map(r => ({
      ...r,
      permisos: r.permisos ? r.permisos.split(',') : []
    }));
    res.json(roles);
  } catch (err) { next(err); }
});

// POST /api/admin/roles
router.post('/roles', tienePermiso('roles.administrar'), async (req, res, next) => {
  try {
    const { nombre, descripcion, permisos } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const listaPermisos = Array.isArray(permisos) ? permisos.join(',') : (permisos || '');
    
    const [filas] = await pool.query(
      'CALL sp_guardar_rol(?, ?, ?, ?)',
      [null, nombre, descripcion || null, listaPermisos]
    );
    invalidarPermisos();
    await dejarConstancia(req, 'rol', 'crear', { id: filas[0][0].id, nombre, permisos });
    res.status(201).json({ id: filas[0][0].id });
  } catch (err) { next(err); }
});

// PUT /api/admin/roles/:id
router.put('/roles/:id', tienePermiso('roles.administrar'), async (req, res, next) => {
  try {
    const { nombre, descripcion, permisos } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const listaPermisos = Array.isArray(permisos) ? permisos.join(',') : (permisos || '');

    const [filas] = await pool.query(
      'CALL sp_guardar_rol(?, ?, ?, ?)',
      [parseInt(req.params.id, 10), nombre, descripcion || null, listaPermisos]
    );
    invalidarPermisos();
    await dejarConstancia(req, 'rol', 'editar',
      { id: parseInt(req.params.id, 10), nombre, permisos });
    res.json({ ok: true, id: filas[0][0].id });
  } catch (err) { next(err); }
});

// DELETE /api/admin/roles/:id
router.delete('/roles/:id', tienePermiso('roles.administrar'), async (req, res, next) => {
  try {
    await pool.query('CALL sp_eliminar_rol(?)', [parseInt(req.params.id, 10)]);
    invalidarPermisos();
    await dejarConstancia(req, 'rol', 'eliminar', { id: parseInt(req.params.id, 10) });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// 3. Estados y Flujo
// ---------------------------------------------------------------------

// GET /api/admin/estados
router.get('/estados', tienePermiso('flujo.configurar'), async (req, res, next) => {
  try {
    const [filas] = await pool.query('CALL sp_listar_estados()');
    res.json(filas[0]);
  } catch (err) { next(err); }
});

// POST /api/admin/estados
router.post('/estados', tienePermiso('flujo.configurar'), async (req, res, next) => {
  try {
    const { nombre, descripcion, color, es_final, orden, visibilidad } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });

    // Siete argumentos en el orden del procedimiento:
    // (id, nombre, descripcion, color, orden, es_final, visibilidad).
    // Antes se mandaban siete contra una firma de seis —la tabla no tenía
    // dónde guardar la descripción que la pantalla pide— y MySQL
    // rechazaba la llamada con 1318: no se podía crear ni editar ningún
    // estado del flujo. La columna la añade la migración 14.
    const [filas] = await pool.query(
      'CALL sp_guardar_estado(?, ?, ?, ?, ?, ?, ?)',
      [null, nombre, descripcion || null, color || 'azul', orden || 0, !!es_final, visibilidad || 'autenticado']
    );
    await dejarConstancia(req, 'estado', 'crear',
      { id: filas[0][0].id, nombre, visibilidad: visibilidad || 'autenticado' });
    res.status(201).json({ id: filas[0][0].id });
  } catch (err) { next(err); }
});

// PUT /api/admin/estados/:id
router.put('/estados/:id', tienePermiso('flujo.configurar'), async (req, res, next) => {
  try {
    const { nombre, descripcion, color, es_final, orden, visibilidad } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });

    const [filas] = await pool.query(
      'CALL sp_guardar_estado(?, ?, ?, ?, ?, ?, ?)',
      [parseInt(req.params.id, 10), nombre, descripcion || null, color || 'azul', orden || 0, !!es_final, visibilidad || 'autenticado']
    );
    // La visibilidad decide quién ve el trámite: se registra siempre.
    await dejarConstancia(req, 'estado', 'editar',
      { id: parseInt(req.params.id, 10), nombre, visibilidad: visibilidad || 'autenticado' });
    res.json({ ok: true, id: filas[0][0].id });
  } catch (err) { next(err); }
});

// DELETE /api/admin/estados/:id
router.delete('/estados/:id', tienePermiso('flujo.configurar'), async (req, res, next) => {
  try {
    await pool.query('CALL sp_desactivar_estado(?)', [parseInt(req.params.id, 10)]);
    await dejarConstancia(req, 'estado', 'desactivar', { id: parseInt(req.params.id, 10) });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/admin/estados/:id/responsables
router.get('/estados/:id/responsables', tienePermiso('flujo.configurar'), async (req, res, next) => {
  try {
    const [filas] = await pool.query(
      `SELECT er.usuario_id, u.nombre, u.correo,
              er.puede_avanzar, er.puede_devolver, er.puede_rechazar, er.puede_cerrar, er.puede_acotar
       FROM estado_responsables er
       JOIN usuarios u ON u.id = er.usuario_id
       WHERE er.estado_id = ?`,
      [parseInt(req.params.id, 10)]
    );
    res.json(filas);
  } catch (err) { next(err); }
});

// PUT /api/admin/estados/:id/responsables/:uid
router.put('/estados/:id/responsables/:uid', tienePermiso('flujo.configurar'), async (req, res, next) => {
  try {
    const estadoId = parseInt(req.params.id, 10);
    const usuarioId = parseInt(req.params.uid, 10);
    const { avanzar, devolver, rechazar, cerrar, acotar } = req.body;

    await pool.query(
      `INSERT INTO estado_responsables (estado_id, usuario_id, puede_avanzar, puede_devolver, puede_rechazar, puede_cerrar, puede_acotar)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         puede_avanzar = VALUES(puede_avanzar),
         puede_devolver = VALUES(puede_devolver),
         puede_rechazar = VALUES(puede_rechazar),
         puede_cerrar = VALUES(puede_cerrar),
         puede_acotar = VALUES(puede_acotar)`,
      [estadoId, usuarioId, !!avanzar, !!devolver, !!rechazar, !!cerrar, !!acotar]
    );
    // Quién puede mover un trámite y en qué estado: se registra siempre.
    await dejarConstancia(req, 'responsable', 'asignar', {
      estado_id: estadoId, usuario_id: usuarioId,
      avanzar: !!avanzar, devolver: !!devolver, rechazar: !!rechazar,
      cerrar: !!cerrar, acotar: !!acotar,
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/admin/estados/:id/responsables/:uid
router.delete('/estados/:id/responsables/:uid', tienePermiso('flujo.configurar'), async (req, res, next) => {
  try {
    // Por el procedimiento, no con un DELETE crudo: lleva dentro la
    // guarda que impide dejar un estado sin ningún responsable activo.
    // Saltársela es lo que permite repetir la avería que dejó las
    // diecisiete iniciativas sin poder moverse.
    await pool.query('CALL sp_quitar_responsable(?, ?)',
      [parseInt(req.params.id, 10), parseInt(req.params.uid, 10)]
    );
    await dejarConstancia(req, 'responsable', 'quitar', {
      estado_id: parseInt(req.params.id, 10), usuario_id: parseInt(req.params.uid, 10),
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/admin/estados/sin-responsable
//
// `sp_estados_sin_responsable()` existía desde la migración 07 para
// alimentar una alerta, y ninguna ruta lo llamaba. Importa saberlo: un
// estado sin responsable ya no detiene el trámite —la migración 14 lo
// cambió— pero sigue siendo una configuración incompleta, y quien
// configura el flujo debe verlo.
router.get('/estados/sin-responsable', tienePermiso('flujo.configurar'), async (req, res, next) => {
  try {
    const [filas] = await pool.query('CALL sp_estados_sin_responsable()');
    res.json(filas[0]);
  } catch (err) { next(err); }
});

// GET /api/admin/estadisticas/flujo
router.get('/estadisticas/flujo', tienePermiso('estadisticas.ver'), async (req, res, next) => {
  try {
    const [filas] = await pool.query('CALL sp_estadisticas_flujo()');
    res.json(filas[0]);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// 4. Configuración General (Interruptor de Aprobación Manual)
// ---------------------------------------------------------------------
let configMemoria = {
  exigir_aprobacion_manual: false
};

// GET /api/admin/configuracion
router.get('/configuracion', tienePermiso('usuarios.administrar'), (req, res) => {
  res.json(configMemoria);
});

// PUT /api/admin/configuracion
router.put('/configuracion', tienePermiso('usuarios.administrar'), async (req, res) => {
  if (req.body.exigir_aprobacion_manual !== undefined) {
    configMemoria.exigir_aprobacion_manual = !!req.body.exigir_aprobacion_manual;
    await dejarConstancia(req, 'configuracion', 'aprobacion_manual',
      { exigir_aprobacion_manual: configMemoria.exigir_aprobacion_manual });
  }
  res.json(configMemoria);
});

module.exports = router;
