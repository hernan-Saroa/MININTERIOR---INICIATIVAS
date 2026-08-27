require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { noEncontrado, manejadorErrores } = require('./middleware/errores');

const app = express();
const PORT = process.env.PORT || 3003;

app.set('trust proxy', 1);
app.use(cors({ origin: process.env.ORIGEN_PERMITIDO || true, credentials: true }));
app.use(express.json({ limit: '100kb' }));

// Health check
app.get('/salud', (req, res) => {
  res.json({ servicio: 'ms-radicacion', ok: true, fecha: new Date().toISOString() });
});

// Rutas de radicación ciudadana y consulta
app.use('/radicacion', require('./rutas/publico'));
app.use('/api/radicacion', require('./rutas/publico'));
app.use('/publico', require('./rutas/publico'));
app.use('/api/publico', require('./rutas/publico'));

app.use(noEncontrado);
app.use(manejadorErrores);

app.listen(PORT, () => {
  console.log(`ms-radicacion escuchando en el puerto ${PORT}`);
});
