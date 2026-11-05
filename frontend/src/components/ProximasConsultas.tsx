import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import './ProximasConsultas.css'

interface Consulta {
  id: string
  dataHora: string
  paciente: { nome: string }
  especialidade: { nome: string }
}
interface Lista {
  data: Consulta[]
  meta: { total: number }
}

const fimDoDia = (d: Date) => {
  const r = new Date(d)
  r.setHours(23, 59, 59, 999)
  return r
}
const fimDaSemana = (d: Date) => {
  const r = fimDoDia(d)
  r.setDate(r.getDate() + ((7 - r.getDay()) % 7)) // até domingo
  return r
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

/** Painel do Início: próximas consultas agendadas do usuário logado (a API já filtra pelo responsável). */
export function ProximasConsultas({ mostrarHorarios }: { mostrarHorarios: boolean }) {
  const [proximas, setProximas] = useState<Consulta[] | null>(null)
  const [hoje, setHoje] = useState(0)
  const [semana, setSemana] = useState(0)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const agora = new Date()
    const consulta = (ate: Date | null, limit: number) => {
      const qs = new URLSearchParams({ status: 'AGENDADO', de: agora.toISOString(), ordem: 'asc', limit: String(limit) })
      if (ate) qs.set('ate', ate.toISOString())
      return api<Lista>(`/atendimentos?${qs}`)
    }
    Promise.all([consulta(null, 5), consulta(fimDoDia(agora), 1), consulta(fimDaSemana(agora), 1)])
      .then(([prox, h, s]) => {
        setProximas(prox.data)
        setHoje(h.meta.total)
        setSemana(s.meta.total)
      })
      .catch((err) => setErro(err instanceof Error ? err.message : 'Não foi possível carregar sua agenda.'))
  }, [])

  return (
    <section className="agenda" aria-labelledby="agenda-titulo">
      <div className="agenda__topo">
        <h2 id="agenda-titulo" className="home__titulo-secao">
          Minhas próximas consultas
        </h2>
        <div className="agenda__links">
          {mostrarHorarios && <Link to="/horarios">Ver agenda da semana →</Link>}
          <Link to="/atendimentos">Todos os atendimentos →</Link>
        </div>
      </div>

      <div className="agenda__corpo">
        <div className="agenda__numeros">
          <div className="agenda__numero">
            <strong>{proximas ? hoje : '–'}</strong>
            <span>hoje</span>
          </div>
          <div className="agenda__numero">
            <strong>{proximas ? semana : '–'}</strong>
            <span>nesta semana</span>
          </div>
        </div>

        <div className="agenda__lista">
          {erro ? (
            <p className="agenda__vazio">{erro}</p>
          ) : !proximas ? (
            <p className="agenda__vazio">Carregando…</p>
          ) : proximas.length === 0 ? (
            <p className="agenda__vazio">Nenhuma consulta agendada.</p>
          ) : (
            <ul>
              {proximas.map((c) => {
                const { dia, hora } = quando(c.dataHora)
                return (
                  <li key={c.id} className="agenda__item">
                    <span className={dia === 'Hoje' ? 'agenda__quando agenda__quando--hoje' : 'agenda__quando'}>
                      <small>{dia}</small>
                      {hora}
                    </span>
                    <span className="agenda__detalhe">
                      <strong>{c.paciente.nome}</strong>
                      <span>{c.especialidade.nome}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
