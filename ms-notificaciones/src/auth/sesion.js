// ---------------------------------------------------------------------
// Sesión en cookie httpOnly, con el almacén en la misma base MySQL.
// No se usa JWT en localStorage: la cookie no es accesible desde
// JavaScript, así que un XSS no puede robar la sesión.
// ---------------------------------------------------------------------
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const pool = require('../db');

const EN_PRODUCCION = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET && EN_PRODUCCION) {
  throw new Error('Falta SESSION_SECRET en el archivo .env');
}

const store = new MySQLStore({
  createDatabaseTable: false,
  schema: {
    tableName: 'sesiones',
    columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' }
  }
}, pool);

module.exports = session({
  name: 'iniciativas.sid',
  secret: process.env.SESSION_SECRET || 'clave-solo-para-desarrollo',
  store,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: EN_PRODUCCION,   // exige HTTPS en producción
    maxAge: 8 * 60 * 60 * 1000
  }
});
