// Donos: Andrey / Pedro (front)
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import logo from '../assets/uninassau-logo.png'
import './Login.css'

const icone = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const IconeEmail = () => (
  <svg {...icone} width={18} height={18}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
)
const IconeCadeado = () => (
  <svg {...icone} width={18} height={18}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
)
const IconeCalendario = () => (
  <svg {...icone}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4M8 3v4M3 11h18" />
  </svg>
)
const IconePacientes = () => (
  <svg {...icone}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.5A6.5 6.5 0 0 1 21.5 20" />
  </svg>
)
const IconePulso = () => (
  <svg {...icone}>
    <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
  </svg>
)

export function Login() {
  const { usuario, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (usuario) return <Navigate to="/" replace />

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await login(email, senha)
      navigate('/')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro inesperado.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="login">
      <section className="login__painel">
        <img className="login__logo" src={logo} alt="Uninassau" />

        <form className="login__form" onSubmit={enviar}>
          <div className="login__titulo">
            <h1>Clínica Escola</h1>
            <p className="login__sub">Acesse o sistema com suas credenciais.</p>
          </div>

          <label className="login__campo">
            Email
            <span className="login__entrada">
              <IconeEmail />
              <input
                type="email"
                autoComplete="username"
                placeholder="nome@clinica.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </span>
          </label>

          <label className="login__campo">
            Senha
            <span className="login__entrada">
              <IconeCadeado />
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Sua senha"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </span>
          </label>

          {erro && (
            <p role="alert" className="login__erro">
              {erro}
            </p>
          )}

          <button className="login__botao" type="submit" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>

          <p className="login__ajuda">Problemas para acessar? Procure a recepção ou o administrador.</p>
        </form>
      </section>

      <aside className="login__hero">
        <h2>
          Cuidado e <span>aprendizado</span>, lado a lado.
        </h2>
        <p>Gerencie pacientes, especialidades e atendimentos da clínica escola em um só lugar.</p>
        <ul className="login__lista">
          <li>
            <IconePacientes /> Cadastro e histórico de pacientes
          </li>
          <li>
            <IconeCalendario /> Agendamento de atendimentos
          </li>
          <li>
            <IconePulso /> Acompanhamento por especialidade
          </li>
        </ul>
      </aside>
    </main>
  )
}
