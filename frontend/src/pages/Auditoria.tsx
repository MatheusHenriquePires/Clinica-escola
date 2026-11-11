// Donos: Andrey / Pedro (front)
// Trilha de auditoria (somente leitura, ADMIN): quem fez o quê e quando, com o antes/depois.
import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { Paginacao } from '../components/ui'
import { api } from '../services/api'
import '../styles/cadastro.css'
import './Auditoria.css'

type Dados = Record<string, unknown> | null

interface Registro {
  id: string
  entidade: string
  entidadeId: string
  acao: string
  dadosAntes: Dados
  dadosDepois: Dados
  createdAt: string
  usuario: { id: string; nome: string; email: string }
}

interface Lista {
  data: Registro[]
  meta: { page: number; total: number; totalPages: number }
}

interface Opcoes {
  usuarios: { id: string; nome: string; email: string }[]
  entidades: string[]
  acoes: string[]
}

const ROTULO_ACAO: Record<string, string> = {
  CRIAR: 'Criou',
  ATUALIZAR: 'Alterou',
  INATIVAR: 'Inativou',
  REATIVAR: 'Reativou',
  FINALIZAR: 'Finalizou',
  REDEFINIR_SENHA: 'Redefiniu a senha',
  TROCAR_SENHA: 'Trocou a própria senha',
}

// Campos técnicos que não ajudam a entender a mudança.
const IGNORAR = new Set(['id', 'createdAt', 'updatedAt', 'nomeAtivoChave'])

const valor = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'object') {
    if (Array.isArray(v)) return v.map(valor).join(', ') || '—'
    const o = v as Record<string, unknown>
    if ('nome' in o) return String(o.nome)
    return JSON.stringify(v)
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    return new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  }
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  return String(v)
}

/** Lista só os campos que mudaram (ou todos, quando é criação). */
function diferencas(antes: Dados, depois: Dados) {
  const campos = new Set([...Object.keys(antes ?? {}), ...Object.keys(depois ?? {})])
  return [...campos]
    .filter((c) => !IGNORAR.has(c))
    .map((c) => ({ campo: c, antes: valor(antes?.[c]), depois: valor(depois?.[c]) }))
    .filter((d) => !antes || !depois || d.antes !== d.depois)
}

const LIMITE = 20

