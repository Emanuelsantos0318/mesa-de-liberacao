import { useEffect, useState } from 'react'
import { supabase } from '../services/supabase'

export function normalizeResetEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function validateResetEmail(value: string): string | null {
  const email = normalizeResetEmail(value)
  if (!email) return 'Informe o e-mail cadastrado.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Informe um e-mail válido.'
  return null
}

export function hasPasswordRecoveryToken(location?: Pick<Location, 'pathname' | 'search' | 'hash'>): boolean {
  const current = location ?? (typeof window !== 'undefined' ? window.location : null)
  if (!current) return false
  const raw = `${current.pathname}${current.search}${current.hash}`
  return /reset-password|type=recovery|access_token=|token_hash=|code=/.test(raw)
}

function describeAuthError(error: { message?: string; code?: string; status?: number } | null): string {
  if (!error) return 'Erro desconhecido de autenticação.'
  const details = [error.message, error.code, error.status ? `HTTP ${error.status}` : ''].filter(Boolean)
  return details.length ? details.join(' · ') : 'Erro desconhecido de autenticação.'
}

export function AuthScreen({ missingProfile = false, resetMode = false }: { missingProfile?: boolean; resetMode?: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)

  useEffect(() => {
    if (!resetMode || !supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setError('Link de recuperação inválido ou expirado. Solicite um novo envio.')
      }
    })
  }, [resetMode])

  const login = async (event: React.FormEvent) => {
    event.preventDefault(); if (!supabase) return
    setBusy(true); setError(''); setSuccess('')
    const { error: authError } = await supabase.auth.signInWithPassword({ email: normalizeResetEmail(email), password })
    setBusy(false)
    if (authError) setError(`Não foi possível entrar: ${describeAuthError(authError)}`)
  }

  const requestPasswordReset = async () => {
    const emailError = validateResetEmail(email)
    if (emailError) {
      setError(emailError)
      return
    }

    if (!supabase) {
      setError('O serviço de autenticação ainda não está configurado.')
      return
    }

    setResetBusy(true); setError(''); setSuccess('')
    const redirectTo = `${window.location.origin}/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeResetEmail(email), {
      redirectTo,
    })
    setResetBusy(false)

    if (error) {
      setError(`Não foi possível enviar o link: ${describeAuthError(error)}`)
      return
    }

    setSuccess('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.')
  }

  const updatePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    if (password.length < 8) {
      setError('A senha nova deve ter pelo menos 8 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError('As senhas não conferem.')
      return
    }

    setBusy(true); setError(''); setSuccess('')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)

    if (updateError) {
      setError(`Não foi possível alterar a senha: ${describeAuthError(updateError)}`)
      return
    }

    setSuccess('Senha redefinida com sucesso. Você já pode entrar com a nova senha.')
    setPassword('')
    setConfirmPassword('')
    setTimeout(() => {
      window.location.href = '/'
    }, 1200)
  }

  if (resetMode) {
    return <main className="auth"><section><div className="auth-brand">LBGS<small>MESA DE LIBERAÇÃO · HGRS</small></div><h1>Redefinir senha</h1><p>Crie uma nova senha para acessar o painel operacional.</p><form onSubmit={updatePassword}><label>Nova senha<input type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} /></label><label>Confirmar nova senha<input type="password" autoComplete="new-password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></label>{error && <div className="auth-error">{error}</div>}{success && <div className="auth-success">{success}</div>}<button className="primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar nova senha'}</button></form></section></main>
  }

  return <main className="auth"><section><div className="auth-brand">LBGS<small>MESA DE LIBERAÇÃO · HGRS</small></div><h1>Acesso do operador</h1><p>{missingProfile ? 'Seu cadastro foi autenticado, mas o perfil ativo não foi encontrado ou está inativo. Solicite provisionamento do administrador.' : 'Entre com sua conta institucional para continuar.'}</p><form onSubmit={login}><label>E-mail<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label><label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>{error && <div className="auth-error">{error}</div>}{success && <div className="auth-success">{success}</div>}<button className="primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button></form><div style={{ marginTop: 12 }}><button type="button" className="secondary" disabled={resetBusy} onClick={requestPasswordReset}>{resetBusy ? 'Enviando…' : 'Esqueci minha senha'}</button></div><small>Solicite o cadastro ao administrador da Mesa de Liberação.</small></section></main>
}
