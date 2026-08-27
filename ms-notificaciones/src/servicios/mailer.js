const nodemailer = require('nodemailer');

// Configuración del transportador SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  } : undefined,
});

async function enviarCorreo({ para, asunto, html }) {
  if (!para) throw new Error('Destinatario no especificado');

  // Si no hay SMTP configurado, simular en log
  if (!process.env.SMTP_HOST) {
    console.log(`[SIMULACIÓN NOTIFICACIÓN] Para: ${para} | Asunto: ${asunto}`);
    return { simulado: true, id: 'sim_' + Date.now() };
  }

  const resultado = await transporter.sendMail({
    from: process.env.SMTP_FROM || '"Sistema de Iniciativas Legislativas" <iniciativas@mininterior.gov.co>',
    to: para,
    subject: asunto,
    html,
  });

  return resultado;
}

module.exports = { enviarCorreo };
