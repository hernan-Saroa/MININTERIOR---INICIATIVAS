const express = require('express');
const { enviarCorreo } = require('../servicios/mailer');

const router = express.Router();

// POST /notificaciones/radicacion — Confirmación de radicación al ciudadano
router.post('/radicacion', async (req, res, next) => {
  try {
    const { correo, nombre, codigo, tituloIniciativa } = req.body;
    if (!correo || !codigo) {
      return res.status(400).json({ error: 'Correo y código son obligatorios' });
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <div style="background-color: #0b42b6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">Ministerio del Interior</h2>
          <p style="margin: 5px 0 0; font-size: 13px;">Viceministerio para el Diálogo Social y los DD.HH.</p>
        </div>
        <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
          <h3 style="color: #0b42b6;">Confirmación de Radicación de Iniciativa</h3>
          <p>Apreciado(a) <strong>${nombre || 'Ciudadano(a)'}</strong>,</p>
          <p>Le informamos que su propuesta legislativa <em>«${tituloIniciativa}»</em> ha sido radicada satisfactoriamente en el sistema oficial.</p>
          <div style="background-color: #f1f5f9; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <span style="font-size: 12px; font-weight: bold; color: #64748b; text-transform: uppercase;">Código Único de Trámite</span>
            <div style="font-size: 24px; font-weight: bold; font-family: monospace; color: #0b42b6; margin-top: 5px;">${codigo}</div>
          </div>
          <p style="font-size: 13px; color: #64748b;">Puede consultar el avance de su trámite en cualquier momento ingresando su código en el portal ciudadano.</p>
        </div>
      </div>
    `;

    const resultado = await enviarCorreo({
      para: correo,
      asunto: `Radicación exitosa [${codigo}] · Ministerio del Interior`,
      html,
    });

    res.json({ ok: true, resultado });
  } catch (err) { next(err); }
});

// POST /notificaciones/avance — Aviso de cambio de estado en el flujo
router.post('/avance', async (req, res, next) => {
  try {
    const { correo, nombre, codigo, tituloIniciativa, estadoNuevo, motivo } = req.body;
    if (!correo || !codigo || !estadoNuevo) {
      return res.status(400).json({ error: 'Faltan parámetros obligatorios' });
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <div style="background-color: #0b42b6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">Ministerio del Interior</h2>
          <p style="margin: 5px 0 0; font-size: 13px;">Viceministerio para el Diálogo Social y los DD.HH.</p>
        </div>
        <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
          <h3 style="color: #0b42b6;">Actualización de Estado de Trámite [${codigo}]</h3>
          <p>Apreciado(a) <strong>${nombre || 'Usuario(a)'}</strong>,</p>
          <p>La iniciativa <em>«${tituloIniciativa}»</em> ha cambiado de estado a:</p>
          <div style="background-color: #e0e7ff; color: #3730a3; padding: 12px; border-radius: 8px; text-align: center; font-weight: bold; margin: 15px 0;">
            ${estadoNuevo}
          </div>
          ${motivo ? `<p><strong>Observación:</strong> ${motivo}</p>` : ''}
          <p style="font-size: 13px; color: #64748b; margin-top: 20px;">
            Este es un mensaje automático de seguimiento institucional.
          </p>
        </div>
      </div>
    `;

    const resultado = await enviarCorreo({
      para: correo,
      asunto: `Actualización de trámite [${codigo}] → ${estadoNuevo}`,
      html,
    });

    res.json({ ok: true, resultado });
  } catch (err) { next(err); }
});

module.exports = router;
