import { Link, NavLink } from 'react-router-dom'
import logo from '../assets/uninassau-logo.png'
import { useAuth } from '../contexts/AuthContext'
import { PERMISSOES } from '../routes/permissoes'

const icone = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const itens = [
  {
    to: '/',
    rotulo: 'Início',
    modulo: null,
    icone: <path d="M3 11l9-8 9 8M5 10v10h14V10" />,
  },
  {
    to: '/pacientes',
    rotulo: 'Pacientes',
    modulo: 'pacientes',
    icone: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.5A6.5 6.5 0 0 1 21.5 20" />
      </>
    ),
  },
  {
    to: '/especialidades',
    rotulo: 'Especialidades',
    modulo: 'especialidades',
    icone: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
  },
  {
    to: '/profissionais',
    rotulo: 'Profissionais',
    modulo: 'profissionais',
    icone: (
      <>
        <circle cx="12" cy="7.5" r="3.5" />
        <path d="M5 21a7 7 0 0 1 14 0M12 14v4M10 16h4" />
      </>
    ),
  },
  {
    to: '/atendimentos',
    rotulo: 'Atendimentos',
    modulo: 'atendimentos',
    icone: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 11h18M12 14v4M10 16h4" />
      </>
    ),
  },
  {
    to: '/agenda',
    rotulo: 'Agenda',
    modulo: 'agenda',
    icone: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2M8 18h2" />
      </>
    ),
  },
  {
    to: '/horarios',
    rotulo: 'Horários',
    modulo: 'horarios',
    icone: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  {
    to: '/alunos',
    rotulo: 'Alunos',
    modulo: 'alunos',
    icone: (
      <>
        <path d="m2 9 10-5 10 5-10 5z" />
        <path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5M22 9v6" />
      </>
    ),
  },
  {
    to: '/usuarios',
    rotulo: 'Usuários',
    modulo: 'usuarios',
    icone: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
        <path d="m17 3 1.5 1.5L21 2" />
      </>
    ),
  },
  {
    to: '/relatorios',
    rotulo: 'Relatórios',
    modulo: 'relatorios',
    icone: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  },
  {
    to: '/auditoria',
    rotulo: 'Auditoria',
    modulo: 'auditoria',
    icone: (
      <>
        <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  },
] as const

type Item = (typeof itens)[number]

/** Navegação lateral: mostra só os módulos que o perfil pode acessar. */
export function MenuLateral({ aberto, onAlternar }: { aberto: boolean; onAlternar: () => void }) {
  const { usuario, logout } = useAuth()
  const perfil = usuario?.perfil

  const visiveis = itens.filter(
    (i) => !i.modulo || (!!perfil && (PERMISSOES[i.modulo].acessar as readonly string[]).includes(perfil)),
  )
  const [inicio, ...modulos] = visiveis

  const link = (i: Item) => (
    <NavLink
      key={i.to}
      to={i.to}
      end={i.to === '/'}
      title={aberto ? undefined : i.rotulo}
      aria-label={aberto ? undefined : i.rotulo}
      className={({ isActive }) => (isActive ? 'menu__link ativo' : 'menu__link')}
    >
      <svg {...icone}>{i.icone}</svg>
      <span className="menu__rotulo">{i.rotulo}</span>
    </NavLink>
  )

  return (
    <nav className={aberto ? 'menu menu--aberto' : 'menu'} aria-label="Menu principal">
      <div className="menu__topo">
        <Link to="/" className="menu__marca" title="Início" aria-label="Início">
          <span className="menu__logo-caixa">
            <img className="menu__logo" src={logo} alt="" />
          </span>
          <span className="menu__nome">
            Clínica Escola
            <small>Portal de atendimento</small>
          </span>
        </Link>
        <button
          type="button"
          className="menu__alternar"
          onClick={onAlternar}
          aria-label={aberto ? 'Recolher menu' : 'Expandir menu'}
          aria-expanded={aberto}
          title={aberto ? 'Recolher menu' : 'Expandir menu'}
        >
          <svg {...icone}>{aberto ? <path d="M5 12h14" /> : <path d="m9 18 6-6-6-6" />}</svg>
        </button>
      </div>

      <div className="menu__lista">{inicio && link(inicio)}</div>
      {modulos.length > 0 && <div className="menu__lista menu__lista--modulos">{modulos.map(link)}</div>}

      <div className="menu__rodape">
        <NavLink
          to="/meu-perfil"
          title={aberto ? undefined : 'Meu perfil'}
          aria-label={aberto ? undefined : 'Meu perfil'}
          className={({ isActive }) => (isActive ? 'menu__link ativo' : 'menu__link')}
        >
          <svg {...icone}>
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="10" r="3" />
            <path d="M6.5 18.5a6 6 0 0 1 11 0" />
          </svg>
          <span className="menu__rotulo">Meu perfil</span>
        </NavLink>
        <button
          type="button"
          className="menu__sair"
          onClick={logout}
          title={aberto ? undefined : 'Sair'}
          aria-label="Sair"
        >
          <svg {...icone}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          <span className="menu__rotulo">Sair</span>
        </button>
      </div>
    </nav>
  )
}
