const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { hashear, verificar, gastarTiempo, validarFortaleza } = require('../auth/contrasena');

const router = express.Router();

// Mientras la API no envíe correo, el enlace de recuperación no tiene
// por dónde llegar a su destinatario. Devolverlo en la respuesta HTTP
// convierte la recuperación en una toma de cuenta: cualquiera pide el
// enlace de un correo ajeno y lo recibe en su propia pantalla.
//
// Así que se devuelve solo si el servidor lo autoriza expresamente, y
// nunca por defecto. Para trabajar en local, en el .env:
//   RECUPERACION_ENLACE_EN_RESPUESTA=1
// En producción se deja sin definir y el enlace únicamente se escribe
// en el registro del servidor, hasta que exista envío de correo.
const MOSTRAR_ENLACE = process.env.RECUPERACION_ENLACE_EN_RESPUESTA === '1';

// POST /api/auth/ingresar
router.post('/ingresar', async (req, res, next) => {
  try {
    const correo = String(req.body.correo || '').trim().toLowerCase();
    const contrasena = String(req.body.contrasena || '');
    if (!correo || !contrasena) {
      return res.status(400).json({ error: 'Correo y contraseña son obligatorios' });
    }

    const [filas] = await pool.query('CALL sp_usuario_por_correo(?)', [correo]);
    const usuario = filas[0][0];

    // Mensaje idéntico en todos los casos: no revelamos si el correo existe.
    const GENERICO = { error: 'Correo o contraseña incorrectos' };

    if (!usuario || !usuario.activo) {
      await gastarTiempo();
      return res.status(401).json(GENERICO);
    }
    if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
      return res.status(429).json({ error: 'Cuenta bloqueada temporalmente. Intente en unos minutos.' });
    }

    const valida = await verificar(contrasena, usuario.contrasena_hash);
    if (!valida) {
      await pool.query('CALL sp_registrar_fallo(?)', [correo]);
      return res.status(401).json(GENERICO);
    }

    await pool.query('CALL sp_registrar_ingreso(?)', [usuario.id]);

    const [permisosFilas] = await pool.query('CALL sp_permisos_de_usuario(?)', [usuario.id]);
    const permisos = permisosFilas[0].map(p => p.clave);

    // Renovar el id de sesión al autenticar evita la fijación de sesión.
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.usuario = {
        id: usuario.id, nombre: usuario.nombre, correo: usuario.correo,
        direccion_id: usuario.direccion_id, rol: usuario.rol,
        rol_id: usuario.rol_id, rol_nombre: usuario.rol_nombre || usuario.rol,
        permisos,
        debe_cambiar: !!usuario.debe_cambiar,
        pendiente_aprobacion: !!usuario.pendiente_aprobacion
      };
      // Se guarda ANTES de responder. El almacén de sesiones es la propia
      // base (express-mysql-session), así que la escritura es asíncrona:
      // express-session la hace al cerrar la respuesta, sin esperarla. Si
      // se responde sin más, la petición siguiente puede llegar antes de
      // que la fila exista y recibir «Inicie sesión» justo después de
      // haber iniciado sesión. Es intermitente y depende de la carga de
      // MySQL, que es la peor forma de fallar.
      req.session.save((err2) => {
        if (err2) return next(err2);
        res.json({ usuario: req.session.usuario });
      });
    });
  } catch (err) { next(err); }
});

// GET /api/auth/sesion — quién soy
router.get('/sesion', async (req, res, next) => {
  if (!req.session.usuario) return res.status(401).json({ error: 'Sesión no iniciada' });
  try {
    const [permisosFilas] = await pool.query('CALL sp_permisos_de_usuario(?)', [req.session.usuario.id]);
    req.session.usuario.permisos = permisosFilas[0].map(p => p.clave);
  } catch (err) {
    // Si no se pueden resolver los permisos, se responde con la lista
    // vacía y nunca sin el campo. La interfaz declara `permisos` como
    // obligatorio y hace `sesion.permisos.includes(...)` sin más: una
    // respuesta sin el campo dejaba la pantalla en blanco.
    // Lista vacía = sin permisos, que es el valor seguro.
    console.error('[sesion] no se pudieron resolver los permisos:', err.message);
    req.session.usuario.permisos = [];
  }
  res.json({ usuario: req.session.usuario });
});

// POST /api/auth/salir
router.post('/salir', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('iniciativas.sid');
    res.json({ ok: true });
  });
});

// Tokens de recuperación en memoria (1 hora de validez)
const tokensRecuperacion = new Map();

