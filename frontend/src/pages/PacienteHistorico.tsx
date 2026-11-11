// Donos: Andrey / Pedro (front)
// Prontuário do paciente: dados cadastrais + todos os atendimentos em linha do tempo.
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { Paginacao } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { podeEditar } from '../routes/permissoes'
import { api } from '../services/api'
import { mascararCpf, mascararTelefone } from '../utils/cpf'
import '../styles/cadastro.css'
import './PacienteHistorico.css'

type Status = 'AGENDADO' | 'REALIZADO' | 'CANCELADO' | 'FALTOU'

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
  restrito?: boolean
}

interface Atendimento {
  id: string
  dataHora: string
  status: Status
  descricao: string | null
  conduta: string | null
  finalizado: boolean
  especialidade: { nome: string }
  responsavel: { nome: string; perfil: string }
  supervisor: { nome: string } | null
}

interface Lista {
  data: Atendimento[]
  meta: { page: number; total: number; totalPages: number }
}

const STATUS_ROTULO: Record<Status, string> = {
  AGENDADO: 'Agendado',
  REALIZADO: 'Realizado',
  CANCELADO: 'Cancelado',
  FALTOU: 'Faltou',
}

const idade = (iso: string) => {
  const n = new Date(iso.slice(0, 10) + 'T12:00:00')
  const h = new Date()
  let anos = h.getFullYear() - n.getFullYear()
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) anos--
  return anos
}
const formatarData = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

export function PacienteHistorico() {
  const { id = '' } = useParams()
  const { usuario } = useAuth()
  const veTudo = usuario?.perfil === 'ADMIN' || usuario?.perfil === 'RECEPCAO'
  const podeRegistrar = podeEditar('atendimentos', usuario?.perfil)

  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [lista, setLista] = useState<Lista | null>(null)
  const [page, setPage] = useState(1)
  const [erro, setErro] = useState('')

  useEffect(() => {
    api<Paciente>(`/pacientes/${id}`)
      .then(setPaciente)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Paciente não encontrado.'))
  }, [id])

  const carregar = useCallback(async () => {
    const qs = new URLSearchParams({ pacienteId: id, ordem: 'desc', limit: '15', page: String(page) })
    try {
      setLista(await api<Lista>(`/atendimentos?${qs}`))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o histórico.')
    }
  }, [id, page])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const info = (rotulo: string, valor: string | null | undefined) => (
    <div className="perfil__item">
      <dt>{rotulo}</dt>
      <dd>{valor || (paciente?.restrito ? 'Restrito' : '—')}</dd>
    </div>
  )

  return (
    <Layout>
      <Link to="/pacientes" className="cad__voltar">
        ← Pacientes
      </Link>

      {erro && !paciente ? (
        <p role="alert" className="cad__erro">
          {erro}
        </p>
      ) : !paciente ? (
        <p className="cad__vazio">Carregando…</p>
      ) : (
        <>
          <div className="cad__cabecalho">
            <div>
              <h1>{paciente.nome}</h1>
              <p>
                {idade(paciente.dataNascimento)} anos · nascido(a) em {formatarData(paciente.dataNascimento)}
                {!paciente.ativo && ' · paciente inativo'}
              </p>
            </div>
            {podeRegistrar && paciente.ativo && (
              <Link className="cad__primario" to={`/atendimentos?novo=1&pacienteId=${paciente.id}`}>
                + Novo atendimento
              </Link>
            )}
          </div>

          <section className="cad__painel hist__dados" aria-label="Dados do paciente">
            <dl className="perfil__lista">
              {info('CPF', paciente.cpf && (paciente.cpf.includes('*') ? paciente.cpf : mascararCpf(paciente.cpf)))}
              {info('Telefone', paciente.telefone && mascararTelefone(paciente.telefone))}
              {info('Email', paciente.email)}
              {info('Endereço', paciente.endereco)}
              {info('Contato / responsável', paciente.contatoResponsavel)}
              {info('Observações', paciente.observacoes)}
            </dl>
            {paciente.restrito && (
              <p className="cad__dica">
                Dados de contato visíveis só depois que você tiver um atendimento com este paciente (LGPD).
              </p>
            )}
          </section>

          <section className="cad__painel" aria-labelledby="hist-titulo">
            <div className="hist__topo">
              <h2 id="hist-titulo">Histórico de atendimentos</h2>
              {lista && <span className="hist__total">{lista.meta.total} no total</span>}
            </div>
            {!veTudo && <p className="cad__dica">Você vê apenas os atendimentos em que é responsável ou supervisor.</p>}

            {!lista ? (
              <p className="cad__vazio">Carregando…</p>
            ) : lista.data.length === 0 ? (
              <p className="cad__vazio">Nenhum atendimento registrado.</p>
            ) : (
              <ol className="hist__linha">
                {lista.data.map((a) => (
                  <li key={a.id} className={`hist__item hist__item--${a.status.toLowerCase()}`}>
                    <div className="hist__cabeca">
                      <time dateTime={a.dataHora}>
                        {new Date(a.dataHora).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })}
                      </time>
                      <span className={`hist__status hist__status--${a.status.toLowerCase()}`}>
                        {STATUS_ROTULO[a.status]}
                      </span>
                      {a.finalizado && <span className="hist__selo">{a.supervisor ? 'Validado' : 'Finalizado'}</span>}
                    </div>
                    <p className="hist__meta">
                      <strong>{a.especialidade.nome}</strong> · {a.responsavel.nome}
                      {a.supervisor && ` (supervisão: ${a.supervisor.nome})`}
                    </p>
                    {a.descricao && (
                      <p className="hist__texto">
                        <span>Descrição</span>
                        {a.descricao}
                      </p>
                    )}
                    {a.conduta && (
                      <p className="hist__texto">
                        <span>Conduta</span>
                        {a.conduta}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {lista && <Paginacao meta={lista.meta} onPagina={setPage} />}
          </section>
        </>
      )}
    </Layout>
  )
}
