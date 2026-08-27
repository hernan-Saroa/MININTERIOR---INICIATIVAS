const express = require('express');
const pool = require('../db');
const {
  requiereSesion, puedeEscribir, mismaDireccion, puedeEditarIniciativa,
  tienePermiso, permisosDe
} = require('../auth/middleware');

const router = express.Router();
router.use(puedeEscribir);

const ESTADOS = ['En formulación', 'Radicado', 'En comisión', 'Aprobado', 'Archivado'];
const PRIORIDADES = ['Alta', 'Media', 'Baja'];

// Valida antes de llegar a MySQL, para devolver 400 y no un 500 opaco.
function validar(cuerpo, { exigirNombre }) {
  const errores = [];
  if (exigirNombre && !String(cuerpo.nombre || '').trim()) errores.push('el nombre es obligatorio');
  // Solo lo usa el POST al crear. El PUT lo rechaza antes de llegar aquí.
  if (cuerpo.estado && !ESTADOS.includes(cuerpo.estado)) errores.push('el estado no es válido');
  if (cuerpo.prioridad && !PRIORIDADES.includes(cuerpo.prioridad)) errores.push('la prioridad no es válida');
  // Se recorta antes de comprobar el formato para que la cadena vacía y
  // los espacios en blanco signifiquen lo mismo: vaciar la fecha. Si no,
  // escribir un espacio en la celda devolvía un error de formato.
  const fecha = String(cuerpo.fecha_actualizacion ?? '').trim();
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    errores.push('la fecha debe tener el formato AAAA-MM-DD, por ejemplo 2026-08-26');
  }
  return errores;
}

// Identidad de quien propuso una iniciativa ciudadana.
//
// `sp_listar_iniciativas` devuelve `propuesta_nombre` y `propuesta_por`, y
// esta ruta está abierta para que cualquiera pueda consultar el estado de un
// trámite por su código. El resultado era que el nombre de la persona que
// radicó —recogido en el formulario bajo el rótulo «datos de contacto»—
// quedaba publicado en un endpoint abierto, sin autorización previa y sin
// aviso de tratamiento de datos.
//
// En una entidad que atiende personas defensoras de derechos humanos, saber
// quién propuso qué es un dato de seguridad, no un detalle administrativo.
//
// Se retira en el servidor y no en la interfaz: ocultarlo al pintar es
// cosmética, porque el dato viaja igual en el JSON y se ve en la consola del
// navegador. Ley 1581 de 2012.
//
// Y la barrera es un PERMISO, no «tener sesión». El autorregistro es
// autoservicio: cualquiera se hace una cuenta en medio minuto, así que
// exigir sesión no protegía nada. Ver db/12_ver_proponente.sql.
function sinIdentidadDelProponente(filas) {
  return filas.map((f) => {
    const { propuesta_nombre: _n, propuesta_por: _p, ...resto } = f;
    // Se conserva `origen`, que dice que es ciudadana sin decir de quién:
    // eso es información pública legítima sobre el trámite.
    return resto;
  });
}

// GET /api/iniciativas?direccion_id=xxx
//
// Abierta a propósito: es lo que sostiene la consulta ciudadana por código.
// Lo que se filtra es la identidad de quien radicó, no la existencia del
// trámite.
router.get('/', async (req, res, next) => {
  try {
    const direccionId = req.query.direccion_id || null;
    const [filas] = await pool.query('CALL sp_listar_iniciativas(?)', [direccionId]);

    const puedeVerlo = req.usuario
      ? (await permisosDe(req.usuario.id)).has('iniciativas.ver_proponente')
      : false;

    res.json(puedeVerlo ? filas[0] : sinIdentidadDelProponente(filas[0]));
  } catch (err) { next(err); }
});

// POST /api/iniciativas
router.post('/', async (req, res, next) => {
  try {
    const c = req.body;
    if (!c.direccion_id) return res.status(400).json({ error: 'direccion_id es obligatorio' });
    const errores = validar(c, { exigirNombre: true });
    if (errores.length) return res.status(400).json({ error: errores.join('; ') });

    if (!(await mismaDireccion(req.usuario, c.direccion_id))) {
      return res.status(403).json({ error: 'No puede crear iniciativas en otra dirección' });
    }

    const [filas] = await pool.query(
      'CALL sp_crear_iniciativa(?, ?, ?, ?, ?, ?, ?, ?)',
      [c.direccion_id, c.nombre, c.objeto || null, c.numero_proyecto || null,
       c.estado || 'En formulación', c.prioridad || 'Media',
       c.fecha_actualizacion || null, !!c.fuente_publica]
    );
    res.status(201).json({ id: filas[0][0].id });
  } catch (err) { next(err); }
});

