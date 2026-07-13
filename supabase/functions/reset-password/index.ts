import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendMail, passwordChangedTemplate } from '../_shared/mailer.ts'

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
