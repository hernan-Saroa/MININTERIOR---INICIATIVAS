require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { noEncontrado, manejadorErrores } = require('./middleware/errores');

const app = express();
const PORT = process.env.PORT || 3005;

app.set('trust proxy', 1);
app.use(cors({ origin: process.env.ORIGEN_PERMITIDO || true, credentials: true }));
app.use(express.json({ limit: '100kb' }));

// Health check
app.get('/salud', (req, res) => {
  res.json({ servicio: 'ms-notificaciones', ok: true, fecha: new Date().toISOString() });
});

// Rutas de notificaciones
app.use('/notificaciones', require('./controladores/notificaciones'));
app.use('/api/notificaciones', require('./controladores/notificaciones'));

app.use(noEncontrado);
app.use(manejadorErrores);

app.listen(PORT, () => {
  console.log(`ms-notificaciones escuchando en el puerto ${PORT}`);
});
