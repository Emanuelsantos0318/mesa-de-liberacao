import { supabase } from '../services/supabase'
import type { Admission, AuditEvent, DietPrescription, Movement, Patient, Release, ReleaseStatus } from '../types'

const key = 'mesa-liberacao-v1'
const pendingSyncKey = 'mesa-liberacao-pending-sync-v1'

const patients: Patient[] = [
  { id: 'p1', record: 'HGRS-018472', name: 'Ana Clara dos Santos', ward: '3B', wing: 'Clínica médica', bed: '312-A', status: 'Ativo', diet: 'Hipossódica', restrictions: 'Alergia a lactose', companion: 'Maria dos Santos', updatedAt: new Date().toISOString() },
  { id: 'p2', record: 'HGRS-021981', name: 'João Pedro Almeida', ward: '2A', wing: 'Ortopedia', bed: '208-B', status: 'Ativo', diet: 'Branda', restrictions: 'Sem restrições', companion: '', updatedAt: new Date().toISOString() },
  { id: 'p3', record: 'HGRS-013564', name: 'Rosa Ferreira Lima', ward: '4C', wing: 'Neurologia', bed: '425-A', status: 'Suspenso', diet: 'Diabética', restrictions: 'Diabetes mellitus', companion: 'Antônio Lima', updatedAt: new Date().toISOString() },
]

