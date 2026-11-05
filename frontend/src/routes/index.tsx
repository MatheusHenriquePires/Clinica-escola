// Donos: Andrey / Pedro (front)
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { Alunos } from '../pages/Alunos'
import { Atendimentos } from '../pages/Atendimentos'
import { Especialidades } from '../pages/Especialidades'
import { Home } from '../pages/Home'
import { Login } from '../pages/Login'
import { Pacientes } from '../pages/Pacientes'
import { PERMISSOES } from './permissoes'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
      <Route
        path="/alunos"
        element={
          <ProtectedRoute perfis={PERMISSOES.alunos.acessar}>
            <Alunos />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pacientes"
        element={
          <ProtectedRoute perfis={PERMISSOES.pacientes.acessar}>
            <Pacientes />
          </ProtectedRoute>
        }
      />
      <Route
        path="/especialidades"
        element={
          <ProtectedRoute perfis={PERMISSOES.especialidades.acessar}>
            <Especialidades />
          </ProtectedRoute>
        }
      />
      <Route
        path="/atendimentos"
        element={
          <ProtectedRoute perfis={PERMISSOES.atendimentos.acessar}>
            <Atendimentos />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
