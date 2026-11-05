// Donos: Andrey / Pedro (front)
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth, type Perfil } from '../contexts/AuthContext'
import { tokenStore } from '../services/api'
import { Layout } from './Layout'

/**
 * Exige login com token ainda válido e, opcionalmente, um dos perfis informados.
 * Sem sessão: vai para /login guardando a rota de origem para voltar depois.
 */
export function ProtectedRoute({ perfis, children }: { perfis?: Perfil[]; children: ReactNode }) {
  const { usuario, carregando } = useAuth()
  const local = useLocation()

  if (carregando) return <p style={{ padding: 24 }}>Carregando...</p>
  if (!usuario || !tokenStore.valido()) return <Navigate to="/login" replace state={{ de: local.pathname }} />
  if (perfis && !perfis.includes(usuario.perfil)) {
    return (
      <Layout>
        <p role="alert" style={{ padding: '2rem 0' }}>
          Você não tem permissão para acessar esta página.
        </p>
      </Layout>
    )
  }
  return <>{children}</>
}