const admissions: Admission[] = [
  { id: 'a1', patientId: 'p1', ward: '3B', wing: 'Clínica médica', bed: '312-A', status: 'Ativo', companion: 'Maria dos Santos', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'a2', patientId: 'p2', ward: '2A', wing: 'Ortopedia', bed: '208-B', status: 'Ativo', companion: '', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'a3', patientId: 'p3', ward: '4C', wing: 'Neurologia', bed: '425-A', status: 'Suspenso', companion: 'Antônio Lima', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
]

const releases: Release[] = [
  { id: 'r1', patientId: 'p1', meal: 'Almoço', exitTime: '11:30', status: 'Pendente', requester: 'Dra. Helena', notes: 'Sem açúcar', createdAt: new Date().toISOString() },
  { id: 'r2', patientId: 'p2', meal: 'Almoço', exitTime: '11:45', status: 'Impresso', requester: 'Nutri. Carla', notes: '', createdAt: new Date().toISOString() },
]

const movements: Movement[] = [
  { id: 'm1', patientId: 'p1', type: 'internacao', detail: 'Internação registrada na enfermaria 3B', at: new Date().toISOString(), actor: 'Operador' },
  { id: 'm2', patientId: 'p2', type: 'internacao', detail: 'Paciente admitido em 2A', at: new Date().toISOString(), actor: 'Operador' },
  { id: 'm3', patientId: 'p3', type: 'suspensao', detail: 'Paciente suspenso por conferência', at: new Date().toISOString(), actor: 'Operador' },
]

const dietPrescriptions: DietPrescription[] = [
  { id: 'd1', patientId: 'p1', diet: 'Hipossódica', restrictions: 'Alergia a lactose', requester: 'Dra. Helena', notes: 'Sem excesso de sal', issuedAt: new Date().toISOString(), active: true },
  { id: 'd2', patientId: 'p2', diet: 'Branda', restrictions: 'Sem restrições', requester: 'Nutri. Carla', notes: 'Manter hidratação', issuedAt: new Date().toISOString(), active: true },
  { id: 'd3', patientId: 'p3', diet: 'Diabética', restrictions: 'Diabetes mellitus', requester: 'Nutri. Rayane', notes: 'Monitorar glicemia', issuedAt: new Date().toISOString(), active: true },
]

export interface Db { patients: Patient[]; releases: Release[]; audit: AuditEvent[]; admissions: Admission[]; movements: Movement[]; dietPrescriptions: DietPrescription[] }
export type SyncTable = 'patients' | 'admissions' | 'diet_prescriptions' | 'releases' | 'movements'

const normalizeStatus = (value: unknown, fallback: Patient['status']): Patient['status'] => {
  const status = String(value ?? '').trim().toLowerCase()
  const map: Record<string, Patient['status']> = {
    ativo: 'Ativo',
    suspenso: 'Suspenso',
    alta: 'Alta',
    obito: 'Óbito',
  }

  return map[status] ?? fallback
}

const normalizeReleaseStatus = (value: unknown, fallback: Release['status']): Release['status'] => {
  const status = String(value ?? '').trim().toLowerCase()
  const map: Record<string, Release['status']> = {
    pendente: 'Pendente',
    impresso: 'Impresso',
    entregue: 'Entregue',
    cancelado: 'Cancelado',
  }

  return map[status] ?? fallback
}

const normalizeMovementType = (value: unknown): Movement['type'] => {
  const type = String(value ?? '').trim().toLowerCase()
  const map: Record<string, Movement['type']> = {
    admissao: 'internacao',
    transferencia: 'transferencia',
    suspensao: 'suspensao',
    reativacao: 'reativacao',
    alta: 'alta',
    obito: 'obito',
  }

  return map[type] ?? 'internacao'
}

export const adaptSupabaseDb = (value: Record<string, any> | null | undefined): Partial<Db> => {
  if (!value) return {}

  const patientRows = Array.isArray(value.patients) ? value.patients : []
  const admissionRows = Array.isArray(value.admissions) ? value.admissions : []
  const dietRows = Array.isArray(value.diet_prescriptions) ? value.diet_prescriptions : []
  const releaseRows = Array.isArray(value.releases) ? value.releases : []
  const movementRows = Array.isArray(value.movements) ? value.movements : []
  const auditRows = Array.isArray(value.audit_events) ? value.audit_events : []

  const admissionMap = new Map<string, { patientId: string }>()
  for (const row of admissionRows) {
    if (row?.id) admissionMap.set(String(row.id), { patientId: row.patient_id ?? row.patientId ?? '' })
  }

  const latestAdmissionByPatient = new Map<string, any>()
  for (const row of admissionRows) {
    const patientId = String(row.patient_id ?? row.patientId ?? '')
    if (!patientId) continue

    const current = latestAdmissionByPatient.get(patientId)
    const currentTime = current ? new Date(current.updated_at ?? current.updatedAt ?? 0).getTime() : Number.NEGATIVE_INFINITY
    const candidateTime = new Date(row.updated_at ?? row.updatedAt ?? row.started_at ?? row.startedAt ?? 0).getTime()
    if (!current || candidateTime > currentTime) {
      latestAdmissionByPatient.set(patientId, row)
    }
  }

  const activeDietByPatient = new Map<string, any>()
  for (const row of dietRows) {
    if (!row?.active) continue
    const patientId = admissionMap.get(String(row.admission_id ?? row.admissionId))?.patientId ?? row.patient_id ?? row.patientId ?? ''
    if (!patientId) continue
    const current = activeDietByPatient.get(patientId)
    const currentTime = current ? new Date(current.effective_at ?? current.issuedAt ?? 0).getTime() : Number.NEGATIVE_INFINITY
    const candidateTime = new Date(row.effective_at ?? row.issuedAt ?? 0).getTime()
    if (!current || candidateTime > currentTime) {
      activeDietByPatient.set(patientId, row)
    }
  }

  const mappedPatients: Patient[] = patientRows.map((row) => {
    const patientId = String(row.id)
    const latestAdmission = latestAdmissionByPatient.get(patientId)
    const activeDiet = activeDietByPatient.get(patientId)

    return {
      id: row.id,
      record: row.hospital_record ?? row.record ?? '',
      name: row.full_name ?? row.name ?? '',
      ward: latestAdmission?.ward ?? row.ward ?? '',
      wing: latestAdmission?.wing ?? row.wing ?? '',
      bed: latestAdmission?.bed ?? row.bed ?? '',
      status: normalizeStatus(latestAdmission?.status ?? row.status ?? row.patient_status, 'Ativo'),
      diet: activeDiet?.diet_name ?? activeDiet?.diet ?? row.diet ?? row.diet_name ?? '',
      restrictions: activeDiet?.restrictions ?? row.restrictions ?? '',
      companion: latestAdmission?.companion_name ?? row.companion_name ?? row.companion ?? '',
      fasting: Boolean(latestAdmission?.fasting_active ?? latestAdmission?.fasting ?? row.fasting_active ?? row.fasting ?? false),
      fastingStartedAt: latestAdmission?.fasting_started_at ?? latestAdmission?.fastingStartedAt ?? row.fasting_started_at ?? undefined,
      fastingReason: latestAdmission?.fasting_reason ?? latestAdmission?.fastingReason ?? row.fasting_reason ?? '',
      fastingAuthorizedBy: latestAdmission?.fasting_authorized_by ?? latestAdmission?.fastingAuthorizedBy ?? row.fasting_authorized_by ?? '',
      updatedAt: latestAdmission?.updated_at ?? latestAdmission?.updatedAt ?? row.updated_at ?? row.updatedAt ?? new Date().toISOString(),
    }
  })

  const mappedAdmissions: Admission[] = admissionRows.map((row) => ({
    id: row.id,
    patientId: row.patient_id ?? row.patientId ?? admissionMap.get(String(row.id))?.patientId ?? '',
    ward: row.ward ?? '',
    wing: row.wing ?? '',
    bed: row.bed ?? '',
    status: normalizeStatus(row.status ?? row.admission_status, 'Ativo'),
    companion: row.companion_name ?? row.companion ?? '',
    startedAt: row.started_at ?? row.startedAt ?? new Date().toISOString(),
    endedAt: row.ended_at ?? row.endedAt ?? undefined,
    updatedAt: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),
    fasting: Boolean(row.fasting_active ?? row.fasting ?? false),
    fastingStartedAt: row.fasting_started_at ?? row.fastingStartedAt ?? undefined,
    fastingReason: row.fasting_reason ?? row.fastingReason ?? '',
    fastingAuthorizedBy: row.fasting_authorized_by ?? row.fastingAuthorizedBy ?? '',
  }))

  const mappedDietPrescriptions: DietPrescription[] = dietRows.map((row) => ({
    id: row.id,
    patientId: admissionMap.get(String(row.admission_id ?? row.admissionId))?.patientId ?? row.patient_id ?? row.patientId ?? '',
    diet: row.diet_name ?? row.diet ?? '',
    restrictions: row.restrictions ?? '',
    requester: row.requester_name ?? row.requester ?? '',
    notes: row.notes ?? '',
    issuedAt: row.effective_at ?? row.issuedAt ?? new Date().toISOString(),
    replacedAt: row.replaced_at ?? row.replacedAt ?? undefined,
    active: Boolean(row.active ?? true),
  }))

  const mappedReleases: Release[] = releaseRows.map((row) => ({
    id: row.id,
    patientId: admissionMap.get(String(row.admission_id ?? row.admissionId))?.patientId ?? row.patient_id ?? row.patientId ?? '',
    meal: row.meal_name ?? row.meal ?? '',
    exitTime: toLocalExitTime(row.exit_at ?? row.exitTime ?? ''),
    status: normalizeReleaseStatus(row.status, 'Pendente'),
    requester: row.requester_name ?? row.requester ?? '',
    notes: row.notes ?? '',
    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
    audience: row.audience === 'companion' ? 'companion' : 'patient',
    labelCopies: Math.min(3, Math.max(1, Number(row.label_copies ?? 1))),
    printedAt: row.printed_at ?? row.printedAt ?? undefined,
    printedBy: row.printed_by ?? row.printedBy ?? undefined,
    deliveredAt: row.delivered_at ?? row.deliveredAt ?? undefined,
    deliveredBy: row.delivered_by ?? row.deliveredBy ?? undefined,
    cancelledAt: row.cancelled_at ?? row.cancelledAt ?? undefined,
    cancelledBy: row.cancelled_by ?? row.cancelledBy ?? undefined,
  }))

  const mappedMovements: Movement[] = movementRows.map((row) => ({
    id: row.id,
    patientId: admissionMap.get(String(row.admission_id ?? row.admissionId))?.patientId ?? row.patient_id ?? row.patientId ?? '',
    type: normalizeMovementType(row.movement_type ?? row.type),
    detail: typeof row.details === 'string' ? row.details : row.details && typeof row.details === 'object' ? JSON.stringify(row.details) : row.detail ?? 'Movimentação registrada',
    at: row.created_at ?? row.at ?? new Date().toISOString(),
    actor: row.created_by ?? row.actor ?? 'Operador',
  }))

  const mappedAudit: AuditEvent[] = auditRows.map((row) => ({
    id: row.id,
    at: row.created_at ?? row.at ?? new Date().toISOString(),
    action: row.action ?? 'update',
    detail: `${row.table_name ?? 'registro'} • ${row.action ?? 'ação'} • ${row.record_id ?? row.recordId ?? 'sem identificador'}`,
  }))

  return {
    patients: mappedPatients,
    admissions: mappedAdmissions,
    dietPrescriptions: mappedDietPrescriptions,
    releases: mappedReleases,
    movements: mappedMovements,
    audit: mappedAudit,
  }
}