export function Auditoria() {
  const [opcoes, setOpcoes] = useState<Opcoes>({ usuarios: [], entidades: [], acoes: [] })
  const [lista, setLista] = useState<Lista | null>(null)
  const [erro, setErro] = useState('')
  const [page, setPage] = useState(1)
  const [usuarioId, setUsuarioId] = useState('')
  const [entidade, setEntidade] = useState('')
  const [acao, setAcao] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)

  useEffect(() => {
    api<Opcoes>('/auditoria/opcoes')
      .then(setOpcoes)
      .catch(() => undefined)
  }, [])

  const carregar = useCallback(async () => {
    setErro('')
    const qs = new URLSearchParams({ page: String(page), limit: String(LIMITE) })
    if (usuarioId) qs.set('usuarioId', usuarioId)
    if (entidade) qs.set('entidade', entidade)
    if (acao) qs.set('acao', acao)
    // Datas do filtro no horário local do navegador (com fuso), dia inteiro.
    if (de) qs.set('de', new Date(`${de}T00:00:00`).toISOString())
    if (ate) qs.set('ate', new Date(`${ate}T23:59:59.999`).toISOString())
    try {
      setLista(await api<Lista>(`/auditoria?${qs}`))
    } catch (e) {
      setLista(null)
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar a auditoria.')
    }
  }, [page, usuarioId, entidade, acao, de, ate])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const filtrar = (fn: () => void) => {
    fn()
    setPage(1)
  }

  const limpar = () =>
    filtrar(() => {
      setUsuarioId('')
      setEntidade('')
      setAcao('')
      setDe('')
      setAte('')
    })

  return (
    <Layout>
      <Link to="/" className="cad__voltar">
        ← Menu principal
      </Link>

      <div className="cad__cabecalho">
        <div>
          <h1>Auditoria</h1>
          <p>Registro de todas as alterações feitas no sistema. Somente leitura.</p>
        </div>
      </div>

      <section className="cad__painel">
        <div className="cad__filtros-grade">
          <label className="cad__filtro">
            Usuário
            <select value={usuarioId} onChange={(e) => filtrar(() => setUsuarioId(e.target.value))}>
              <option value="">Todos</option>
              {opcoes.usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome} ({u.email})
                </option>
              ))}
            </select>
          </label>
          <label className="cad__filtro">
            Registro
            <select value={entidade} onChange={(e) => filtrar(() => setEntidade(e.target.value))}>
              <option value="">Todos</option>
              {opcoes.entidades.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label className="cad__filtro">
            Ação
            <select value={acao} onChange={(e) => filtrar(() => setAcao(e.target.value))}>
              <option value="">Todas</option>
              {opcoes.acoes.map((x) => (
                <option key={x} value={x}>
                  {ROTULO_ACAO[x] ?? x}
                </option>
              ))}
            </select>
          </label>
          <label className="cad__filtro">
            De
            <input type="date" value={de} onChange={(e) => filtrar(() => setDe(e.target.value))} />
          </label>
          <label className="cad__filtro">
            Até
            <input type="date" value={ate} onChange={(e) => filtrar(() => setAte(e.target.value))} />
          </label>
          <div className="cad__filtro aud__limpar">
            <button className="cad__secundario" onClick={limpar}>
              Limpar filtros
            </button>
          </div>
        </div>

        {erro ? (
          <p role="alert" className="cad__erro">
            {erro}
          </p>
        ) : !lista ? (
          <p className="cad__vazio">Carregando…</p>
        ) : lista.data.length === 0 ? (
          <p className="cad__vazio">Nenhum registro encontrado.</p>
        ) : (
          <div className="cad__tabela-wrap">
            <table className="cad__tabela">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Usuário</th>
                  <th>Ação</th>
                  <th>Registro</th>
                  <th aria-label="Detalhes" />
                </tr>
              </thead>
              <tbody>
                {lista.data.map((r) => {
                  const mudancas = diferencas(r.dadosAntes, r.dadosDepois)
                  return (
                    <Fragment key={r.id}>
                      <tr>
                        <td>
                          {new Date(r.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })}
                        </td>
                        <td>{r.usuario.nome}</td>
                        <td>{ROTULO_ACAO[r.acao] ?? r.acao}</td>
                        <td>
                          {r.entidade}{' '}
                          <span className="aud__id" title={r.entidadeId}>
                            #{r.entidadeId.slice(0, 8)}
                          </span>
                        </td>
                        <td className="cad__celula-acao">
                          {mudancas.length > 0 && (
                            <button
                              className="cad__secundario"
                              onClick={() => setAberto(aberto === r.id ? null : r.id)}
                            >
                              {aberto === r.id ? 'Ocultar' : `Ver ${mudancas.length} campo(s)`}
                            </button>
                          )}
                        </td>
                      </tr>
                      {aberto === r.id && (
                        <tr>
                          <td colSpan={5}>
                            <table className="aud__diff">
                              <thead>
                                <tr>
                                  <th>Campo</th>
                                  {r.dadosAntes && <th>Antes</th>}
                                  {r.dadosDepois && <th>Depois</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {mudancas.map((d) => (
                                  <tr key={d.campo}>
                                    <td>{d.campo}</td>
                                    {r.dadosAntes && <td className="aud__antes">{d.antes}</td>}
                                    {r.dadosDepois && <td className="aud__depois">{d.depois}</td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {lista && <Paginacao meta={lista.meta} onPagina={setPage} />}
      </section>
    </Layout>
  )
}