// El tablero guarda campo por campo: cada celda manda solo el campo que
// cambió. Así que hay tres situaciones distintas y no se pueden confundir:
//
//   el campo no viene            → NULL: la columna no se toca
//   el campo viene vacío         → '':   la columna se vacía a propósito
//   el campo viene con contenido → el valor
//
// Antes todo se colapsaba con `c.objeto || null`, que convertía las dos
// primeras en NULL. Como el procedimiento escribía ese NULL encima del
// dato bueno, corregir el título borraba el objeto, el número de proyecto
// y la fecha. Ver db/08_correcciones.sql.
const parche = (v) => (v === undefined ? null : String(v).trim());

// PUT /api/iniciativas/:id
router.put('/:id', puedeEditarIniciativa, async (req, res, next) => {
  try {
    const c = req.body;
    const errores = validar(c, { exigirNombre: false });
    if (errores.length) return res.status(400).json({ error: errores.join('; ') });

    // nombre es NOT NULL: si viene, tiene que traer contenido.
    if (c.nombre !== undefined && !String(c.nombre).trim()) {
      return res.status(400).json({ error: 'El nombre de la iniciativa no puede quedar vacío' });
    }

    // `estado` NO se acepta por aquí. El procedimiento lo escribe en la
    // columna de compatibilidad sin tocar `estado_id`, así que la fila
    // quedaba diciendo dos cosas distintas: la píldora mostraba un estado y
    // el flujo calculaba las transiciones desde el otro. El estado se mueve
    // por su propia ruta, /:id/mover, que valida la transición y registra
    // el movimiento.
    if (c.estado !== undefined) {
      return res.status(400).json({
        error: 'El estado se cambia con las acciones del panel de la iniciativa, '
             + 'no editando la casilla.'
      });
    }

    await pool.query(
      'CALL sp_actualizar_iniciativa(?, ?, ?, ?, ?, ?, ?, ?)',
      [req.params.id, parche(c.nombre), parche(c.objeto), parche(c.numero_proyecto),
       null, c.prioridad || null, parche(c.fecha_actualizacion),
       // El autor: sin él el procedimiento no registra el asiento, y un
       // historial sin responsable no sirve de trazabilidad.
       req.usuario.id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/iniciativas/:id — baja lógica
router.delete('/:id', puedeEditarIniciativa, async (req, res, next) => {
  try {
    await pool.query('CALL sp_eliminar_iniciativa(?)', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/iniciativas/:id/documentos
router.get('/:id/documentos', async (req, res, next) => {
  try {
    const [filas] = await pool.query('CALL sp_listar_documentos(?)', [req.params.id]);
    res.json(filas[0]);
  } catch (err) { next(err); }
});

// POST /api/iniciativas/:id/documentos
router.post('/:id/documentos', puedeEditarIniciativa, async (req, res, next) => {
  try {
    const { nombre, enlace, fecha } = req.body;
    if (!String(nombre || '').trim()) return res.status(400).json({ error: 'nombre es obligatorio' });

    // Solo http/https: evita que se guarde un enlace "javascript:" que se
    // ejecutaría al hacer clic desde el tablero.
    if (enlace) {
      let url;
      try { url = new URL(enlace); } catch { return res.status(400).json({ error: 'El enlace no es una URL válida' }); }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return res.status(400).json({ error: 'El enlace debe empezar por http:// o https://' });
      }
    }

    const [filas] = await pool.query(
      'CALL sp_agregar_documento(?, ?, ?, ?)',
      [req.params.id, nombre, enlace || null, fecha || null]
    );
    res.status(201).json({ id: filas[0][0].id });
  } catch (err) { next(err); }
});

// DELETE /api/iniciativas/:id/documentos/:docId
router.delete('/:id/documentos/:docId', puedeEditarIniciativa, async (req, res, next) => {
  try {
    // Se manda también la iniciativa. `puedeEditarIniciativa` valida que
    // quien borra pueda editar la iniciativa del path, pero el procedimiento
    // borraba por id de documento a secas: con el id de un documento de otra
    // dirección en el segundo parámetro de la URL, la guarda pasaba y el
    // borrado ocurría igual. Ahora el propio procedimiento exige que el
    // documento pertenezca a esa iniciativa (ver db/11_historial_fiel.sql).
    await pool.query(
      'CALL sp_eliminar_documento(?, ?)',
      [parseInt(req.params.docId, 10), parseInt(req.params.id, 10)],
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/iniciativas/:id/transiciones
//
// Exige sesión: qué acciones existen y quién es responsable de cada estado
// es organización interna. Sin sesión antes devolvía una lista vacía, que
// además es una respuesta engañosa —parece «no hay acciones» y en realidad
// es «no sabemos quién es usted»—.
router.get('/:id/transiciones', requiereSesion, async (req, res, next) => {
  try {
    const [filas] = await pool.query('CALL sp_transiciones_disponibles(?, ?)', [parseInt(req.params.id, 10), req.usuario.id]);
    res.json(filas[0]);
  } catch (err) { next(err); }
});

// POST /api/iniciativas/:id/mover
//
// El cuerpo lleva el id de la TRANSICIÓN, no el del estado destino. Antes
// se mandaba el id del estado y la ruta lo pasaba a `p_transicion_id`: el
// procedimiento resolvía `FROM transiciones WHERE id = ?`, así que el
// número se interpretaba como otra cosa. Casi todas las combinaciones
// fallaban con «Esa acción no aplica al estado actual», pero algunas
// coincidían y movían la iniciativa a un estado que nadie pidió: pulsar
// «Rechazar» en «En comisión» mandaba 5, se ejecutaba la transición 5
// (En comisión → Radicado, tipo «devolver») y el expediente quedaba
// diciendo algo que nadie ordenó.
//
// La transición ya identifica su destino, su tipo y su origen permitido,
// así que es el único dato que hace falta.
router.post('/:id/mover', puedeEditarIniciativa, async (req, res, next) => {
  try {
    const { transicion_id, estado_destino_id, motivo } = req.body;

    // Rechazo explícito del campo viejo: si llegara de un cliente sin
    // actualizar, moverlo «lo mejor posible» es justamente el error que se
    // está corrigiendo. Vale más un 400 visible.
    if (estado_destino_id !== undefined && transicion_id === undefined) {
      return res.status(400).json({
        error: 'Esta versión espera el identificador de la acción, no el del estado destino. '
             + 'Recargue la página para obtener la versión actualizada.'
      });
    }

    const transicionId = parseInt(transicion_id, 10);
    if (!Number.isInteger(transicionId) || transicionId <= 0) {
      return res.status(400).json({ error: 'Indique la acción que desea realizar' });
    }

    await pool.query(
      'CALL sp_mover_iniciativa(?, ?, ?, ?)',
      [parseInt(req.params.id, 10), transicionId, req.usuario.id, motivo || null]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/iniciativas/:id/acotar
//
// La firma es sp_acotar_iniciativa(p_iniciativa_id, p_usuario_id,
// p_nuevo_objeto, p_motivo). La ruta mandaba los argumentos 2 y 3 al
// revés, y eso tenía dos consecuencias graves: el texto nuevo caía en el
// parámetro INT del usuario (con modo estricto, error 1265 y un 500; sin
// modo estricto, se truncaba al primer dígito), y el id del usuario de
// sesión caía en el parámetro del objeto, así que el UPDATE escribía ese
// número encima del objeto de la iniciativa.
//
// Peor: la única guarda de permiso de esta acción está DENTRO del
// procedimiento y compara contra `p_usuario_id`. Al recibir ahí el texto
// del cuerpo, la comprobación se hacía contra un valor que envía quien
// llama. El id de usuario no puede venir nunca del cuerpo: sale de la
// sesión y de ningún otro sitio.
router.post('/:id/acotar', puedeEditarIniciativa, async (req, res, next) => {
  try {
    const { objeto_nuevo, motivo } = req.body;

    // El procedimiento escribe `objeto` sin COALESCE, así que una cadena
    // vacía borraría el objeto sin dejar forma de recuperarlo.
    const nuevo = typeof objeto_nuevo === 'string' ? objeto_nuevo.trim() : '';
    if (!nuevo) {
      return res.status(400).json({ error: 'Escriba el nuevo objeto y alcance de la iniciativa' });
    }

    await pool.query(
      'CALL sp_acotar_iniciativa(?, ?, ?, ?)',
      [parseInt(req.params.id, 10), req.usuario.id, nuevo, motivo || null]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/iniciativas/:id/historial
//
// Exige sesión. El historial no es el tablero: devuelve el motivo de cada
// devolución o rechazo, el nombre del funcionario que la ordenó y el texto
// del objeto antes de acotarlo. Es la deliberación interna sobre trámites
// de consulta previa y de garantías a personas defensoras, y estaba
// abierta —`puedeEscribir` deja pasar cualquier GET—, así que con un bucle
// sobre el id se reconstruía completa.
router.get('/:id/historial', requiereSesion, tienePermiso('flujo.ver_historial'), async (req, res, next) => {
  try {
    const [filas] = await pool.query('CALL sp_historial_iniciativa(?)', [parseInt(req.params.id, 10)]);
    res.json(filas[0]);
  } catch (err) { next(err); }
});

module.exports = router;
