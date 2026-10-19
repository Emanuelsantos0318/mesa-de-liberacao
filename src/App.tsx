import { useEffect, useMemo, useState } from 'react'
import type { Admission, DietPrescription, Movement, Patient, PatientStatus, Release, ReleaseStatus } from './types'
import { load, loadRemoteDb, retryPendingSync, save, uid, type Db, type SyncTable } from './data/store'
import { SidePanel } from './components/SidePanel'
import { StatusBadge } from './components/StatusBadge'
import { buildAuditCsv, buildAuditSummary, buildMealConsumptionSummary, buildReleaseCsv, buildShiftSummary, canAdvanceReleaseStatus, canChangeTo, canTransferPatient, dietUpdateBlockedMessage, matchesShiftContext, matchesUserContext, releaseBlockedMessage, releaseStatusBlockedMessage, resolveUserShift, transferBlockedMessage } from './business/releaseRules'
import { searchPatients } from './business/patientSearch'
import { useAuth } from './auth/useAuth'
import { canAccessReleaseBoard, canManageOperationalData, canManageProfiles, canViewReports, getRoleLabel } from './auth/roleRules'
import { AuthScreen, hasPasswordRecoveryToken } from './components/AuthScreen'
import { supabase } from './services/supabase'
import './App.css'

const dietOptions = ['N', 'P', 'B', 'S/S', 'K', 'S/G', 'D', 'OBST', 'SL', 'LAX', 'LR', 'IMU', 'Int Lactose', 'S/Leite', 'Renal', 'P/L']
const dietDisplayLabels: Record<string, string> = {
  N: 'Normal (N)',
  P: 'Pastosa (P)',
  B: 'Branda (B)',
  'S/S': 'Hipossódica (S/S)',
  K: 'Hipocalica (K)',
  'S/G': 'Hipolipidica (S/G)',
  D: 'Diabético (D)',
  OBST: 'Obstipante (OBST)',
  SL: 'Semi Líquida (SL)',
  LAX: 'Laxante (LAX)',
  LR: 'Líquida Restrita (LR)',
  IMU: 'Imuno (IMU)',
  'Int Lactose': 'Intolerante a Lactose (Int Lactose)',
  'S/Leite': 'Sem leite (S/Leite)',
  Renal: 'Renal',
  'P/L': 'Pastosa Líquida (P/L)',
}
const officialWardOptions = [
  'INTER B', 'S. LARANJA', 'S. VERMELHA', 'S. AMARELA', 'UAVC', 'CARDIO 1', 'CARDIO 2', 'CHD', 'GASTRO', 'CRPA',
  'UTI ALA A', 'UTI ALA B', 'UTI NEURO', 'UTI CIRURGICA', 'C.O', '1A', '1B', '1C', 'UTI 2', '2A', '2B', '2C',
  '3A', '3B', 'MAE CANGURU', 'INTER C', '4A', '4B', 'UTI PED (adulto)', 'EME PED(adulto)', '4C (adulto)',
  'Hospital do Homem', 'UTI PED', 'EME PED', '4C',
] as const
const mealOptions = ['Desjejum', 'Colação', 'Almoço', 'Lanche', 'Lanche Reforçado', 'Ceia Completa', 'Ceia Leve']

type ClientView = 'painel' | 'pacientes' | 'relatorios' | 'configuracao' | 'usuarios'
type DashboardFocus = 'semDieta' | 'pendentes' | 'impressos' | 'entregues' | null
type ReportType = 'completo' | 'pendencias' | 'excecoes' | 'auditoria' | 'enfermaria' | 'produtividade'
type UserAccount = { id: string; name: string; email: string; password: string; shift: string; role: 'operador' | 'supervisor' | 'administrador' }

const blank = (): Patient => ({ id: uid(), record: '', name: '', ward: '', wing: '', bed: '', status: 'Ativo', diet: '', restrictions: '', companion: '', updatedAt: new Date().toISOString() })
const blankTransfer = () => ({ ward: '', wing: '', bed: '', reason: '', requester: '' })
const blankDiet = () => ({ diet: '', restrictions: '', requester: '', notes: '' })
const bahiaTime = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
const blankRelease = () => ({ meal: 'Almoço', exitTime: bahiaTime(), requester: '', notes: '', extraRequests: [''], audience: 'patient' as 'patient' | 'companion' })
const clock = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
const timestamp = () => new Date().toISOString()
const bahiaDate = (value: Date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
  return `${parts.find((part) => part.type === 'year')?.value ?? '1970'}-${parts.find((part) => part.type === 'month')?.value ?? '01'}-${parts.find((part) => part.type === 'day')?.value ?? '01'}`
}
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
const parseSelectedDiet = (value: string): string[] => value.split(',').map((item) => item.trim()).filter(Boolean)
const normalizeDietLabel = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
const dietAliases: Record<string, string> = {
  n: 'N', normal: 'N', 'normal (n)': 'N',
  p: 'P', pastosa: 'P',
  b: 'B', branda: 'B',
  's/s': 'S/S', hiposodica: 'S/S', hipossodica: 'S/S', hissodica: 'S/S',
  k: 'K', hipocalica: 'K', hipocalorica: 'K',
  's/g': 'S/G', hipolipidica: 'S/G',
  d: 'D', diabetico: 'D', diabetica: 'D',
  obst: 'OBST', obstipante: 'OBST',
  sl: 'SL', 'semi liquida': 'SL',
  lax: 'LAX', laxante: 'LAX',
  lr: 'LR', 'liquida restrita': 'LR',
  imu: 'IMU', imuno: 'IMU',
  'int lactose': 'Int Lactose', 'intolerante a lactose': 'Int Lactose',
  's/leite': 'S/Leite', 'sem leite': 'S/Leite', 'sem leite ou derivados': 'S/Leite',
  renal: 'Renal',
  'p/l': 'P/L', 'pastosa liquida': 'P/L',
}
const abbreviateDiet = (value: string) => parseSelectedDiet(value).map((item) => dietAliases[normalizeDietLabel(item)] ?? item).join(', ')
const readStoredUsers = (): UserAccount[] => {
  try {
    const raw = localStorage.getItem('mesa-liberacao-users')
    if (raw) {
      const parsed = JSON.parse(raw) as UserAccount[]
      if (Array.isArray(parsed) && parsed.length) return parsed
    }
  } catch {
    // local storage not available yet
  }

  return []
}

export function resolveAuthGate({ loading, session, profile, isProfileActive, role, passwordResetRequested }: {
  loading: boolean
  session: unknown
  profile?: { id?: string; full_name: string | null; role: string | null; active?: boolean | null; shift_name: string | null } | null
  isProfileActive: boolean
  role: string | null
  passwordResetRequested: boolean
}) {
  if (passwordResetRequested) return 'reset'
  if (loading) return 'loading'
  if (!session) return 'login'
  if (!profile || !isProfileActive || !canAccessReleaseBoard(role)) return 'missingProfile'
  return 'dashboard'
}

