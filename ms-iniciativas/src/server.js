require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sesion = require('./auth/sesion');
const { identifica } = require('./auth/middleware');
const { noEncontrado, manejadorErrores } = require('./middleware/errores');

const app = express();
const PORT = process.env.PORT || 3002;

app.set('trust proxy', 1);
app.use(cors({ origin: process.env.ORIGEN_PERMITIDO || true, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(sesion);
app.use(identifica);

// Health check
app.get('/salud', (req, res) => {
  res.json({ servicio: 'ms-iniciativas', ok: true, fecha: new Date().toISOString() });
});

// Rutas de iniciativas, direcciones, documentos y exportación
app.use('/iniciativas', require('./rutas/iniciativas'));
app.use('/api/iniciativas', require('./rutas/iniciativas'));

app.use('/direcciones', require('./rutas/direcciones'));
app.use('/api/direcciones', require('./rutas/direcciones'));

app.use('/documentos', require('./rutas/documentos'));
app.use('/api/documentos', require('./rutas/documentos'));

app.use('/', require('./rutas/reportes'));
app.use('/api', require('./rutas/reportes'));

app.use(noEncontrado);
app.use(manejadorErrores);

app.listen(PORT, () => {
  console.log(`ms-iniciativas escuchando en el puerto ${PORT}`);
});
