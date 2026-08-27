// ---------------------------------------------------------------------
// Middlewares de autenticación y autorización.
// ---------------------------------------------------------------------
const pool = require('../db');

function requiereSesion(req, res, next) {
  if (!req.session || !req.session.usuario) {
    return res.status(401).json({ error: 'Sesión no iniciada' });
  }
  if (req.session.usuario.debe_cambiar && req.path !== '/auth/cambiar-contrasena') {
    return res.status(403).json({
      error: 'Debe cambiar su contraseña antes de continuar',
      codigo: 'CAMBIO_REQUERIDO'
    });
  }
  req.usuario = req.session.usuario;
  next();
}

// ---------------------------------------------------------------------
// La sesión era una foto del momento del ingreso
//
// `usuarios.activo` se consultaba EXCLUSIVAMENTE en /auth/ingresar, y la
// cookie es `rolling` con ocho horas: cada petición la renueva, así que
// una sesión en uso no caduca nunca. Consecuencia: retirar el acceso a
// alguien que deja el Ministerio no era posible ni por SQL directo —poner
// `activo = 0` no expulsaba la sesión abierta— y seguía escribiendo y
// exportando el CSV. Lo mismo con bajarle el rol o cambiarle la
// dirección: `puedeEscribir` y `mismaDireccion` leían la copia congelada.
//
// Ahora se revalida contra la base, con la misma caché corta que los
// permisos para no pagar una consulta por petición.
//
// Si la base no responde se conserva la sesión y se deja constancia en el
// registro. Es deliberado: `identifica` no autoriza nada —eso lo hacen
// `tienePermiso` y `puedeEscribir`, que resuelven contra la base y fallan
// cerrados—, así que caer aquí solo tumbaría también la consulta pública
// del ciudadano durante una caída de MySQL.
async function estadoDe(usuarioId) {
  const guardado = cacheEstado.get(usuarioId);
  if (guardado && guardado.expira > Date.now()) return guardado.estado;

  const [filas] = await pool.query('CALL sp_estado_de_usuario(?)', [usuarioId]);
  const estado = filas[0][0] || null;
  cacheEstado.set(usuarioId, { estado, expira: Date.now() + VIDA_CACHE_MS });
  return estado;
}

// Publica la identidad sin exigirla. Se monta antes que todo lo demás
// para que req.usuario exista siempre que haya sesión, incluso en las
// rutas de consulta que están abiertas al ciudadano. Sin esto,
// req.usuario era undefined en toda la API y cualquier guarda que lo
// leyera reventaba con un 500 en vez de responder 401.
async function identifica(req, res, next) {
  if (!req.session || !req.session.usuario) return next();

  try {
    const estado = await estadoDe(req.session.usuario.id);

    // Cuenta borrada o desactivada: la sesión deja de valer aquí mismo.
    if (!estado || !estado.activo) {
      return req.session.destroy(() => next());
    }

    // Lo que puede haber cambiado desde el ingreso se refresca. El nombre
    // y el correo no: no los usa ninguna guarda.
    req.session.usuario.debe_cambiar = !!estado.debe_cambiar;
    req.session.usuario.pendiente_aprobacion = !!estado.pendiente_aprobacion;
    req.session.usuario.direccion_id = estado.direccion_id;
    req.session.usuario.rol_id = estado.rol_id;
    req.session.usuario.rol = estado.rol;
    if (estado.rol_nombre) req.session.usuario.rol_nombre = estado.rol_nombre;
  } catch (err) {
    console.error('[sesion] no se pudo revalidar contra la base:', err.message);
  }

  req.usuario = req.session.usuario;
  next();
}

const SOLO_LECTURA = new Set(['GET', 'HEAD', 'OPTIONS']);

