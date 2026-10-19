import { describe, expect, it } from 'vitest'
import { resolveAuthGate } from './App'

describe('resolveAuthGate', () => {
  it('prioriza o reset de senha quando o link de recuperação está ativo', () => {
    expect(
      resolveAuthGate({
        loading: false,
        session: { user: { id: 'u-1' } } as any,
        profile: { id: 'u-1', full_name: 'Teste', role: 'administrador', active: true, shift_name: 'Turno 1' },
        isProfileActive: true,
        role: 'administrador',
        passwordResetRequested: true,
      }),
    ).toBe('reset')
  })

  it('mostra login quando não há sessão ativa', () => {
    expect(
      resolveAuthGate({
        loading: false,
        session: null,
        profile: null,
        isProfileActive: false,
        role: null,
        passwordResetRequested: false,
      }),
    ).toBe('login')
  })
})
