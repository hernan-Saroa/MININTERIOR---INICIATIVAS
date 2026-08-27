require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sesion = require('./auth/sesion');
const { identifica, requiereSesion } = require('./auth/middleware');
const { noEncontrado, manejadorErrores } = require('./middleware/errores');

const app = express();
const PORT = process.env.PORT || 3004;

app.set('trust proxy', 1);
app.use(cors({ origin: process.env.ORIGEN_PERMITIDO || true, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(sesion);
app.use(identifica);

// Health check
app.get('/salud', (req, res) => {
  res.json({ servicio: 'ms-flujo-estados', ok: true, fecha: new Date().toISOString() });
});

// Rutas de flujo y estados
app.use('/flujo', requiereSesion, require('./rutas/flujo'));
app.use('/api/flujo', requiereSesion, require('./rutas/flujo'));
app.use('/admin/estados', requiereSesion, require('./rutas/flujo'));
app.use('/api/admin/estados', requiereSesion, require('./rutas/flujo'));

app.use(noEncontrado);
app.use(manejadorErrores);

app.listen(PORT, () => {
  console.log(`ms-flujo-estados escuchando en el puerto ${PORT}`);
});
