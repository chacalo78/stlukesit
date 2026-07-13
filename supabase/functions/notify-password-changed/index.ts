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
    if (callerError || !caller?.email) {
      return json({ error: 'No autorizado' }, 401)
    }

    // Siempre se manda al propio email del que llama: no puede usarse
    // para notificar a otra cuenta.
    await sendMail({
      to: caller.email,
      subject: 'Tu contraseña fue actualizada',
      html: passwordChangedTemplate('Este cambio lo hiciste vos mismo desde el sistema.'),
    })

    return json({ success: true })
  } catch {
    // No queremos que un fallo de mail rompa el flujo de cambio de
    // contraseña, que ya se aplicó antes de llamar a esta función.
    return json({ success: true, warning: 'No se pudo enviar el aviso por mail' })
  }
})
