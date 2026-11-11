// Testes de integração: API + Postgres real (banco *_test, recriado a cada execução).
import type { Perfil } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { URL_TESTE } from '../test/preparar-banco.js'

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = URL_TESTE
process.env.JWT_SECRET = 'x'.repeat(40)

const { buildApp } = await import('./app.js')
const { prisma } = await import('./utils/prisma.js')
const { hashSenha } = await import('./utils/password.js')
const { inicioDoDiaLocal } = await import('./utils/agenda.js')

let app: Awaited<ReturnType<typeof buildApp>>
const ids = {} as Record<'admin' | 'recep' | 'prof' | 'prof2' | 'est' | 'p1' | 'p2' | 'esp' | 'esp2', string>

const auth = (quem: keyof typeof ids, perfil: Perfil, v = 0) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: ids[quem], perfil, v })}`,
})
const como = {
  admin: () => auth('admin', 'ADMIN'),
  recep: () => auth('recep', 'RECEPCAO'),
  prof: () => auth('prof', 'PROFISSIONAL'),
  prof2: () => auth('prof2', 'PROFISSIONAL'),
  est: () => auth('est', 'ESTUDANTE'),
}

/** Amanhã às HH:MM no fuso da clínica (sempre no futuro e dentro do horário do profissional). */
const amanhaAs = (h: number, m = 0) => new Date(inicioDoDiaLocal(new Date(), 1).getTime() + (h * 60 + m) * 60_000)

async function limparEPopular() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Auditoria", "Atendimento", "Horario", "Paciente", "Especialidade", "Usuario" RESTART IDENTITY CASCADE',
  )
  const senhaHash = await hashSenha('Senha1234')
  const esp = await prisma.especialidade.create({ data: { nome: 'Psicologia', nomeAtivoChave: 'psicologia' } })
  const esp2 = await prisma.especialidade.create({ data: { nome: 'Nutrição', nomeAtivoChave: 'nutricao' } })
  const todosOsDias = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({ diaSemana, inicio: '08:00', fim: '18:00' }))
  const u = (nome: string, perfil: Perfil, extra = {}) =>
    prisma.usuario.create({ data: { nome, email: `${nome.toLowerCase()}@t.local`, perfil, senhaHash, ...extra } })

  const [admin, recep, prof, prof2, est] = await Promise.all([
    u('Admin', 'ADMIN'),
    u('Recep', 'RECEPCAO'),
    u('Prof', 'PROFISSIONAL', { especialidades: { connect: { id: esp.id } }, horarios: { create: todosOsDias } }),
    u('Prof2', 'PROFISSIONAL', { especialidades: { connect: { id: esp2.id } }, horarios: { create: todosOsDias } }),
    u('Est', 'ESTUDANTE'),
  ])
  const nasc = new Date('1990-01-01T00:00:00Z')
  const p1 = await prisma.paciente.create({
    data: { nome: 'Paciente Um', dataNascimento: nasc, cpf: '52998224725', telefone: '86999990000', endereco: 'Rua A' },
  })
  const p2 = await prisma.paciente.create({ data: { nome: 'Paciente Dois', dataNascimento: nasc, telefone: '86988880000' } })
  Object.assign(ids, {
    admin: admin.id, recep: recep.id, prof: prof.id, prof2: prof2.id, est: est.id,
    p1: p1.id, p2: p2.id, esp: esp.id, esp2: esp2.id,
  })
}

const agendar = (headers: Record<string, string>, corpo: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: '/atendimentos',
    headers,
    payload: { especialidadeId: ids.esp, status: 'AGENDADO', ...corpo },
  })

beforeAll(async () => {
  app = await buildApp()
})
afterAll(async () => {
  await app.close()
  await prisma.$disconnect()
})
beforeEach(limparEPopular)

describe('agenda', () => {
  it('não deixa o mesmo paciente em duas consultas no mesmo horário', async () => {
    const t = amanhaAs(10).toISOString()
    const a = await agendar(como.recep(), { pacienteId: ids.p1, responsavelId: ids.prof, dataHora: t })
    expect(a.statusCode).toBe(201)

    const b = await agendar(como.recep(), {
      pacienteId: ids.p1,
      responsavelId: ids.est,
      supervisorId: ids.prof,
      dataHora: amanhaAs(10, 15).toISOString(),
    })
    expect(b.statusCode).toBe(409)
    expect(b.json().error).toBe('PACIENTE_HORARIO_OCUPADO')
  })

  it('agendamentos simultâneos no mesmo horário: só um passa', async () => {
    const t = amanhaAs(11).toISOString()
    const respostas = await Promise.all([
      agendar(como.recep(), { pacienteId: ids.p1, responsavelId: ids.prof, dataHora: t }),
      agendar(como.admin(), { pacienteId: ids.p2, responsavelId: ids.prof, dataHora: t }),
    ])
    expect(respostas.map((r) => r.statusCode).sort()).toEqual([201, 409])
    expect(await prisma.atendimento.count()).toBe(1)
  })

  it('cancelar libera o horário', async () => {
    const t = amanhaAs(14).toISOString()
    const a = await agendar(como.recep(), { pacienteId: ids.p1, responsavelId: ids.prof, dataHora: t })
    const cancelado = await app.inject({
      method: 'PUT',
      url: `/atendimentos/${a.json().id}`,
      headers: como.recep(),
      payload: { pacienteId: ids.p1, especialidadeId: ids.esp, dataHora: t, status: 'CANCELADO' },
    })
    expect(cancelado.statusCode).toBe(200)
    const b = await agendar(como.recep(), { pacienteId: ids.p2, responsavelId: ids.prof, dataHora: t })
    expect(b.statusCode).toBe(201)
  })
})

describe('supervisão de estudantes', () => {
  const registrar = (supervisorId?: string) =>
    app.inject({
      method: 'POST',
      url: '/atendimentos',
      headers: como.est(),
      payload: {
        pacienteId: ids.p1,
        especialidadeId: ids.esp,
        dataHora: new Date(Date.now() - 3_600_000).toISOString(),
        status: 'REALIZADO',
        descricao: 'Primeira sessão',
        ...(supervisorId && { supervisorId }),
      },
    })

  it('exige supervisor da especialidade', async () => {
    expect((await registrar()).json().error).toBe('SUPERVISOR_OBRIGATORIO')
    expect((await registrar(ids.prof2)).json().error).toBe('SUPERVISOR_INVALIDO')
  })

  it('supervisor vê, revisa e valida; estudante e outro profissional não', async () => {
    const r = await registrar(ids.prof)
    expect(r.statusCode).toBe(201)
    const id = r.json().id

    const pendentes = await app.inject({ method: 'GET', url: '/atendimentos?pendentesRevisao=true', headers: como.prof() })
    expect(pendentes.json().data.map((a: { id: string }) => a.id)).toEqual([id])

    const outro = await app.inject({ method: 'PATCH', url: `/atendimentos/${id}/finalizar`, headers: como.prof2() })
    expect(outro.statusCode).toBe(404)
    const est = await app.inject({ method: 'PATCH', url: `/atendimentos/${id}/finalizar`, headers: como.est() })
    expect(est.statusCode).toBe(403)

    const ok = await app.inject({ method: 'PATCH', url: `/atendimentos/${id}/finalizar`, headers: como.prof() })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toMatchObject({ finalizado: true, supervisor: { id: ids.prof }, responsavel: { id: ids.est } })
  })
})

describe('privacidade de pacientes', () => {
  it('estudante vê dados mínimos e CPF mascarado; completos só de quem atendeu', async () => {
    const lista = await app.inject({ method: 'GET', url: '/pacientes', headers: como.est() })
    const p1 = lista.json().data.find((p: { id: string }) => p.id === ids.p1)
    expect(p1).toMatchObject({ cpf: '***.982.247-**', telefone: null, endereco: null, restrito: true })

    const porCpf = await app.inject({ method: 'GET', url: '/pacientes?busca=529982', headers: como.est() })
    expect(porCpf.json().data).toHaveLength(0)

    await app.inject({
      method: 'POST',
      url: '/atendimentos',
      headers: como.est(),
      payload: {
        pacienteId: ids.p1,
        especialidadeId: ids.esp,
        supervisorId: ids.prof,
        dataHora: new Date(Date.now() - 3_600_000).toISOString(),
        status: 'REALIZADO',
      },
    })
    const atendido = await app.inject({ method: 'GET', url: `/pacientes/${ids.p1}`, headers: como.est() })
    expect(atendido.json()).toMatchObject({ cpf: '52998224725', telefone: '86999990000' })
    const outro = await app.inject({ method: 'GET', url: `/pacientes/${ids.p2}`, headers: como.est() })
    expect(outro.json()).toMatchObject({ telefone: null, restrito: true })

    const recep = await app.inject({ method: 'GET', url: `/pacientes/${ids.p2}`, headers: como.recep() })
    expect(recep.json().telefone).toBe('86988880000')
  })
})

describe('sessão', () => {
  it('inativar derruba a sessão na hora', async () => {
    expect((await app.inject({ method: 'GET', url: '/pacientes', headers: como.recep() })).statusCode).toBe(200)
    await app.inject({ method: 'PATCH', url: `/usuarios/${ids.recep}/inativar`, headers: como.admin() })
    expect((await app.inject({ method: 'GET', url: '/pacientes', headers: como.recep() })).statusCode).toBe(401)
  })

  it('redefinir a senha invalida tokens antigos; o novo login funciona', async () => {
    await app.inject({
      method: 'POST',
      url: `/alunos/${ids.est}/redefinir-senha`,
      headers: como.admin(),
      payload: { senha: 'NovaSenha9' },
    })
    expect((await app.inject({ method: 'GET', url: '/auth/me', headers: como.est() })).statusCode).toBe(401)

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'est@t.local', senha: 'NovaSenha9' },
    })
    expect(login.statusCode).toBe(200)
    const cookie = login.cookies.find((c) => c.name === 'clinica_sessao')!
    const me = await app.inject({ method: 'GET', url: '/auth/me', cookies: { clinica_sessao: cookie.value } })
    expect(me.statusCode).toBe(200)
  })

  it('trocar a própria senha mantém esta sessão (cookie novo)', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/auth/trocar-senha',
      headers: como.recep(),
      payload: { senhaAtual: 'Senha1234', novaSenha: 'Trocada123' },
    })
    expect(r.statusCode).toBe(204)
    const cookie = r.cookies.find((c) => c.name === 'clinica_sessao')!
    expect((await app.inject({ method: 'GET', url: '/auth/me', cookies: { clinica_sessao: cookie.value } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/auth/me', headers: como.recep() })).statusCode).toBe(401)
  })
})

describe('painel, relatórios e auditoria', () => {
  it('consolida números e filtra auditoria por usuário', async () => {
    await agendar(como.recep(), { pacienteId: ids.p1, responsavelId: ids.prof, dataHora: amanhaAs(9).toISOString() })
    await app.inject({
      method: 'POST',
      url: '/atendimentos',
      headers: como.prof(),
      payload: {
        pacienteId: ids.p2,
        especialidadeId: ids.esp,
        dataHora: new Date(Date.now() - 3_600_000).toISOString(),
        status: 'FALTOU',
      },
    })

    const painel = await app.inject({ method: 'GET', url: '/painel', headers: como.prof() })
    expect(painel.json().indicadores).toMatchObject({ proximos7dias: 1, faltas7dias: 1, pendentes: 1 })
    expect(painel.json().proximas).toHaveLength(1)

    // Padrão = últimos 30 dias até hoje; estende até amanhã para incluir a consulta agendada.
    const amanha = amanhaAs(12).toISOString().slice(0, 10)
    const rel = await app.inject({ method: 'GET', url: `/relatorios?ate=${amanha}`, headers: como.admin() })
    expect(rel.json().totais).toMatchObject({ total: 2, AGENDADO: 1, FALTOU: 1, taxaFaltas: 100 })
    expect(rel.json().porEspecialidade[0]).toMatchObject({ nome: 'Psicologia', total: 2 })

    const aud = await app.inject({ method: 'GET', url: `/auditoria?usuarioId=${ids.recep}`, headers: como.admin() })
    expect(aud.json().data).toHaveLength(1)
    expect(aud.json().data[0]).toMatchObject({ acao: 'CRIAR', usuario: { nome: 'Recep' } })

    const opcoes = await app.inject({ method: 'GET', url: '/auditoria/opcoes', headers: como.admin() })
    expect(opcoes.json().usuarios.map((u: { nome: string }) => u.nome)).toEqual(['Prof', 'Recep'])
  })
})
