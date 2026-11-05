import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { useAuth } from '../contexts/AuthContext'
import { podeEditar } from '../routes/permissoes'
import { api, ApiError } from '../services/api'
import './Alunos.css'

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
      <Link to="/" className="alunos__voltar">
        ← Menu principal
      </Link>

      <div className="alunos__cabecalho">
        <div>
          <h1>Especialidades</h1>
          <p>Áreas de atuação disponíveis para atendimento.</p>
        </div>
        {editavel && (
          <button className="alunos__primario" onClick={() => abrir(null)}>
            + Nova especialidade
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

      {painel && (
        <div className="alunos__fundo">
          <form
            className="alunos__form alunos__modal"
            onSubmit={salvar}
            noValidate
            role="dialog"
            aria-modal="true"
            aria-labelledby="esp-modal-titulo"
          >
            <div className="alunos__modal-topo">
              <h2 id="esp-modal-titulo">
                {painel.editando ? `Editar · ${painel.editando.nome}` : 'Cadastrar especialidade'}
              </h2>
              <button type="button" className="alunos__fechar" aria-label="Fechar" onClick={() => setPainel(null)}>
                ×
              </button>
            </div>
            <label className="alunos__campo">
              Nome
              <input
                type="text"
                maxLength={80}
                autoFocus
                autoComplete="off"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                aria-invalid={!!erroNome}
                className={erroNome ? 'alunos__invalido' : undefined}
              />
              {erroNome && <span className="alunos__erro-campo">{erroNome}</span>}
            </label>
            <label className="alunos__campo">
              Descrição (opcional)
              <textarea
                rows={3}
                maxLength={500}
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </label>
            <p className="alunos__dica">O nome deve ser único entre as especialidades ativas.</p>
            {erroForm && (
              <p role="alert" className="alunos__erro">
                {erroForm}
              </p>
            )}
            <div className="alunos__acoes">
              <button type="button" className="alunos__secundario" onClick={() => setPainel(null)}>
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
        <div className="alunos__filtros">
          <div className="alunos__abas" role="tablist">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                role="tab"
                aria-selected={ativas === v}
                className={ativas === v ? 'alunos__aba alunos__aba--ativa' : 'alunos__aba'}
                onClick={() => {
                  setAtivas(v)
                  setPage(1)
                }}
              >
                {v ? 'Ativas' : 'Inativas'}
              </button>
            ))}
          </div>
          <form className="alunos__busca" onSubmit={buscar}>
            <input
              type="search"
              placeholder="Buscar por nome"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <button type="submit" className="alunos__secundario">
              Buscar
            </button>
          </form>
        </div>

        {falhaLista ? (
          <p role="alert" className="alunos__erro">
            {falhaLista}
          </p>
        ) : !lista ? (
          <p className="alunos__vazio">Carregando…</p>
        ) : lista.data.length === 0 ? (
          <p className="alunos__vazio">
            {termo
              ? 'Nenhuma especialidade encontrada para esta busca.'
              : ativas
                ? 'Nenhuma especialidade ativa cadastrada.'
                : 'Nenhuma especialidade inativa.'}
          </p>
        ) : (
          <div className="alunos__tabela-wrap">
            <table className="alunos__tabela">
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
                    <td>{e.descricao ?? <span className="alunos__pendente">—</span>}</td>
                    {editavel && (
                      <td className="alunos__celula-acao">
                        {confirmando === e.id ? (
                          <span className="alunos__confirma">
                            {e.ativa ? 'Inativar esta especialidade?' : 'Reativar esta especialidade?'}
                            <button className="alunos__perigo" onClick={() => alterarStatus(e)}>
                              Confirmar
                            </button>
                            <button className="alunos__secundario" onClick={() => setConfirmando(null)}>
                              Cancelar
                            </button>
                          </span>
                        ) : (
                          <span className="alunos__botoes">
                            <button className="alunos__secundario" onClick={() => abrir(e)}>
                              Editar
                            </button>
                            <button className="alunos__secundario" onClick={() => setConfirmando(e.id)}>
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