const toRemoteStatus = (value: string | undefined | null): string => {
  const normalized = String(value ?? 'ativo').trim().toLowerCase()
  const statusMap: Record<string, string> = { ativo: 'ativo', suspenso: 'suspenso', alta: 'alta', óbito: 'obito', obito: 'obito' }
  return statusMap[normalized] ?? 'ativo'
}

const toRemoteReleaseStatus = (value: ReleaseStatus): string => {
  const normalized = String(value ?? 'Pendente').trim().toLowerCase()
  return { pendente: 'pendente', impresso: 'impresso', entregue: 'entregue', cancelado: 'cancelado' }[normalized] ?? 'pendente'
}

const toRemoteMovementType = (value: Movement['type']): string => value === 'internacao' ? 'admissao' : value

const toLocalExitTime = (value: unknown): string => {
  const text = String(value ?? '')
  if (/^\d{2}:\d{2}$/.test(text)) return text
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date)
  return `${parts.find((part) => part.type === 'hour')?.value ?? '00'}:${parts.find((part) => part.type === 'minute')?.value ?? '00'}`
}

const toRemoteExitAt = (exitTime: string, createdAt: string): string => {
  if (/^\d{4}-\d{2}-\d{2}T/.test(exitTime)) return new Date(exitTime).toISOString()
  const created = new Date(createdAt)
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(created)
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970'
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'
  const day = parts.find((part) => part.type === 'day')?.value ?? '01'
  const time = /^\d{2}:\d{2}$/.test(exitTime) ? exitTime : '00:00'
  return new Date(`${year}-${month}-${day}T${time}:00-03:00`).toISOString()
}

