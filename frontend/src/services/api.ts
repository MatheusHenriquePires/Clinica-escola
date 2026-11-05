// Donos: Andrey / Pedro (front)
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333'
const TOKEN_KEY = 'clinica.token'

export const EVENTO_SESSAO_EXPIRADA = 'clinica:sessao-expirada'

/** Lê o `exp` (segundos) do payload do JWT. Só para UX: quem valida o token de verdade é o back. */
const expiracaoDoToken = (token: string): number | null => {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const { exp } = JSON.parse(atob(payload)) as { exp?: number }
    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}

// Token em sessionStorage: some ao fechar a aba. TODO: avaliar cookie httpOnly.
export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t: string) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
  /** Timestamp (ms) em que o token expira, ou null se não há token/for ilegível. */
  expiraEm: () => {
    const t = sessionStorage.getItem(TOKEN_KEY)
    return t ? expiracaoDoToken(t) : null
  },
  /** Há token e ele ainda não expirou. */
  valido: () => {
    const exp = tokenStore.expiraEm()
    return exp !== null && exp > Date.now()
  },
}

export interface DetalheErro {
  campo: string
  mensagem: string
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detalhes: DetalheErro[] = [],
    /** Código do back (ex.: CREDENCIAIS_INVALIDAS, MUITAS_REQUISICOES, CONFLITO). */
    public codigo = '',
  ) {
    super(message)
  }
}

/**
 * Cliente HTTP único: anexa o token e trata o 401 (sessão expirada) de forma centralizada.
 * O 403 chega como ApiError com a mensagem do back e é exibido pela tela que fez a chamada.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get()
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        // Só declara JSON quando há corpo (o Fastify rejeita JSON vazio com 400).
        ...(init.body != null && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...init.headers,
      },
    })
  } catch {
    throw new ApiError(0, 'Não foi possível conectar ao servidor. Verifique sua conexão.', [], 'SEM_CONEXAO')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    // 401 com token = sessão expirada/inválida. Sem token (ex.: login errado) o erro segue para a tela.
    if (res.status === 401 && token) {
      tokenStore.clear()
      window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA))
    }
    throw new ApiError(res.status, body?.message ?? 'Erro inesperado.', body?.detalhes ?? [], body?.error ?? '')
  }
  return body as T
}
