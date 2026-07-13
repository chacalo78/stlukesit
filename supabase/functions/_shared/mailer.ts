import nodemailer from 'npm:nodemailer@6.9.9'

export async function sendMail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const host = Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com'
  const port = Number(Deno.env.get('SMTP_PORT') ?? '587')
  const user = Deno.env.get('SMTP_USER')!
  const pass = Deno.env.get('SMTP_PASS')!
  const fromName = Deno.env.get('SMTP_FROM_NAME') ?? "Sistema IT de St. Luke's"
  const fromEmail = Deno.env.get('SMTP_FROM_EMAIL') ?? user

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
  })
}

export function passwordChangedTemplate(motivo: string) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a150b; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px; background-color:#152116; border:1px solid #3a5a3d; border-radius:14px; overflow:hidden; font-family:Arial, Helvetica, sans-serif;">
          <tr>
            <td align="center" style="padding:32px 32px 20px;">
              <img src="https://chacalo78.github.io/stlukesit/logo.png" alt="St. Luke's College" width="90" style="display:block; margin:0 auto 12px;" />
              <div style="color:#c8a44a; font-size:16px; font-weight:bold; letter-spacing:.5px;">St. Luke's College</div>
              <div style="color:#5c7a5e; font-size:11px; margin-top:2px;">Sistema de IT</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none; border-top:1px solid #3a5a3d; margin:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 28px; color:#e8f0e8; font-size:14px; line-height:1.6;">
              <p style="margin:0 0 12px;">Tu contraseña de acceso al Sistema de IT fue actualizada correctamente.</p>
              <p style="margin:0 0 16px; color:#9ab89c; font-size:12px;">${motivo}</p>
              <p style="margin:0; color:#e25555; font-size:12px;">Si no fuiste vos quien hizo este cambio, contactá a un administrador del sistema de inmediato.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`
}
