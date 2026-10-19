import { describe, expect, it } from 'vitest'
import { buildAuditCsv, buildAuditSummary, buildMealConsumptionSummary, buildReleaseCsv, buildShiftSummary, canChangeTo, canTransferPatient, dietUpdateBlockedMessage, matchesShiftContext, matchesUserContext, releaseBlockedMessage, resolveUserShift } from './releaseRules'

describe('regras de liberação', () => {
  it('permite paciente ativo com dieta', () => expect(releaseBlockedMessage({status:'Ativo',diet:'Branda'})).toBeNull())
  it.each(['Suspenso','Alta','Óbito'] as const)('bloqueia paciente %s', status => expect(releaseBlockedMessage({status,diet:'Branda'})).toBeTruthy())
  it('bloqueia liberação durante jejum', () => expect(releaseBlockedMessage({ status: 'Ativo', diet: 'B', fasting: true })).toContain('jejum'))
  it('bloqueia paciente sem dieta', () => expect(releaseBlockedMessage({status:'Ativo',diet:' '})).toContain('dieta'))
  it('não permite reativar alta ou óbito', () => { expect(canChangeTo('Alta','Ativo')).toBe(false); expect(canChangeTo('Óbito','Ativo')).toBe(false) })
  it('permite transição válida de ativo para suspenso', () => { expect(canChangeTo('Ativo','Suspenso')).toBe(true) })
  it('bloqueia alta para um paciente já encerrado', () => { expect(canChangeTo('Alta','Óbito')).toBe(false) })
  it('impede criar nova internação ativa para paciente já internado', () => {
    const activeAdmissions = [{ patientId: 'p1', status: 'Ativo' }]
    expect(activeAdmissions.some(a => a.patientId === 'p1' && a.status === 'Ativo')).toBe(true)
  })
  it('permite transferência para leito livre', () => {
    expect(canTransferPatient(
      { status: 'Ativo', ward: '3B', bed: '301' },
      { ward: '3B', bed: '305' },
      [{ patientId: 'p2', ward: '3B', bed: '302' }],
      'p1'
    )).toBe(true)
  })
  it('bloqueia transferência para leito ocupado', () => {
    expect(canTransferPatient(
      { status: 'Ativo', ward: '3B', bed: '301' },
      { ward: '3B', bed: '302' },
      [{ patientId: 'p2', ward: '3B', bed: '302' }],
      'p1'
    )).toBe(false)
  })
  it('compara leitos ignorando maiúsculas, acentos e espaços', () => {
    expect(canTransferPatient(
      { status: 'Ativo', ward: '3B', bed: '301' },
      { ward: ' 3b ', bed: ' 301 ' },
      [],
      'p1'
    )).toBe(false)
    expect(canTransferPatient(
      { status: 'Ativo', ward: '3B', bed: '301' },
      { ward: '3b', bed: '302' },
      [{ patientId: 'p2', ward: ' 3B ', bed: '302' }],
      'p1'
    )).toBe(false)
  })
  it('bloqueia prescrição de dieta sem dieta ou solicitante', () => {
    expect(dietUpdateBlockedMessage('', 'Nutri')).toContain('dieta')
    expect(dietUpdateBlockedMessage('Branda', '')).toContain('solicitante')
  })

  it('resume o consumo por refeição com percentuais relativos ao pico do dia', () => {
    const summary = buildMealConsumptionSummary([
      { meal: 'Almoço' },
      { meal: 'Almoço' },
      { meal: 'Ceia Completa' },
      { meal: 'Colação' },
    ])

    expect(summary.find((item) => item.label === 'Almoço')?.count).toBe(2)
    expect(summary.find((item) => item.label === 'Ceia Completa')?.percent).toBeCloseTo(0.5)
    expect(summary.find((item) => item.label === 'Colação')?.count).toBe(1)
  })

  it('inclui lanche reforçado no mapa de consumo', () => {
    const summary = buildMealConsumptionSummary([{ meal: 'Lanche Reforçado' }, { meal: 'Lanche Reforçado' }])

    expect(summary.find((item) => item.label === 'Lanche Reforçado')?.count).toBe(2)
  })

  it('identifica o turno atual com base na hora e calcula o total em fila', () => {
    const summary = buildShiftSummary([
      { status: 'Pendente' },
      { status: 'Pendente' },
      { status: 'Impresso' },
      { status: 'Entregue' },
    ], new Date('2026-10-09T08:00:00'))

    expect(summary.shiftName).toBe('Manhã')
    expect(summary.pendentes).toBe(2)
    expect(summary.impressos).toBe(1)
    expect(summary.entregues).toBe(1)
    expect(summary.totais).toBe(4)
  })

  it('calcula o turno no fuso de Salvador', () => {
    const summary = buildShiftSummary([{ status: 'Pendente' }], new Date('2026-10-09T21:00:00.000Z'))
    expect(summary.shiftName).toBe('Noite')
  })

  it('trata meia-noite como início do turno da manhã', () => {
    const summary = buildShiftSummary([{ status: 'Pendente' }], new Date('2026-10-09T03:00:00.000Z'))
    expect(summary.shiftName).toBe('Manhã')
  })

  it('aplica o filtro de contexto por operador de forma case-insensitive', () => {
    expect(matchesUserContext('Carla Souza', 'carla souza')).toBe(true)
    expect(matchesUserContext('Carla Souza', 'João')).toBe(false)
    expect(matchesUserContext('Carla Souza', 'Todos')).toBe(true)
    expect(matchesUserContext('', 'Carla Souza')).toBe(false)
  })

  it('aplica o filtro por turno com base no operador do registro', () => {
    expect(matchesShiftContext('Carla Souza', 'Manhã', { 'carla souza': 'Manhã' })).toBe(true)
    expect(matchesShiftContext('Carla Souza', 'Tarde', { 'carla souza': 'Manhã' })).toBe(false)
    expect(matchesShiftContext('Carla Souza', 'Todos', { 'carla souza': 'Manhã' })).toBe(true)
  })

  it('sincroniza o turno ao selecionar um usuário específico', () => {
    expect(resolveUserShift('Carla Souza', [{ name: 'Carla Souza', shift: 'Tarde' }])).toBe('Tarde')
    expect(resolveUserShift('Todos', [{ name: 'Carla Souza', shift: 'Tarde' }])).toBe('Todos')
  })

  it('gera CSV formatado para exportação do relatório de liberações', () => {
    const csv = buildReleaseCsv([
      { patientName: 'Ana Clara', record: 'HGRS-01', bed: '3B / 312-A', meal: 'Almoço', exitTime: '11:30', status: 'Pendente', requester: 'Dra. Helena' },
    ])

    expect(csv).toContain('Paciente,Prontuário,Leito,Refeição,Hora,Status,Solicitante')
    expect(csv).toContain('Ana Clara')
    expect(csv).toContain('Pendente')
  })

  it('categoriza ações do histórico operacional por tipo e mantém a ordem cronológica', () => {
    const summary = buildAuditSummary([
      { action: 'Liberação registrada', detail: 'Ana Clara', at: '2026-10-10T10:00:00.000Z' },
      { action: 'Paciente atualizado', detail: 'João', at: '2026-10-10T09:00:00.000Z' },
    ], 'Todos')

    expect(summary[0].action).toBe('Liberação registrada')
    expect(summary[1].category).toBe('Paciente')
  })

  it('gera CSV do histórico de auditoria com cabeçalho e dados', () => {
    const csv = buildAuditCsv([
      { action: 'Liberação registrada', detail: 'Ana Clara', category: 'Liberação', at: '2026-10-10T10:00:00.000Z' },
    ])

    expect(csv).toContain('Ação,Categoria,Detalhe,Data')
    expect(csv).toContain('Liberação registrada')
  })
})
