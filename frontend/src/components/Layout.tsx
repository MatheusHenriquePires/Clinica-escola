// Donos: Andrey / Pedro (front)
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, type Perfil } from '../contexts/AuthContext'
import logo from '../assets/uninassau-logo.png'
import '../pages/Home.css'

const perfis: Record<Perfil, string> = {
  ADMIN: 'Administrador',
  RECEPCAO: 'Recepção',
  PROFISSIONAL: 'Profissional',
  ESTUDANTE: 'Estudante',
}

const IconeSair = () => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
)

/** Barra superior + área de conteúdo compartilhadas pelas telas autenticadas. */
export function Layout({ children }: { children: ReactNode }) {
  const { usuario, logout } = useAuth()
  const nome = usuario?.nome ?? ''

  return (
    <div className="home">
      <header className="home__topo">
        <Link to="/" className="home__marca" aria-label="Voltar ao menu principal">
          <img className="home__logo" src={logo} alt="Uninassau" />
          <span className="home__marca-nome">
            Clínica Escola
            <small>Portal de atendimento</small>
          </span>
        </Link>

        <div className="home__usuario">
          <div className="home__dados">
            <strong>{nome}</strong>
            <span>{usuario ? perfis[usuario.perfil] : ''}</span>
          </div>
          <span className="home__avatar" aria-hidden="true">
            {nome.charAt(0).toUpperCase()}
          </span>
          <button className="home__sair" onClick={logout}>
            <IconeSair /> Sair
          </button>
        </div>
      </header>

      <main className="home__conteudo">{children}</main>
    </div>
  )
}
