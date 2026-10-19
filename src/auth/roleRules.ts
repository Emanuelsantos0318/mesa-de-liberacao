export type UserRole = 'operador' | 'supervisor' | 'administrador'

export const roleList: UserRole[] = ['operador', 'supervisor', 'administrador']

export function normalizeRole(role?: string | null): UserRole | null {
  if (!role) return null
  const normalized = role.trim().toLowerCase()
  return roleList.includes(normalized as UserRole) ? (normalized as UserRole) : null
}

export function canAccessReleaseBoard(role?: string | null): boolean {
  return normalizeRole(role) !== null
}

export function canManageOperationalData(role?: string | null): boolean {
  const normalized = normalizeRole(role)
  return normalized === 'operador' || normalized === 'administrador'
}

export function canViewReports(role?: string | null): boolean {
  return normalizeRole(role) !== null
}

export function canManageProfiles(role?: string | null): boolean {
  return normalizeRole(role) === 'administrador'
}

export function getRoleLabel(role?: string | null): string {
  switch (normalizeRole(role)) {
    case 'operador': return 'Operador'
    case 'supervisor': return 'Supervisor'
    case 'administrador': return 'Administrador'
    default: return 'Sem perfil'
  }
}