export const toSupabaseDb = (value: Partial<Db> | null | undefined, actorId?: string): Record<string, any> => {
  const db = normalizeDb(value)
  const admissionIdByPatient = new Map<string, string>()
  for (const admission of db.admissions) {
    admissionIdByPatient.set(admission.patientId, admission.id)
  }

  const normalizedAdmissions = [...db.admissions]
  for (const patient of db.patients) {
    if (admissionIdByPatient.has(patient.id)) continue
    const generatedId = uid()
    normalizedAdmissions.push({
      id: generatedId,
      patientId: patient.id,
      ward: patient.ward || 'Não informado',
      wing: patient.wing || 'Não informado',
      bed: patient.bed || 'Não informado',
      status: patient.status,
      companion: patient.companion || '',
      startedAt: patient.updatedAt,
      updatedAt: patient.updatedAt,
      fasting: Boolean(patient.fasting),
      fastingStartedAt: patient.fastingStartedAt,
      fastingReason: patient.fastingReason,
      fastingAuthorizedBy: patient.fastingAuthorizedBy,
    })
    admissionIdByPatient.set(patient.id, generatedId)
  }

  // O índice parcial one_active_diet_per_admission exige que nunca
  // serializemos duas prescrições ativas para a mesma internação. O estado
  // local pode conter duplicatas após uma edição offline; neste ponto
  // normalizamos a carga e mantemos a prescrição ativa mais recente.
  const dietPrescriptions = [...db.dietPrescriptions]
  const activeByAdmission = new Map<string, DietPrescription>()
  for (const prescription of dietPrescriptions) {
    if (!prescription.active) continue
    const admissionId = admissionIdByPatient.get(prescription.patientId)
    if (!admissionId) continue
    const current = activeByAdmission.get(admissionId)
    const currentTime = current ? Date.parse(current.issuedAt) : Number.NEGATIVE_INFINITY
    const prescriptionTime = Date.parse(prescription.issuedAt)
    if (!current || (Number.isFinite(prescriptionTime) ? prescriptionTime : 0) >= (Number.isFinite(currentTime) ? currentTime : 0)) {
      activeByAdmission.set(admissionId, prescription)
    }
  }

  const normalizedDietPrescriptions = dietPrescriptions.map((prescription) => {
    const admissionId = admissionIdByPatient.get(prescription.patientId)
    const winner = admissionId ? activeByAdmission.get(admissionId) : undefined
    return prescription.active && winner && winner.id !== prescription.id
      ? { ...prescription, active: false, replacedAt: prescription.replacedAt ?? new Date().toISOString() }
      : prescription
  })

  const activePrescriptionByPatient = new Map<string, string>()
  for (const prescription of activeByAdmission.values()) {
    activePrescriptionByPatient.set(prescription.patientId, prescription.id)
  }

  for (const release of db.releases) {
    if (activePrescriptionByPatient.has(release.patientId)) continue
    const patient = db.patients.find((item) => item.id === release.patientId)
    const fallbackPrescription = {
      id: uid(),
      patientId: release.patientId,
      diet: patient?.diet || 'Dieta não informada',
      restrictions: patient?.restrictions || '',
      requester: release.requester || 'Sistema',
      notes: 'Prescrição gerada automaticamente para liberação.',
      issuedAt: release.createdAt,
      active: true,
    }
    normalizedDietPrescriptions.push(fallbackPrescription)
    activeByAdmission.set(admissionIdByPatient.get(release.patientId)!, fallbackPrescription)
    activePrescriptionByPatient.set(release.patientId, fallbackPrescription.id)
  }

  const createdBy = actorId ?? null

  return {
    patients: db.patients.map((patient) => ({
      id: patient.id,
      hospital_record: patient.record,
      full_name: patient.name,
      ward: patient.ward,
      wing: patient.wing,
      bed: patient.bed,
      status: toRemoteStatus(patient.status),
      diet: patient.diet,
      restrictions: patient.restrictions,
      companion_name: patient.companion,
      updated_at: patient.updatedAt,
    })),
    admissions: normalizedAdmissions.map((admission) => ({
      id: admission.id,
      patient_id: admission.patientId,
      ward: admission.ward,
      wing: admission.wing,
      bed: admission.bed,
      status: toRemoteStatus(admission.status),
      companion_name: admission.companion,
      started_at: admission.startedAt,
      ended_at: admission.endedAt ?? null,
      updated_at: admission.updatedAt,
      created_by: createdBy,
      fasting_active: Boolean(admission.fasting),
      fasting_started_at: admission.fastingStartedAt ?? null,
      fasting_reason: admission.fastingReason ?? '',
      fasting_authorized_by: admission.fastingAuthorizedBy ?? null,
    })),
    diet_prescriptions: normalizedDietPrescriptions.map((prescription) => ({
      id: prescription.id,
      admission_id: admissionIdByPatient.get(prescription.patientId) ?? null,
      diet_name: prescription.diet,
      restrictions: prescription.restrictions,
      requester_name: prescription.requester,
      notes: prescription.notes,
      active: Boolean(prescription.active),
      effective_at: prescription.issuedAt,
      replaced_at: prescription.replacedAt ?? null,
      created_by: createdBy,
    })),
    releases: db.releases.map((release) => ({
      id: release.id,
      admission_id: admissionIdByPatient.get(release.patientId) ?? null,
      prescription_id: activePrescriptionByPatient.get(release.patientId) ?? null,
      meal_name: release.meal,
      exit_at: toRemoteExitAt(release.exitTime, release.createdAt),
      status: toRemoteReleaseStatus(release.status),
      requester_name: release.requester,
      notes: release.notes,
      created_at: release.createdAt,
      created_by: createdBy,
      audience: release.audience === 'companion' ? 'companion' : 'patient',
      label_copies: release.labelCopies ?? (/lanche reforçado/i.test(release.meal) ? 3 : 1),
      printed_at: release.printedAt ?? null,
      printed_by: release.printedBy ?? null,
      delivered_at: release.deliveredAt ?? null,
      delivered_by: release.deliveredBy ?? null,
      cancelled_at: release.cancelledAt ?? null,
      cancelled_by: release.cancelledBy ?? null,
    })),
    movements: db.movements.map((movement) => ({
      id: movement.id,
      admission_id: admissionIdByPatient.get(movement.patientId) ?? null,
      movement_type: toRemoteMovementType(movement.type),
      details: movement.detail,
      created_at: movement.at,
      created_by: createdBy,
    })),
  }
}

