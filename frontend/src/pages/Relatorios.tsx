// Donos: Andrey / Pedro (front)
// Relatórios para a coordenação (ADMIN): produção por especialidade e por responsável, com CSV e impressão.
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { api } from '../services/api'
import '../styles/cadastro.css'
import './Relatorios.css'

interface Contagem {
  total: number
  AGENDADO: number
  REALIZADO: number
  CANCELADO: number
  FALTOU: number
  taxaFaltas: number
}

interface Relatorio {
  periodo: { de: string; ate: string }
  totais: Contagem
  porEspecialidade: (Contagem & { id: string; nome: string })[]
  porResponsavel: (Contagem & {
    id: string
    nome: string
    perfil: string
    curso: string | null
    matricula: string | null
    finalizados: number
  })[]
}

const PERFIL: Record<string, string> = { PROFISSIONAL: 'Profissional', ESTUDANTE: 'Estudante' }

const isoDia = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}
const diasAtras = (n: number) => isoDia(new Date(Date.now() - n * 86_400_000))
const pct = (n: number) => `${n.toLocaleString('pt-BR')}%`

/** CSV com ";" e BOM: abre direto no Excel em português. */
function baixarCsv(nome: string, cabecalho: string[], linhas: (string | number)[][]) {
  const celula = (v: string | number) => {
    const s = String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const conteudo = [cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

export function Relatorios() {
  const [de, setDe] = useState(() => diasAtras(30))
  const [ate, setAte] = useState(() => isoDia(new Date()))
  const [periodo, setPeriodo] = useState({ de: diasAtras(30), ate: isoDia(new Date()) })
  const [dados, setDados] = useState<Relatorio | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  const carregar = useCallback(async () => {
    setErro('')
    setCarregando(true)
    try {
      setDados(await api<Relatorio>(`/relatorios?${new URLSearchParams(periodo)}`))
    } catch (e) {
      setDados(null)
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar o relatório.')
    } finally {
      setCarregando(false)
    }
  }, [periodo])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const aplicar = (e: FormEvent) => {
    e.preventDefault()
    setPeriodo({ de, ate })
  }

  const rotuloPeriodo = `${periodo.de.split('-').reverse().join('/')} a ${periodo.ate.split('-').reverse().join('/')}`
  const sufixo = `${periodo.de}_a_${periodo.ate}`

  const exportarEspecialidades = () =>
    dados &&
    baixarCsv(
      `atendimentos-por-especialidade_${sufixo}.csv`,
      ['Especialidade', 'Total', 'Realizados', 'Faltas', 'Cancelados', 'Agendados', 'Taxa de faltas (%)'],
      dados.porEspecialidade.map((e) => [
        e.nome,
        e.total,
        e.REALIZADO,
        e.FALTOU,
        e.CANCELADO,
        e.AGENDADO,
        e.taxaFaltas,
      ]),
    )

  const exportarResponsaveis = () =>
    dados &&
    baixarCsv(
      `producao-por-responsavel_${sufixo}.csv`,
      [
        'Nome',
        'Perfil',
        'Matrícula',
        'Curso',
        'Total',
        'Realizados',
        'Faltas',
        'Cancelados',
        'Finalizados/validados',
        'Taxa de faltas (%)',
      ],
      dados.porResponsavel.map((r) => [
        r.nome,
        PERFIL[r.perfil] ?? r.perfil,
        r.matricula ?? '',
        r.curso ?? '',
        r.total,
        r.REALIZADO,
        r.FALTOU,
        r.CANCELADO,
        r.finalizados,
        r.taxaFaltas,
      ]),
    )

  return (
    <Layout>
      <Link to="/" className="cad__voltar rel__sem-impressao">
        ← Menu principal
      </Link>

      <div className="cad__cabecalho">
        <div>
          <h1>Relatórios</h1>
          <p>Atendimentos de {rotuloPeriodo}.</p>
        </div>
        <button className="cad__secundario rel__sem-impressao" onClick={() => window.print()} disabled={!dados}>
          Imprimir / salvar PDF
        </button>
      </div>

      <form className="cad__painel rel__periodo rel__sem-impressao" onSubmit={aplicar}>
        <label className="cad__filtro">
          De
          <input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} required />
        </label>
        <label className="cad__filtro">
          Até
          <input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} required />
        </label>
        <div className="rel__atalhos">
          {[7, 30, 90].map((n) => (
            <button
              key={n}
              type="button"
              className="cad__secundario"
              onClick={() => {
                const p = { de: diasAtras(n), ate: isoDia(new Date()) }
                setDe(p.de)
                setAte(p.ate)
                setPeriodo(p)
              }}
            >
              {n} dias
            </button>
          ))}
          <button type="submit" className="cad__primario" disabled={carregando}>
            {carregando ? 'Gerando…' : 'Gerar'}
          </button>
        </div>
      </form>

      {erro && (
        <p role="alert" className="cad__erro">
          {erro}
        </p>
      )}

      {dados && (
        <>
          <section className="rel__numeros" aria-label="Totais do período">
            {[
              ['Atendimentos', dados.totais.total],
              ['Realizados', dados.totais.REALIZADO],
              ['Faltas', dados.totais.FALTOU],
              ['Cancelados', dados.totais.CANCELADO],
              ['Taxa de faltas', pct(dados.totais.taxaFaltas)],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="rel__numero">
                <strong>{valor}</strong>
                <span>{rotulo}</span>
              </div>
            ))}
          </section>

          <section className="cad__painel rel__secao">
            <div className="rel__topo">
              <h2>Por especialidade</h2>
              <button
                className="cad__secundario rel__sem-impressao"
                onClick={exportarEspecialidades}
                disabled={!dados.porEspecialidade.length}
              >
                Exportar CSV
              </button>
            </div>
            {dados.porEspecialidade.length === 0 ? (
              <p className="cad__vazio">Nenhum atendimento no período.</p>
            ) : (
              <div className="cad__tabela-wrap">
                <table className="cad__tabela rel__tabela">
                  <thead>
                    <tr>
                      <th>Especialidade</th>
                      <th>Total</th>
                      <th>Realizados</th>
                      <th>Faltas</th>
                      <th>Cancelados</th>
                      <th>Agendados</th>
                      <th>Taxa de faltas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.porEspecialidade.map((e) => (
                      <tr key={e.id}>
                        <td>{e.nome}</td>
                        <td>{e.total}</td>
                        <td>{e.REALIZADO}</td>
                        <td>{e.FALTOU}</td>
                        <td>{e.CANCELADO}</td>
                        <td>{e.AGENDADO}</td>
                        <td>
                          <span className="rel__barra" style={{ '--pct': `${e.taxaFaltas}%` } as React.CSSProperties}>
                            {pct(e.taxaFaltas)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="cad__painel rel__secao">
            <div className="rel__topo">
              <h2>Produção por responsável</h2>
              <button
                className="cad__secundario rel__sem-impressao"
                onClick={exportarResponsaveis}
                disabled={!dados.porResponsavel.length}
              >
                Exportar CSV
              </button>
            </div>
            <p className="cad__dica">Para estudantes, "validados" são os atendimentos já conferidos pelo supervisor.</p>
            {dados.porResponsavel.length === 0 ? (
              <p className="cad__vazio">Nenhum atendimento no período.</p>
            ) : (
              <div className="cad__tabela-wrap">
                <table className="cad__tabela rel__tabela">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Perfil</th>
                      <th>Curso</th>
                      <th>Total</th>
                      <th>Realizados</th>
                      <th>Faltas</th>
                      <th>Finalizados / validados</th>
                      <th>Taxa de faltas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.porResponsavel.map((r) => (
                      <tr key={r.id}>
                        <td>{r.nome}</td>
                        <td>{PERFIL[r.perfil] ?? r.perfil}</td>
                        <td>{r.curso ?? '—'}</td>
                        <td>{r.total}</td>
                        <td>{r.REALIZADO}</td>
                        <td>{r.FALTOU}</td>
                        <td>
                          {r.finalizados} de {r.total - r.AGENDADO}
                        </td>
                        <td>{pct(r.taxaFaltas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </Layout>
  )
}
