import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../services/supabase'

export type AuthProfile = {
  id: string
  full_name: string
  role: string | null
  active: boolean | null
  shift_name: string | null
}

export function useAuth() {
  // O modo E2E só pode existir no servidor Vite de desenvolvimento; nunca
  // permita que uma variável acidental habilite um bypass em produção.
  const e2eMode = import.meta.env.DEV && import.meta.env.VITE_E2E_MODE === 'true'
  const [session, setSession] = useState<Session | null>(() => e2eMode ? ({ user: { id: 'e2e-user' } } as Session) : null)
  const [profile, setProfile] = useState<AuthProfile | null>(() => e2eMode ? ({ id: 'e2e-user', full_name: 'Operador E2E', role: 'operador', active: true, shift_name: 'Manhã' }) : null)
  const [loading, setLoading] = useState(Boolean(supabase) && !e2eMode)

  useEffect(() => {
    if (e2eMode) return
    if (!supabase) {
      setLoading(false)
      return
    }

    const syncProfile = async (userId: string, user?: { email?: string | null; user_metadata?: { full_name?: string | null } | null }) => {
      if (!supabase) {
        setProfile(null)
        return
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, role, active, shift_name')
          .eq('id', userId)
          .maybeSingle()

        if (error) {
          setProfile(null)
          return
        }

        if (data) {
          setProfile(data as AuthProfile)
          return
        }

        const fallbackName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário'
        const { error: insertError } = await supabase.from('profiles').insert({
          id: userId,
          full_name: fallbackName,
          role: 'operador',
          shift_name: 'Manhã',
          active: true,
        })

        if (insertError) {
          setProfile(null)
          return
        }

        const { data: created, error: fetchError } = await supabase
          .from('profiles')
          .select('id, full_name, role, active, shift_name')
          .eq('id', userId)
          .maybeSingle()

        if (fetchError) {
          setProfile(null)
          return
        }

        setProfile((created as AuthProfile | null) ?? null)
      } catch {
        setProfile(null)
      }
    }

    const handleSession = async (next: Session | null) => {
      setSession(next)
      if (!next) {
        setProfile(null)
        setLoading(false)
        return
      }

      await syncProfile(next.user.id, next.user)
      setLoading(false)
    }

    supabase.auth.getSession().then(({ data }) => {
      void handleSession(data.session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      void handleSession(next)
    })

    return () => subscription.unsubscribe()
  }, [e2eMode])

  return {
    session,
    profile,
    loading,
    role: profile?.role ?? null,
    isProfileActive: Boolean(profile?.active),
    fullName: profile?.full_name ?? null,
  }
}
