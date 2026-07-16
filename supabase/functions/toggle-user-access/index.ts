import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const { targetEmail, habilitado } = await req.json()

    if (!targetEmail || typeof habilitado !== 'boolean') {
      return json({ error: 'Datos inválidos' }, 400)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'No autorizado' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !caller?.email) {
      return json({ error: 'No autorizado' }, 401)
    }

    if (caller.email === targetEmail) {
      return json({ error: 'No podés inhabilitar tu propio usuario' }, 400)
    }

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
    if (targetEsElevado && !habilitado) {
      return json({ error: 'Las cuentas de Administrador o Super Administrador no se pueden inhabilitar' }, 403)
    }

    const { data: usersList, error: listError } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
    if (listError) {
      return json({ error: 'Error interno al buscar la cuenta' }, 500)
    }
    const targetUser = usersList.users.find(u => u.email === targetEmail)
    if (!targetUser) {
      return json({ error: 'No existe una cuenta de acceso con ese email' }, 404)
    }

    // ban_duration: 'none' habilita; una duración larga la deja inhabilitada
    // hasta que se revierta manualmente (Supabase no admite "indefinido").
    const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUser.id, {
      ban_duration: habilitado ? 'none' : '876000h',
    })
    if (updateError) {
      return json({ error: updateError.message }, 500)
    }

    return json({ success: true })
  } catch {
    return json({ error: 'Error inesperado' }, 500)
  }
})
