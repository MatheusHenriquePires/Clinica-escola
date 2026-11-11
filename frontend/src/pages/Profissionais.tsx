import { useCallback, useEffect, useState, type FormEvent, type InputHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { AbasAtivos, Aviso, Paginacao, TopoModal, useModal } from '../components/ui'
import { api, ApiError } from '../services/api'
import '../styles/cadastro.css'

interface Profissional {
  id: string
  nome: string
  email: string
  especialidades: { id: string; nome: string; ativa: boolean }[]
  ativo: boolean
  createdAt: string
}

interface Lista {
  data: Profissional[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

type Campo = 'nome' | 'email' | 'senha'
type CampoErro = Campo | 'especialidadeIds'
type Erros = Partial<Record<CampoErro, string>>
type Painel = { tipo: 'novo' } | { tipo: 'editar'; p: Profissional } | { tipo: 'senha'; p: Profissional } | null

const VAZIO = { nome: '', email: '', senha: '', especialidadeIds: [] as string[] }

interface Opcao {
  id: string
  nome: string
}
const LIMITE = 10

const erroSenha = (s: string) => {
  if (s.length < 8) return 'A senha deve ter ao menos 8 caracteres.'
  if (!/[A-Za-z]/.test(s)) return 'A senha deve ter ao menos uma letra.'
  if (!/\d/.test(s)) return 'A senha deve ter ao menos um número.'
  return ''
}

export function Profissionais() {
  const [lista, setLista] = useState<Lista | null>(null)
  const [falhaLista, setFalhaLista] = useState('')
  const [ativos, setAtivos] = useState(true)
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')
  const [page, setPage] = useState(1)

  const [painel, setPainel] = useState<Painel>(null)
  const [form, setForm] = useState(VAZIO)
  const [verSenha, setVerSenha] = useState(false)
  const [errosCampo, setErrosCampo] = useState<Erros>({})
  const [erroForm, setErroForm] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [especialidades, setEspecialidades] = useState<Opcao[]>([])

  useEffect(() => {
    api<{ data: Opcao[] }>('/especialidades?limit=100')
      .then((r) => setEspecialidades(r.data))
      .catch(() => setEspecialidades([]))
  }, [])

  const carregar = useCallback(async () => {
    setFalhaLista('')
    const qs = new URLSearchParams({ page: String(page), limit: String(LIMITE), ativo: String(ativos) })
    if (termo) qs.set('busca', termo)
    try {
      setLista(await api<Lista>(`/profissionais?${qs}`))
    } catch (err) {
      setLista(null)
      setFalhaLista(err instanceof Error ? err.message : 'Não foi possível carregar os profissionais.')
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
        ? { nome: p.p.nome, email: p.p.email, senha: '', especialidadeIds: p.p.especialidades.map((e) => e.id) }
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
      if (!form.especialidadeIds.length) erros.especialidadeIds = 'Selecione ao menos uma especialidade.'
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
        await api('/profissionais', { method: 'POST', body: JSON.stringify(form) })
        setAviso(`Profissional ${form.nome.trim()} cadastrado com sucesso.`)
        setAtivos(true)
        setBusca('')
        setTermo('')
        setPage(1)
      } else if (painel.tipo === 'editar') {
        await api(`/profissionais/${painel.p.id}`, {
          method: 'PUT',
          body: JSON.stringify({ nome: form.nome, email: form.email, especialidadeIds: form.especialidadeIds }),
        })
        setAviso(`Dados de ${form.nome.trim()} atualizados com sucesso.`)
      } else {
        await api(`/profissionais/${painel.p.id}/redefinir-senha`, {
          method: 'POST',
          body: JSON.stringify({ senha: form.senha }),
        })
        setAviso(`Senha de ${painel.p.nome} redefinida. Informe a nova senha ao profissional.`)
      }
      setPainel(null)
      await carregar()
    } catch (err) {
      if (err instanceof ApiError && err.detalhes.length) {
        const doServidor: Erros = {}
        for (const d of err.detalhes) doServidor[d.campo as CampoErro] = d.mensagem
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

  const alterarStatus = async (p: Profissional) => {
    try {
      await api(`/profissionais/${p.id}/${p.ativo ? 'inativar' : 'reativar'}`, { method: 'PATCH' })
      setAviso(`Profissional ${p.nome} ${p.ativo ? 'inativado' : 'reativado'} com sucesso.`)
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
    <label className="cad__campo">
      {rotulo}
      <input
        {...props}
        value={form[nome]}
        onChange={(e) => setForm({ ...form, [nome]: e.target.value })}
        aria-invalid={!!errosCampo[nome]}
        className={errosCampo[nome] ? 'cad__invalido' : undefined}
      />
      {errosCampo[nome] && <span className="cad__erro-campo">{errosCampo[nome]}</span>}
    </label>
  )

  // Ativas + as inativas que o profissional editado já tinha (para não sumirem do formulário).
  const opcoesEspecialidade: Opcao[] = [
    ...especialidades,
    ...(painel?.tipo === 'editar'
      ? painel.p.especialidades.filter((e) => !e.ativa).map((e) => ({ id: e.id, nome: `${e.nome} (inativa)` }))
      : []),
  ]

  const titulo =
    painel?.tipo === 'novo'
      ? 'Cadastrar profissional'
      : painel?.tipo === 'editar'
        ? `Editar profissional · ${painel.p.nome}`
        : painel?.tipo === 'senha'
          ? `Redefinir senha · ${painel.p.nome}`
          : ''

  return (
    <Layout>
      <Link to="/" className="cad__voltar">
        ← Menu principal
      </Link>

      <div className="cad__cabecalho">
        <div>
          <h1>Profissionais</h1>
          <p>Profissionais com acesso ao sistema da clínica.</p>
        </div>
        <button className="cad__primario" onClick={() => abrir({ tipo: 'novo' })}>
          + Novo profissional
        </button>
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
            aria-labelledby="prof-modal-titulo"
          >
            <TopoModal id="prof-modal-titulo" titulo={titulo} onFechar={() => setPainel(null)} />
            <div className="cad__linha">
              {painel.tipo !== 'senha' && (
                <>
                  {campo('nome', 'Nome completo', {
                    type: 'text',
                    autoComplete: 'off',
                    maxLength: 120,
                    autoFocus: true,
                  })}
                  {campo('email', 'Email de acesso', { type: 'email', autoComplete: 'off', maxLength: 160 })}
                </>
              )}
            </div>
            {painel.tipo !== 'senha' && (
              <fieldset className="prof__especialidades" aria-invalid={!!errosCampo.especialidadeIds}>
                <legend>Especialidades</legend>
                {opcoesEspecialidade.length === 0 ? (
                  <p className="cad__dica">
                    Nenhuma especialidade ativa. Cadastre uma em <Link to="/especialidades">Especialidades</Link>.
                  </p>
                ) : (
                  <div className="prof__chips">
                    {opcoesEspecialidade.map((e) => {
                      const marcada = form.especialidadeIds.includes(e.id)
                      return (
                        <label key={e.id} className={marcada ? 'prof__chip prof__chip--on' : 'prof__chip'}>
                          <input
                            type="checkbox"
                            checked={marcada}
                            onChange={() =>
                              setForm({
                                ...form,
                                especialidadeIds: marcada
                                  ? form.especialidadeIds.filter((id) => id !== e.id)
                                  : [...form.especialidadeIds, e.id],
                              })
                            }
                          />
                          {e.nome}
                        </label>
                      )
                    })}
                  </div>
                )}
                {errosCampo.especialidadeIds && <span className="cad__erro-campo">{errosCampo.especialidadeIds}</span>}
              </fieldset>
            )}
            <div className="cad__linha">
              {painel.tipo !== 'editar' &&
                campo('senha', painel.tipo === 'novo' ? 'Senha inicial' : 'Nova senha', {
                  type: verSenha ? 'text' : 'password',
                  autoComplete: 'new-password',
                  maxLength: 200,
                  autoFocus: painel.tipo === 'senha',
                })}
            </div>
            {painel.tipo !== 'editar' && (
              <label className="cad__ver-senha">
                <input type="checkbox" checked={verSenha} onChange={(e) => setVerSenha(e.target.checked)} />
                Mostrar senha
              </label>
            )}
            <p className="cad__dica">
              {painel.tipo === 'editar'
                ? 'Alterar o email muda o login do profissional. A alteração fica registrada na auditoria.'
                : 'Mínimo de 8 caracteres, com letra e número. O perfil é Profissional.'}
            </p>
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
                {salvando ? 'Salvando…' : painel.tipo === 'senha' ? 'Redefinir senha' : 'Salvar'}
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
              placeholder="Buscar por nome ou email"
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
              ? 'Nenhum profissional encontrado para esta busca.'
              : ativos
                ? 'Nenhum profissional ativo cadastrado.'
                : 'Nenhum profissional inativo.'}
          </p>
        ) : (
          <div className="cad__tabela-wrap">
            <table className="cad__tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Especialidades</th>
                  <th>Cadastro</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {lista.data.map((p) => (
                  <tr key={p.id}>
                    <td>{p.nome}</td>
                    <td>{p.email}</td>
                    <td>
                      {p.especialidades.length ? (
                        <span className="prof__tags">
                          {p.especialidades.map((e) => (
                            <span key={e.id} className={e.ativa ? 'prof__tag' : 'prof__tag prof__tag--inativa'}>
                              {e.nome}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="cad__pendente">Nenhuma</span>
                      )}
                    </td>
                    <td>{new Date(p.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className="cad__celula-acao">
                      {confirmando === p.id ? (
                        <span className="cad__confirma">
                          {p.ativo ? 'Inativar este profissional?' : 'Reativar este profissional?'}
                          <button className="cad__perigo" onClick={() => alterarStatus(p)}>
                            Confirmar
                          </button>
                          <button className="cad__secundario" onClick={() => setConfirmando(null)}>
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <span className="cad__botoes">
                          <button className="cad__secundario" onClick={() => abrir({ tipo: 'editar', p })}>
                            Editar
                          </button>
                          <button className="cad__secundario" onClick={() => abrir({ tipo: 'senha', p })}>
                            Senha
                          </button>
                          <button className="cad__secundario" onClick={() => setConfirmando(p.id)}>
                            {p.ativo ? 'Inativar' : 'Reativar'}
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

        {lista && <Paginacao meta={lista.meta} onPagina={setPage} />}
      </section>
    </Layout>
  )
}
