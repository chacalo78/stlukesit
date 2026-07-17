import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.9'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function sendMail({ to, subject, html }: { to: string; subject: string; html: string }) {
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

  await transporter.sendMail({ from: `"${fromName}" <${fromEmail}>`, to, subject, html })
}

function formatFecha(fecha: string) {
  if (!fecha) return '-'
  try {
    return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return fecha
  }
}

function formatFechaHora(fecha: string) {
  if (!fecha) return '-'
  try {
    return new Date(fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return fecha
  }
}

function prestamoTemplate(opts: {
  persona: string
  numeroInventario: string
  tipo: string
  marca: string
  modelo: string
  fechaDevolucion: string
}) {
  const equipoDesc = [opts.tipo, opts.marca, opts.modelo].filter(Boolean).join(' ') || 'Equipo'
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
            <td style="padding:24px 32px 8px; color:#e8f0e8; font-size:14px; line-height:1.6;">
              <p style="margin:0 0 12px;">Hola${opts.persona ? ` ${opts.persona}` : ''},</p>
              <p style="margin:0 0 16px;">Se registró un préstamo de equipo a tu nombre. Estos son los detalles:</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1c2e1e; border:1px solid #2a3f2c; border-radius:10px;">
                <tr>
                  <td style="padding:14px 16px; color:#9ab89c; font-size:12px; border-bottom:1px solid #2a3f2c;">Equipo</td>
                  <td style="padding:14px 16px; color:#e8f0e8; font-size:13px; text-align:right; border-bottom:1px solid #2a3f2c;">${equipoDesc}</td>
                </tr>
                <tr>
                  <td style="padding:14px 16px; color:#9ab89c; font-size:12px; border-bottom:1px solid #2a3f2c;">N° inventario</td>
                  <td style="padding:14px 16px; color:#e8f0e8; font-size:13px; text-align:right; border-bottom:1px solid #2a3f2c;">${opts.numeroInventario || '-'}</td>
                </tr>
                <tr>
                  <td style="padding:14px 16px; color:#9ab89c; font-size:12px;">Fecha de devolución</td>
                  <td style="padding:14px 16px; color:#c8a44a; font-size:13px; text-align:right; font-weight:bold;">${formatFecha(opts.fechaDevolucion)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px; color:#9ab89c; font-size:12px; line-height:1.5;">
              Por favor, devolvé el equipo antes de la fecha indicada. Ante cualquier duda, contactá al área de IT.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`
}

function devolucionTemplate(opts: {
  persona: string
  numeroInventario: string
  tipo: string
  marca: string
  modelo: string
  fechaDevolucion: string
  observaciones: string
}) {
  const equipoDesc = [opts.tipo, opts.marca, opts.modelo].filter(Boolean).join(' ') || 'Equipo'
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
            <td style="padding:24px 32px 8px; color:#e8f0e8; font-size:14px; line-height:1.6;">
              <p style="margin:0 0 12px;">Hola${opts.persona ? ` ${opts.persona}` : ''},</p>
              <p style="margin:0 0 16px;">Se registró la devolución de un equipo a tu nombre. Estos son los detalles:</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1c2e1e; border:1px solid #2a3f2c; border-radius:10px;">
                <tr>
                  <td style="padding:14px 16px; color:#9ab89c; font-size:12px; border-bottom:1px solid #2a3f2c;">Equipo</td>
                  <td style="padding:14px 16px; color:#e8f0e8; font-size:13px; text-align:right; border-bottom:1px solid #2a3f2c;">${equipoDesc}</td>
                </tr>
                <tr>
                  <td style="padding:14px 16px; color:#9ab89c; font-size:12px; ${opts.observaciones ? 'border-bottom:1px solid #2a3f2c;' : ''}">N° inventario</td>
                  <td style="padding:14px 16px; color:#e8f0e8; font-size:13px; text-align:right; ${opts.observaciones ? 'border-bottom:1px solid #2a3f2c;' : ''}">${opts.numeroInventario || '-'}</td>
                </tr>
                <tr>
                  <td style="padding:14px 16px; color:#9ab89c; font-size:12px; ${opts.observaciones ? 'border-bottom:1px solid #2a3f2c;' : ''}">Fecha de devolución</td>
                  <td style="padding:14px 16px; color:#c8a44a; font-size:13px; text-align:right; font-weight:bold; ${opts.observaciones ? 'border-bottom:1px solid #2a3f2c;' : ''}">${formatFechaHora(opts.fechaDevolucion)}</td>
                </tr>
                ${opts.observaciones ? `
                <tr>
                  <td style="padding:14px 16px; color:#9ab89c; font-size:12px;">Observaciones</td>
                  <td style="padding:14px 16px; color:#e8f0e8; font-size:13px; text-align:right;">${opts.observaciones}</td>
                </tr>` : ''}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px; color:#9ab89c; font-size:12px; line-height:1.5;">
              Gracias por devolver el equipo. Ante cualquier duda, contactá al área de IT.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'No autorizado' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !caller) {
      return json({ error: 'No autorizado' }, 401)
    }

    const { email, persona, numeroInventario, tipo, marca, modelo, fechaDevolucion, accion, observaciones } = await req.json()
    if (!email) {
      return json({ error: 'Falta el email del destinatario' }, 400)
    }

    const esDevolucion = accion === 'devolucion'

    await sendMail({
      to: email,
      subject: esDevolucion ? 'Devolución de equipo registrada' : 'Préstamo de equipo registrado',
      html: esDevolucion
        ? devolucionTemplate({ persona, numeroInventario, tipo, marca, modelo, fechaDevolucion, observaciones })
        : prestamoTemplate({ persona, numeroInventario, tipo, marca, modelo, fechaDevolucion }),
    })

    return json({ success: true })
  } catch (e) {
    // No queremos que un fallo de mail rompa el registro del préstamo,
    // que ya se guardó en la base antes de llamar a esta función.
    console.error('notify-prestamo error:', e)
    return json({ success: true, warning: 'No se pudo enviar el aviso por mail', detail: String((e as Error)?.message ?? e) })
  }
})
