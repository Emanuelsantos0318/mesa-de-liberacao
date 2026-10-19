import { describe, expect, it } from 'vitest'
import type { Patient } from '../types'
import { searchPatients } from './patientSearch'

const patient = (index: number): Patient => ({
  id: `p-${index}`, record: `HGRS-${index}`, name: index === 7777 ? 'João da Silva' : `Paciente ${index}`,
  ward: index % 2 ? '3B' : '4C', wing: 'Clínica médica', bed: `${index}-A`, status: 'Ativo', diet: 'Branda', restrictions: '', companion: '', updatedAt: '2026-01-01T00:00:00.000Z',
})

describe('searchPatients', () => {
  it('busca sem diferenciar maiúsculas, acentos e campos operacionais', () => {
    expect(searchPatients([patient(7777)], 'joao da silva')[0].id).toBe('p-7777')
    expect(searchPatients([patient(2)], '4c')[0].id).toBe('p-2')
  })

  it('permanece abaixo de 300 ms com 10 mil pacientes', () => {
    const patients = Array.from({ length: 10_000 }, (_, index) => patient(index))
    const start = performance.now()
    const result = searchPatients(patients, 'joao da silva')
    const elapsed = performance.now() - start
    expect(result).toHaveLength(1)
    expect(elapsed).toBeLessThan(300)
  })
})