// Quién puede escribir lo decide un PERMISO, no la columna vieja.
//
// Esto autorizaba con `usuarios.rol`, el ENUM de la fase 2. Y
// `sp_asignar_rol` solo escribe `rol_id`, así que las dos cosas se
// separaban en cuanto alguien tocaba un rol desde /admin: en la base
// viva las dos cuentas administradoras tenían rol_id = administrador y
// la columna decía 'viceministro', de modo que escribían con permisos
// de viceministro. Al revés es peor: bajar a alguien a Lector desde la
// pantalla no le quitaba la escritura, porque la columna seguía
// diciendo 'editor'. Una revocación que no revoca.
//
// La columna sigue existiendo para poder volver atrás, y la migración
// 14 la mantiene alineada, pero ya no decide nada.
async function puedeEscribir(req, res, next) {
  try {
    if (SOLO_LECTURA.has(req.method)) return next();
    // Sin sesión no se escribe. Se responde antes de leer el rol: era el
    // punto exacto donde toda escritura devolvía 500 en vez de 401.
    if (!req.usuario) {
      return res.status(401).json({ error: 'Inicie sesión para modificar información' });
    }
    // Con contraseña provisional se puede consultar, pero no escribir.
    // `requiereSesion` ya impone esto donde está montado (/api/admin y
    // reportes); aquí hace falta repetirlo porque las rutas de escritura del
    // tablero usan `identifica`, que solo publica la identidad.
    if (req.usuario.debe_cambiar) {
      return res.status(403).json({
        error: 'Cambie su contraseña provisional antes de modificar información',
        codigo: 'CAMBIO_REQUERIDO'
      });
    }
    const claves = await permisosDe(req.usuario.id);
    if (!claves.has('iniciativas.editar') && !claves.has('iniciativas.crear')) {
      return res.status(403).json({ error: 'Su rol no permite modificar información' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

// Ver y editar más allá de la propia dirección es el permiso
// `iniciativas.ver_todas`, que ya está en el catálogo y lo tienen
// director y viceministro. Antes se comparaba contra los nombres de rol
// escritos a mano, así que un rol NUEVO creado desde /admin —por
// ejemplo «Secretaría Jurídica»— quedaba encerrado en su dirección
// aunque se le marcara ese permiso.
async function mismaDireccion(usuario, direccionId) {
  const claves = await permisosDe(usuario.id);
  if (claves.has('iniciativas.ver_todas')) return true;
  return usuario.direccion_id === direccionId;
}

// Para PUT y DELETE la dirección no viene en el cuerpo: hay que consultarla.
async function puedeEditarIniciativa(req, res, next) {
  try {
    if (SOLO_LECTURA.has(req.method)) return next();
    const [filas] = await pool.query('CALL sp_direccion_de_iniciativa(?)', [req.params.id]);
    const registro = filas[0][0];
    if (!registro) return res.status(404).json({ error: 'La iniciativa no existe' });
    if (!(await mismaDireccion(req.usuario, registro.direccion_id))) {
      return res.status(403).json({ error: 'La iniciativa pertenece a otra dirección' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// Permisos.
//
// Se resuelven contra la BASE, no contra la lista que viaja en la sesión.
// La diferencia importa: si un administrador le quita un permiso a un rol,
// quien tenga sesión abierta seguiría usándolo hasta cerrarla, porque la
// lista se copió al ingresar. Con roles editables desde pantalla eso es
// una revocación que no revoca.
//
// Para no consultar en cada petición hay una caché pequeña por usuario,
// con vida corta. `invalidarPermisos()` la vacía cuando cambia algo de
// roles o permisos, así que un cambio se aplica de inmediato.
// ---------------------------------------------------------------------
const VIDA_CACHE_MS = 30 * 1000;
const cachePermisos = new Map();
const cacheEstado = new Map();

function invalidarPermisos() {
  cachePermisos.clear();
  // El estado de la cuenta se vacía con lo mismo: un cambio de rol o una
  // desactivación pasan por aquí, y dejar la foto vieja treinta segundos
  // más es justo lo que se está corrigiendo.
  cacheEstado.clear();
}

async function permisosDe(usuarioId) {
  const guardado = cachePermisos.get(usuarioId);
  if (guardado && guardado.expira > Date.now()) return guardado.claves;

  const [filas] = await pool.query('CALL sp_permisos_de_usuario(?)', [usuarioId]);
  const claves = new Set(filas[0].map((f) => f.clave));
  cachePermisos.set(usuarioId, { claves, expira: Date.now() + VIDA_CACHE_MS });
  return claves;
}

// Fábrica: tienePermiso('roles.administrar') devuelve el middleware.
//
// Existía un import de `tienePermiso` en rutas/admin.js que nunca se
// escribió, así que las diecisiete rutas de administración quedaron sin
// ninguna comprobación: cualquiera con sesión podía asignarse el rol que
// quisiera o cambiar el alcance de un estado.
function tienePermiso(...requeridos) {
  return async function comprobar(req, res, next) {
    try {
      if (!req.usuario) {
        return res.status(401).json({ error: 'Sesión no iniciada' });
      }
      const claves = await permisosDe(req.usuario.id);
      if (requeridos.some((c) => claves.has(c))) return next();

      // El mensaje no enumera los permisos que faltan: quien no los tiene
      // tampoco necesita saber cómo se llaman.
      return res.status(403).json({
        error: 'Su rol no le permite realizar esta acción. '
             + 'Si necesita acceso, solicítelo a un administrador.'
      });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  identifica, requiereSesion, puedeEscribir, mismaDireccion, puedeEditarIniciativa,
  tienePermiso, invalidarPermisos, permisosDe
};
