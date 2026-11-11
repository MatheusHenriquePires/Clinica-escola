// Donos: Andrey / Pedro (front)
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { AbasAtivos, Aviso, Paginacao, TopoModal, useModal } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { podeEditar } from '../routes/permissoes'
import { api, ApiError } from '../services/api'
import { cpfValido, mascararCpf, mascararTelefone, soDigitos } from '../utils/cpf'
import '../styles/cadastro.css'

interface Paciente {
  id: string
  nome: string
  dataNascimento: string
  cpf: string | null
  telefone: string | null
  email: string | null
  endereco: string | null
  contatoResponsavel: string | null
  observacoes: string | null
  ativo: boolean
  /** O back ocultou contato e endereço (estudante sem atendimento com o paciente). */
  restrito?: boolean
}

// CPF já mascarado pelo back (***.982.247-**) é exibido como veio.
const exibirCpf = (cpf: string) => (cpf.includes('*') ? cpf : mascararCpf(cpf))

interface Lista {
  data: Paciente[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

type Campo = keyof typeof VAZIO
type Erros = Partial<Record<Campo, string>>
type Painel = { tipo: 'novo' } | { tipo: 'editar'; paciente: Paciente } | null

const VAZIO = {
  nome: '',
  dataNascimento: '',
  cpf: '',
  telefone: '',
  email: '',
  endereco: '',
  contatoResponsavel: '',
  observacoes: '',
}
const LIMITE = 10

// Datas chegam como ISO (UTC meia-noite): usar a parte da data evita voltar um dia por fuso.
const soData = (iso: string) => iso.slice(0, 10)
const formatarData = (iso: string) => soData(iso).split('-').reverse().join('/')
const hoje = () => new Date().toISOString().slice(0, 10)

export function Pacientes() {
  const { usuario } = useAuth()
  const editavel = podeEditar('pacientes', usuario?.perfil)

  const [lista, setLista] = useState<Lista | null>(null)
  const [falhaLista, setFalhaLista] = useState('')
  const [ativos, setAtivos] = useState(true)
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')
  const [page, setPage] = useState(1)

  const [painel, setPainel] = useState<Painel>(null)
  const [form, setForm] = useState(VAZIO)
  const [errosCampo, setErrosCampo] = useState<Erros>({})
  const [erroForm, setErroForm] = useState('')
  const [salvando, setSalvando] = useState(false)

  const [aviso, setAviso] = useState('')
  const [confirmando, setConfirmando] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setFalhaLista('')
    const qs = new URLSearchParams({ page: String(page), limit: String(LIMITE), ativo: String(ativos) })
    if (termo) qs.set('busca', termo)
    try {
      setLista(await api<Lista>(`/pacientes?${qs}`))
    } catch (err) {
      setLista(null)
      setFalhaLista(err instanceof Error ? err.message : 'Não foi possível carregar os pacientes.')
    }
  }, [page, ativos, termo])

  useEffect(() => {
    void carregar()
  }, [carregar])

  // Modal: Esc fecha (exceto durante o salvamento) e a página de fundo não rola.
  useModal(!!painel, () => !salvando && setPainel(null))

  const abrir = (p: Exclude<Painel, null>) => {
    setForm(
      p.tipo === 'editar'
        ? {
            nome: p.paciente.nome,
            dataNascimento: soData(p.paciente.dataNascimento),
            cpf: p.paciente.cpf ? mascararCpf(p.paciente.cpf) : '',
            telefone: p.paciente.telefone ? mascararTelefone(p.paciente.telefone) : '',
            email: p.paciente.email ?? '',
            endereco: p.paciente.endereco ?? '',
            contatoResponsavel: p.paciente.contatoResponsavel ?? '',
            observacoes: p.paciente.observacoes ?? '',
          }
        : VAZIO,
    )
    setErrosCampo({})
    setErroForm('')
    setConfirmando(null)
    setPainel(p)
  }

