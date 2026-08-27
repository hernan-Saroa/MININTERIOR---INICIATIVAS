require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sesion = require('./auth/sesion');
const { identifica } = require('./auth/middleware');
const { noEncontrado, manejadorErrores } = require('./middleware/errores');

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);
app.use(cors({ origin: process.env.ORIGEN_PERMITIDO || true, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(sesion);
app.use(identifica);

// Health check
app.get('/salud', (req, res) => {
  res.json({ servicio: 'ms-autenticacion', ok: true, fecha: new Date().toISOString() });
});

// Rutas de autenticación
app.use('/auth', require('./rutas/auth'));
app.use('/api/auth', require('./rutas/auth'));

app.use(noEncontrado);
app.use(manejadorErrores);

app.listen(PORT, () => {
  console.log(`ms-autenticacion escuchando en el puerto ${PORT}`);
});
