// ---------------------------------------------------------------------
// Rutas que NO exigen sesión: el formulario de propuesta y el registro.
// Se montan antes del middleware requiereSesion.
// ---------------------------------------------------------------------
const express = require('express');
const pool = require('../db');
const { hashear, validarFortaleza } = require('../auth/contrasena');

const router = express.Router();

// ---------------------------------------------------------------------
// Límite de peticiones por IP. Estos endpoints escriben en la base sin
// credenciales, así que sin freno un script puede llenarla en minutos.
// ---------------------------------------------------------------------
const VENTANA_MS = 15 * 60 * 1000;
const TOPES = { '/propuestas': 10, '/registrar': 3 };
const registro = new Map();

function limitar(req, res, next) {
  const tope = TOPES[req.path];
  if (!tope) return next();

  // Quien ya inició sesión no pasa por aquí: está identificado y sujeto a
  // los permisos por rol. El freno es contra el uso anónimo automatizado.
  if (req.session && req.session.usuario) return next();

  const ahora = Date.now();
  const clave = req.ip + req.path;
  const previos = (registro.get(clave) || []).filter(t => ahora - t < VENTANA_MS);

  if (previos.length >= tope) {
    return res.status(429).json({
      error: 'Ha enviado demasiadas solicitudes. Intente de nuevo en unos minutos.'
    });
  }

  // Se anota solo si la petición prospera: un formulario mal diligenciado
  // no debería agotarle el cupo a quien está intentando de buena fe.
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const actuales = (registro.get(clave) || []).filter(t => ahora - t < VENTANA_MS);
      actuales.push(ahora);
      registro.set(clave, actuales);
    }
  });

  // Limpieza ocasional para que el mapa no crezca sin control
  if (registro.size > 5000) {
    for (const [k, v] of registro) {
      if (!v.some(t => ahora - t < VENTANA_MS)) registro.delete(k);
    }
  }
  next();
}
router.use(limitar);

const correoValido = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c);

// ---------------------------------------------------------------------
// GET /api/publico/direcciones — para llenar el selector del formulario.
// Solo id y nombre: no expone conteos ni contenido de las iniciativas.
// ---------------------------------------------------------------------
router.get('/direcciones', async (req, res, next) => {
  try {
    const [filas] = await pool.query('CALL sp_listar_direcciones()');
    res.json(filas[0].map(d => ({ id: d.id, nombre: d.nombre, nombre_corto: d.nombre_corto })));
  } catch (err) { next(err); }
});

