import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { Aviso, Paginacao, TopoModal, useModal } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { podeEditar } from '../routes/permissoes'
import { api, ApiError } from '../services/api'
import '../styles/cadastro.css'

interface Especialidade {
  id: string
  nome: string
  descricao: string | null
  ativa: boolean
}

interface Lista {
  data: Especialidade[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

type Painel = { editando: Especialidade | null } | null
const LIMITE = 10

export function Especialidades() {
  const { usuario } = useAuth()
  const editavel = podeEditar('especialidades', usuario?.perfil)

  const [lista, setLista] = useState<Lista | null>(null)
  const [falhaLista, setFalhaLista] = useState('')
  const [ativas, setAtivas] = useState(true)
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')
  const [page, setPage] = useState(1)

  const [painel, setPainel] = useState<Painel>(null)
  const [form, setForm] = useState({ nome: '', descricao: '' })
  const [erroNome, setErroNome] = useState('')
  const [erroForm, setErroForm] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [confirmando, setConfirmando] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setFalhaLista('')
    const qs = new URLSearchParams({ page: String(page), limit: String(LIMITE), ativa: String(ativas) })
    if (termo) qs.set('busca', termo)
    try {
      setLista(await api<Lista>(`/especialidades?${qs}`))
    } catch (err) {
      setLista(null)
      setFalhaLista(err instanceof Error ? err.message : 'Não foi possível carregar as especialidades.')
    }
  }, [page, ativas, termo])

  useEffect(() => {
    void carregar()
  }, [carregar])

  // Modal: Esc fecha (exceto durante o salvamento) e a página de fundo não rola.
  useModal(!!painel, () => !salvando && setPainel(null))

  const abrir = (e: Especialidade | null) => {
    setForm({ nome: e?.nome ?? '', descricao: e?.descricao ?? '' })
    setErroNome('')
    setErroForm('')
    setConfirmando(null)
    setPainel({ editando: e })
  }

  const salvar = async (ev: FormEvent) => {
    ev.preventDefault()
    setErroForm('')
    if (form.nome.trim().length < 2) {
      setErroNome('Informe o nome da especialidade.')
      return
    }
    setErroNome('')
    setSalvando(true)
    try {
      const corpo = JSON.stringify({ nome: form.nome, descricao: form.descricao })
      if (painel?.editando) {
        await api(`/especialidades/${painel.editando.id}`, { method: 'PUT', body: corpo })
        setAviso(`Especialidade ${form.nome.trim()} atualizada com sucesso.`)
      } else {
        await api('/especialidades', { method: 'POST', body: corpo })
        setAviso(`Especialidade ${form.nome.trim()} cadastrada com sucesso.`)
        setAtivas(true)
        setBusca('')
        setTermo('')
        setPage(1)
      }
      setPainel(null)
      await carregar()
    } catch (err) {
      if (err instanceof ApiError && (err.status === 409 || err.detalhes.length)) {
        setErroNome(err.detalhes[0]?.mensagem ?? err.message)
      } else {
        setErroForm(err instanceof Error ? err.message : 'Erro inesperado.')
      }
    } finally {
      setSalvando(false)
    }
  }

  const alterarStatus = async (e: Especialidade) => {
    try {
      await api(`/especialidades/${e.id}/${e.ativa ? 'inativar' : 'reativar'}`, { method: 'PATCH' })
      setAviso(`Especialidade ${e.nome} ${e.ativa ? 'inativada' : 'reativada'} com sucesso.`)
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

  return (
    <Layout>
      <Link to="/" className="cad__voltar">
        ← Menu principal
      </Link>

      <div className="cad__cabecalho">
        <div>
          <h1>Especialidades</h1>
          <p>Áreas de atuação disponíveis para atendimento.</p>
        </div>
        {editavel && (
          <button className="cad__primario" onClick={() => abrir(null)}>
            + Nova especialidade
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
            aria-labelledby="esp-modal-titulo"
          >
            <TopoModal
              id="esp-modal-titulo"
              titulo={painel.editando ? `Editar · ${painel.editando.nome}` : 'Cadastrar especialidade'}
              onFechar={() => setPainel(null)}
            />
            <label className="cad__campo">
              Nome
              <input
                type="text"
                maxLength={80}
                autoFocus
                autoComplete="off"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                aria-invalid={!!erroNome}
                className={erroNome ? 'cad__invalido' : undefined}
              />
              {erroNome && <span className="cad__erro-campo">{erroNome}</span>}
            </label>
            <label className="cad__campo">
              Descrição (opcional)
              <textarea
                rows={3}
                maxLength={500}
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </label>
            <p className="cad__dica">O nome deve ser único entre as especialidades ativas.</p>
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
          <div className="cad__abas" role="tablist">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                role="tab"
                aria-selected={ativas === v}
                className={ativas === v ? 'cad__aba cad__aba--ativa' : 'cad__aba'}
                onClick={() => {
                  setAtivas(v)
                  setPage(1)
                }}
              >
                {v ? 'Ativas' : 'Inativas'}
              </button>
            ))}
          </div>
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
              ? 'Nenhuma especialidade encontrada para esta busca.'
              : ativas
                ? 'Nenhuma especialidade ativa cadastrada.'
                : 'Nenhuma especialidade inativa.'}
          </p>
        ) : (
          <div className="cad__tabela-wrap">
            <table className="cad__tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Descrição</th>
                  {editavel && <th aria-label="Ações" />}
                </tr>
              </thead>
              <tbody>
                {lista.data.map((e) => (
                  <tr key={e.id}>
                    <td>{e.nome}</td>
                    <td>{e.descricao ?? <span className="cad__pendente">—</span>}</td>
                    {editavel && (
                      <td className="cad__celula-acao">
                        {confirmando === e.id ? (
                          <span className="cad__confirma">
                            {e.ativa ? 'Inativar esta especialidade?' : 'Reativar esta especialidade?'}
                            <button className="cad__perigo" onClick={() => alterarStatus(e)}>
                              Confirmar
                            </button>
                            <button className="cad__secundario" onClick={() => setConfirmando(null)}>
                              Cancelar
                            </button>
                          </span>
                        ) : (
                          <span className="cad__botoes">
                            <button className="cad__secundario" onClick={() => abrir(e)}>
                              Editar
                            </button>
                            <button className="cad__secundario" onClick={() => setConfirmando(e.id)}>
                              {e.ativa ? 'Inativar' : 'Reativar'}
                            </button>
                          </span>
                        )}
                      </td>
                    )}
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
