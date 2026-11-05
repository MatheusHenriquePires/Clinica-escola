// Dono: Daniel (atendimentos)
import type { Perfil, Prisma } from '@prisma/client'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'
import { cabeNasFaixas, DURACAO_CONSULTA_MIN } from '../../utils/agenda.js'
import { AppError } from '../../utils/errors.js'
import { paginacaoSchema, paginado, toSkipTake } from '../../utils/pagination.js'
import { prisma } from '../../utils/prisma.js'
import { registrarAuditoria } from '../auditoria/service.js'

const STATUS = ['AGENDADO', 'REALIZADO', 'CANCELADO', 'FALTOU'] as const
type Status = (typeof STATUS)[number]

const VEEM_TUDO: Perfil[] = ['ADMIN', 'RECEPCAO']
// Quem escolhe o responsável ao agendar/registrar; os demais são sempre o próprio responsável.
const ESCOLHEM_RESPONSAVEL: Perfil[] = ['ADMIN', 'RECEPCAO']
// A recepção só cuida da agenda: marca, remarca e cancela. Não registra o atendimento clínico.
const STATUS_RECEPCAO: Status[] = ['AGENDADO', 'CANCELADO']
// Status que ocupam o horário do responsável.
const OCUPAM_HORARIO: Status[] = ['AGENDADO', 'REALIZADO']

const INCLUIR = {
  paciente: { select: { id: true, nome: true } },
  especialidade: { select: { id: true, nome: true } },
  responsavel: { select: { id: true, nome: true, perfil: true } },
} as const

const data = (campo: string) =>
  z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), `${campo} inválida.`)
    .transform((v) => new Date(v))

const listaSchema = paginacaoSchema.extend({
  pacienteId: z.string().uuid().optional(),
  especialidadeId: z.string().uuid().optional(),
  responsavelId: z.string().uuid().optional(),
  status: z.enum(STATUS).optional(),
  de: data('Data inicial').optional(),
  ate: data('Data final').optional(),
  ordem: z.enum(['asc', 'desc']).default('desc'),
})

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null)

const corpoSchema = z.object({
  pacienteId: z.string().uuid('Selecione o paciente.'),
  especialidadeId: z.string().uuid('Selecione a especialidade.'),
  responsavelId: z.string().uuid().optional(),
  dataHora: data('Data e hora'),
  status: z.enum(STATUS).default('REALIZADO'),
  descricao: texto(4000),
  conduta: texto(4000),
})
type Corpo = z.infer<typeof corpoSchema>
const idSchema = z.object({ id: z.string().uuid() })

const TOLERANCIA_MS = 5 * 60_000

/** Realizado não pode estar no futuro; agendamento novo (ou remarcado) não pode estar no passado. */
function validarDataStatus(c: Corpo, dataAnterior?: Date) {
  const t = c.dataHora.getTime()
  if (c.status === 'REALIZADO' && t > Date.now() + TOLERANCIA_MS) {
    throw new AppError(422, 'Um atendimento realizado não pode ter data futura.', 'DATA_FUTURA')
  }
  const remarcou = !dataAnterior || dataAnterior.getTime() !== t
  if (c.status === 'AGENDADO' && remarcou && t < Date.now() - TOLERANCIA_MS) {
    throw new AppError(422, 'Não é possível agendar uma consulta no passado.', 'DATA_PASSADA')
  }
}

const restrito = (req: FastifyRequest) => !VEEM_TUDO.includes(req.user.perfil)

async function buscar(req: FastifyRequest, id: string) {
  const a = await prisma.atendimento.findUnique({ where: { id }, include: INCLUIR })
  // Perfis restritos só enxergam os próprios; responde 404 para não vazar a existência.
  if (!a || (restrito(req) && a.responsavelId !== req.user.sub)) {
    throw new AppError(404, 'Atendimento não encontrado.', 'NAO_ENCONTRADO')
  }
  return a
}

