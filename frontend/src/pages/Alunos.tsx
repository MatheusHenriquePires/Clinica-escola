// Donos: Andrey / Pedro (front)
import { useCallback, useEffect, useState, type FormEvent, type InputHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { api, ApiError } from '../services/api'
import './Alunos.css'

interface Aluno {
  id: string
  nome: string
  email: string
  matricula: string | null
  curso: string | null
  ativo: boolean
  createdAt: string
}

interface Lista {
  data: Aluno[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

type Campo = 'nome' | 'email' | 'matricula' | 'curso' | 'senha'
type Erros = Partial<Record<Campo, string>>
type Painel = { tipo: 'novo' } | { tipo: 'editar'; aluno: Aluno } | { tipo: 'senha'; aluno: Aluno } | null

const VAZIO = { nome: '', email: '', matricula: '', curso: '', senha: '' }
const LIMITE = 10

const erroSenha = (senha: string) => {
  if (senha.length < 8) return 'A senha deve ter ao menos 8 caracteres.'
  if (!/[A-Za-z]/.test(senha)) return 'A senha deve ter ao menos uma letra.'
  if (!/\d/.test(senha)) return 'A senha deve ter ao menos um número.'
  return ''
}

export function Alunos() {
  const [lista, setLista] = useState<Lista | null>(null)
  const [falhaLista, setFalhaLista] = useState('')
  const [ativos, setAtivos] = useState(true)
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')
  const [page, setPage] = useState(1)
  const [cursos, setCursos] = useState<string[]>([])

  const [painel, setPainel] = useState<Painel>(null)
  const [form, setForm] = useState(VAZIO)
  const [verSenha, setVerSenha] = useState(false)
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
      setLista(await api<Lista>(`/alunos?${qs}`))
    } catch (err) {
      setLista(null)
      setFalhaLista(err instanceof Error ? err.message : 'Não foi possível carregar os alunos.')
    }
  }, [page, ativos, termo])

  useEffect(() => {
    void carregar()
  }, [carregar])

  // Lista fixa de cursos vinda da API (fonte única no backend).
  useEffect(() => {
    api<string[]>('/alunos/cursos')
      .then(setCursos)
      .catch(() => setCursos([]))
  }, [])

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
            nome: p.aluno.nome,
            email: p.aluno.email,
            matricula: p.aluno.matricula ?? '',
            curso: p.aluno.curso ?? '',
            senha: '',
          }
        : VAZIO,
    )
    setErrosCampo({})
    setErroForm('')
    setVerSenha(false)
    setConfirmando(null)
    setPainel(p)
  }

  const validar = (tipo: 'novo' | 'editar' | 'senha') => {
    const erros: Erros = {}
    if (tipo !== 'senha') {
      if (form.nome.trim().length < 3) erros.nome = 'Informe o nome completo.'
      if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) erros.email = 'Informe um email válido.'
      if (!/^[A-Za-z0-9]{4,20}$/.test(form.matricula.trim())) {
        erros.matricula = 'A matrícula deve ter de 4 a 20 letras ou números.'
      }
      if (!form.curso) erros.curso = 'Selecione um curso da lista.'
    }
    if (tipo !== 'editar') {
      const s = erroSenha(form.senha)
      if (s) erros.senha = s
    }
    return erros
  }

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    if (!painel) return
    setErroForm('')
    const erros = validar(painel.tipo)
    setErrosCampo(erros)
    if (Object.keys(erros).length) return

    setSalvando(true)
    try {
      if (painel.tipo === 'novo') {
        await api('/alunos', { method: 'POST', body: JSON.stringify(form) })
        setAviso(`Aluno ${form.nome.trim()} cadastrado com sucesso.`)
        setAtivos(true)
        setBusca('')
        setTermo('')
        setPage(1)
      } else if (painel.tipo === 'editar') {
        const { nome, email, matricula, curso } = form
        await api(`/alunos/${painel.aluno.id}`, {
          method: 'PUT',
          body: JSON.stringify({ nome, email, matricula, curso }),
        })
        setAviso(`Dados de ${nome.trim()} atualizados com sucesso.`)
      } else {
        await api(`/alunos/${painel.aluno.id}/redefinir-senha`, {
          method: 'POST',
          body: JSON.stringify({ senha: form.senha }),
        })
        setAviso(`Senha de ${painel.aluno.nome} redefinida. Informe a nova senha ao aluno.`)
      }
      setPainel(null)
      await carregar()
    } catch (err) {
      if (err instanceof ApiError && err.detalhes.length) {
        const doServidor: Erros = {}
        for (const d of err.detalhes) doServidor[d.campo as Campo] = d.mensagem
        setErrosCampo(doServidor)
      } else if (err instanceof ApiError && err.status === 409) {
        setErrosCampo(err.message.includes('matrícula') ? { matricula: err.message } : { email: err.message })
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

  const campo = (nome: Campo, rotulo: string, props: InputHTMLAttributes<HTMLInputElement>) => (
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

  const titulo =
    painel?.tipo === 'novo'
      ? 'Cadastrar aluno'
      : painel?.tipo === 'editar'
        ? `Editar aluno · ${painel.aluno.nome}`
        : painel?.tipo === 'senha'
          ? `Redefinir senha · ${painel.aluno.nome}`
          : ''

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
        <button className="alunos__primario" onClick={() => abrir({ tipo: 'novo' })}>
          + Novo aluno
        </button>
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
          aria-labelledby="alunos-modal-titulo"
        >
          <div className="alunos__modal-topo">
            <h2 id="alunos-modal-titulo">{titulo}</h2>
            <button type="button" className="alunos__fechar" aria-label="Fechar" onClick={() => setPainel(null)}>
              ×
            </button>
          </div>
          <div className="alunos__linha">
            {painel.tipo !== 'senha' && (
              <>
                {campo('nome', 'Nome completo', { type: 'text', autoComplete: 'off', maxLength: 120, autoFocus: true })}
                {campo('email', 'Email de acesso', { type: 'email', autoComplete: 'off', maxLength: 160 })}
                {campo('matricula', 'Matrícula', {
                  type: 'text',
                  autoComplete: 'off',
                  maxLength: 20,
                  style: { textTransform: 'uppercase' },
                })}
                <label className="alunos__campo">
                  Curso
                  <select
                    value={form.curso}
                    onChange={(e) => setForm({ ...form, curso: e.target.value })}
                    aria-invalid={!!errosCampo.curso}
                    className={errosCampo.curso ? 'alunos__invalido' : undefined}
                  >
                    <option value="">Selecione o curso</option>
                    {cursos.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {errosCampo.curso && <span className="alunos__erro-campo">{errosCampo.curso}</span>}
                </label>
              </>
            )}
            {painel.tipo !== 'editar' &&
              campo('senha', painel.tipo === 'novo' ? 'Senha inicial' : 'Nova senha', {
                type: verSenha ? 'text' : 'password',
                autoComplete: 'new-password',
                maxLength: 200,
                autoFocus: painel.tipo === 'senha',
              })}
          </div>
          {painel.tipo !== 'editar' && (
            <label className="alunos__ver-senha">
              <input type="checkbox" checked={verSenha} onChange={(e) => setVerSenha(e.target.checked)} />
              Mostrar senha
            </label>
          )}
          <p className="alunos__dica">
            {painel.tipo === 'senha'
              ? 'Mínimo de 8 caracteres, com letra e número. Entregue a nova senha ao aluno; ela não pode ser consultada depois.'
              : painel.tipo === 'novo'
                ? 'O aluno entra com este email e senha (mínimo de 8 caracteres, com letra e número). O perfil é Estudante.'
                : 'Alterar o email muda o login do aluno. A alteração fica registrada na auditoria.'}
          </p>
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
              {salvando ? 'Salvando…' : painel.tipo === 'senha' ? 'Redefinir senha' : 'Salvar'}
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
              placeholder="Buscar por nome, email, matrícula ou curso"
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
                  <th>Matrícula</th>
                  <th>Curso</th>
                  <th>Email</th>
                  <th>Cadastro</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {lista.data.map((a) => (
                  <tr key={a.id}>
                    <td>{a.nome}</td>
                    <td>{a.matricula ?? <span className="alunos__pendente">Não informada</span>}</td>
                    <td>{a.curso ?? <span className="alunos__pendente">Não informado</span>}</td>
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
                        <span className="alunos__botoes">
                          <button className="alunos__secundario" onClick={() => abrir({ tipo: 'editar', aluno: a })}>
                            Editar
                          </button>
                          <button className="alunos__secundario" onClick={() => abrir({ tipo: 'senha', aluno: a })}>
                            Senha
                          </button>
                          <button className="alunos__secundario" onClick={() => setConfirmando(a.id)}>
                            {a.ativo ? 'Inativar' : 'Reativar'}
                          </button>
                        </span>
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
