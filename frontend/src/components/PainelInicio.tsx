// Donos: Andrey / Pedro (front)
// Painel do Início: indicadores do dia/semana e próximas consultas, de acordo com o perfil.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Perfil } from '../contexts/AuthContext'
import { api } from '../services/api'
import './PainelInicio.css'

interface Consulta {
  id: string
  dataHora: string
  paciente: { id: string; nome: string }
  especialidade: { nome: string }
  responsavel: { nome: string }
}

interface Painel {
  indicadores: {
    consultasHoje: number
    realizadasHoje: number
    proximos7dias: number
    faltas7dias: number
    cancelados7dias: number
    pendentes: number
    pacientesAtivos: number | null
  }
  proximas: Consulta[]
}

interface Indicador {
  valor: number
  rotulo: string
  link?: string
  alerta?: boolean
}

const quando = (iso: string) => {
  const d = new Date(iso)
  const hoje = new Date()
  const amanha = new Date()
  amanha.setDate(hoje.getDate() + 1)
  const dia =
    d.toDateString() === hoje.toDateString()
      ? 'Hoje'
      : d.toDateString() === amanha.toDateString()
        ? 'Amanhã'
        : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
  return { dia, hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
}

function indicadores(perfil: Perfil, i: Painel['indicadores']): Indicador[] {
  const hoje = { valor: i.consultasHoje, rotulo: 'consultas hoje', link: '/agenda' }
  const semana = { valor: i.proximos7dias, rotulo: 'agendadas nos próximos 7 dias' }
  const faltas = { valor: i.faltas7dias, rotulo: 'faltas nos últimos 7 dias' }
  switch (perfil) {
    case 'ADMIN':
      return [
        hoje,
        semana,
        faltas,
        { valor: i.pendentes, rotulo: 'atendimentos aguardando finalização', link: '/atendimentos', alerta: true },
        { valor: i.pacientesAtivos ?? 0, rotulo: 'pacientes ativos', link: '/pacientes' },
      ]
    case 'RECEPCAO':
      return [
        hoje,
        semana,
        faltas,
        { valor: i.pendentes, rotulo: 'consultas passadas ainda como "agendado"', link: '/atendimentos', alerta: true },
        { valor: i.pacientesAtivos ?? 0, rotulo: 'pacientes ativos', link: '/pacientes' },
      ]
    case 'PROFISSIONAL':
      return [
        hoje,
        semana,
        {
          valor: i.pendentes,
          rotulo: 'para finalizar ou validar (estudantes)',
          link: '/atendimentos?pendentesRevisao=true',
          alerta: true,
        },
        faltas,
      ]
    default:
      return [
        { ...hoje, link: '/atendimentos' },
        semana,
        { valor: i.pendentes, rotulo: 'aguardando validação do supervisor', link: '/atendimentos' },
      ]
  }
}

export function PainelInicio({ perfil }: { perfil: Perfil }) {
  const [dados, setDados] = useState<Painel | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    api<Painel>('/painel')
      .then(setDados)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar o painel.'))
  }, [])

  const veTudo = perfil === 'ADMIN' || perfil === 'RECEPCAO'

  return (
    <section className="painel" aria-label="Resumo">
      <div className="painel__numeros">
        {(dados ? indicadores(perfil, dados.indicadores) : []).map((n) => {
          const conteudo = (
            <>
              <strong>{n.valor}</strong>
              <span>{n.rotulo}</span>
            </>
          )
          const classe = `painel__numero${n.alerta && n.valor > 0 ? ' painel__numero--alerta' : ''}`
          return n.link ? (
            <Link key={n.rotulo} to={n.link} className={classe}>
              {conteudo}
            </Link>
          ) : (
            <div key={n.rotulo} className={classe}>
              {conteudo}
            </div>
          )
        })}
        {!dados && !erro && <p className="painel__vazio">Carregando…</p>}
      </div>

      <div className="painel__lista">
        <div className="painel__topo">
          <h2 className="home__titulo-secao">
            {veTudo ? 'Próximas consultas da clínica' : 'Minhas próximas consultas'}
          </h2>
          <div className="painel__links">
            {perfil !== 'ESTUDANTE' && <Link to="/agenda">Ver agenda da semana →</Link>}
            <Link to="/atendimentos">Todos os atendimentos →</Link>
          </div>
        </div>
        {erro ? (
          <p className="painel__vazio">{erro}</p>
        ) : !dados ? (
          <p className="painel__vazio">Carregando…</p>
        ) : dados.proximas.length === 0 ? (
          <p className="painel__vazio">Nenhuma consulta agendada.</p>
        ) : (
          <ul>
            {dados.proximas.map((c) => {
              const { dia, hora } = quando(c.dataHora)
              return (
                <li key={c.id} className="painel__item">
                  <span className={dia === 'Hoje' ? 'painel__quando painel__quando--hoje' : 'painel__quando'}>
                    <small>{dia}</small>
                    {hora}
                  </span>
                  <span className="painel__detalhe">
                    <Link to={`/pacientes/${c.paciente.id}`}>{c.paciente.nome}</Link>
                    <span>
                      {c.especialidade.nome}
                      {veTudo && ` · ${c.responsavel.nome}`}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
