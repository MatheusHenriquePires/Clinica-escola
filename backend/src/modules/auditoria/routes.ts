// Dono: Otávio (especialidades/auditoria)
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'
import { paginacaoSchema, paginado, toSkipTake } from '../../utils/pagination.js'
import { prisma } from '../../utils/prisma.js'

// Datas em ISO 8601. Com hora e fuso (ex.: 2026-11-01T00:00:00-03:00) o período é exato;
// só a data (2026-11-01) é interpretada como meia-noite UTC.
const dataSchema = z.coerce.date({ errorMap: () => ({ message: 'Data inválida (use o formato ISO 8601).' }) })

export const filtroAuditoriaSchema = paginacaoSchema
  .extend({
    entidade: z.string().optional(),
    entidadeId: z.string().optional(),
    usuarioId: z.string().uuid('Usuário inválido.').optional(),
    acao: z.string().optional(),
    de: dataSchema.optional(),
    ate: dataSchema.optional(),
  })
  .refine((f) => !f.de || !f.ate || f.de <= f.ate, {
    message: 'A data inicial deve ser anterior ou igual à final.',
    path: ['ate'],
  })

export async function auditoriaRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  // Somente leitura: auditoria nunca é alterada ou excluída via API.
  app.get('/', { preHandler: [authorize('ADMIN')] }, async (req) => {
    const { entidade, entidadeId, usuarioId, acao, de, ate, ...pag } = filtroAuditoriaSchema.parse(req.query)
    const where = {
      entidade,
      entidadeId,
      usuarioId,
      acao,
      ...((de || ate) && { createdAt: { gte: de, lte: ate } }),
    }
    const [data, total] = await Promise.all([
      prisma.auditoria.findMany({
        where,
        include: { usuario: { select: { id: true, nome: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(pag),
      }),
      prisma.auditoria.count({ where }),
    ])
    return paginado(data, total, pag)
  })

  // Valores para os filtros da tela: quem já gerou registros e quais entidades/ações existem.
  app.get('/opcoes', { preHandler: [authorize('ADMIN')] }, async () => {
    const [usuarios, entidades, acoes] = await Promise.all([
      prisma.usuario.findMany({
        where: { auditorias: { some: {} } },
        select: { id: true, nome: true, email: true },
        orderBy: { nome: 'asc' },
      }),
      prisma.auditoria.groupBy({ by: ['entidade'], orderBy: { entidade: 'asc' } }),
      prisma.auditoria.groupBy({ by: ['acao'], orderBy: { acao: 'asc' } }),
    ])
    return { usuarios, entidades: entidades.map((e) => e.entidade), acoes: acoes.map((a) => a.acao) }
  })
}
