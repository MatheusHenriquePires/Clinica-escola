// Donos: Andrey / Pedro (front)
// Agenda semanal em grade: horários de atendimento do profissional, consultas marcadas e vagas livres.
// Clicar numa vaga livre abre o agendamento já preenchido.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../services/api'
import '../styles/cadastro.css'
import './Agenda.css'

type Status = 'AGENDADO' | 'REALIZADO' | 'CANCELADO' | 'FALTOU'

interface Consulta {
  id: string
  dataHora: string
  status: Status
  paciente: { nome: string }
  especialidade: { nome: string }
  responsavel: { id: string }
}
interface Faixa {
  diaSemana: number
  inicio: string
  fim: string
}
interface Opcao {
  id: string
  nome: string
}

const SLOT_MIN = 30 // mesma duração padrão da consulta no back
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const STATUS_ROTULO: Record<Status, string> = {
  AGENDADO: 'Agendado',
  REALIZADO: 'Realizado',
  CANCELADO: 'Cancelado',
  FALTOU: 'Faltou',
}

const paraMin = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const paraHHMM = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

const inicioDaSemana = (ref: Date) => {
  const d = new Date(ref)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // segunda-feira
  return d
}
const somarDias = (d: Date, n: number) => {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function Agenda() {
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const escolhe = usuario?.perfil === 'ADMIN' || usuario?.perfil === 'RECEPCAO'

  const [profissionais, setProfissionais] = useState<Opcao[]>([])
  const [escolhido, setEscolhido] = useState('')
  const alvo = escolhe ? escolhido : (usuario?.id ?? '')

  const [semana, setSemana] = useState(() => inicioDaSemana(new Date()))
  const [faixas, setFaixas] = useState<Faixa[] | null>(null)
  const [consultas, setConsultas] = useState<Consulta[]>([])
  const [erro, setErro] = useState('')
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!escolhe) return
    api<Opcao[]>('/profissionais/opcoes')
      .then((l) => {
        setProfissionais(l)
        setEscolhido((atual) => atual || l[0]?.id || '')
      })
      .catch(() => setProfissionais([]))
  }, [escolhe])

  const carregar = useCallback(async () => {
    if (!alvo) return
    setErro('')
    const qs = new URLSearchParams({
      de: semana.toISOString(),
      ate: somarDias(semana, 7).toISOString(),
      ordem: 'asc',
      limit: '100',
    })
    if (escolhe) qs.set('responsavelId', alvo)
    try {
      const [h, a] = await Promise.all([
        api<Faixa[]>(`/horarios${escolhe ? `?profissionalId=${alvo}` : ''}`),
        api<{ data: Consulta[] }>(`/atendimentos?${qs}`),
      ])
      setFaixas(h)
      // O profissional também recebe os que supervisiona; a grade mostra só a agenda dele.
      setConsultas(a.data.filter((c) => c.responsavel.id === alvo && c.status !== 'CANCELADO'))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar a agenda.')
    }
  }, [alvo, semana, escolhe])

  useEffect(() => {
    void carregar()
  }, [carregar])

  // Linhas: do início mais cedo ao fim mais tarde das faixas (padrão 08:00–18:00).
  const { linhas, dias } = useMemo(() => {
    const f = faixas ?? []
    const ini = f.length ? Math.min(...f.map((x) => paraMin(x.inicio))) : 8 * 60
    const fim = f.length ? Math.max(...f.map((x) => paraMin(x.fim))) : 18 * 60
    const linhas: number[] = []
    for (let m = Math.floor(ini / SLOT_MIN) * SLOT_MIN; m < fim; m += SLOT_MIN) linhas.push(m)
    // Segunda a sábado; domingo só se houver horário cadastrado.
    const usados = new Set(f.map((x) => x.diaSemana))
    const dias = [0, 1, 2, 3, 4, 5, 6].map((i) => somarDias(semana, i)).filter((d) => d.getDay() !== 0 || usados.has(0))
    return { linhas, dias }
  }, [faixas, semana])

  const consultaNo = (dia: Date, min: number) =>
    consultas.filter((c) => {
      const d = new Date(c.dataHora)
      const m = d.getHours() * 60 + d.getMinutes()
      return d.toDateString() === dia.toDateString() && m >= min && m < min + SLOT_MIN
    })

  const atende = (dia: Date, min: number) =>
    (faixas ?? []).some(
      (f) => f.diaSemana === dia.getDay() && paraMin(f.inicio) <= min && min + SLOT_MIN <= paraMin(f.fim),
    )

  const agendar = (dia: Date, min: number) => {
    const d = new Date(dia)
    d.setHours(0, min, 0, 0)
    navigate(`/atendimentos?${new URLSearchParams({ novo: '1', responsavelId: alvo, dataHora: d.toISOString() })}`)
  }

  const livres = linhas.length
    ? dias.reduce(
        (n, dia) =>
          n +
          linhas.filter((m) => {
            const t = new Date(dia)
            t.setHours(0, m, 0, 0)
            return atende(dia, m) && t.getTime() > agora && consultaNo(dia, m).length === 0
          }).length,
        0,
      )
    : 0

  const fimSemana = somarDias(semana, 6)
  const titulo = `${semana.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${fimSemana.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`

  return (
    <Layout>
      <Link to="/" className="cad__voltar">
        ← Menu principal
      </Link>

      <div className="cad__cabecalho">
        <div>
          <h1>Agenda</h1>
          <p>
            {escolhe
              ? 'Vagas e consultas da semana por profissional. Clique numa vaga livre para agendar.'
              : 'Sua semana de atendimentos. Os horários vêm do seu cadastro em Horários.'}
          </p>
        </div>
      </div>

      <section className="cad__painel">
        <div className="ag__barra">
          {escolhe && (
            <label className="cad__filtro ag__prof">
              Profissional
              <select value={escolhido} onChange={(e) => setEscolhido(e.target.value)}>
                {profissionais.length === 0 && <option value="">Nenhum profissional ativo</option>}
                {profissionais.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="ag__nav">
            <button
              className="cad__secundario"
              onClick={() => setSemana(somarDias(semana, -7))}
              aria-label="Semana anterior"
            >
              ←
            </button>
            <button className="cad__secundario" onClick={() => setSemana(inicioDaSemana(new Date()))}>
              Hoje
            </button>
            <button
              className="cad__secundario"
              onClick={() => setSemana(somarDias(semana, 7))}
              aria-label="Próxima semana"
            >
              →
            </button>
            <strong className="ag__titulo">{titulo}</strong>
          </div>
          {faixas && (
            <span className="ag__resumo">
              {consultas.filter((c) => c.status === 'AGENDADO').length} agendada(s) · {livres} vaga(s) livre(s)
            </span>
          )}
        </div>

        <ul className="ag__legenda" aria-label="Legenda">
          <li>
            <span className="ag__cor ag__cor--livre" /> Livre
          </li>
          <li>
            <span className="ag__cor ag__cor--agendado" /> Agendado
          </li>
          <li>
            <span className="ag__cor ag__cor--realizado" /> Realizado
          </li>
          <li>
            <span className="ag__cor ag__cor--faltou" /> Faltou
          </li>
          <li>
            <span className="ag__cor ag__cor--fora" /> Fora do horário
          </li>
        </ul>

        {erro ? (
          <p role="alert" className="cad__erro">
            {erro}
          </p>
        ) : !alvo ? (
          <p className="cad__vazio">Selecione um profissional.</p>
        ) : !faixas ? (
          <p className="cad__vazio">Carregando…</p>
        ) : (
          <>
            {faixas.length === 0 && (
              <p className="cad__dica">
                Este profissional ainda não cadastrou horários de atendimento.{' '}
                {usuario?.perfil !== 'RECEPCAO' && <Link to="/horarios">Cadastrar horários →</Link>}
              </p>
            )}
            <div className="ag__grade-wrap">
              <table className="ag__grade">
                <thead>
                  <tr>
                    <th scope="col" className="ag__hora" />
                    {dias.map((d) => (
                      <th
                        key={d.toISOString()}
                        scope="col"
                        className={d.toDateString() === new Date(agora).toDateString() ? 'ag__hoje' : undefined}
                      >
                        {DIAS[d.getDay()]}
                        <small>{d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((m) => (
                    <tr key={m}>
                      <th scope="row" className="ag__hora">
                        {paraHHMM(m)}
                      </th>
                      {dias.map((dia) => {
                        const doSlot = consultaNo(dia, m)
                        const inicio = new Date(dia)
                        inicio.setHours(0, m, 0, 0)
                        const passado = inicio.getTime() <= agora
                        const dentro = atende(dia, m)
                        if (doSlot.length) {
                          return (
                            <td key={dia.toISOString()}>
                              {doSlot.map((c) => (
                                <div
                                  key={c.id}
                                  className={`ag__consulta ag__consulta--${c.status.toLowerCase()}`}
                                  title={`${new Date(c.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ${c.paciente.nome} · ${c.especialidade.nome} · ${STATUS_ROTULO[c.status]}`}
                                >
                                  <strong>{c.paciente.nome}</strong>
                                  <span>{c.especialidade.nome}</span>
                                </div>
                              ))}
                            </td>
                          )
                        }
                        if (!dentro) return <td key={dia.toISOString()} className="ag__fora" />
                        if (passado) return <td key={dia.toISOString()} className="ag__passado" />
                        return (
                          <td key={dia.toISOString()} className="ag__livre">
                            <button
                              onClick={() => agendar(dia, m)}
                              aria-label={`Agendar ${DIAS[dia.getDay()]} ${dia.toLocaleDateString('pt-BR')} às ${paraHHMM(m)}`}
                            >
                              + {paraHHMM(m)}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </Layout>
  )
}
