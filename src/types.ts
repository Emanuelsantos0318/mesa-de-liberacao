export type PatientStatus = 'Ativo' | 'Suspenso' | 'Alta' | 'Óbito'
export type ReleaseStatus = 'Pendente' | 'Impresso' | 'Entregue' | 'Cancelado'
export type MovementType = 'internacao' | 'transferencia' | 'suspensao' | 'reativacao' | 'alta' | 'obito'

export interface Patient {
  id: string
  record: string
  name: string
  ward: string
  wing: string
  bed: string
  status: PatientStatus
  diet: string
  restrictions: string
  companion: string
  fasting?: boolean
  fastingStartedAt?: string
  fastingReason?: string
  fastingAuthorizedBy?: string
  updatedAt: string
}

export interface Admission {
  id: string
  patientId: string
  ward: string
  wing: string
  bed: string
  status: PatientStatus
  companion: string
  startedAt: string
  endedAt?: string
  updatedAt: string
  fasting?: boolean
  fastingStartedAt?: string
  fastingReason?: string
  fastingAuthorizedBy?: string
}

export interface Movement {
  id: string
  patientId: string
  type: MovementType
  detail: string
  at: string
  actor: string
}

export interface DietPrescription {
  id: string
  patientId: string
  diet: string
  restrictions: string
  requester: string
  notes: string
  issuedAt: string
  replacedAt?: string
  active: boolean
}

export type ReleaseAudience = 'patient' | 'companion'
export interface Release {
  id: string
  patientId: string
  meal: string
  exitTime: string
  status: ReleaseStatus
  requester: string
  notes: string
  createdAt: string
  audience?: ReleaseAudience
  labelCopies?: number
  printedAt?: string
  printedBy?: string
  deliveredAt?: string
  deliveredBy?: string
  cancelledAt?: string
  cancelledBy?: string
}
export interface AuditEvent { id:string; at:string; action:string; detail:string }
