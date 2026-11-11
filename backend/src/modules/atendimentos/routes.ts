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
// Status que ocupam o horário do responsável e do paciente.
const OCUPAM_HORARIO: Status[] = ['AGENDADO', 'REALIZADO']

export const INCLUIR = {
  paciente: { select: { id: true, nome: true } },
  especialidade: { select: { id: true, nome: true } },
  responsavel: { select: { id: true, nome: true, perfil: true } },
  supervisor: { select: { id: true, nome: true } },
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
  // Atendimentos de estudantes já registrados e ainda não validados pelo supervisor.
  pendentesRevisao: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
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
  // Obrigatório quando o responsável é estudante: o profissional que valida o atendimento.
  supervisorId: z
    .string()
    .uuid('Selecione o supervisor.')
    .nullish()
    .or(z.literal('').transform(() => null)),
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

const veTudo = (req: FastifyRequest) => VEEM_TUDO.includes(req.user.perfil)

/**
 * O que cada perfil enxerga: ADMIN/RECEPCAO tudo; PROFISSIONAL os próprios e os que supervisiona;
 * ESTUDANTE só os próprios.
 */
export function escopoVisivel(req: FastifyRequest): Prisma.AtendimentoWhereInput {
  if (veTudo(req)) return {}
  if (req.user.perfil === 'PROFISSIONAL') {
    return { OR: [{ responsavelId: req.user.sub }, { supervisorId: req.user.sub }] }
  }
  return { responsavelId: req.user.sub }
}

async function buscar(req: FastifyRequest, id: string) {
  // Fora do escopo responde 404 para não vazar a existência.
  const a = await prisma.atendimento.findFirst({ where: { id, ...escopoVisivel(req) }, include: INCLUIR })
  if (!a) throw new AppError(404, 'Atendimento não encontrado.', 'NAO_ENCONTRADO')
  return a
}

interface Vinculos {
  responsavelId: string
  supervisorId: string | null
}

/** Confere paciente/especialidade ativos, resolve responsável e supervisor e valida a agenda do responsável. */
async function validarVinculos(
  req: FastifyRequest,
  c: Corpo,
  atual?: { responsavelId: string; supervisorId: string | null },
): Promise<Vinculos> {
  const [paciente, especialidade] = await Promise.all([
    prisma.paciente.findUnique({ where: { id: c.pacienteId }, select: { ativo: true } }),
    prisma.especialidade.findUnique({ where: { id: c.especialidadeId }, select: { ativa: true } }),
  ])
  if (!paciente) throw new AppError(404, 'Paciente não encontrado.', 'PACIENTE_NAO_ENCONTRADO')
  if (!paciente.ativo) throw new AppError(422, 'Paciente inativo.', 'PACIENTE_INATIVO')
  if (!especialidade) throw new AppError(404, 'Especialidade não encontrada.', 'ESPECIALIDADE_NAO_ENCONTRADA')
  if (!especialidade.ativa) throw new AppError(422, 'Especialidade inativa.', 'ESPECIALIDADE_INATIVA')

  const responsavelId = await resolverResponsavel(req, c, atual?.responsavelId)
  const perfilResp = await checarEspecialidadeDoResponsavel(responsavelId, c.especialidadeId)
  const supervisorId = await resolverSupervisor(perfilResp, c, atual?.supervisorId ?? null)
  if (c.status === 'AGENDADO') await checarHorarioDoResponsavel(responsavelId, c.dataHora)
  return { responsavelId, supervisorId }
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

/** Profissional só atende nas especialidades em que atua (estudante não tem vínculo). Devolve o perfil. */
async function checarEspecialidadeDoResponsavel(responsavelId: string, especialidadeId: string) {
  const r = await prisma.usuario.findUnique({
    where: { id: responsavelId },
    select: { perfil: true, especialidades: { where: { id: especialidadeId }, select: { id: true } } },
  })
  if (r?.perfil === 'PROFISSIONAL' && r.especialidades.length === 0) {
    throw new AppError(422, 'O profissional responsável não atende esta especialidade.', 'ESPECIALIDADE_DO_PROFISSIONAL')
  }
  return r?.perfil
}

/**
 * Atendimento de estudante exige um supervisor: profissional ativo que atue na especialidade.
 * Atendimento de profissional não tem supervisor.
 */
async function resolverSupervisor(perfilResponsavel: Perfil | undefined, c: Corpo, atual: string | null) {
  if (perfilResponsavel !== 'ESTUDANTE') return null
  const id = c.supervisorId === undefined ? atual : c.supervisorId
  if (!id) throw new AppError(422, 'Selecione o profissional supervisor.', 'SUPERVISOR_OBRIGATORIO')
  const sup = await prisma.usuario.findFirst({
    where: { id, ativo: true, perfil: 'PROFISSIONAL', especialidades: { some: { id: c.especialidadeId } } },
    select: { id: true },
  })
  if (!sup) {
    throw new AppError(422, 'O supervisor precisa ser um profissional ativo desta especialidade.', 'SUPERVISOR_INVALIDO')
  }
  return sup.id
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

/**
 * Serializa gravações que disputam a agenda do mesmo responsável ou paciente.
 * O lock dura até o fim da transação; as chaves vão em ordem para não haver deadlock.
 */
async function travarAgendas(tx: Prisma.TransactionClient, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) {
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${`agenda:${id}`}))) AS t`
  }
}

/** Nem o responsável nem o paciente podem ter duas consultas sobrepostas (duração padrão). */
async function checarConflitos(
  tx: Prisma.TransactionClient,
  alvo: { responsavelId: string; pacienteId: string; dataHora: Date; status: Status },
  ignorarId?: string,
) {
  if (!OCUPAM_HORARIO.includes(alvo.status)) return
  const janela = DURACAO_CONSULTA_MIN * 60_000
  const base: Prisma.AtendimentoWhereInput = {
    status: { in: OCUPAM_HORARIO },
    dataHora: { gt: new Date(alvo.dataHora.getTime() - janela), lt: new Date(alvo.dataHora.getTime() + janela) },
    ...(ignorarId && { id: { not: ignorarId } }),
  }
  const [doResponsavel, doPaciente] = await Promise.all([
    tx.atendimento.findFirst({ where: { ...base, responsavelId: alvo.responsavelId }, select: { id: true } }),
    tx.atendimento.findFirst({ where: { ...base, pacienteId: alvo.pacienteId }, select: { id: true } }),
  ])
  if (doResponsavel) {
    throw new AppError(409, 'O responsável já tem uma consulta nesse horário.', 'HORARIO_OCUPADO')
  }
  if (doPaciente) {
    throw new AppError(409, 'O paciente já tem uma consulta nesse horário.', 'PACIENTE_HORARIO_OCUPADO')
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
    const { pacienteId, especialidadeId, responsavelId, status, de, ate, ordem, pendentesRevisao, ...pag } =
      listaSchema.parse(req.query)
    const where: Prisma.AtendimentoWhereInput = {
      AND: [
        escopoVisivel(req),
        {
          pacienteId,
          especialidadeId,
          status,
          // Perfis restritos não filtram por outro responsável (o escopo já limita).
          ...(veTudo(req) && { responsavelId }),
          ...((de || ate) && { dataHora: { gte: de, lte: ate } }),
          ...(pendentesRevisao && {
            finalizado: false,
            status: { not: 'AGENDADO' },
            supervisorId: req.user.perfil === 'PROFISSIONAL' ? req.user.sub : { not: null },
          }),
        },
      ],
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
    const { responsavelId, supervisorId } = await validarVinculos(req, c)

    const criado = await prisma.$transaction(async (tx) => {
      await travarAgendas(tx, [responsavelId, c.pacienteId])
      await checarConflitos(tx, { responsavelId, pacienteId: c.pacienteId, dataHora: c.dataHora, status: c.status })
      const a = await tx.atendimento.create({
        data: {
          pacienteId: c.pacienteId,
          especialidadeId: c.especialidadeId,
          responsavelId,
          supervisorId,
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

  // Atendimento finalizado não pode mais ser editado. O supervisor pode revisar o registro do estudante.
  app.put('/:id', { preHandler: [todos] }, async (req) => {
    const { id } = idSchema.parse(req.params)
    const antes = await buscar(req, id)
    if (antes.finalizado) throw new AppError(409, 'Atendimento finalizado não pode ser editado.', 'ATENDIMENTO_FINALIZADO')
    const c = restringirRecepcao(req, corpoSchema.parse(req.body), antes)
    validarDataStatus(c, antes.dataHora)
    const { responsavelId, supervisorId } = await validarVinculos(req, c, antes)

    return prisma.$transaction(async (tx) => {
      await travarAgendas(tx, [responsavelId, c.pacienteId])
      await checarConflitos(tx, { responsavelId, pacienteId: c.pacienteId, dataHora: c.dataHora, status: c.status }, id)
      const depois = await tx.atendimento.update({
        where: { id },
        data: {
          pacienteId: c.pacienteId,
          especialidadeId: c.especialidadeId,
          responsavelId,
          supervisorId,
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

  // Finalizar = validar. Atendimento de estudante só o supervisor (ou ADMIN) finaliza.
  app.patch('/:id/finalizar', { preHandler: [authorize('ADMIN', 'PROFISSIONAL')] }, async (req) => {
    const { id } = idSchema.parse(req.params)
    const antes = await buscar(req, id)
    if (antes.finalizado) throw new AppError(409, 'Atendimento já finalizado.', 'ATENDIMENTO_FINALIZADO')
    if (antes.status === 'AGENDADO') {
      throw new AppError(422, 'Registre o atendimento (realizado, faltou ou cancelado) antes de finalizar.', 'AINDA_AGENDADO')
    }
    if (req.user.perfil === 'PROFISSIONAL' && antes.supervisorId && antes.supervisorId !== req.user.sub) {
      throw new AppError(403, 'Somente o supervisor pode validar este atendimento.', 'PROIBIDO')
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