export const normalizeDb = (value: Partial<Db> | null | undefined): Db => ({
  patients: Array.isArray(value?.patients) ? value!.patients : patients,
  releases: Array.isArray(value?.releases) ? value!.releases : releases,
  audit: Array.isArray(value?.audit) ? value!.audit : [],
  admissions: Array.isArray(value?.admissions) ? value!.admissions : admissions,
  movements: Array.isArray(value?.movements) ? value!.movements : movements,
  dietPrescriptions: Array.isArray(value?.dietPrescriptions) ? value!.dietPrescriptions : dietPrescriptions,
})

export const load = (): Db => {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      return normalizeDb(JSON.parse(raw))
    }
  } catch {
    // fallback silencioso para estrutura local em desenvolvimento
  }

  const seed: Db = { patients, releases, audit: [], admissions, movements, dietPrescriptions }
  try {
    localStorage.setItem(key, JSON.stringify(seed))
  } catch {
    // ignora falha local de armazenamento
  }

  return seed
}

export const loadRemoteDb = async (role?: string | null): Promise<Db | null> => {
  if (!supabase) return null

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const [patientsTask, admissionsTask, dietTask, releasesTask, movementsTask] = await Promise.all([
    supabase.from('patients').select('*'),
    supabase.from('admissions').select('*'),
    supabase.from('diet_prescriptions').select('*'),
    supabase.from('releases').select('*'),
    supabase.from('movements').select('*'),
  ])

  const operationalError = [patientsTask, admissionsTask, dietTask, releasesTask, movementsTask].find((task) => task.error)?.error
  if (operationalError) throw operationalError
  const canReadAudit = role === 'supervisor' || role === 'administrador'
  const auditTask = canReadAudit ? await supabase.from('audit_events').select('*').order('created_at', { ascending: false }).limit(100) : null
  if (auditTask?.error) throw auditTask.error

  const remote = {
    patients: patientsTask.data ?? [],
    admissions: admissionsTask.data ?? [],
    diet_prescriptions: dietTask.data ?? [],
    releases: releasesTask.data ?? [],
    movements: movementsTask.data ?? [],
    audit_events: auditTask?.data ?? [],
  }

  const adapted = adaptSupabaseDb(remote as any)
  return normalizeDb(adapted)
}

