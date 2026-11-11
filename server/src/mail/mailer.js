import nodemailer from 'nodemailer';

// crearMailer(config) -> { enviar({ para, asunto, html }) }. Rechaza con el error de SMTP si falla
// (quien necesite el detalle, como los préstamos, lo ve; el resto usa enviarSinEsperar).
export function crearMailer(config) {
  const { host, port, user, pass, fromName, fromEmail } = config.smtp;
  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  const nombre = (fromName || "Sistema IT de St. Luke's").replace(/["\r\n]/g, '');
  const from = `"${nombre}" <${fromEmail || user}>`;
  return {
    async enviar({ para, asunto, html }) {
      await transporter.sendMail({ from, to: para, subject: asunto, html });
    },
  };
}
