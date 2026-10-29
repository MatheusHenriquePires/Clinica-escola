// Donos: Andrey / Pedro (front)
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333'
const TOKEN_KEY = 'clinica.token'

// Token em sessionStorage: some ao fechar a aba. TODO: avaliar cookie httpOnly.
export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t: string) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
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
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get()
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      // Só declara JSON quando há corpo (o Fastify rejeita JSON vazio com 400).
      ...(init.body != null && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...init.headers,
    },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && token) {
      tokenStore.clear() // sessão expirada
      window.dispatchEvent(new Event('clinica:sessao-expirada'))
    }
    throw new ApiError(res.status, body?.message ?? 'Erro inesperado.', body?.detalhes ?? [])
  }
  return body as T
}
