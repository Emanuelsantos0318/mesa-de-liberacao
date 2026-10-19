import type { Patient, PatientStatus, ReleaseStatus } from '../types'

const validTransitions: Record<PatientStatus, PatientStatus[]> = {
  Ativo: ['Ativo', 'Suspenso', 'Alta', 'Óbito'],
  Suspenso: ['Ativo', 'Alta', 'Óbito'],
  Alta: ['Alta'],
  Óbito: ['Óbito'],
}

export const releaseBlockedMessage = (patient: Pick<Patient, 'status' | 'diet'> & { fasting?: boolean }): string | null => {
  if (patient.status === 'Alta') return 'Não é possível liberar: paciente com alta.'
  if (patient.status === 'Óbito') return 'Não é possível liberar: paciente com óbito registrado.'
  if (patient.status === 'Suspenso') return 'Não é possível liberar: paciente suspenso.'
  if (!patient.diet.trim()) return 'Não é possível liberar: dieta vigente não informada.'
  if (patient.fasting) return 'Paciente em jejum. Aguarde o encerramento do jejum e uma nova dieta.'
  return null
}

export const canChangeTo = (current: PatientStatus, target: PatientStatus) => {
  return validTransitions[current]?.includes(target) ?? false
}

export const canCreateAdmission = (status: PatientStatus, hasActiveAdmission: boolean) => {
  if (status === 'Alta' || status === 'Óbito') return false
  return !hasActiveAdmission
}

export const admissionBlockedMessage = (status: PatientStatus, hasActiveAdmission: boolean): string | null => {
  if (status === 'Alta' || status === 'Óbito') return 'Não é possível abrir nova internação para paciente encerrado.'
  if (hasActiveAdmission) return 'Já existe uma internação ativa para este paciente.'
  return null
}

export const canAdvanceReleaseStatus = (current: ReleaseStatus, next: ReleaseStatus) => {
  if (current === 'Cancelado' || current === 'Entregue') return false
  if (next === 'Cancelado') return true
  const order: ReleaseStatus[] = ['Pendente', 'Impresso', 'Entregue', 'Cancelado']
  return order.indexOf(next) > order.indexOf(current)
}

export const releaseStatusBlockedMessage = (current: ReleaseStatus, next: ReleaseStatus): string | null => {
  if (current === 'Cancelado') return 'Liberação cancelada não pode ser reaberta.'
  if (current === 'Entregue') return 'Liberação já entregue e não pode ser alterada.'
  if (next === 'Cancelado') return 'Liberação pode ser cancelada apenas enquanto ainda não foi entregue.'
  const order: ReleaseStatus[] = ['Pendente', 'Impresso', 'Entregue', 'Cancelado']
  if (order.indexOf(next) <= order.indexOf(current)) return 'Este status não é válido para a etapa atual da liberação.'
  return null
}

export const dietUpdateBlockedMessage = (diet: string, requester: string): string | null => {
  if (!diet.trim()) return 'Informe a dieta vigente antes de registrar a prescrição.'
  if (!requester.trim()) return 'Informe o solicitante da prescrição de dieta.'
  return null
}

export const normalizeName = (value: string | null | undefined) => value?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() ?? ''

export const matchesUserContext = (requester: string | null | undefined, selectedUserContext: string): boolean => {
  if (!selectedUserContext || selectedUserContext === 'Todos') return true
  return normalizeName(requester) === normalizeName(selectedUserContext)
}

export const resolveUserShift = (selectedUser: string, users: Array<{ name: string; shift: string }>): 'Todos' | 'Manhã' | 'Tarde' | 'Noite' => {
  if (!selectedUser || selectedUser === 'Todos') return 'Todos'
  const match = users.find((user) => normalizeName(user.name) === normalizeName(selectedUser))
  if (!match) return 'Todos'
  return (match.shift === 'Manhã' || match.shift === 'Tarde' || match.shift === 'Noite' ? match.shift : 'Todos') as 'Todos' | 'Manhã' | 'Tarde' | 'Noite'
}

export const matchesShiftContext = (requester: string | null | undefined, selectedShiftContext: string, shiftByRequester: Record<string, string> = {}): boolean => {
  if (!selectedShiftContext || selectedShiftContext === 'Todos') return true
  const normalizedRequester = normalizeName(requester)
  return normalizedRequester ? shiftByRequester[normalizedRequester] === selectedShiftContext : false
}

export const canTransferPatient = (
  current: Pick<Patient, 'status' | 'ward' | 'bed'>,
  destination: { ward: string; bed: string },
  occupiedBeds: Array<{ patientId: string; ward: string; bed: string }>,
  currentPatientId: string
) => {
  if (current.status === 'Alta' || current.status === 'Óbito') return false
  if (!destination.ward.trim() || !destination.bed.trim()) return false
  const normalizeLocation = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  if (normalizeLocation(current.ward) === normalizeLocation(destination.ward) && normalizeLocation(current.bed) === normalizeLocation(destination.bed)) return false

  const conflict = occupiedBeds.some(
    bed => bed.patientId !== currentPatientId
      && normalizeLocation(bed.ward) === normalizeLocation(destination.ward)
      && normalizeLocation(bed.bed) === normalizeLocation(destination.bed)
  )

  return !conflict
}

