// Donos: Andrey / Pedro (front)
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, EVENTO_SESSAO_EXPIRADA, ultimaAtividadeEm } from '../services/api'

export type Perfil = 'ADMIN' | 'RECEPCAO' | 'PROFISSIONAL' | 'ESTUDANTE'
export interface Usuario {
  id: string
  nome: string
  email: string
  perfil: Perfil
}

interface Sessao {
  usuario: Usuario
  /** Timestamp (ms) em que o cookie/token expira. */
  expiraEm: number | null
}

interface AuthContextValue {
  usuario: Usuario | null
  carregando: boolean
  /** true quando a sessão acabou por expiração (para avisar na tela de login). */
  sessaoExpirada: boolean
  login: (email: string, senha: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Quanto antes de expirar tentamos renovar a sessão. */
const ANTECEDENCIA_REFRESH = 5 * 60 * 1000
/** Só renova se o usuário fez alguma requisição neste intervalo; parado, a sessão expira normalmente. */
const JANELA_ATIVIDADE = 30 * 60 * 1000
const MAX_TIMEOUT = 2 ** 31 - 1

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Sessao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [sessaoExpirada, setSessaoExpirada] = useState(false)
  const logado = useRef(false)
  useEffect(() => {
    logado.current = !!sessao
  }, [sessao])

  const logout = useCallback(async () => {
    setSessao(null)
    setSessaoExpirada(false)
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
  }, [])

  const expirar = useCallback(() => {
    // Só avisa "sessão expirada" se havia alguém logado.
    if (logado.current) setSessaoExpirada(true)
    setSessao(null)
    void api('/auth/logout', { method: 'POST' }).catch(() => undefined)
  }, [])

  // Restaura a sessão a partir do cookie (se houver um válido).
  useEffect(() => {
    api<Usuario & { expiraEm: number | null }>('/auth/me')
      .then(({ expiraEm, ...usuario }) => setSessao({ usuario, expiraEm }))
      .catch(() => setSessao(null))
      .finally(() => setCarregando(false))
  }, [])

  // 401 vindo da API: token expirado/revogado.
  useEffect(() => {
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, expirar)
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, expirar)
  }, [expirar])

  // Pouco antes de vencer: renova se o usuário está em uso; senão derruba no instante em que vence.
  const expiraEm = sessao?.expiraEm ?? null
  useEffect(() => {
    if (expiraEm === null) return
    let timer: ReturnType<typeof setTimeout>
    const agendar = (quando: number, fn: () => void) => {
      timer = setTimeout(fn, Math.min(Math.max(quando - Date.now(), 0), MAX_TIMEOUT))
    }
    agendar(expiraEm - ANTECEDENCIA_REFRESH, () => {
      if (Date.now() - ultimaAtividadeEm() > JANELA_ATIVIDADE) {
        agendar(expiraEm, expirar)
        return
      }
      api<Sessao>('/auth/refresh', { method: 'POST' })
        .then(setSessao)
        .catch(() => agendar(expiraEm, expirar))
    })
    return () => clearTimeout(timer)
  }, [expiraEm, expirar])

  const login = async (email: string, senha: string) => {
    const res = await api<Sessao>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, senha }),
    })
    setSessaoExpirada(false)
    setSessao(res)
  }

  return (
    <AuthContext.Provider value={{ usuario: sessao?.usuario ?? null, carregando, sessaoExpirada, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
