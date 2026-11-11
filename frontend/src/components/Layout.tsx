// Donos: Andrey / Pedro (front)
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, type Perfil } from '../contexts/AuthContext'
import { MenuLateral } from './MenuLateral'
import '../pages/Home.css'
import './MenuLateral.css'

const perfis: Record<Perfil, string> = {
  ADMIN: 'Administrador',
  RECEPCAO: 'Recepção',
  PROFISSIONAL: 'Profissional',
  ESTUDANTE: 'Estudante',
}

const CHAVE_MENU = 'clinica.menu'
const telaLarga = () => window.matchMedia('(min-width: 861px)').matches

/** Estado inicial: última escolha do usuário; sem escolha, expandido só em tela larga. */
const menuInicial = () => {
  if (!telaLarga()) return false
  try {
    return localStorage.getItem(CHAVE_MENU) !== 'fechado'
  } catch {
    return true
  }
}

/** Menu lateral + barra superior + área de conteúdo compartilhadas pelas telas autenticadas. */
export function Layout({ children }: { children: ReactNode }) {
  const { usuario } = useAuth()
  const nome = usuario?.nome ?? ''
  const [menuAberto, setMenuAberto] = useState(menuInicial)

  const definirMenu = (aberto: boolean) => {
    setMenuAberto(aberto)
    // No celular o menu expandido é temporário: não guarda a escolha.
    if (!telaLarga()) return
    try {
      localStorage.setItem(CHAVE_MENU, aberto ? 'aberto' : 'fechado')
    } catch {
      /* ignora */
    }
  }

  return (
    <div className={menuAberto ? 'home home--menu' : 'home'}>
      <MenuLateral aberto={menuAberto} onAlternar={() => definirMenu(!menuAberto)} />
      <div className="menu__fundo" onClick={() => definirMenu(false)} aria-hidden />

      <div className="home__principal">
        <header className="home__topo">
          <Link to="/meu-perfil" className="home__usuario" title="Meu perfil">
            <div className="home__dados">
              <strong>{nome}</strong>
              <span>{usuario ? perfis[usuario.perfil] : ''}</span>
            </div>
            <span className="home__avatar" aria-hidden="true">
              {nome.charAt(0).toUpperCase()}
            </span>
          </Link>
        </header>

        <main className="home__conteudo">{children}</main>
      </div>
    </div>
  )
}