export const transferBlockedMessage = (
  current: Pick<Patient, 'status' | 'ward' | 'bed'>,
  destination: { ward: string; bed: string },
  occupiedBeds: Array<{ patientId: string; ward: string; bed: string }>,
  currentPatientId: string
): string | null => {
  if (current.status === 'Alta' || current.status === 'Óbito') return 'Não é possível transferir paciente encerrado.'
  if (!destination.ward.trim() || !destination.bed.trim()) return 'Informe enfermaria e leito de destino.'
  const normalizeLocation = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  if (normalizeLocation(current.ward) === normalizeLocation(destination.ward) && normalizeLocation(current.bed) === normalizeLocation(destination.bed)) return 'O leito de destino deve ser diferente do atual.'

  const conflict = occupiedBeds.some(
    bed => bed.patientId !== currentPatientId
      && normalizeLocation(bed.ward) === normalizeLocation(destination.ward)
      && normalizeLocation(bed.bed) === normalizeLocation(destination.bed)
  )

  if (conflict) return 'Leito de destino ocupado por outro paciente.'

  return null
}

export const mealLabels = ['Desjejum', 'Colação', 'Almoço', 'Lanche', 'Lanche Reforçado', 'Ceia Completa', 'Ceia Leve'] as const

export const buildMealConsumptionSummary = <T extends { meal: string }>(releases: T[]) => {
  const counts = Object.fromEntries(mealLabels.map((label) => [label, 0])) as Record<(typeof mealLabels)[number], number>

  for (const release of releases) {
    if (release.meal in counts) counts[release.meal as (typeof mealLabels)[number]] += 1
  }

  const max = Math.max(1, ...mealLabels.map((label) => counts[label] ?? 0))

  return mealLabels.map((label) => ({
    label,
    count: counts[label] ?? 0,
    percent: (counts[label] ?? 0) / max,
  }))
}

export const buildAuditSummary = <T extends { action: string; detail: string; at: string }>(entries: T[], filter: 'Todos' | 'Paciente' | 'Liberação' | 'Dieta' | 'Sistema' = 'Todos') => {
  const normalize = (value: string) => value.toLowerCase()
  const categoryOf = (action: string): 'Paciente' | 'Liberação' | 'Dieta' | 'Sistema' => {
    const text = normalize(action)
    if (text.includes('liberação') || text.includes('entreg') || text.includes('cancel') || text.includes('impress')) return 'Liberação'
    if (text.includes('dieta') || text.includes('prescrição') || text.includes('nutri')) return 'Dieta'
    if (text.includes('paciente') || text.includes('interna') || text.includes('transfer') || text.includes('alta') || text.includes('óbito') || text.includes('obito')) return 'Paciente'
    return 'Sistema'
  }

  return [...entries]
    .filter((entry) => filter === 'Todos' || categoryOf(entry.action) === filter)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .map((entry) => ({ ...entry, category: categoryOf(entry.action) }))
}

export const buildAuditCsv = <T extends { action: string; detail: string; category: string; at: string }>(rows: T[]) => {
  const escapeCsvValue = (value: string | number | undefined | null) => {
    const text = String(value ?? '')
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }

  const header = ['Ação', 'Categoria', 'Detalhe', 'Data']
  const values = rows.map((row) => [row.action, row.category, row.detail, new Date(row.at).toLocaleString('pt-BR')])

  return [header, ...values].map((row) => row.map((cell) => escapeCsvValue(cell)).join(',')).join('\n')
}

const escapeCsvValue = (value: string | number | undefined | null) => {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export const buildReleaseCsv = <T extends {
  patientName: string
  record?: string
  bed?: string
  meal: string
  exitTime: string
  status: ReleaseStatus
  requester?: string
  diet?: string
}>(rows: T[]) => {
  const header = ['Paciente', 'Prontuário', 'Leito', 'Refeição', 'Hora', 'Status', 'Solicitante']
  const content = rows.map((row) => [
    row.patientName,
    row.record ?? '',
    row.bed ?? '',
    row.meal,
    row.exitTime,
    row.status,
    row.requester ?? '',
  ])

  return [header, ...content].map((row) => row.map((cell) => escapeCsvValue(cell)).join(',')).join('\n')
}

export const buildShiftSummary = <T extends { status: ReleaseStatus }>(releases: T[], currentDate = new Date()) => {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bahia', hour: '2-digit', hourCycle: 'h23' }).formatToParts(currentDate).find((part) => part.type === 'hour')?.value ?? 0)
  const shiftName = hour < 12 ? 'Manhã' : hour < 18 ? 'Tarde' : 'Noite'

  return {
    shiftName,
    pendentes: releases.filter((release) => release.status === 'Pendente').length,
    impressos: releases.filter((release) => release.status === 'Impresso').length,
    entregues: releases.filter((release) => release.status === 'Entregue').length,
    totais: releases.length,
  }
}
