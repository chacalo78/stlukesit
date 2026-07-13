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

function passwordChangedTemplate(motivo: string) {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { targetEmail, newPassword } = await req.json()

    if (!targetEmail || !newPassword || String(newPassword).length < 6) {
      return json({ error: 'Datos inválidos' }, 400)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'No autorizado' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Cliente con el JWT de quien llama, para saber quién es
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !caller?.email) {
      return json({ error: 'No autorizado' }, 401)
    }

    // Cliente con service role: sin RLS, para verificar roles y para la operación admin
    const adminClient = createClient(supabaseUrl, serviceKey)

    const { data: callerRole } = await adminClient
      .from('user_roles')
      .select('rol')
      .eq('email', caller.email)
      .single()

    const esAdminOSuper = callerRole?.rol === 'admin' || callerRole?.rol === 'super_admin'
    if (!esAdminOSuper) {
      return json({ error: 'No tenés permisos para esta acción' }, 403)
    }

    const { data: targetRole } = await adminClient
      .from('user_roles')
      .select('rol')
      .eq('email', targetEmail)
      .single()

    const targetEsElevado = targetRole?.rol === 'admin' || targetRole?.rol === 'super_admin'
    if (targetEsElevado && callerRole?.rol !== 'super_admin') {
      return json({ error: 'Solo un Super Administrador puede resetear la contraseña de un Administrador' }, 403)
    }

    const { data: usersList, error: listError } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
    if (listError) {
      return json({ error: 'Error interno al buscar la cuenta' }, 500)
    }
    const targetUser = usersList.users.find(u => u.email === targetEmail)
    if (!targetUser) {
      return json({ error: 'No existe una cuenta de acceso con ese email' }, 404)
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUser.id, { password: newPassword })
    if (updateError) {
      return json({ error: updateError.message }, 500)
    }

    // Aviso al usuario afectado; si falla el envío no rompemos la
    // respuesta, la contraseña ya se cambió correctamente.
    try {
      await sendMail({
        to: targetEmail,
        subject: 'Tu contraseña fue actualizada',
        html: passwordChangedTemplate('Un administrador del sistema restableció tu contraseña.'),
      })
    } catch {
      // silencioso a propósito
    }

    return json({ success: true })
  } catch {
    return json({ error: 'Error inesperado' }, 500)
  }
})