/** Confere paciente/especialidade ativos, resolve o responsável e valida a agenda dele. */
async function validarVinculos(req: FastifyRequest, c: Corpo, ignorarId?: string, responsavelAtual?: string) {
  const [paciente, especialidade] = await Promise.all([
    prisma.paciente.findUnique({ where: { id: c.pacienteId }, select: { ativo: true } }),
    prisma.especialidade.findUnique({ where: { id: c.especialidadeId }, select: { ativa: true } }),
  ])
  if (!paciente) throw new AppError(404, 'Paciente não encontrado.', 'PACIENTE_NAO_ENCONTRADO')
  if (!paciente.ativo) throw new AppError(422, 'Paciente inativo.', 'PACIENTE_INATIVO')
  if (!especialidade) throw new AppError(404, 'Especialidade não encontrada.', 'ESPECIALIDADE_NAO_ENCONTRADA')
  if (!especialidade.ativa) throw new AppError(422, 'Especialidade inativa.', 'ESPECIALIDADE_INATIVA')

  const id = await resolverResponsavel(req, c, responsavelAtual)
  await checarEspecialidadeDoResponsavel(id, c.especialidadeId)
  if (c.status === 'AGENDADO') await checarHorarioDoResponsavel(id, c.dataHora)
  if (OCUPAM_HORARIO.includes(c.status)) await checarConflito(id, c.dataHora, ignorarId)
  return id
}

async function resolverResponsavel(req: FastifyRequest, c: Corpo, responsavelAtual?: string) {
  if (!ESCOLHEM_RESPONSAVEL.includes(req.user.perfil)) return responsavelAtual ?? req.user.sub
  const id = c.responsavelId ?? responsavelAtual
  if (!id) throw new AppError(422, 'Selecione o profissional responsável.', 'RESPONSAVEL_OBRIGATORIO')
  if (id === responsavelAtual) return id
  const resp = await prisma.usuario.findFirst({
    where: { id, ativo: true, perfil: { in: ['PROFISSIONAL', 'ESTUDANTE'] } },
    select: { id: true },
  })
  if (!resp) throw new AppError(422, 'Responsável inválido ou inativo.', 'RESPONSAVEL_INVALIDO')
  return resp.id
}

/** Profissional só atende nas especialidades em que atua (estudante não tem vínculo). */
async function checarEspecialidadeDoResponsavel(responsavelId: string, especialidadeId: string) {
  const r = await prisma.usuario.findUnique({
    where: { id: responsavelId },
    select: { perfil: true, especialidades: { where: { id: especialidadeId }, select: { id: true } } },
  })
  if (r?.perfil === 'PROFISSIONAL' && r.especialidades.length === 0) {
    throw new AppError(422, 'O profissional responsável não atende esta especialidade.', 'ESPECIALIDADE_DO_PROFISSIONAL')
  }
}

/** Consulta agendada com profissional precisa caber nos horários de atendimento dele. */
async function checarHorarioDoResponsavel(responsavelId: string, dataHora: Date) {
  const r = await prisma.usuario.findUnique({
    where: { id: responsavelId },
    select: { perfil: true, horarios: { select: { diaSemana: true, inicio: true, fim: true } } },
  })
  if (r?.perfil !== 'PROFISSIONAL') return
  if (r.horarios.length === 0) {
    throw new AppError(422, 'O profissional ainda não cadastrou seus horários de atendimento.', 'SEM_HORARIOS')
  }
  if (!cabeNasFaixas(dataHora, r.horarios)) {
    throw new AppError(422, 'Fora dos horários de atendimento do profissional.', 'FORA_DO_HORARIO')
  }
}

/** Duas consultas do mesmo responsável não podem se sobrepor (duração padrão). */
async function checarConflito(responsavelId: string, dataHora: Date, ignorarId?: string) {
  const janela = DURACAO_CONSULTA_MIN * 60_000
  const outro = await prisma.atendimento.findFirst({
    where: {
      responsavelId,
      status: { in: OCUPAM_HORARIO },
      dataHora: { gt: new Date(dataHora.getTime() - janela), lt: new Date(dataHora.getTime() + janela) },
      ...(ignorarId && { id: { not: ignorarId } }),
    },
    select: { id: true },
  })
  if (outro) {
    throw new AppError(409, 'O responsável já tem uma consulta nesse horário.', 'HORARIO_OCUPADO')
  }
}

/** Recepção só agenda/cancela e não mexe no registro clínico. */
function restringirRecepcao(req: FastifyRequest, c: Corpo, antes?: { status: Status; descricao: string | null; conduta: string | null }) {
  if (req.user.perfil !== 'RECEPCAO') return c
  if (!STATUS_RECEPCAO.includes(c.status)) {
    throw new AppError(403, 'A recepção só pode agendar ou cancelar consultas.', 'PROIBIDO')
  }
  if (antes && antes.status !== 'AGENDADO') {
    throw new AppError(403, 'A recepção só pode alterar consultas agendadas.', 'PROIBIDO')
  }
  return { ...c, descricao: antes?.descricao ?? null, conduta: antes?.conduta ?? null }
}

