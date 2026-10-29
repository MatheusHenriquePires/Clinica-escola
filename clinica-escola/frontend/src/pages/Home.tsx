// Donos: Andrey / Pedro (front)
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { useAuth, type Perfil } from '../contexts/AuthContext'
import './Home.css'

const icone = {
  width: 26,
  height: 26,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const IconePacientes = () => (
  <svg {...icone}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.5A6.5 6.5 0 0 1 21.5 20" />
  </svg>
)
const IconeEspecialidades = () => (
  <svg {...icone}>
    <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
  </svg>
)
const IconeAtendimentos = () => (
  <svg {...icone}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4M8 3v4M3 11h18M12 14v4M10 16h4" />
  </svg>
)
const IconeAlunos = () => (
  <svg {...icone}>
    <path d="m2 9 10-5 10 5-10 5z" />
    <path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5M22 9v6" />
  </svg>
)

const modulos: { to: string; titulo: string; descricao: string; Icone: () => JSX.Element; perfis?: Perfil[] }[] = [
  {
    to: '/pacientes',
    titulo: 'Pacientes',
    descricao: 'Cadastro, consulta e inativação de pacientes da clínica.',
    Icone: IconePacientes,
  },
  {
    to: '/especialidades',
    titulo: 'Especialidades',
    descricao: 'Áreas de atuação disponíveis para atendimento.',
    Icone: IconeEspecialidades,
  },
  {
    to: '/atendimentos',
    titulo: 'Atendimentos',
    descricao: 'Agendamento e acompanhamento dos atendimentos.',
    Icone: IconeAtendimentos,
  },
  {
    to: '/alunos',
    titulo: 'Alunos',
    descricao: 'Cadastro e acesso dos estudantes que atuam na clínica.',
    Icone: IconeAlunos,
    perfis: ['ADMIN'],
  },
]

export function Home() {
  const { usuario } = useAuth()
  const nome = usuario?.nome ?? ''
  const visiveis = modulos.filter((m) => !m.perfis || (usuario && m.perfis.includes(usuario.perfil)))

  return (
    <Layout>
      <section className="home__boasvindas">
        <h1>
          Olá, <span>{nome}</span>
        </h1>
        <p>O que você deseja fazer hoje?</p>
      </section>

      <h2 className="home__titulo-secao">Menu principal</h2>
      <nav className="home__grade" aria-label="Menu principal">
        {visiveis.map(({ to, titulo, descricao, Icone }) => (
          <Link key={to} to={to} className="home__card">
            <span className="home__card-icone">
              <Icone />
            </span>
            <h3>{titulo}</h3>
            <p>{descricao}</p>
            <span className="home__card-acao">Acessar →</span>
          </Link>
        ))}
      </nav>
    </Layout>
  )
}
