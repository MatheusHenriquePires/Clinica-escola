// Donos: Andrey / Pedro (front)
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function Home() {
  const { usuario, logout } = useAuth()
  return (
    <main style={{ padding: 24 }}>
      <h1>Olá, {usuario?.nome}</h1>
      <p>Perfil: {usuario?.perfil}</p>
      <nav style={{ display: 'flex', gap: 12 }}>
        <Link to="/pacientes">Pacientes</Link>
        <Link to="/especialidades">Especialidades</Link>
        <Link to="/atendimentos">Atendimentos</Link>
        <button onClick={logout}>Sair</button>
      </nav>
    </main>
  )
}