export async function atendimentosRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  const todos = authorize('ADMIN', 'RECEPCAO', 'PROFISSIONAL', 'ESTUDANTE')

  app.get('/', { preHandler: [todos] }, async (req) => {
    const { pacienteId, especialidadeId, responsavelId, status, de, ate, ordem, ...pag } = listaSchema.parse(req.query)
    const where: Prisma.AtendimentoWhereInput = {
      pacienteId,
      especialidadeId,
      status,
      // Perfis restritos sempre veem só os próprios (o filtro informado é ignorado).
      responsavelId: restrito(req) ? req.user.sub : responsavelId,
      ...((de || ate) && { dataHora: { gte: de, lte: ate } }),
    }
    const [lista, total] = await Promise.all([
      prisma.atendimento.findMany({
        where,
        include: INCLUIR,
        orderBy: [{ dataHora: ordem }, { createdAt: ordem }],
        ...toSkipTake(pag),
      }),
      prisma.atendimento.count({ where }),
    ])
    return paginado(lista, total, pag)
  })

  app.get('/:id', { preHandler: [todos] }, async (req) => buscar(req, idSchema.parse(req.params).id))

  app.post('/', { preHandler: [todos] }, async (req, reply) => {
    const c = restringirRecepcao(req, corpoSchema.parse(req.body))
    validarDataStatus(c)
    const responsavelId = await validarVinculos(req, c)

    const criado = await prisma.$transaction(async (tx) => {
      const a = await tx.atendimento.create({
        data: {
          pacienteId: c.pacienteId,
          especialidadeId: c.especialidadeId,
          responsavelId,
          dataHora: c.dataHora,
          status: c.status,
          descricao: c.descricao,
          conduta: c.conduta,
          createdBy: req.user.sub,
        },
        include: INCLUIR,
      })
      await registrarAuditoria(
        { usuarioId: req.user.sub, entidade: 'Atendimento', entidadeId: a.id, acao: 'CRIAR', dadosDepois: a },
        tx,
      )
      return a
    })
    return reply.status(201).send(criado)
  })

  // Atendimento finalizado não pode mais ser editado.
  app.put('/:id', { preHandler: [todos] }, async (req) => {
    const { id } = idSchema.parse(req.params)
    const antes = await buscar(req, id)
    if (antes.finalizado) throw new AppError(409, 'Atendimento finalizado não pode ser editado.', 'ATENDIMENTO_FINALIZADO')
    const c = restringirRecepcao(req, corpoSchema.parse(req.body), antes)
    validarDataStatus(c, antes.dataHora)
    const responsavelId = await validarVinculos(req, c, id, antes.responsavelId)

    return prisma.$transaction(async (tx) => {
      const depois = await tx.atendimento.update({
        where: { id },
        data: {
          pacienteId: c.pacienteId,
          especialidadeId: c.especialidadeId,
          responsavelId,
          dataHora: c.dataHora,
          status: c.status,
          descricao: c.descricao,
          conduta: c.conduta,
        },
        include: INCLUIR,
      })
      await registrarAuditoria(
        { usuarioId: req.user.sub, entidade: 'Atendimento', entidadeId: id, acao: 'ATUALIZAR', dadosAntes: antes, dadosDepois: depois },
        tx,
      )
      return depois
    })
  })

  app.patch('/:id/finalizar', { preHandler: [authorize('ADMIN', 'PROFISSIONAL')] }, async (req) => {
    const { id } = idSchema.parse(req.params)
    const antes = await buscar(req, id)
    if (antes.finalizado) throw new AppError(409, 'Atendimento já finalizado.', 'ATENDIMENTO_FINALIZADO')
    if (antes.status === 'AGENDADO') {
      throw new AppError(422, 'Registre o atendimento (realizado, faltou ou cancelado) antes de finalizar.', 'AINDA_AGENDADO')
    }
    return prisma.$transaction(async (tx) => {
      const depois = await tx.atendimento.update({ where: { id }, data: { finalizado: true }, include: INCLUIR })
      await registrarAuditoria(
        { usuarioId: req.user.sub, entidade: 'Atendimento', entidadeId: id, acao: 'FINALIZAR', dadosAntes: antes, dadosDepois: depois },
        tx,
      )
      return depois
    })
  })
}