// POST /api/auth/solicitar-recuperacion
router.post('/solicitar-recuperacion', async (req, res, next) => {
  try {
    const correo = String(req.body.correo || '').trim().toLowerCase();
    const [filas] = await pool.query('CALL sp_usuario_por_correo(?)', [correo]);
    const usuario = filas[0][0];

    // La respuesta es la misma exista o no la cuenta. Antes se devolvía
    // un 404 «No existe una cuenta registrada con este correo», que
    // permitía averiguar qué correos tienen cuenta en el sistema — justo
    // lo que el inicio de sesión ya evita a propósito.
    const respuesta = {
      ok: true,
      mensaje: 'Si el correo corresponde a una cuenta registrada, le enviaremos las '
             + 'instrucciones para restablecer la contraseña.'
    };

    if (!usuario) {
      await gastarTiempo();
      return res.json(respuesta);
    }

    // Token impredecible: Math.random() no sirve para esto.
    const token = 'tok_' + crypto.randomBytes(24).toString('base64url');
    tokensRecuperacion.set(token, { correo: usuario.correo, expira: Date.now() + 3600 * 1000 });

    const origen = req.get('origin') || process.env.ORIGEN_PERMITIDO || 'http://localhost:5173';
    const enlace = `${origen}/?recuperar=${token}`;

    // Sin envío de correo, el registro del servidor es el único destino
    // seguro: lo ve quien administra la máquina, no quien hace la
    // petición. Cuando exista correo, esta línea la reemplaza el envío.
    console.log(`[recuperación] enlace para ${usuario.correo}: ${enlace}`);

    res.json(MOSTRAR_ENLACE ? { ...respuesta, token, enlace } : respuesta);
  } catch (err) { next(err); }
});

// POST /api/auth/restablecer-contrasena
router.post('/restablecer-contrasena', async (req, res, next) => {
  try {
    const { token, nuevaContrasena } = req.body;
    if (!token || !tokensRecuperacion.has(token)) {
      return res.status(400).json({ error: 'El enlace de recuperación es inválido o ha expirado. Solicite uno nuevo.' });
    }

    const info = tokensRecuperacion.get(token);
    if (info.expira < Date.now()) {
      tokensRecuperacion.delete(token);
      return res.status(400).json({ error: 'El enlace de recuperación ha expirado. Solicite uno nuevo.' });
    }

    const errores = validarFortaleza(nuevaContrasena);
    if (errores.length) {
      return res.status(400).json({ error: 'La contraseña ' + errores.join('; ') });
    }

    await pool.query('CALL sp_guardar_contrasena(?, ?, ?)', [info.correo, await hashear(nuevaContrasena), false]);
    tokensRecuperacion.delete(token);
    res.json({ ok: true, correo: info.correo });
  } catch (err) { next(err); }
});

// POST /api/auth/cambiar-contrasena
router.post('/cambiar-contrasena', async (req, res, next) => {
  try {
    if (!req.session.usuario) return res.status(401).json({ error: 'Sesión no iniciada' });
    const actual = String(req.body.actual || '');
    const nueva = String(req.body.nueva || '');

    const [filas] = await pool.query('CALL sp_usuario_por_correo(?)', [req.session.usuario.correo]);
    const usuario = filas[0][0];
    if (!usuario || !(await verificar(actual, usuario.contrasena_hash))) {
      return res.status(401).json({ error: 'La contraseña actual no es correcta' });
    }
    if (nueva === actual) {
      return res.status(400).json({ error: 'La nueva contraseña debe ser distinta de la actual' });
    }
    const errores = validarFortaleza(nueva);
    if (errores.length) {
      return res.status(400).json({ error: 'La contraseña ' + errores.join('; ') });
    }

    await pool.query('CALL sp_guardar_contrasena(?, ?, ?)',
      [usuario.correo, await hashear(nueva), false]);
    req.session.usuario.debe_cambiar = false;
    // Se guarda ANTES de responder, por lo mismo que en /ingresar: el
    // almacén de sesiones es MySQL y la escritura es asíncrona. Sin esto,
    // la primera acción justo después de cambiar la contraseña podía
    // llegar antes de que la sesión reflejara el cambio y volver a
    // responder «Cambie su contraseña provisional». Intermitente, que es
    // la peor forma de fallar.
    req.session.save((err) => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  } catch (err) { next(err); }
});

// GET /api/auth/mis-propuestas
router.get('/mis-propuestas', async (req, res, next) => {
  try {
    if (!req.session.usuario) return res.status(401).json({ error: 'Sesión no iniciada' });
    const [filas] = await pool.query('CALL sp_listar_mis_propuestas(?)', [req.session.usuario.id]);
    res.json(filas[0]);
  } catch (err) { next(err); }
});

module.exports = router;
