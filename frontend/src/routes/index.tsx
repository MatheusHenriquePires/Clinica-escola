// Donos: Andrey / Pedro (front)
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { Alunos } from '../pages/Alunos'
import { Atendimentos } from '../pages/Atendimentos'
import { Especialidades } from '../pages/Especialidades'
import { Home } from '../pages/Home'
import { Login } from '../pages/Login'
import { Pacientes } from '../pages/Pacientes'
import { Profissionais } from '../pages/Profissionais'
import { Horarios } from '../pages/Horarios'
import { MeuPerfil } from '../pages/MeuPerfil'
import { Usuarios } from '../pages/Usuarios'
import { Agenda } from '../pages/Agenda'
import { Auditoria } from '../pages/Auditoria'
import { PacienteHistorico } from '../pages/PacienteHistorico'
import { Relatorios } from '../pages/Relatorios'
import { PERMISSOES } from './permissoes'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/pacientes/:id"
        element={
          <ProtectedRoute perfis={PERMISSOES.pacientes.acessar}>
            <PacienteHistorico />
          </ProtectedRoute>
        }
      />
      <Route
        path="/agenda"
        element={
          <ProtectedRoute perfis={PERMISSOES.agenda.acessar}>
            <Agenda />
          </ProtectedRoute>
        }
      />
      <Route
        path="/relatorios"
        element={
          <ProtectedRoute perfis={PERMISSOES.relatorios.acessar}>
            <Relatorios />
          </ProtectedRoute>
        }
      />
      <Route
        path="/auditoria"
        element={
          <ProtectedRoute perfis={PERMISSOES.auditoria.acessar}>
            <Auditoria />
          </ProtectedRoute>
        }
      />
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
        path="/profissionais"
        element={
          <ProtectedRoute perfis={PERMISSOES.profissionais.acessar}>
            <Profissionais />
          </ProtectedRoute>
        }
      />
      <Route
        path="/horarios"
        element={
          <ProtectedRoute perfis={PERMISSOES.horarios.acessar}>
            <Horarios />
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
      <Route
        path="/usuarios"
        element={
          <ProtectedRoute perfis={PERMISSOES.usuarios.acessar}>
            <Usuarios />
          </ProtectedRoute>
        }
      />
      <Route
        path="/meu-perfil"
        element={
          <ProtectedRoute>
            <MeuPerfil />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
