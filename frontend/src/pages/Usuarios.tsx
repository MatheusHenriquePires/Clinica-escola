// Donos: Andrey / Pedro (front)
// Contas da equipe (Administrador e Recepção). Mesmo visual da tela de Alunos.
import { useCallback, useEffect, useState, type FormEvent, type InputHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { AbasAtivos, Aviso, Paginacao, TopoModal, useModal } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { api, ApiError } from '../services/api'
import { erroSenha } from '../utils/senha'
import '../styles/cadastro.css'

type PerfilEquipe = 'ADMIN' | 'RECEPCAO'

interface Usuario {
  id: string
  nome: string
  email: string
  perfil: PerfilEquipe
  ativo: boolean
  createdAt: string
}

interface Lista {
  data: Usuario[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

type Campo = 'nome' | 'email' | 'perfil' | 'senha'
type Erros = Partial<Record<Campo, string>>
type Painel = { tipo: 'novo' } | { tipo: 'editar'; usuario: Usuario } | { tipo: 'senha'; usuario: Usuario } | null

const ROTULO_PERFIL: Record<PerfilEquipe, string> = { ADMIN: 'Administrador', RECEPCAO: 'Recepção' }
const VAZIO = { nome: '', email: '', perfil: 'RECEPCAO', senha: '' }
const LIMITE = 10

export function Usuarios() {
  const { usuario: logado } = useAuth()
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

  const carregar = useCallback(async () => {
    setFalhaLista('')
    const qs = new URLSearchParams({ page: String(page), limit: String(LIMITE), ativo: String(ativos) })
    if (termo) qs.set('busca', termo)
    try {
      setLista(await api<Lista>(`/usuarios?${qs}`))
    } catch (err) {
      setLista(null)
      setFalhaLista(err instanceof Error ? err.message : 'Não foi possível carregar os usuários.')
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
        ? { nome: p.usuario.nome, email: p.usuario.email, perfil: p.usuario.perfil, senha: '' }
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
      if (!form.perfil) erros.perfil = 'Selecione o perfil.'
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
        await api('/usuarios', { method: 'POST', body: JSON.stringify(form) })
        setAviso(`Usuário ${form.nome.trim()} cadastrado com sucesso.`)
        setAtivos(true)
        setBusca('')
        setTermo('')
        setPage(1)
      } else if (painel.tipo === 'editar') {
        const { nome, email, perfil } = form
        await api(`/usuarios/${painel.usuario.id}`, { method: 'PUT', body: JSON.stringify({ nome, email, perfil }) })
        setAviso(`Dados de ${nome.trim()} atualizados com sucesso.`)
      } else {
        await api(`/usuarios/${painel.usuario.id}/redefinir-senha`, {
          method: 'POST',
          body: JSON.stringify({ senha: form.senha }),
        })
        setAviso(`Senha de ${painel.usuario.nome} redefinida. Informe a nova senha ao usuário.`)
      }
      setPainel(null)
      await carregar()
    } catch (err) {
      if (err instanceof ApiError && err.detalhes.length) {
        const doServidor: Erros = {}
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

  const alterarStatus = async (u: Usuario) => {
    const acao = u.ativo ? 'inativar' : 'reativar'
    try {
      await api(`/usuarios/${u.id}/${acao}`, { method: 'PATCH' })
      setAviso(`Usuário ${u.nome} ${u.ativo ? 'inativado' : 'reativado'} com sucesso.`)
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

  const editandoASiMesmo = painel?.tipo === 'editar' && painel.usuario.id === logado?.id

  const titulo =
    painel?.tipo === 'novo'
      ? 'Cadastrar usuário'
      : painel?.tipo === 'editar'
        ? `Editar usuário · ${painel.usuario.nome}`
        : painel?.tipo === 'senha'
          ? `Redefinir senha · ${painel.usuario.nome}`
          : ''

  return (
    <Layout>
      <Link to="/" className="cad__voltar">
        ← Menu principal
      </Link>

      <div className="cad__cabecalho">
        <div>
          <h1>Usuários</h1>
          <p>Contas da equipe administrativa e da recepção. Alunos e profissionais têm telas próprias.</p>
        </div>
        <button className="cad__primario" onClick={() => abrir({ tipo: 'novo' })}>
          + Novo usuário
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
            aria-labelledby="usuarios-modal-titulo"
          >
            <TopoModal id="usuarios-modal-titulo" titulo={titulo} onFechar={() => setPainel(null)} />
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
                  <label className="cad__campo">
                    Perfil
                    <select
                      value={form.perfil}
                      disabled={editandoASiMesmo}
                      onChange={(e) => setForm({ ...form, perfil: e.target.value })}
                      aria-invalid={!!errosCampo.perfil}
                      className={errosCampo.perfil ? 'cad__invalido' : undefined}
                    >
                      {Object.entries(ROTULO_PERFIL).map(([valor, rotulo]) => (
                        <option key={valor} value={valor}>
                          {rotulo}
                        </option>
                      ))}
                    </select>
                    {errosCampo.perfil && <span className="cad__erro-campo">{errosCampo.perfil}</span>}
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
              <label className="cad__ver-senha">
                <input type="checkbox" checked={verSenha} onChange={(e) => setVerSenha(e.target.checked)} />
                Mostrar senha
              </label>
            )}
            <p className="cad__dica">
              {painel.tipo === 'senha'
                ? 'Mínimo de 8 caracteres, com letra e número. Entregue a nova senha ao usuário; ele pode trocá-la depois em "Alterar senha".'
                : painel.tipo === 'novo'
                  ? 'O usuário entra com este email e senha (mínimo de 8 caracteres, com letra e número).'
                  : editandoASiMesmo
                    ? 'Você não pode alterar o seu próprio perfil.'
                    : 'Alterar o email muda o login do usuário. A alteração fica registrada na auditoria.'}
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
              ? 'Nenhum usuário encontrado para esta busca.'
              : ativos
                ? 'Nenhum usuário ativo cadastrado.'
                : 'Nenhum usuário inativo.'}
          </p>
        ) : (
          <div className="cad__tabela-wrap">
            <table className="cad__tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Perfil</th>
                  <th>Email</th>
                  <th>Cadastro</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {lista.data.map((u) => (
                  <tr key={u.id}>
                    <td>
                      {u.nome}
                      {u.id === logado?.id && <span className="cad__pendente"> (você)</span>}
                    </td>
                    <td>{ROTULO_PERFIL[u.perfil]}</td>
                    <td>{u.email}</td>
                    <td>{new Date(u.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className="cad__celula-acao">
                      {confirmando === u.id ? (
                        <span className="cad__confirma">
                          {u.ativo ? 'Inativar este usuário?' : 'Reativar este usuário?'}
                          <button className="cad__perigo" onClick={() => alterarStatus(u)}>
                            Confirmar
                          </button>
                          <button className="cad__secundario" onClick={() => setConfirmando(null)}>
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <span className="cad__botoes">
                          <button className="cad__secundario" onClick={() => abrir({ tipo: 'editar', usuario: u })}>
                            Editar
                          </button>
                          <button className="cad__secundario" onClick={() => abrir({ tipo: 'senha', usuario: u })}>
                            Senha
                          </button>
                          {u.id !== logado?.id && (
                            <button className="cad__secundario" onClick={() => setConfirmando(u.id)}>
                              {u.ativo ? 'Inativar' : 'Reativar'}
                            </button>
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