// GET /api/publico/flujo — lista de estados para el tablero público
router.get('/flujo', async (req, res, next) => {
  try {
    const [filas] = await pool.query('CALL sp_listar_estados()');
    res.json(filas[0]);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// POST /api/publico/registrar — autorregistro con nombre, correo y clave.
// La cuenta nace como 'lector' pendiente de aprobación.
// ---------------------------------------------------------------------
router.post('/registrar', async (req, res, next) => {
  try {
    const nombre = String(req.body.nombre || '').trim();
    const correo = String(req.body.correo || '').trim().toLowerCase();
    const contrasena = String(req.body.contrasena || '');

    if (!nombre) return res.status(400).json({ error: 'Escriba su nombre' });
    if (!correoValido(correo)) return res.status(400).json({ error: 'El correo no es válido' });

    const errores = validarFortaleza(contrasena);
    if (errores.length) return res.status(400).json({ error: 'La contraseña ' + errores.join('; ') });

    const [existentes] = await pool.query('CALL sp_usuario_por_correo(?)', [correo]);
    if (existentes[0][0]) {
      return res.status(409).json({
        error: 'Ya existe una cuenta con ese correo. Inicie sesión.',
        codigo: 'YA_EXISTE'
      });
    }

    const [filas] = await pool.query('CALL sp_registrar_usuario_publico(?, ?, ?)',
      [nombre, correo, await hashear(contrasena)]);
    const usuario = filas[0][0];

    // Las propuestas que ya había enviado con ese correo pasan a su cuenta
    const [adopcion] = await pool.query('CALL sp_adoptar_propuestas(?, ?)', [correo, usuario.id]);

    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.usuario = {
        id: usuario.id, nombre: usuario.nombre, correo: usuario.correo,
        direccion_id: null, rol: 'lector', debe_cambiar: false,
        pendiente_aprobacion: true
      };
      // Igual que en el ingreso: la sesión se guarda antes de responder,
      // porque el almacén es MySQL y la escritura no es inmediata. Quien
      // se registra y actúa al instante recibiría «Inicie sesión».
      req.session.save((err2) => {
        if (err2) return next(err2);
        res.status(201).json({
          usuario: req.session.usuario,
          propuestas_adoptadas: adopcion[0][0].adoptadas
        });
      });
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// POST /api/publico/propuestas — alta desde el formulario, con o sin
// sesión. Entra siempre como origen 'propuesta', nunca como 'interna'.
// ---------------------------------------------------------------------
router.post('/propuestas', async (req, res, next) => {
  try {
    const c = req.body;
    const nombre = String(c.nombre || '').trim();
    const direccionId = String(c.direccion_id || '').trim();

    if (!direccionId) return res.status(400).json({ error: 'Seleccione la dirección' });
    if (nombre.length < 8) return res.status(400).json({ error: 'Describa la iniciativa con un poco más de detalle' });
    if (nombre.length > 500) return res.status(400).json({ error: 'El nombre es demasiado largo' });
    if (String(c.objeto || '').length > 4000) return res.status(400).json({ error: 'El objeto es demasiado largo' });

    const contacto = String(c.contacto || '').trim();
    const correo = String(c.correo || '').trim().toLowerCase();
    if (correo && !correoValido(correo)) return res.status(400).json({ error: 'El correo no es válido' });

    // Los documentos se validan ANTES de crear nada. Antes se validaba
    // el nombre y el objeto de la iniciativa, se creaba la propuesta, y
    // solo después se insertaban los documentos uno a uno: si uno fallaba
    // —un enlace de más de 1000 caracteres basta— el ciudadano recibía un
    // 400 y ningún código, creyendo que no se había radicado nada, pero
    // la iniciativa ya estaba activa y visible en el tablero, sin sus
    // documentos y sin que él supiera con qué código consultarla. Si
    // reintentaba, radicaba dos veces lo mismo.
    //
    // Aquí no hay transacción —la API solo llama procedimientos— así que
    // la salida es validar todo primero y no dejar nada a medias.
    const docsLimpios = [];
    if (Array.isArray(c.documentos)) {
      for (const doc of c.documentos) {
        const docNombre = String(doc.nombre || '').trim();
        const docEnlace = String(doc.enlace || '').trim();
        if (!docNombre) continue;
        if (docNombre.length > 500) {
          return res.status(400).json({ error: 'El nombre de un documento es demasiado largo' });
        }
        // Solo http/https. La ruta autenticada ya lo exigía; este
        // formulario, que escribe SIN credenciales, no lo hacía: se podía
        // guardar un enlace `javascript:` que se ejecutaba al pulsarlo
        // desde el tablero de un funcionario.
        if (docEnlace) {
          if (docEnlace.length > 1000) {
            return res.status(400).json({ error: 'El enlace de un documento es demasiado largo' });
          }
          let url;
          try { url = new URL(docEnlace); }
          catch { return res.status(400).json({ error: 'Uno de los enlaces no es una dirección válida' }); }
          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return res.status(400).json({ error: 'Los enlaces deben empezar por http:// o https://' });
          }
        }
        docsLimpios.push({ nombre: docNombre, enlace: docEnlace || null });
      }
    }

    const sesion = req.session && req.session.usuario;
    const [filas] = await pool.query(
      'CALL sp_crear_propuesta(?, ?, ?, ?, ?, ?, ?)',
      [direccionId, nombre, c.objeto || '', c.numero_proyecto || '',
       sesion ? sesion.id : null,
       sesion ? sesion.nombre : contacto,
       sesion ? sesion.correo : correo]
    );
    const iniciativaId = filas[0][0].id;

    for (const doc of docsLimpios) {
      await pool.query('CALL sp_agregar_documento(?, ?, ?, ?)',
        [iniciativaId, doc.nombre, doc.enlace, null]);
    }

    res.status(201).json({ id: iniciativaId });
  } catch (err) { next(err); }
});

module.exports = router;
