// Donos: Andrey / Pedro (front)
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, EVENTO_SESSAO_EXPIRADA, tokenStore } from '../services/api'

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
  /** true quando a sessão acabou por expiração (para avisar na tela de login). */
  sessaoExpirada: boolean
  login: (email: string, senha: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [carregando, setCarregando] = useState(!!tokenStore.get())
  const [sessaoExpirada, setSessaoExpirada] = useState(false)

  const logout = useCallback(() => {
    tokenStore.clear()
    setUsuario(null)
    setSessaoExpirada(false)
  }, [])

  const expirar = useCallback(() => {
    tokenStore.clear()
    setUsuario(null)
    setSessaoExpirada(true)
  }, [])

  // Restaura a sessão se já houver token.
  useEffect(() => {
    if (!tokenStore.get()) return
    if (!tokenStore.valido()) {
      expirar()
      setCarregando(false)
      return
    }
    api<Usuario>('/auth/me')
      .then(setUsuario)
      .catch(() => tokenStore.clear()) // 401 já dispara o evento de expiração na camada HTTP
      .finally(() => setCarregando(false))
  }, [expirar])

  // 401 vindo da API: token expirado/revogado.
  useEffect(() => {
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, expirar)
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, expirar)
  }, [expirar])

  // Derruba a sessão no instante em que o token vence, sem esperar a próxima requisição.
  useEffect(() => {
    if (!usuario) return
    const exp = tokenStore.expiraEm()
    if (exp === null) return
    const t = setTimeout(expirar, Math.min(Math.max(exp - Date.now(), 0), 2 ** 31 - 1))
    return () => clearTimeout(t)
  }, [usuario, expirar])

  const login = async (email: string, senha: string) => {
    const res = await api<{ token: string; usuario: Usuario }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, senha }),
    })
    tokenStore.set(res.token)
    setSessaoExpirada(false)
    setUsuario(res.usuario)
  }

  return (
    <AuthContext.Provider value={{ usuario, carregando, sessaoExpirada, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
