import { describe, expect, it } from 'vitest'
import { canAccessReleaseBoard, canManageOperationalData, canManageProfiles, canViewReports, getRoleLabel } from './roleRules'

describe('regras de acesso', () => {
  it('permite operadores e supervisores ao painel operacional', () => {
    expect(canAccessReleaseBoard('operador')).toBe(true)
    expect(canAccessReleaseBoard('supervisor')).toBe(true)
    expect(canAccessReleaseBoard('administrador')).toBe(true)
  })

  it('bloqueia acesso sem perfil ativo', () => {
    expect(canAccessReleaseBoard(null)).toBe(false)
    expect(canAccessReleaseBoard('inativo' as any)).toBe(false)
  })

  it('só administrador gerencia perfis', () => {
    expect(canManageProfiles('administrador')).toBe(true)
    expect(canManageProfiles('supervisor')).toBe(false)
  })

  it('operações de gravação ficam restritas ao operador e administrador', () => {
    expect(canManageOperationalData('operador')).toBe(true)
    expect(canManageOperationalData('supervisor')).toBe(false)
    expect(canManageOperationalData('administrador')).toBe(true)
    expect(canViewReports('administrador')).toBe(true)
    expect(canViewReports('operador')).toBe(true)
  })

  it('formata o papel do usuário', () => {
    expect(getRoleLabel('operador')).toBe('Operador')
    expect(getRoleLabel('supervisor')).toBe('Supervisor')
  })
})
