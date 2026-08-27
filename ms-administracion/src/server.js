require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sesion = require('./auth/sesion');
const { identifica, requiereSesion } = require('./auth/middleware');
const { noEncontrado, manejadorErrores } = require('./middleware/errores');

const app = express();
const PORT = process.env.PORT || 3006;

app.set('trust proxy', 1);
app.use(cors({ origin: process.env.ORIGEN_PERMITIDO || true, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(sesion);
app.use(identifica);

// Health check
app.get('/salud', (req, res) => {
  res.json({ servicio: 'ms-administracion', ok: true, fecha: new Date().toISOString() });
});

// Rutas de administración (usuarios, roles, permisos) y estadísticas
app.use('/admin', requiereSesion, require('./rutas/admin'));
app.use('/api/admin', requiereSesion, require('./rutas/admin'));

app.use('/estadisticas', requiereSesion, require('./rutas/reportes'));
app.use('/api/estadisticas', requiereSesion, require('./rutas/reportes'));

app.use(noEncontrado);
app.use(manejadorErrores);

app.listen(PORT, () => {
  console.log(`ms-administracion escuchando en el puerto ${PORT}`);
});
