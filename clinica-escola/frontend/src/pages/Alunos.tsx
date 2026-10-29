// Donos: Andrey / Pedro (front)
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { api, ApiError } from '../services/api'
import './Alunos.css'

interface Aluno {
  id: string
  nome: string
  email: string
  ativo: boolean
  createdAt: string
}

interface Lista {
  data: Aluno[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

type Campo = 'nome' | 'email' | 'senha'
const VAZIO = { nome: '', email: '', senha: '' }
const LIMITE = 10

export function Alunos() {
  const [lista, setLista] = useState<Lista | null>(null)
  const [falhaLista, setFalhaLista] = useState('')
  const [ativos, setAtivos] = useState(true)
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')
  const [page, setPage] = useState(1)

  const [formAberto, setFormAberto] = useState(false)
  const [form, setForm] = useState(VAZIO)
  const [errosCampo, setErrosCampo] = useState<Partial<Record<Campo, string>>>({})
  const [erroForm, setErroForm] = useState('')
  const [salvando, setSalvando] = useState(false)

  const [aviso, setAviso] = useState('')
  const [confirmando, setConfirmando] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setFalhaLista('')
    const qs = new URLSearchParams({ page: String(page), limit: String(LIMITE), ativo: String(ativos) })
    if (termo) qs.set('busca', termo)
    try {
      setLista(await api<Lista>(`/alunos?${qs}`))
    } catch (err) {
      setLista(null)
      setFalhaLista(err instanceof Error ? err.message : 'Não foi possível carregar os alunos.')
    }
  }, [page, ativos, termo])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const abrirForm = () => {
    setForm(VAZIO)
    setErrosCampo({})
    setErroForm('')
    setFormAberto(true)
  }

  const validar = () => {
    const erros: Partial<Record<Campo, string>> = {}
    if (form.nome.trim().length < 3) erros.nome = 'Informe o nome completo.'
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) erros.email = 'Informe um email válido.'
    if (form.senha.length < 8) erros.senha = 'A senha deve ter ao menos 8 caracteres.'
    return erros
  }

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setErroForm('')
    const erros = validar()
    setErrosCampo(erros)
    if (Object.keys(erros).length) return

    setSalvando(true)
    try {
      await api('/alunos', { method: 'POST', body: JSON.stringify(form) })
      setFormAberto(false)
      setAviso(`Aluno ${form.nome.trim()} cadastrado com sucesso.`)
      setAtivos(true)
      setBusca('')
      setTermo('')
      setPage(1)
      await carregar()
    } catch (err) {
      if (err instanceof ApiError && err.detalhes.length) {
        const doServidor: Partial<Record<Campo, string>> = {}
        for (const d of err.detalhes) doServidor[d.campo as Campo] = d.mensagem
        setErrosCampo(doServidor)
      } else if (err instanceof ApiError && err.status === 409) {
        setErrosCampo({ email: err.message })
      } else {
        setErroForm(err instanceof Error ? err.message : 'Erro inesperado.')
      }
    } finally {
      setSalvando(false)
    }
  }

  const alterarStatus = async (aluno: Aluno) => {
    const acao = aluno.ativo ? 'inativar' : 'reativar'
    try {
      await api(`/alunos/${aluno.id}/${acao}`, { method: 'PATCH' })
      setAviso(`Aluno ${aluno.nome} ${aluno.ativo ? 'inativado' : 'reativado'} com sucesso.`)
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

  const campo = (nome: Campo, rotulo: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="alunos__campo">
      {rotulo}
      <input
        {...props}
        value={form[nome]}
        onChange={(e) => setForm({ ...form, [nome]: e.target.value })}
        aria-invalid={!!errosCampo[nome]}
        className={errosCampo[nome] ? 'alunos__invalido' : undefined}
      />
      {errosCampo[nome] && <span className="alunos__erro-campo">{errosCampo[nome]}</span>}
    </label>
  )

  return (
    <Layout>
      <Link to="/" className="alunos__voltar">
        ← Menu principal
      </Link>

      <div className="alunos__cabecalho">
        <div>
          <h1>Alunos</h1>
          <p>Estudantes com acesso ao sistema da clínica.</p>
        </div>
        {!formAberto && (
          <button className="alunos__primario" onClick={abrirForm}>
            + Novo aluno
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

      {formAberto && (
        <form className="alunos__form" onSubmit={salvar} noValidate>
          <h2>Cadastrar aluno</h2>
          <div className="alunos__linha">
            {campo('nome', 'Nome completo', { type: 'text', autoComplete: 'off', maxLength: 120 })}
            {campo('email', 'Email de acesso', { type: 'email', autoComplete: 'off', maxLength: 160 })}
            {campo('senha', 'Senha inicial', { type: 'password', autoComplete: 'new-password', maxLength: 200 })}
          </div>
          <p className="alunos__dica">O aluno entra com este email e senha. O perfil é definido como Estudante.</p>
          {erroForm && (
            <p role="alert" className="alunos__erro">
              {erroForm}
            </p>
          )}
          <div className="alunos__acoes">
            <button type="button" className="alunos__secundario" onClick={() => setFormAberto(false)}>
              Cancelar
            </button>
            <button type="submit" className="alunos__primario" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar aluno'}
            </button>
          </div>
        </form>
      )}

      <section className="alunos__painel">
        <div className="alunos__filtros">
          <div className="alunos__abas" role="tablist">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                role="tab"
                aria-selected={ativos === v}
                className={ativos === v ? 'alunos__aba alunos__aba--ativa' : 'alunos__aba'}
                onClick={() => {
                  setAtivos(v)
                  setPage(1)
                }}
              >
                {v ? 'Ativos' : 'Inativos'}
              </button>
            ))}
          </div>
          <form className="alunos__busca" onSubmit={buscar}>
            <input
              type="search"
              placeholder="Buscar por nome ou email"
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
              ? 'Nenhum aluno encontrado para esta busca.'
              : ativos
                ? 'Nenhum aluno ativo cadastrado.'
                : 'Nenhum aluno inativo.'}
          </p>
        ) : (
          <div className="alunos__tabela-wrap">
            <table className="alunos__tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Cadastro</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {lista.data.map((a) => (
                  <tr key={a.id}>
                    <td>{a.nome}</td>
                    <td>{a.email}</td>
                    <td>{new Date(a.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className="alunos__celula-acao">
                      {confirmando === a.id ? (
                        <span className="alunos__confirma">
                          {a.ativo ? 'Inativar este aluno?' : 'Reativar este aluno?'}
                          <button className="alunos__perigo" onClick={() => alterarStatus(a)}>
                            Confirmar
                          </button>
                          <button className="alunos__secundario" onClick={() => setConfirmando(null)}>
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <button className="alunos__secundario" onClick={() => setConfirmando(a.id)}>
                          {a.ativo ? 'Inativar' : 'Reativar'}
                        </button>
                      )}
                    </td>
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
