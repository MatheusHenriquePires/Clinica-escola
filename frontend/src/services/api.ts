// Donos: Andrey / Pedro (front)
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333'

export const EVENTO_SESSAO_EXPIRADA = 'clinica:sessao-expirada'

/**
 * O token de sessão fica num cookie httpOnly gravado pela API: o JavaScript da página não o lê
 * (um XSS não consegue roubá-lo). Aqui guardamos só quando a sessão expira, para a UX.
 */
let ultimaAtividade = Date.now()
/** Momento (ms) da última requisição feita pelo usuário; usado para decidir se renova a sessão. */
export const ultimaAtividadeEm = () => ultimaAtividade

// Rotas cujo 401 não significa "sessão expirada": o erro segue para a tela que chamou.
const SEM_EVENTO_401 = ['/auth/login', '/auth/me', '/auth/refresh', '/auth/logout']

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
 * Cliente HTTP único: envia o cookie de sessão e trata o 401 (sessão expirada) de forma centralizada.
 * O 403 chega como ApiError com a mensagem do back e é exibido pela tela que fez a chamada.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith('/auth/refresh')) ultimaAtividade = Date.now()
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        // Só declara JSON quando há corpo (o Fastify rejeita JSON vazio com 400).
        ...(init.body != null && { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
    })
  } catch {
    throw new ApiError(0, 'Não foi possível conectar ao servidor. Verifique sua conexão.', [], 'SEM_CONEXAO')
  }
  const body = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && !SEM_EVENTO_401.includes(path)) {
      window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA))
    }
    throw new ApiError(res.status, body?.message ?? 'Erro inesperado.', body?.detalhes ?? [], body?.error ?? '')
  }
  return body as T
}
