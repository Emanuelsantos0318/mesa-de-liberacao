import { describe, expect, it } from 'vitest'
import { hasPasswordRecoveryToken, validateResetEmail } from './AuthScreen'

describe('recuperação de senha', () => {
  it('valida e-mails corretamente antes de enviar o link', () => {
    expect(validateResetEmail('')).toContain('e-mail')
    expect(validateResetEmail('teste@')).toContain('válido')
    expect(validateResetEmail(' usuario@teste.com ')).toBeNull()
  })

  it('reconhece o link de recuperação com token do Supabase', () => {
    const location = {
      pathname: '/reset-password',
      search: '',
      hash: '#access_token=abc&type=recovery',
    } as Location

    expect(hasPasswordRecoveryToken(location)).toBe(true)
  })
})
