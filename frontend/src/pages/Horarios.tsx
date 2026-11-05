import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { useAuth } from '../contexts/AuthContext'
import { api, ApiError } from '../services/api'
import './Alunos.css'
import './Horarios.css'

type Status = 'AGENDADO' | 'REALIZADO' | 'CANCELADO' | 'FALTOU'

interface Consulta {
  id: string
  dataHora: string
  status: Status
  paciente: { nome: string }
  especialidade: { nome: string }
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

const STATUS_ROTULO: Record<Status, string> = {
  AGENDADO: 'Agendado',
  REALIZADO: 'Realizado',
  CANCELADO: 'Cancelado',
  FALTOU: 'Faltou',
}

// Semana começando na segunda (índices de Date.getDay(): 0 = domingo).
const DIAS = [
  { dia: 1, nome: 'Segunda', curto: 'Seg' },
  { dia: 2, nome: 'Terça', curto: 'Ter' },
  { dia: 3, nome: 'Quarta', curto: 'Qua' },
  { dia: 4, nome: 'Quinta', curto: 'Qui' },
  { dia: 5, nome: 'Sexta', curto: 'Sex' },
  { dia: 6, nome: 'Sábado', curto: 'Sáb' },
  { dia: 0, nome: 'Domingo', curto: 'Dom' },
]

const inicioDaSemana = (ref: Date) => {
  const d = new Date(ref)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}
const somarDias = (d: Date, n: number) => {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const diaMes = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

export function Horarios() {
  const { usuario } = useAuth()
  const ehAdmin = usuario?.perfil === 'ADMIN'

  const [profissionais, setProfissionais] = useState<Opcao[]>([])
  const [profissionalId, setProfissionalId] = useState('')
  // Profissional: sempre ele mesmo. Admin: o escolhido no seletor.
  const alvo = ehAdmin ? profissionalId : (usuario?.id ?? '')

  const [semana, setSemana] = useState(() => inicioDaSemana(new Date()))
  const [consultas, setConsultas] = useState<Consulta[] | null>(null)
  const [erroAgenda, setErroAgenda] = useState('')

  const [faixas, setFaixas] = useState<Faixa[]>([])
  const [salvas, setSalvas] = useState<Faixa[]>([])
  const [erroFaixas, setErroFaixas] = useState('')
  const [aviso, setAviso] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!ehAdmin) return
    api<Opcao[]>('/profissionais/opcoes')
      .then((lista) => {
        setProfissionais(lista)
        setProfissionalId((atual) => atual || lista[0]?.id || '')
      })
      .catch(() => setProfissionais([]))
  }, [ehAdmin])

  const carregarAgenda = useCallback(async () => {
    if (!alvo) return
    setErroAgenda('')
    const qs = new URLSearchParams({
      de: semana.toISOString(),
      ate: somarDias(semana, 7).toISOString(),
      ordem: 'asc',
      limit: '100',
    })
    if (ehAdmin) qs.set('responsavelId', alvo)
    try {
      setConsultas((await api<{ data: Consulta[] }>(`/atendimentos?${qs}`)).data)
    } catch (err) {
      setConsultas(null)
      setErroAgenda(err instanceof Error ? err.message : 'Não foi possível carregar a agenda.')
    }
  }, [alvo, semana, ehAdmin])

  const carregarFaixas = useCallback(async () => {
    if (!alvo) return
    const qs = ehAdmin ? `?profissionalId=${alvo}` : ''
    try {
      const lista = await api<Faixa[]>(`/horarios${qs}`)
      setFaixas(lista)
      setSalvas(lista)
    } catch (err) {
      setErroFaixas(err instanceof Error ? err.message : 'Não foi possível carregar os horários.')
    }
  }, [alvo, ehAdmin])

  useEffect(() => {
    void carregarAgenda()
  }, [carregarAgenda])

  useEffect(() => {
    void carregarFaixas()
  }, [carregarFaixas])

  const alterado = useMemo(() => JSON.stringify(faixas) !== JSON.stringify(salvas), [faixas, salvas])

  const atualizarFaixa = (i: number, campo: 'inicio' | 'fim', valor: string) =>
    setFaixas(faixas.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)))

  const adicionarFaixa = (dia: number) => {
    const doDia = faixas.filter((f) => f.diaSemana === dia)
    const ultima = doDia[doDia.length - 1]
    // Sugere a tarde se já houver a manhã.
    const nova = ultima ? { inicio: '13:00', fim: '17:00' } : { inicio: '08:00', fim: '12:00' }
    setFaixas([...faixas, { diaSemana: dia, ...nova }])
  }

  const salvar = async () => {
    setErroFaixas('')
    for (const f of faixas) {
      if (!f.inicio || !f.fim || f.fim <= f.inicio) {
        setErroFaixas('Confira as faixas: o fim precisa ser depois do início.')
        return
      }
    }
    setSalvando(true)
    try {
      const corpo = { faixas, ...(ehAdmin && { profissionalId: alvo }) }
      const lista = await api<Faixa[]>('/horarios', { method: 'PUT', body: JSON.stringify(corpo) })
      setFaixas(lista)
      setSalvas(lista)
      setAviso('Horários de atendimento salvos.')
    } catch (err) {
      setErroFaixas(
        err instanceof ApiError && err.detalhes.length
          ? err.detalhes[0]!.mensagem
          : err instanceof Error
            ? err.message
            : 'Erro inesperado.',
      )
    } finally {
      setSalvando(false)
    }
  }

  const dias = DIAS.map((d, i) => ({ ...d, data: somarDias(semana, i) }))
  const hoje = new Date()
  const totalAgendadas = consultas?.filter((c) => c.status === 'AGENDADO').length ?? 0

  return (
    <Layout>
      <Link to="/" className="alunos__voltar">
        ← Menu principal
      </Link>

      <div className="alunos__cabecalho">
        <div>
          <h1>Horários</h1>
          <p>{ehAdmin ? 'Agenda e disponibilidade dos profissionais.' : 'Sua agenda da semana e seus horários de atendimento.'}</p>
        </div>
        {ehAdmin && (
          <label className="alunos__filtro hor__seletor">
            Profissional
            <select value={profissionalId} onChange={(e) => setProfissionalId(e.target.value)}>
              {profissionais.length === 0 && <option value="">Nenhum profissional ativo</option>}
              {profissionais.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {aviso && (
        <p role="status" className="alunos__aviso">
          {aviso}
          <button aria-label="Fechar aviso" onClick={() => setAviso('')}>
            ×
          </button>
        </p>
      )}

      {/* ---------- Agenda da semana ---------- */}
      <section className="alunos__painel hor__secao">
        <div className="hor__secao-topo">
          <div>
            <h2>Agenda da semana</h2>
            <p>
              {diaMes(semana)} a {diaMes(somarDias(semana, 6))} ·{' '}
              {totalAgendadas === 1 ? '1 consulta agendada' : `${totalAgendadas} consultas agendadas`}
            </p>
          </div>
          <div className="hor__navegacao">
            <button className="alunos__secundario" onClick={() => setSemana(somarDias(semana, -7))} aria-label="Semana anterior">
              ‹
            </button>
            <button className="alunos__secundario" onClick={() => setSemana(inicioDaSemana(new Date()))}>
              Hoje
            </button>
            <button className="alunos__secundario" onClick={() => setSemana(somarDias(semana, 7))} aria-label="Próxima semana">
              ›
            </button>
          </div>
        </div>

        {erroAgenda ? (
          <p role="alert" className="alunos__erro">
            {erroAgenda}
          </p>
        ) : !alvo ? (
          <p className="alunos__vazio">Selecione um profissional.</p>
        ) : (
          <div className="hor__semana">
            {dias.map((d) => {
              const doDia = (consultas ?? []).filter((c) => mesmoDia(new Date(c.dataHora), d.data))
              const faixasDoDia = salvas.filter((f) => f.diaSemana === d.dia)
              return (
                <div key={d.dia} className={mesmoDia(d.data, hoje) ? 'hor__dia hor__dia--hoje' : 'hor__dia'}>
                  <div className="hor__dia-topo">
                    <strong>{d.curto}</strong>
                    <span>{diaMes(d.data)}</span>
                  </div>
                  <p className="hor__dia-faixas">
                    {faixasDoDia.length
                      ? faixasDoDia.map((f) => <span key={f.inicio}>{f.inicio}–{f.fim}</span>)
                      : 'Sem atendimento'}
                  </p>
                  {doDia.length === 0 ? (
                    <p className="hor__livre">{faixasDoDia.length ? 'Nenhuma consulta' : ''}</p>
                  ) : (
                    <ul className="hor__consultas">
                      {doDia.map((c) => (
                        <li key={c.id} className={`hor__consulta hor__consulta--${c.status.toLowerCase()}`}>
                          <span className="hor__consulta-hora">{hora(c.dataHora)}</span>
                          <span className="hor__consulta-paciente">{c.paciente.nome}</span>
                          <span className="hor__consulta-info">
                            {c.especialidade.nome} · {STATUS_ROTULO[c.status]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ---------- Disponibilidade ---------- */}
      <section className="alunos__painel hor__secao">
        <div className="hor__secao-topo">
          <div>
            <h2>Horários de atendimento</h2>
            <p>As consultas só podem ser agendadas dentro destas faixas (cada consulta dura 30 minutos).</p>
          </div>
          <button className="alunos__primario" onClick={salvar} disabled={!alterado || salvando || !alvo}>
            {salvando ? 'Salvando…' : 'Salvar horários'}
          </button>
        </div>

        {erroFaixas && (
          <p role="alert" className="alunos__erro">
            {erroFaixas}
          </p>
        )}

        <div className="hor__disponibilidade">
          {DIAS.map((d) => {
            const indices = faixas.map((f, i) => (f.diaSemana === d.dia ? i : -1)).filter((i) => i >= 0)
            return (
              <div key={d.dia} className="hor__linha">
                <strong className="hor__linha-dia">{d.nome}</strong>
                <div className="hor__linha-faixas">
                  {indices.length === 0 && <span className="hor__fechado">Sem atendimento</span>}
                  {indices.map((i) => (
                    <span key={i} className="hor__faixa">
                      <input
                        type="time"
                        aria-label={`${d.nome}: início`}
                        value={faixas[i]!.inicio}
                        onChange={(e) => atualizarFaixa(i, 'inicio', e.target.value)}
                      />
                      <span aria-hidden>até</span>
                      <input
                        type="time"
                        aria-label={`${d.nome}: fim`}
                        value={faixas[i]!.fim}
                        onChange={(e) => atualizarFaixa(i, 'fim', e.target.value)}
                      />
                      <button
                        type="button"
                        className="hor__remover"
                        aria-label={`Remover faixa de ${d.nome}`}
                        onClick={() => setFaixas(faixas.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <button type="button" className="hor__adicionar" onClick={() => adicionarFaixa(d.dia)}>
                    + Faixa
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </Layout>
  )
}
