import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3'

const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
})

const json = (body: Record<string, unknown>, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) })

const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase()
const allowedRoles = new Set(['operador', 'supervisor', 'administrador'])
const allowedShifts = new Set(['Manhã', 'Tarde', 'Noite'])

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405, origin)

  const authorization = request.headers.get('authorization')
  const accessToken = authorization?.replace(/^Bearer\s+/i, '').trim()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Configuração segura da função ausente.' }, 500, origin)
  if (!accessToken) return json({ error: 'Sessão não informada.' }, 401, origin)

  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${accessToken}` } } })
  const { data: { user }, error: userError } = await callerClient.auth.getUser(accessToken)
  if (userError || !user) return json({ error: 'Sessão inválida ou expirada.' }, 401, origin)

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: callerProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('id, active, role')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) return json({ error: 'Não foi possível validar o perfil administrativo.' }, 500, origin)
  if (!callerProfile?.active || callerProfile.role !== 'administrador') return json({ error: 'Apenas administradores podem enviar convites.' }, 403, origin)

  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'JSON inválido.' }, 400, origin)
  }

  const name = String(payload.name ?? '').trim()
  const email = normalizeEmail(payload.email)
  const role = String(payload.role ?? 'operador').trim().toLowerCase()
  const shift = String(payload.shift ?? '').trim()
  if (name.length < 2 || name.length > 120) return json({ error: 'Informe um nome entre 2 e 120 caracteres.' }, 400, origin)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Informe um e-mail válido.' }, 400, origin)
  if (!allowedRoles.has(role)) return json({ error: 'Nível de acesso inválido.' }, 400, origin)
  if (shift && !allowedShifts.has(shift)) return json({ error: 'Turno inválido.' }, 400, origin)
  if (email === String(user.email ?? '').toLowerCase()) return json({ error: 'O administrador atual já possui esta conta.' }, 409, origin)

  const redirectTo = Deno.env.get('AUTH_INVITE_REDIRECT_URL')
  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: name },
    ...(redirectTo ? { redirectTo } : {}),
  })
  if (inviteError || !invited.user) {
    const message = inviteError?.message?.toLowerCase().includes('already')
      ? 'Este e-mail já possui uma conta no Supabase Auth.'
      : inviteError?.message ?? 'Não foi possível enviar o convite.'
    return json({ error: message }, 409, origin)
  }

  const { error: upsertError } = await adminClient.from('profiles').upsert({
    id: invited.user.id,
    full_name: name,
    role,
    shift_name: shift || null,
    active: true,
  }, { onConflict: 'id' })
  if (upsertError) {
    await adminClient.auth.admin.deleteUser(invited.user.id)
    return json({ error: 'Convite criado, mas não foi possível preparar o perfil. A operação foi desfeita.' }, 500, origin)
  }

  return json({ user: { id: invited.user.id, name, email, role, shift } }, 201, origin)
})
