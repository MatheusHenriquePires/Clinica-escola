// Donos: Andrey / Pedro (front)
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { useAuth } from '../contexts/AuthContext'
import { podeEditar } from '../routes/permissoes'
import { api, ApiError } from '../services/api'
import { cpfValido, mascararCpf, mascararTelefone, soDigitos } from '../utils/cpf'
import './Pacientes.css'

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
}

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

  // Modal: Esc fecha e a página de fundo não rola enquanto ele está aberto.
  useEffect(() => {
    if (!painel) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !salvando) setPainel(null)
    }
    document.addEventListener('keydown', aoTeclar)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflow
    }
  }, [painel, salvando])

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
    <label className="pacientes__campo">
      {rotulo}
      <input
        {...props}
        autoComplete="off"
        value={form[nome]}
        onChange={(e) => setForm({ ...form, [nome]: transformar(e.target.value) })}
        aria-invalid={!!errosCampo[nome]}
        className={errosCampo[nome] ? 'pacientes__invalido' : undefined}
      />
      {errosCampo[nome] && <span className="pacientes__erro-campo">{errosCampo[nome]}</span>}
    </label>
  )

  const areaTexto = (nome: Campo, rotulo: string) => (
    <label className="pacientes__campo pacientes__campo--largo">
      {rotulo}
      <textarea
        rows={2}
        maxLength={500}
        value={form[nome]}
        onChange={(e) => setForm({ ...form, [nome]: e.target.value })}
        aria-invalid={!!errosCampo[nome]}
        className={errosCampo[nome] ? 'pacientes__invalido' : undefined}
      />
      {errosCampo[nome] && <span className="pacientes__erro-campo">{errosCampo[nome]}</span>}
    </label>
  )

  return (
    <Layout>
      <Link to="/" className="pacientes__voltar">
        ← Menu principal
      </Link>

      <div className="pacientes__cabecalho">
        <div>
          <h1>Pacientes</h1>
          <p>Cadastro e consulta dos pacientes da clínica.</p>
        </div>
        {editavel && (
          <button className="pacientes__primario" onClick={() => abrir({ tipo: 'novo' })}>
            + Novo paciente
          </button>
        )}
      </div>

      {aviso && (
        <p role="status" className="pacientes__aviso">
          {aviso}
          <button aria-label="Fechar aviso" onClick={() => setAviso('')}>
            ×
          </button>
        </p>
      )}

      {painel && (
        <div className="pacientes__fundo">
          <form
            className="pacientes__form pacientes__modal"
            onSubmit={salvar}
            noValidate
            role="dialog"
            aria-modal="true"
            aria-labelledby="pacientes-modal-titulo"
          >
            <div className="pacientes__modal-topo">
              <h2 id="pacientes-modal-titulo">
                {painel.tipo === 'novo' ? 'Cadastrar paciente' : `Editar paciente · ${painel.paciente.nome}`}
              </h2>
              <button type="button" className="pacientes__fechar" aria-label="Fechar" onClick={() => setPainel(null)}>
                ×
              </button>
            </div>
            <div className="pacientes__linha">
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
              <p role="alert" className="pacientes__erro">
                {erroForm}
              </p>
            )}
            <div className="pacientes__acoes">
              <button type="button" className="pacientes__secundario" onClick={() => setPainel(null)}>
                Cancelar
              </button>
              <button type="submit" className="pacientes__primario" disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      <section className="pacientes__painel">
        <div className="pacientes__filtros">
          <div className="pacientes__abas" role="tablist">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                role="tab"
                aria-selected={ativos === v}
                className={ativos === v ? 'pacientes__aba pacientes__aba--ativa' : 'pacientes__aba'}
                onClick={() => {
                  setAtivos(v)
                  setPage(1)
                }}
              >
                {v ? 'Ativos' : 'Inativos'}
              </button>
            ))}
          </div>
          <form className="pacientes__busca" onSubmit={buscar}>
            <input
              type="search"
              placeholder="Buscar por nome"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <button type="submit" className="pacientes__secundario">
              Buscar
            </button>
          </form>
        </div>

        {falhaLista ? (
          <p role="alert" className="pacientes__erro">
            {falhaLista}
          </p>
        ) : !lista ? (
          <p className="pacientes__vazio">Carregando…</p>
        ) : lista.data.length === 0 ? (
          <p className="pacientes__vazio">
            {termo
              ? 'Nenhum paciente encontrado para esta busca.'
              : ativos
                ? 'Nenhum paciente ativo cadastrado.'
                : 'Nenhum paciente inativo.'}
          </p>
        ) : (
          <div className="pacientes__tabela-wrap">
            <table className="pacientes__tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF</th>
                  <th>Nascimento</th>
                  <th>Telefone</th>
                  {editavel && <th aria-label="Ações" />}
                </tr>
              </thead>
              <tbody>
                {lista.data.map((p) => (
                  <tr key={p.id}>
                    <td>{p.nome}</td>
                    <td>{p.cpf ? mascararCpf(p.cpf) : <span className="pacientes__pendente">Não informado</span>}</td>
                    <td>{formatarData(p.dataNascimento)}</td>
                    <td>
                      {p.telefone ? mascararTelefone(p.telefone) : <span className="pacientes__pendente">—</span>}
                    </td>
                    {editavel && (
                      <td className="pacientes__celula-acao">
                        {confirmando === p.id ? (
                          <span className="pacientes__confirma">
                            Inativar este paciente?
                            <button className="pacientes__perigo" onClick={() => inativar(p)}>
                              Confirmar
                            </button>
                            <button className="pacientes__secundario" onClick={() => setConfirmando(null)}>
                              Cancelar
                            </button>
                          </span>
                        ) : (
                          p.ativo && (
                            <span className="pacientes__botoes">
                              <button
                                className="pacientes__secundario"
                                onClick={() => abrir({ tipo: 'editar', paciente: p })}
                              >
                                Editar
                              </button>
                              <button className="pacientes__secundario" onClick={() => setConfirmando(p.id)}>
                                Inativar
                              </button>
                            </span>
                          )
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lista && lista.meta.totalPages > 1 && (
          <div className="pacientes__paginacao">
            <button className="pacientes__secundario" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              ← Anterior
            </button>
            <span>
              Página {lista.meta.page} de {lista.meta.totalPages}
            </span>
            <button
              className="pacientes__secundario"
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
