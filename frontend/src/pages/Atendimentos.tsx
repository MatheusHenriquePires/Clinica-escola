import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { useAuth } from '../contexts/AuthContext'
import { podeEditar } from '../routes/permissoes'
import { api, ApiError } from '../services/api'
import './Alunos.css'

type Status = 'AGENDADO' | 'REALIZADO' | 'CANCELADO' | 'FALTOU'

interface Atendimento {
  id: string
  dataHora: string
  status: Status
  descricao: string | null
  conduta: string | null
  finalizado: boolean
  paciente: { id: string; nome: string }
  especialidade: { id: string; nome: string }
  responsavel: { id: string; nome: string }
}

interface Lista {
  data: Atendimento[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}
interface Opcao {
  id: string
  nome: string
}
interface OpcaoProfissional extends Opcao {
  especialidades: { id: string }[]
}
interface ListaOpcoes {
  data: Opcao[]
}

type Campo = 'pacienteId' | 'especialidadeId' | 'responsavelId' | 'dataHora' | 'status' | 'descricao' | 'conduta'
type Erros = Partial<Record<Campo, string>>

const STATUS_ROTULO: Record<Status, string> = { AGENDADO: 'Agendado', REALIZADO: 'Realizado', CANCELADO: 'Cancelado', FALTOU: 'Faltou' }
const LIMITE = 10

/** Converte ISO em valor de <input type="datetime-local"> (horário local). */
const paraInput = (iso: string) => {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
const agoraInput = () => paraInput(new Date().toISOString())

const vazio = () => ({
  pacienteId: '',
  especialidadeId: '',
  responsavelId: '',
  dataHora: agoraInput(),
  status: 'REALIZADO' as Status,
  descricao: '',
  conduta: '',
})

export function Atendimentos() {
  const { usuario } = useAuth()
  const perfil = usuario?.perfil
  const podeRegistrar = podeEditar('atendimentos', perfil)
  const ehAdmin = perfil === 'ADMIN'
  const ehRecepcao = perfil === 'RECEPCAO'
  // Admin e recepção escolhem o responsável; os demais são o próprio responsável.
  const escolheResponsavel = ehAdmin || ehRecepcao
  // A recepção só cuida da agenda (agendar e cancelar).
  const statusDoForm: Status[] = ehRecepcao ? ['AGENDADO', 'CANCELADO'] : ['AGENDADO', 'REALIZADO', 'FALTOU', 'CANCELADO']
  const podeFinalizar = perfil === 'ADMIN' || perfil === 'PROFISSIONAL'

  const [lista, setLista] = useState<Lista | null>(null)
  const [falhaLista, setFalhaLista] = useState('')
  const [page, setPage] = useState(1)
  const [filtroPaciente, setFiltroPaciente] = useState('')
  const [filtroEsp, setFiltroEsp] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [ordem, setOrdem] = useState<'desc' | 'asc'>('desc')

  const [pacientes, setPacientes] = useState<Opcao[]>([])
  const [especialidades, setEspecialidades] = useState<Opcao[]>([])
  const [profissionais, setProfissionais] = useState<OpcaoProfissional[]>([])

  const [modal, setModal] = useState<{ editando: Atendimento | null } | null>(null)
  const [form, setForm] = useState(vazio())
  const [errosCampo, setErrosCampo] = useState<Erros>({})
  const [erroForm, setErroForm] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<string | null>(null)

  useEffect(() => {
    api<ListaOpcoes>('/pacientes?limit=100')
      .then((r) => setPacientes(r.data))
      .catch(() => setPacientes([]))
    api<ListaOpcoes>('/especialidades?limit=100')
      .then((r) => setEspecialidades(r.data))
      .catch(() => setEspecialidades([]))
    // ADMIN recebe todos os profissionais; o PROFISSIONAL recebe só a si mesmo.
    if (escolheResponsavel || perfil === 'PROFISSIONAL') {
      api<OpcaoProfissional[]>('/profissionais/opcoes')
        .then(setProfissionais)
        .catch(() => setProfissionais([]))
    }
  }, [escolheResponsavel, perfil])

  const carregar = useCallback(async () => {
    setFalhaLista('')
    const qs = new URLSearchParams({ page: String(page), limit: String(LIMITE), ordem })
    if (filtroPaciente) qs.set('pacienteId', filtroPaciente)
    if (filtroEsp) qs.set('especialidadeId', filtroEsp)
    if (filtroStatus) qs.set('status', filtroStatus)
    if (de) qs.set('de', new Date(`${de}T00:00:00`).toISOString())
    if (ate) qs.set('ate', new Date(`${ate}T23:59:59`).toISOString())
    try {
      setLista(await api<Lista>(`/atendimentos?${qs}`))
    } catch (err) {
      setLista(null)
      setFalhaLista(err instanceof Error ? err.message : 'Não foi possível carregar os atendimentos.')
    }
  }, [page, ordem, filtroPaciente, filtroEsp, filtroStatus, de, ate])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => {
    if (!modal) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !salvando) setModal(null)
    }
    document.addEventListener('keydown', aoTeclar)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflow
    }
  }, [modal, salvando])

  const abrir = (a: Atendimento | null) => {
    setForm(
      a
        ? {
            pacienteId: a.paciente.id,
            especialidadeId: a.especialidade.id,
            responsavelId: a.responsavel.id,
            dataHora: paraInput(a.dataHora),
            status: a.status,
            descricao: a.descricao ?? '',
            conduta: a.conduta ?? '',
          }
        : { ...vazio(), status: ehRecepcao ? 'AGENDADO' : 'REALIZADO' },
    )
    setErrosCampo({})
    setErroForm('')
    setModal({ editando: a })
  }

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setErroForm('')
    const erros: Erros = {}
    if (!form.pacienteId) erros.pacienteId = 'Selecione o paciente.'
    if (!form.especialidadeId) erros.especialidadeId = 'Selecione a especialidade.'
    if (escolheResponsavel && !form.responsavelId) erros.responsavelId = 'Selecione o profissional responsável.'
    if (!form.dataHora) erros.dataHora = 'Informe a data e a hora.'
    else if (form.status === 'REALIZADO' && new Date(form.dataHora).getTime() > Date.now() + 5 * 60_000) {
      erros.dataHora = 'Um atendimento realizado não pode ter data futura.'
    } else if (
      form.status === 'AGENDADO' &&
      (!modal?.editando || paraInput(modal.editando.dataHora) !== form.dataHora) &&
      new Date(form.dataHora).getTime() < Date.now()
    ) {
      erros.dataHora = 'Não é possível agendar uma consulta no passado.'
    }
    setErrosCampo(erros)
    if (Object.keys(erros).length) return

    const corpo = {
      pacienteId: form.pacienteId,
      especialidadeId: form.especialidadeId,
      ...(escolheResponsavel && { responsavelId: form.responsavelId }),
      dataHora: new Date(form.dataHora).toISOString(),
      status: form.status,
      descricao: form.descricao,
      conduta: form.conduta,
    }

    setSalvando(true)
    try {
      if (modal?.editando) {
        await api(`/atendimentos/${modal.editando.id}`, { method: 'PUT', body: JSON.stringify(corpo) })
        setAviso('Atendimento atualizado com sucesso.')
      } else {
        await api('/atendimentos', { method: 'POST', body: JSON.stringify(corpo) })
        setAviso('Atendimento registrado com sucesso.')
        setPage(1)
      }
      setModal(null)
      await carregar()
    } catch (err) {
      if (err instanceof ApiError && err.detalhes.length) {
        const doServidor: Erros = {}
        for (const d of err.detalhes) doServidor[d.campo as Campo] = d.mensagem
        setErrosCampo(doServidor)
      } else {
        setErroForm(err instanceof Error ? err.message : 'Erro inesperado.')
      }
    } finally {
      setSalvando(false)
    }
  }

  const finalizar = async (a: Atendimento) => {
    try {
      await api(`/atendimentos/${a.id}/finalizar`, { method: 'PATCH' })
      setAviso('Atendimento finalizado. Ele não poderá mais ser editado.')
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'Erro inesperado.')
    } finally {
      setConfirmando(null)
      await carregar()
    }
  }

  const filtrar = (fn: () => void) => {
    fn()
    setPage(1)
  }

  // Profissional responsável: o escolhido pelo ADMIN ou o próprio usuário logado (perfil PROFISSIONAL).
  const profissionalDoForm = escolheResponsavel
    ? profissionais.find((p) => p.id === form.responsavelId)
    : perfil === 'PROFISSIONAL'
      ? profissionais[0]
      : undefined
  // Profissional só atende nas próprias especialidades; estudante pode qualquer uma.
  const especialidadesDoForm = profissionalDoForm
    ? especialidades.filter((e) => profissionalDoForm.especialidades.some((pe) => pe.id === e.id))
    : especialidades

  const alterarCampo = (campo: Campo, valor: string) => {
    if (campo !== 'responsavelId') return setForm({ ...form, [campo]: valor })
    // Trocou o responsável: limpa a especialidade se ele não atende nela.
    const prof = profissionais.find((p) => p.id === valor)
    const manter = !prof || prof.especialidades.some((e) => e.id === form.especialidadeId)
    setForm({ ...form, responsavelId: valor, especialidadeId: manter ? form.especialidadeId : '' })
  }

  const select = (campo: Campo, rotulo: string, opcoes: Opcao[], placeholder: string) => (
    <label className="alunos__campo">
      {rotulo}
      <select
        value={form[campo]}
        onChange={(e) => alterarCampo(campo, e.target.value)}
        aria-invalid={!!errosCampo[campo]}
        className={errosCampo[campo] ? 'alunos__invalido' : undefined}
      >
        <option value="">{placeholder}</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </select>
      {errosCampo[campo] && <span className="alunos__erro-campo">{errosCampo[campo]}</span>}
    </label>
  )

  return (
    <Layout>
      <Link to="/" className="alunos__voltar">
        ← Menu principal
      </Link>

      <div className="alunos__cabecalho">
        <div>
          <h1>Atendimentos</h1>
          <p>
            {perfil === 'ADMIN' || perfil === 'RECEPCAO'
              ? 'Histórico de atendimentos da clínica.'
              : 'Os atendimentos em que você é o responsável.'}
          </p>
        </div>
        {podeRegistrar && (
          <button className="alunos__primario" onClick={() => abrir(null)}>
            {ehRecepcao ? '+ Agendar consulta' : '+ Novo atendimento'}
          </button>
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

      {modal && (
        <div className="alunos__fundo">
          <form
            className="alunos__form alunos__modal"
            onSubmit={salvar}
            noValidate
            role="dialog"
            aria-modal="true"
            aria-labelledby="atend-modal-titulo"
          >
            <div className="alunos__modal-topo">
              <h2 id="atend-modal-titulo">{modal.editando ? 'Editar atendimento' : ehRecepcao ? 'Agendar consulta' : 'Registrar atendimento'}</h2>
              <button type="button" className="alunos__fechar" aria-label="Fechar" onClick={() => setModal(null)}>
                ×
              </button>
            </div>
            <div className="alunos__linha">
              {select('pacienteId', 'Paciente', pacientes, 'Selecione o paciente')}
              {escolheResponsavel && select('responsavelId', 'Profissional responsável', profissionais, 'Selecione o profissional')}
              {select(
                'especialidadeId',
                'Especialidade',
                especialidadesDoForm,
                escolheResponsavel && !form.responsavelId
                  ? 'Selecione o profissional primeiro'
                  : especialidadesDoForm.length
                    ? 'Selecione a especialidade'
                    : 'O profissional não tem especialidades ativas',
              )}
              <label className="alunos__campo">
                Data e hora
                <input
                  type="datetime-local"
                  value={form.dataHora}
                  onChange={(e) => setForm({ ...form, dataHora: e.target.value })}
                  aria-invalid={!!errosCampo.dataHora}
                  className={errosCampo.dataHora ? 'alunos__invalido' : undefined}
                />
                {errosCampo.dataHora && <span className="alunos__erro-campo">{errosCampo.dataHora}</span>}
              </label>
              <label className="alunos__campo">
                Situação
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Status })}>
                  {statusDoForm.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_ROTULO[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!ehRecepcao && (
              <>
            <label className="alunos__campo">
              Descrição do atendimento
              <textarea
                rows={4}
                maxLength={4000}
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </label>
            <label className="alunos__campo">
              Conduta / encaminhamento
              <textarea
                rows={3}
                maxLength={4000}
                value={form.conduta}
                onChange={(e) => setForm({ ...form, conduta: e.target.value })}
              />
            </label>
              </>
            )}
            {erroForm && (
              <p role="alert" className="alunos__erro">
                {erroForm}
              </p>
            )}
            <div className="alunos__acoes">
              <button type="button" className="alunos__secundario" onClick={() => setModal(null)}>
                Cancelar
              </button>
              <button type="submit" className="alunos__primario" disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      <section className="alunos__painel">
        <div className="alunos__filtros-grade">
          <label className="alunos__filtro">
            Paciente
            <select value={filtroPaciente} onChange={(e) => filtrar(() => setFiltroPaciente(e.target.value))}>
              <option value="">Todos</option>
              {pacientes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="alunos__filtro">
            Especialidade
            <select value={filtroEsp} onChange={(e) => filtrar(() => setFiltroEsp(e.target.value))}>
              <option value="">Todas</option>
              {especialidades.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="alunos__filtro">
            Situação
            <select value={filtroStatus} onChange={(e) => filtrar(() => setFiltroStatus(e.target.value))}>
              <option value="">Todas</option>
              {(Object.keys(STATUS_ROTULO) as Status[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_ROTULO[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="alunos__filtro">
            De
            <input type="date" value={de} onChange={(e) => filtrar(() => setDe(e.target.value))} />
          </label>
          <label className="alunos__filtro">
            Até
            <input type="date" value={ate} onChange={(e) => filtrar(() => setAte(e.target.value))} />
          </label>
          <label className="alunos__filtro">
            Ordenar por
            <select value={ordem} onChange={(e) => filtrar(() => setOrdem(e.target.value as 'asc' | 'desc'))}>
              <option value="desc">Mais recentes primeiro</option>
              <option value="asc">Mais antigos primeiro</option>
            </select>
          </label>
        </div>

        {falhaLista ? (
          <p role="alert" className="alunos__erro">
            {falhaLista}
          </p>
        ) : !lista ? (
          <p className="alunos__vazio">Carregando…</p>
        ) : lista.data.length === 0 ? (
          <p className="alunos__vazio">Nenhum atendimento encontrado.</p>
        ) : (
          <div className="alunos__tabela-wrap">
            <table className="alunos__tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Paciente</th>
                  <th>Especialidade</th>
                  <th>Responsável</th>
                  <th>Situação</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {lista.data.map((a) => (
                  <>
                    <tr key={a.id}>
                      <td>{new Date(a.dataHora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td>{a.paciente.nome}</td>
                      <td>{a.especialidade.nome}</td>
                      <td>{a.responsavel.nome}</td>
                      <td>
                        {STATUS_ROTULO[a.status]}
                        {a.finalizado && ' · Finalizado'}
                      </td>
                      <td className="alunos__celula-acao">
                        {confirmando === a.id ? (
                          <span className="alunos__confirma">
                            Finalizar? Não poderá mais ser editado.
                            <button className="alunos__perigo" onClick={() => finalizar(a)}>
                              Confirmar
                            </button>
                            <button className="alunos__secundario" onClick={() => setConfirmando(null)}>
                              Cancelar
                            </button>
                          </span>
                        ) : (
                          <span className="alunos__botoes">
                            <button
                              className="alunos__secundario"
                              onClick={() => setAberto(aberto === a.id ? null : a.id)}
                            >
                              {aberto === a.id ? 'Ocultar' : 'Detalhes'}
                            </button>
                            {podeRegistrar && !a.finalizado && (!ehRecepcao || a.status === 'AGENDADO') && (
                              <button className="alunos__secundario" onClick={() => abrir(a)}>
                                Editar
                              </button>
                            )}
                            {podeFinalizar && !a.finalizado && a.status !== 'AGENDADO' && (
                              <button className="alunos__secundario" onClick={() => setConfirmando(a.id)}>
                                Finalizar
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                    {aberto === a.id && (
                      <tr key={`${a.id}-d`}>
                        <td colSpan={6}>
                          <p>
                            <strong>Descrição:</strong> {a.descricao || '—'}
                          </p>
                          <p>
                            <strong>Conduta:</strong> {a.conduta || '—'}
                          </p>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lista && lista.meta.totalPages > 1 && (
          <div className="alunos__paginacao">
            <button className="alunos__secundario" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              ← Anterior
            </button>
            <span>
              Página {lista.meta.page} de {lista.meta.totalPages}
            </span>
            <button
              className="alunos__secundario"
              disabled={page >= lista.meta.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Próxima →
            </button>
          </div>
        )}
      </section>
    </Layout>
  )
}
