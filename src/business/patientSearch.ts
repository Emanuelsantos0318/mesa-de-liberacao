import type { Patient } from '../types'

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export const searchPatients = (patients: Patient[], query: string): Patient[] => {
  const needle = normalize(query)
  if (!needle) return patients
  return patients.filter((patient) => normalize(`${patient.name} ${patient.record} ${patient.ward} ${patient.wing} ${patient.bed}`).includes(needle))
}