export const saveRemoteDb = async (db: Db, tables?: SyncTable[]): Promise<void> => {
  if (!supabase) return

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return

  const remote = toSupabaseDb(db, session.user.id)

  const selectedTables = tables ? new Set<SyncTable>(tables) : null
  for (const [tableName, rows] of Object.entries({
    patients: remote.patients,
    admissions: remote.admissions,
    diet_prescriptions: remote.diet_prescriptions,
    releases: remote.releases,
    movements: remote.movements,
  })) {
    if (selectedTables && !selectedTables.has(tableName as SyncTable)) continue
    if (!Array.isArray(rows) || rows.length === 0) continue

    if (tableName === 'diet_prescriptions') {
      const activeAdmissionIds = [...new Set(
        rows
          .filter((row) => row.active && row.admission_id)
          .map((row) => row.admission_id as string),
      )]

      // Primeiro desativa o registro remoto vigente. Em seguida gravamos as
      // linhas inativas e, por último, a nova ativa. Assim o upsert não tenta
      // ocupar o índice único antes de liberar a linha anterior.
      if (activeAdmissionIds.length > 0) {
        const { error: deactivateError } = await supabase
          .from('diet_prescriptions')
          .update({ active: false, replaced_at: new Date().toISOString() })
          .in('admission_id', activeAdmissionIds)
          .eq('active', true)
        if (deactivateError) throw new Error(`Falha ao preparar diet_prescriptions: ${deactivateError.message}`)
      }

      const orderedRows = [
        ...rows.filter((row) => !row.active),
        ...rows.filter((row) => row.active),
      ]
      const { error } = await supabase.from(tableName).upsert(orderedRows, { onConflict: 'id' })
      if (error) throw new Error(`Falha ao sincronizar ${tableName}: ${error.message}`)
      continue
    }

    const { error } = await supabase.from(tableName).upsert(rows, { onConflict: 'id' })
    if (error) throw new Error(`Falha ao sincronizar ${tableName}: ${error.message}`)
  }

  try {
    localStorage.removeItem(pendingSyncKey)
  } catch {
    // ignora indisponibilidade do armazenamento local
  }
}

export const retryPendingSync = async (): Promise<boolean> => {
  if (!supabase) return false

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return false

  let pending: Db | null = null
  try {
    const raw = localStorage.getItem(pendingSyncKey)
    if (raw) pending = normalizeDb(JSON.parse(raw) as Partial<Db>)
  } catch {
    return false
  }

  if (!pending) return false
  await saveRemoteDb(pending)
  return true
}

export const save = async (db: Db, tables?: SyncTable[]): Promise<void> => {
  const normalized = normalizeDb(db)

  try {
    localStorage.setItem(key, JSON.stringify(normalized))
  } catch {
    // ignora falha local quando o navegador não permite gravar
  }

  try {
    await saveRemoteDb(normalized, tables)
  } catch (error) {
    try {
      localStorage.setItem(pendingSyncKey, JSON.stringify(normalized))
    } catch {
      // mantém o erro remoto como sinal principal para a interface
    }
    throw error
  }
}

export const uid = () => crypto.randomUUID()

