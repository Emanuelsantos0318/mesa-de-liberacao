import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const email = process.env.SUPABASE_TEST_EMAIL
const password = process.env.SUPABASE_TEST_PASSWORD

if (!url || !key || !email || !password) {
  throw new Error('Defina VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_TEST_EMAIL e SUPABASE_TEST_PASSWORD apenas no ambiente de teste.')
}
if (process.env.SUPABASE_ALLOW_TEST_USER !== 'true') {
  throw new Error('Este script só pode ser executado com SUPABASE_ALLOW_TEST_USER=true em um projeto de homologação.')
}

const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    emailRedirectTo: 'http://localhost:5173',
  },
})

console.log(JSON.stringify({ email, user: data?.user ?? null, session: data?.session ?? null, error }, null, 2))

if (data?.user) {
  const { data: existingProfile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle()

  console.log(JSON.stringify({ existingProfile, profileError }, null, 2))

  const { data: updatedProfile, error: updateError } = await supabase
    .from('profiles')
    .update({
      full_name: 'Usuário Teste',
      role: 'operador',
      active: true,
      shift_name: 'Turno 1',
    })
    .eq('id', data.user.id)
    .select()

  console.log(JSON.stringify({ updatedProfile, updateError }, null, 2))
}