  const validar = () => {
    const erros: Erros = {}
    if (form.nome.trim().length < 3) erros.nome = 'Informe o nome completo.'
    if (!form.dataNascimento) erros.dataNascimento = 'Informe a data de nascimento.'
    else if (form.dataNascimento > hoje()) erros.dataNascimento = 'A data de nascimento não pode ser futura.'
    if (form.cpf && !cpfValido(form.cpf)) erros.cpf = 'CPF inválido. Confira os números digitados.'
    if (form.telefone && ![10, 11].includes(soDigitos(form.telefone).length)) {
      erros.telefone = 'Informe o telefone com DDD.'
    }
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email.trim())) erros.email = 'Informe um email válido.'
    return erros
  }

  // Campos opcionais vazios são omitidos; CPF e telefone vão só com dígitos.
  const montarCorpo = () => {
    const corpo: Record<string, string> = {
      nome: form.nome.trim(),
      dataNascimento: form.dataNascimento,
    }
    if (form.cpf) corpo.cpf = soDigitos(form.cpf)
    if (form.telefone) corpo.telefone = soDigitos(form.telefone)
    for (const k of ['email', 'endereco', 'contatoResponsavel', 'observacoes'] as const) {
      if (form[k].trim()) corpo[k] = form[k].trim()
    }
    return corpo
  }

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    if (!painel) return
    setErroForm('')
    const erros = validar()
    setErrosCampo(erros)
    if (Object.keys(erros).length) return

    setSalvando(true)
    try {
      if (painel.tipo === 'novo') {
        await api('/pacientes', { method: 'POST', body: JSON.stringify(montarCorpo()) })
        setAviso(`Paciente ${form.nome.trim()} cadastrado com sucesso.`)
        setAtivos(true)
        setBusca('')
        setTermo('')
        setPage(1)
      } else {
        await api(`/pacientes/${painel.paciente.id}`, { method: 'PUT', body: JSON.stringify(montarCorpo()) })
        setAviso(`Dados de ${form.nome.trim()} atualizados com sucesso.`)
      }
      setPainel(null)
      await carregar()
    } catch (err) {
      if (err instanceof ApiError && err.detalhes.length) {
        const doServidor: Erros = {}
        for (const d of err.detalhes) doServidor[d.campo as Campo] = d.mensagem
        setErrosCampo(doServidor)
      } else if (err instanceof ApiError && err.status === 409) {
        // Duplicidade: o CPF é o único campo único do paciente.
        setErrosCampo({ cpf: 'Já existe um paciente cadastrado com este CPF.' })
      } else {
        setErroForm(err instanceof Error ? err.message : 'Erro inesperado.')
      }
    } finally {
      setSalvando(false)
    }
  }

  // Inativar, nunca excluir: o histórico de atendimentos precisa continuar existindo.
  const inativar = async (p: Paciente) => {
    try {
      await api(`/pacientes/${p.id}/inativar`, { method: 'PATCH' })
      setAviso(`Paciente ${p.nome} inativado com sucesso.`)
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'Erro inesperado.')
    } finally {
      setConfirmando(null)
      await carregar()
    }
  }

  const buscar = (e: FormEvent) => {
    e.preventDefault()
    setPage(1)
    setTermo(busca.trim())
  }

  const campo = (
    nome: Campo,
    rotulo: string,
    props: { type?: string; maxLength?: number; autoFocus?: boolean; inputMode?: 'numeric' | 'tel'; max?: string },
    transformar: (v: string) => string = (v) => v,
  ) => (
    <label className="cad__campo">
      {rotulo}
      <input
        {...props}
        autoComplete="off"
        value={form[nome]}
        onChange={(e) => setForm({ ...form, [nome]: transformar(e.target.value) })}
        aria-invalid={!!errosCampo[nome]}
        className={errosCampo[nome] ? 'cad__invalido' : undefined}
      />
      {errosCampo[nome] && <span className="cad__erro-campo">{errosCampo[nome]}</span>}
    </label>
  )

  const areaTexto = (nome: Campo, rotulo: string) => (
    <label className="cad__campo cad__campo--largo">
      {rotulo}
      <textarea
        rows={2}
        maxLength={500}
        value={form[nome]}
        onChange={(e) => setForm({ ...form, [nome]: e.target.value })}
        aria-invalid={!!errosCampo[nome]}
        className={errosCampo[nome] ? 'cad__invalido' : undefined}
      />
      {errosCampo[nome] && <span className="cad__erro-campo">{errosCampo[nome]}</span>}
    </label>
  )

  return (
    <Layout>
      <Link to="/" className="cad__voltar">
        ← Menu principal
      </Link>

      <div className="cad__cabecalho">
        <div>
          <h1>Pacientes</h1>
          <p>Cadastro e consulta dos pacientes da clínica.</p>
        </div>
        {editavel && (
          <button className="cad__primario" onClick={() => abrir({ tipo: 'novo' })}>
            + Novo paciente
          </button>
        )}
      </div>

      <Aviso texto={aviso} onFechar={() => setAviso('')} />

      {painel && (
        <div className="cad__fundo">
          <form
            className="cad__form cad__modal"
            onSubmit={salvar}
            noValidate
            role="dialog"
            aria-modal="true"
            aria-labelledby="pacientes-modal-titulo"
          >
            <TopoModal
              id="pacientes-modal-titulo"
              titulo={painel.tipo === 'novo' ? 'Cadastrar paciente' : `Editar paciente · ${painel.paciente.nome}`}
              onFechar={() => setPainel(null)}
            />
            <div className="cad__linha">
              {campo('nome', 'Nome completo', { type: 'text', maxLength: 120, autoFocus: true })}
              {campo('dataNascimento', 'Data de nascimento', { type: 'date', max: hoje() })}
              {campo('cpf', 'CPF (opcional)', { type: 'text', inputMode: 'numeric', maxLength: 14 }, mascararCpf)}
              {campo('telefone', 'Telefone', { type: 'text', inputMode: 'tel', maxLength: 15 }, mascararTelefone)}
              {campo('email', 'Email', { type: 'email', maxLength: 160 })}
              {campo('contatoResponsavel', 'Contato do responsável', { type: 'text', maxLength: 160 })}
              {areaTexto('endereco', 'Endereço')}
              {areaTexto('observacoes', 'Observações')}
            </div>
            {erroForm && (
              <p role="alert" className="cad__erro">
                {erroForm}
              </p>
            )}
            <div className="cad__acoes">
              <button type="button" className="cad__secundario" onClick={() => setPainel(null)}>
                Cancelar
              </button>
              <button type="submit" className="cad__primario" disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      <section className="cad__painel">
        <div className="cad__filtros">
          <AbasAtivos
            ativos={ativos}
            onMudar={(v) => {
              setAtivos(v)
              setPage(1)
            }}
          />
          <form className="cad__busca" onSubmit={buscar}>
            <input
              type="search"
              placeholder="Buscar por nome"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <button type="submit" className="cad__secundario">
              Buscar
            </button>
          </form>
        </div>

        {falhaLista ? (
          <p role="alert" className="cad__erro">
            {falhaLista}
          </p>
        ) : !lista ? (
          <p className="cad__vazio">Carregando…</p>
        ) : lista.data.length === 0 ? (
          <p className="cad__vazio">
            {termo
              ? 'Nenhum paciente encontrado para esta busca.'
              : ativos
                ? 'Nenhum paciente ativo cadastrado.'
                : 'Nenhum paciente inativo.'}
          </p>
        ) : (
          <div className="cad__tabela-wrap">
            <table className="cad__tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF</th>
                  <th>Nascimento</th>
                  <th>Telefone</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {lista.data.map((p) => (
                  <tr key={p.id}>
                    <td>{p.nome}</td>
                    <td>{p.cpf ? exibirCpf(p.cpf) : <span className="cad__pendente">Não informado</span>}</td>
                    <td>{formatarData(p.dataNascimento)}</td>
                    <td>
                      {p.telefone ? (
                        mascararTelefone(p.telefone)
                      ) : (
                        <span className="cad__pendente">{p.restrito ? 'Restrito' : '—'}</span>
                      )}
                    </td>
                    <td className="cad__celula-acao">
                      {!editavel ? (
                        <span className="cad__botoes">
                          <Link className="cad__secundario" to={`/pacientes/${p.id}`}>
                            Histórico
                          </Link>
                        </span>
                      ) : confirmando === p.id ? (
                        <span className="cad__confirma">
                          Inativar este paciente?
                          <button className="cad__perigo" onClick={() => inativar(p)}>
                            Confirmar
                          </button>
                          <button className="cad__secundario" onClick={() => setConfirmando(null)}>
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <span className="cad__botoes">
                          <Link className="cad__secundario" to={`/pacientes/${p.id}`}>
                            Histórico
                          </Link>
                          {p.ativo && (
                            <>
                              <button
                                className="cad__secundario"
                                onClick={() => abrir({ tipo: 'editar', paciente: p })}
                              >
                                Editar
                              </button>
                              <button className="cad__secundario" onClick={() => setConfirmando(p.id)}>
                                Inativar
                              </button>
                            </>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lista && <Paginacao meta={lista.meta} onPagina={setPage} />}
      </section>
    </Layout>
  )
}