function Central({ profile }: { profile?: { id?: string; full_name: string | null; role: string | null; shift_name: string | null } | null }) {
  const [db, setDb] = useState<Db>(load)
  const [selectedId, setSelectedId] = useState('p1')
  const [selectedReprintIds, setSelectedReprintIds] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'Todos' | ReleaseStatus>('Todos')
  const [panel, setPanel] = useState<'patient' | 'release' | 'transfer' | 'diet' | null>(null)
  const [view, setView] = useState<ClientView>('painel')
  const [darkMode, setDarkMode] = useState(() => {
    const storedTheme = localStorage.getItem('hgrs-theme')
    return storedTheme === 'dark'
  })
  const [reportDate, setReportDate] = useState(bahiaDate())
  const [reportEndDate, setReportEndDate] = useState(bahiaDate())
  const [dashboardFocus, setDashboardFocus] = useState<DashboardFocus>(null)
  const [auditFilter, setAuditFilter] = useState<'Todos' | 'Paciente' | 'Liberação' | 'Dieta' | 'Sistema'>('Todos')
  const [patientStatusFilter, setPatientStatusFilter] = useState<'Todos' | PatientStatus>('Todos')
  const [patientWardFilter, setPatientWardFilter] = useState('Todos')
  const [patientDietFilter, setPatientDietFilter] = useState('Todos')
  const [patientQuery, setPatientQuery] = useState('')
  const [patientModalOpen, setPatientModalOpen] = useState(false)
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [patientSummaryOpen, setPatientSummaryOpen] = useState(false)
  const [form, setForm] = useState(blank())
  const [formDietSelections, setFormDietSelections] = useState<string[]>([])
  const [formHasCompanion, setFormHasCompanion] = useState(false)
  const [formCompanionMeals, setFormCompanionMeals] = useState<string[]>([])
  const [transferForm, setTransferForm] = useState(blankTransfer())
  const [dietForm, setDietForm] = useState(blankDiet())
  const [releaseForm, setReleaseForm] = useState(blankRelease())
  const [notice, setNotice] = useState('')
  const [configName, setConfigName] = useState(profile?.full_name ?? 'Administrador')
  const [configPassword, setConfigPassword] = useState('')
  const [adminUsers, setAdminUsers] = useState<UserAccount[]>(() => readStoredUsers())
  const [newUser, setNewUser] = useState<UserAccount>({ id: '', name: '', email: '', password: '', shift: 'Manhã', role: 'operador' })
  const [selectedUserContext, setSelectedUserContext] = useState<string>('Todos')
  const [selectedShiftContext, setSelectedShiftContext] = useState<'Todos' | 'Manhã' | 'Tarde' | 'Noite'>('Todos')
  const [reportUserContext, setReportUserContext] = useState<string>('Todos')
  const [reportShiftContext, setReportShiftContext] = useState<'Todos' | 'Manhã' | 'Tarde' | 'Noite'>('Todos')
  const [reportType, setReportType] = useState<ReportType>('completo')
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (profile?.full_name) setConfigName(profile.full_name)
  }, [profile])

  useEffect(() => {
    setSelectedReprintIds([])
  }, [selectedId])

  useEffect(() => {
    localStorage.setItem('hgrs-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    const client = supabase
    if (!client || !canManageProfiles(profile?.role ?? null)) {
      setAdminUsers((prev) => prev.length ? prev : readStoredUsers())
      return
    }

    const fetchProfiles = async () => {
      const { data, error } = await client.from('profiles').select('id, full_name, role, shift_name, active').order('created_at', { ascending: false })
      if (error) {
        setNotice(error.message)
        return
      }

      const rows = (data ?? []).map((row) => ({
        id: row.id,
        name: row.full_name,
        email: '',
        password: '••••••',
        shift: row.shift_name ?? 'Manhã',
        role: (row.role ?? 'operador') as UserAccount['role'],
      }))
      setAdminUsers(rows.length ? rows : readStoredUsers())
    }

    void fetchProfiles()
  }, [profile?.role])

  useEffect(() => {
    localStorage.setItem('mesa-liberacao-users', JSON.stringify(adminUsers))
  }, [adminUsers])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (!profile || !supabase) return

    const refreshRemote = async () => {
      try {
        const remote = await loadRemoteDb(profile.role)
        if (!remote) return
        setDb(remote)
        setLastSyncAt(new Date().toISOString())
        if (remote.patients[0]) setSelectedId(remote.patients[0].id)
      } catch (error) {
        setNotice(error instanceof Error ? `Falha ao carregar dados remotos: ${error.message}` : 'Falha ao carregar dados remotos.')
      }
    }

    void refreshRemote()

    void retryPendingSync().then((retried) => {
      if (retried) setNotice('Alterações pendentes foram sincronizadas automaticamente.')
    }).catch(() => {
      setNotice('Há alterações locais pendentes; nova tentativa será feita quando a conexão voltar.')
    })

    const retryWhenOnline = () => {
      void retryPendingSync().then((retried) => {
        if (retried) {
          setNotice('Alterações pendentes foram sincronizadas automaticamente.')
          void refreshRemote()
        }
      }).catch(() => undefined)
    }
    window.addEventListener('online', retryWhenOnline)

    const channel = supabase.channel('mesa-liberacao-live-updates')
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, () => { void refreshRemote() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admissions' }, () => { void refreshRemote() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'diet_prescriptions' }, () => { void refreshRemote() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'releases' }, () => { void refreshRemote() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movements' }, () => { void refreshRemote() })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setNotice('Atualização em tempo real indisponível. A sincronização manual continua disponível.')
        }
      })

    return () => {
      window.removeEventListener('online', retryWhenOnline)
      void channel.unsubscribe()
    }
  }, [profile])

  const resetPatientForm = (patient?: Patient) => {
    const nextDietSelections = patient ? parseSelectedDiet(abbreviateDiet(patient.diet)) : []
    const companionMeals: string[] = []
    if (patient?.companion?.toLowerCase().includes('almoço')) companionMeals.push('Almoço')
    if (patient?.companion?.toLowerCase().includes('jantar')) companionMeals.push('Ceia Completa')
    setForm(patient ?? blank())
    setFormDietSelections(nextDietSelections)
    setFormHasCompanion(Boolean(patient?.companion && patient.companion.trim().length > 0))
    setFormCompanionMeals(companionMeals)
  }

  const applyUserContext = (nextUser: string) => {
    setSelectedUserContext(nextUser)
    setSelectedShiftContext(resolveUserShift(nextUser, adminUsers))
    if (nextUser !== 'Todos') {
      setNotice(`Visão aberta para ${nextUser}.`)
    }
  }

  const clearPatientFilters = () => {
    setDashboardFocus(null)
    setPatientStatusFilter('Todos')
    setPatientWardFilter('Todos')
    setPatientDietFilter('Todos')
    setPatientQuery('')
    setSelectedUserContext('Todos')
    setSelectedShiftContext('Todos')
    setNotice('Filtros limpos.')
  }

  const openPatientInPanel = (patientId: string) => {
    setSelectedId(patientId)
    setDashboardFocus(null)
    setPanel(null)
    setView('painel')
  }

  const patientMatchesSelectedContext = (patientId: string) => {
    const patient = db.patients.find((item) => item.id === patientId)
    if (patient && !patientMatchesListFilters(patient)) return false
    const requesters = [
      ...db.releases.filter((release) => release.patientId === patientId).map((release) => release.requester),
      ...db.dietPrescriptions.filter((prescription) => prescription.patientId === patientId).map((prescription) => prescription.requester),
    ].filter(Boolean)

    if (!requesters.length) {
      return selectedUserContext === 'Todos' && selectedShiftContext === 'Todos'
    }

    const shiftMap = Object.fromEntries(adminUsers.map((user) => [user.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(), user.shift]))

    return requesters.some((requester) => {
      const userMatches = selectedUserContext === 'Todos' || matchesUserContext(requester, selectedUserContext)
      const shiftMatches = selectedShiftContext === 'Todos' || matchesShiftContext(requester, selectedShiftContext, shiftMap)
      return userMatches && shiftMatches
    })
  }

  const patientMatchesListFilters = (patient: Patient) => {
    const normalizedQuery = patientQuery.trim().toLowerCase()
    const queryMatches = !normalizedQuery || [patient.name, patient.record, patient.ward, patient.wing, patient.bed].some((value) => value.toLowerCase().includes(normalizedQuery))
    const wardMatches = patientWardFilter === 'Todos' || patient.ward === patientWardFilter
    const dietMatches = patientDietFilter === 'Todos' || (patientDietFilter === 'Dieta zerada' ? !patient.diet.trim() : parseSelectedDiet(abbreviateDiet(patient.diet)).includes(patientDietFilter))
    const statusMatches = patientStatusFilter === 'Todos' || patient.status === patientStatusFilter
    return queryMatches && wardMatches && dietMatches && statusMatches
  }

  const persistProfileName = async (nextName?: string) => {
    const trimmed = (nextName ?? configName).trim()
    if (!trimmed) return setNotice('Informe um nome válido.')

    if (!supabase) {
      setNotice('Nome salvo localmente.')
      return
    }

    try {
      const userId = profile?.id ?? (await supabase.auth.getUser()).data.user?.id
      if (!userId) {
        setNotice('Não foi possível identificar o usuário atual.')
        return
      }

      const { error: authError } = await supabase.auth.updateUser({ data: { full_name: trimmed } })
      if (authError) throw authError

      const { error: profileError } = await supabase.from('profiles').upsert({
        id: userId,
        full_name: trimmed,
        role: (profile?.role ?? 'operador') as 'operador' | 'supervisor' | 'administrador',
        shift_name: profile?.shift_name ?? 'Manhã',
        active: true,
      }, { onConflict: 'id' })

      if (profileError) throw profileError

      setNotice('Nome salvo com sucesso.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível salvar o nome.')
    }
  }

  const syncDatabaseWithSupabase = async () => {
    if (!supabase) {
      setNotice('Supabase não configurado para sincronização.')
      return
    }

    try {
      setIsSaving(true)
      setNotice('Sincronizando dados com o Supabase...')
      await save(db)
      const remote = await loadRemoteDb()
      if (!remote) {
        setNotice('Sincronização concluída localmente, mas sem dados remotos disponíveis.')
        return
      }

      setDb(remote)
      if (remote.patients[0]) setSelectedId(remote.patients[0].id)
      setNotice('Dados sincronizados com sucesso.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível sincronizar os dados.')
    } finally {
      setIsSaving(false)
    }
  }

  const createAdminUser = async (event: React.FormEvent) => {
    event.preventDefault()
    const name = newUser.name.trim()
    const email = newUser.email.trim().toLowerCase()
    if (!name || !email || (!supabase && !newUser.password.trim())) {
      setNotice(supabase ? 'Preencha nome e e-mail.' : 'Preencha nome, e-mail e senha provisória.')
      return
    }

    if (supabase) {
      setIsSaving(true)
      setNotice('Enviando convite seguro por e-mail…')
      try {
        const { data, error } = await supabase.functions.invoke('admin-invite-user', {
          body: { name, email, shift: newUser.shift, role: newUser.role },
        })
        if (error) throw error
        const invitedUser = (data as { user?: { id?: string; name?: string; email?: string; role?: UserAccount['role']; shift?: string } } | null)?.user
        setAdminUsers((prev) => [{
          id: invitedUser?.id ?? uid(),
          name: invitedUser?.name ?? name,
          email: invitedUser?.email ?? email,
          password: 'Convite enviado',
          shift: invitedUser?.shift ?? newUser.shift,
          role: invitedUser?.role ?? newUser.role,
        }, ...prev])
        setNewUser({ id: '', name: '', email: '', password: '', shift: 'Manhã', role: 'operador' })
        setNotice('Convite enviado. O usuário deve acessar o e-mail e definir a própria senha.')
      } catch (error) {
        setNotice(error instanceof Error ? `Não foi possível enviar o convite: ${error.message}` : 'Não foi possível enviar o convite.')
      } finally {
        setIsSaving(false)
      }
      return
    }

    setAdminUsers((prev) => [{ id: uid(), name, email, password: '', shift: newUser.shift, role: newUser.role }, ...prev])
    setNewUser({ id: '', name: '', email: '', password: '', shift: 'Manhã', role: 'operador' })
    setNotice('Usuário adicionado somente no modo local de desenvolvimento.')
  }

  const exportOperationalBackup = () => {
    if (profile?.role !== 'administrador') {
      setNotice('Apenas administradores podem exportar o backup operacional.')
      return
    }

    const payload = JSON.stringify({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      source: 'mesa-liberacao',
      data: db,
    }, null, 2)
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `backup-mesa-liberacao-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice('Backup operacional exportado. Armazene o arquivo em local protegido.')
  }

  const loadDemoData = () => {
    if (supabase) {
      setNotice('Dados de demonstração estão disponíveis apenas no modo local, sem Supabase, para proteger a base operacional.')
      return
    }
    const now = Date.now()
    const stamp = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString()
    const demo: Db = {
      patients: [
        { id: 'demo-p1', record: 'HGRS-018472', name: 'Ana Clara dos Santos', ward: '3B', wing: 'Clínica médica', bed: '312-A', status: 'Ativo', diet: 'Hipossódica', restrictions: 'Alergia a lactose', companion: 'Maria dos Santos', updatedAt: stamp(10) },
        { id: 'demo-p2', record: 'HGRS-021981', name: 'João Pedro Almeida', ward: '2A', wing: 'Ortopedia', bed: '208-B', status: 'Ativo', diet: 'Branda', restrictions: 'Sem restrições', companion: '', updatedAt: stamp(25) },
        { id: 'demo-p3', record: 'HGRS-013564', name: 'Rosa Ferreira Lima', ward: '4C', wing: 'Neurologia', bed: '425-A', status: 'Suspenso', diet: 'Diabética', restrictions: 'Diabetes mellitus', companion: 'Antônio Lima', updatedAt: stamp(40) },
        { id: 'demo-p4', record: 'HGRS-017803', name: 'Lucas Mendes', ward: '1D', wing: 'Cirurgia', bed: '118-C', status: 'Ativo', diet: '', restrictions: 'Sem restrições', companion: '', updatedAt: stamp(18) },
      ],
      admissions: [
        { id: 'demo-a1', patientId: 'demo-p1', ward: '3B', wing: 'Clínica médica', bed: '312-A', status: 'Ativo', companion: 'Maria dos Santos', startedAt: stamp(180), updatedAt: stamp(10) },
        { id: 'demo-a2', patientId: 'demo-p2', ward: '2A', wing: 'Ortopedia', bed: '208-B', status: 'Ativo', companion: '', startedAt: stamp(240), updatedAt: stamp(25) },
        { id: 'demo-a3', patientId: 'demo-p3', ward: '4C', wing: 'Neurologia', bed: '425-A', status: 'Suspenso', companion: 'Antônio Lima', startedAt: stamp(300), updatedAt: stamp(40) },
        { id: 'demo-a4', patientId: 'demo-p4', ward: '1D', wing: 'Cirurgia', bed: '118-C', status: 'Ativo', companion: '', startedAt: stamp(150), updatedAt: stamp(18) },
      ],
      dietPrescriptions: [
        { id: 'demo-d1', patientId: 'demo-p1', diet: 'Hipossódica', restrictions: 'Alergia a lactose', requester: 'Dra. Helena', notes: 'Sem excesso de sal', issuedAt: stamp(70), active: true },
        { id: 'demo-d2', patientId: 'demo-p2', diet: 'Branda', restrictions: 'Sem restrições', requester: 'Nutri. Carla', notes: 'Manter hidratação', issuedAt: stamp(95), active: true },
        { id: 'demo-d3', patientId: 'demo-p3', diet: 'Diabética', restrictions: 'Diabetes mellitus', requester: 'Nutri. Rayane', notes: 'Monitorar glicemia', issuedAt: stamp(120), active: true },
        { id: 'demo-d4', patientId: 'demo-p4', diet: '', restrictions: 'Sem restrições', requester: 'Enfermagem', notes: 'Sem dieta registrada', issuedAt: stamp(55), active: true },
      ],
      releases: [
        { id: 'demo-r1', patientId: 'demo-p1', meal: 'Almoço', exitTime: '11:30', status: 'Pendente', requester: 'Dra. Helena', notes: 'Sem açúcar', createdAt: stamp(30) },
        { id: 'demo-r2', patientId: 'demo-p2', meal: 'Almoço', exitTime: '11:45', status: 'Impresso', requester: 'Nutri. Carla', notes: '', createdAt: stamp(45) },
        { id: 'demo-r3', patientId: 'demo-p4', meal: 'Jantar', exitTime: '17:15', status: 'Pendente', requester: 'Enfermagem', notes: 'Sem dieta', createdAt: stamp(12) },
      ],
      movements: [
        { id: 'demo-m1', patientId: 'demo-p1', type: 'internacao', detail: 'Internação registrada na enfermaria 3B', at: stamp(180), actor: 'Operador' },
        { id: 'demo-m2', patientId: 'demo-p2', type: 'internacao', detail: 'Paciente admitido em 2A', at: stamp(240), actor: 'Operador' },
        { id: 'demo-m3', patientId: 'demo-p3', type: 'suspensao', detail: 'Paciente suspenso por conferência', at: stamp(300), actor: 'Operador' },
        { id: 'demo-m4', patientId: 'demo-p4', type: 'internacao', detail: 'Paciente internado em cirurgia', at: stamp(150), actor: 'Operador' },
      ],
      audit: [
        { id: 'demo-audit-1', at: stamp(8), action: 'Paciente cadastrado', detail: 'Ana Clara dos Santos foi registrada no sistema.' },
        { id: 'demo-audit-2', at: stamp(20), action: 'Liberação registrada', detail: 'Ana Clara dos Santos — Almoço pendente.' },
        { id: 'demo-audit-3', at: stamp(35), action: 'Prescrição de dieta atualizada', detail: 'João Pedro Almeida — Branda.' },
      ],
    }

    setDb(demo)
    setSelectedId(demo.patients[0]?.id ?? '')
    void save(demo).then(() => {
      setNotice('Dados de demonstração carregados com sucesso.')
    }).catch((error) => {
      setNotice(error instanceof Error ? `Dados demo carregados localmente; falha na sincronização: ${error.message}` : 'Dados demo carregados localmente; falha na sincronização remota.')
    })
  }

  const exportReportCsv = () => {
    const rows = reportListReleases.map((release) => {
      const patient = db.patients.find((item) => item.id === release.patientId)
      return {
        patientName: patient?.name ?? 'Paciente',
        record: patient?.record ?? '',
        bed: [patient?.ward ?? '', patient?.bed ?? ''].filter(Boolean).join(' / '),
        meal: release.meal,
        exitTime: release.exitTime,
        status: release.status,
        requester: release.requester,
        diet: abbreviateDiet(patient?.diet ?? ''),
      }
    })

    const csv = buildReleaseCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `relatorio-liberações-${reportDate}-${reportEndDate}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setNotice('Relatório exportado em CSV.')
  }

  const exportReportPdf = () => {
    const printWindow = window.open('', '_blank', 'width=1100,height=850')
    if (!printWindow) {
      setNotice('A exportacao foi bloqueada pelo navegador. Permita pop-ups para salvar o PDF.')
      return
    }

    const generatedAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Bahia' })
    const filterText = `Tipo: ${reportType} | Período: ${new Date(`${reportDate}T12:00:00-03:00`).toLocaleDateString('pt-BR')} a ${new Date(`${reportEndDate}T12:00:00-03:00`).toLocaleDateString('pt-BR')} | Usuario: ${reportUserContext} | Turno: ${reportShiftContext}`
    const statusCounts = {
      pending: reportListReleases.filter((release) => release.status === 'Pendente').length,
      printed: reportListReleases.filter((release) => release.status === 'Impresso').length,
      delivered: reportListReleases.filter((release) => release.status === 'Entregue').length,
      cancelled: reportListReleases.filter((release) => release.status === 'Cancelado').length,
    }
    const reportAuditTimeline = buildAuditSummary(db.audit, 'Todos')
    const mealRows = consumptionMap.map((item) => `<tr><td>${escapeHtml(item.label)}</td><td>${item.count}</td><td>${Math.round(item.percent * 100)}%</td></tr>`).join('')
    const consumptionDetailRows = consumptionDetails.map(({ release, patient, kind, item, observation }) => `<tr><td>${escapeHtml(patient?.name ?? 'Paciente')}</td><td>${escapeHtml(kind)}</td><td>${escapeHtml(item)}</td><td>${escapeHtml(release.exitTime)}</td><td>${escapeHtml(observation || 'Sem observações')}</td></tr>`).join('')
    const admissionRows = reportAdmissions.map((admission) => { const patient = db.patients.find((item) => item.id === admission.patientId); return `<tr><td>${escapeHtml(patient?.name ?? 'Paciente')}</td><td>${escapeHtml(patient?.record ?? '')}</td><td>${escapeHtml([admission.ward, admission.wing, admission.bed].filter(Boolean).join(' / '))}</td><td>${escapeHtml(admission.status)}</td><td>${escapeHtml(new Date(admission.startedAt).toLocaleString('pt-BR'))}</td><td>${escapeHtml(admission.endedAt ? new Date(admission.endedAt).toLocaleString('pt-BR') : 'Em aberto')}</td></tr>` }).join('')
    const releaseRows = reportListReleases.map((release) => {
      const patient = db.patients.find((item) => item.id === release.patientId)
      return `<tr><td>${escapeHtml(patient?.name ?? 'Paciente')}</td><td>${escapeHtml(patient?.record ?? '')}</td><td>${escapeHtml([patient?.ward, patient?.wing, patient?.bed].filter(Boolean).join(' / '))}</td><td>${escapeHtml(release.meal)}</td><td>${escapeHtml(release.exitTime)}</td><td>${escapeHtml(release.status)}</td><td>${escapeHtml(release.deliveredAt ? new Date(release.deliveredAt).toLocaleString('pt-BR') : 'Não entregue')}</td><td>${escapeHtml(release.requester || 'Nao informado')}</td><td>${escapeHtml(abbreviateDiet(patient?.diet ?? '') || 'Nao informada')}</td><td>${escapeHtml(release.audience === 'companion' ? 'Acompanhante' : 'Paciente')}</td><td>${escapeHtml(release.notes || '')}</td></tr>`
    }).join('')
    const auditRows = reportAuditTimeline.map((entry) => `<tr><td>${escapeHtml(new Date(entry.at).toLocaleString('pt-BR'))}</td><td>${escapeHtml(entry.category)}</td><td>${escapeHtml(entry.action)}</td><td>${escapeHtml(entry.detail)}</td></tr>`).join('')

    printWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatorio operacional - ${escapeHtml(reportDate)}</title><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#172033;background:#fff;font:10px/1.4 Arial,sans-serif}h1{margin:0 0 4px;font-size:21px}h2{margin:20px 0 8px;font-size:14px;border-bottom:2px solid #dce2ea;padding-bottom:5px}p{margin:4px 0;color:#4c596c}.header{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #172033;padding-bottom:12px}.header-meta{text-align:right;color:#4c596c}.filters{margin:10px 0;padding:8px 10px;background:#f2f5f8;border:1px solid #dce2ea;border-radius:5px;font-weight:700}.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}.stat{border:1px solid #dce2ea;border-radius:5px;padding:8px}.stat b{display:block;font-size:17px}.stat span{color:#4c596c;font-size:9px}table{width:100%;border-collapse:collapse;margin-top:6px;page-break-inside:auto}thead{display:table-header-group}tr{page-break-inside:avoid}th,td{border:1px solid #dce2ea;padding:5px;text-align:left;vertical-align:top}th{background:#eef2f6;font-size:9px}td{font-size:9px}.footer{margin-top:18px;color:#657286;font-size:8px;border-top:1px solid #dce2ea;padding-top:6px}</style></head><body><header class="header"><div><h1>Mesa de Liberacao</h1><p>Relatorio operacional completo</p></div><div class="header-meta"><div>Gerado em ${escapeHtml(generatedAt)} (Bahia)</div><div>Responsavel: ${escapeHtml(profile?.full_name || 'Usuario atual')}</div></div></header><div class="filters">${escapeHtml(filterText)}</div><section><h2>Resumo do periodo</h2><div class="stats"><div class="stat"><b>${visibleReportReleases.length}</b><span>Liberacoes</span></div><div class="stat"><b>${statusCounts.pending}</b><span>Pendentes</span></div><div class="stat"><b>${statusCounts.printed}</b><span>Impressas</span></div><div class="stat"><b>${statusCounts.delivered}</b><span>Entregues</span></div><div class="stat"><b>${statusCounts.cancelled}</b><span>Canceladas</span></div></div></section><section><h2>Consumo por refeicao</h2><table><thead><tr><th>Refeicao</th><th>Quantidade</th><th>Participacao</th></tr></thead><tbody>${mealRows || '<tr><td colspan="3">Nenhum registro no periodo.</td></tr>'}</tbody></table><h3>Saídas, extras e observações</h3><table><thead><tr><th>Paciente</th><th>Tipo</th><th>Item</th><th>Saída</th><th>Observações</th></tr></thead><tbody>${consumptionDetailRows || '<tr><td colspan="5">Nenhum registro no periodo.</td></tr>'}</tbody></table></section><section><h2>Relatório de pacientes — admissões (${reportAdmissions.length})</h2><table><thead><tr><th>Paciente</th><th>Prontuário</th><th>Localização</th><th>Situação</th><th>Admissão</th><th>Encerramento</th></tr></thead><tbody>${admissionRows || '<tr><td colspan="6">Nenhuma admissão no periodo.</td></tr>'}</tbody></table></section><section><h2>Liberacoes detalhadas (${visibleReportReleases.length})</h2><table><thead><tr><th>Paciente</th><th>Prontuario</th><th>Localizacao</th><th>Refeicao</th><th>Saida</th><th>Status</th><th>Solicitante</th><th>Dieta</th><th>Destino</th><th>Observacoes</th></tr></thead><tbody>${releaseRows || '<tr><td colspan="10">Nenhuma liberacao no periodo.</td></tr>'}</tbody></table></section><section><h2>Auditoria operacional (${reportAuditTimeline.length})</h2><table><thead><tr><th>Data/hora</th><th>Categoria</th><th>Acao</th><th>Detalhes</th></tr></thead><tbody>${auditRows || '<tr><td colspan="4">Nenhuma acao registrada.</td></tr>'}</tbody></table></section><div class="footer">Documento gerado pelo sistema Mesa de Liberacao. Confira os filtros e mantenha o PDF em local protegido.</div></body></html>`)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => printWindow.print(), 300)
    setNotice('Relatorio completo aberto para impressao. Escolha "Salvar como PDF" para exportar o arquivo.')
  }

  const exportAuditCsv = () => {
    const csv = buildAuditCsv(auditTimeline.map((entry) => ({ action: entry.action, detail: entry.detail, category: entry.category, at: entry.at })))
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `auditoria-operacional-${reportDate}-${reportEndDate}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setNotice('Auditoria exportada em CSV.')
  }

  const selected = db.patients.find((p) => p.id === selectedId)
  const currentAdmission = db.admissions.find((a) => a.patientId === selectedId && a.status !== 'Alta' && a.status !== 'Óbito') ?? null
  const patientMovements = db.movements.filter((m) => m.patientId === selectedId).slice(0, 6)
  const activePrescription = useMemo(() => selected ? [...db.dietPrescriptions.filter((p) => p.patientId === selected.id)].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0] ?? null : null, [db.dietPrescriptions, selected])
  const releases = useMemo(() => db.releases.filter((r) => filter === 'Todos' || r.status === filter).sort((a, b) => a.exitTime.localeCompare(b.exitTime)), [db.releases, filter])
  const patientReleases = db.releases.filter((r) => r.patientId === selectedId)
  const printablePatientReleases = patientReleases.filter((release) => release.status === 'Impresso' || release.status === 'Entregue')
  const results = searchPatients(db.patients, query)
  const reportPeriodEnd = reportEndDate < reportDate ? reportDate : reportEndDate
  const todayReleases = useMemo(() => db.releases.filter((r) => {
    const releaseDate = bahiaDate(new Date(r.createdAt))
    return releaseDate >= reportDate && releaseDate <= reportPeriodEnd
  }), [db.releases, reportDate, reportPeriodEnd])
  const reportShiftMap = useMemo(() => Object.fromEntries(adminUsers.map((user) => [user.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(), user.shift])), [adminUsers])
  const visibleReportReleases = useMemo(() => todayReleases.filter((release) => matchesUserContext(release.requester, reportUserContext)).filter((release) => matchesShiftContext(release.requester, reportShiftContext, reportShiftMap)), [todayReleases, reportUserContext, reportShiftContext, reportShiftMap])
  const reportListReleases = useMemo(() => {
    if (reportType === 'pendencias') return visibleReportReleases.filter((release) => release.status === 'Pendente' || release.status === 'Impresso')
    if (reportType === 'excecoes') return visibleReportReleases.filter((release) => release.status === 'Cancelado' || db.patients.find((patient) => patient.id === release.patientId)?.fasting)
    if (reportType === 'auditoria') return []
    if (reportType === 'produtividade') return [...visibleReportReleases].sort((a, b) => a.requester.localeCompare(b.requester, 'pt-BR'))
    if (reportType === 'enfermaria') return [...visibleReportReleases].sort((a, b) => (db.patients.find((patient) => patient.id === a.patientId)?.ward ?? '').localeCompare(db.patients.find((patient) => patient.id === b.patientId)?.ward ?? '', 'pt-BR'))
    return visibleReportReleases
  }, [db.patients, reportType, visibleReportReleases])
  const dailyMealSummary = useMemo(() => buildMealConsumptionSummary(visibleReportReleases), [visibleReportReleases])
  const consumptionMap = dailyMealSummary
  const reportAdmissions = useMemo(() => {
    const periodStart = new Date(`${reportDate}T00:00:00-03:00`).getTime()
    const periodEnd = new Date(`${reportPeriodEnd}T23:59:59-03:00`).getTime()
    return db.admissions.filter((admission) => {
      const startedAt = new Date(admission.startedAt).getTime()
      const endedAt = admission.endedAt ? new Date(admission.endedAt).getTime() : Number.POSITIVE_INFINITY
      return startedAt <= periodEnd && endedAt >= periodStart
    })
  }, [db.admissions, reportDate, reportPeriodEnd])
  const consumptionDetails = useMemo(() => visibleReportReleases.flatMap((release) => {
    const patient = db.patients.find((item) => item.id === release.patientId)
    const extra = release.notes.match(/Extra:\s*([^•]+)/i)?.[1]?.trim()
    return [{ release, patient, kind: extra ? 'Extra' : 'Refeição', item: extra || release.meal, observation: release.notes.replace(/Extra:\s*[^•]+/i, '').replace(/^\s*•\s*|\s*•\s*$/g, '').trim() }]
  }), [db.patients, visibleReportReleases])
  const auditTimeline = useMemo(() => buildAuditSummary(db.audit, auditFilter), [db.audit, auditFilter])
  const turnSummary = useMemo(() => buildShiftSummary(db.releases), [db.releases])
  const overviewStats = useMemo(() => ({
    semDieta: db.patients.filter((p) => p.status === 'Ativo' && !p.diet).length,
    pendentes: db.releases.filter((r) => r.status === 'Pendente').length,
    impresso: db.releases.filter((r) => r.status === 'Impresso').length,
    entregues: db.releases.filter((r) => r.status === 'Entregue').length,
  }), [db.patients, db.releases])
  const patientSummary = useMemo(() => {
    if (!selectedId) return { transferencias: 0, altas: 0, suspensos: 0, obitos: 0 }
    const movements = db.movements.filter((m) => m.patientId === selectedId)
    return {
      transferencias: movements.filter((m) => m.type === 'transferencia').length,
      altas: movements.filter((m) => m.type === 'alta').length,
      suspensos: movements.filter((m) => m.type === 'suspensao').length,
      obitos: movements.filter((m) => m.type === 'obito').length,
    }
  }, [db.movements, selectedId])

  const patientOverview = useMemo(() => ({
    total: db.patients.length,
    ativos: db.patients.filter((p) => p.status === 'Ativo').length,
    semDieta: db.patients.filter((p) => p.status === 'Ativo' && !p.diet.trim()).length,
    suspensos: db.patients.filter((p) => p.status === 'Suspenso').length,
  }), [db.patients])
  const patientWardOptions = officialWardOptions
    const patientDietOptions = useMemo(() => [...new Set(db.patients.flatMap((patient) => parseSelectedDiet(abbreviateDiet(patient.diet))))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [db.patients])
  const patientListCount = db.patients.filter(patientMatchesListFilters).filter((patient) => patientMatchesSelectedContext(patient.id)).length

  const commit = (next: Db, action: string, detail: string, tables?: SyncTable[]) => {
    const updated = { ...next, audit: [{ id: uid(), at: timestamp(), action, detail }, ...next.audit].slice(0, 100) }
    setDb(updated)
    setIsSaving(true)
    if (supabase) setNotice('Salvando alterações no Supabase…')
    void save(updated, tables).then(() => {
      setNotice(`${action} confirmado às ${clock()}`)
      setTimeout(() => setNotice(''), 3200)
    }).catch((error) => {
      setNotice(error instanceof Error ? `${action} salvo localmente; falha na sincronização: ${error.message}` : `${action} salvo localmente; falha na sincronização remota.`)
    }).finally(() => {
      setIsSaving(false)
    })
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) || (e.ctrlKey && e.key === 'k')) {
        e.preventDefault(); document.getElementById('search')?.focus()
      }
      if (e.key === 'Escape') { setPanel(null); setPatientModalOpen(false); setReportModalOpen(false) }
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [])

  useEffect(() => {
    if (panel === 'release') setReleaseForm((current) => ({ ...current, exitTime: bahiaTime() }))
  }, [panel])

  const savePatient = (e: React.FormEvent) => {
    e.preventDefault()
    if (isSaving) return
    if (!form.name || !form.ward || !form.bed) return setNotice('Preencha nome, enfermaria e leito.')
    const selectedDiet = abbreviateDiet(formDietSelections.join(', '))
    const companionText = formHasCompanion ? `${formCompanionMeals.length ? `Acompanhante: ${formCompanionMeals.join(', ')}` : 'Acompanhante presente'}` : ''
    const exists = db.patients.some((p) => p.id === form.id)
    const generatedRecord = `SEM-PRONTUARIO-${timestamp().replace(/\D/g, '').slice(0, 14)}-${uid().slice(0, 8).toUpperCase()}`
    const patient: Patient = { ...form, record: form.record.trim() || (exists ? form.record : generatedRecord), diet: selectedDiet, fasting: selectedDiet ? false : form.fasting, fastingStartedAt: selectedDiet ? undefined : form.fastingStartedAt, fastingReason: selectedDiet ? '' : form.fastingReason, fastingAuthorizedBy: selectedDiet ? undefined : form.fastingAuthorizedBy, companion: companionText, updatedAt: timestamp() }
    const activePrescription = db.dietPrescriptions.find((prescription) => prescription.patientId === patient.id && prescription.active)
    const prescriptionMatchesForm = activePrescription
      && activePrescription.diet === selectedDiet
      && activePrescription.restrictions === patient.restrictions
    let nextDietPrescriptions = db.dietPrescriptions.map((prescription) => prescription.patientId === patient.id ? { ...prescription, active: false } : prescription)
    if (selectedDiet.trim() && !prescriptionMatchesForm) {
      nextDietPrescriptions = [{
        id: uid(),
        patientId: patient.id,
        diet: selectedDiet,
        restrictions: patient.restrictions,
        requester: activePrescription?.requester || profile?.full_name || 'Sistema',
        notes: activePrescription?.notes || '',
        issuedAt: timestamp(),
        active: true,
      }, ...nextDietPrescriptions]
    } else if (prescriptionMatchesForm) {
      nextDietPrescriptions = db.dietPrescriptions
    }
    const nextDb = { ...db, patients: exists ? db.patients.map((p) => p.id === patient.id ? patient : p) : [patient, ...db.patients], dietPrescriptions: nextDietPrescriptions }
    if (!exists) {
      const nextAdmission: Admission = { id: uid(), patientId: patient.id, ward: patient.ward, wing: patient.wing, bed: patient.bed, status: 'Ativo', companion: companionText, fasting: patient.fasting, fastingStartedAt: patient.fastingStartedAt, fastingReason: patient.fastingReason, fastingAuthorizedBy: patient.fastingAuthorizedBy, startedAt: timestamp(), updatedAt: timestamp() }
      nextDb.admissions = [nextAdmission, ...nextDb.admissions]
    } else {
      const existingAdmission = db.admissions.find((admission) => admission.patientId === patient.id && !admission.endedAt) ?? db.admissions.find((admission) => admission.patientId === patient.id)
      if (existingAdmission) {
        nextDb.admissions = nextDb.admissions.map((admission) => admission.id === existingAdmission.id ? { ...admission, ward: patient.ward, wing: patient.wing, bed: patient.bed, companion: companionText, fasting: patient.fasting, fastingStartedAt: patient.fastingStartedAt, fastingReason: patient.fastingReason, fastingAuthorizedBy: patient.fastingAuthorizedBy, updatedAt: patient.updatedAt } : admission)
      }
    }
    commit(nextDb, exists ? 'Paciente atualizado' : 'Paciente cadastrado', patient.name, ['patients', 'admissions', 'diet_prescriptions'])
    setSelectedId(patient.id)
    setPatientModalOpen(false)
    setPanel(null)
  }

  const createRelease = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (isSaving || !selected) return
    const block = releaseBlockedMessage(selected)
    if (block) return setNotice(block)
    const companionNote = releaseForm.audience === 'companion' ? `Acompanhante: ${selected.companion.replace(/^Acompanhante:\s*/i, '')}` : ''
    const extras = releaseForm.extraRequests.map((item) => item.trim()).filter(Boolean)
    if (!releaseForm.exitTime) return
    const createdAt = timestamp()
    const baseNotes = [companionNote, releaseForm.notes.trim()].filter(Boolean).join(' • ')
    const baseRelease: Release = { id: uid(), patientId: selected.id, meal: releaseForm.meal, exitTime: releaseForm.exitTime, status: 'Pendente', requester: releaseForm.requester.trim(), notes: baseNotes, createdAt, audience: releaseForm.audience, labelCopies: releaseForm.meal.toLowerCase() === 'lanche reforçado' ? 3 : 1 }
    const releases: Release[] = [baseRelease, ...extras.map((extra) => ({ ...baseRelease, id: uid(), notes: [baseNotes, `Extra: ${extra}`].filter(Boolean).join(' • '), labelCopies: 1 }))]
    commit({ ...db, releases: [...releases.reverse(), ...db.releases] }, 'Liberação registrada', `${selected.name} — ${releases.length} item(ns)`, ['releases', 'diet_prescriptions', 'admissions'])
    setPanel(null)
    setReleaseForm(blankRelease())
  }

  const situation = (status: PatientStatus) => {
    if (!selected) return
    if (status === 'Alta' || status === 'Óbito' || status === 'Suspenso') {
      const confirmed = window.confirm(`Confirme a alteração da situação de ${selected.name} para ${status}. Essa ação afeta a operação e será registrada na auditoria.`)
      if (!confirmed) return
    }
    if (!canChangeTo(selected.status, status)) return setNotice(`Não é possível alterar a situação após ${selected.status.toLowerCase()}.`)
    const nextDb = { ...db, patients: db.patients.map((p) => p.id === selected.id ? { ...p, status, updatedAt: timestamp() } : p) }
    const nextAdmission = currentAdmission ? { ...currentAdmission } : { id: uid(), patientId: selected.id, ward: selected.ward, wing: selected.wing, bed: selected.bed, status: 'Ativo' as PatientStatus, companion: selected.companion, startedAt: timestamp(), updatedAt: timestamp() }
    nextAdmission.status = status
    nextAdmission.updatedAt = timestamp()
    if (status === 'Alta' || status === 'Óbito') nextAdmission.endedAt = timestamp(); else delete nextAdmission.endedAt
    nextDb.admissions = [nextAdmission, ...db.admissions.filter((a) => a.id !== nextAdmission.id)]
    const movementType = status === 'Suspenso' ? 'suspensao' : status === 'Ativo' ? 'reativacao' : status === 'Alta' ? 'alta' : 'obito'
    const movement: Movement = { id: uid(), patientId: selected.id, type: movementType, detail: `Situação alterada para ${status}`, at: timestamp(), actor: profile?.full_name ?? 'Operador' }
    nextDb.movements = [movement, ...db.movements].slice(0, 100)
    commit(nextDb, `Situação: ${status}`, selected.name, ['patients', 'admissions', 'movements'])
  }

  const zeroDiet = () => {
    if (!selected) return
    const confirmed = window.confirm(`Confirme Zerar Dieta para ${selected.name}. A dieta vigente será removida, mas o paciente e seu histórico serão preservados.`)
    if (!confirmed) return
    const nextDb = {
      ...db,
      patients: db.patients.map((patient) => patient.id === selected.id ? { ...patient, diet: '', fasting: true, fastingStartedAt: timestamp(), fastingReason: 'Dieta zero', fastingAuthorizedBy: profile?.full_name ?? 'Operador', updatedAt: timestamp() } : patient),
      admissions: db.admissions.map((admission) => admission.patientId === selected.id && !admission.endedAt ? { ...admission, fasting: true, fastingStartedAt: timestamp(), fastingReason: 'Dieta zero', fastingAuthorizedBy: profile?.id, updatedAt: timestamp() } : admission),
      dietPrescriptions: db.dietPrescriptions.map((prescription) => prescription.patientId === selected.id ? { ...prescription, active: false, replacedAt: prescription.replacedAt ?? timestamp() } : prescription),
    }
    commit(nextDb, 'Dieta zerada', `${selected.name} — dieta anterior removida; histórico preservado`, ['patients', 'diet_prescriptions'])
  }

  const transfer = (e: React.FormEvent) => {
    e.preventDefault(); if (isSaving || !selected) return
    const destination = { ward: transferForm.ward || selected.ward, wing: transferForm.wing || selected.wing, bed: transferForm.bed || selected.bed }
    const occupied = db.admissions
      .filter((admission) => admission.patientId !== selected.id && admission.status !== 'Alta' && admission.status !== 'Óbito' && !admission.endedAt)
      .map((admission) => ({ patientId: admission.patientId, ward: admission.ward, bed: admission.bed }))
    const conflict = transferBlockedMessage(selected, destination, occupied, selected.id)
    if (!canTransferPatient(selected, destination, occupied, selected.id)) {
      setNotice(conflict ?? 'Transferência inválida.')
      return
    }
    const nextDb = { ...db, patients: db.patients.map((p) => p.id === selected.id ? { ...p, ward: destination.ward, wing: destination.wing, bed: destination.bed, updatedAt: timestamp() } : p) }
    const nextAdmission = currentAdmission ? { ...currentAdmission } : { id: uid(), patientId: selected.id, ward: selected.ward, wing: selected.wing, bed: selected.bed, status: 'Ativo' as PatientStatus, companion: selected.companion, startedAt: timestamp(), updatedAt: timestamp() }
    nextAdmission.ward = destination.ward; nextAdmission.wing = destination.wing; nextAdmission.bed = destination.bed; nextAdmission.status = 'Ativo'; nextAdmission.updatedAt = timestamp()
    nextDb.admissions = [nextAdmission, ...db.admissions.filter((a) => a.id !== nextAdmission.id)]
    const movement: Movement = { id: uid(), patientId: selected.id, type: 'transferencia', detail: `Transferência para ${destination.ward} / ${destination.bed}${transferForm.reason ? ` (${transferForm.reason})` : ''}`, at: timestamp(), actor: 'Operador' }
    nextDb.movements = [movement, ...db.movements].slice(0, 100)
    commit(nextDb, 'Transferência registrada', `${selected.name} -> ${destination.ward}/${destination.bed}`, ['patients', 'admissions', 'movements'])
    setPanel(null)
    setTransferForm(blankTransfer())
  }

  const saveDiet = (e: React.FormEvent) => {
    e.preventDefault(); if (isSaving || !selected) return
    const block = dietUpdateBlockedMessage(dietForm.diet, dietForm.requester)
    if (block) { setNotice(block); return }
    const prescription: DietPrescription = { id: uid(), patientId: selected.id, diet: abbreviateDiet(dietForm.diet), restrictions: dietForm.restrictions.trim(), requester: dietForm.requester.trim(), notes: dietForm.notes.trim(), issuedAt: timestamp(), active: true }
    const nextDb = { ...db, patients: db.patients.map((p) => p.id === selected.id ? { ...p, diet: prescription.diet, fasting: false, fastingStartedAt: undefined, fastingReason: '', fastingAuthorizedBy: undefined, restrictions: prescription.restrictions || p.restrictions, updatedAt: timestamp() } : p), admissions: db.admissions.map((admission) => admission.patientId === selected.id && !admission.endedAt ? { ...admission, fasting: false, fastingStartedAt: undefined, fastingReason: '', fastingAuthorizedBy: undefined, updatedAt: timestamp() } : admission), dietPrescriptions: [prescription, ...db.dietPrescriptions.filter((p) => p.patientId !== selected.id).map((p) => ({ ...p, active: false }))] }
    commit(nextDb, 'Prescrição de dieta atualizada', `${selected.name} — ${prescription.diet}`, ['patients', 'diet_prescriptions'])
    setPanel(null)
    setDietForm(blankDiet())
  }

  const updateReleaseStatus = (id: string, status: ReleaseStatus) => {
    if (isSaving) return
    const release = db.releases.find((r) => r.id === id)
    const current = release?.status ?? 'Pendente'
    if (!canAdvanceReleaseStatus(current, status)) {
      const msg = releaseStatusBlockedMessage(current, status)
      setNotice(msg ?? 'Status inválido para a liberação.')
      return
    }
    const patientName = db.patients.find((p) => p.id === release?.patientId)?.name ?? 'Paciente'
    const changedAt = timestamp()
    const transitionData = status === 'Impresso'
      ? { printedAt: changedAt, printedBy: profile?.id }
      : status === 'Entregue'
        ? { deliveredAt: changedAt, deliveredBy: profile?.id }
        : status === 'Cancelado'
          ? { cancelledAt: changedAt, cancelledBy: profile?.id }
          : {}
    const nextDb = { ...db, releases: db.releases.map((item) => item.id === id ? { ...item, status, ...transitionData } : item) }
    commit(nextDb, `Liberação ${status.toLowerCase()}`, `${patientName} — ${status}`, ['releases'])
  }

  const printRelease = (id: string) => {
    const release = db.releases.find((item) => item.id === id)
    if (!release) return
    printPendingLabels([release])
  }
  const togglePatientReprint = (id: string) => {
    setSelectedReprintIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }
  const reprintSelectedPatientLabels = () => {
    const selectedReleases = patientReleases.filter((release) => selectedReprintIds.includes(release.id) && (release.status === 'Impresso' || release.status === 'Entregue'))
    if (!selectedReleases.length) {
      setNotice('Selecione ao menos uma etiqueta já impressa deste paciente.')
      return
    }
    printPendingLabels(selectedReleases)
    setSelectedReprintIds([])
  }
  const deliverRelease = (id: string) => updateReleaseStatus(id, 'Entregue')
  const cancelRelease = (id: string) => updateReleaseStatus(id, 'Cancelado')
  const printPendingLabels = (requested?: Release[]) => {
    const pending = requested ?? db.releases.filter((r) => r.status === 'Pendente')
    if (!pending.length) {
      setNotice('Não há etiquetas pendentes para imprimir.')
      return
    }
    const printWindow = window.open('', '_blank', 'width=700,height=700')
    if (!printWindow) {
      setNotice('A impressão foi bloqueada pelo navegador. Permita pop-ups para este sistema e tente novamente.')
      return
    }
    const labelRows = pending.flatMap((release) => Array.from({ length: release.labelCopies ?? (release.meal.toLowerCase() === 'lanche reforçado' ? 3 : 1) }, () => release)).map((release) => {
      const patient = db.patients.find((p) => p.id === release.patientId)
      const dateText = new Date(release.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Bahia' })
      const location = [patient?.ward ?? '', patient?.wing ?? '', patient?.bed ?? ''].filter(Boolean).join(' · ')
      const diet = abbreviateDiet(patient?.diet ?? '') || 'Não informada'
      const restrictions = patient?.restrictions || 'Sem restrições'
      const observation = `${(release.notes || 'Sem observações').replace(/\s+/g, ' ').slice(0, 90)}${release.audience === 'companion' ? ' · Acompanhante' : ''}`
      return `<div class="release-label"><div class="label-top"><strong>${escapeHtml(release.audience === 'companion' ? 'REFEIÇÃO ACOMPANHANTE' : (release.notes.includes('Extra:') ? 'EXTRA · ' + release.meal : release.meal))}</strong></div><div class="label-patient">${escapeHtml(patient?.name ?? 'Paciente')}</div><div class="label-line"><span>Leito:</span><b>${escapeHtml(location || 'Não informada')}</b></div><div class="label-line"><span>Data/Hora:</span><b>${escapeHtml(`${dateText} · ${release.exitTime}`)}</b></div><div class="label-line"><span>Dieta:</span><b>${escapeHtml(diet)}</b></div><div class="label-line"><span>Restrição:</span><b>${escapeHtml(restrictions)}</b></div><div class="label-line"><span>Obs.:</span><b>${escapeHtml(observation)}</b></div></div>`
    }).join('')
    printWindow.document.write(`<!doctype html><html><head><title>Etiquetas pendentes</title><style>@page{size:70mm 40mm;margin:0}body{margin:0;font-family:Arial,sans-serif;background:#fff;padding:0}.sheet{display:flex;flex-direction:column;gap:0}.release-label{width:70mm;height:40mm;border:1px solid #111;padding:2.5mm;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-start;gap:1mm;page-break-after:always;background:#fff}.label-top{padding-bottom:0.5mm;border-bottom:1px solid #111;margin-bottom:0.4mm}.label-top strong{display:block;font-size:11px;text-transform:uppercase}.label-patient{font-size:10px;font-weight:900;line-height:1.15;word-break:break-word}.label-line{display:flex;flex-direction:column;gap:0.2mm}.label-line span{font-size:6px;color:#5b6472;font-weight:700;text-transform:uppercase}.label-line b{font-size:7px;line-height:1.15;font-weight:700;word-break:break-word}</style></head><body><div class="sheet">${labelRows}</div></body></html>`)
    printWindow.document.close(); printWindow.focus(); printWindow.print()
    const printedIds = new Set(pending.filter((release) => release.status === 'Pendente').map((release) => release.id))
    const reprintIds = new Set(pending.filter((release) => release.status !== 'Pendente').map((release) => release.id))
    if (printedIds.size) {
      const printedAt = timestamp()
      const nextDb = {
        ...db,
        releases: db.releases.map((release) => printedIds.has(release.id) ? { ...release, status: 'Impresso' as const, printedAt, printedBy: profile?.id } : release),
      }
      commit(nextDb, printedIds.size === 1 ? 'Etiqueta impressa' : 'Etiquetas impressas', `${printedIds.size} etiqueta(s)`, ['releases'])
    } else if (reprintIds.size) {
      commit(db, reprintIds.size === 1 ? 'Etiqueta reimpressa' : 'Etiquetas reimpressas', `${reprintIds.size} etiqueta(s)`, ['releases'])
    }
  }

  return <main className={`app-shell ${darkMode ? 'theme-dark' : 'theme-light'}`} aria-busy={isSaving}>
    <header className="topbar">
      <div className="brand"><div className="brand-mark">H</div><div><b>HGRS</b><small>MESA DE LIBERAÇÃO</small></div></div>
      <nav className="main-nav">{(['painel', 'pacientes', 'relatorios', 'configuracao', ...(canManageProfiles(profile?.role ?? null) ? ['usuarios'] as const : [])] as ClientView[]).map((tab) => <button key={tab} className={view === tab ? 'active' : ''} onClick={() => setView(tab)}>{tab === 'painel' ? 'Painel' : tab === 'pacientes' ? 'Pacientes' : tab === 'relatorios' ? 'Relatórios' : tab === 'configuracao' ? 'Configuração' : 'Usuários'}</button>)}</nav>
      <div className="search-wrap">
        <input id="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar paciente, prontuário, leito… /" />
        {query && results.length > 0 && <div className="search-results">{results.slice(0, 6).map((p) => <button key={p.id} className="result" onClick={() => { openPatientInPanel(p.id); setQuery('') }}>{p.name}<small>{p.record} · {p.bed}</small></button>)}</div>}
      </div>
      <button className="primary" disabled={!canManageOperationalData(profile?.role ?? null)} onClick={() => { resetPatientForm(); setPatientModalOpen(true) }}>+ Novo paciente</button>
      <button className="icon-button" type="button" aria-label="Alternar tema" aria-pressed={darkMode} onClick={() => setDarkMode((prev) => !prev)}>{darkMode ? '☀' : '☾'}</button>
      <div className={`online ${isOnline ? 'is-online' : 'is-offline'} ${isSaving ? 'is-saving' : ''}`} aria-live="polite">
        <span>{isOnline ? '● Online' : '● Offline'}</span>
        <small>{getRoleLabel(profile?.role ?? null)} · {profile?.shift_name || 'Turno não informado'}</small>
        <small>{isSaving ? 'Salvando alterações…' : lastSyncAt ? `Sincronizado ${new Date(lastSyncAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Sincronização pendente'}</small>
      </div>
      <b>{clock()}</b>
    </header>
    <datalist id="ward-options">{patientWardOptions.map((ward) => <option key={ward} value={ward} />)}</datalist>

    {notice && <div className="toast" role="status" aria-live="polite">{notice}</div>}

    {view === 'painel' && <>
      <div className="kpi-strip">
        <button type="button" className="kpi-card warn" onClick={() => { setDashboardFocus('semDieta'); setView('pacientes') }}><span>Sem dieta</span><b>{overviewStats.semDieta}</b></button>
        <button type="button" className="kpi-card" onClick={() => { setDashboardFocus('pendentes'); setView('pacientes') }}><span>Pendentes</span><b>{overviewStats.pendentes}</b></button>
        <button type="button" className="kpi-card info" onClick={() => { setDashboardFocus('impressos'); setView('pacientes') }}><span>Impressos</span><b>{overviewStats.impresso}</b></button>
        <button type="button" className="kpi-card success" onClick={() => { setDashboardFocus('entregues'); setView('pacientes') }}><span>Entregues</span><b>{overviewStats.entregues}</b></button>
      </div>
      <section className="layout">
      <aside className="queue">
        <div className="heading">
          <div><small>FILA DO DIA</small><h2>Liberações</h2></div>
          <div className="heading-actions"><button className="tiny-button" onClick={() => printPendingLabels()}>Imprimir pendentes</button><button className="tiny-button" onClick={() => printPendingLabels(db.releases.filter((release) => release.status === 'Impresso'))}>Reimprimir impressos</button></div>
        </div>
        <div className="filters">{(['Todos', 'Pendente', 'Impresso', 'Entregue'] as const).map((x) => <button key={x} className={filter === x ? 'active' : ''} onClick={() => setFilter(x)}>{x}</button>)}</div>
        {releases.map((r) => {
          const p = db.patients.find((x) => x.id === r.patientId)
          return <button className={'queueitem ' + (selectedId === r.patientId ? 'selected' : '')} key={r.id} onClick={() => setSelectedId(r.patientId)}><time>{r.exitTime}</time><span><b>{p?.name}</b><small>{p?.ward} · {p?.bed} · {r.meal}</small></span><StatusBadge status={r.status} /></button>
        })}
      </aside>

      <section className="focus">
        {selected && <>
          <div className="patienthead"><div><small>PACIENTE EM FOCO</small><h1>{selected.name}</h1><p>{selected.record} · {selected.wing} · Enf. {currentAdmission?.ward ?? selected.ward} · Leito {currentAdmission?.bed ?? selected.bed}</p></div><b className={'state ' + selected.status.toLowerCase()}>{selected.status}</b></div>
          <div className={selected.restrictions && selected.restrictions !== 'Sem restrições' ? 'alert critical' : 'alert'}>{selected.restrictions && selected.restrictions !== 'Sem restrições' ? `⚠ RESTRIÇÃO/ALERGIA: ${selected.restrictions}` : '✓ Sem alergias ou restrições registradas'}</div>
          <div className="details"><div><small>DIETA VIGENTE</small><b>{selected.diet || 'Não informada'}</b></div><div><small>INTERNACÃO</small><b>{currentAdmission ? `${currentAdmission.ward} · ${currentAdmission.bed}` : 'Sem internação ativa'}</b></div><div><small>ATUALIZADO</small><b>{new Date(selected.updatedAt).toLocaleString('pt-BR')}</b></div></div>
          <div className="records"><h2>Prescrição ativa</h2>{activePrescription ? <div className="record"><b>{activePrescription.diet}</b><span>{activePrescription.restrictions || 'Sem restrições'}</span><small>{activePrescription.requester} · {new Date(activePrescription.issuedAt).toLocaleDateString('pt-BR')}</small></div> : <p>Nenhuma prescrição registrada.</p>}</div>
          <div className="actions"><button className="primary" onClick={() => setPanel('release')}>+ Nova liberação</button><button onClick={() => { setTransferForm({ ward: selected.ward, wing: selected.wing, bed: selected.bed, reason: '', requester: '' }); setPanel('transfer') }}>Transferir</button><button onClick={() => { setDietForm({ diet: selected.diet, restrictions: selected.restrictions, requester: '', notes: '' }); setPanel('diet') }}>Atualizar dieta</button><button onClick={() => { resetPatientForm(selected); setPatientModalOpen(true) }}>Dados do paciente</button><button onClick={() => setPatientSummaryOpen(true)}>Resumo</button><button className="danger" onClick={zeroDiet}>Zerar dieta</button><button onClick={() => situation('Alta')}>Dar alta</button><button className="danger" onClick={() => situation('Óbito')}>Registrar óbito</button></div>
          <div className="records"><h2>Movimentações recentes</h2>{patientMovements.length ? patientMovements.map((m) => <div className="record" key={m.id}><b>{new Date(m.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</b><span>{m.detail}</span><small>{m.type}</small></div>) : <p>Nenhuma movimentação registrada.</p>}</div>
          <div className="records"><h2>Liberações de hoje</h2>{patientReleases.length ? patientReleases.map((r) => <div className="record" key={r.id}><b>{r.exitTime} · {r.meal}</b><span>{r.requester || 'Solicitante não informado'} {r.notes && `· ${r.notes}`}</span><StatusBadge status={r.status} />{r.status === 'Pendente' && <button onClick={() => printRelease(r.id)}>Imprimir</button>}{r.status === 'Impresso' && <button onClick={() => deliverRelease(r.id)}>Entregar</button>}{r.status !== 'Entregue' && r.status !== 'Cancelado' && <button onClick={() => cancelRelease(r.id)}>Cancelar</button>}</div>) : <p>Nenhuma liberação registrada.</p>}</div>
          <div className="records patient-reprint-panel"><div className="list-row"><h2>Reimpressão de etiquetas</h2><button className="secondary" disabled={!selectedReprintIds.length} onClick={reprintSelectedPatientLabels}>Reimprimir selecionadas ({selectedReprintIds.length})</button></div>{printablePatientReleases.length ? <><div className="list-row"><small>Selecione uma ou mais liberações já impressas deste paciente.</small><button className="tiny-button" onClick={() => setSelectedReprintIds(selectedReprintIds.length === printablePatientReleases.length ? [] : printablePatientReleases.map((release) => release.id))}>{selectedReprintIds.length === printablePatientReleases.length ? 'Desmarcar todas' : 'Selecionar todas'}</button></div>{printablePatientReleases.map((release) => <label className="record" key={`reprint-${release.id}`}><input type="checkbox" checked={selectedReprintIds.includes(release.id)} onChange={() => togglePatientReprint(release.id)} aria-label={`Selecionar reimpressão de ${release.meal} às ${release.exitTime}`} /><b>{release.exitTime} · {release.meal}</b><span>{release.requester || 'Solicitante não informado'} {release.notes && `· ${release.notes}`}</span><StatusBadge status={release.status} /></label>)}</> : <p>Nenhuma etiqueta impressa para este paciente.</p>}</div>
        </>}
      </section>

      <aside className="side"><h2>Pendências</h2><div className="metric"><b>{db.patients.filter((p) => p.status === 'Ativo' && !p.diet).length}</b><span>Ativos sem dieta</span></div><div className="metric blue"><b>{db.releases.filter((r) => r.status === 'Pendente').length}</b><span>Etiquetas pendentes</span></div><div className="shift-summary"><div className="shift-header"><small>TURNOS</small><strong>{turnSummary.shiftName}</strong></div><div className="shift-grid"><div><b>{turnSummary.pendentes}</b><span>Pendentes</span></div><div><b>{turnSummary.impressos}</b><span>Impressos</span></div><div><b>{turnSummary.entregues}</b><span>Entregues</span></div><div><b>{turnSummary.totais}</b><span>Total</span></div></div></div><h2>Últimas ações</h2>{db.audit.slice(0, 6).map((a) => <div className="audit" key={a.id}><b>{a.action}</b><small>{a.detail} · {new Date(a.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></div>)}</aside>
      </section>
    </>}

    {view === 'pacientes' && <section className="page-shell">
      <div className="page-header">
        <div>
          <small>LISTA OPERACIONAL</small>
          <h2>{dashboardFocus === 'semDieta' ? 'Pacientes sem dieta' : dashboardFocus === 'pendentes' ? 'Liberações pendentes' : dashboardFocus === 'impressos' ? 'Liberações impressas' : dashboardFocus === 'entregues' ? 'Liberações entregues' : 'Pacientes e filtros'}</h2>
        </div>
      </div>

      <div className="patients-layout">
      <aside className="patients-filter-sidebar" aria-label="Filtros de pacientes">
        <div className="sidebar-heading"><small>FILTROS</small><strong>Pacientes</strong></div>
        <label className="sidebar-search">Buscar paciente<input value={patientQuery} onChange={(event) => setPatientQuery(event.target.value)} placeholder="Nome, prontuário ou leito" /></label>
        <label className="sidebar-select">Enfermaria<select value={patientWardFilter} onChange={(event) => setPatientWardFilter(event.target.value)}><option value="Todos">Todas</option>{patientWardOptions.map((ward) => <option key={ward} value={ward}>{ward}</option>)}</select></label>
        <label className="sidebar-select">Dieta<select value={patientDietFilter} onChange={(event) => setPatientDietFilter(event.target.value)}><option value="Todos">Todas</option><option value="Dieta zerada">Dieta zerada</option>{patientDietOptions.map((diet) => <option key={diet} value={diet}>{diet}</option>)}</select></label>
        <div className="sidebar-filter-group"><span>Situação</span>{(['Todos', 'Ativo', 'Suspenso', 'Alta', 'Óbito'] as const).map((status) => <button key={status} className={patientStatusFilter === status ? 'active' : ''} onClick={() => setPatientStatusFilter(status)}>{status}</button>)}</div>
        <div className="sidebar-filter-group"><span>Solicitante</span>{['Todos', ...adminUsers.map((user) => user.name)].map((option) => <button key={option} className={selectedUserContext === option ? 'active' : ''} onClick={() => applyUserContext(option)}>{option}</button>)}</div>
        <div className="sidebar-filter-group"><span>Turno</span>{(['Todos', 'Manhã', 'Tarde', 'Noite'] as const).map((shift) => <button key={shift} className={selectedShiftContext === shift ? 'active' : ''} onClick={() => setSelectedShiftContext(shift)}>{shift}</button>)}</div>
        <button className="secondary sidebar-clear" onClick={clearPatientFilters}>Limpar filtros</button>
      </aside>
      <div className="patients-results">
      <div className="overview-strip">
        <div className="overview-item"><span>Total</span><strong>{patientOverview.total}</strong></div>
        <div className="overview-item"><span>Ativos</span><strong>{patientOverview.ativos}</strong></div>
        <div className="overview-item"><span>Sem dieta</span><strong>{patientOverview.semDieta}</strong></div>
        <div className="overview-item"><span>Suspensos</span><strong>{patientOverview.suspensos}</strong></div>
      </div>

      {!dashboardFocus && patientListCount === 0 && <div className="empty-state"><strong>Nenhum paciente encontrado</strong><span>Ajuste os filtros ou limpe a busca para visualizar outros registros.</span></div>}
      {dashboardFocus ? <div className="list-stack">{dashboardFocus === 'semDieta' ? db.patients.filter((p) => p.status === 'Ativo' && !p.diet.trim()).filter((p) => patientStatusFilter === 'Todos' || p.status === patientStatusFilter).filter((p) => patientMatchesSelectedContext(p.id)).map((p) => <div className="list-card patient-list-card" role="button" tabIndex={0} key={p.id} onClick={() => openPatientInPanel(p.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPatientInPanel(p.id) } }}><div className="list-row"><strong>{p.name}</strong><span className={`badge ${p.status.toLowerCase()}`}>{p.status}</span></div><small>{p.record} · {p.ward} · {p.bed}</small><div className="list-meta"><span>Dieta: {p.diet || 'Não informada'}</span><span>{p.restrictions || 'Sem restrições'}</span></div></div>) : db.releases.filter((release) => dashboardFocus === 'pendentes' ? release.status === 'Pendente' : dashboardFocus === 'impressos' ? release.status === 'Impresso' : release.status === 'Entregue').filter((release) => matchesUserContext(release.requester, selectedUserContext)).filter((release) => patientStatusFilter === 'Todos' || (db.patients.find((p) => p.id === release.patientId)?.status ?? 'Ativo') === patientStatusFilter).map((release) => { const patient = db.patients.find((p) => p.id === release.patientId); return <div className="list-card" key={release.id}><div className="list-row"><strong>{patient?.name ?? 'Paciente'}</strong><StatusBadge status={release.status} /></div><small>{patient?.ward} · {patient?.bed} · {release.meal}</small><div className="list-meta"><span>{release.exitTime}</span><span>{release.requester || 'Sem solicitante'}</span></div></div> })}</div> : <div className="list-stack">{db.patients.filter((p) => patientStatusFilter === 'Todos' || p.status === patientStatusFilter).filter((p) => patientMatchesSelectedContext(p.id)).map((p) => <div className="list-card patient-list-card" role="button" tabIndex={0} key={p.id} onClick={() => openPatientInPanel(p.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPatientInPanel(p.id) } }}><div className="list-row"><strong>{p.name}</strong><span className={`badge ${p.status.toLowerCase()}`}>{p.status}</span></div><small>{p.record} · {p.ward} · {p.bed}</small><div className="list-meta"><span>{p.diet || 'Sem dieta'}</span><span>{p.restrictions || 'Sem restrições'}</span></div></div>)}</div>}
      </div>
      </div>
    </section>}

    {view === 'relatorios' && canViewReports(profile?.role ?? null) && <section className="page-shell report-page">
      <div className="page-header">
        <div>
          <small>RELATÓRIOS</small>
          <h2>Mapa de consumo e indicadores</h2>
        </div>
        <div className="report-controls">
          <label>Data inicial<input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} /></label>
          <label>Data final<input type="date" value={reportEndDate} min={reportDate} onChange={(e) => setReportEndDate(e.target.value)} /></label>
          <label>Usuário<select value={reportUserContext} onChange={(e) => setReportUserContext(e.target.value)}>{['Todos', ...adminUsers.map((user) => user.name)].map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label>Turno<select value={reportShiftContext} onChange={(e) => setReportShiftContext(e.target.value as 'Todos' | 'Manhã' | 'Tarde' | 'Noite')}><option value="Todos">Todos</option><option value="Manhã">Manhã</option><option value="Tarde">Tarde</option><option value="Noite">Noite</option></select></label>
          <label>Tipo de relatório<select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)}><option value="completo">Relatório completo</option><option value="pendencias">Pendências operacionais</option><option value="excecoes">Exceções e bloqueios</option><option value="auditoria">Auditoria operacional</option><option value="enfermaria">Por enfermaria</option><option value="produtividade">Produtividade por solicitante</option></select></label>
          <button className="primary" onClick={exportReportPdf}>Exportar PDF</button>
          <button className="secondary" onClick={exportReportCsv}>Exportar CSV</button>
        </div>
      </div>
      <div className="report-grid">
        <div className="report-card">
          <h3>Resumo</h3>
          <div className="report-stats">
            <div className="stat-card"><b>{reportListReleases.length}</b><span>Liberações</span></div>
            <div className="stat-card"><b>{reportListReleases.filter((r) => r.status === 'Pendente').length}</b><span>Pendentes</span></div>
            <div className="stat-card"><b>{reportShiftContext === 'Todos' ? turnSummary.shiftName : reportShiftContext}</b><span>Turno</span></div>
            {dailyMealSummary.map((item) => <div key={item.label} className="stat-card"><b>{item.count}</b><span>{item.label}</span></div>)}
          </div>
        </div>
        <div className="report-card">
          <h3>Mapa de consumo</h3>
          <div className="consumption-map">{consumptionMap.map((item) => <div className="consumption-row" key={item.label}><span>{item.label}</span><div className="consumption-bar"><i style={{ width: `${Math.max(8, item.percent * 100)}%` }} /></div><b>{item.count}</b></div>)}</div>
        </div>
      </div>
      <div className="report-card full">
        <h3>{reportType === 'completo' ? 'Liberações do período' : reportType === 'pendencias' ? 'Pendências operacionais' : reportType === 'excecoes' ? 'Exceções e bloqueios' : reportType === 'auditoria' ? 'Auditoria operacional' : reportType === 'enfermaria' ? 'Liberações por enfermaria' : 'Produtividade por solicitante'}</h3>
        <div className="report-list">{reportListReleases.length ? reportListReleases.map((release) => { const patient = db.patients.find((p) => p.id === release.patientId); return <div className="report-row" key={release.id}><strong>{patient?.name ?? 'Paciente'}</strong><span>{release.meal} · {release.exitTime}</span><small>Solicitante: {release.requester || 'Não informado'} · Dieta: {abbreviateDiet(patient?.diet ?? '') || 'Não informada'} · Entrega: {release.deliveredAt ? new Date(release.deliveredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Não entregue'}</small><StatusBadge status={release.status} /></div> }) : <p>Nenhuma liberação para este filtro.</p>}</div>
      </div>
      <div className="report-card full">
        <h3>Painel de auditoria</h3>
        <div className="filters-inline" style={{ gap: 8, marginTop: 8 }}>{(['Todos', 'Paciente', 'Liberação', 'Dieta', 'Sistema'] as const).map((option) => <button key={option} className={auditFilter === option ? 'active' : ''} onClick={() => setAuditFilter(option)}>{option}</button>)}<button className="secondary" onClick={exportAuditCsv}>Exportar auditoria CSV</button></div>
        <div className="report-list">{auditTimeline.length ? auditTimeline.map((entry) => <div className="report-row" key={entry.id}><strong>{entry.action}</strong><span>{entry.category}</span><small>{new Date(entry.at).toLocaleString('pt-BR')}</small><em>{entry.detail}</em></div>) : <p>Nenhuma ação registrada.</p>}</div>
      </div>
    </section>}

    {view === 'configuracao' && <section className="page-shell">
      <div className="page-header">
        <div><small>CONFIGURAÇÃO</small><h2>Minha conta</h2></div>
      </div>
      <div className="settings-grid">
        <div className="settings-card">
          <h3>Perfil</h3>
          <div className="profile-summary">
            <div className="profile-avatar">{(configName || 'U').charAt(0).toUpperCase()}</div>
            <div>
              <strong>{configName || 'Usuário sem nome'}</strong>
              <small>{getRoleLabel(profile?.role ?? null)}</small>
            </div>
          </div>
          <label>Nome completo<input value={configName} onChange={(e) => setConfigName(e.target.value)} /></label>
          <button className="primary" onClick={() => void persistProfileName()}>Salvar nome</button>
        </div>

        <div className="settings-card">
          <h3>Preferências</h3>
          <div className="switch-row">
            <span>Modo noturno</span>
            <button type="button" className={`toggle ${darkMode ? 'active' : ''}`} onClick={() => setDarkMode((prev) => !prev)} aria-label="Alternar modo noturno">
              <span className="toggle-thumb" />
            </button>
          </div>
          <p>Personalize a aparência do sistema para ambiente de plantão, revisão ou operação noturna.</p>
        </div>

        <div className="settings-card">
          <h3>Sincronização</h3>
          <p>Sincroniza o estado atual da operação com o banco Supabase e recarrega os dados do backend.</p>
          <button className="primary" disabled={isSaving} onClick={() => void syncDatabaseWithSupabase()}>{isSaving ? 'Sincronizando…' : 'Sincronizar dados'}</button>
        </div>
        <div className="settings-card">
          <h3>Backup operacional</h3>
          <p>Exporta uma cópia JSON dos dados carregados para recuperação emergencial. Não substitui o dump do Supabase; o arquivo contém dados sensíveis e deve ser protegido.</p>
          <button className="secondary" disabled={profile?.role !== 'administrador'} onClick={exportOperationalBackup}>Exportar backup JSON</button>
        </div>
        <div className="settings-card">
          <h3>Dados de demonstração</h3>
          <p>Carrega uma base de exemplo para treinamentos, testes de fluxo e validação de turno sem depender de dados reais.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="primary" disabled={Boolean(supabase)} onClick={loadDemoData}>Carregar dados demo</button>
            <button className="secondary" disabled={Boolean(supabase)} onClick={() => { setDb(load()); setNotice('Dados locais restaurados.') }}>Restaurar base atual</button>
          </div>
        </div>
        <div className="settings-card">
          <h3>Alterar senha</h3>
          <label>Nova senha<input type="password" value={configPassword} onChange={(e) => setConfigPassword(e.target.value)} placeholder="Digite a nova senha" /></label>
          <button className="primary" onClick={async () => { if (!configPassword.trim()) return setNotice('Informe a nova senha.'); if (supabase) { try { await supabase.auth.updateUser({ password: configPassword }); setNotice('Senha atualizada com sucesso.'); setConfigPassword(''); } catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível atualizar a senha.'); } } else { setNotice('Senha salva localmente para uso do ambiente de teste.'); setConfigPassword(''); } }}>Alterar senha</button>
        </div>
        <div className="settings-card danger-card">
          <h3>Sair</h3>
          <p>Encerrar a sessão atual e voltar para a tela de login.</p>
          <button className="danger" onClick={async () => { if (supabase) { try { await supabase.auth.signOut(); setNotice('Sessão encerrada.'); } catch { setNotice('Não foi possível sair no momento.'); } } else { setNotice('Sessão simulada encerrada.'); } }}>Sair do login</button>
        </div>
      </div>
    </section>}

    {view === 'usuarios' && canManageProfiles(profile?.role ?? null) && <section className="page-shell">
      <div className="page-header"><div><small>ADMINISTRAÇÃO</small><h2>Usuários do sistema</h2></div></div>
      <div className="settings-grid">
        <div className="settings-card large">
          <h3>Novo usuário</h3>
          <form className="form" onSubmit={createAdminUser}>
            <div className="form-grid-inline">
              <label>Nome<input value={newUser.name} onChange={(e) => setNewUser((prev) => ({ ...prev, name: e.target.value }))} /></label>
              <label>E-mail<input type="email" value={newUser.email} onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))} /></label>
              {!supabase && <label>Senha provisória<input type="password" autoComplete="new-password" value={newUser.password} onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))} /></label>}
              {supabase && <p className="form-help">Um convite será enviado por e-mail. O usuário definirá a própria senha no primeiro acesso.</p>}
              <label>Turno<select value={newUser.shift} onChange={(e) => setNewUser((prev) => ({ ...prev, shift: e.target.value }))}><option>Manhã</option><option>Tarde</option><option>Noite</option></select></label>
              <label>Nível<select value={newUser.role} onChange={(e) => setNewUser((prev) => ({ ...prev, role: e.target.value as 'operador' | 'supervisor' | 'administrador' }))}><option value="operador">Operador</option><option value="supervisor">Supervisor</option><option value="administrador">Administrador</option></select></label>
            </div>
            <button className="primary" type="submit" disabled={isSaving}>{isSaving ? 'Enviando convite…' : supabase ? 'Enviar convite' : 'Adicionar usuário'}</button>
          </form>
        </div>
        <div className="settings-card large">
          <h3>Usuários cadastrados</h3>
          {adminUsers.length ? <div className="user-list">{adminUsers.map((user) => <div key={user.id} className="user-row"><div><strong>{user.name}</strong><small>{user.email}</small></div><div className="user-meta"><span>{user.shift}</span><span>{getRoleLabel(user.role)}</span><span>{user.password}</span></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="tiny-button" onClick={() => { applyUserContext(user.name); setDashboardFocus(null); setView('pacientes'); }}>Pacientes</button><button className="tiny-button" onClick={() => setAdminUsers((prev) => prev.filter((item) => item.id !== user.id))}>Remover</button></div></div>)}</div> : <p>Nenhum usuário cadastrado.</p>}
        </div>
      </div>
    </section>}

    {patientModalOpen && <div className="modal-backdrop" onClick={() => setPatientModalOpen(false)}><div className="modal-card modal-wide" onClick={(e) => e.stopPropagation()}><header><h3>{db.patients.some((p) => p.id === form.id) ? 'Atualizar paciente' : 'Novo paciente'}</h3><button className="close" onClick={() => setPatientModalOpen(false)} aria-label="Fechar modal">×</button></header><form className="form" onSubmit={savePatient}><div className="form-grid"><label>Nome completo<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><label>Prontuário<input value={form.record} onChange={(e) => setForm({ ...form, record: e.target.value })} /></label><label>Enfermaria<input list="ward-options" value={form.ward} onChange={(e) => setForm({ ...form, ward: e.target.value })} required /></label><label>Ala / setor<input value={form.wing} onChange={(e) => setForm({ ...form, wing: e.target.value })} /></label><label>Leito<input value={form.bed} onChange={(e) => setForm({ ...form, bed: e.target.value })} required /></label><label>Restrições e alergias<textarea value={form.restrictions} onChange={(e) => setForm({ ...form, restrictions: e.target.value })} /></label></div><div className="diet-picker"><label className="checklist-title">Dieta vigente</label><div className="checklist-grid">{dietOptions.map((option) => <label key={option} className="check-item"><input type="checkbox" checked={formDietSelections.includes(option)} onChange={() => setFormDietSelections((prev) => prev.includes(option) ? prev.filter((item) => item !== option) : [...prev, option])} />{dietDisplayLabels[option] ?? option}</label>)}</div></div><div className="companion-block"><label className="checklist-title">Acompanhante</label><label className="check-item"><input type="checkbox" checked={formHasCompanion} onChange={(e) => setFormHasCompanion(e.target.checked)} /> Possui acompanhante</label>{formHasCompanion && <div className="checklist-grid compact">{['Almoço', 'Jantar'].map((meal) => <label key={meal} className="check-item"><input type="checkbox" checked={formCompanionMeals.includes(meal)} onChange={() => setFormCompanionMeals((prev) => prev.includes(meal) ? prev.filter((item) => item !== meal) : [...prev, meal])} />{meal}</label>)}</div>}</div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setPatientModalOpen(false)}>Cancelar</button><button className="primary" type="submit">Salvar paciente</button></div></form></div></div>}

    {reportModalOpen && <div className="modal-backdrop" onClick={() => setReportModalOpen(false)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><header><h3>Relatórios</h3><button className="close" onClick={() => setReportModalOpen(false)} aria-label="Fechar relatórios">×</button></header><div className="report-wrap"><label>Data<select value={reportDate} onChange={(e) => setReportDate(e.target.value)}>{Array.from({ length: 7 }, (_, index) => {
      const date = new Date(); date.setDate(date.getDate() - index)
      const value = date.toISOString().slice(0, 10)
      return <option key={value} value={value}>{new Date(value).toLocaleDateString('pt-BR')}</option>
    })}</select></label><label>Usuário<select value={reportUserContext} onChange={(e) => setReportUserContext(e.target.value)}>{['Todos', ...adminUsers.map((user) => user.name)].map((option) => <option key={option} value={option}>{option}</option>)}</select></label><label>Turno<select value={reportShiftContext} onChange={(e) => setReportShiftContext(e.target.value as 'Todos' | 'Manhã' | 'Tarde' | 'Noite')}><option value="Todos">Todos</option><option value="Manhã">Manhã</option><option value="Tarde">Tarde</option><option value="Noite">Noite</option></select></label><div className="report-stats"><div className="stat-card"><b>{visibleReportReleases.length}</b><span>Liberações</span></div><div className="stat-card"><b>{visibleReportReleases.filter((r) => r.status === 'Pendente').length}</b><span>Pendentes</span></div><div className="stat-card"><b>{reportShiftContext === 'Todos' ? turnSummary.shiftName : reportShiftContext}</b><span>Turno</span></div>{dailyMealSummary.map((item) => <div key={item.label} className="stat-card"><b>{item.count}</b><span>{item.label}</span></div>)}</div><div className="consumption-map">{consumptionMap.map((item) => <div className="consumption-row" key={item.label}><span>{item.label}</span><div className="consumption-bar"><i style={{ width: `${Math.max(8, item.percent * 100)}%` }} /></div><b>{item.count}</b></div>)}</div><div className="report-list">{visibleReportReleases.length ? visibleReportReleases.map((release) => { const patient = db.patients.find((p) => p.id === release.patientId); return <div className="report-row" key={release.id}><strong>{patient?.name ?? 'Paciente'}</strong><span>{release.meal}</span><small>{release.exitTime}</small></div> }) : <p>Nenhuma liberação para este filtro.</p>}</div><div className="modal-actions"><button type="button" className="secondary" onClick={() => window.print()}>Imprimir relatório</button><button type="button" className="primary" onClick={() => printPendingLabels()}>Imprimir pendentes</button></div></div></div></div>}

    {patientSummaryOpen && selected && <div className="modal-backdrop" onClick={() => setPatientSummaryOpen(false)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><header><h3>Resumo do paciente</h3><button className="close" onClick={() => setPatientSummaryOpen(false)} aria-label="Fechar resumo">×</button></header><div className="summary-grid"><div className="summary-card"><b>{patientSummary.altas}</b><span>Altas</span></div><div className="summary-card"><b>{patientSummary.transferencias}</b><span>Transferências</span></div><div className="summary-card"><b>{patientSummary.suspensos}</b><span>Suspensos</span></div><div className="summary-card"><b>{patientSummary.obitos}</b><span>Óbitos</span></div></div><div className="summary-note"><strong>{selected.name}</strong><p>{selected.record} · {selected.ward} · {selected.bed}</p><small>Última atualização: {new Date(selected.updatedAt).toLocaleString('pt-BR')}</small></div></div></div>}

    {panel === 'release' && selected && <SidePanel title="Nova liberação" onClose={() => setPanel(null)}><form className="form" onSubmit={createRelease}><p><b>{selected.name}</b><br />{selected.diet || 'Dieta não informada'}</p><label>Refeição<select value={releaseForm.meal} onChange={(e) => setReleaseForm({ ...releaseForm, meal: e.target.value })}>{mealOptions.map((meal) => <option key={meal} value={meal}>{meal}</option>)}</select></label>{selected.companion && <label>Destino<select value={releaseForm.audience} onChange={(e) => setReleaseForm({ ...releaseForm, audience: e.target.value as 'patient' | 'companion' })}><option value="patient">Paciente</option><option value="companion">Acompanhante ({selected.companion.replace(/^Acompanhante:\s*/i, '')})</option></select></label>}<fieldset className="extra-list"><legend>Extras da liberação</legend>{releaseForm.extraRequests.map((extra, index) => <div className="extra-row" key={`extra-${index}`}><input aria-label={`Extra ${index + 1}`} value={extra} onChange={(e) => setReleaseForm({ ...releaseForm, extraRequests: releaseForm.extraRequests.map((item, itemIndex) => itemIndex === index ? e.target.value : item) })} placeholder="Ex.: 1 pão de sal" />{releaseForm.extraRequests.length > 1 && <button type="button" className="secondary" aria-label={`Remover extra ${index + 1}`} onClick={() => setReleaseForm({ ...releaseForm, extraRequests: releaseForm.extraRequests.filter((_, itemIndex) => itemIndex !== index) })}>Remover</button>}</div>)}<button type="button" className="secondary" onClick={() => setReleaseForm({ ...releaseForm, extraRequests: [...releaseForm.extraRequests, ''] })}>+ Adicionar outro extra</button></fieldset><label>Horário de saída<input type="time" value={releaseForm.exitTime} onChange={(e) => setReleaseForm({ ...releaseForm, exitTime: e.target.value })} required /></label><label>Solicitante<input value={releaseForm.requester} onChange={(e) => setReleaseForm({ ...releaseForm, requester: e.target.value })} placeholder="Ex.: Nutri. Carla" /></label><label>Observações<textarea value={releaseForm.notes} onChange={(e) => setReleaseForm({ ...releaseForm, notes: e.target.value })} /></label><button className="primary">Registrar liberação</button></form></SidePanel>}

    {panel === 'transfer' && selected && <SidePanel title="Transferir paciente" onClose={() => setPanel(null)}><form className="form" onSubmit={transfer}><label>Enfermaria<input value={transferForm.ward || selected.ward} onChange={(e) => setTransferForm({ ...transferForm, ward: e.target.value })} /></label><label>Ala<input value={transferForm.wing || selected.wing} onChange={(e) => setTransferForm({ ...transferForm, wing: e.target.value })} /></label><label>Leito<input value={transferForm.bed || selected.bed} onChange={(e) => setTransferForm({ ...transferForm, bed: e.target.value })} /></label><label>Motivo<textarea value={transferForm.reason} onChange={(e) => setTransferForm({ ...transferForm, reason: e.target.value })} /></label><button className="primary">Confirmar transferência</button></form></SidePanel>}

    {panel === 'diet' && selected && <SidePanel title="Prescrição de dieta" onClose={() => setPanel(null)}><form className="form" onSubmit={saveDiet}><label>Dieta vigente<input value={dietForm.diet} onChange={(e) => setDietForm({ ...dietForm, diet: e.target.value })} placeholder="Ex.: Branda / Hipossódica" required /></label><label>Restrições e alergias<textarea value={dietForm.restrictions} onChange={(e) => setDietForm({ ...dietForm, restrictions: e.target.value })} placeholder="Ex.: sem lactose, sem glúten" /></label><label>Solicitante<input value={dietForm.requester} onChange={(e) => setDietForm({ ...dietForm, requester: e.target.value })} placeholder="Ex.: Nutri. Carla" required /></label><label>Observações<textarea value={dietForm.notes} onChange={(e) => setDietForm({ ...dietForm, notes: e.target.value })} /></label><button className="primary">Salvar prescrição</button></form></SidePanel>}

    <div className="print-queue">{db.releases.filter((release) => release.status === 'Pendente').map((release) => { const patient = db.patients.find((item) => item.id === release.patientId); const location = [patient?.ward ?? '', patient?.wing ?? '', patient?.bed ?? ''].filter(Boolean).join(' · '); const dateText = new Date(release.createdAt).toLocaleDateString('pt-BR'); return <div className="release-label" key={release.id}><div className="label-top"><strong>{release.meal}</strong></div><div className="label-patient">{patient?.name ?? 'Paciente'}</div><div className="label-line"><span>Leito:</span><b>{location || 'Não informada'}</b></div><div className="label-line"><span>Data/Hora:</span><b>{dateText} · {release.exitTime}</b></div><div className="label-line"><span>Dieta:</span><b>{patient?.diet || 'Não informada'}</b></div><div className="label-line"><span>Restrição:</span><b>{patient?.restrictions || 'Sem restrições'}</b></div><div className="label-line"><span>Obs.:</span><b>{release.notes || 'Sem observações'}</b></div></div> })}</div>
  </main>
}

export default function App() {
  const { session, loading, profile, role, isProfileActive } = useAuth()
  const passwordResetRequested = hasPasswordRecoveryToken()
  const stage = resolveAuthGate({ loading, session, profile, isProfileActive, role, passwordResetRequested })

  if (import.meta.env.PROD && !supabase) {
    return <main className="auth"><section><div className="auth-brand">LBGS<small>MESA DE LIBERAÇÃO · HGRS</small></div><h1>Configuração incompleta</h1><p>O serviço de autenticação não está configurado neste ambiente. Solicite ao administrador que valide as variáveis do Supabase antes de liberar o acesso.</p><div className="auth-error">A aplicação não iniciou o modo local em produção para proteger os dados operacionais.</div></section></main>
  }

  if (stage === 'loading') return <main className="auth"><section>Validando sessão…</section></main>
  if (stage === 'reset') return <AuthScreen resetMode />
  if (stage === 'login') return <AuthScreen />
  if (stage === 'missingProfile') return <AuthScreen missingProfile />
  return <Central profile={profile} />
}
