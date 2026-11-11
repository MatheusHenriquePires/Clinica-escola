// Donos: Andrey / Pedro (front)
// Aba "Meu perfil": dados da conta logada (somente leitura) e troca da própria senha. Qualquer perfil acessa.
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { Aviso } from '../components/ui'
import type { Perfil } from '../contexts/AuthContext'
import { api, ApiError } from '../services/api'
import { erroSenha } from '../utils/senha'
import '../styles/cadastro.css'
import './MeuPerfil.css'

interface Perfil_ {
  id: string
  nome: string
  email: string
  perfil: Perfil
  matricula: string | null
  curso: string | null
  createdAt: string
  especialidades: { id: string; nome: string }[]
}

const ROTULO_PERFIL: Record<Perfil, string> = {
  ADMIN: 'Administrador',
  RECEPCAO: 'Recepção',
  PROFISSIONAL: 'Profissional',
  ESTUDANTE: 'Estudante',
}

type Campo = 'senhaAtual' | 'novaSenha' | 'confirmacao'
const VAZIO: Record<Campo, string> = { senhaAtual: '', novaSenha: '', confirmacao: '' }

export function MeuPerfil() {
  const [dados, setDados] = useState<Perfil_ | null>(null)
  const [falhaDados, setFalhaDados] = useState('')

  const [form, setForm] = useState(VAZIO)
  const [erros, setErros] = useState<Partial<Record<Campo, string>>>({})
  const [erroForm, setErroForm] = useState('')
  const [aviso, setAviso] = useState('')
  const [verSenha, setVerSenha] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    api<Perfil_>('/auth/me')
      .then(setDados)
      .catch((err) => setFalhaDados(err instanceof Error ? err.message : 'Não foi possível carregar seus dados.'))
  }, [])

  const validar = () => {
    const e: Partial<Record<Campo, string>> = {}
    if (!form.senhaAtual) e.senhaAtual = 'Informe a senha atual.'
    const forca = erroSenha(form.novaSenha)
    if (forca) e.novaSenha = forca
    else if (form.novaSenha === form.senhaAtual) e.novaSenha = 'A nova senha deve ser diferente da atual.'
    if (form.confirmacao !== form.novaSenha) e.confirmacao = 'As senhas não conferem.'
    return e
  }

  const salvar = async (ev: FormEvent) => {
    ev.preventDefault()
    setErroForm('')
    setAviso('')
    const e = validar()
    setErros(e)
    if (Object.keys(e).length) return

    setSalvando(true)
    try {
      await api('/auth/trocar-senha', {
        method: 'POST',
        body: JSON.stringify({ senhaAtual: form.senhaAtual, novaSenha: form.novaSenha }),
      })
      setForm(VAZIO)
      setAviso('Senha alterada com sucesso. Use a nova senha no próximo acesso.')
    } catch (err) {
      if (err instanceof ApiError && err.codigo === 'SENHA_ATUAL_INCORRETA') {
        setErros({ senhaAtual: err.message })
      } else if (err instanceof ApiError && err.detalhes.length) {
        const doServidor: Partial<Record<Campo, string>> = {}
        for (const d of err.detalhes) doServidor[d.campo as Campo] = d.mensagem
        setErros(doServidor)
      } else if (err instanceof ApiError && err.status === 429) {
        setErroForm('Muitas tentativas. Aguarde alguns minutos e tente novamente.')
      } else {
        setErroForm(err instanceof Error ? err.message : 'Erro inesperado.')
      }
    } finally {
      setSalvando(false)
    }
  }

  const campo = (nome: Campo, rotulo: string, autoComplete: string) => (
    <label className="cad__campo">
      {rotulo}
      <input
        type={verSenha ? 'text' : 'password'}
        autoComplete={autoComplete}
        maxLength={200}
        value={form[nome]}
        onChange={(e) => setForm({ ...form, [nome]: e.target.value })}
        aria-invalid={!!erros[nome]}
        className={erros[nome] ? 'cad__invalido' : undefined}
      />
      {erros[nome] && <span className="cad__erro-campo">{erros[nome]}</span>}
    </label>
  )

  const info = (rotulo: string, valor: string) => (
    <div className="perfil__item">
      <dt>{rotulo}</dt>
      <dd>{valor}</dd>
    </div>
  )

  return (
    <Layout>
      <Link to="/" className="cad__voltar">
        ← Menu principal
      </Link>

      <div className="cad__cabecalho">
        <div>
          <h1>Meu perfil</h1>
          <p>Seus dados de acesso ao sistema da clínica.</p>
        </div>
      </div>

      <section className="cad__painel perfil__secao" aria-labelledby="perfil-dados">
        <h2 id="perfil-dados">Dados da conta</h2>
        {falhaDados ? (
          <p role="alert" className="cad__erro">
            {falhaDados}
          </p>
        ) : !dados ? (
          <p className="cad__vazio">Carregando…</p>
        ) : (
          <div className="perfil__conteudo">
            <span className="perfil__avatar" aria-hidden="true">
              {dados.nome.charAt(0).toUpperCase()}
            </span>
            <dl className="perfil__lista">
              {info('Nome', dados.nome)}
              {info('Email de acesso', dados.email)}
              {info('Perfil', ROTULO_PERFIL[dados.perfil])}
              {dados.matricula && info('Matrícula', dados.matricula)}
              {dados.curso && info('Curso', dados.curso)}
              {dados.perfil === 'PROFISSIONAL' &&
                info(
                  'Especialidades',
                  dados.especialidades.length
                    ? dados.especialidades.map((e) => e.nome).join(', ')
                    : 'Nenhuma vinculada',
                )}
              {info('Cadastrado em', new Date(dados.createdAt).toLocaleDateString('pt-BR'))}
            </dl>
          </div>
        )}
        <p className="cad__dica">Para corrigir nome, email ou perfil, procure a administração da clínica.</p>
      </section>

      <section className="cad__painel perfil__secao" aria-labelledby="perfil-senha">
        <h2 id="perfil-senha">Alterar senha</h2>
        <Aviso texto={aviso} onFechar={() => setAviso('')} />
        <form className="cad__form" onSubmit={salvar} noValidate>
          <div className="cad__linha">
            {campo('senhaAtual', 'Senha atual', 'current-password')}
            {campo('novaSenha', 'Nova senha', 'new-password')}
            {campo('confirmacao', 'Confirme a nova senha', 'new-password')}
          </div>
          <label className="cad__ver-senha">
            <input type="checkbox" checked={verSenha} onChange={(e) => setVerSenha(e.target.checked)} />
            Mostrar senhas
          </label>
          <p className="cad__dica">Mínimo de 8 caracteres, com ao menos uma letra e um número.</p>
          {erroForm && (
            <p role="alert" className="cad__erro">
              {erroForm}
            </p>
          )}
          <div className="cad__acoes">
            <button type="submit" className="cad__primario" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Alterar senha'}
            </button>
          </div>
        </form>
      </section>
    </Layout>
  )
}
