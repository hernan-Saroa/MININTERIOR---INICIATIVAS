// ---------------------------------------------------------------------
// Manejo centralizado de errores. Traduce los códigos de MySQL a
// respuestas HTTP con sentido, en lugar de devolver siempre un 500.
// ---------------------------------------------------------------------
const TRADUCCIONES = {
  WARN_DATA_TRUNCATED: { estado: 400, mensaje: 'Alguno de los valores enviados no es válido (revise estado o prioridad)' },
  ER_NO_REFERENCED_ROW_2: { estado: 400, mensaje: 'La dirección indicada no existe' },
  ER_DUP_ENTRY: { estado: 409, mensaje: 'El registro ya existe' },
  ER_DATA_TOO_LONG: { estado: 400, mensaje: 'Uno de los campos excede el largo permitido' },
  ECONNREFUSED: { estado: 503, mensaje: 'No hay conexión con la base de datos' }
};

function noEncontrado(req, res) {
  res.status(404).json({ error: 'Recurso no encontrado' });
}

function manejadorErrores(err, req, res, next) {
  // Los procedimientos usan SIGNAL SQLSTATE '45000' para rechazar
  // operaciones inválidas (guardas del flujo y de los roles). Ese texto
  // está escrito para el usuario, así que se devuelve tal cual.
  if (err.errno === 1644) {
    console.warn('[%s] %s %s — regla de negocio: %s', new Date().toISOString(),
      req.method, req.originalUrl, err.sqlMessage);
    return res.status(409).json({ error: err.sqlMessage });
  }

  const traduccion = TRADUCCIONES[err.code];
  const estado = traduccion ? traduccion.estado : 500;

  console.error('[%s] %s %s — %s', new Date().toISOString(),
    req.method, req.originalUrl, err.sqlMessage || err.message);

  res.status(estado).json({
    error: traduccion ? traduccion.mensaje : 'Error interno del servidor'
  });
}

module.exports = { noEncontrado, manejadorErrores };
