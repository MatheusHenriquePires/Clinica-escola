// Donos: Andrey / Pedro (front)
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { Atendimentos } from '../pages/Atendimentos'
import { Especialidades } from '../pages/Especialidades'
import { Home } from '../pages/Home'
import { Login } from '../pages/Login'
import { Pacientes } from '../pages/Pacientes'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/pacientes" element={<ProtectedRoute><Pacientes /></ProtectedRoute>} />
      <Route path="/especialidades" element={<ProtectedRoute><Especialidades /></ProtectedRoute>} />
      <Route path="/atendimentos" element={<ProtectedRoute><Atendimentos /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
