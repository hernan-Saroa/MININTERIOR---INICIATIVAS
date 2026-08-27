const express = require('express');
const pool = require('../db');
const router = express.Router();

// GET /api/direcciones
router.get('/', async (req, res, next) => {
  try {
    const [filas] = await pool.query('CALL sp_listar_direcciones()');
    res.json(filas[0]);
  } catch (err) { next(err); }
});

module.exports = router;
