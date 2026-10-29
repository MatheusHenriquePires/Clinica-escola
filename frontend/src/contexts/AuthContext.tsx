// Donos: Andrey / Pedro (front)
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, tokenStore } from '../services/api'

export type Perfil = 'ADMIN' | 'RECEPCAO' | 'PROFISSIONAL' | 'ESTUDANTE'
export interface Usuario {
  id: string
  nome: string
  email: string
  perfil: Perfil
}

interface AuthContextValue {
  usuario: Usuario | null
  carregando: boolean
  login: (email: string, senha: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [carregando, setCarregando] = useState(!!tokenStore.get())

  const logout = useCallback(() => {
    tokenStore.clear()
    setUsuario(null)
  }, [])

  // Restaura a sessão se já houver token.
  useEffect(() => {
    if (!tokenStore.get()) return
    api<Usuario>('/auth/me')
      .then(setUsuario)
      .catch(logout)
      .finally(() => setCarregando(false))
  }, [logout])

  useEffect(() => {
    window.addEventListener('clinica:sessao-expirada', logout)
    return () => window.removeEventListener('clinica:sessao-expirada', logout)
  }, [logout])

  const login = async (email: string, senha: string) => {
    const res = await api<{ token: string; usuario: Usuario }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, senha }),
    })
    tokenStore.set(res.token)
    setUsuario(res.usuario)
  }

  return <AuthContext.Provider value={{ usuario, carregando, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
