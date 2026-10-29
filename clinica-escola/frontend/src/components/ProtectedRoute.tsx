// Donos: Andrey / Pedro (front)
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth, type Perfil } from '../contexts/AuthContext'

/** Exige login e, opcionalmente, um dos perfis informados. */
export function ProtectedRoute({ perfis, children }: { perfis?: Perfil[]; children: ReactNode }) {
  const { usuario, carregando } = useAuth()
  if (carregando) return <p>Carregando...</p>
  if (!usuario) return <Navigate to="/login" replace />
  if (perfis && !perfis.includes(usuario.perfil)) return <p>Sem permissão para acessar esta página.</p>
  return <>{children}</>
}
