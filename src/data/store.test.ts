import { describe, expect, it } from 'vitest'
import { adaptSupabaseDb, normalizeDb, toSupabaseDb } from './store'

describe('persistência de estado', () => {
  it('usa a carga inicial quando o banco está vazio', () => {
    const db = normalizeDb({} as any)

    expect(Array.isArray(db.patients)).toBe(true)
    expect(Array.isArray(db.releases)).toBe(true)
    expect(Array.isArray(db.audit)).toBe(true)
    expect(db.patients.length).toBeGreaterThan(0)
  })

  it('preserva dados válidos e garante arrays', () => {
    const db = {
      patients: [{ id: 'p1', record: 'R1', name: 'Paciente Teste', ward: '3B', wing: 'Clínica', bed: '301', status: 'Ativo' as const, diet: 'Branda', restrictions: '', companion: '', updatedAt: '2026-01-01T00:00:00.000Z' }],
      releases: [{ id: 'r1', patientId: 'p1', meal: 'Almoço', exitTime: '11:30', status: 'Pendente' as const, requester: 'Dr. Teste', notes: '', createdAt: '2026-01-01T00:00:00.000Z' }],
      audit: [{ id: 'a1', at: '2026-01-01T00:00:00.000Z', action: 'Cadastro', detail: 'Paciente cadastrado' }],
      admissions: [{ id: 'a10', patientId: 'p1', ward: '3B', wing: 'Clínica', bed: '301', status: 'Ativo' as const, companion: '', startedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      movements: [{ id: 'm1', patientId: 'p1', type: 'internacao', detail: 'Internação registrada', at: '2026-01-01T00:00:00.000Z', actor: 'Operador' }],
      dietPrescriptions: [{ id: 'd1', patientId: 'p1', diet: 'Branda', restrictions: '', requester: 'Nutri', notes: '', issuedAt: '2026-01-01T00:00:00.000Z', active: true }],
    }

    const normalized = normalizeDb(db as any)

    expect(normalized.patients).toEqual(db.patients)
    expect(normalized.releases).toEqual(db.releases)
    expect(normalized.audit).toEqual(db.audit)
    expect(normalized.admissions).toEqual(db.admissions)
    expect(normalized.movements).toEqual(db.movements)
    expect(normalized.dietPrescriptions).toEqual(db.dietPrescriptions)
  })

  it('adapta as linhas do Supabase para o modelo local', () => {
    const remote = {
      patients: [{ id: 'p1', hospital_record: 'R1', full_name: 'Paciente Teste', ward: '3B', wing: 'Clínica', bed: '301', status: 'ativo', diet: 'Branda', restrictions: 'Sem lactose', companion_name: 'Maria', updated_at: '2026-01-01T00:00:00.000Z' }],
      admissions: [{ id: 'a1', patient_id: 'p1', ward: '3B', wing: 'Clínica', bed: '301', status: 'ativo', companion_name: 'Maria', started_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }],
      diet_prescriptions: [{ id: 'd1', admission_id: 'a1', diet_name: 'Branda', restrictions: 'Sem lactose', requester_name: 'Nutri', notes: 'Ajuste', effective_at: '2026-01-01T00:00:00.000Z', active: true }],
      releases: [{ id: 'r1', admission_id: 'a1', prescription_id: 'd1', meal_name: 'Almoço', exit_at: '2026-01-01T11:30:00.000Z', status: 'pendente', requester_name: 'Nutri', notes: '', created_at: '2026-01-01T00:00:00.000Z', printed_at: '2026-01-01T11:35:00.000Z', printed_by: 'u1' }],
      movements: [{ id: 'm1', admission_id: 'a1', movement_type: 'admissao', details: { ok: true }, created_at: '2026-01-01T00:00:00.000Z', created_by: 'u1' }],
      audit_events: [{ id: 'ev1', table_name: 'patients', record_id: 'p1', action: 'insert', created_at: '2026-01-01T00:00:00.000Z' }],
    }

    const adapted = adaptSupabaseDb(remote as any)

    expect(adapted.patients?.[0].record).toBe('R1')
    expect(adapted.dietPrescriptions?.[0].diet).toBe('Branda')
    expect(adapted.releases?.[0].exitTime).toBe('08:30')
    expect(adapted.releases?.[0].printedAt).toBe('2026-01-01T11:35:00.000Z')
    expect(adapted.releases?.[0].printedBy).toBe('u1')
    expect(adapted.movements?.[0].type).toBe('internacao')
    expect(adapted.audit?.[0].detail).toContain('patients')
  })

  it('serializa o modelo local para o formato do Supabase sem misturar internação em patients', () => {
    const db = {
      patients: [{ id: 'p1', record: 'R1', name: 'Paciente Teste', ward: '3B', wing: 'Clínica', bed: '301', status: 'Ativo' as const, diet: 'Branda', restrictions: 'Sem lactose', companion: 'Maria', updatedAt: '2026-01-01T00:00:00.000Z' }],
      admissions: [{ id: 'a1', patientId: 'p1', ward: '3B', wing: 'Clínica', bed: '301', status: 'Ativo' as const, companion: 'Maria', startedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      releases: [{ id: 'r1', patientId: 'p1', meal: 'Almoço', exitTime: '11:30', status: 'Impresso' as const, requester: 'Nutri', notes: '', createdAt: '2026-01-01T00:00:00.000Z', printedAt: '2026-01-01T11:35:00.000Z', printedBy: 'user-123' }],
      audit: [{ id: 'a1', at: '2026-01-01T00:00:00.000Z', action: 'Cadastro', detail: 'Paciente cadastrado' }],
      movements: [{ id: 'm1', patientId: 'p1', type: 'internacao', detail: 'Internação registrada', at: '2026-01-01T00:00:00.000Z', actor: 'Operador' }],
      dietPrescriptions: [{ id: 'd1', patientId: 'p1', diet: 'Branda', restrictions: 'Sem lactose', requester: 'Nutri', notes: 'Ajuste', issuedAt: '2026-01-01T00:00:00.000Z', active: true }],
    }

    const remote = toSupabaseDb(db as any, 'user-123')

    expect(remote.patients?.[0]).toMatchObject({ id: 'p1', hospital_record: 'R1', full_name: 'Paciente Teste', diet: 'Branda', restrictions: 'Sem lactose', updated_at: '2026-01-01T00:00:00.000Z' })
    expect(remote.admissions?.[0]).toMatchObject({ patient_id: 'p1', ward: '3B', wing: 'Clínica', bed: '301', status: 'ativo', companion_name: 'Maria', created_by: 'user-123' })
    expect(remote.diet_prescriptions?.[0]).toMatchObject({ admission_id: 'a1', diet_name: 'Branda', restrictions: 'Sem lactose', requester_name: 'Nutri', active: true, created_by: 'user-123' })
    expect(remote.releases?.[0]).toMatchObject({ admission_id: 'a1', meal_name: 'Almoço', status: 'impresso', created_by: 'user-123', printed_at: '2026-01-01T11:35:00.000Z', printed_by: 'user-123' })
    expect(remote.releases?.[0]).toMatchObject({ audience: 'patient', label_copies: 1 })
    expect(remote.releases?.[0].exit_at).toBe('2025-12-31T14:30:00.000Z')
    expect(remote.movements?.[0].movement_type).toBe('admissao')
  })

  it('cria uma prescrição padrão para liberar um paciente sem dieta ativa', () => {
    const db = {
      patients: [{ id: 'p1', record: 'R1', name: 'Paciente Teste', ward: '3B', wing: 'Clínica', bed: '301', status: 'Ativo' as const, diet: '', restrictions: 'Sem lactose', companion: 'Maria', updatedAt: '2026-01-01T00:00:00.000Z' }],
      admissions: [{ id: 'a1', patientId: 'p1', ward: '3B', wing: 'Clínica', bed: '301', status: 'Ativo' as const, companion: 'Maria', startedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      releases: [{ id: 'r1', patientId: 'p1', meal: 'Almoço', exitTime: '11:30', status: 'Pendente' as const, requester: 'Nutri', notes: '', createdAt: '2026-01-01T00:00:00.000Z' }],
      audit: [],
      movements: [],
      dietPrescriptions: [],
    }

    const remote = toSupabaseDb(db as any, 'user-123')

    expect(remote.diet_prescriptions?.[0]).toMatchObject({ admission_id: 'a1', diet_name: 'Dieta não informada', created_by: 'user-123' })
    expect(remote.releases?.[0]).toMatchObject({ admission_id: 'a1', status: 'pendente', created_by: 'user-123' })
    expect(remote.releases?.[0].prescription_id).toBeTruthy()
  })

  it('normaliza prescrições ativas duplicadas antes da sincronização', () => {
    const remote = toSupabaseDb({
      patients: [{ id: 'p1', record: 'R1', name: 'Paciente Teste', ward: '3B', wing: 'Clínica', bed: '301', status: 'Ativo', diet: 'Branda', restrictions: '', companion: '', updatedAt: '2026-01-02T00:00:00.000Z' }],
      admissions: [{ id: 'a1', patientId: 'p1', ward: '3B', wing: 'Clínica', bed: '301', status: 'Ativo', companion: '', startedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }],
      releases: [],
      audit: [],
      movements: [],
      dietPrescriptions: [
        { id: 'd-old', patientId: 'p1', diet: 'Branda', restrictions: '', requester: 'Nutri', notes: '', issuedAt: '2026-01-01T08:00:00.000Z', active: true },
        { id: 'd-new', patientId: 'p1', diet: 'Pastosa', restrictions: '', requester: 'Nutri', notes: '', issuedAt: '2026-01-02T08:00:00.000Z', active: true },
      ],
    } as any, 'user-123')

    const diets = (remote.diet_prescriptions as Array<Record<string, any>>).filter((row) => row.admission_id === 'a1')
    expect(diets.filter((row) => row.active)).toHaveLength(1)
    expect(diets.find((row) => row.id === 'd-new')?.active).toBe(true)
    expect(diets.find((row) => row.id === 'd-old')?.active).toBe(false)
  })

  it('prepara três etiquetas para lanche reforçado e preserva acompanhante', () => {
    const remote = toSupabaseDb({
      patients: [{ id: 'p1', record: 'R1', name: 'Paciente', ward: '3B', wing: 'Clínica', bed: '301', status: 'Ativo', diet: 'Branda', restrictions: '', companion: 'Acompanhante: Maria', updatedAt: '2026-01-01T00:00:00.000Z' }],
      admissions: [{ id: 'a1', patientId: 'p1', ward: '3B', wing: 'Clínica', bed: '301', status: 'Ativo', companion: 'Acompanhante: Maria', startedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      releases: [{ id: 'r1', patientId: 'p1', meal: 'Lanche Reforçado', exitTime: '15:00', status: 'Pendente', requester: 'Nutri', notes: '', createdAt: '2026-01-01T00:00:00.000Z', audience: 'companion', labelCopies: 3 }],
      audit: [], movements: [], dietPrescriptions: [],
    } as any, 'user-123')

    expect(remote.releases?.[0]).toMatchObject({ audience: 'companion', label_copies: 3 })
  })
})
