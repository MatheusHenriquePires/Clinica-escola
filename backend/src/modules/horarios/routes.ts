// Disponibilidade semanal dos profissionais (faixas de horário por dia da semana).
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'
import { DURACAO_CONSULTA_MIN, HHMM, paraMinutos } from '../../utils/agenda.js'
import { AppError } from '../../utils/errors.js'
import { prisma } from '../../utils/prisma.js'
import { registrarAuditoria } from '../auditoria/service.js'

const SELECAO = { id: true, diaSemana: true, inicio: true, fim: true } as const
const ORDEM = [{ diaSemana: 'asc' as const }, { inicio: 'asc' as const }]

const consultaSchema = z.object({ profissionalId: z.string().uuid().optional() })

const faixaSchema = z
  .object({
    diaSemana: z.number().int().min(0).max(6),
    inicio: z.string().regex(HHMM, 'Horário inválido (use HH:MM).'),
    fim: z.string().regex(HHMM, 'Horário inválido (use HH:MM).'),
  })
  .refine((f) => paraMinutos(f.fim) - paraMinutos(f.inicio) >= DURACAO_CONSULTA_MIN, {
    message: `O fim deve ser ao menos ${DURACAO_CONSULTA_MIN} minutos depois do início.`,
    path: ['fim'],
  })

const salvarSchema = z.object({
  profissionalId: z.string().uuid().optional(),
  faixas: z.array(faixaSchema).max(50),
})

type FaixaEntrada = z.infer<typeof faixaSchema>

/** Faixas do mesmo dia não podem se sobrepor. */
function checarSobreposicao(faixas: FaixaEntrada[]) {
  const ordenadas = [...faixas].sort(
    (a, b) => a.diaSemana - b.diaSemana || paraMinutos(a.inicio) - paraMinutos(b.inicio),
  )
  for (let i = 1; i < ordenadas.length; i++) {
    const ant = ordenadas[i - 1]!
    const atual = ordenadas[i]!
    if (ant.diaSemana === atual.diaSemana && paraMinutos(atual.inicio) < paraMinutos(ant.fim)) {
      throw new AppError(422, 'Há faixas de horário sobrepostas no mesmo dia.', 'HORARIOS_SOBREPOSTOS')
    }
  }
}

/** PROFISSIONAL só mexe nos próprios horários; ADMIN/RECEPCAO informam de qual profissional. */
async function resolverProfissional(req: FastifyRequest, informado?: string) {
  if (req.user.perfil === 'PROFISSIONAL') return req.user.sub
  if (!informado) throw new AppError(422, 'Selecione o profissional.', 'PROFISSIONAL_OBRIGATORIO')
  const p = await prisma.usuario.findFirst({ where: { id: informado, perfil: 'PROFISSIONAL' }, select: { id: true } })
  if (!p) throw new AppError(404, 'Profissional não encontrado.', 'NAO_ENCONTRADO')
  return p.id
}

export async function horariosRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  // Recepção consulta para saber quando agendar; só ADMIN e o próprio profissional alteram.
  app.get('/', { preHandler: [authorize('ADMIN', 'RECEPCAO', 'PROFISSIONAL')] }, async (req) => {
    const { profissionalId } = consultaSchema.parse(req.query)
    const id = await resolverProfissional(req, profissionalId)
    return prisma.horario.findMany({ where: { profissionalId: id }, select: SELECAO, orderBy: ORDEM })
  })

  // Substitui a semana inteira de uma vez (o formulário envia todas as faixas).
  app.put('/', { preHandler: [authorize('ADMIN', 'PROFISSIONAL')] }, async (req) => {
    const { profissionalId, faixas } = salvarSchema.parse(req.body)
    const id = await resolverProfissional(req, profissionalId)
    checarSobreposicao(faixas)

    const antes = await prisma.horario.findMany({ where: { profissionalId: id }, select: SELECAO, orderBy: ORDEM })
    return prisma.$transaction(async (tx) => {
      await tx.horario.deleteMany({ where: { profissionalId: id } })
      await tx.horario.createMany({ data: faixas.map((f) => ({ ...f, profissionalId: id })) })
      const depois = await tx.horario.findMany({ where: { profissionalId: id }, select: SELECAO, orderBy: ORDEM })
      await registrarAuditoria(
        {
          usuarioId: req.user.sub,
          entidade: 'Horario',
          entidadeId: id,
          acao: 'ATUALIZAR',
          dadosAntes: { faixas: antes },
          dadosDepois: { faixas: depois },
        },
        tx,
      )
      return depois
    })
  })
}
