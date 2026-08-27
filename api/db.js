require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'iniciativas_legislativas',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true
});

module.exports = pool;
